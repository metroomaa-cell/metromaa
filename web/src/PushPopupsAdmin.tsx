import { useEffect, useState } from 'react';
import { getDeviceId } from './api';
import {
  isWebPushSupported,
  subscribeBrowserToPush,
  type PromoPopupConfig,
  type PushPromptConfig,
  type TrustToastConfig,
} from './NotificationWidgets';

const ADMIN_TOKEN_KEY = 'dot_admin';

async function adminApi(path: string, opts: RequestInit = {}) {
  const tok = localStorage.getItem(ADMIN_TOKEN_KEY) || '';
  const res = await fetch('/api' + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'x-admin-token': tok,
      ...(opts.headers || {}),
    },
  });
  if (res.status === 401) {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    window.dispatchEvent(new Event('admin-logout'));
  }
  return res;
}

async function compressBannerImageToDataUrl(file: File, maxDim = 1280, quality = 0.84): Promise<string> {
  const isSvg = file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg');
  if (isSvg) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result || ''));
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        let w = img.naturalWidth || img.width;
        let h = img.naturalHeight || img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, w);
        canvas.height = Math.max(1, h);
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas context unavailable'));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/webp', quality));
      };
      img.onerror = () => reject(new Error('ছবিটি পড়া যায়নি'));
      img.src = String(ev.target?.result || '');
    };
    reader.onerror = () => reject(new Error('ফাইল পড়া যায়নি'));
    reader.readAsDataURL(file);
  });
}

async function uploadAdminImage(file: File, maxDim = 1280): Promise<string> {
  const dataUrl = await compressBannerImageToDataUrl(file, maxDim, 0.85);
  const res = await adminApi('/upload', {
    method: 'POST',
    body: JSON.stringify({ dataUrl }),
  });
  const data = await res.json();
  if (!res.ok || !data.url) {
    throw new Error(data.error || 'Image upload failed');
  }
  return data.url as string;
}

type BroadcastEntry = {
  id: string;
  at: string;
  title: string;
  body: string;
  image?: string;
  url: string;
  target: 'all' | 'admin_test';
  sent: number;
  failed: number;
  totalTargets: number;
};

export function PushPopupsAdmin() {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'promo' | 'broadcast' | 'prompt' | 'trust'>('promo');
  const [vapidPublicKey, setVapidPublicKey] = useState('');
  const [stats, setStats] = useState({ total: 0, customers: 0, admins: 0 });

  const [promoPopup, setPromoPopup] = useState<PromoPopupConfig>({
    enabled: false,
    mode: 'image_text',
    image: '',
    badge: 'SPECIAL OFFER ✨',
    title: 'Welcome to METRROMA',
    description: 'আপনার প্রথম অর্ডারে স্পেশাল ডিসকাউন্ট উপভোগ করুন। ১০০% গোপনীয় প্যাকিংয়ে সারা দেশে ক্যাশ অন ডেলিভারি।',
    couponCode: '',
    buttonText: 'অফার দেখুন',
    buttonLink: '/shop',
    targetPages: 'all',
    delaySeconds: 6,
    frequency: 'once_per_day',
    campaignId: 'camp_v1',
  });

  const [pushPrompt, setPushPrompt] = useState<PushPromptConfig>({
    enabled: true,
    title: 'স্পেশাল অফার ও ডেলিভারি আপডেট পান 🔔',
    description: 'নতুন কালেকশন, সিক্রেট ডিসকাউন্ট ও অর্ডার আপডেট সবার আগে পেতে Allow করুন।',
    allowText: 'Allow করুন',
    dismissText: 'পরে',
    icon: '',
    delaySeconds: 12,
  });

  const [autoAlerts, setAutoAlerts] = useState({
    adminNewOrder: true,
    customerOrderStatus: true,
  });

  const [trustToast, setTrustToast] = useState<TrustToastConfig>({
    enabled: true,
    targetPages: 'wellness',
    icon: '',
    title: '🔒 ১০০% গোপনীয় প্যাকিং গ্যারান্টি',
    message: 'প্যাকেটের গায়ে কোনো পণ্যের নাম বা ছবি লেখা থাকে না। ডেলিভারিম্যানও জানবে না ভেতরে কী আছে।',
    delaySeconds: 4,
  });

  const [history, setHistory] = useState<BroadcastEntry[]>([]);
  const [resetPromoDismissals, setResetPromoDismissals] = useState(true);

  // Broadcast composer state
  const [bcTitle, setBcTitle] = useState('✨ METRROMA স্পেশাল অফার!');
  const [bcBody, setBcBody] = useState('আজকের অর্ডারে পাচ্ছেন বিশেষ ছাড় ও ১০০% গোপনীয় হোম ডেলিভারি। এখনই ভিজিট করুন!');
  const [bcImage, setBcImage] = useState('');
  const [bcUrl, setBcUrl] = useState('/shop');
  const [bcBusy, setBcBusy] = useState(false);

  // Admin device subscription state
  const [adminSubBusy, setAdminSubBusy] = useState(false);
  const [myEndpoint, setMyEndpoint] = useState(() => localStorage.getItem('secrate_admin_push_ep') || '');

  // Status / upload feedbacks
  const [saving, setSaving] = useState(false);
  const [uploadingField, setUploadingField] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const showNotice = (type: 'ok' | 'err', text: string) => {
    setNotice({ type, text });
    window.setTimeout(() => {
      setNotice((cur) => (cur?.text === text ? null : cur));
    }, 5000);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await adminApi('/admin/notifications');
      const d = await res.json();
      if (res.ok && d) {
        setVapidPublicKey(d.vapidPublicKey || '');
        if (d.stats) setStats(d.stats);
        if (d.settings?.promoPopup) setPromoPopup((prev) => ({ ...prev, ...d.settings.promoPopup }));
        if (d.settings?.pushPrompt) setPushPrompt((prev) => ({ ...prev, ...d.settings.pushPrompt }));
        if (d.settings?.autoAlerts) setAutoAlerts((prev) => ({ ...prev, ...d.settings.autoAlerts }));
        if (d.settings?.trustToast) setTrustToast((prev) => ({ ...prev, ...d.settings.trustToast }));
        if (Array.isArray(d.settings?.broadcastHistory)) setHistory(d.settings.broadcastHistory);
      }
    } catch {
      showNotice('err', 'নোটিফিকেশন সেটিংস লোড করা যায়নি।');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const saveAllSettings = async () => {
    setSaving(true);
    try {
      const res = await adminApi('/admin/notifications', {
        method: 'PUT',
        body: JSON.stringify({
          promoPopup,
          pushPrompt,
          autoAlerts,
          trustToast,
          resetPromoDismissals,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Save failed');
      if (d.settings?.promoPopup) setPromoPopup(d.settings.promoPopup);
      if (d.stats) setStats(d.stats);
      showNotice('ok', '✅ সকল পপ-আপ ও পুশ সেটিংস সফলভাবে সেভ হয়েছে!');
    } catch (err: any) {
      showNotice('err', err?.message || 'সেটিংস সেভ করা যায়নি');
    } finally {
      setSaving(false);
    }
  };

  const handleImagePick = async (
    field: 'promo' | 'broadcast' | 'prompt' | 'trust',
    file?: File | null
  ) => {
    if (!file) return;
    setUploadingField(field);
    try {
      const maxDim = field === 'prompt' || field === 'trust' ? 512 : 1280;
      const url = await uploadAdminImage(file, maxDim);
      if (field === 'promo') setPromoPopup((s) => ({ ...s, image: url }));
      else if (field === 'broadcast') setBcImage(url);
      else if (field === 'prompt') setPushPrompt((s) => ({ ...s, icon: url }));
      else if (field === 'trust') setTrustToast((s) => ({ ...s, icon: url }));
      showNotice('ok', '📷 ছবি সফলভাবে আপলোড হয়েছে!');
    } catch (err: any) {
      showNotice('err', err?.message || 'ছবি আপলোড ব্যর্থ হয়েছে');
    } finally {
      setUploadingField(null);
    }
  };

  const enableAdminAlertsOnThisDevice = async () => {
    if (!vapidPublicKey) {
      showNotice('err', 'VAPID Key প্রস্তুত নয়, পেজটি রিলোড করুন।');
      return;
    }
    setAdminSubBusy(true);
    try {
      const { subscription, endpoint } = await subscribeBrowserToPush(vapidPublicKey);
      const res = await adminApi('/admin/push/subscribe-admin', {
        method: 'POST',
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          deviceId: getDeviceId(),
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed to subscribe admin device');
      localStorage.setItem('secrate_admin_push_ep', endpoint);
      setMyEndpoint(endpoint);
      if (d.stats) setStats(d.stats);
      showNotice('ok', '🔔 এই ডিভাইসে নতুন অর্ডার অ্যালার্ট ও টেস্ট নোটিফিকেশন চালু হয়েছে!');
    } catch (err: any) {
      showNotice('err', err?.message || 'অ্যাডমিন নোটিফিকেশন চালু করা যায়নি');
    } finally {
      setAdminSubBusy(false);
    }
  };

  const sendBroadcast = async (target: 'all' | 'admin_test') => {
    if (!bcTitle.trim() || !bcBody.trim()) {
      showNotice('err', 'নোটিফিকেশনের Title এবং Message লিখুন।');
      return;
    }
    if (target === 'all' && stats.total === 0) {
      showNotice('err', 'এখনো কোনো সাবস্ক্রাইবার নেই। আগে "আমার ডিভাইসে চালু করুন" বাটনে ক্লিক করে টেস্ট করতে পারেন।');
      return;
    }
    setBcBusy(true);
    try {
      let currentEp = myEndpoint;
      if (target === 'admin_test' && !currentEp && stats.admins === 0 && vapidPublicKey && isWebPushSupported()) {
        // Auto-subscribe current admin browser if testing for the first time
        const { subscription, endpoint } = await subscribeBrowserToPush(vapidPublicKey);
        await adminApi('/admin/push/subscribe-admin', {
          method: 'POST',
          body: JSON.stringify({ subscription: subscription.toJSON(), deviceId: getDeviceId() }),
        });
        localStorage.setItem('secrate_admin_push_ep', endpoint);
        setMyEndpoint(endpoint);
        currentEp = endpoint;
      }

      const res = await adminApi('/admin/push/broadcast', {
        method: 'POST',
        body: JSON.stringify({
          title: bcTitle,
          body: bcBody,
          image: bcImage,
          url: bcUrl || '/',
          target,
          adminEndpoint: currentEp,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Broadcast failed');
      if (d.stats) setStats(d.stats);
      if (Array.isArray(d.broadcastHistory)) setHistory(d.broadcastHistory);
      showNotice(
        'ok',
        target === 'admin_test'
          ? `✅ টেস্ট নোটিফিকেশন পাঠানো হয়েছে (${d.sent}টি অ্যাডমিন ডিভাইসে)!`
          : `🚀 ব্রডকাস্ট সম্পন্ন! সফলভাবে ${d.sent} জন সাবস্ক্রাইবারের কাছে পাঠানো হয়েছে।`
      );
    } catch (err: any) {
      showNotice('err', err?.message || 'নোটিফিকেশন পাঠানো যায়নি');
    } finally {
      setBcBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="sa-card" style={{ padding: 36, textAlign: 'center', color: '#94a3b8' }}>
        Push &amp; Pop-up সিস্টেম লোড হচ্ছে…
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Header + Top KPI Stats */}
      <div className="sa-card" style={{ padding: '20px 22px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 14 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>🔔</span> Push Notifications &amp; Smart Pop-ups
            </h2>
            <p className="dim" style={{ margin: '4px 0 0', fontSize: 13 }}>
              নিজস্ব ফ্রি Web Push ব্রডকাস্ট, ছবি ও লেখাসহ অফার পপ-আপ এবং গোপনীয় অর্ডার অ্যালার্ট কন্ট্রোল প্যানেল।
            </p>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <button
              type="button"
              className="sa-btn ghost"
              disabled={adminSubBusy}
              onClick={enableAdminAlertsOnThisDevice}
              style={{
                borderColor: myEndpoint ? 'rgba(74, 222, 128, 0.45)' : 'rgba(234, 179, 8, 0.45)',
                color: myEndpoint ? '#4ade80' : '#fde047',
              }}
            >
              {adminSubBusy
                ? 'চালু হচ্ছে…'
                : myEndpoint
                ? '✅ এই ডিভাইসে অ্যাডমিন অ্যালার্ট চালু আছে (Refresh)'
                : '📲 এই ফোনে/পিসিতে অর্ডার অ্যালার্ট চালু করুন'}
            </button>

            <button type="button" className="sa-btn" disabled={saving} onClick={saveAllSettings}>
              {saving ? 'সেভ হচ্ছে…' : '💾 Save All Settings'}
            </button>
          </div>
        </div>

        {/* Subscriber Counters */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
            gap: 12,
            marginTop: 18,
          }}
        >
          <div style={{ padding: '12px 16px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="dim" style={{ fontSize: 12 }}>মোট Push Subscribers</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#fff', marginTop: 2 }}>{stats.total}</div>
          </div>
          <div style={{ padding: '12px 16px', borderRadius: 12, background: 'rgba(56, 189, 248, 0.06)', border: '1px solid rgba(56, 189, 248, 0.18)' }}>
            <div style={{ fontSize: 12, color: '#7dd3fc' }}>কাস্টমার ডিভাইস</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#38bdf8', marginTop: 2 }}>{stats.customers}</div>
          </div>
          <div style={{ padding: '12px 16px', borderRadius: 12, background: 'rgba(168, 85, 247, 0.08)', border: '1px solid rgba(168, 85, 247, 0.22)' }}>
            <div style={{ fontSize: 12, color: '#d8b4fe' }}>অ্যাডমিন ডিভাইস</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#c084fc', marginTop: 2 }}>{stats.admins}</div>
          </div>
          <div style={{ padding: '12px 16px', borderRadius: 12, background: promoPopup.enabled ? 'rgba(34, 197, 94, 0.08)' : 'rgba(255,255,255,0.03)', border: promoPopup.enabled ? '1px solid rgba(34, 197, 94, 0.25)' : '1px solid rgba(255,255,255,0.07)' }}>
            <div className="dim" style={{ fontSize: 12 }}>অন-সাইট অফার পপ-আপ</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: promoPopup.enabled ? '#4ade80' : '#94a3b8', marginTop: 6 }}>
              {promoPopup.enabled ? '🟢 Active (চালু আছে)' : '⚪ Off (বন্ধ আছে)'}
            </div>
          </div>
        </div>

        {notice && (
          <div
            style={{
              marginTop: 14,
              padding: '11px 15px',
              borderRadius: 10,
              fontSize: 13.5,
              fontWeight: 500,
              background: notice.type === 'ok' ? 'rgba(34, 197, 94, 0.14)' : 'rgba(239, 68, 68, 0.16)',
              border: notice.type === 'ok' ? '1px solid rgba(34, 197, 94, 0.35)' : '1px solid rgba(239, 68, 68, 0.35)',
              color: notice.type === 'ok' ? '#86efac' : '#fca5a5',
            }}
          >
            {notice.text}
          </div>
        )}
      </div>

      {/* Sub-navigation Tabs */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {[
          { id: 'promo', label: '🖼️ ১. প্রমো পপ-আপ (ছবি + লেখা)' },
          { id: 'broadcast', label: '🚀 ২. পুশ মেসেজ পাঠান (Broadcast)' },
          { id: 'prompt', label: '🔔 ৩. সাবস্ক্রাইব বাটন ও অটো-অ্যালার্ট' },
          { id: 'trust', label: '🔒 ৪. ওয়েলনেস প্রাইভেসি পপ-আপ' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id as any)}
            className={`sa-btn ${activeTab === t.id ? '' : 'ghost'}`}
            style={{ padding: '9px 16px', fontSize: 13 }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* =====================================================================
          TAB 1: PROMO POP-UP BUILDER (IMAGE + TEXT + COUPON + LIVE PREVIEW)
      ===================================================================== */}
      {activeTab === 'promo' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: 18,
            alignItems: 'start',
          }}
        >
          <div className="sa-card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 16, color: '#fff' }}>🖼️ অন-সাইট প্রমো পপ-আপ সেটআপ</h3>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 600, color: promoPopup.enabled ? '#4ade80' : '#cbd5e1' }}>
                <input
                  type="checkbox"
                  checked={promoPopup.enabled}
                  onChange={(e) => setPromoPopup((s) => ({ ...s, enabled: e.target.checked }))}
                />
                <span>{promoPopup.enabled ? 'চালু (ON)' : 'বন্ধ (OFF)'}</span>
              </label>
            </div>

            {/* Layout Mode */}
            <div>
              <div style={{ fontSize: 12.5, color: '#cbd5e1', marginBottom: 6 }}>পপ-আপ ডিজাইন মোড</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <button
                  type="button"
                  className={`sa-btn ${promoPopup.mode === 'image_text' ? '' : 'ghost'}`}
                  onClick={() => setPromoPopup((s) => ({ ...s, mode: 'image_text' }))}
                >
                  🖼️ + ✍️ ছবি ও লেখা কার্ড
                </button>
                <button
                  type="button"
                  className={`sa-btn ${promoPopup.mode === 'image_only' ? '' : 'ghost'}`}
                  onClick={() => setPromoPopup((s) => ({ ...s, mode: 'image_only' }))}
                >
                  🖼️ শুধু ফুল পোস্টার ছবি
                </button>
              </div>
            </div>

            {/* Banner Image Upload */}
            <div style={{ padding: 12, borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ fontSize: 12.5, color: '#cbd5e1', marginBottom: 8 }}>পপ-আপের ছবি (Picture / Offer Banner)</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <label className="sa-btn ghost" style={{ cursor: 'pointer', margin: 0 }}>
                  {uploadingField === 'promo' ? 'আপলোড হচ্ছে…' : '📷 ছবি আপলোড করুন'}
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => handleImagePick('promo', e.target.files?.[0])}
                  />
                </label>
                {promoPopup.image && (
                  <button
                    type="button"
                    className="sa-btn ghost"
                    style={{ color: '#f87171' }}
                    onClick={() => setPromoPopup((s) => ({ ...s, image: '' }))}
                  >
                    ✕ ছবি মুছুন
                  </button>
                )}
              </div>
              <input
                style={{ marginTop: 8, width: '100%' }}
                placeholder="অথবা সরাসরি ছবির লিংক দিন (/uploads/...)"
                value={promoPopup.image}
                onChange={(e) => setPromoPopup((s) => ({ ...s, image: e.target.value }))}
              />
            </div>

            {promoPopup.mode === 'image_text' && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12.5, color: '#cbd5e1' }}>
                    ছোট ব্যাজ (উপরে)
                    <input
                      value={promoPopup.badge || ''}
                      onChange={(e) => setPromoPopup((s) => ({ ...s, badge: e.target.value }))}
                      placeholder="SPECIAL OFFER ✨"
                    />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12.5, color: '#cbd5e1' }}>
                    কুপন কোড (ঐচ্ছিক - 1 Click Copy)
                    <input
                      value={promoPopup.couponCode}
                      onChange={(e) => setPromoPopup((s) => ({ ...s, couponCode: e.target.value.toUpperCase() }))}
                      placeholder="যেমন: WELCOME5"
                    />
                  </label>
                </div>

                <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12.5, color: '#cbd5e1' }}>
                  পপ-আপ শিরোনাম (Title লেখা)
                  <input
                    value={promoPopup.title}
                    onChange={(e) => setPromoPopup((s) => ({ ...s, title: e.target.value }))}
                    placeholder="যেমন: ঈদ স্পেশাল ২০% ছাড়!"
                  />
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12.5, color: '#cbd5e1' }}>
                  বিস্তারিত লেখা (Description)
                  <textarea
                    rows={3}
                    value={promoPopup.description}
                    onChange={(e) => setPromoPopup((s) => ({ ...s, description: e.target.value }))}
                    placeholder="আপনার অফার সম্পর্কে বিস্তারিত লিখুন..."
                  />
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12.5, color: '#cbd5e1' }}>
                  বাটনের লেখা (Button Text)
                  <input
                    value={promoPopup.buttonText}
                    onChange={(e) => setPromoPopup((s) => ({ ...s, buttonText: e.target.value }))}
                    placeholder="অফার দেখুন"
                  />
                </label>
              </>
            )}

            <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12.5, color: '#cbd5e1' }}>
              ক্লিক করলে কোন পেজে যাবে? (Target Link)
              <input
                value={promoPopup.buttonLink}
                onChange={(e) => setPromoPopup((s) => ({ ...s, buttonLink: e.target.value }))}
                placeholder="/shop অথবা /shop/wellness-corner"
              />
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12.5, color: '#cbd5e1' }}>
                কোন পেজে দেখাবে?
                <select
                  value={promoPopup.targetPages}
                  onChange={(e) => setPromoPopup((s) => ({ ...s, targetPages: e.target.value as any }))}
                >
                  <option value="all">সব পেজে (All Pages)</option>
                  <option value="home">শুধু হোম পেজে</option>
                  <option value="wellness">শুধু Wellness পেজে</option>
                </select>
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12.5, color: '#cbd5e1' }}>
                কত সেকেন্ড পর আসবে?
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={promoPopup.delaySeconds}
                  onChange={(e) => setPromoPopup((s) => ({ ...s, delaySeconds: Math.max(1, Number(e.target.value) || 6) }))}
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12.5, color: '#cbd5e1' }}>
                কতবার দেখাবে?
                <select
                  value={promoPopup.frequency}
                  onChange={(e) => setPromoPopup((s) => ({ ...s, frequency: e.target.value as any }))}
                >
                  <option value="once_per_day">দিনে ১ বার</option>
                  <option value="once_per_session">প্রতি ভিজিটে ১ বার</option>
                  <option value="always">প্রতিবার (টেস্টিং)</option>
                </select>
              </label>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: '#cbd5e1', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={resetPromoDismissals}
                onChange={(e) => setResetPromoDismissals(e.target.checked)}
              />
              <span>সেভ করার পর নতুন ক্যাম্পেইন হিসেবে সকল ভিজিটরকে আবার দেখান</span>
            </label>

            <button type="button" className="sa-btn" disabled={saving} onClick={saveAllSettings}>
              {saving ? 'সেভ হচ্ছে…' : '💾 প্রমো পপ-আপ সেভ করুন'}
            </button>
          </div>

          {/* LIVE PREVIEW PANEL */}
          <div className="sa-card" style={{ padding: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 12 }}>
              📱 লাইভ প্রিভিউ (কাস্টমার যেভাবে দেখবে)
            </div>
            <div
              style={{
                background: 'linear-gradient(145deg, #1e293b 0%, #0f172a 100%)',
                borderRadius: 16,
                padding: 22,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 380,
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              {promoPopup.mode === 'image_only' ? (
                promoPopup.image ? (
                  <div style={{ position: 'relative', maxWidth: 340, width: '100%', borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(180,142,76,0.4)' }}>
                    <span style={{ position: 'absolute', top: 10, right: 10, width: 28, height: 28, borderRadius: '50%', background: 'rgba(0,0,0,0.6)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>✕</span>
                    <img src={promoPopup.image} alt="Preview" style={{ width: '100%', display: 'block', objectFit: 'cover' }} />
                  </div>
                ) : (
                  <div className="dim" style={{ textAlign: 'center', padding: 30 }}>
                    📷 ফুল পোস্টার মোডের জন্য বাম পাশ থেকে একটি ছবি আপলোড করুন।
                  </div>
                )
              ) : (
                <div
                  style={{
                    width: '100%',
                    maxWidth: 350,
                    borderRadius: 18,
                    overflow: 'hidden',
                    background: '#FAF8F5',
                    color: '#1f3147',
                    border: '1px solid rgba(180,142,76,0.4)',
                    boxShadow: '0 20px 50px rgba(0,0,0,0.45)',
                  }}
                >
                  {promoPopup.image && (
                    <img
                      src={promoPopup.image}
                      alt="Preview"
                      style={{ width: '100%', height: 185, objectFit: 'cover', display: 'block' }}
                    />
                  )}
                  <div style={{ padding: '20px 20px 22px', textAlign: 'center' }}>
                    {promoPopup.badge && (
                      <div style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 999, background: 'rgba(180,142,76,0.15)', color: '#957134', fontSize: 10.5, fontWeight: 700, marginBottom: 8 }}>
                        {promoPopup.badge}
                      </div>
                    )}
                    {promoPopup.title && (
                      <div style={{ fontSize: 20, fontWeight: 700, color: '#1f3147', marginBottom: 8, fontFamily: 'Georgia, serif' }}>
                        {promoPopup.title}
                      </div>
                    )}
                    {promoPopup.description && (
                      <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.55, marginBottom: 14, whiteSpace: 'pre-line' }}>
                        {promoPopup.description}
                      </div>
                    )}
                    {promoPopup.couponCode && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', marginBottom: 14, background: '#fff', border: '1.5px dashed #b48e4c', borderRadius: 8 }}>
                        <strong style={{ color: '#1f3147', fontSize: 13.5, letterSpacing: '0.06em' }}>{promoPopup.couponCode}</strong>
                        <span style={{ fontSize: 11, color: '#8a682d', fontWeight: 600 }}>Copy</span>
                      </div>
                    )}
                    {promoPopup.buttonText && (
                      <div style={{ padding: '11px 16px', borderRadius: 9, background: '#1f3147', color: '#FAF8F5', fontSize: 13.5, fontWeight: 600 }}>
                        {promoPopup.buttonText}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 2: WEB PUSH BROADCAST COMPOSER (TEXT + PICTURE + HISTORY)
      ===================================================================== */}
      {activeTab === 'broadcast' && (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: 18,
              alignItems: 'start',
            }}
          >
            <div className="sa-card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <h3 style={{ margin: 0, fontSize: 16, color: '#fff' }}>🚀 কাস্টমারদের ফোনে নোটিফিকেশন পাঠান</h3>
              <p className="dim" style={{ margin: 0, fontSize: 12.5 }}>
                কাস্টমার সাইটে না থাকলেও তার ফোনের নোটিফিকেশন বারে আপনার লেখা ও বড় ব্যানার ছবি চলে যাবে।
              </p>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12.5, color: '#cbd5e1' }}>
                নোটিফিকেশন শিরোনাম (Title)
                <input
                  value={bcTitle}
                  onChange={(e) => setBcTitle(e.target.value)}
                  placeholder="যেমন: ✨ আজ রাতে ফ্ল্যাশ সেল — ৩০% ছাড়!"
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12.5, color: '#cbd5e1' }}>
                মেসেজ বডি (Message লেখা)
                <textarea
                  rows={3}
                  value={bcBody}
                  onChange={(e) => setBcBody(e.target.value)}
                  placeholder="আপনার অফার বা নতুন পণ্যের মেসেজ লিখুন..."
                />
              </label>

              <div style={{ padding: 12, borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ fontSize: 12.5, color: '#cbd5e1', marginBottom: 8 }}>
                  বড় ব্যানার ছবি (ঐচ্ছিক — Android ও পিসিতে বড় ছবি দেখাবে)
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <label className="sa-btn ghost" style={{ cursor: 'pointer', margin: 0 }}>
                    {uploadingField === 'broadcast' ? 'আপলোড হচ্ছে…' : '📷 ছবি আপলোড করুন'}
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={(e) => handleImagePick('broadcast', e.target.files?.[0])}
                    />
                  </label>
                  {bcImage && (
                    <button type="button" className="sa-btn ghost" style={{ color: '#f87171' }} onClick={() => setBcImage('')}>
                      ✕ ছবি মুছুন
                    </button>
                  )}
                </div>
                <input
                  style={{ marginTop: 8, width: '100%' }}
                  placeholder="অথবা ছবির URL দিন (/uploads/...)"
                  value={bcImage}
                  onChange={(e) => setBcImage(e.target.value)}
                />
              </div>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12.5, color: '#cbd5e1' }}>
                নোটিফিকেশনে ক্লিক করলে কোন লিংকে যাবে?
                <input
                  value={bcUrl}
                  onChange={(e) => setBcUrl(e.target.value)}
                  placeholder="/shop অথবা /product/..."
                />
              </label>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 4 }}>
                <button
                  type="button"
                  className="sa-btn ghost"
                  disabled={bcBusy}
                  onClick={() => sendBroadcast('admin_test')}
                >
                  {bcBusy ? 'পাঠানো হচ্ছে…' : '🧪 আমার ডিভাইসে টেস্ট পাঠান'}
                </button>
                <button
                  type="button"
                  className="sa-btn"
                  disabled={bcBusy}
                  onClick={() => sendBroadcast('all')}
                >
                  {bcBusy ? 'পাঠানো হচ্ছে…' : `🚀 সবাইকে পাঠান (${stats.total} জন)`}
                </button>
              </div>
            </div>

            {/* PHONE LOCK-SCREEN PREVIEW */}
            <div className="sa-card" style={{ padding: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 12 }}>
                📲 মোবাইল নোটিফিকেশন প্রিভিউ
              </div>
              <div
                style={{
                  background: 'linear-gradient(160deg, #0f172a 0%, #1e293b 100%)',
                  borderRadius: 18,
                  padding: 22,
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <div
                  style={{
                    background: 'rgba(255,255,255,0.95)',
                    color: '#0f172a',
                    borderRadius: 16,
                    padding: 14,
                    boxShadow: '0 12px 30px rgba(0,0,0,0.35)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5, color: '#64748b', marginBottom: 6 }}>
                    <span>🔔</span>
                    <strong>metrroma.com</strong>
                    <span>• এখনই</span>
                  </div>
                  <div style={{ fontSize: 14.5, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>
                    {bcTitle || 'নোটিফিকেশন শিরোনাম'}
                  </div>
                  <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.45 }}>
                    {bcBody || 'আপনার মেসেজ এখানে দেখাবে…'}
                  </div>
                  {bcImage && (
                    <img
                      src={bcImage}
                      alt="Push Banner"
                      style={{
                        width: '100%',
                        maxHeight: 170,
                        objectFit: 'cover',
                        borderRadius: 10,
                        marginTop: 10,
                        display: 'block',
                      }}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* SENT CAMPAIGN HISTORY */}
          <div className="sa-card">
            <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 15, color: '#fff' }}>📜 পাঠানো নোটিফিকেশনের হিস্ট্রি</h3>
              <span className="dim" style={{ fontSize: 12 }}>{history.length}টি ক্যাম্পেইন</span>
            </div>
            {history.length === 0 ? (
              <div className="sa-empty">এখনো কোনো ব্রডকাস্ট পাঠানো হয়নি।</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="sa-table">
                  <thead>
                    <tr>
                      <th>সময়</th>
                      <th>টাইটেল ও মেসেজ</th>
                      <th>ছবি</th>
                      <th>টার্গেট</th>
                      <th>ডেলিভারি রিপোর্ট</th>
                      <th className="r">অ্যাকশন</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h) => (
                      <tr key={h.id}>
                        <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>
                          {new Date(h.at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, color: '#fff' }}>{h.title}</div>
                          <div className="dim" style={{ fontSize: 12, maxWidth: 340 }}>{h.body}</div>
                        </td>
                        <td>
                          {h.image ? (
                            <img src={h.image} alt="" style={{ width: 44, height: 32, objectFit: 'cover', borderRadius: 6 }} />
                          ) : (
                            <span className="dim">—</span>
                          )}
                        </td>
                        <td>
                          <span className="sa-badge" style={{ background: h.target === 'admin_test' ? 'rgba(234,179,8,0.16)' : 'rgba(56,189,248,0.16)', color: h.target === 'admin_test' ? '#fde047' : '#38bdf8' }}>
                            {h.target === 'admin_test' ? 'Test' : 'All Subscribers'}
                          </span>
                        </td>
                        <td style={{ fontSize: 12.5 }}>
                          <span style={{ color: '#4ade80', fontWeight: 600 }}>✓ {h.sent}</span>
                          {h.failed > 0 && <span style={{ color: '#f87171', marginLeft: 8 }}>✕ {h.failed}</span>}
                        </td>
                        <td className="r">
                          <button
                            type="button"
                            className="sa-link"
                            onClick={() => {
                              setBcTitle(h.title);
                              setBcBody(h.body);
                              setBcImage(h.image || '');
                              setBcUrl(h.url || '/shop');
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                          >
                            আবার ব্যবহার করুন
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* =====================================================================
          TAB 3: SOFT PUSH PROMPT & AUTO ORDER ALERTS
      ===================================================================== */}
      {activeTab === 'prompt' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: 18,
            alignItems: 'start',
          }}
        >
          <div className="sa-card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 16, color: '#fff' }}>🔔 কাস্টমার সাবস্ক্রিপশন কার্ড</h3>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 600, color: pushPrompt.enabled ? '#4ade80' : '#cbd5e1' }}>
                <input
                  type="checkbox"
                  checked={pushPrompt.enabled}
                  onChange={(e) => setPushPrompt((s) => ({ ...s, enabled: e.target.checked }))}
                />
                <span>{pushPrompt.enabled ? 'চালু (ON)' : 'বন্ধ (OFF)'}</span>
              </label>
            </div>

            <div style={{ padding: 12, borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ fontSize: 12.5, color: '#cbd5e1', marginBottom: 8 }}>কার্ডের আইকন / ছোট ছবি (ঐচ্ছিক)</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <label className="sa-btn ghost" style={{ cursor: 'pointer', margin: 0 }}>
                  {uploadingField === 'prompt' ? 'আপলোড হচ্ছে…' : '📷 আইকন আপলোড'}
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => handleImagePick('prompt', e.target.files?.[0])}
                  />
                </label>
                {pushPrompt.icon && (
                  <button type="button" className="sa-btn ghost" style={{ color: '#f87171' }} onClick={() => setPushPrompt((s) => ({ ...s, icon: '' }))}>
                    ✕ মুছুন
                  </button>
                )}
              </div>
            </div>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12.5, color: '#cbd5e1' }}>
              শিরোনাম (Title)
              <input
                value={pushPrompt.title}
                onChange={(e) => setPushPrompt((s) => ({ ...s, title: e.target.value }))}
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12.5, color: '#cbd5e1' }}>
              বিস্তারিত লেখা (Description)
              <textarea
                rows={2}
                value={pushPrompt.description}
                onChange={(e) => setPushPrompt((s) => ({ ...s, description: e.target.value }))}
              />
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12.5, color: '#cbd5e1' }}>
                Allow বাটনের লেখা
                <input
                  value={pushPrompt.allowText}
                  onChange={(e) => setPushPrompt((s) => ({ ...s, allowText: e.target.value }))}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12.5, color: '#cbd5e1' }}>
                বাতিল বাটনের লেখা
                <input
                  value={pushPrompt.dismissText}
                  onChange={(e) => setPushPrompt((s) => ({ ...s, dismissText: e.target.value }))}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12.5, color: '#cbd5e1' }}>
                কত সেকেন্ড পর আসবে?
                <input
                  type="number"
                  min={4}
                  max={120}
                  value={pushPrompt.delaySeconds}
                  onChange={(e) => setPushPrompt((s) => ({ ...s, delaySeconds: Math.max(4, Number(e.target.value) || 12) }))}
                />
              </label>
            </div>

            <button type="button" className="sa-btn" disabled={saving} onClick={saveAllSettings}>
              {saving ? 'সেভ হচ্ছে…' : '💾 সেভ করুন'}
            </button>
          </div>

          {/* AUTO ORDER ALERTS CARD + PREVIEW */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="sa-card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <h3 style={{ margin: 0, fontSize: 16, color: '#fff' }}>⚡ অটোমেটিক অর্ডার পুশ অ্যালার্ট</h3>

              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: 12, borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={autoAlerts.adminNewOrder}
                  onChange={(e) => setAutoAlerts((s) => ({ ...s, adminNewOrder: e.target.checked }))}
                  style={{ marginTop: 3 }}
                />
                <div>
                  <div style={{ fontWeight: 600, color: '#fff', fontSize: 13.5 }}>অ্যাডমিন নতুন অর্ডার অ্যালার্ট</div>
                  <div className="dim" style={{ fontSize: 12, marginTop: 2 }}>
                    কোনো কাস্টমার নতুন অর্ডার করলেই সাথে সাথে আপনার ফোনে অটো নোটিফিকেশন বাজবে।
                  </div>
                </div>
              </label>

              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: 12, borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={autoAlerts.customerOrderStatus}
                  onChange={(e) => setAutoAlerts((s) => ({ ...s, customerOrderStatus: e.target.checked }))}
                  style={{ marginTop: 3 }}
                />
                <div>
                  <div style={{ fontWeight: 600, color: '#fff', fontSize: 13.5 }}>কাস্টমার গোপনীয় ডেলিভারি আপডেট (100% Discreet)</div>
                  <div className="dim" style={{ fontSize: 12, marginTop: 2 }}>
                    অর্ডার Confirm, Shipped বা Delivered হলে কাস্টমারের ফোনে নোটিফিকেশন যাবে। শতভাগ প্রাইভেসির জন্য প্রোডাক্টের নাম বা ছবি কখনোই দেখানো হবে না।
                  </div>
                </div>
              </label>

              <button type="button" className="sa-btn" disabled={saving} onClick={saveAllSettings}>
                {saving ? 'সেভ হচ্ছে…' : '💾 অটো-অ্যালার্ট সেভ করুন'}
              </button>
            </div>

            {/* Preview of Push Opt-in Card */}
            <div className="sa-card" style={{ padding: 20 }}>
              <div style={{ fontSize: 12.5, color: '#cbd5e1', marginBottom: 10 }}>📱 সাবস্ক্রাইব কার্ড প্রিভিউ</div>
              <div style={{ background: '#FAF8F5', color: '#1f3147', borderRadius: 14, padding: 15, border: '1px solid rgba(180,142,76,0.4)' }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  {pushPrompt.icon ? (
                    <img src={pushPrompt.icon} alt="" style={{ width: 42, height: 42, borderRadius: 10, objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: 42, height: 42, borderRadius: 10, background: 'rgba(180,142,76,0.16)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 19 }}>🔔</div>
                  )}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{pushPrompt.title}</div>
                    <div style={{ fontSize: 12.5, color: '#526071', margin: '4px 0 10px' }}>{pushPrompt.description}</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <span style={{ padding: '6px 13px', borderRadius: 7, background: '#b48e4c', color: '#fff', fontSize: 12, fontWeight: 600 }}>{pushPrompt.allowText}</span>
                      <span style={{ padding: '6px 11px', borderRadius: 7, border: '1px solid rgba(31,49,71,0.15)', color: '#64748b', fontSize: 12 }}>{pushPrompt.dismissText}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 4: SMART WELLNESS PRIVACY TRUST TOAST
      ===================================================================== */}
      {activeTab === 'trust' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: 18,
            alignItems: 'start',
          }}
        >
          <div className="sa-card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 16, color: '#fff' }}>🔒 ওয়েলনেস গোপনীয় প্যাকিং আশ্বাস মেসেজ</h3>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 600, color: trustToast.enabled ? '#4ade80' : '#cbd5e1' }}>
                <input
                  type="checkbox"
                  checked={trustToast.enabled}
                  onChange={(e) => setTrustToast((s) => ({ ...s, enabled: e.target.checked }))}
                />
                <span>{trustToast.enabled ? 'চালু (ON)' : 'বন্ধ (OFF)'}</span>
              </label>
            </div>

            <div style={{ padding: 12, borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ fontSize: 12.5, color: '#cbd5e1', marginBottom: 8 }}>আইকন বা ছোট ছবি (ঐচ্ছিক — না দিলে 🔒 দেখাবে)</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <label className="sa-btn ghost" style={{ cursor: 'pointer', margin: 0 }}>
                  {uploadingField === 'trust' ? 'আপলোড হচ্ছে…' : '📷 ছবি আপলোড'}
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => handleImagePick('trust', e.target.files?.[0])}
                  />
                </label>
                {trustToast.icon && (
                  <button type="button" className="sa-btn ghost" style={{ color: '#f87171' }} onClick={() => setTrustToast((s) => ({ ...s, icon: '' }))}>
                    ✕ মুছুন
                  </button>
                )}
              </div>
            </div>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12.5, color: '#cbd5e1' }}>
              শিরোনাম (Title)
              <input
                value={trustToast.title}
                onChange={(e) => setTrustToast((s) => ({ ...s, title: e.target.value }))}
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12.5, color: '#cbd5e1' }}>
              আশ্বাস মেসেজ (Message)
              <textarea
                rows={3}
                value={trustToast.message}
                onChange={(e) => setTrustToast((s) => ({ ...s, message: e.target.value }))}
              />
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12.5, color: '#cbd5e1' }}>
                কোন পেজে দেখাবে?
                <select
                  value={trustToast.targetPages}
                  onChange={(e) => setTrustToast((s) => ({ ...s, targetPages: e.target.value as any }))}
                >
                  <option value="wellness">শুধু Wellness ও গোপনীয় পেজে</option>
                  <option value="all">সকল পেজে</option>
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12.5, color: '#cbd5e1' }}>
                কত সেকেন্ড পর দেখাবে?
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={trustToast.delaySeconds}
                  onChange={(e) => setTrustToast((s) => ({ ...s, delaySeconds: Math.max(1, Number(e.target.value) || 4) }))}
                />
              </label>
            </div>

            <button type="button" className="sa-btn" disabled={saving} onClick={saveAllSettings}>
              {saving ? 'সেভ হচ্ছে…' : '💾 ট্রাস্ট মেসেজ সেভ করুন'}
            </button>
          </div>

          <div className="sa-card" style={{ padding: 20 }}>
            <div style={{ fontSize: 12.5, color: '#cbd5e1', marginBottom: 12 }}>📱 লাইভ প্রিভিউ</div>
            <div
              style={{
                background: 'linear-gradient(145deg, #1f3147 0%, #162334 100%)',
                color: '#FAF8F5',
                borderRadius: 14,
                padding: '14px 16px',
                border: '1px solid rgba(180,142,76,0.45)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
              }}
            >
              {trustToast.icon ? (
                <img src={trustToast.icon} alt="" style={{ width: 38, height: 38, borderRadius: 9, objectFit: 'cover' }} />
              ) : (
                <div style={{ width: 36, height: 36, borderRadius: 9, background: 'rgba(180,142,76,0.2)', border: '1px solid rgba(180,142,76,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  🔒
                </div>
              )}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: '#ebd2a4', marginBottom: 3 }}>{trustToast.title}</div>
                <div style={{ fontSize: 12, lineHeight: 1.5, color: 'rgba(250,248,245,0.88)' }}>{trustToast.message}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
