import React, { useState, useEffect, useRef, useCallback } from 'react';
import { LiveAiCallClient } from './liveAiCall';

export interface ProactiveSuggestion {
  id: string;
  category: string;
  urgency: 'critical' | 'high' | 'medium' | 'normal';
  title: string;
  advice: string;
  quickAction?: string;
}

export interface AiBriefing {
  ok: boolean;
  assistantName?: string;
  storeName: string;
  timestamp: string;
  autopilot: {
    enabled: boolean;
    voiceAlertsEnabled: boolean;
    lastRunAt: string | null;
    lastDirectionText: string;
    directivesSentToday: number;
  };
  summary: {
    todayOrdersCount: number;
    todayRevenue: number;
    totalOrdersCount: number;
    pendingCount: number;
    delayedPendingCount: number;
    incompleteCount: number;
    confirmedCount: number;
    shippedCount: number;
    deliveredCount: number;
    returnedCount: number;
    cancelledCount?: number;
    holdCount: number;
  };
  bdMarketInsights?: {
    avgOrderValue: number;
    dhakaPercent: number;
    outsideDhakaPercent: number;
    deliverySuccessRate: number;
    sweetSpotPrice: string;
    topCategoryTrend: string;
    marketSummary: string;
  };
  stock: {
    totalProducts: number;
    outOfStockCount: number;
    lowStockCount: number;
    outOfStock: any[];
    lowStock: any[];
    allStock: any[];
    topSellingProducts: { name: string; qty: number; revenue: number }[];
  };
  staff: {
    totalStaff: number;
    onlineCount: number;
    onlineNames: string[];
    staffAuditVoiceReport?: string;
    staffList: {
      username: string;
      name: string;
      role: string;
      isOnline: boolean;
      todayConfirmed: number;
      todayCancelled?: number;
      todayCalls: number;
      activeMinutesToday: number;
      assignedPending?: number;
      auditScore?: number;
      grade?: string;
      auditVerdict?: string;
      needsWarning?: boolean;
    }[];
  };
  problems: {
    severity: 'critical' | 'high' | 'medium';
    type: string;
    title: string;
    actionText: string;
  }[];
  proactiveSuggestions?: ProactiveSuggestion[];
  productIdeas: {
    title: string;
    category: string;
    buyCost: string;
    sellPrice: string;
    margin: string;
    reason: string;
  }[];
  recentOrders: {
    id: string;
    name: string;
    phone: string;
    total: number;
    status: string;
    product: string;
    createdAt: string;
  }[];
  voiceGreeting: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  time: string;
  actions?: any[];
}

const getAdminToken = () => localStorage.getItem('dot_admin') || '';

async function aiFetch(path: string, opts: any = {}) {
  const res = await fetch('/api' + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'x-admin-token': getAdminToken(),
      ...(opts.headers || {}),
    },
  });
  return res.json();
}

export function CrystalQuantumOrb({
  size = 56,
  isLive = false,
  isSpeaking = false,
}: {
  size?: number;
  isLive?: boolean;
  isSpeaking?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoReady, setVideoReady] = useState(false);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.play().catch(() => {});
    }
  }, []);

  return (
    <div
      className={`crystal-quantum-orb ${isLive ? 'is-live' : ''} ${isSpeaking ? 'is-speaking' : ''}`}
      style={{
        width: size,
        height: size,
        minWidth: size,
      }}
    >
      {/* Speech Soundwave Ripples (when speaking or live call) */}
      {isSpeaking && (
        <div className="crystal-speech-ripples">
          <span className="speech-ripple r1" />
          <span className="speech-ripple r2" />
          <span className="speech-ripple r3" />
        </div>
      )}

      {/* 3D Quantum Aura Glow */}
      <div className={`crystal-aura-glow ${isSpeaking ? 'speaking-glow' : ''}`} />

      {/* Iridescent Spinning Equalizer Halo Ring */}
      {isSpeaking && <div className="crystal-equalizer-ring" />}

      {/* Crystal Sphere Core with Looping 3D MP4 Video + Fallback Image */}
      <div className="crystal-sphere-core">
        <div className="crystal-spin-ball">
          <video
            ref={videoRef}
            src="/saika-crystal-orb.mp4"
            autoPlay
            loop
            muted
            playsInline
            onCanPlay={() => setVideoReady(true)}
            className={`crystal-orb-video ${videoReady ? 'visible' : ''}`}
          />
          <img
            src="/saika-crystal-orb.png"
            alt="Saika 3D Crystal AI"
            className={`crystal-orb-img ${videoReady ? 'has-video' : ''}`}
            draggable={false}
          />
        </div>
        <div className="crystal-3d-glass-lens" />
      </div>

      {/* Equalizer Soundwave Bouncing Bars when Speaking */}
      {isSpeaking && (
        <div className="crystal-voice-bars">
          <span className="vbar b1" />
          <span className="vbar b2" />
          <span className="vbar b3" />
          <span className="vbar b4" />
        </div>
      )}
    </div>
  );
}

export function Perfect3DAppleOrb({
  size = 56,
  isLive = false,
  isSpeaking = false,
}: {
  size?: number;
  isLive?: boolean;
  isSpeaking?: boolean;
}) {
  return <CrystalQuantumOrb size={size} isLive={isLive} isSpeaking={isSpeaking} />;
}

export function AppleIntelligenceOrb({
  size = 32,
  isLive = false,
  isSpeaking = false,
}: {
  size?: number;
  isLive?: boolean;
  isSpeaking?: boolean;
}) {
  return <CrystalQuantumOrb size={size} isLive={isLive} isSpeaking={isSpeaking} />;
}

export function SecrateAiAssistant() {
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);

  useEffect(() => {
    const tok = localStorage.getItem('dot_admin') || '';
    if (!tok) {
      setHasAccess(false);
      return;
    }
    fetch('/api/admin/me', { headers: { 'x-admin-token': tok } })
      .then((r) => r.json())
      .then((u) => {
        if (u?.role === 'owner' || u?.canAccessSaika === true || u?.permissions?.canAccessSaika === true) {
          setHasAccess(true);
        } else {
          setHasAccess(false);
        }
      })
      .catch(() => setHasAccess(false));
  }, []);
  const [open, setOpen] = useState(false);
  const [assistantName, setAssistantName] = useState('Saika Executive AI');
  const [showFloatingOrb, setShowFloatingOrb] = useState<boolean>(() => {
    try { return localStorage.getItem('saika_show_floating') !== 'false'; } catch { return true; }
  });
  const [viewMode, setViewMode] = useState<'mini' | 'popup' | 'drawer'>(() => {
    try { return (localStorage.getItem('saika_view_mode') as any) || 'popup'; } catch { return 'popup'; }
  });
  const changeViewMode = (mode: 'mini' | 'popup' | 'drawer') => {
    setViewMode(mode);
    try { localStorage.setItem('saika_view_mode', mode); } catch {}
  };
  const [activeTab, setActiveTab] = useState<'chat' | 'proactive' | 'staff' | 'ideas' | 'stock'>('chat');
  const [briefing, setBriefing] = useState<AiBriefing | null>(null);
  const [loadingBriefing, setLoadingBriefing] = useState(false);

  // Voice & Neural TTS Settings
  const [selectedVoice, setSelectedVoice] = useState<'bn-BD-NabanitaNeural' | 'bn-IN-TanishaaNeural'>('bn-BD-NabanitaNeural');
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceMuted, setVoiceMuted] = useState(false);
  const [speechLoading, setSpeechLoading] = useState(false);
  const [wakeWordEnabled, setWakeWordEnabled] = useState<boolean>(() => {
    try { return localStorage.getItem('saika_wake_word') === 'true'; } catch { return false; }
  });
  const [wakeActive, setWakeActive] = useState(false);
  const [proactiveVoiceAlert, setProactiveVoiceAlert] = useState<boolean>(() => {
    try { return localStorage.getItem('saika_proactive_voice') !== 'false'; } catch { return true; }
  });
  const [voiceLang, setVoiceLang] = useState<'bn-BD' | 'en-US'>('bn-BD');

  // Chat State
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [asking, setAsking] = useState(false);
  const [customStaffDirective, setCustomStaffDirective] = useState('');
  const [directingStaff, setDirectingStaff] = useState(false);
  const [liveToast, setLiveToast] = useState<string | null>(null);

  const prevOrderCountRef = useRef<number | null>(null);
  const prevProblemCountRef = useRef<number | null>(null);
  const recognitionRef = useRef<any>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const greetedRef = useRef(false);
  const autoSpokenOnOpenRef = useRef(false);
  const manualDisconnectedRef = useRef(false);

  // Play Apple Siri style dual-tone chime
  const playWakeChime = useCallback(() => {
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.frequency.setValueAtTime(587.33, now);
      gain1.gain.setValueAtTime(0.14, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.2);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.frequency.setValueAtTime(880, now + 0.12);
      gain2.gain.setValueAtTime(0.18, now + 0.12);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.12);
      osc2.stop(now + 0.45);
    } catch {}
  }, []);

  // Google Assistant Style Live Bidirectional Streaming Voice Engine (Call Center Tech)
  const liveClientRef = useRef<LiveAiCallClient | null>(null);
  const liveConnectingRef = useRef(false);
  const isLiveConnectedRef = useRef(false);
  const [isLiveConnected, setIsLiveConnected] = useState(false);
  const [liveConnecting, setLiveConnecting] = useState(false);
  const [micVolume, setMicVolume] = useState(0);

  // Dedicated Store Gemini API Key State
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [keyModalInput, setKeyModalInput] = useState('');
  const [keyStatus, setKeyStatus] = useState<{ hasKey: boolean; keyMasked: string; isStoreSpecific: boolean; storeName: string } | null>(null);
  const [keySaving, setKeySaving] = useState(false);
  const [keyMsg, setKeyMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Bengali Best Human Voice (Gemini Live Call Center Tech)
  const [selectedLiveVoice, setSelectedLiveVoice] = useState<'Aoede' | 'Leda' | 'Kore' | 'Zephyr' | 'Puck'>(() => {
    try { return (localStorage.getItem('saika_live_voice') as any) || 'Aoede'; } catch { return 'Aoede'; }
  });
  const [micPermissionGranted, setMicPermissionGranted] = useState(false);
  const [latestLiveRole, setLatestLiveRole] = useState<'user' | 'ai' | null>(null);
  const [latestLiveText, setLatestLiveText] = useState('');

  // Sync with Unified Saika Control Center settings in real time
  useEffect(() => {
    if (!hasAccess) return;
    aiFetch('/admin/saika/control')
      .then((d) => {
        const c = d?.config;
        if (!c) return;
        if (typeof c.showFloatingOrb === 'boolean') {
          setShowFloatingOrb(c.showFloatingOrb);
          try { localStorage.setItem('saika_show_floating', String(c.showFloatingOrb)); } catch {}
        }
        if (typeof c.wakeWordEnabled === 'boolean') setWakeWordEnabled(c.wakeWordEnabled);
        if (typeof c.proactiveVoiceAlert === 'boolean') setProactiveVoiceAlert(c.proactiveVoiceAlert);
        if (c.liveVoiceName) setSelectedLiveVoice(c.liveVoiceName);
        if (c.ttsVoiceName) setSelectedVoice(c.ttsVoiceName);
        if (c.assistantName) setAssistantName(c.assistantName);
      })
      .catch(() => {});

    const onCfgUpdate = (ev: any) => {
      const c = ev?.detail;
      if (!c) return;
      if (typeof c.showFloatingOrb === 'boolean') setShowFloatingOrb(c.showFloatingOrb);
      if (typeof c.wakeWordEnabled === 'boolean') setWakeWordEnabled(c.wakeWordEnabled);
      if (typeof c.proactiveVoiceAlert === 'boolean') setProactiveVoiceAlert(c.proactiveVoiceAlert);
      if (c.liveVoiceName) setSelectedLiveVoice(c.liveVoiceName);
      if (c.ttsVoiceName) setSelectedVoice(c.ttsVoiceName);
      if (c.assistantName) setAssistantName(c.assistantName);
    };
    window.addEventListener('saika-config-updated', onCfgUpdate);
    return () => window.removeEventListener('saika-config-updated', onCfgUpdate);
  }, [hasAccess]);

  const fetchKeyStatus = useCallback(async () => {
    try {
      const res = await aiFetch('/admin/ai-copilot/key');
      if (res && res.ok) {
        setKeyStatus(res);
      }
    } catch {}
  }, []);

  const handleSaveKey = async () => {
    if (!keyModalInput.trim()) return;
    setKeySaving(true);
    setKeyMsg(null);
    try {
      const res = await aiFetch('/admin/ai-copilot/key', {
        method: 'POST',
        body: JSON.stringify({ geminiApiKey: keyModalInput.trim() })
      });
      if (res?.ok) {
        setKeyMsg({ type: 'ok', text: res.message || '✅ API Key সেভ হয়েছে!' });
        setKeyModalInput('');
        fetchKeyStatus();
        setTimeout(() => setShowKeyModal(false), 2000);
      } else {
        setKeyMsg({ type: 'err', text: res?.error || 'API Key সঠিক নয়।' });
      }
    } catch (err: any) {
      setKeyMsg({ type: 'err', text: err?.message || 'সার্ভার এরর।' });
    } finally {
      setKeySaving(false);
    }
  };

  const stopSpeaking = useCallback(() => {
    try {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current.currentTime = 0;
      }
      window.speechSynthesis?.cancel();
    } catch {}
    setIsSpeaking(false);
    setSpeechLoading(false);
  }, []);

  const stopLiveAssistant = useCallback(() => {
    manualDisconnectedRef.current = true;
    liveConnectingRef.current = false;
    isLiveConnectedRef.current = false;
    try {
      liveClientRef.current?.hangup();
      liveClientRef.current = null;
    } catch {}
    setIsLiveConnected(false);
    setLiveConnecting(false);
    setMicVolume(0);
    setLatestLiveRole(null);
    setLatestLiveText('');
  }, []);

  const startLiveAssistant = useCallback(async () => {
    if (liveConnectingRef.current || isLiveConnectedRef.current) {
      return;
    }
    manualDisconnectedRef.current = false;
    liveConnectingRef.current = true;
    isLiveConnectedRef.current = false;
    setLiveConnecting(true);

    try {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current.currentTime = 0;
      }
      window.speechSynthesis?.cancel();
    } catch {}

    try {
      const client = new LiveAiCallClient({
        onStatus: (st) => {
          if (st === 'connected') {
            isLiveConnectedRef.current = true;
            liveConnectingRef.current = false;
            setIsLiveConnected(true);
            setLiveConnecting(false);
            setMicPermissionGranted(true);
          } else if (st === 'error' || st === 'ended') {
            isLiveConnectedRef.current = false;
            liveConnectingRef.current = false;
            setIsLiveConnected(false);
            setLiveConnecting(false);
          }
        },
        onTranscript: (role, text) => {
          if (!text) return;
          setLatestLiveRole(role === 'ai' ? 'ai' : 'user');
          setLatestLiveText(text);
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.role === (role === 'ai' ? 'assistant' : 'user')) {
              return [...prev.slice(0, -1), { ...last, text: last.text + text }];
            }
            return [
              ...prev,
              {
                id: 'live_' + Date.now() + Math.random(),
                role: role === 'ai' ? 'assistant' : 'user',
                text,
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              }
            ];
          });
        },
        onVolume: (lvl) => {
          setMicVolume(lvl);
          if (lvl > 0.022 && isSpeaking) {
            stopSpeaking();
          }
        }
      });
      liveClientRef.current = client;
      await client.start({ mode: 'saika_assistant', voiceName: selectedLiveVoice, token: getAdminToken() });
    } catch {
      isLiveConnectedRef.current = false;
      liveConnectingRef.current = false;
      setIsLiveConnected(false);
      setLiveConnecting(false);
    }
  }, [stopLiveAssistant, selectedLiveVoice, isSpeaking, stopSpeaking]);

  // Auto-connect to Live Voice Assistant when drawer opens; immediately release mic when closed
  useEffect(() => {
    if (open) {
      if (!isLiveConnectedRef.current && !liveConnectingRef.current && !manualDisconnectedRef.current) {
        startLiveAssistant();
      }
    } else {
      if (isLiveConnectedRef.current || liveConnectingRef.current || liveClientRef.current) {
        stopLiveAssistant();
      }
    }
  }, [open, startLiveAssistant, stopLiveAssistant]);

  // Ultra-Realistic Human Neural Female Voice Synthesizer (Fallback only when Live is not active)
  const speakText = useCallback(async (text: string) => {
    if (voiceMuted || isLiveConnected || liveConnecting || typeof window === 'undefined') return;
    const clean = String(text || '')
      .replace(/[*#_`~>•]/g, ' ')
      .replace(/৳\s*(\d+)/g, '$1 টাকা ')
      .replace(/%/g, ' শতাংশ ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!clean) return;

    stopSpeaking();
    setSpeechLoading(true);

    try {
      const resp = await fetch('/api/admin/ai-copilot/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': getAdminToken()
        },
        body: JSON.stringify({ text: clean, voice: selectedVoice })
      });

      if (resp.ok) {
        const blob = await resp.blob();
        if (blob.size > 200) {
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audio.playbackRate = 1.0;
          audioPlayerRef.current = audio;
          audio.onplay = () => {
            setSpeechLoading(false);
            setIsSpeaking(true);
          };
          audio.onended = () => {
            setIsSpeaking(false);
            URL.revokeObjectURL(url);
          };
          audio.onerror = () => {
            setIsSpeaking(false);
            setSpeechLoading(false);
            URL.revokeObjectURL(url);
          };
          await audio.play();
          return;
        }
      }
    } catch {}

    // Fallback to browser SpeechSynthesis if server audio stream is temporarily busy
    try {
      if ('speechSynthesis' in window) {
        setSpeechLoading(false);
        setIsSpeaking(true);
        const utter = new SpeechSynthesisUtterance(clean);
        const voices = window.speechSynthesis.getVoices();
        const banglaVoice = voices.find((v) => v.lang.includes('bn') || v.name.toLowerCase().includes('bangla') || v.name.toLowerCase().includes('bengali'));
        if (banglaVoice) {
          utter.voice = banglaVoice;
          utter.lang = banglaVoice.lang;
        } else {
          utter.lang = 'bn-BD';
        }
        utter.rate = 1.0;
        utter.pitch = 1.06;
        utter.onend = () => setIsSpeaking(false);
        utter.onerror = () => setIsSpeaking(false);
        window.speechSynthesis.speak(utter);
      } else {
        setIsSpeaking(false);
        setSpeechLoading(false);
      }
    } catch {
      setIsSpeaking(false);
      setSpeechLoading(false);
    }
  }, [voiceMuted, selectedVoice, stopSpeaking]);

  // Load 360 Store Briefing & Telemetry
  const fetchBriefing = useCallback(async (isInitial = false) => {
    if (isInitial) setLoadingBriefing(true);
    try {
      const data: AiBriefing = await aiFetch('/admin/ai-copilot/briefing');
      if (data && data.ok) {
        setBriefing(data);

        // Proactive Voice Alert when a new order arrives
        const currentTotal = data.summary.totalOrdersCount;
        if (prevOrderCountRef.current !== null && currentTotal > prevOrderCountRef.current) {
          const newest = data.recentOrders?.[0];
          const alertMsg = newest
            ? `বস, আমি সাইকা। এইমাত্র একটি নতুন অর্ডার এসেছে! কাস্টমার ${newest.name}, মোট মূল্য ${newest.total} টাকা।`
            : `বস, আমি সাইকা বলছি। আপনার স্টোরে নতুন একটি অর্ডার এসেছে!`;
          setLiveToast(`🎉 ${alertMsg}`);
          setTimeout(() => setLiveToast(null), 9500);
          if (proactiveVoiceAlert) {
            speakText(alertMsg);
          }
        }
        prevOrderCountRef.current = currentTotal;

        // Proactive Voice Alert if a critical problem occurs
        const probCount = data.problems.length;
        if (prevProblemCountRef.current !== null && probCount > prevProblemCountRef.current && data.problems[0]) {
          const pMsg = `বস, আমি সাইকা। একটি জরুরি বিষয় লক্ষ্য করেছি: ${data.problems[0].title}`;
          setLiveToast(`⚠️ ${pMsg}`);
          setTimeout(() => setLiveToast(null), 9500);
          if (proactiveVoiceAlert) {
            speakText(pMsg);
          }
        }
        prevProblemCountRef.current = probCount;

        // Populate initial greeting message in chat
        if (!greetedRef.current && data.voiceGreeting) {
          greetedRef.current = true;
          setMessages([
            {
              id: 'welcome_1',
              role: 'assistant',
              text: data.voiceGreeting,
              time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            }
          ]);
        }
      }
    } catch {} finally {
      if (isInitial) setLoadingBriefing(false);
    }
  }, [proactiveVoiceAlert, speakText]);

  useEffect(() => {
    fetchBriefing(true);
    fetchKeyStatus();
    const timer = setInterval(() => fetchBriefing(false), 25000);
    return () => clearInterval(timer);
  }, [fetchBriefing, fetchKeyStatus]);

  // Listen for Top Navbar "Ask Saika" button click
  useEffect(() => {
    const onOpenAi = async () => {
      playWakeChime();
      manualDisconnectedRef.current = false;
      if (viewMode === 'mini') changeViewMode('popup');
      setOpen(true);
      setActiveTab('chat');
      const data: AiBriefing = await aiFetch('/admin/ai-copilot/briefing').catch(() => null);
      if (data && data.ok) {
        setBriefing(data);
      }
    };
    window.addEventListener('open-secrate-ai', onOpenAi);
    return () => window.removeEventListener('open-secrate-ai', onOpenAi);
  }, [playWakeChime]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, asking]);

  // Send question/command to Saika AI
  const sendMessage = useCallback(async (rawText: string) => {
    const text = rawText.trim();
    if (!text || asking) return;

    // When Live Voice is connected, ALWAYS route through Gemini Live for 100% identical sweet call-center voice!
    if (isLiveConnected && liveClientRef.current) {
      liveClientRef.current.sendText(text);
      return;
    }

    setInputText('');
    const userMsg: ChatMessage = {
      id: 'u_' + Date.now(),
      role: 'user',
      text,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setMessages((prev) => [...prev, userMsg]);
    setAsking(true);

    try {
      const res = await aiFetch('/admin/ai-copilot/ask', {
        method: 'POST',
        body: JSON.stringify({
          message: text,
          history: messages.slice(-8).map((m) => ({ role: m.role, text: m.text }))
        })
      });

      if (res && res.ok) {
        const botReply = res.reply || 'বস, আমি তথ্য বিশ্লেষণ করেছি কিন্তু কোনো মন্তব্য নেই।';
        setLatestLiveRole('ai');
        setLatestLiveText(botReply);
        setMessages((prev) => [
          ...prev,
          {
            id: 'a_' + Date.now(),
            role: 'assistant',
            text: botReply,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            actions: res.actions
          }
        ]);
        speakText(botReply);
        fetchBriefing(false);
      } else {
        const errMsg = res?.error || 'সাইকার সার্ভার সংযোগে সামান্য ত্রুটি হয়েছে।';
        setMessages((prev) => [
          ...prev,
          { id: 'e_' + Date.now(), role: 'assistant', text: `⚠️ ${errMsg}`, time: '' }
        ]);
      }
    } catch {
      const errReply = 'বস, ইন্টারনেট বা সার্ভার রেসপন্সে সমস্যা হয়েছে। অনুগ্রহ করে আবার বলুন।';
      setMessages((prev) => [
        ...prev,
        { id: 'e_' + Date.now(), role: 'assistant', text: errReply, time: '' }
      ]);
    } finally {
      setAsking(false);
    }
  }, [asking, messages, speakText, fetchBriefing]);

  // Browser Microphone Speech Recognition
  const toggleListening = () => {
    if (isListening) {
      try { recognitionRef.current?.stop(); } catch {}
      setIsListening(false);
      return;
    }

    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      alert('আপনার ব্রাউজারে ভয়েস রিকগনিশন সাপোর্ট করছে না। অনুগ্রহ করে Google Chrome বা Edge ব্যবহার করুন।');
      return;
    }

    stopSpeaking();
    const rec = new SpeechRec();
    rec.lang = voiceLang;
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    rec.onstart = () => setIsListening(true);
    rec.onresult = (event: any) => {
      const transcript = event?.results?.[0]?.[0]?.transcript || '';
      if (transcript.trim()) {
        setActiveTab('chat');
        sendMessage(transcript.trim());
      }
    };
    rec.onerror = () => setIsListening(false);
    rec.onend = () => setIsListening(false);

    recognitionRef.current = rec;
    try {
      rec.start();
    } catch {
      setIsListening(false);
    }
  };

  // Continuous Hands-Free Sound Auto-Detect Engine ("Hello" / "হ্যালো" / "Hello Saika")
  useEffect(() => {
    if (!wakeWordEnabled || typeof window === 'undefined') {
      return;
    }

    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) return;

    let active = true;
    let rec: any = null;
    let restartTimer: any = null;

    const startWakeListener = () => {
      if (!active || isSpeaking || asking || isListening || isLiveConnected || liveConnecting) return;
      try {
        if (rec) {
          try { rec.abort(); } catch {}
          rec = null;
        }
        rec = new SpeechRec();
        rec.lang = 'bn-BD';
        rec.continuous = true;
        rec.interimResults = true;
        rec.maxAlternatives = 3;

        rec.onresult = (event: any) => {
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = String(event.results[i][0]?.transcript || '').trim();
            const lower = transcript.toLowerCase();

            // Auto-detect "hello", "hi", "hey", "saika", "হ্যালো", "হাই" instantly
            const wakeMatch = /\b(hello|helo|hey|hi|halo|hallow|saika|sayka)\b|হ্যালো|হাই|হেই|সাইকা|শুনছো|শুনছ/i.test(lower);
            if (wakeMatch) {
              playWakeChime();
              setWakeActive(true);
              setTimeout(() => setWakeActive(false), 3000);
              manualDisconnectedRef.current = false;
              setOpen(true);
              setActiveTab('chat');

              // Abort speech recognition so microphone is immediately released for Gemini Live
              try { rec.abort(); } catch {}

              setTimeout(() => {
                startLiveAssistant();
              }, 150);
              break;
            }
          }
        };

        rec.onerror = () => {
          if (active && !isSpeaking && !asking && !isListening && !isLiveConnected && !liveConnecting) {
            clearTimeout(restartTimer);
            restartTimer = setTimeout(startWakeListener, 600);
          }
        };

        rec.onend = () => {
          if (active && !isSpeaking && !asking && !isListening && !isLiveConnected && !liveConnecting) {
            clearTimeout(restartTimer);
            restartTimer = setTimeout(startWakeListener, 300);
          }
        };

        rec.start();
      } catch {
        if (active && !isSpeaking && !asking && !isListening && !isLiveConnected && !liveConnecting) {
          clearTimeout(restartTimer);
          restartTimer = setTimeout(startWakeListener, 1000);
        }
      }
    };

    if (wakeWordEnabled && !isSpeaking && !asking && !isListening && !isLiveConnected && !liveConnecting) {
      startWakeListener();
    }

    return () => {
      active = false;
      clearTimeout(restartTimer);
      try { rec?.abort(); } catch {}
      try { rec?.stop(); } catch {}
    };
  }, [wakeWordEnabled, isSpeaking, asking, isListening, isLiveConnected, liveConnecting, startLiveAssistant, playWakeChime]);

  // Trigger Auto-Staff Direction
  const handleDirectStaff = async (customText = '') => {
    setDirectingStaff(true);
    try {
      const res = await aiFetch('/admin/ai-copilot/direct-staff', {
        method: 'POST',
        body: JSON.stringify({ message: customText })
      });
      if (res?.ok) {
        setCustomStaffDirective('');
        fetchBriefing(false);
        const confirmVoice = 'জি বস! আমি সাইকা আপনার নির্দেশনা সকল স্টাফের ড্যাশবোর্ডে পাঠিয়ে দিয়েছি এবং পেন্ডিং অর্ডারগুলো দ্রুত কনফার্ম করার নির্দেশ দিয়েছি।';
        speakText(confirmVoice);
        setMessages((prev) => [
          ...prev,
          {
            id: 'dir_' + Date.now(),
            role: 'assistant',
            text: `${confirmVoice}\n\n📋 সাইকার পাঠানো ডিরেকশন: "${res.message}"`,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }
        ]);
      }
    } finally {
      setDirectingStaff(false);
    }
  };

  // Toggle Auto-Pilot Guardian
  const handleToggleAutopilot = async (enabled: boolean) => {
    const res = await aiFetch('/admin/ai-copilot/autopilot', {
      method: 'POST',
      body: JSON.stringify({ enabled })
    });
    if (res?.ok && briefing) {
      setBriefing({ ...briefing, autopilot: res.autopilot });
      speakText(enabled ? 'জি বস, অটো-পাইলট স্টাফ গার্ডিয়ান চালু করেছি। আপনার অবর্তমানে আমি সাইকা নিজেই প্রতি ১৫ মিনিটে স্টাফদের তদারকি করব।' : 'অটো-পাইলট গার্ডিয়ান বন্ধ করা হয়েছে বস।');
    }
  };

  // Quick Restock Product
  const handleQuickRestock = async (productId: string, newStock: number, productName: string) => {
    const res = await aiFetch('/admin/ai-copilot/update-stock', {
      method: 'POST',
      body: JSON.stringify({ productId, stock: newStock })
    });
    if (res?.ok) {
      fetchBriefing(false);
      speakText(`বস, আমি ${productName}-এর স্টক আপডেট করে ${newStock}টি করে দিয়েছি।`);
    }
  };

  const s = briefing?.summary;
  const st = briefing?.stock;
  const sf = briefing?.staff;
  const mkt = briefing?.bdMarketInsights;
  const suggestions = briefing?.proactiveSuggestions || [];

  if (hasAccess === false) return null;

  return (
    <>
      {/* Live Proactive Voice Alert Toast */}
      {liveToast && (
        <div
          onClick={() => { setOpen(true); setLiveToast(null); }}
          style={{
            position: 'fixed',
            top: 64,
            right: 24,
            zIndex: 9998,
            background: 'linear-gradient(135deg, #2e1065 0%, #4c1d95 100%)',
            border: '1px solid rgba(216, 180, 254, 0.65)',
            color: '#fff',
            padding: '12px 18px',
            borderRadius: 14,
            boxShadow: '0 16px 40px rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            cursor: 'pointer',
            maxWidth: 400,
            fontSize: 13,
            fontWeight: 600
          }}
        >
          <span style={{ fontSize: 22 }}>👩‍💼</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10.5, color: '#d8b4fe', fontWeight: 800, marginBottom: 2 }}>SAIKA AI EXECUTIVE ALERT</div>
            {liveToast}
          </div>
        </div>
      )}

      {/* =========================================================================
          ALWAYS-ON FLOATING SAIKA CAPSULE (WHEN CLOSED)
          Allows hands-free "Hello Saika" wake-up without clicking
         ========================================================================= */}
      {!open && showFloatingOrb && (
        <div
          onClick={async () => {
            playWakeChime();
            manualDisconnectedRef.current = false;
            if (viewMode === 'mini') changeViewMode('popup');
            setOpen(true);
            setActiveTab('chat');
            if (!micPermissionGranted) {
              try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                stream.getTracks().forEach((t) => t.stop());
                setMicPermissionGranted(true);
              } catch (_) {}
            }
          }}
          title="Saika Live AI - কথা বলতে ক্লিক করুন অথবা 'হ্যালো সাইকা' বলুন"
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 9990,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'transparent',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            userSelect: 'none',
            outline: 'none',
          }}
        >
          <Perfect3DAppleOrb size={58} isLive={wakeActive || isLiveConnected} isSpeaking={isSpeaking || isLiveConnected} />
          {wakeActive && (
            <span
              style={{
                position: 'absolute',
                top: 0,
                right: 0,
                width: 14,
                height: 14,
                borderRadius: '50%',
                background: '#ec4899',
                boxShadow: '0 0 12px #ec4899',
                border: '2.5px solid #0d0b14',
                zIndex: 10,
                animation: 'saikaListeningPulse 1s infinite'
              }}
            />
          )}
        </div>
      )}

      {/* =========================================================================
          SLEEK AMBIENT DYNAMIC VOICE CAPSULE (NO HEAVY BOX)
          Apple Intelligence / Siri Style Minimal Floating Voice & Command Bar
         ========================================================================= */}
      {open && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 9996,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '7px 14px 7px 8px',
            borderRadius: 999,
            background: 'linear-gradient(135deg, rgba(22, 14, 38, 0.96) 0%, rgba(12, 10, 22, 0.98) 100%)',
            backdropFilter: 'blur(20px)',
            border: '1.5px solid rgba(167, 139, 250, 0.45)',
            boxShadow: '0 12px 40px rgba(0, 0, 0, 0.85), 0 0 30px rgba(139, 92, 246, 0.28)',
            maxWidth: 'min(640px, 94vw)',
            animation: 'fadeIn 0.22s cubic-bezier(0.16, 1, 0.3, 1)'
          }}
        >
          {/* Crystal Quantum Orb (Interactive Toggle) */}
          <div
            onClick={() => {
              if (isLiveConnected) {
                stopLiveAssistant();
              } else {
                startLiveAssistant();
              }
            }}
            title={isLiveConnected ? "ভয়েস চালু আছে — থামানোর জন্য ক্লিক করুন" : "লাইভ কথা বলতে ক্লিক করুন"}
            style={{ cursor: 'pointer', flexShrink: 0, position: 'relative' }}
          >
            <Perfect3DAppleOrb size={46} isLive={isLiveConnected || wakeActive} isSpeaking={isSpeaking || isLiveConnected} />
          </div>

          {/* Center Transcription & Status */}
          <div style={{ flex: 1, minWidth: 150, display: 'flex', flexDirection: 'column', gap: 2, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#f3e8ff', letterSpacing: '0.2px' }}>{assistantName}</span>
              <span style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '1px 7px',
                borderRadius: 999,
                background: isLiveConnected ? 'rgba(16, 185, 129, 0.2)' : 'rgba(167, 139, 250, 0.2)',
                color: isLiveConnected ? '#34d399' : '#c4b5fd',
                border: `1px solid ${isLiveConnected ? 'rgba(16, 185, 129, 0.4)' : 'rgba(167, 139, 250, 0.3)'}`,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: isLiveConnected ? '#10b981' : '#a78bfa', boxShadow: isLiveConnected ? '0 0 6px #10b981' : 'none' }} />
                {isLiveConnected ? 'লাইভ ভয়েস' : 'রেডি'}
              </span>
            </div>

            <div style={{
              fontSize: 12,
              color: latestLiveRole === 'user' ? '#c4b5fd' : '#e2e8f0',
              fontWeight: 500,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: 300
            }}>
              {latestLiveText ? (
                <span>{latestLiveRole === 'user' ? '🗣️ বস: ' : '🤖 সাইকা: '}{latestLiveText}</span>
              ) : isLiveConnected ? (
                <span style={{ color: '#34d399' }}>🎙️ সাইকা শুনছি বস... মুখে নির্দেশ দিন</span>
              ) : (
                <span style={{ color: '#94a3b8' }}>যেকোনো নির্দেশ বলুন বা লিখুন</span>
              )}
            </div>
          </div>

          {/* Quick Input Form for silent typing / feature requests */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (inputText.trim()) {
                sendMessage(inputText.trim());
                setInputText('');
              }
            }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}
          >
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="নির্দেশ দিন বা ফিচার লিখুন..."
              disabled={asking}
              style={{
                width: 175,
                height: 32,
                padding: '0 10px',
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(167, 139, 250, 0.25)',
                borderRadius: 8,
                color: '#f8fafc',
                fontSize: 12,
                outline: 'none'
              }}
            />
            <button
              type="submit"
              disabled={asking || !inputText.trim()}
              style={{
                height: 32,
                padding: '0 11px',
                borderRadius: 8,
                background: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)',
                border: 'none',
                color: '#fff',
                fontSize: 11.5,
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              {asking ? '...' : 'পাঠান'}
            </button>
          </form>

          {/* Open Full Saika AI Control Center Button */}
          <button
            type="button"
            onClick={() => {
              window.dispatchEvent(new CustomEvent('admin-navigate-saika'));
            }}
            title="Saika AI Full Control Center খুলুন"
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: 'rgba(139, 92, 246, 0.16)',
              border: '1px solid rgba(167, 139, 250, 0.32)',
              color: '#ddd6fe',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 13
            }}
          >
            ⚙️
          </button>

          {/* Voice Mute Toggle */}
          <button
            type="button"
            onClick={() => setVoiceMuted((m) => !m)}
            title={voiceMuted ? "ভয়েস আনমিউট করুন" : "ভয়েস মিউট করুন"}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#f8fafc',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 13
            }}
          >
            {voiceMuted ? '🔇' : '🔊'}
          </button>

          {/* Close Button */}
          <button
            type="button"
            onClick={() => {
              stopLiveAssistant();
              stopSpeaking();
              setOpen(false);
            }}
            title="বন্ধ করুন"
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#f87171',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 14,
              fontWeight: 700
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Dedicated Store Gemini API Key Modal */}
      {showKeyModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.75)',
          backdropFilter: 'blur(6px)',
          zIndex: 999999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 20
        }}>
          <div style={{
            width: '100%',
            maxWidth: 480,
            background: '#131127',
            border: '1px solid rgba(192,132,252,0.4)',
            borderRadius: 16,
            padding: 24,
            boxShadow: '0 20px 50px rgba(0,0,0,0.8)',
            color: '#fff'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 22 }}>🔑</span>
                <strong style={{ fontSize: 16, color: '#f3e8ff' }}>এই ওয়েবসাইটের নিজস্ব Gemini API Key</strong>
              </div>
              <button
                type="button"
                onClick={() => setShowKeyModal(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 18, cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div style={{ fontSize: 12.5, color: '#cbd5e1', lineHeight: 1.6, marginBottom: 16 }}>
              মনে রাখবেন, প্রতিটি ওয়েবসাইটের API Key সম্পূর্ণ আলাদা ও স্বাধীন। এখানে আপনার এই ওয়েবসাইটের ({keyStatus?.storeName || 'Store'}) নিজস্ব Google Gemini API Key সেট করুন।
            </div>

            <div style={{
              background: 'rgba(255,255,255,0.04)',
              padding: '10px 14px',
              borderRadius: 10,
              marginBottom: 16,
              fontSize: 12,
              border: '1px solid rgba(255,255,255,0.08)'
            }}>
              <div style={{ color: '#94a3b8' }}>বর্তমান স্ট্যাটাস:</div>
              <div style={{ fontWeight: 700, color: keyStatus?.hasKey ? '#34d399' : '#f87171', marginTop: 2 }}>
                {keyStatus?.hasKey
                  ? `✅ সক্রিয় (${keyStatus.keyMasked}) — এই স্টোরে সংরক্ষিত`
                  : '⚠️ কোনো API Key সেট করা নেই'}
              </div>
            </div>

            <label style={{ fontSize: 12, fontWeight: 600, color: '#d8b4fe', display: 'block', marginBottom: 6 }}>
              নতুন Gemini API Key পেস্ট করুন:
            </label>
            <input
              type="text"
              autoComplete="off"
              spellCheck={false}
              data-lpignore="true"
              value={keyModalInput}
              onChange={(e) => setKeyModalInput(e.target.value)}
              placeholder="AIzaSy... কি এখানে পেস্ট করুন"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                height: 42,
                borderRadius: 8,
                background: '#0a0815',
                border: '1px solid rgba(192,132,252,0.4)',
                padding: '0 12px',
                color: '#fff',
                fontSize: 13,
                outline: 'none',
                marginBottom: 12,
                ...(keyModalInput ? ({ WebkitTextSecurity: 'disc' } as any) : {})
              }}
            />

            {keyMsg && (
              <div style={{
                padding: '8px 12px',
                borderRadius: 8,
                marginBottom: 12,
                fontSize: 12,
                background: keyMsg.type === 'ok' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                color: keyMsg.type === 'ok' ? '#6ee7b7' : '#fca5a5',
                border: keyMsg.type === 'ok' ? '1px solid rgba(16,185,129,0.3)' : '1px solid rgba(239,68,68,0.3)'
              }}>
                {keyMsg.text}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                onClick={() => setShowKeyModal(false)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  color: '#cbd5e1',
                  fontSize: 12,
                  cursor: 'pointer'
                }}
              >
                বাতিল
              </button>
              <button
                type="button"
                onClick={handleSaveKey}
                disabled={keySaving || !keyModalInput.trim()}
                style={{
                  padding: '8px 18px',
                  borderRadius: 8,
                  background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
                  border: 'none',
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: keySaving || !keyModalInput.trim() ? 'not-allowed' : 'pointer',
                  opacity: keySaving || !keyModalInput.trim() ? 0.6 : 1
                }}
              >
                {keySaving ? 'ভেরিফাই ও সেভ হচ্ছে...' : '💾 সেভ ও সক্রিয় করুন'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
