export interface LiveAiCallCallbacks {
  onStatus: (status: 'connecting' | 'ringing' | 'connected' | 'ended' | 'error', info?: any) => void;
  onTranscript?: (role: 'user' | 'ai' | 'sys', text: string) => void;
  onTool?: (actions: any[]) => void;
  onTransfer?: (target: any) => void;
  onVolume?: (level: number) => void;
}

let activeSingletonClient: LiveAiCallClient | null = null;

export class LiveAiCallClient {
  private ws: WebSocket | null = null;
  private micStream: MediaStream | null = null;
  private capCtx: AudioContext | null = null;
  private playCtx: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private ringIv: any = null;
  private ringCtx: AudioContext | null = null;
  private activeSources: AudioBufferSourceNode[] = [];
  private nextPlayTime = 0;
  private muted = false;
  private closed = false;
  private intentionalEnd = false;
  private wakeLock: any = null;
  private keepAliveTimer: any = null;
  private keepAliveOsc: OscillatorNode | null = null;
  private keepAliveAudio: HTMLAudioElement | null = null;
  private visHandler: (() => void) | null = null;
  private connectTimeout: any = null;
  private cb: LiveAiCallCallbacks;

  constructor(cb: LiveAiCallCallbacks) {
    this.cb = cb;
  }

  private async acquireWakeLock() {
    try {
      const navAny = navigator as any;
      if (navAny?.wakeLock?.request && !this.wakeLock) {
        this.wakeLock = await navAny.wakeLock.request('screen');
        this.wakeLock?.addEventListener?.('release', () => { this.wakeLock = null; });
      }
    } catch (_) {}
  }

  private startKeepAlive() {
    this.acquireWakeLock();
    try {
      const navAny = navigator as any;
      if (navAny?.mediaSession && typeof (window as any).MediaMetadata !== 'undefined') {
        navAny.mediaSession.metadata = new (window as any).MediaMetadata({
          title: 'Live Support Call · Saika',
          artist: 'Secrate Support',
          album: '24/7 Voice Care'
        });
        navAny.mediaSession.playbackState = 'playing';
      }
    } catch (_) {}
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (Ctx && !this.keepAliveAudio) {
        const ctx = this.playCtx || new Ctx();
        if (!this.playCtx) this.playCtx = ctx;
        const dest = ctx.createMediaStreamDestination();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        gain.gain.value = 0.0001;
        osc.connect(gain);
        gain.connect(dest);
        osc.start();
        this.keepAliveOsc = osc;
        const a = document.createElement('audio');
        a.setAttribute('playsinline', '');
        a.muted = false;
        a.volume = 0.01;
        a.srcObject = dest.stream;
        a.play().catch(() => {});
        this.keepAliveAudio = a;
      }
    } catch (_) {}
    this.visHandler = () => {
      if (this.closed) return;
      if (this.capCtx && this.capCtx.state === 'suspended') this.capCtx.resume().catch(() => {});
      if (this.playCtx && this.playCtx.state === 'suspended') this.playCtx.resume().catch(() => {});
      if (document.visibilityState === 'visible') this.acquireWakeLock();
    };
    document.addEventListener('visibilitychange', this.visHandler);
    if (!this.keepAliveTimer) {
      this.keepAliveTimer = setInterval(() => {
        if (this.closed) return;
        if (this.capCtx && this.capCtx.state === 'suspended') this.capCtx.resume().catch(() => {});
        if (this.playCtx && this.playCtx.state === 'suspended') this.playCtx.resume().catch(() => {});
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          try { this.ws.send(JSON.stringify({ type: 'ping' })); } catch (_) {}
        }
      }, 15000);
    }
  }

  private stopKeepAlive() {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
    if (this.visHandler) {
      document.removeEventListener('visibilitychange', this.visHandler);
      this.visHandler = null;
    }
    if (this.keepAliveOsc) {
      try { this.keepAliveOsc.stop(); } catch (_) {}
      this.keepAliveOsc = null;
    }
    if (this.keepAliveAudio) {
      try { this.keepAliveAudio.pause(); this.keepAliveAudio.srcObject = null; } catch (_) {}
      this.keepAliveAudio = null;
    }
    if (this.wakeLock) {
      try { this.wakeLock.release(); } catch (_) {}
      this.wakeLock = null;
    }
    try {
      const navAny = navigator as any;
      if (navAny?.mediaSession) navAny.mediaSession.playbackState = 'none';
    } catch (_) {}
  }

  private startRingback() {
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new Ctx();
      this.ringCtx = ctx;
      const burst = () => {
        if (!this.ringCtx || this.closed) return;
        const now = ctx.currentTime;
        [440, 480].forEach((freq) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.frequency.value = freq;
          gain.gain.setValueAtTime(0.04, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now);
          osc.stop(now + 0.9);
        });
      };
      burst();
      this.ringIv = setInterval(burst, 2400);
    } catch (_) {}
  }

  private stopRingback() {
    if (this.ringIv) {
      clearInterval(this.ringIv);
      this.ringIv = null;
    }
    if (this.ringCtx) {
      try { this.ringCtx.close(); } catch (_) {}
      this.ringCtx = null;
    }
  }

  private stopAllPlayback() {
    for (const s of this.activeSources) {
      try { s.stop(); } catch (_) {}
    }
    this.activeSources = [];
    if (this.playCtx) {
      this.nextPlayTime = this.playCtx.currentTime;
    }
  }

  private releaseCallResources() {
    if (this.connectTimeout) { clearTimeout(this.connectTimeout); this.connectTimeout = null; }
    this.stopRingback();
    this.stopKeepAlive();
    this.stopAllPlayback();
    if (this.processor) { try { this.processor.disconnect(); } catch (_) {} this.processor = null; }
    if (this.capCtx) { try { this.capCtx.close(); } catch (_) {} this.capCtx = null; }
    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => { try { t.stop(); } catch (_) {} });
      this.micStream = null;
    }
    if (this.playCtx) { try { this.playCtx.close(); } catch (_) {} this.playCtx = null; this.outputGain = null; }
    const ws = this.ws;
    this.ws = null;
    if (ws && ws.readyState < WebSocket.CLOSING) { try { ws.close(); } catch (_) {} }
  }

  private outputGain: GainNode | null = null;
  private audioMode: 'speaker' | 'earpiece' = 'speaker';

  async setAudioOutputMode(mode: 'speaker' | 'earpiece') {
    this.audioMode = mode;
    if (this.outputGain && this.playCtx) {
      this.outputGain.gain.setTargetAtTime(mode === 'earpiece' ? 0.32 : 1.0, this.playCtx.currentTime, 0.05);
    }
    try {
      const ctxAny = this.playCtx as any;
      if (ctxAny && typeof ctxAny.setSinkId === 'function' && navigator.mediaDevices?.enumerateDevices) {
        const devs = await navigator.mediaDevices.enumerateDevices();
        const outs = devs.filter((d) => d.kind === 'audiooutput');
        const target = mode === 'earpiece'
          ? outs.find((d) => /earpiece|communications|handset|receiver/i.test(d.label))
          : outs.find((d) => /speaker|default/i.test(d.label));
        if (target?.deviceId) await ctxAny.setSinkId(target.deviceId);
      }
    } catch (_) {}
  }

  private enqueuePcm24k(base64: string) {
    try {
      if (!this.playCtx) {
        const Ctx = window.AudioContext || (window as any).webkitAudioContext;
        this.playCtx = new Ctx({ sampleRate: 24000 });
      }
      if (!this.outputGain) {
        this.outputGain = this.playCtx.createGain();
        this.outputGain.gain.value = this.audioMode === 'earpiece' ? 0.32 : 1.0;
        this.outputGain.connect(this.playCtx.destination);
      }
      if (this.playCtx.state === 'suspended') {
        this.playCtx.resume().catch(() => {});
      }
      const bin = atob(base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const int16 = new Int16Array(bytes.buffer);
      const float32 = new Float32Array(int16.length);
      let peak = 0;
      for (let i = 0; i < int16.length; i++) {
        const v = int16[i] / 32768;
        float32[i] = v;
        if (Math.abs(v) > peak) peak = Math.abs(v);
      }
      this.cb.onVolume?.(peak);

      const buf = this.playCtx.createBuffer(1, float32.length, 24000);
      buf.copyToChannel(float32, 0);
      const src = this.playCtx.createBufferSource();
      src.buffer = buf;
      src.connect(this.outputGain || this.playCtx.destination);
      const now = this.playCtx.currentTime;
      const startAt = Math.max(now + 0.02, this.nextPlayTime);
      src.start(startAt);
      this.nextPlayTime = startAt + buf.duration;
      this.activeSources.push(src);
      src.onended = () => {
        this.activeSources = this.activeSources.filter((x) => x !== src);
      };
    } catch (_) {}
  }

  private downsampleTo16kBase64(input: Float32Array, inRate: number): string {
    const outRate = 16000;
    const ratio = inRate / outRate;
    const outLen = Math.max(1, Math.floor(input.length / ratio));
    const int16 = new Int16Array(outLen);
    for (let i = 0; i < outLen; i++) {
      const start = Math.floor(i * ratio);
      const end = Math.min(input.length, Math.max(start + 1, Math.floor((i + 1) * ratio)));
      let sum = 0;
      for (let j = start; j < end; j++) sum += input[j];
      const s = Math.max(-1, Math.min(1, sum / (end - start)));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    const bytes = new Uint8Array(int16.buffer);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  public unlockAudio() {
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (Ctx && !this.playCtx) {
        this.playCtx = new Ctx({ sampleRate: 24000 });
      }
      if (this.playCtx && this.playCtx.state === 'suspended') {
        this.playCtx.resume().catch(() => {});
      }
      if (this.playCtx && !this.outputGain) {
        this.outputGain = this.playCtx.createGain();
        this.outputGain.gain.value = this.audioMode === 'earpiece' ? 0.32 : 1.0;
        this.outputGain.connect(this.playCtx.destination);
      }
    } catch (_) {}
  }

  async start(params: { mode: string; voiceName?: string; phone?: string; name?: string; orderId?: string; landingSlug?: string; ticket?: string; token?: string }) {
    if (activeSingletonClient && activeSingletonClient !== this) {
      try { activeSingletonClient.hangup(); } catch (_) {}
      activeSingletonClient = null;
    }
    activeSingletonClient = this;

    this.closed = false;
    this.unlockAudio();
    // This is a browser-to-AI session, not a phone call waiting to be answered.
    // Keep the UI in a truthful connecting state until the AI websocket is ready.
    this.cb.onStatus('connecting');

    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: { ideal: true },
          noiseSuppression: { ideal: true },
          autoGainControl: { ideal: true },
          channelCount: 1,
          sampleRate: { ideal: 16000 }
        }
      });
    } catch (e: any) {
      this.closed = true;
      this.releaseCallResources();
      this.cb.onStatus('error', 'মাইক্রোফোন অনুমতি দেওয়া হয়নি (Microphone permission required)');
      return;
    }

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const q = new URLSearchParams();
    q.set('mode', params.mode || 'website_inbound');
    if (params.voiceName) q.set('voiceName', params.voiceName);
    if (params.ticket) q.set('ticket', params.ticket);
    if (params.token) q.set('token', params.token);
    if (params.phone) q.set('phone', params.phone);
    if (params.name) q.set('name', params.name);
    if (params.orderId) q.set('orderId', params.orderId);
    if (params.landingSlug) q.set('landingSlug', params.landingSlug);
    try {
      let devId = localStorage.getItem('dot_ai_device_id');
      if (!devId) {
        devId = 'dev_' + Math.random().toString(36).slice(2, 10) + '_' + Date.now().toString(36);
        localStorage.setItem('dot_ai_device_id', devId);
      }
      q.set('deviceId', devId);
    } catch (_) {}

    try {
      const fpParts: string[] = [
        navigator.platform || '',
        navigator.language || '',
        String(navigator.hardwareConcurrency || ''),
        String((navigator as any).deviceMemory || ''),
        String(navigator.maxTouchPoints || 0),
        `${screen.width}x${screen.height}x${screen.colorDepth}`,
        String(window.devicePixelRatio || 1),
        Intl.DateTimeFormat().resolvedOptions().timeZone || ''
      ];
      try {
        const cvs = document.createElement('canvas');
        cvs.width = 220; cvs.height = 40;
        const ctx = cvs.getContext('2d');
        if (ctx) {
          ctx.textBaseline = 'top';
          ctx.font = '14px Arial';
          ctx.fillStyle = '#f60';
          ctx.fillRect(10, 4, 60, 20);
          ctx.fillStyle = '#069';
          ctx.fillText('SecrateFP#2026', 14, 8);
          fpParts.push(cvs.toDataURL().slice(-64));
        }
      } catch (_) {}
      try {
        const glCvs = document.createElement('canvas');
        const gl = glCvs.getContext('webgl') || (glCvs.getContext('experimental-webgl') as WebGLRenderingContext | null);
        if (gl) {
          const dbg = gl.getExtension('WEBGL_debug_renderer_info');
          if (dbg) {
            fpParts.push(String(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) || ''));
            fpParts.push(String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || ''));
          }
        }
      } catch (_) {}
      const rawFp = fpParts.join('|');
      let h1 = 0x811c9dc5;
      for (let i = 0; i < rawFp.length; i++) {
        h1 ^= rawFp.charCodeAt(i);
        h1 = Math.imul(h1, 0x01000193);
      }
      q.set('fp', 'fp_' + (h1 >>> 0).toString(36) + '_' + rawFp.length.toString(36));
    } catch (_) {}

    let ws: WebSocket;
    try {
      ws = new WebSocket(`${proto}//${window.location.host}/ws/ai-call?${q.toString()}`);
    } catch (_) {
      this.closed = true;
      this.releaseCallResources();
      this.cb.onStatus('error', { error: 'AI সংযোগ শুরু করা যায়নি', fallbackToHuman: true });
      return;
    }
    this.ws = ws;
    this.connectTimeout = setTimeout(() => {
      if (this.closed || ws.readyState === WebSocket.OPEN) return;
      this.closed = true;
      this.releaseCallResources();
      this.cb.onStatus('error', { error: 'AI সংযোগে সময়সীমা পেরিয়েছে', fallbackToHuman: true });
    }, 20000);

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'ready') {
          if (this.connectTimeout) { clearTimeout(this.connectTimeout); this.connectTimeout = null; }
          this.startKeepAlive();
          this.cb.onStatus('connected', msg);
          this.startMicStreaming();
        } else if (msg.type === 'audio' && msg.data) {
          this.enqueuePcm24k(msg.data);
        } else if (msg.type === 'interrupted') {
          this.stopAllPlayback();
        } else if (msg.type === 'transcript' && msg.text) {
          this.cb.onTranscript?.(msg.role === 'user' ? 'user' : 'ai', msg.text);
        } else if (msg.type === 'tool' && msg.actions) {
          this.cb.onTool?.(msg.actions);
        } else if (msg.type === 'transfer') {
          this.intentionalEnd = true;
          this.cb.onTransfer?.(msg.target);
        } else if (msg.type === 'ending_soon') {
          this.intentionalEnd = true;
        } else if (msg.type === 'end_call') {
          this.intentionalEnd = true;
          this.hangup();
        } else if (msg.type === 'followup_requested') {
          this.intentionalEnd = true;
          this.cb.onTranscript?.('sys', `মানব প্রতিনিধির ফলো-আপ অনুরোধ করেছেন ${msg.by || 'একজন কর্মী'}।`);
        } else if (msg.type === 'error') {
          const errText = msg.message || 'Live call error';
          this.closed = true;
          this.releaseCallResources();
          this.cb.onStatus('error', { error: errText, fallbackToHuman: msg.fallbackToHuman !== false });
        }
      } catch (_) {}
    };

    ws.onerror = () => {
      if (!this.closed) {
        this.closed = true;
        this.releaseCallResources();
        this.cb.onStatus('error', { error: 'AI সংযোগ ব্যর্থ হয়েছে', fallbackToHuman: true });
      }
    };

    ws.onclose = () => {
      if (!this.closed) {
        if (this.intentionalEnd) {
          this.hangup();
          return;
        }
        this.closed = true;
        this.releaseCallResources();
        this.cb.onStatus('error', { error: 'AI সংযোগ বিচ্ছিন্ন হয়েছে', fallbackToHuman: true });
      }
    };
  }

  private startMicStreaming() {
    if (!this.micStream || this.closed) return;
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new Ctx();
      this.capCtx = ctx;

      const src = ctx.createMediaStreamSource(this.micStream);

      // Studio-grade noise suppression pipeline:
      // 1. High-pass filter to cut out low-frequency AC hum, fan drone, table rumble (< 85 Hz)
      const hpFilter = ctx.createBiquadFilter();
      hpFilter.type = 'highpass';
      hpFilter.frequency.value = 85;

      // 2. Dynamics Compressor to normalize voice volume and suppress sudden noise spikes
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.setValueAtTime(-42, ctx.currentTime);
      compressor.knee.setValueAtTime(30, ctx.currentTime);
      compressor.ratio.setValueAtTime(10, ctx.currentTime);
      compressor.attack.setValueAtTime(0.003, ctx.currentTime);
      compressor.release.setValueAtTime(0.25, ctx.currentTime);

      const proc = ctx.createScriptProcessor(4096, 1, 1);
      this.processor = proc;

      // Smart Voice Activity Noise Gate: Prevents room ambient hiss / breathing from triggering Gemini
      let speechHangover = 0;
      const NOISE_GATE_THRESHOLD = 0.014;

      proc.onaudioprocess = (e) => {
        if (this.closed || this.muted || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        const ch = e.inputBuffer.getChannelData(0);

        // Detect user's live voice activity
        let peak = 0;
        for (let i = 0; i < ch.length; i++) {
          const v = Math.abs(ch[i]);
          if (v > peak) peak = v;
        }

        this.cb.onVolume?.(peak);

        if (peak >= NOISE_GATE_THRESHOLD) {
          // Voice active: hold gate open for ~600ms (~7 frames) so words aren't truncated
          speechHangover = 7;
        } else if (speechHangover > 0) {
          speechHangover--;
        }

        // Only stream audio when voice is active or within hangover
        if (speechHangover > 0) {
          const b64 = this.downsampleTo16kBase64(ch, ctx.sampleRate);
          this.ws.send(JSON.stringify({ type: 'audio', data: b64 }));
        }
      };

      src.connect(hpFilter);
      hpFilter.connect(compressor);
      compressor.connect(proc);
      proc.connect(ctx.destination);
    } catch (_) {}
  }

  setMuted(m: boolean) {
    this.muted = m;
  }

  sendText(text: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN && text.trim()) {
      this.ws.send(JSON.stringify({ type: 'text', text: text.trim() }));
      this.cb.onTranscript?.('user', text.trim());
    }
  }

  end() {
    this.hangup();
  }

  hangup() {
    if (activeSingletonClient === this) {
      activeSingletonClient = null;
    }
    if (this.closed) return;
    this.closed = true;
    this.releaseCallResources();
    this.cb.onStatus('ended');
  }
}
