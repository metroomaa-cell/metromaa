import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Perfect3DAppleOrb, type AiBriefing } from './SecrateAiAssistant';

export type SaikaSection = 'overview' | 'api' | 'voice' | 'channels' | 'knowledge' | 'access';

interface SaikaMemoryItem {
  id: string;
  title: string;
  content: string;
  createdAt?: string;
}

interface SaikaControlConfig {
  assistantName: string;
  preferredModel: string;
  liveVoiceModel: string;
  liveVoiceName: 'Aoede' | 'Leda' | 'Kore' | 'Zephyr' | 'Puck';
  ttsVoiceName: 'bn-BD-NabanitaNeural' | 'bn-IN-TanishaaNeural';
  showFloatingOrb: boolean;
  wakeWordEnabled: boolean;
  proactiveVoiceAlert: boolean;
  adminAssistantEnabled: boolean;
  allowOrderActions: boolean;
  allowStockActions: boolean;
  allowStaffActions: boolean;
  allowWhatsappDispatch: boolean;
  allowEmailDispatch: boolean;
  autopilotEnabled: boolean;
  autopilotIntervalMins: number;
  delayedPendingMins: number;
  bossCustomInstructions: string;
  businessStrategyNotes: string;
  memories: SaikaMemoryItem[];
  keysCount: number;
  maskedKeys: { index: number; masked: string; isPrimary: boolean }[];
  hasApiKey: boolean;
}

interface StaffMember {
  id: string;
  username: string;
  name: string;
  role: string;
  canAccessSaika: boolean;
}

const getTok = () => localStorage.getItem('dot_admin') || '';

async function saikaFetch(path: string, opts: RequestInit = {}) {
  const res = await fetch('/api' + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'x-admin-token': getTok(),
      ...(opts.headers || {}),
    },
  });
  return res.json();
}

function PillSwitch({
  checked,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      style={{
        position: 'relative',
        width: 44,
        height: 24,
        minWidth: 44,
        borderRadius: 999,
        padding: 2,
        cursor: disabled ? 'not-allowed' : 'pointer',
        border: checked ? '1px solid rgba(167, 139, 250, 0.7)' : '1px solid rgba(255, 255, 255, 0.16)',
        background: checked ? 'linear-gradient(135deg, #7c3aed 0%, #9333ea 100%)' : 'rgba(255, 255, 255, 0.08)',
        boxShadow: checked ? '0 0 14px rgba(139, 92, 246, 0.45)' : 'inset 0 1px 3px rgba(0,0,0,0.4)',
        transition: 'all 0.2s ease',
        display: 'inline-flex',
        alignItems: 'center',
        opacity: disabled ? 0.5 : 1,
        flexShrink: 0,
      }}
    >
      <span
        style={{
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: '#ffffff',
          boxShadow: '0 2px 5px rgba(0,0,0,0.35)',
          transform: checked ? 'translateX(20px)' : 'translateX(0px)',
          transition: 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      />
    </button>
  );
}

const SECTION_TABS: { id: SaikaSection; icon: string; label: string; subLabel: string }[] = [
  { id: 'overview', icon: '✨', label: 'Command Center', subLabel: 'Command Center' },
  { id: 'api', icon: '🔑', label: 'API & Model Setup', subLabel: 'API & Model Setup' },
  { id: 'voice', icon: '🎙️', label: 'Voice & Widget Studio', subLabel: 'Voice & Widget Studio' },
  { id: 'channels', icon: '⚡', label: 'Capabilities & Autopilot', subLabel: 'Capabilities & Autopilot' },
  { id: 'knowledge', icon: '🧠', label: 'Boss Knowledge & Rules', subLabel: 'Knowledge & Training' },
  { id: 'access', icon: '🛡️', label: 'Staff Access & Logs', subLabel: 'Staff Access & Logs' },
];

const DEFAULT_CONFIG: SaikaControlConfig = {
  assistantName: 'Saika (সাইকা)',
  preferredModel: 'gemini-3.8-flash',
  liveVoiceModel: 'gemini-3.8-live',
  liveVoiceName: 'Aoede',
  ttsVoiceName: 'bn-BD-NabanitaNeural',
  showFloatingOrb: true,
  wakeWordEnabled: false,
  proactiveVoiceAlert: true,
  adminAssistantEnabled: true,
  allowOrderActions: true,
  allowStockActions: true,
  allowStaffActions: true,
  allowWhatsappDispatch: true,
  allowEmailDispatch: true,
  autopilotEnabled: false,
  autopilotIntervalMins: 15,
  delayedPendingMins: 25,
  bossCustomInstructions: '',
  businessStrategyNotes: '',
  memories: [],
  keysCount: 0,
  maskedKeys: [],
  hasApiKey: false,
};

export function SaikaAiAdmin({
  activeSection,
  onSectionChange,
  userRole = 'owner',
}: {
  activeSection: SaikaSection;
  onSectionChange: (sec: SaikaSection, label?: string) => void;
  userRole?: string;
}) {
  const [config, setConfig] = useState<SaikaControlConfig>(DEFAULT_CONFIG);
  const [briefing, setBriefing] = useState<AiBriefing | null>(null);
  const [users, setUsers] = useState<StaffMember[]>([]);
  const [voiceSessions, setVoiceSessions] = useState<any[]>([]);
  const [directiveLogs, setDirectiveLogs] = useState<any[]>([]);
  const [storeSummary, setStoreSummary] = useState<{ productsCount: number; landingsCount: number }>({
    productsCount: 0,
    landingsCount: 0,
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Command Center Chat State
  const [chatMessages, setChatMessages] = useState<
    { id: string; role: 'user' | 'assistant'; text: string; time: string; actions?: any[] }[]
  >([]);
  const [chatInput, setChatInput] = useState('');
  const [askingChat, setAskingChat] = useState(false);
  const [listeningMic, setListeningMic] = useState(false);
  const [speakingSample, setSpeakingSample] = useState(false);
  const [directiveInput, setDirectiveInput] = useState('');
  const [sendingDirective, setSendingDirective] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recRef = useRef<any>(null);

  // API Key Setup State
  const [newApiKey, setNewApiKey] = useState('');
  const [showKeyPlain, setShowKeyPlain] = useState(false);
  const [makePrimaryKey, setMakePrimaryKey] = useState(true);
  const [keyBusy, setKeyBusy] = useState(false);
  const [testingKey, setTestingKey] = useState(false);

  // Voice Test Text
  const [voiceSampleText, setVoiceSampleText] = useState(
    'আসসালামু আলাইকুম বস! আমি সাইকা বলছি। আপনার অ্যাডমিন প্যানেলের অর্ডার, স্টক ও বিজনেস অপারেশন আমি পর্যবেক্ষণ করছি।'
  );

  // Executive Memory Form State
  const [memTitle, setMemTitle] = useState('');
  const [memContent, setMemContent] = useState('');
  const [addingMem, setAddingMem] = useState(false);

  const showNotice = useCallback((text: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 5000);
  }, []);

  const broadcastConfigToWidget = useCallback((nextCfg: SaikaControlConfig) => {
    try {
      localStorage.setItem('saika_show_floating', String(nextCfg.showFloatingOrb));
      localStorage.setItem('saika_wake_word', String(nextCfg.wakeWordEnabled));
      localStorage.setItem('saika_proactive_voice', String(nextCfg.proactiveVoiceAlert));
      localStorage.setItem('saika_live_voice', nextCfg.liveVoiceName);
      localStorage.setItem('saika_tts_voice', nextCfg.ttsVoiceName);
      window.dispatchEvent(new CustomEvent('saika-config-updated', { detail: nextCfg }));
    } catch {}
  }, []);

  const loadAll = useCallback(
    async (initial = false) => {
      if (initial) setLoading(true);
      try {
        const [ctrlRes, briefRes] = await Promise.all([
          saikaFetch('/admin/saika/control'),
          saikaFetch('/admin/ai-copilot/briefing'),
        ]);
        if (ctrlRes?.ok) {
          const mergedCfg: SaikaControlConfig = {
            ...DEFAULT_CONFIG,
            ...(ctrlRes.config || {}),
            memories: Array.isArray(ctrlRes.config?.memories) ? ctrlRes.config.memories : [],
          };
          setConfig(mergedCfg);
          setUsers(Array.isArray(ctrlRes.users) ? ctrlRes.users : []);
          setVoiceSessions(Array.isArray(ctrlRes.logs?.sessions) ? ctrlRes.logs.sessions : []);
          setDirectiveLogs(Array.isArray(ctrlRes.logs?.directives) ? ctrlRes.logs.directives : []);
          if (ctrlRes.storeSummary) setStoreSummary(ctrlRes.storeSummary);
        }
        if (briefRes?.ok) {
          setBriefing(briefRes);
          setChatMessages((prev) =>
            prev.length === 0 && briefRes.voiceGreeting
              ? [
                  {
                    id: 'init_greeting',
                    role: 'assistant',
                    text: briefRes.voiceGreeting,
                    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                  },
                ]
              : prev
          );
        }
      } catch {
        showNotice('ডাটা লোড করতে সমস্যা হয়েছে।', 'err');
      } finally {
        if (initial) setLoading(false);
      }
    },
    [showNotice]
  );

  useEffect(() => {
    loadAll(true);
  }, [loadAll]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, askingChat]);

  const saveConfigPatch = async (patch: Partial<SaikaControlConfig>, silentMsg?: string) => {
    const optimistic: SaikaControlConfig = {
      ...config,
      ...patch,
    };
    setConfig(optimistic);
    broadcastConfigToWidget(optimistic);
    setSaving(true);
    try {
      const res = await saikaFetch('/admin/saika/control', {
        method: 'PUT',
        body: JSON.stringify(optimistic),
      });
      if (res?.ok && res.config) {
        const synced: SaikaControlConfig = {
          ...DEFAULT_CONFIG,
          ...res.config,
          memories: Array.isArray(res.config.memories) ? res.config.memories : [],
        };
        setConfig(synced);
        broadcastConfigToWidget(synced);
        showNotice(silentMsg || '✅ অ্যাডমিন প্যানেলের Saika AI সেটিংস সংরক্ষিত হয়েছে!');
      } else {
        showNotice(res?.error || 'সেভ করতে সমস্যা হয়েছে।', 'err');
      }
    } catch {
      showNotice('সার্ভার সংযোগে ত্রুটি হয়েছে।', 'err');
    } finally {
      setSaving(false);
    }
  };

  const playVoiceSample = async (textToSpeak: string, voiceOverride?: string) => {
    try {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    } catch {}
    setSpeakingSample(true);
    try {
      const resp = await fetch('/api/admin/ai-copilot/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': getTok(),
        },
        body: JSON.stringify({
          text: textToSpeak,
          voice: voiceOverride || config.ttsVoiceName,
        }),
      });
      if (resp.ok) {
        const blob = await resp.blob();
        if (blob.size > 200) {
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audioRef.current = audio;
          audio.onended = () => {
            setSpeakingSample(false);
            URL.revokeObjectURL(url);
          };
          audio.onerror = () => {
            setSpeakingSample(false);
            URL.revokeObjectURL(url);
          };
          await audio.play();
          return;
        }
      }
      showNotice('ভয়েস অডিও প্লে করা যায়নি।', 'err');
      setSpeakingSample(false);
    } catch {
      setSpeakingSample(false);
    }
  };

  const sendExecutiveCommand = async (rawText: string) => {
    const text = rawText.trim();
    if (!text || askingChat) return;
    setChatInput('');
    const userTurn = {
      id: 'u_' + Date.now(),
      role: 'user' as const,
      text,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setChatMessages((prev) => [...prev, userTurn]);
    setAskingChat(true);
    try {
      const res = await saikaFetch('/admin/ai-copilot/ask', {
        method: 'POST',
        body: JSON.stringify({
          message: text,
          history: chatMessages.slice(-8).map((m) => ({ role: m.role, text: m.text })),
        }),
      });
      if (res?.ok) {
        const reply = res.reply || 'বস, আপনার নির্দেশনা সম্পন্ন হয়েছে।';
        setChatMessages((prev) => [
          ...prev,
          {
            id: 'a_' + Date.now(),
            role: 'assistant',
            text: reply,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            actions: res.executedActions || res.actions,
          },
        ]);
        if (res.briefing) setBriefing(res.briefing);
      } else {
        setChatMessages((prev) => [
          ...prev,
          {
            id: 'e_' + Date.now(),
            role: 'assistant',
            text: `⚠️ ${res?.error || 'সাইকার উত্তর পেতে সমস্যা হয়েছে।'}`,
            time: '',
          },
        ]);
      }
    } catch {
      setChatMessages((prev) => [
        ...prev,
        {
          id: 'e_' + Date.now(),
          role: 'assistant',
          text: '⚠️ সার্ভার সংযোগে ত্রুটি হয়েছে।',
          time: '',
        },
      ]);
    } finally {
      setAskingChat(false);
    }
  };

  const toggleConsoleMic = () => {
    if (listeningMic) {
      try {
        recRef.current?.stop();
      } catch {}
      setListeningMic(false);
      return;
    }
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      showNotice('ভয়েস টাইপিংয়ের জন্য Google Chrome বা Edge ব্রাউজার ব্যবহার করুন।', 'err');
      return;
    }
    const rec = new SpeechRec();
    rec.lang = 'bn-BD';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onstart = () => setListeningMic(true);
    rec.onresult = (ev: any) => {
      const t = ev?.results?.[0]?.[0]?.transcript || '';
      if (t.trim()) sendExecutiveCommand(t.trim());
    };
    rec.onerror = () => setListeningMic(false);
    rec.onend = () => setListeningMic(false);
    recRef.current = rec;
    try {
      rec.start();
    } catch {
      setListeningMic(false);
    }
  };

  const handleSendDirective = async (customMsg = '') => {
    setSendingDirective(true);
    try {
      const res = await saikaFetch('/admin/ai-copilot/direct-staff', {
        method: 'POST',
        body: JSON.stringify({ message: customMsg }),
      });
      if (res?.ok) {
        setDirectiveInput('');
        showNotice('✅ সকল স্টাফের ড্যাশবোর্ডে সাইকার নির্দেশনা পাঠানো হয়েছে!');
        loadAll(false);
      } else {
        showNotice(res?.error || 'নির্দেশনা পাঠানো যায়নি।', 'err');
      }
    } finally {
      setSendingDirective(false);
    }
  };

  const handleQuickRestock = async (productId: string, newStock: number, name: string) => {
    const res = await saikaFetch('/admin/ai-copilot/update-stock', {
      method: 'POST',
      body: JSON.stringify({ productId, stock: newStock }),
    });
    if (res?.ok) {
      showNotice(`✅ "${name}"-এর স্টক ${newStock}টি করা হয়েছে!`);
      loadAll(false);
    }
  };

  const handleAddApiKey = async () => {
    if (!newApiKey.trim()) return;
    setKeyBusy(true);
    try {
      const res = await saikaFetch('/admin/saika/keys', {
        method: 'POST',
        body: JSON.stringify({
          action: 'add',
          geminiApiKey: newApiKey.trim(),
          makePrimary: makePrimaryKey,
        }),
      });
      if (res?.ok) {
        setNewApiKey('');
        if (res.config) setConfig((prev) => ({ ...prev, ...res.config }));
        showNotice(res.message || '✅ অ্যাডমিন প্যানেলের Saika AI Key ভেরিফাইড ও সেভ হয়েছে!');
      } else {
        showNotice(res?.error || 'API Key সঠিক নয় বা কোটা শেষ।', 'err');
      }
    } finally {
      setKeyBusy(false);
    }
  };

  const handleManageKey = async (action: 'promote' | 'remove', index: number) => {
    setKeyBusy(true);
    try {
      const res = await saikaFetch('/admin/saika/keys', {
        method: 'POST',
        body: JSON.stringify({ action, index }),
      });
      if (res?.ok && res.config) {
        setConfig((prev) => ({ ...prev, ...res.config }));
        showNotice(
          action === 'promote' ? '⭐ প্রাইমারি API Key আপডেট হয়েছে!' : '🗑️ API Key মুছে ফেলা হয়েছে।'
        );
      }
    } finally {
      setKeyBusy(false);
    }
  };

  const handleTestActiveKey = async () => {
    setTestingKey(true);
    try {
      const res = await saikaFetch('/admin/saika/keys', {
        method: 'POST',
        body: JSON.stringify({ action: 'test' }),
      });
      if (res?.ok) {
        showNotice(res.message || `✅ প্রাইমারি Saika AI Key সচল আছে (${res.model})!`);
      } else {
        showNotice(res?.error || 'API Key টেস্ট ব্যর্থ হয়েছে।', 'err');
      }
    } finally {
      setTestingKey(false);
    }
  };

  const handleAddMemory = async () => {
    if (!memTitle.trim() || !memContent.trim()) return;
    setAddingMem(true);
    try {
      const res = await saikaFetch('/admin/saika/memories', {
        method: 'POST',
        body: JSON.stringify({ action: 'add', title: memTitle.trim(), content: memContent.trim() }),
      });
      if (res?.ok && Array.isArray(res.memories)) {
        setMemTitle('');
        setMemContent('');
        setConfig((prev) => ({ ...prev, memories: res.memories }));
        showNotice('✅ নতুন বিজনেস রুল/মেমোরি সাইকার মেমোরিতে যুক্ত হয়েছে!');
      }
    } finally {
      setAddingMem(false);
    }
  };

  const handleDeleteMemory = async (id: string) => {
    const res = await saikaFetch('/admin/saika/memories', {
      method: 'POST',
      body: JSON.stringify({ action: 'remove', id }),
    });
    if (res?.ok && Array.isArray(res.memories)) {
      setConfig((prev) => ({ ...prev, memories: res.memories }));
      showNotice('🗑️ মেমোরি মুছে ফেলা হয়েছে।');
    }
  };

  const handleToggleStaffAccess = async (u: StaffMember) => {
    if (u.role === 'owner') return;
    const nextVal = !u.canAccessSaika;
    setUsers((prev) => prev.map((item) => (item.id === u.id ? { ...item, canAccessSaika: nextVal } : item)));
    const res = await saikaFetch('/admin/saika/staff-access', {
      method: 'POST',
      body: JSON.stringify({ userId: u.id, canAccessSaika: nextVal }),
    });
    if (res?.ok) {
      showNotice(`✅ ${u.name}-এর Saika AI অ্যাক্সেস ${nextVal ? 'চালু' : 'বন্ধ'} করা হয়েছে!`);
    } else {
      setUsers((prev) => prev.map((item) => (item.id === u.id ? { ...item, canAccessSaika: !nextVal } : item)));
      showNotice(res?.error || 'পারমিশন পরিবর্তন করা যায়নি।', 'err');
    }
  };

  const sum = briefing?.summary;
  const stk = briefing?.stock;
  const stf = briefing?.staff;

  return (
    <div className="finance-workspace cc-page" style={{ paddingBottom: 40 }}>
      {/* Top Executive Header */}
      <div className="sa-top fin-header" style={{ marginBottom: 16 }}>
        <div>
          <div className="fin-eyebrow">ADMIN PANEL DEDICATED AI · 100% ISOLATED FROM CALL CENTER AI</div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span>Saika AI Control Center</span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                padding: '3px 10px',
                borderRadius: 999,
                background: config.hasApiKey ? 'rgba(16, 185, 129, 0.14)' : 'rgba(245, 158, 11, 0.14)',
                border: config.hasApiKey
                  ? '1px solid rgba(52, 211, 153, 0.35)'
                  : '1px solid rgba(251, 191, 36, 0.35)',
                color: config.hasApiKey ? '#34d399' : '#fbbf24',
              }}
            >
              {config.hasApiKey ? `● Dedicated API Active (${config.keysCount} Key)` : '● Built-in Bangla Brain'}
            </span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                padding: '3px 10px',
                borderRadius: 999,
                background: 'rgba(139, 92, 246, 0.15)',
                border: '1px solid rgba(167, 139, 250, 0.35)',
                color: '#c4b5fd',
              }}
            >
              🔒 Only Admin Panel Boss AI (Call Center AI থেকে সম্পূর্ণ আলাদা)
            </span>
          </h1>
          <p>
            এটি শুধুমাত্র আপনার অ্যাডমিন প্যানেলের পার্সোনাল এক্সিকিউটিভ সহকারী (Saika AI)-এর নিজস্ব কন্ট্রোল প্যানেল। এর API Key, ভয়েস, মেমোরি ও লগ কাস্টমার Call Center AI থেকে ১০০% আলাদা।
          </p>
        </div>

        <div className="sa-toprow">
          <button
            type="button"
            className="sa-btn ghost"
            onClick={() => playVoiceSample(voiceSampleText)}
            disabled={speakingSample}
          >
            {speakingSample ? '🔊 সাইকা কথা বলছে...' : '🔊 ভয়েস টেস্ট'}
          </button>
          <button
            type="button"
            className="sa-btn ghost"
            onClick={() => window.dispatchEvent(new CustomEvent('open-secrate-ai'))}
          >
            🎙️ বসের লাইভ ভয়েস
          </button>
          <button
            type="button"
            className="sa-btn"
            onClick={() => saveConfigPatch(config)}
            disabled={saving}
          >
            {saving ? 'সেভ হচ্ছে...' : '💾 সব সেটিংস সেভ করুন'}
          </button>
        </div>
      </div>

      {/* Hero Status Banner */}
      <div className="cc-hero-banner" style={{ marginBottom: 18 }}>
        <div style={{ flexShrink: 0 }}>
          <Perfect3DAppleOrb size={50} isLive={config.hasApiKey} isSpeaking={speakingSample} />
        </div>
        <div className="cc-hero-copy" style={{ flex: 1 }}>
          <strong style={{ fontSize: 15 }}>
            {config.assistantName} — অ্যাডমিন প্যানেল এক্সিকিউটিভ চিফ অব স্টাফ
          </strong>
          <span>
            মডেল: <b style={{ color: '#ddd6fe' }}>{config.preferredModel}</b> · বসের লাইভ ভয়েস:{' '}
            <b style={{ color: '#ddd6fe' }}>{config.liveVoiceName}</b> · ফ্লোটিং বার:{' '}
            <b style={{ color: config.showFloatingOrb ? '#6ee7b7' : '#fca5a5' }}>
              {config.showFloatingOrb ? 'চালু আছে' : 'লুকানো আছে'}
            </b>{' '}
            · স্টাফ অটো-গার্ডিয়ান:{' '}
            <b style={{ color: config.autopilotEnabled ? '#6ee7b7' : '#94a3b8' }}>
              {config.autopilotEnabled ? 'সক্রিয়' : 'বন্ধ'}
            </b>
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 'auto', flexWrap: 'wrap' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 12px',
              borderRadius: 999,
              background: 'rgba(11, 10, 18, 0.55)',
              border: '1px solid rgba(167, 139, 250, 0.25)',
              fontSize: 12,
              color: '#e2e8f0',
            }}
          >
            <span>নিচের ফ্লোটিং সাইকা বার:</span>
            <PillSwitch
              checked={config.showFloatingOrb}
              onChange={(next) =>
                saveConfigPatch(
                  { showFloatingOrb: next },
                  next
                    ? '✅ নিচের ফ্লোটিং সাইকা বার চালু করা হয়েছে!'
                    : '✅ নিচের ফ্লোটিং সাইকা বার লুকানো হয়েছে!'
                )
              }
            />
          </div>
        </div>
      </div>

      {/* Toast Notification */}
      {toast && (
        <div
          className="fin-toast"
          style={{
            borderColor: toast.type === 'ok' ? 'rgba(52, 211, 153, 0.35)' : 'rgba(248, 113, 113, 0.35)',
            background: toast.type === 'ok' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.14)',
            color: toast.type === 'ok' ? '#a7f3d0' : '#fecaca',
            fontWeight: 600,
          }}
        >
          {toast.text}
        </div>
      )}

      {/* Sub-Navigation Bar */}
      <div className="fin-nav">
        {SECTION_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={activeSection === t.id ? 'active' : ''}
            onClick={() => onSectionChange(t.id, t.subLabel)}
          >
            <span>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="sa-card" style={{ padding: 36, textAlign: 'center', color: '#94a3b8' }}>
          সাইকা কন্ট্রোল সেন্টার লোড হচ্ছে...
        </div>
      ) : (
        <>
          {/* =====================================================================
              TAB 1: COMMAND CENTER (OVERVIEW + LIVE CHAT + STORE RADAR)
             ===================================================================== */}
          {activeSection === 'overview' && (
            <>
              <div className="fin-metric-grid">
                <div className="fin-metric fin-violet">
                  <span>আজকের অর্ডার ও সেলস</span>
                  <strong>৳{(sum?.todayRevenue ?? 0).toLocaleString()}</strong>
                  <small>আজ মোট {sum?.todayOrdersCount ?? 0}টি অর্ডার এসেছে</small>
                </div>
                <div className="fin-metric fin-rose">
                  <span>পেন্ডিং ও ডিলেইড অর্ডার</span>
                  <strong>{sum?.pendingCount ?? 0} টি</strong>
                  <small>{sum?.delayedPendingCount ?? 0}টি অর্ডার ২৫ মিনিটের বেশি পেন্ডিং</small>
                </div>
                <div className="fin-metric fin-teal">
                  <span>স্টক ও ইনভেন্টরি হেলথ</span>
                  <strong>{stk?.totalProducts ?? storeSummary.productsCount} পণ্য</strong>
                  <small>
                    স্টকআউট: {stk?.outOfStockCount ?? 0}টি · লো-স্টক: {stk?.lowStockCount ?? 0}টি
                  </small>
                </div>
                <div className="fin-metric fin-green">
                  <span>অনলাইন স্টাফ ও অডিট</span>
                  <strong>
                    {stf?.onlineCount ?? 0} / {stf?.totalStaff ?? users.length}
                  </strong>
                  <small>
                    {stf?.onlineNames?.length ? `অনলাইন: ${stf.onlineNames.join(', ')}` : 'কোনো স্টাফ অনলাইনে নেই'}
                  </small>
                </div>
                <div className="fin-metric fin-blue">
                  <span>Saika Admin API Keys</span>
                  <strong>{config.keysCount} টি Key</strong>
                  <small>
                    {config.hasApiKey ? 'মাল্টি-কি অটো ফেইলওভার সক্রিয়' : 'API সেটআপ ট্যাব থেকে Key যুক্ত করুন'}
                  </small>
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))',
                  gap: 16,
                  alignItems: 'start',
                }}
              >
                {/* Left: Saika Executive Command & Chat Console */}
                <div className="sa-card" style={{ display: 'flex', flexDirection: 'column', minHeight: 510 }}>
                  <div
                    className="sa-card-h"
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Perfect3DAppleOrb size={32} isLive={config.hasApiKey} isSpeaking={askingChat} />
                      <div>
                        <h2 style={{ margin: 0 }}>সাইকা এক্সিকিউটিভ কমান্ড কনসোল</h2>
                        <div style={{ fontSize: 11.5, color: '#94a3b8' }}>
                          বাংলায় যেকোনো অর্ডার, স্টক, স্টাফ অডিট, কোড বা বিজনেস নির্দেশ লিখুন বা বলুন
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="sa-btn ghost"
                      style={{ height: 32, fontSize: 12 }}
                      onClick={() => window.dispatchEvent(new CustomEvent('open-secrate-ai'))}
                    >
                      🎙️ টু-ওয়ে ভয়েস
                    </button>
                  </div>

                  {/* Quick Prompt Chips */}
                  <div
                    style={{
                      display: 'flex',
                      gap: 6,
                      flexWrap: 'wrap',
                      padding: '10px 16px',
                      borderBottom: '1px solid rgba(255,255,255,0.06)',
                      background: 'rgba(139, 92, 246, 0.04)',
                    }}
                  >
                    {[
                      'আজকের সেলস ও পেন্ডিং রিপোর্ট দাও',
                      'স্টাফদের পারফরম্যান্স অডিট করো',
                      'লো-স্টক প্রোডাক্টগুলো দেখাও',
                      'উইনিং প্রোডাক্ট আইডিয়া দাও',
                      'হোয়াটসঅ্যাপে আজকের রিপোর্ট পাঠাও',
                    ].map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => sendExecutiveCommand(q)}
                        style={{
                          padding: '5px 10px',
                          borderRadius: 999,
                          fontSize: 11.5,
                          fontWeight: 600,
                          background: 'rgba(139, 92, 246, 0.12)',
                          border: '1px solid rgba(167, 139, 250, 0.25)',
                          color: '#ddd6fe',
                          cursor: 'pointer',
                        }}
                      >
                        ⚡ {q}
                      </button>
                    ))}
                  </div>

                  {/* Messages Feed */}
                  <div
                    style={{
                      flex: 1,
                      maxHeight: 330,
                      overflowY: 'auto',
                      padding: 16,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12,
                    }}
                  >
                    {chatMessages.map((m) => (
                      <div
                        key={m.id}
                        style={{
                          alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                          maxWidth: '88%',
                          padding: '11px 14px',
                          borderRadius: m.role === 'user' ? '14px 14px 3px 14px' : '14px 14px 14px 3px',
                          background:
                            m.role === 'user'
                              ? 'linear-gradient(135deg, #6d28d9 0%, #7c3aed 100%)'
                              : '#181526',
                          border:
                            m.role === 'user'
                              ? '1px solid rgba(196, 181, 253, 0.35)'
                              : '1px solid rgba(255, 255, 255, 0.08)',
                          color: '#f8fafc',
                          fontSize: 13.5,
                          lineHeight: 1.55,
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        <div
                          style={{
                            fontSize: 10.5,
                            fontWeight: 700,
                            color: m.role === 'user' ? '#e9d5ff' : '#a78bfa',
                            marginBottom: 4,
                            display: 'flex',
                            justifyContent: 'space-between',
                            gap: 12,
                          }}
                        >
                          <span>{m.role === 'user' ? '👤 বস' : `👩‍💼 ${config.assistantName}`}</span>
                          {m.time && <span style={{ opacity: 0.7 }}>{m.time}</span>}
                        </div>
                        {m.text}
                        {m.role === 'assistant' && (
                          <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              onClick={() => playVoiceSample(m.text)}
                              style={{
                                background: 'rgba(139, 92, 246, 0.14)',
                                border: '1px solid rgba(167, 139, 250, 0.25)',
                                color: '#c4b5fd',
                                borderRadius: 6,
                                padding: '2px 8px',
                                fontSize: 11,
                                cursor: 'pointer',
                              }}
                            >
                              🔊 শুনুন
                            </button>
                            {Array.isArray(m.actions) &&
                              m.actions.map((act, idx) => (
                                <span
                                  key={idx}
                                  style={{
                                    fontSize: 10.5,
                                    padding: '2px 8px',
                                    borderRadius: 999,
                                    background: 'rgba(16, 185, 129, 0.15)',
                                    color: '#6ee7b7',
                                    border: '1px solid rgba(52, 211, 153, 0.3)',
                                  }}
                                >
                                  ✓ {act.type}
                                </span>
                              ))}
                          </div>
                        )}
                      </div>
                    ))}
                    {askingChat && (
                      <div style={{ color: '#a78bfa', fontSize: 12.5, fontStyle: 'italic' }}>
                        সাইকা ডাটা বিশ্লেষণ করছে...
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>

                  {/* Input Form */}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      sendExecutiveCommand(chatInput);
                    }}
                    style={{
                      display: 'flex',
                      gap: 8,
                      padding: 14,
                      borderTop: '1px solid rgba(255,255,255,0.07)',
                      background: '#100e19',
                    }}
                  >
                    <button
                      type="button"
                      className="sa-btn ghost"
                      onClick={toggleConsoleMic}
                      title="মুখে বলুন"
                      style={{
                        padding: '0 12px',
                        borderColor: listeningMic ? '#ec4899' : undefined,
                        color: listeningMic ? '#f472b6' : undefined,
                      }}
                    >
                      {listeningMic ? '🔴 শুনছি...' : '🎙️'}
                    </button>
                    <input
                      type="text"
                      autoComplete="off"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder="সাইকাকে যেকোনো নির্দেশ দিন (যেমন: আজকের রিপোর্ট দাও / 017... অর্ডার কনফার্ম করো)..."
                      disabled={askingChat}
                      style={{ flex: 1 }}
                    />
                    <button type="submit" className="sa-btn" disabled={askingChat || !chatInput.trim()}>
                      {askingChat ? '...' : 'পাঠান ➤'}
                    </button>
                  </form>
                </div>

                {/* Right: Staff Directive + Store Radar + Quick Stock */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div className="fin-form-card" style={{ margin: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <h3 style={{ fontSize: 14 }}>📢 স্টাফদের তাৎক্ষণিক নির্দেশনা ও অটো-অ্যাসাইন</h3>
                      <button
                        type="button"
                        className="sa-btn ghost"
                        style={{ height: 30, fontSize: 11.5, padding: '0 10px' }}
                        onClick={() => handleSendDirective('')}
                        disabled={sendingDirective}
                      >
                        ⚡ পেন্ডিং অটো-অ্যাসাইন করুন
                      </button>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        type="text"
                        autoComplete="off"
                        value={directiveInput}
                        onChange={(e) => setDirectiveInput(e.target.value)}
                        placeholder="স্টাফদের জন্য বিশেষ মেসেজ লিখুন..."
                        style={{ flex: 1 }}
                      />
                      <button
                        type="button"
                        className="sa-btn"
                        disabled={sendingDirective || !directiveInput.trim()}
                        onClick={() => handleSendDirective(directiveInput)}
                      >
                        পাঠান
                      </button>
                    </div>
                  </div>

                  <div className="fin-form-card" style={{ margin: 0 }}>
                    <h3 style={{ fontSize: 14, marginBottom: 10 }}>🚨 লাইভ স্টোর রাডার ও এআই পরামর্শ</h3>
                    {briefing?.problems && briefing.problems.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {briefing.problems.map((p, idx) => (
                          <div
                            key={idx}
                            style={{
                              padding: '10px 12px',
                              borderRadius: 10,
                              background:
                                p.severity === 'critical'
                                  ? 'rgba(239, 68, 68, 0.1)'
                                  : 'rgba(245, 158, 11, 0.09)',
                              border:
                                p.severity === 'critical'
                                  ? '1px solid rgba(248, 113, 113, 0.28)'
                                  : '1px solid rgba(251, 191, 36, 0.25)',
                            }}
                          >
                            <div style={{ fontWeight: 700, fontSize: 13, color: '#f8fafc' }}>{p.title}</div>
                            <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 3 }}>{p.actionText}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div
                        style={{
                          padding: '12px 14px',
                          borderRadius: 10,
                          background: 'rgba(16, 185, 129, 0.09)',
                          border: '1px solid rgba(52, 211, 153, 0.25)',
                          color: '#a7f3d0',
                          fontSize: 13,
                        }}
                      >
                        ✅ আলহামদুলিল্লাহ! এই মুহূর্তে স্টোরে কোনো ক্রিটিক্যাল সমস্যা বা জট নেই।
                      </div>
                    )}
                  </div>

                  <div className="fin-form-card" style={{ margin: 0 }}>
                    <h3 style={{ fontSize: 14, marginBottom: 10 }}>📦 স্টকআউট ও লো-স্টক কুইক রিস্টক</h3>
                    {[...(stk?.outOfStock || []), ...(stk?.lowStock || [])].slice(0, 5).length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {[...(stk?.outOfStock || []), ...(stk?.lowStock || [])].slice(0, 5).map((item: any) => (
                          <div
                            key={item.id}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              gap: 10,
                              padding: '8px 11px',
                              borderRadius: 9,
                              background: '#110f1a',
                              border: '1px solid rgba(255,255,255,0.07)',
                            }}
                          >
                            <div style={{ minWidth: 0 }}>
                              <div
                                style={{
                                  fontSize: 13,
                                  fontWeight: 600,
                                  color: '#f1f5f9',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {item.name}
                              </div>
                              <div style={{ fontSize: 11.5, color: Number(item.stock) <= 0 ? '#f87171' : '#fbbf24' }}>
                                বর্তমান স্টক: {item.stock ?? 0} pcs
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                              <button
                                type="button"
                                className="fin-text-btn"
                                onClick={() => handleQuickRestock(item.id, (Number(item.stock) || 0) + 50, item.name)}
                              >
                                +50 স্টক
                              </button>
                              <button
                                type="button"
                                className="fin-text-btn"
                                onClick={() => handleQuickRestock(item.id, (Number(item.stock) || 0) + 100, item.name)}
                              >
                                +100 স্টক
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize: 12.5, color: '#94a3b8' }}>সকল পণ্যের পর্যাপ্ত স্টক রয়েছে।</div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* =====================================================================
              TAB 2: API & MODEL SETUP (STRICTLY DEDICATED TO ADMIN PANEL SAIKA AI)
             ===================================================================== */}
          {activeSection === 'api' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: 16 }}>
              <div className="fin-form-card" style={{ margin: 0 }}>
                <h3 style={{ fontSize: 15, marginBottom: 6 }}>🔑 অ্যাডমিন Saika AI-এর নিজস্ব Gemini API Key</h3>
                <p className="fin-help" style={{ marginBottom: 14 }}>
                  এখানে যুক্ত করা API Key শুধুমাত্র অ্যাডমিন প্যানেলের Saika AI ব্যবহার করবে (Call Center AI-এর সাথে এটি কখনোই মিক্স হবে না)। একাধিক Key যুক্ত করলে একটির লিমিট শেষ হলেই পরের ব্যাকআপ Key স্বয়ংক্রিয়ভাবে চালু হবে।
                </p>

                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                  Gemini API Key পেস্ট করুন (AIzaSy...)
                </label>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <input
                    type="text"
                    name="saika_gemini_api_token_field"
                    autoComplete="off"
                    spellCheck={false}
                    data-lpignore="true"
                    data-1p-ignore="true"
                    value={newApiKey}
                    onChange={(e) => setNewApiKey(e.target.value)}
                    placeholder="AIzaSy... এখানে পেস্ট করুন"
                    style={{
                      flex: 1,
                      fontFamily: 'monospace',
                      ...(!showKeyPlain && newApiKey ? ({ WebkitTextSecurity: 'disc' } as any) : {}),
                    }}
                  />
                  <button
                    type="button"
                    className="sa-btn ghost"
                    onClick={() => setShowKeyPlain((v) => !v)}
                    title={showKeyPlain ? 'লুকান' : 'দেখুন'}
                    style={{ padding: '0 12px', flexShrink: 0 }}
                  >
                    {showKeyPlain ? '🙈' : '👁️'}
                  </button>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 12px',
                    borderRadius: 9,
                    background: '#100f18',
                    border: '1px solid rgba(255,255,255,0.07)',
                    marginBottom: 14,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9' }}>Primary Key হিসেবে সেট করুন</div>
                    <div style={{ fontSize: 11.5, color: '#94a3b8' }}>
                      বন্ধ রাখলে এটি Backup Failover Key হিসেবে যুক্ত হবে
                    </div>
                  </div>
                  <PillSwitch checked={makePrimaryKey} onChange={setMakePrimaryKey} />
                </div>

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="sa-btn"
                    disabled={keyBusy || !newApiKey.trim()}
                    onClick={handleAddApiKey}
                  >
                    {keyBusy ? 'ভেরিফাই হচ্ছে...' : '✅ ভেরিফাই ও সেভ করুন'}
                  </button>
                  <button
                    type="button"
                    className="sa-btn ghost"
                    disabled={testingKey || !config.hasApiKey}
                    onClick={handleTestActiveKey}
                  >
                    {testingKey ? 'টেস্ট হচ্ছে...' : '🧪 বর্তমান Key টেস্ট করুন'}
                  </button>
                  <a
                    href="https://aistudio.google.com/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="sa-btn ghost"
                    style={{ textDecoration: 'none' }}
                  >
                    ↗ ফ্রি API Key নিন
                  </a>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="fin-table-card" style={{ margin: 0 }}>
                  <div className="fin-card-title">
                    <h3>সংরক্ষিত Admin Saika API Keys ({config.maskedKeys.length}টি)</h3>
                    <span>Dedicated Admin Multi-Key Pool</span>
                  </div>
                  <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {config.maskedKeys.length === 0 ? (
                      <div style={{ padding: 18, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                        অ্যাডমিন প্যানেলের Saika AI-তে এখনো কোনো API Key সেভ করা নেই। বাম পাশ থেকে যুক্ত করুন।
                      </div>
                    ) : (
                      config.maskedKeys.map((k) => (
                        <div
                          key={k.index}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 10,
                            padding: '10px 14px',
                            borderRadius: 10,
                            background: k.isPrimary ? 'rgba(139, 92, 246, 0.12)' : '#100f18',
                            border: k.isPrimary
                              ? '1px solid rgba(167, 139, 250, 0.4)'
                              : '1px solid rgba(255,255,255,0.07)',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ fontSize: 16 }}>{k.isPrimary ? '🟢' : '🛡️'}</span>
                            <div>
                              <div style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: 13.5, color: '#fff' }}>
                                {k.masked}
                              </div>
                              <div style={{ fontSize: 11, color: k.isPrimary ? '#c4b5fd' : '#94a3b8' }}>
                                {k.isPrimary ? 'Primary Active Key (Admin Saika AI)' : `Backup Key #${k.index + 1} (অটো-ফেইলওভার)`}
                              </div>
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 6 }}>
                            {!k.isPrimary && (
                              <button
                                type="button"
                                className="fin-text-btn"
                                disabled={keyBusy}
                                onClick={() => handleManageKey('promote', k.index)}
                              >
                                ⭐ Primary করুন
                              </button>
                            )}
                            <button
                              type="button"
                              className="fin-text-btn"
                              style={{ borderColor: 'rgba(248,113,113,0.35)', color: '#fca5a5' }}
                              disabled={keyBusy}
                              onClick={() => handleManageKey('remove', k.index)}
                            >
                              মুছুন
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="fin-form-card" style={{ margin: 0 }}>
                  <h3 style={{ fontSize: 15, marginBottom: 12 }}>🤖 সাইকার AI Brain ও Model সিলেকশন</h3>
                  <div className="fin-form-grid" style={{ margin: 0 }}>
                    <label>
                      Executive Reasoning & Chat Brain Model
                      <select
                        value={config.preferredModel}
                        onChange={(e) => saveConfigPatch({ preferredModel: e.target.value })}
                      >
                        <option value="gemini-3.8-flash">Gemini 3.8 Flash (Recommended · Latest & Smartest)</option>
                        <option value="gemini-3.7-flash">Gemini 3.7 Flash (High Reasoning)</option>
                        <option value="gemini-3.6-flash">Gemini 3.6 Flash (Fast Agentic)</option>
                        <option value="gemini-3.5-flash">Gemini 3.5 Flash (Balanced)</option>
                        <option value="gemini-3.5-flash-lite">Gemini 3.5 Flash-Lite (Ultra High Quota)</option>
                      </select>
                    </label>
                    <label>
                      Boss Live Two-Way Voice Model
                      <select
                        value={config.liveVoiceModel}
                        onChange={(e) => saveConfigPatch({ liveVoiceModel: e.target.value })}
                      >
                        <option value="gemini-3.8-live">Gemini 3.8 Live Native Audio (Recommended)</option>
                        <option value="gemini-3.1-flash-live-preview">Gemini 3.1 Flash Live</option>
                      </select>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* =====================================================================
              TAB 3: VOICE & WIDGET STUDIO (ADMIN PANEL FLOATING BAR + BOSS VOICE)
             ===================================================================== */}
          {activeSection === 'voice' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: 16 }}>
              <div className="fin-form-card" style={{ margin: 0 }}>
                <h3 style={{ fontSize: 15, marginBottom: 12 }}>✨ অ্যাডমিন প্যানেল ফ্লোটিং উইজেট ও ভয়েস অ্যালার্ট</h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[
                    {
                      title: 'নিচের ডানপাশের ফ্লোটিং Saika AI বার দেখান (Floating Orb)',
                      desc: 'বন্ধ করলে স্ক্রিনের নিচে ডানপাশের ভাসমান সাইকা বার লুকিয়ে থাকবে। আপনি তখনও উপরের "Ask Saika" বা সাইডবারের "Saika AI" থেকে সাইকা ব্যবহার করতে পারবেন।',
                      checked: config.showFloatingOrb,
                      onChange: (v: boolean) =>
                        saveConfigPatch(
                          { showFloatingOrb: v },
                          v ? '✅ ফ্লোটিং সাইকা বার চালু হয়েছে!' : '✅ ফ্লোটিং সাইকা বার লুকানো হয়েছে!'
                        ),
                    },
                    {
                      title: 'হ্যান্ডস-ফ্রি ওয়েক ওয়ার্ড ("হ্যালো সাইকা")',
                      desc: 'চালু থাকলে মাউস ক্লিক ছাড়াই শুধু মুখে "হ্যালো সাইকা" বললেই সাইকা ভয়েস মোডে সাড়া দেবে।',
                      checked: config.wakeWordEnabled,
                      onChange: (v: boolean) => saveConfigPatch({ wakeWordEnabled: v }),
                    },
                    {
                      title: 'নতুন অর্ডার ও জরুরি সমস্যার ভয়েস অ্যালার্ট',
                      desc: 'অ্যাডমিন প্যানেলে নতুন অর্ডার এলে বা স্টক শেষ হলে সাইকা নিজে থেকে কণ্ঠে আপনাকে জানাবে।',
                      checked: config.proactiveVoiceAlert,
                      onChange: (v: boolean) => saveConfigPatch({ proactiveVoiceAlert: v }),
                    },
                  ].map((item, i) => (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 14,
                        padding: '13px 14px',
                        borderRadius: 11,
                        background: '#100f18',
                        border: '1px solid rgba(255,255,255,0.075)',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 13.5, fontWeight: 700, color: '#f8fafc' }}>{item.title}</div>
                        <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 3, lineHeight: 1.45 }}>
                          {item.desc}
                        </div>
                      </div>
                      <PillSwitch checked={item.checked} onChange={item.onChange} />
                    </div>
                  ))}
                </div>
              </div>

              <div className="fin-form-card" style={{ margin: 0 }}>
                <h3 style={{ fontSize: 15, marginBottom: 12 }}>🎙️ অ্যাডমিন সাইকার নিজস্ব কণ্ঠস্বর ও পরিচয়</h3>

                <div className="fin-form-grid" style={{ marginTop: 0 }}>
                  <label>
                    অ্যাডমিন সহকারীর নাম (Assistant Name)
                    <input
                      type="text"
                      autoComplete="off"
                      value={config.assistantName}
                      onChange={(e) => setConfig({ ...config, assistantName: e.target.value })}
                      placeholder="Saika (সাইকা)"
                    />
                  </label>

                  <label>
                    বসের সাথে লাইভ কথোপকথনের কণ্ঠস্বর (Gemini Live Voice)
                    <select
                      value={config.liveVoiceName}
                      onChange={(e) =>
                        saveConfigPatch({ liveVoiceName: e.target.value as SaikaControlConfig['liveVoiceName'] })
                      }
                    >
                      <option value="Aoede">Aoede — মিষ্টি ও স্বাভাবিক নারী কণ্ঠ (Recommended)</option>
                      <option value="Leda">Leda — প্রফেশনাল এক্সিকিউটিভ নারী কণ্ঠ</option>
                      <option value="Kore">Kore — স্পষ্ট ও স্মার্ট কণ্ঠ</option>
                      <option value="Zephyr">Zephyr — শান্ত ও কোমল কণ্ঠ</option>
                      <option value="Puck">Puck — প্রাণবন্ত পুরুষ কণ্ঠ</option>
                    </select>
                  </label>

                  <label style={{ gridColumn: '1 / -1' }}>
                    বাংলা নিউরাল টিটিএস কণ্ঠস্বর (Chat & Alert Voice)
                    <select
                      value={config.ttsVoiceName}
                      onChange={(e) =>
                        saveConfigPatch({ ttsVoiceName: e.target.value as SaikaControlConfig['ttsVoiceName'] })
                      }
                    >
                      <option value="bn-BD-NabanitaNeural">
                        Nabanita Neural (বাংলাদেশি প্রাকৃতিক নারী কণ্ঠ — Recommended)
                      </option>
                      <option value="bn-IN-TanishaaNeural">Tanishaa Neural (স্পষ্ট ও প্রাণবন্ত বাংলা নারী কণ্ঠ)</option>
                    </select>
                  </label>
                </div>

                <div style={{ marginTop: 14 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                    লাইভ ভয়েস টেস্ট টেক্সট
                  </label>
                  <textarea
                    rows={3}
                    value={voiceSampleText}
                    onChange={(e) => setVoiceSampleText(e.target.value)}
                    style={{ marginBottom: 10 }}
                  />
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="sa-btn"
                      onClick={() => playVoiceSample(voiceSampleText)}
                      disabled={speakingSample}
                    >
                      {speakingSample ? '🔊 বাজছে...' : '🔊 কণ্ঠস্বর শুনুন'}
                    </button>
                    <button
                      type="button"
                      className="sa-btn ghost"
                      onClick={() => saveConfigPatch({ assistantName: config.assistantName })}
                    >
                      💾 নাম সেভ করুন
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* =====================================================================
              TAB 4: EXECUTIVE CAPABILITIES & AUTOPILOT (100% ADMIN PANEL AI ONLY)
             ===================================================================== */}
          {activeSection === 'channels' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: 16 }}>
              <div className="fin-form-card" style={{ margin: 0 }}>
                <h3 style={{ fontSize: 15, marginBottom: 12 }}>⚡ সাইকার অ্যাডমিন ক্ষমতা ও অ্যাকশন পারমিশন</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[
                    {
                      title: 'অ্যাডমিন প্যানেল বস অ্যাসিস্ট্যান্ট সক্রিয় (Master Switch)',
                      desc: 'বন্ধ করলে অ্যাডমিন প্যানেলে সাইকার লাইভ ভয়েস ও এক্সিকিউটিভ চ্যাট সাময়িকভাবে বন্ধ থাকবে।',
                      checked: config.adminAssistantEnabled,
                      onChange: (v: boolean) => saveConfigPatch({ adminAssistantEnabled: v }),
                    },
                    {
                      title: 'অর্ডার কনফার্ম, হোল্ড ও ঠিকানা পরিবর্তনের ক্ষমতা',
                      desc: 'বস মুখে বা লিখে বললে সাইকা সরাসরি ডাটাবেসে অর্ডারের স্ট্যাটাস ও ঠিকানা আপডেট করতে পারবে।',
                      checked: config.allowOrderActions,
                      onChange: (v: boolean) => saveConfigPatch({ allowOrderActions: v }),
                    },
                    {
                      title: 'নতুন প্রোডাক্ট আপলোড ও স্টক আপডেট করার ক্ষমতা',
                      desc: 'বসের নির্দেশে সাইকা সরাসরি পণ্যের স্টক সংখ্যা ও মূল্য পরিবর্তন বা নতুন পণ্য যুক্ত করতে পারবে।',
                      checked: config.allowStockActions,
                      onChange: (v: boolean) => saveConfigPatch({ allowStockActions: v }),
                    },
                    {
                      title: 'স্টাফ অডিট ও ডিরেকশন ব্রডকাস্টের ক্ষমতা',
                      desc: 'স্টাফদের পারফরম্যান্স অডিট করা এবং ড্যাশবোর্ডে জরুরি নির্দেশনা পাঠানোর অনুমতি।',
                      checked: config.allowStaffActions,
                      onChange: (v: boolean) => saveConfigPatch({ allowStaffActions: v }),
                    },
                    {
                      title: 'বসের নির্দেশে WhatsApp মেসেজ ও রিপোর্ট প্রেরণ',
                      desc: 'বস বললে তাৎক্ষণিক সেলস রিপোর্ট বা কাস্টমারকে হোয়াটসঅ্যাপ মেসেজ পাঠাতে পারবে।',
                      checked: config.allowWhatsappDispatch,
                      onChange: (v: boolean) => saveConfigPatch({ allowWhatsappDispatch: v }),
                    },
                    {
                      title: 'বসের নির্দেশে ইমেইল রিপোর্ট প্রেরণ',
                      desc: 'বসের মেইলে বা নির্দিষ্ট মেইল ঠিকানায় বিজনেস রিপোর্ট পাঠানোর অনুমতি।',
                      checked: config.allowEmailDispatch,
                      onChange: (v: boolean) => saveConfigPatch({ allowEmailDispatch: v }),
                    },
                  ].map((ch, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 14,
                        padding: '12px 14px',
                        borderRadius: 10,
                        background: '#100f18',
                        border: '1px solid rgba(255,255,255,0.075)',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 13.5, fontWeight: 700, color: '#f8fafc' }}>{ch.title}</div>
                        <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 2 }}>{ch.desc}</div>
                      </div>
                      <PillSwitch checked={ch.checked} onChange={ch.onChange} />
                    </div>
                  ))}
                </div>
              </div>

              <div className="fin-form-card" style={{ margin: 0 }}>
                <h3 style={{ fontSize: 15, marginBottom: 12 }}>🤖 ২৪/৭ স্টাফ অটো-গার্ডিয়ান (Autopilot Supervision)</h3>
                <p className="fin-help" style={{ marginBottom: 14 }}>
                  বস যখন ড্যাশবোর্ডে থাকবেন না, তখন সাইকা স্বয়ংক্রিয়ভাবে পেন্ডিং ও কুরিয়ার হোল্ড অর্ডার মনিটর করে অনলাইন স্টাফদের কাজ বণ্টন ও তাগিদ দেবে।
                </p>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 14,
                    padding: '14px',
                    borderRadius: 11,
                    background: config.autopilotEnabled ? 'rgba(16, 185, 129, 0.1)' : '#100f18',
                    border: config.autopilotEnabled
                      ? '1px solid rgba(52, 211, 153, 0.35)'
                      : '1px solid rgba(255,255,255,0.08)',
                    marginBottom: 16,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>
                      ২৪/৭ অটো-পাইলট গার্ডিয়ান চালু রাখুন
                    </div>
                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 3 }}>
                      আজ অটো-ডিরেকশন পাঠানো হয়েছে: {briefing?.autopilot?.directivesSentToday ?? 0} বার
                    </div>
                  </div>
                  <PillSwitch
                    checked={config.autopilotEnabled}
                    onChange={(v) => saveConfigPatch({ autopilotEnabled: v })}
                  />
                </div>

                <div className="fin-form-grid" style={{ margin: 0 }}>
                  <label>
                    অটো-অডিট চেক বিরতি (মিনিট)
                    <input
                      type="number"
                      min={5}
                      max={120}
                      value={config.autopilotIntervalMins}
                      onChange={(e) =>
                        setConfig({ ...config, autopilotIntervalMins: Number(e.target.value) || 15 })
                      }
                      onBlur={() => saveConfigPatch({ autopilotIntervalMins: config.autopilotIntervalMins })}
                    />
                  </label>
                  <label>
                    ডিলেইড পেন্ডিং সতর্কতা সময় (মিনিট)
                    <input
                      type="number"
                      min={10}
                      max={180}
                      value={config.delayedPendingMins}
                      onChange={(e) =>
                        setConfig({ ...config, delayedPendingMins: Number(e.target.value) || 25 })
                      }
                      onBlur={() => saveConfigPatch({ delayedPendingMins: config.delayedPendingMins })}
                    />
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* =====================================================================
              TAB 5: BOSS KNOWLEDGE & RULES (PRIVATE TO ADMIN PANEL SAIKA AI)
             ===================================================================== */}
          {activeSection === 'knowledge' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="fin-note">
                <b>🔒 গোপন এক্সিকিউটিভ মেমোরি:</b>
                <span>
                  এখানে লেখা তথ্য ও নিয়ম শুধুমাত্র অ্যাডমিন প্যানেলের <b>Saika AI</b> জানবে (কাস্টমার Call Center AI কখনোই এই গোপন বিজনেস তথ্য দেখতে বা বলতে পারবে না)। স্টোরের{' '}
                  <b>{storeSummary.productsCount}টি পণ্য</b> ও <b>{storeSummary.landingsCount}টি ল্যান্ডিং পেজ</b> অটো-সিঙ্কড আছে।
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: 16 }}>
                <div className="fin-form-card" style={{ margin: 0 }}>
                  <h3 style={{ fontSize: 15, marginBottom: 12 }}>📜 বসের বিশেষ নির্দেশনা ও বিজনেস স্ট্র্যাটেজি</h3>

                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                    ১. বসের কাস্টম নির্দেশনা (Boss Custom Instructions)
                  </label>
                  <textarea
                    rows={4}
                    value={config.bossCustomInstructions}
                    onChange={(e) => setConfig({ ...config, bossCustomInstructions: e.target.value })}
                    placeholder="যেমন: সর্বদা সংক্ষেপে পয়েন্ট আকারে রিপোর্ট দেবে এবং কোনো প্রোডাক্টের স্টক ২০-এর নিচে নামলেই সতর্ক করবে..."
                    style={{ marginBottom: 14 }}
                  />

                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                    ২. গোপন প্রফিট টার্গেট, সাপ্লায়ার ও অ্যাড স্ট্র্যাটেজি নোটস
                  </label>
                  <textarea
                    rows={4}
                    value={config.businessStrategyNotes}
                    onChange={(e) => setConfig({ ...config, businessStrategyNotes: e.target.value })}
                    placeholder="যেমন: আমাদের টার্গেট ROAS 3.5x, মিনিমাম নেট প্রফিট মার্জিন ৩০%, মেইন কুরিয়ার CarryBee ও Pathao..."
                    style={{ marginBottom: 14 }}
                  />

                  <button
                    type="button"
                    className="sa-btn"
                    disabled={saving}
                    onClick={() =>
                      saveConfigPatch({
                        bossCustomInstructions: config.bossCustomInstructions,
                        businessStrategyNotes: config.businessStrategyNotes,
                      })
                    }
                  >
                    {saving ? 'সেভ হচ্ছে...' : '💾 বসের নির্দেশনা সেভ করুন'}
                  </button>
                </div>

                <div className="fin-form-card" style={{ margin: 0 }}>
                  <h3 style={{ fontSize: 15, marginBottom: 12 }}>🧠 সাইকার প্রাইভেট মেমোরি ব্যাংক (Saved Notes & Rules)</h3>

                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#cbd5e1', marginBottom: 5 }}>
                    বিষয় / শিরোনাম
                  </label>
                  <input
                    type="text"
                    autoComplete="off"
                    value={memTitle}
                    onChange={(e) => setMemTitle(e.target.value)}
                    placeholder="যেমন: স্টাফ ডিউটি টাইম / প্রোডাক্ট কেনা দাম"
                    style={{ marginBottom: 10 }}
                  />

                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#cbd5e1', marginBottom: 5 }}>
                    বিস্তারিত তথ্য বা নিয়ম
                  </label>
                  <textarea
                    rows={3}
                    value={memContent}
                    onChange={(e) => setMemContent(e.target.value)}
                    placeholder="সাইকা যে তথ্যটি সবসময় মনে রাখবে তা লিখুন..."
                    style={{ marginBottom: 10 }}
                  />

                  <button
                    type="button"
                    className="sa-btn"
                    disabled={addingMem || !memTitle.trim() || !memContent.trim()}
                    onClick={handleAddMemory}
                    style={{ marginBottom: 16 }}
                  >
                    {addingMem ? 'যুক্ত হচ্ছে...' : '➕ মেমোরিতে যুক্ত করুন'}
                  </button>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 300, overflowY: 'auto' }}>
                    {config.memories.length === 0 ? (
                      <div style={{ fontSize: 12.5, color: '#94a3b8', padding: '12px 0' }}>
                        এখনো কোনো প্রাইভেট মেমোরি নোট যুক্ত করা হয়নি।
                      </div>
                    ) : (
                      config.memories.map((m) => (
                        <div
                          key={m.id}
                          style={{
                            padding: '10px 12px',
                            borderRadius: 10,
                            background: '#100f18',
                            border: '1px solid rgba(255,255,255,0.07)',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                            <strong style={{ fontSize: 13, color: '#e9d5ff' }}>📌 {m.title}</strong>
                            <button
                              type="button"
                              className="fin-text-btn"
                              style={{ color: '#fca5a5', borderColor: 'rgba(248,113,113,0.3)' }}
                              onClick={() => handleDeleteMemory(m.id)}
                            >
                              মুছুন
                            </button>
                          </div>
                          <div style={{ fontSize: 12.5, color: '#cbd5e1', marginTop: 4 }}>{m.content}</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* =====================================================================
              TAB 6: STAFF ACCESS & EXECUTIVE LOGS (NO CALL CENTER MIXING)
             ===================================================================== */}
          {activeSection === 'access' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="fin-table-card" style={{ margin: 0 }}>
                <div className="fin-card-title">
                  <h3>🛡️ স্টাফ ও ম্যানেজার Saika AI অ্যাক্সেস কন্ট্রোল</h3>
                  <span>কে কে অ্যাডমিন প্যানেলে Saika AI ব্যবহার করতে পারবে তা নির্ধারণ করুন</span>
                </div>
                <div className="fin-table-scroll">
                  <table className="fin-table" style={{ minWidth: 540 }}>
                    <thead>
                      <tr>
                        <th>নাম ও ইউজারনেম</th>
                        <th>রোল (Role)</th>
                        <th>স্ট্যাটাস</th>
                        <th className="right">Saika AI অ্যাক্সেস</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((u) => (
                        <tr key={u.id}>
                          <td>
                            <b>{u.name}</b>
                            <small>@{u.username}</small>
                          </td>
                          <td>
                            <span className={`fin-status ${u.role === 'owner' ? 'active' : 'transfer'}`}>
                              {u.role}
                            </span>
                          </td>
                          <td>
                            <span className={`fin-status ${u.canAccessSaika ? 'active' : 'archived'}`}>
                              {u.canAccessSaika ? 'অনুমোদিত (Allowed)' : 'বন্ধ (Restricted)'}
                            </span>
                          </td>
                          <td className="right">
                            <PillSwitch
                              checked={u.canAccessSaika}
                              disabled={u.role === 'owner' || userRole !== 'owner'}
                              onChange={() => handleToggleStaffAccess(u)}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="fin-table-card" style={{ margin: 0 }}>
                <div className="fin-card-title">
                  <h3>🎙️ বসের লাইভ ভয়েস সেশন লগ ({voiceSessions.length})</h3>
                  <span>Strictly Admin Executive Sessions (Call Center লগ থেকে আলাদা)</span>
                </div>
                <div className="fin-table-scroll">
                  <table className="fin-table">
                    <thead>
                      <tr>
                        <th>সময়</th>
                        <th>সময়কাল</th>
                        <th>কমান্ড / আলোচনার সারসংক্ষেপ</th>
                        <th>অডিও রেকর্ডিং</th>
                      </tr>
                    </thead>
                    <tbody>
                      {voiceSessions.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="fin-empty">
                            এখনো বসের কোনো লাইভ ভয়েস সেশন রেকর্ড হয়নি।
                          </td>
                        </tr>
                      ) : (
                        voiceSessions.map((s: any) => (
                          <tr key={s.id}>
                            <td style={{ whiteSpace: 'nowrap' }}>
                              {s.createdAt ? new Date(s.createdAt).toLocaleString('bn-BD') : '—'}
                            </td>
                            <td>
                              <b>{s.duration || 0}s</b>
                            </td>
                            <td style={{ maxWidth: 380 }}>
                              <span style={{ fontSize: 12.5 }}>{s.summary || 'Boss Executive Voice Session'}</span>
                            </td>
                            <td>
                              {s.recordingUrl ? (
                                <audio controls preload="none" src={s.recordingUrl} style={{ height: 30, width: 190 }} />
                              ) : (
                                <span style={{ color: '#64748b', fontSize: 11.5 }}>—</span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {directiveLogs.length > 0 && (
                <div className="fin-table-card" style={{ margin: 0 }}>
                  <div className="fin-card-title">
                    <h3>📋 সাইকার পাঠানো স্টাফ ডিরেকশন লগ ({directiveLogs.length})</h3>
                    <span>Autopilot & Boss Directives</span>
                  </div>
                  <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {directiveLogs.slice(0, 10).map((d: any) => (
                      <div
                        key={d.id}
                        style={{
                          padding: '10px 12px',
                          borderRadius: 9,
                          background: '#100f18',
                          border: '1px solid rgba(255,255,255,0.065)',
                          fontSize: 12.5,
                          color: '#cbd5e1',
                        }}
                      >
                        <div style={{ fontSize: 11, color: '#a78bfa', marginBottom: 3 }}>
                          {d.createdAt ? new Date(d.createdAt).toLocaleString('bn-BD') : ''}
                        </div>
                        {d.message}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
