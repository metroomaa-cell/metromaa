import React, { useCallback, useEffect, useRef, useState } from 'react';
import './WebCall.css';

type Room = { roomId: string; guestToken: string; mode: 'audio' | 'video'; expiresAt: number };
const adminFetch = (path: string, init: RequestInit = {}) => fetch('/api' + path, { ...init, headers: { 'Content-Type': 'application/json', 'x-admin-token': localStorage.getItem('dot_admin') || '', ...(init.headers || {}) } });
const jsonPost = (data: any) => ({ method: 'POST', body: JSON.stringify(data) });

function BrowserCall({ room, guest = false, onClose, onInvite }: { room: Room; guest?: boolean; onClose?: () => void; onInvite?: (url: string) => void }) {
  const localVideo = useRef<HTMLVideoElement>(null); const remoteVideo = useRef<HTMLVideoElement>(null);
  const pc = useRef<RTCPeerConnection | null>(null); const stream = useRef<MediaStream | null>(null); const cursor = useRef(0); const running = useRef(true);
  const callbacks = useRef({ onClose, onInvite }); callbacks.current = { onClose, onInvite };
  const [status, setStatus] = useState(guest ? 'Ready to join' : 'Starting your call…');
  const [error, setError] = useState(''); const [muted, setMuted] = useState(false); const [cameraOff, setCameraOff] = useState(false);
  const link = `${location.origin}/call-room?room=${encodeURIComponent(room.roomId)}&token=${encodeURIComponent(room.guestToken)}`;
  const signal = useCallback(async (event: any) => {
    const url = guest ? `/call-rooms/${room.roomId}/events?token=${encodeURIComponent(room.guestToken)}` : `/admin/call-rooms/${room.roomId}/events`;
    const r = await (guest ? fetch('/api' + url, jsonPost({ event })) : adminFetch(url, jsonPost({ event })));
    if (!r.ok) throw new Error('Call connection interrupted');
  }, [guest, room]);
  const end = useCallback(async () => {
    running.current = false;
    try { await signal({ type: 'hangup' }); } catch {}
    pc.current?.close(); pc.current = null; stream.current?.getTracks().forEach(t => t.stop()); stream.current = null;
    callbacks.current.onClose?.();
  }, [signal]);
  useEffect(() => {
    running.current = true;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    const start = async () => {
      try {
        const media = await navigator.mediaDevices.getUserMedia({ audio: true, video: room.mode === 'video' });
        if (disposed) { media.getTracks().forEach(t => t.stop()); return; }
        stream.current = media; if (localVideo.current) localVideo.current.srcObject = media;
        const connection = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }); pc.current = connection;
        media.getTracks().forEach(track => connection.addTrack(track, media));
        connection.ontrack = (event) => { if (remoteVideo.current) remoteVideo.current.srcObject = event.streams[0]; setStatus('Connected'); };
        connection.oniceconnectionstatechange = () => {
          if (connection.iceConnectionState === 'connected' || connection.iceConnectionState === 'completed') setStatus('Connected');
          else if (connection.iceConnectionState === 'failed') setStatus('Could not connect. This network may require a TURN relay.');
          else if (connection.iceConnectionState === 'disconnected') setStatus('Connection interrupted…');
        };
        connection.onicecandidate = (event) => { if (event.candidate && running.current) void signal({ type: 'candidate', data: event.candidate.toJSON() }).catch(() => {}); };
        if (!guest) {
          const offer = await connection.createOffer(); await connection.setLocalDescription(offer);
          await signal({ type: 'offer', data: offer }); setStatus('Invite link ready · waiting for customer');
          callbacks.current.onInvite?.(link);
        } else setStatus('Joining call…');
        const poll = async () => {
          if (disposed || !running.current) return;
          try {
            const url = guest ? `/call-rooms/${room.roomId}/events?token=${encodeURIComponent(room.guestToken)}&after=${cursor.current}` : `/admin/call-rooms/${room.roomId}/events?after=${cursor.current}`;
            const response = guest ? await fetch('/api' + url, jsonPost({})) : await adminFetch(url, jsonPost({}));
            const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Call expired');
            for (const event of data.events || []) {
              cursor.current = Math.max(cursor.current, event.seq || 0);
              if (event.type === 'offer' && guest) { await connection.setRemoteDescription(event.data); const answer = await connection.createAnswer(); await connection.setLocalDescription(answer); await signal({ type: 'answer', data: answer }); setStatus('Ringing…'); }
              else if (event.type === 'answer' && !guest && !connection.currentRemoteDescription) await connection.setRemoteDescription(event.data);
              else if (event.type === 'candidate' && event.data) { try { await connection.addIceCandidate(event.data); } catch {} }
              else if (event.type === 'hangup') { setStatus('Call ended'); setTimeout(() => callbacks.current.onClose?.(), 900); running.current = false; }
              else if (event.type === 'ready' && !guest) setStatus('Customer joined · connecting…');
            }
            if (!guest && data.guestActive && connection.connectionState !== 'connected') setStatus('Customer joined · connecting…');
          } catch (e: any) { if (running.current) setError(e?.message || 'Call connection failed'); }
          if (!disposed && running.current) pollTimer = setTimeout(poll, 900);
        };
        if (guest) { await signal({ type: 'ready' }); }
        void poll();
      } catch (e: any) {
        if (!disposed) setError(e?.name === 'NotAllowedError' ? 'Allow microphone and camera access to join this call.' : e?.name === 'NotFoundError' ? 'This device does not have the required microphone or camera.' : e?.message || 'Could not start the call.');
      }
    };
    void start();
    return () => { disposed = true; if (pollTimer) clearTimeout(pollTimer); pc.current?.close(); stream.current?.getTracks().forEach(t => t.stop()); };
  }, [room, guest, signal, link]);
  const copy = async () => { try { await navigator.clipboard.writeText(link); setStatus('Invite link copied'); } catch { setError('Could not copy the invite link.'); } };
  return <div className={`browser-call ${guest ? 'guest' : 'admin'}`}>
    <div className="browser-call-top"><div><span className="browser-call-live" />{guest ? 'Secure customer call' : 'Browser call'}<small>{status}</small></div><button type="button" onClick={() => void end()} aria-label="End call">×</button></div>
    <div className={`browser-call-stage ${room.mode === 'video' ? 'is-video' : ''} ${status === 'Connected' ? 'is-connected' : ''}`}><video ref={remoteVideo} autoPlay playsInline className="browser-call-remote" /><div className="browser-call-placeholder">{status.includes('Connected') ? 'Call connected' : guest ? 'Waiting for the store to connect…' : 'Waiting for customer to join'}<span>{room.mode === 'video' ? 'Camera call' : 'Voice call'}</span></div><video ref={localVideo} autoPlay playsInline muted className={`browser-call-local ${room.mode !== 'video' ? 'audio-only' : ''}`} /></div>
    {error && <p className="browser-call-error">{error}</p>}
    {!guest && <div className="browser-call-invite"><input readOnly value={link} aria-label="Customer call link" /><button type="button" onClick={() => void copy()}>Copy link</button><button type="button" onClick={() => onInvite?.(link)}>Add to WhatsApp reply</button></div>}
    <div className="browser-call-controls"><button type="button" onClick={() => { const track = stream.current?.getAudioTracks()[0]; if (track) { track.enabled = !track.enabled; setMuted(!track.enabled); } }}>{muted ? 'Unmute' : 'Mute'}</button>{room.mode === 'video' && <button type="button" onClick={() => { const track = stream.current?.getVideoTracks()[0]; if (track) { track.enabled = !track.enabled; setCameraOff(!track.enabled); } }}>{cameraOff ? 'Camera on' : 'Camera off'}</button>}<button type="button" className="hangup" onClick={() => void end()}>End call</button></div>
  </div>;
}

export function AdminBrowserCall({ phone, name, mode, onClose, onInvite }: { phone: string; name: string; mode: 'audio'|'video'; onClose: () => void; onInvite: (url: string) => void }) {
  const [room, setRoom] = useState<Room | null>(null); const [error, setError] = useState('');
  useEffect(() => { let live = true; void adminFetch('/admin/call-rooms', jsonPost({ phone, name, mode })).then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Could not create call link'); if (live) setRoom(d); }).catch(e => live && setError(e.message)); return () => { live = false; }; }, [phone, name, mode]);
  return <div className="browser-call-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><div className="browser-call-shell">{room ? <BrowserCall room={room} onClose={onClose} onInvite={onInvite} /> : <div className="browser-call-loading">{error || 'Preparing secure call…'}<button type="button" onClick={onClose}>Close</button></div>}</div></div>;
}

export function PublicBrowserCall() {
  const params = new URLSearchParams(location.search); const roomId = params.get('room') || ''; const token = params.get('token') || '';
  const [room, setRoom] = useState<Room | null>(null); const [error, setError] = useState(''); const [joined, setJoined] = useState(false);
  const join = async () => { try { const r = await fetch(`/api/call-rooms/${encodeURIComponent(roomId)}/join`, jsonPost({ token })); const d = await r.json(); if (!r.ok) throw new Error(d.error || 'This call link is no longer available.'); setRoom({ roomId: d.roomId, guestToken: token, mode: d.mode, expiresAt: d.expiresAt }); setJoined(true); } catch (e: any) { setError(e.message); } };
  return <main className="browser-call-guest-page"><div className="browser-call-brand">Secrate <span>Secure call</span></div>{!roomId || !token ? <section className="browser-call-join"><strong>Invalid call link</strong><p>Please ask the store to send you a new call invite.</p></section> : joined && room ? <section className="browser-call-join live"><BrowserCall room={room} guest onClose={() => { setJoined(false); setRoom(null); }} /></section> : <section className="browser-call-join"><div className="browser-call-join-icon">◉</div><h1>Join your {room?.mode === 'video' ? 'video' : 'voice'} call</h1><p>Allow microphone{room?.mode === 'video' ? ' and camera' : ''} access when your browser asks.</p>{error && <p className="browser-call-error">{error}</p>}<button type="button" onClick={() => void join()}>Join call</button><small>This private link expires after 10 minutes.</small></section>}</main>;
}
