import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Perfect3DAppleOrb, type AiBriefing } from './SecrateAiAssistant';

export type SaikaSection = 'overview' | 'api' | 'voice' | 'channels' | 'knowledge' | 'access';

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
  autopilotEnabled: boolean;
  autopilotIntervalMins: number;
  delayedPendingMins: number;
  bossCustomInstructions: string;
  customerCallInstructions: string;
  websiteVoiceCallEnabled: boolean;
  outboundConfirmCallEnabled: boolean;
  marketingCallEnabled: boolean;
  quietHoursEnabled: boolean;
  quietStartHour: number;
  quietEndHour: number;
  whatsappAi: {
    enabled: boolean;
    tone: string;
    voiceNoteEnabled: boolean;
    orderTrackEnabled: boolean;
    chatToOrderEnabled: boolean;
    pauseMinutes: number;
    storeInfo: string;
  };
  keysCount: number;
  maskedKeys: { index: number; masked: string; isPrimary: boolean }[];
  hasApiKey: boolean;
}

interface FaqItem {
  id: string;
  question: string;
  answer: string;
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
  { id: 'channels', icon: '📡', label: 'Channel Controls', subLabel: 'Channel Controls' },
  { id: 'knowledge', icon: '🧠', label: 'Knowledge & Training', subLabel: 'Knowledge & Training' },
  { id: 'access', icon: '🛡️', label: 'Staff Access & Logs', subLabel: 'Staff Access & Logs' },
];

const DEFAULT_CONFIG: SaikaControlConfig = {
  assistantName: 'Saika (সাইকা)',
  preferredModel: 'gemini-2.5-flash',
  liveVoiceModel: 'gemini-3.8-live',
  liveVoiceName: 'Aoede',
  ttsVoiceName: 'bn-BD-NabanitaNeural',
  showFloatingOrb: true,
  wakeWordEnabled: false,
  proactiveVoiceAlert: true,
  adminAssistantEnabled: true,
  autopilotEnabled: false,
  autopilotIntervalMins: 15,
  delayedPendingMins: 25,
  bossCustomInstructions: '',
  customerCallInstructions: '',
  websiteVoiceCallEnabled: true,
  outboundConfirmCallEnabled: true,
  marketingCallEnabled: true,
  quietHoursEnabled: false,
  quietStartHour: 22,
  quietEndHour: 9,
  whatsappAi: {
    enabled: false,
    tone: 'friendly_bangla',
    voiceNoteEnabled: true,
    orderTrackEnabled: true,
    chatToOrderEnabled: true,
    pauseMinutes: 30,
    storeInfo: '',
  },
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
  const [faqs, setFaqs] = useState<FaqItem[]>([]);
  const [users, setUsers] = useState<StaffMember[]>([]);
  const [callLogs, setCallLogs] = useState<any[]>([]);
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
  const [makePrimaryKey, setMakePrimaryKey] = useState(true);
  const [keyBusy, setKeyBusy] = useState(false);
  const [testingKey, setTestingKey] = useState(false);

  // Voice Test Text
  const [voiceSampleText, setVoiceSampleText] = useState(
    'আসসালামু আলাইকুম বস! আমি সাইকা বলছি। আপনার স্টোরের অর্ডার, স্টক ও কাস্টমার সাপোর্ট সম্পূর্ণ সচল রয়েছে।'
  );

  // FAQ Form State
  const [faqQ, setFaqQ] = useState('');
  const [faqA, setFaqA] = useState('');
  const [addingFaq, setAddingFaq] = useState(false);

  const showNotice = useCallback((text: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 4500);
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

  const loadAll = useCallback(async (initial = false) => {
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
          whatsappAi: { ...DEFAULT_CONFIG.whatsappAi, ...(ctrlRes.config?.whatsappAi || {}) },
        };
        setConfig(mergedCfg);
        setFaqs(Array.isArray(ctrlRes.faqs) ? ctrlRes.faqs : []);
        setUsers(Array.isArray(ctrlRes.users) ? ctrlRes.users : []);
        setCallLogs(Array.isArray(ctrlRes.logs?.calls) ? ctrlRes.logs.calls : []);
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
  }, [showNotice]);

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
      whatsappAi: patch.whatsappAi ? { ...config.whatsappAi, ...patch.whatsappAi } : config.whatsappAi,
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
        const synced = {
          ...DEFAULT_CONFIG,
          ...res.config,
          whatsappAi: { ...DEFAULT_CONFIG.whatsappAi, ...(res.config.whatsappAi || {}) },
        };
        setConfig(synced);
        broadcastConfigToWidget(synced);
        showNotice(silentMsg || '✅ সাইকা সেটিংস সফলভাবে সংরক্ষিত হয়েছে!');
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
      try { recRef.current?.stop(); } catch {}
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
    try { rec.start(); } catch { setListeningMic(false); }
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
        showNotice(res.message || '✅ Gemini API Key ভেরিফাইড ও সেভ হয়েছে!');
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
        showNotice(action === 'promote' ? '⭐ প্রাইমারি API Key আপডেট হয়েছে!' : '🗑️ API Key মুছে ফেলা হয়েছে।');
      }
    } finally {
      setKeyBusy(false);
    }
  };

  const handleTestActiveKey = async () => {
    setTestingKey(true);
    try {
      const res = await saikaFetch('/ai-call/test-key', { method: 'POST', body: JSON.stringify({}) });
      if (res?.ok) {
        showNotice(res.message || `✅ প্রাইমারি API Key সচল আছে (${res.model})!`);
      } else {
        showNotice(res?.error || 'API Key টেস্ট ব্যর্থ হয়েছে।', 'err');
      }
    } finally {
      setTestingKey(false);
    }
  };

  const handleAddFaq = async () => {
    if (!faqQ.trim() || !faqA.trim()) return;
    setAddingFaq(true);
    try {
      const res = await saikaFetch('/admin/whatsapp/ai-faq', {
        method: 'POST',
        body: JSON.stringify({ question: faqQ.trim(), answer: faqA.trim() }),
      });
      if (res?.ok || res?.faqs) {
        setFaqQ('');
        setFaqA('');
        if (Array.isArray(res.faqs)) setFaqs(res.faqs);
        else loadAll(false);
        showNotice('✅ নতুন প্রশ্ন ও উত্তর সাইকার মেমোরিতে যুক্ত হয়েছে!');
      }
    } finally {
      setAddingFaq(false);
    }
  };

  const handleDeleteFaq = async (id: string) => {
    const res = await saikaFetch(`/admin/whatsapp/ai-faq/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (res?.ok || Array.isArray(res?.faqs)) {
      setFaqs((prev) => prev.filter((f) => f.id !== id));
      showNotice('🗑️ প্রশ্নোত্তর মুছে ফেলা হয়েছে।');
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
          <div className="fin-eyebrow">SAIKA EXECUTIVE AI · FULL CONTROL STUDIO</div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
              {config.hasApiKey ? `● Gemini Live (${config.keysCount} Key)` : '● Built-in Bangla Brain'}
            </span>
          </h1>
          <p>
            সাইকার API Key, লাইভ ভয়েস, ফ্লোটিং উইজেট, ওয়েবসাইট কল, হোয়াটসঅ্যাপ অটো-রিপ্লাই, কাস্টম ট্রেনিং ও স্টাফ পারমিশন—সবকিছু এক জায়গা থেকে নিয়ন্ত্রণ করুন।
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
            🎙️ লাইভ ভয়েস কল
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
            {config.assistantName} — ২৪/৭ পার্সোনাল বিজনেস চিফ অব স্টাফ ও কল সেন্টার এজেন্ট
          </strong>
          <span>
            মডেল: <b style={{ color: '#ddd6fe' }}>{config.preferredModel}</b> · লাইভ ভয়েস:{' '}
            <b style={{ color: '#ddd6fe' }}>{config.liveVoiceName}</b> · ফ্লোটিং বার:{' '}
            <b style={{ color: config.showFloatingOrb ? '#6ee7b7' : '#fca5a5' }}>
              {config.showFloatingOrb ? 'চালু আছে' : 'লুকানো আছে'}
            </b>{' '}
            · ওয়েবসাইট ভয়েস কল:{' '}
            <b style={{ color: config.websiteVoiceCallEnabled ? '#6ee7b7' : '#fca5a5' }}>
              {config.websiteVoiceCallEnabled ? 'চালু' : 'বন্ধ'}
            </b>{' '}
            · WhatsApp AI:{' '}
            <b style={{ color: config.whatsappAi.enabled ? '#6ee7b7' : '#fca5a5' }}>
              {config.whatsappAi.enabled ? 'চালু' : 'বন্ধ'}
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
                  next ? '✅ নিচের ফ্লোটিং সাইকা বার চালু করা হয়েছে!' : '✅ নিচের ফ্লোটিং সাইকা বার লুকানো হয়েছে!'
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

      {/* Sub-Navigation Bar matching Finance / Admin Tabs */}
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
                  <span>সক্রিয় Gemini API Keys</span>
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
                  {/* Instant Staff Directive Card */}
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

                  {/* Problems & Alerts Radar */}
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

                  {/* Quick Stock Restock */}
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
              TAB 2: API & MODEL SETUP (MULTI-KEY FAILOVER + MODEL PICKER)
             ===================================================================== */}
          {activeSection === 'api' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: 16 }}>
              <div className="fin-form-card" style={{ margin: 0 }}>
                <h3 style={{ fontSize: 15, marginBottom: 6 }}>🔑 নতুন Google Gemini API Key যুক্ত করুন</h3>
                <p className="fin-help" style={{ marginBottom: 14 }}>
                  একাধিক API Key যুক্ত করে রাখলে ১ নম্বর Key-এর কোটা বা লিমিট শেষ হওয়ার সাথে সাথে সাইকা স্বয়ংক্রিয়ভাবে ২ নম্বর ব্যাকআপ Key ব্যবহার করবে—কখনোই সার্ভিস বন্ধ হবে না।
                </p>

                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                  Gemini API Key পেস্ট করুন (AIzaSy...)
                </label>
                <input
                  type="password"
                  value={newApiKey}
                  onChange={(e) => setNewApiKey(e.target.value)}
                  placeholder="AIzaSy... এখানে পেস্ট করুন"
                  style={{ marginBottom: 12 }}
                />

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
                {/* Saved Keys Table */}
                <div className="fin-table-card" style={{ margin: 0 }}>
                  <div className="fin-card-title">
                    <h3>সংরক্ষিত API Keys ({config.maskedKeys.length}টি)</h3>
                    <span>Multi-Key Auto-Failover Pool</span>
                  </div>
                  <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {config.maskedKeys.length === 0 ? (
                      <div style={{ padding: 18, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                        কোনো API Key সেভ করা নেই। বাম পাশ থেকে আপনার Gemini API Key যুক্ত করুন।
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
                                {k.isPrimary ? 'Primary Active Key (সকল চ্যানেলে ব্যবহৃত)' : `Backup Key #${k.index + 1} (অটো-ফেইলওভার)`}
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

                {/* AI Model Selector */}
                <div className="fin-form-card" style={{ margin: 0 }}>
                  <h3 style={{ fontSize: 15, marginBottom: 12 }}>🤖 সাইকার AI Brain ও Model সিলেকশন</h3>
                  <div className="fin-form-grid" style={{ margin: 0 }}>
                    <label>
                      Text, Chat & WhatsApp Brain Model
                      <select
                        value={config.preferredModel}
                        onChange={(e) => saveConfigPatch({ preferredModel: e.target.value })}
                      >
                        <option value="gemini-2.5-flash">Gemini 2.5 Flash (Recommended · Fastest & Smartest)</option>
                        <option value="gemini-2.0-flash">Gemini 2.0 Flash (High Speed)</option>
                        <option value="gemini-1.5-flash">Gemini 1.5 Flash (Classic Stable)</option>
                      </select>
                    </label>
                    <label>
                      Real-Time Two-Way Voice Call Model
                      <select
                        value={config.liveVoiceModel}
                        onChange={(e) => saveConfigPatch({ liveVoiceModel: e.target.value })}
                      >
                        <option value="gemini-3.8-live">Gemini 3.8 Live Native Audio (Recommended)</option>
                      </select>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* =====================================================================
              TAB 3: VOICE & WIDGET STUDIO (FLOATING BAR TOGGLE + VOICE TUNING)
             ===================================================================== */}
          {activeSection === 'voice' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: 16 }}>
              {/* Left: Floating Widget & Alert Toggles */}
              <div className="fin-form-card" style={{ margin: 0 }}>
                <h3 style={{ fontSize: 15, marginBottom: 12 }}>✨ অ্যাডমিন প্যানেল ফ্লোটিং উইজেট ও ভয়েস অ্যালার্ট</h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[
                    {
                      title: 'নিচের ডানপাশের ফ্লোটিং Saika AI বার দেখান (Floating Orb)',
                      desc: 'বন্ধ করলে স্ক্রিনের নিচে ডানপাশের ভাসমান সাইকা বার লুকিয়ে থাকবে। আপনি তখনও উপরের "Ask Saika" বা এই পেজ থেকে সাইকা ব্যবহার করতে পারবেন।',
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
                      desc: 'নতুন অর্ডার এলে বা স্টক শেষ হলে সাইকা নিজে থেকে কণ্ঠে আপনাকে তাৎক্ষণিক জানাবে।',
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

              {/* Right: Voice Identity & Studio Test */}
              <div className="fin-form-card" style={{ margin: 0 }}>
                <h3 style={{ fontSize: 15, marginBottom: 12 }}>🎙️ কণ্ঠস্বর ও পরিচয় সেটআপ (Voice Persona)</h3>

                <div className="fin-form-grid" style={{ marginTop: 0 }}>
                  <label>
                    এআই সহকারীর নাম (Assistant Name)
                    <input
                      type="text"
                      value={config.assistantName}
                      onChange={(e) => setConfig({ ...config, assistantName: e.target.value })}
                      placeholder="Saika (সাইকা)"
                    />
                  </label>

                  <label>
                    লাইভ ফোন কল কণ্ঠস্বর (Gemini Live Voice)
                    <select
                      value={config.liveVoiceName}
                      onChange={(e) =>
                        saveConfigPatch({ liveVoiceName: e.target.value as SaikaControlConfig['liveVoiceName'] })
                      }
                    >
                      <option value="Aoede">Aoede — মিষ্টি ও স্বাভাবিক নারী কণ্ঠ (Recommended)</option>
                      <option value="Leda">Leda — প্রফেশনাল এক্সিকিউটিভ নারী কণ্ঠ</option>
                      <option value="Kore">Kore — স্পষ্ট ও স্মার্ট কল সেন্টার কণ্ঠ</option>
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
              TAB 4: CHANNEL CONTROLS (ADMIN, WEBSITE CALL, OUTBOUND, WHATSAPP, AUTOPILOT)
             ===================================================================== */}
          {activeSection === 'channels' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: 16 }}>
              {/* Voice Call & Boss Channels */}
              <div className="fin-form-card" style={{ margin: 0 }}>
                <h3 style={{ fontSize: 15, marginBottom: 12 }}>📞 ভয়েস কল ও অ্যাডমিন অটোমেশন চ্যানেল</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[
                    {
                      title: 'অ্যাডমিন প্যানেল বস অ্যাসিস্ট্যান্ট (Boss Executive AI)',
                      desc: 'অ্যাডমিন প্যানেলে বসের ভয়েস ও টেক্সট কমান্ডে অর্ডার, স্টক, স্টাফ ও রিপোর্ট নিয়ন্ত্রণ।',
                      checked: config.adminAssistantEnabled,
                      onChange: (v: boolean) => saveConfigPatch({ adminAssistantEnabled: v }),
                    },
                    {
                      title: 'ওয়েবসাইট ও ল্যান্ডিং পেজ লাইভ ভয়েস কল (Inbound AI Call)',
                      desc: 'কাস্টমাররা স্টোর বা ল্যান্ডিং পেজ থেকে সরাসরি সাইকার সাথে কথা বলে পণ্যের তথ্য জানতে পারবে।',
                      checked: config.websiteVoiceCallEnabled,
                      onChange: (v: boolean) => saveConfigPatch({ websiteVoiceCallEnabled: v }),
                    },
                    {
                      title: 'অর্ডার কনফার্মেশন আউটবাউন্ড AI কল',
                      desc: 'নতুন অর্ডারের ঠিকানা ও কনফার্মেশন যাচাই করতে সাইকার অটোমেটিক আউটবাউন্ড কল সুবিধা।',
                      checked: config.outboundConfirmCallEnabled,
                      onChange: (v: boolean) => saveConfigPatch({ outboundConfirmCallEnabled: v }),
                    },
                    {
                      title: 'AI মার্কেটিং ও অফার কল মোড',
                      desc: 'পুরাতন কাস্টমারদের বিশেষ অফার জানানোর জন্য মার্কেটিং ভয়েস কল মোড।',
                      checked: config.marketingCallEnabled,
                      onChange: (v: boolean) => saveConfigPatch({ marketingCallEnabled: v }),
                    },
                    {
                      title: '২৪/৭ স্টাফ অটো-গার্ডিয়ান (Autopilot Supervision)',
                      desc: 'বসের অনুপস্থিতিতে প্রতি ১৫ মিনিটে পেন্ডিং অর্ডার চেক করে অনলাইন স্টাফদের স্বয়ংক্রিয়ভাবে তাগিদ দেবে।',
                      checked: config.autopilotEnabled,
                      onChange: (v: boolean) => saveConfigPatch({ autopilotEnabled: v }),
                    },
                    {
                      title: 'রাতের নীরব সময় (Night Quiet Hours — BD Time)',
                      desc: `রাত ${config.quietStartHour}:০০ থেকে সকাল ${config.quietEndHour}:০০ পর্যন্ত অটোমেটিক আউটবাউন্ড কল বন্ধ থাকবে।`,
                      checked: config.quietHoursEnabled,
                      onChange: (v: boolean) => saveConfigPatch({ quietHoursEnabled: v }),
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

              {/* WhatsApp Smart AI Controls */}
              <div className="fin-form-card" style={{ margin: 0 }}>
                <h3 style={{ fontSize: 15, marginBottom: 12 }}>💬 WhatsApp Smart AI চ্যানেল কন্ট্রোল</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
                  {[
                    {
                      title: 'WhatsApp Smart AI অটো-রিপ্লাই',
                      desc: 'হোয়াটসঅ্যাপে কাস্টমার মেসেজ দিলে সাইকা পণ্যের দাম, স্টক ও ডেলিভারি তথ্যসহ স্মার্ট রিপ্লাই দেবে।',
                      checked: config.whatsappAi.enabled,
                      onChange: (v: boolean) =>
                        saveConfigPatch({ whatsappAi: { ...config.whatsappAi, enabled: v } }),
                    },
                    {
                      title: 'ভয়েস নোট (Audio Message) বোঝার ক্ষমতা',
                      desc: 'কাস্টমার ভয়েস মেসেজ পাঠালে সাইকা সেটি শুনে বাংলায় সঠিক উত্তর দেবে।',
                      checked: config.whatsappAi.voiceNoteEnabled,
                      onChange: (v: boolean) =>
                        saveConfigPatch({ whatsappAi: { ...config.whatsappAi, voiceNoteEnabled: v } }),
                    },
                    {
                      title: 'লাইভ অর্ডার ট্র্যাকিং রিপ্লাই',
                      desc: 'কাস্টমার অর্ডারের খবর জানতে চাইলে ডাটাবেস চেক করে বর্তমান কুরিয়ার স্ট্যাটাস জানাবে।',
                      checked: config.whatsappAi.orderTrackEnabled,
                      onChange: (v: boolean) =>
                        saveConfigPatch({ whatsappAi: { ...config.whatsappAi, orderTrackEnabled: v } }),
                    },
                    {
                      title: 'চ্যাট থেকে অটো অর্ডার তৈরি (Chat-to-Order)',
                      desc: 'কাস্টমার নাম, ফোন ও ঠিকানা দিলে সাইকা সরাসরি নতুন অর্ডার এন্ট্রি করে নেবে।',
                      checked: config.whatsappAi.chatToOrderEnabled,
                      onChange: (v: boolean) =>
                        saveConfigPatch({ whatsappAi: { ...config.whatsappAi, chatToOrderEnabled: v } }),
                    },
                  ].map((w, idx) => (
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
                        <div style={{ fontSize: 13.5, fontWeight: 700, color: '#f8fafc' }}>{w.title}</div>
                        <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 2 }}>{w.desc}</div>
                      </div>
                      <PillSwitch checked={w.checked} onChange={w.onChange} />
                    </div>
                  ))}
                </div>

                <div className="fin-form-grid" style={{ margin: 0 }}>
                  <label>
                    হোয়াটসঅ্যাপ কথা বলার ধরন (AI Tone)
                    <select
                      value={config.whatsappAi.tone}
                      onChange={(e) =>
                        saveConfigPatch({ whatsappAi: { ...config.whatsappAi, tone: e.target.value } })
                      }
                    >
                      <option value="friendly_bangla">আন্তরিক ও ভদ্র বাংলা (Recommended)</option>
                      <option value="formal_bangla">ফরমাল প্রফেশনাল বাংলা</option>
                      <option value="banglish">বাংলা + English (Banglish)</option>
                    </select>
                  </label>
                  <label>
                    হিউম্যান রিপ্লাই দিলে AI বিরতি (মিনিট)
                    <input
                      type="number"
                      min={5}
                      max={240}
                      value={config.whatsappAi.pauseMinutes}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          whatsappAi: { ...config.whatsappAi, pauseMinutes: Number(e.target.value) || 30 },
                        })
                      }
                      onBlur={() => saveConfigPatch({ whatsappAi: config.whatsappAi })}
                    />
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* =====================================================================
              TAB 5: KNOWLEDGE & TRAINING (CUSTOM PROMPTS + FAQ MANAGER)
             ===================================================================== */}
          {activeSection === 'knowledge' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="fin-note">
                <b>🔄 লাইভ ডাটাবেস সিঙ্ক সক্রিয়:</b>
                <span>
                  সাইকা আপনার স্টোরের <b>{storeSummary.productsCount}টি ক্যাটালগ প্রোডাক্ট</b> এবং{' '}
                  <b>{storeSummary.landingsCount}টি লাইভ ল্যান্ডিং পেজের</b> দাম, প্যাকেজ ও ডেলিভারি চার্জ স্বয়ংক্রিয়ভাবে মুখস্থ রাখে। নিচে আপনার বিশেষ নিয়ম ও প্রশ্নোত্তর যুক্ত করতে পারবেন।
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: 16 }}>
                {/* Custom Prompts */}
                <div className="fin-form-card" style={{ margin: 0 }}>
                  <h3 style={{ fontSize: 15, marginBottom: 12 }}>📜 কাস্টম নির্দেশনা ও পার্সোনা রুলস</h3>

                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                    ১. বসের জন্য বিশেষ নির্দেশনা (Boss Executive Rules)
                  </label>
                  <textarea
                    rows={4}
                    value={config.bossCustomInstructions}
                    onChange={(e) => setConfig({ ...config, bossCustomInstructions: e.target.value })}
                    placeholder="যেমন: সর্বদা সংক্ষেপে পয়েন্ট আকারে রিপোর্ট দেবে এবং কোনো প্রোডাক্টের স্টক ২০-এর নিচে নামলেই সতর্ক করবে..."
                    style={{ marginBottom: 14 }}
                  />

                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                    ২. কাস্টমার ভয়েস কলের বিশেষ নিয়ম (Website & Phone Call Persona)
                  </label>
                  <textarea
                    rows={4}
                    value={config.customerCallInstructions}
                    onChange={(e) => setConfig({ ...config, customerCallInstructions: e.target.value })}
                    placeholder="যেমন: ১০০% গোপন ও সুরক্ষিত প্যাকেজিংয়ের কথা বলবে, ঢাকার ভেতরে ডেলিভারি চার্জ ৮০ টাকা এবং বাইরে ১৩০ টাকা..."
                    style={{ marginBottom: 14 }}
                  />

                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                    ৩. হোয়াটসঅ্যাপ স্টোর পলিসি ও ডেলিভারি তথ্য
                  </label>
                  <textarea
                    rows={3}
                    value={config.whatsappAi.storeInfo}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        whatsappAi: { ...config.whatsappAi, storeInfo: e.target.value },
                      })
                    }
                    placeholder="রিটার্ন পলিসি, ডেলিভারি সময় (ঢাকায় ২৪ ঘণ্টা, ঢাকার বাইরে ২-৩ দিন), ক্যাশ অন ডেলিভারি নিয়ম..."
                    style={{ marginBottom: 14 }}
                  />

                  <button
                    type="button"
                    className="sa-btn"
                    disabled={saving}
                    onClick={() =>
                      saveConfigPatch({
                        bossCustomInstructions: config.bossCustomInstructions,
                        customerCallInstructions: config.customerCallInstructions,
                        whatsappAi: config.whatsappAi,
                      })
                    }
                  >
                    {saving ? 'সেভ হচ্ছে...' : '💾 কাস্টম ট্রেনিং সেভ করুন'}
                  </button>
                </div>

                {/* FAQ Knowledge Manager */}
                <div className="fin-form-card" style={{ margin: 0 }}>
                  <h3 style={{ fontSize: 15, marginBottom: 12 }}>🧠 প্রশ্ন ও উত্তর ট্রেনিং ব্যাংক (Q&A Memory)</h3>

                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#cbd5e1', marginBottom: 5 }}>
                    কাস্টমারের সাধারণ প্রশ্ন
                  </label>
                  <input
                    type="text"
                    value={faqQ}
                    onChange={(e) => setFaqQ(e.target.value)}
                    placeholder="যেমন: প্রোডাক্ট কি অরিজিনাল? কোনো পার্শ্বপ্রতিক্রিয়া আছে?"
                    style={{ marginBottom: 10 }}
                  />

                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#cbd5e1', marginBottom: 5 }}>
                    সাইকার আদর্শ উত্তর
                  </label>
                  <textarea
                    rows={3}
                    value={faqA}
                    onChange={(e) => setFaqA(e.target.value)}
                    placeholder="যেমন: জি স্যার, আমাদের প্রোডাক্ট ১০০% অরিজিনাল ও পরীক্ষিত..."
                    style={{ marginBottom: 10 }}
                  />

                  <button
                    type="button"
                    className="sa-btn"
                    disabled={addingFaq || !faqQ.trim() || !faqA.trim()}
                    onClick={handleAddFaq}
                    style={{ marginBottom: 16 }}
                  >
                    {addingFaq ? 'যুক্ত হচ্ছে...' : '➕ মেমোরিতে যুক্ত করুন'}
                  </button>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 300, overflowY: 'auto' }}>
                    {faqs.length === 0 ? (
                      <div style={{ fontSize: 12.5, color: '#94a3b8', padding: '12px 0' }}>
                        এখনো কোনো কাস্টম FAQ যুক্ত করা হয়নি।
                      </div>
                    ) : (
                      faqs.map((f) => (
                        <div
                          key={f.id}
                          style={{
                            padding: '10px 12px',
                            borderRadius: 10,
                            background: '#100f18',
                            border: '1px solid rgba(255,255,255,0.07)',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                            <strong style={{ fontSize: 13, color: '#e9d5ff' }}>প্রশ্ন: {f.question}</strong>
                            <button
                              type="button"
                              className="fin-text-btn"
                              style={{ color: '#fca5a5', borderColor: 'rgba(248,113,113,0.3)' }}
                              onClick={() => handleDeleteFaq(f.id)}
                            >
                              মুছুন
                            </button>
                          </div>
                          <div style={{ fontSize: 12.5, color: '#cbd5e1', marginTop: 4 }}>উত্তর: {f.answer}</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* =====================================================================
              TAB 6: STAFF ACCESS & LOGS (PERMISSIONS + CALL & DIRECTIVE HISTORY)
             ===================================================================== */}
          {activeSection === 'access' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Staff Permission Table */}
              <div className="fin-table-card" style={{ margin: 0 }}>
                <div className="fin-card-title">
                  <h3>🛡️ স্টাফ ও ম্যানেজার Saika AI অ্যাক্সেস কন্ট্রোল</h3>
                  <span>কে কে অ্যাডমিন প্যানেলে সাইকা ব্যবহার করতে পারবে তা নির্ধারণ করুন</span>
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

              {/* Recent AI Voice Calls & Recordings */}
              <div className="fin-table-card" style={{ margin: 0 }}>
                <div className="fin-card-title">
                  <h3>📞 সাম্প্রতিক সাইকা লাইভ ভয়েস কল ও রেকর্ডিং ({callLogs.length})</h3>
                  <span>Website Inbound, Confirmation & Executive Calls</span>
                </div>
                <div className="fin-table-scroll">
                  <table className="fin-table">
                    <thead>
                      <tr>
                        <th>সময়</th>
                        <th>কাস্টমার / কলার</th>
                        <th>সময়কাল ও ফলাফল</th>
                        <th>সারসংক্ষেপ</th>
                        <th>কল রেকর্ডিং</th>
                      </tr>
                    </thead>
                    <tbody>
                      {callLogs.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="fin-empty">
                            এখনো কোনো এআই ভয়েস কল রেকর্ড হয়নি।
                          </td>
                        </tr>
                      ) : (
                        callLogs.map((c: any) => (
                          <tr key={c.id}>
                            <td style={{ whiteSpace: 'nowrap' }}>
                              {c.createdAt ? new Date(c.createdAt).toLocaleString('bn-BD') : '—'}
                            </td>
                            <td>
                              <b>{c.customerName || 'Visitor'}</b>
                              <small>{c.customerPhone || 'Browser Voice'}</small>
                            </td>
                            <td>
                              <b>{c.duration || 0}s</b>
                              <small>{c.outcome || 'completed'}</small>
                            </td>
                            <td style={{ maxWidth: 320 }}>
                              <span style={{ fontSize: 12 }}>{c.notes || 'AI Voice Session'}</span>
                            </td>
                            <td>
                              {c.recordingUrl ? (
                                <audio controls preload="none" src={c.recordingUrl} style={{ height: 30, width: 190 }} />
                              ) : (
                                <span style={{ color: '#64748b', fontSize: 11.5 }}>রেকর্ডিং নেই</span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Recent Directives Log */}
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
