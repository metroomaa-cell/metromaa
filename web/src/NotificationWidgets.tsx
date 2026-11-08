import { useEffect, useState } from 'react';
import { useRoute, go } from './cart';
import {
  getDeviceId,
  getProduct,
  getCachedProducts,
  getCachedSettings,
  isWellnessOrExcludedCategory,
  isWellnessOrExcludedProduct,
} from './api';

export type PromoPopupConfig = {
  enabled: boolean;
  mode: 'image_only' | 'image_text';
  image: string;
  badge?: string;
  title: string;
  description: string;
  couponCode: string;
  buttonText: string;
  buttonLink: string;
  targetPages: 'all' | 'home' | 'wellness';
  delaySeconds: number;
  frequency: 'once_per_day' | 'once_per_session' | 'always';
  campaignId: string;
};

export type PushPromptConfig = {
  enabled: boolean;
  title: string;
  description: string;
  allowText: string;
  dismissText: string;
  icon: string;
  delaySeconds: number;
};

export type TrustToastConfig = {
  enabled: boolean;
  targetPages: 'wellness' | 'all';
  icon: string;
  title: string;
  message: string;
  delaySeconds: number;
};

export type PublicNotificationConfig = {
  vapidPublicKey: string;
  promoPopup: PromoPopupConfig;
  pushPrompt: PushPromptConfig;
  trustToast: TrustToastConfig;
};

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function isWebPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export async function subscribeBrowserToPush(vapidPublicKey: string): Promise<{
  subscription: PushSubscription;
  endpoint: string;
}> {
  if (!isWebPushSupported()) {
    throw new Error('এই ব্রাউজারে Web Push সাপোর্ট করছে না (HTTPS বা আধুনিক ব্রাউজার প্রয়োজন)।');
  }
  if (!vapidPublicKey) {
    throw new Error('VAPID Public Key পাওয়া যায়নি।');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('নোটিফিকেশন পারমিশন Allow করা হয়নি। ব্রাউজারের লক আইকন থেকে Allow করুন।');
  }

  const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  await navigator.serviceWorker.ready;

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
    });
  }

  return {
    subscription: sub,
    endpoint: sub.endpoint,
  };
}

function navigateSmart(link: string) {
  const target = (link || '/shop').trim();
  if (/^https?:\/\//i.test(target)) {
    try {
      const u = new URL(target);
      if (u.origin === window.location.origin) {
        go(u.pathname + u.search);
        return;
      }
    } catch {}
    window.location.href = target;
    return;
  }
  go(target.startsWith('/') ? target : '/' + target);
}

export function NotificationWidgets() {
  const route = useRoute();
  const [cfg, setCfg] = useState<PublicNotificationConfig | null>(null);
  const [promoOpen, setPromoOpen] = useState(false);
  const [pushOpen, setPushOpen] = useState(false);
  const [trustOpen, setTrustOpen] = useState(false);
  const [copiedCoupon, setCopiedCoupon] = useState(false);
  const [pushSubscribing, setPushSubscribing] = useState(false);
  const [pushSuccessMsg, setPushSuccessMsg] = useState('');
  const [asyncWellnessProduct, setAsyncWellnessProduct] = useState(false);

  // Load public configuration once + silently refresh granted push subscription
  useEffect(() => {
    let mounted = true;
    fetch('/api/notifications/public')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: PublicNotificationConfig | null) => {
        if (!mounted || !data) return;
        setCfg(data);

        // Register SW early & silently sync already-granted customer subscription once per session
        if (isWebPushSupported() && Notification.permission === 'granted' && data.vapidPublicKey) {
          const syncedKey = 'secrate_push_synced_v1';
          if (!sessionStorage.getItem(syncedKey)) {
            navigator.serviceWorker
              .register('/sw.js', { scope: '/' })
              .then(() => navigator.serviceWorker.ready)
              .then((reg) => reg.pushManager.getSubscription())
              .then((sub) => {
                if (sub) {
                  sessionStorage.setItem(syncedKey, '1');
                  fetch('/api/push/subscribe', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      subscription: sub.toJSON(),
                      deviceId: getDeviceId(),
                    }),
                  }).catch(() => {});
                }
              })
              .catch(() => {});
          }
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  // Determine whether current page is a Wellness page
  const isCheckoutFlow = route.name === 'checkout' || route.name === 'confirm' || route.name === 'admin';
  const isHomePage = route.name === 'home';

  useEffect(() => {
    setAsyncWellnessProduct(false);
    if (route.name === 'product' && route.param) {
      let active = true;
      getProduct(route.param)
        .then((prod) => {
          if (!active || !prod) return;
          if (
            isWellnessOrExcludedProduct(prod) ||
            (Array.isArray(prod.categories) && prod.categories.some((c) => isWellnessOrExcludedCategory(c)))
          ) {
            setAsyncWellnessProduct(true);
          }
        })
        .catch(() => {});
      return () => {
        active = false;
      };
    }
  }, [route.name, route.param]);

  const isWellnessPage = (() => {
    if (route.name === 'shop' && route.param) {
      return isWellnessOrExcludedCategory(route.param);
    }
    if (route.name === 'product' && route.param) {
      if (asyncWellnessProduct) return true;
      const slug = route.param.toLowerCase();
      const prod = getCachedProducts().find(
        (p) => p.slug?.toLowerCase() === slug || p.id === route.param
      );
      if (prod) {
        if (isWellnessOrExcludedProduct(prod)) return true;
        if (Array.isArray(prod.categories) && prod.categories.some((c) => isWellnessOrExcludedCategory(c))) {
          return true;
        }
      }
    }
    return false;
  })();

  // 1. Promo Pop-up Scheduling
  useEffect(() => {
    if (!cfg?.promoPopup?.enabled || isCheckoutFlow) return;
    const p = cfg.promoPopup;

    // Check page targeting
    if (p.targetPages === 'home' && !isHomePage) return;
    if (p.targetPages === 'wellness' && !isWellnessPage) return;

    const campKey = `secrate_promo_seen_${p.campaignId || 'v1'}`;
    try {
      if (p.frequency === 'once_per_session') {
        if (sessionStorage.getItem(campKey)) return;
      } else if (p.frequency === 'once_per_day') {
        const last = Number(localStorage.getItem(campKey) || 0);
        if (last && Date.now() - last < 24 * 60 * 60 * 1000) return;
      } else if (p.frequency === 'always') {
        const routeSeenKey = `${campKey}_${route.name}_${route.param || ''}`;
        if (sessionStorage.getItem(routeSeenKey)) return;
      }
    } catch {}

    const delayMs = Math.max(1, Number(p.delaySeconds) || 6) * 1000;
    const timer = window.setTimeout(() => {
      setTrustOpen(false);
      setPushOpen(false);
      setPromoOpen(true);
    }, delayMs);

    return () => window.clearTimeout(timer);
  }, [cfg, route.name, route.param, isCheckoutFlow, isHomePage, isWellnessPage]);

  const markPromoSeenAndClose = () => {
    setPromoOpen(false);
    if (!cfg?.promoPopup) return;
    const p = cfg.promoPopup;
    const campKey = `secrate_promo_seen_${p.campaignId || 'v1'}`;
    try {
      if (p.frequency === 'once_per_session') {
        sessionStorage.setItem(campKey, '1');
      } else if (p.frequency === 'once_per_day') {
        localStorage.setItem(campKey, String(Date.now()));
      } else {
        sessionStorage.setItem(`${campKey}_${route.name}_${route.param || ''}`, '1');
      }
    } catch {}
  };

  // 2. Soft Web Push Opt-In Prompt Scheduling (Never overlaps with Promo Pop-up)
  useEffect(() => {
    if (!cfg?.pushPrompt?.enabled || !cfg.vapidPublicKey || isCheckoutFlow || promoOpen) return;
    if (!isWebPushSupported()) return;
    if (Notification.permission !== 'default') return;

    try {
      const dismissedAt = Number(localStorage.getItem('secrate_push_dismissed_at') || 0);
      if (dismissedAt && Date.now() - dismissedAt < 3 * 24 * 60 * 60 * 1000) return;
    } catch {}

    const delayMs = Math.max(4, Number(cfg.pushPrompt.delaySeconds) || 12) * 1000;
    const timer = window.setTimeout(() => {
      setTrustOpen(false);
      setPushOpen(true);
    }, delayMs);

    return () => window.clearTimeout(timer);
  }, [cfg, isCheckoutFlow, promoOpen]);

  // 3. Smart Wellness Discreet Packaging Trust Toast (Never overlaps with Promo or Push Prompt)
  useEffect(() => {
    if (!cfg?.trustToast?.enabled || isCheckoutFlow || promoOpen || pushOpen) {
      if (promoOpen || pushOpen) setTrustOpen(false);
      return;
    }
    const t = cfg.trustToast;
    if (t.targetPages === 'wellness' && !isWellnessPage) {
      setTrustOpen(false);
      return;
    }
    try {
      if (sessionStorage.getItem('secrate_trust_dismissed') === '1') return;
    } catch {}

    const delayMs = Math.max(1.5, Number(t.delaySeconds) || 4) * 1000;
    const showTimer = window.setTimeout(() => {
      setTrustOpen(true);
    }, delayMs);

    return () => window.clearTimeout(showTimer);
  }, [cfg, isCheckoutFlow, isWellnessPage, promoOpen, pushOpen]);

  // Auto-hide trust toast gently after 14s so it never gets in the way
  useEffect(() => {
    if (!trustOpen) return;
    const hideTimer = window.setTimeout(() => {
      setTrustOpen(false);
      try {
        sessionStorage.setItem('secrate_trust_dismissed', '1');
      } catch {}
    }, 14000);
    return () => window.clearTimeout(hideTimer);
  }, [trustOpen]);

  const dismissPushPrompt = () => {
    setPushOpen(false);
    try {
      localStorage.setItem('secrate_push_dismissed_at', String(Date.now()));
    } catch {}
  };

  const handleAllowPush = async () => {
    if (!cfg?.vapidPublicKey || pushSubscribing) return;
    setPushSubscribing(true);
    try {
      const { subscription } = await subscribeBrowserToPush(cfg.vapidPublicKey);
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          deviceId: getDeviceId(),
        }),
      });
      setPushSuccessMsg('ধন্যবাদ! নোটিফিকেশন চালু হয়েছে ✨');
      window.setTimeout(() => {
        setPushOpen(false);
        setPushSuccessMsg('');
      }, 1800);
    } catch {
      dismissPushPrompt();
    } finally {
      setPushSubscribing(false);
    }
  };

  const dismissTrustToast = () => {
    setTrustOpen(false);
    try {
      sessionStorage.setItem('secrate_trust_dismissed', '1');
    } catch {}
  };

  const handleCopyCoupon = (code: string) => {
    if (!code) return;
    navigator.clipboard?.writeText(code).catch(() => {});
    setCopiedCoupon(true);
    window.setTimeout(() => setCopiedCoupon(false), 2200);
  };

  const fallbackIcon = getCachedSettings()?.favicon || getCachedSettings()?.logo || '';

  return (
    <>
      {(promoOpen || pushOpen || trustOpen) && (
        <style>{`
          @keyframes secrateFadeIn { from { opacity: 0; } to { opacity: 1; } }
          @keyframes secratePopUp { from { opacity: 0; transform: translateY(18px) scale(0.96); } to { opacity: 1; transform: translateY(0) scale(1); } }
          @keyframes secrateSlideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
          @media (min-width: 768px) {
            .secrate-push-card { bottom: 22px !important; left: 22px !important; right: auto !important; }
          }
        `}</style>
      )}

      {/* 1. PROMO POP-UP MODAL */}
      {promoOpen && cfg?.promoPopup && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={markPromoSeenAndClose}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9998,
            background: 'rgba(18, 26, 38, 0.62)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '18px',
            animation: 'secrateFadeIn 0.28s ease-out',
          }}
        >
          <style>{`
            @keyframes secrateFadeIn { from { opacity: 0; } to { opacity: 1; } }
            @keyframes secratePopUp { from { opacity: 0; transform: translateY(18px) scale(0.96); } to { opacity: 1; transform: translateY(0) scale(1); } }
            @keyframes secrateSlideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
          `}</style>

          {cfg.promoPopup.mode === 'image_only' && cfg.promoPopup.image ? (
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                position: 'relative',
                width: '100%',
                maxWidth: 430,
                borderRadius: 18,
                overflow: 'hidden',
                boxShadow: '0 24px 60px rgba(0,0,0,0.38)',
                border: '1px solid rgba(180, 142, 76, 0.35)',
                background: '#FAF8F5',
                animation: 'secratePopUp 0.32s cubic-bezier(0.16, 1, 0.3, 1)',
              }}
            >
              <button
                type="button"
                onClick={markPromoSeenAndClose}
                aria-label="Close popup"
                style={{
                  position: 'absolute',
                  top: 12,
                  right: 12,
                  zIndex: 3,
                  width: 34,
                  height: 34,
                  borderRadius: '50%',
                  border: '1px solid rgba(255,255,255,0.45)',
                  background: 'rgba(15, 23, 42, 0.65)',
                  color: '#fff',
                  fontSize: 16,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backdropFilter: 'blur(4px)',
                }}
              >
                ✕
              </button>
              <img
                src={cfg.promoPopup.image}
                alt={cfg.promoPopup.title || 'Special Offer'}
                onClick={() => {
                  const link = cfg.promoPopup.buttonLink;
                  markPromoSeenAndClose();
                  if (link) navigateSmart(link);
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  maxHeight: '78vh',
                  objectFit: 'cover',
                  cursor: cfg.promoPopup.buttonLink ? 'pointer' : 'default',
                }}
              />
            </div>
          ) : (
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                position: 'relative',
                width: '100%',
                maxWidth: 420,
                borderRadius: 20,
                overflow: 'hidden',
                background: '#FAF8F5',
                color: '#1f3147',
                border: '1px solid rgba(180, 142, 76, 0.38)',
                boxShadow: '0 25px 65px rgba(15, 23, 42, 0.35)',
                animation: 'secratePopUp 0.32s cubic-bezier(0.16, 1, 0.3, 1)',
              }}
            >
              <button
                type="button"
                onClick={markPromoSeenAndClose}
                aria-label="Close offer"
                style={{
                  position: 'absolute',
                  top: 12,
                  right: 12,
                  zIndex: 3,
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  border: '1px solid rgba(31, 49, 71, 0.14)',
                  background: 'rgba(250, 248, 245, 0.9)',
                  color: '#1f3147',
                  fontSize: 15,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                }}
              >
                ✕
              </button>

              {cfg.promoPopup.image && (
                <div style={{ width: '100%', maxHeight: 225, overflow: 'hidden', background: '#f1ece3' }}>
                  <img
                    src={cfg.promoPopup.image}
                    alt={cfg.promoPopup.title || 'METRROMA Offer'}
                    style={{ width: '100%', height: 225, objectFit: 'cover', display: 'block' }}
                  />
                </div>
              )}

              <div style={{ padding: '24px 24px 26px', textAlign: 'center' }}>
                {cfg.promoPopup.badge && (
                  <div
                    style={{
                      display: 'inline-block',
                      padding: '4px 12px',
                      borderRadius: 999,
                      background: 'rgba(180, 142, 76, 0.14)',
                      border: '1px solid rgba(180, 142, 76, 0.35)',
                      color: '#957134',
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: '0.09em',
                      textTransform: 'uppercase',
                      marginBottom: 10,
                    }}
                  >
                    {cfg.promoPopup.badge}
                  </div>
                )}

                {cfg.promoPopup.title && (
                  <h3
                    style={{
                      margin: '0 0 10px',
                      fontSize: 22,
                      lineHeight: 1.3,
                      fontWeight: 700,
                      color: '#1f3147',
                      fontFamily: "'Cormorant Garamond', Georgia, serif",
                    }}
                  >
                    {cfg.promoPopup.title}
                  </h3>
                )}

                {cfg.promoPopup.description && (
                  <p
                    style={{
                      margin: '0 0 18px',
                      fontSize: 14,
                      lineHeight: 1.6,
                      color: '#475569',
                      whiteSpace: 'pre-line',
                    }}
                  >
                    {cfg.promoPopup.description}
                  </p>
                )}

                {cfg.promoPopup.couponCode && (
                  <div
                    onClick={() => handleCopyCoupon(cfg.promoPopup.couponCode)}
                    title="Click to copy coupon"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 10,
                      padding: '10px 14px',
                      marginBottom: 18,
                      borderRadius: 10,
                      background: '#fff',
                      border: '1.5px dashed #b48e4c',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ textAlign: 'left' }}>
                      <div style={{ fontSize: 10.5, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        Coupon Code
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#1f3147', letterSpacing: '0.06em' }}>
                        {cfg.promoPopup.couponCode}
                      </div>
                    </div>
                    <span
                      style={{
                        padding: '5px 11px',
                        borderRadius: 6,
                        background: copiedCoupon ? '#16a34a' : 'rgba(180, 142, 76, 0.16)',
                        color: copiedCoupon ? '#fff' : '#8a682d',
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    >
                      {copiedCoupon ? 'কপি হয়েছে ✓' : 'Copy'}
                    </span>
                  </div>
                )}

                {cfg.promoPopup.buttonText && (
                  <button
                    type="button"
                    onClick={() => {
                      const link = cfg.promoPopup.buttonLink || '/shop';
                      markPromoSeenAndClose();
                      navigateSmart(link);
                    }}
                    style={{
                      width: '100%',
                      padding: '13px 20px',
                      borderRadius: 10,
                      border: 'none',
                      background: 'linear-gradient(135deg, #1f3147 0%, #2c4360 100%)',
                      color: '#FAF8F5',
                      fontSize: 14,
                      fontWeight: 600,
                      letterSpacing: '0.04em',
                      cursor: 'pointer',
                      boxShadow: '0 8px 20px rgba(31, 49, 71, 0.22)',
                    }}
                  >
                    {cfg.promoPopup.buttonText}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 2. SOFT WEB PUSH OPT-IN CARD */}
      {pushOpen && cfg?.pushPrompt && !promoOpen && (
        <div
          className="secrate-push-card"
          role="region"
          aria-label="Notification permission prompt"
          style={{
            position: 'fixed',
            left: 16,
            right: 16,
            bottom: 76,
            maxWidth: 385,
            zIndex: 9990,
            background: '#FAF8F5',
            color: '#1f3147',
            borderRadius: 16,
            padding: '15px 16px',
            border: '1px solid rgba(180, 142, 76, 0.42)',
            boxShadow: '0 16px 42px rgba(15, 23, 42, 0.22)',
            animation: 'secrateSlideUp 0.3s ease-out',
          }}
        >
          <style>{`
            @keyframes secrateSlideUp { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }
            @media (min-width: 768px) {
              .secrate-push-card { bottom: 22px !important; right: auto !important; }
            }
          `}</style>
          {pushSuccessMsg ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 4px', fontWeight: 600, color: '#15803d', fontSize: 14 }}>
              <span>✅</span>
              <span>{pushSuccessMsg}</span>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              {cfg.pushPrompt.icon || fallbackIcon ? (
                <img
                  src={cfg.pushPrompt.icon || fallbackIcon}
                  alt="METRROMA"
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 11,
                    objectFit: 'cover',
                    flexShrink: 0,
                    border: '1px solid rgba(180,142,76,0.28)',
                    background: '#fff',
                  }}
                />
              ) : (
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 11,
                    background: 'rgba(180, 142, 76, 0.15)',
                    color: '#b48e4c',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 20,
                    flexShrink: 0,
                  }}
                >
                  🔔
                </div>
              )}

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 700, color: '#1f3147', lineHeight: 1.35, marginBottom: 4 }}>
                  {cfg.pushPrompt.title || 'স্পেশাল অফার ও ডেলিভারি আপডেট পান 🔔'}
                </div>
                <div style={{ fontSize: 12.5, color: '#526071', lineHeight: 1.5, marginBottom: 11 }}>
                  {cfg.pushPrompt.description}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    type="button"
                    disabled={pushSubscribing}
                    onClick={handleAllowPush}
                    style={{
                      padding: '7px 15px',
                      borderRadius: 8,
                      border: 'none',
                      background: 'linear-gradient(135deg, #b48e4c 0%, #9a7638 100%)',
                      color: '#fff',
                      fontSize: 12.5,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {pushSubscribing ? 'অপেক্ষা করুন…' : cfg.pushPrompt.allowText || 'Allow করুন'}
                  </button>
                  <button
                    type="button"
                    onClick={dismissPushPrompt}
                    style={{
                      padding: '7px 12px',
                      borderRadius: 8,
                      border: '1px solid rgba(31,49,71,0.14)',
                      background: 'transparent',
                      color: '#64748b',
                      fontSize: 12,
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                  >
                    {cfg.pushPrompt.dismissText || 'পরে'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. SMART WELLNESS DISCREET PACKAGING TRUST TOAST */}
      {trustOpen && cfg?.trustToast && !promoOpen && !pushOpen && (
        <div
          className="secrate-push-card"
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            left: 14,
            right: 14,
            bottom: 76,
            maxWidth: 370,
            zIndex: 9985,
            background: 'linear-gradient(145deg, #1f3147 0%, #162334 100%)',
            color: '#FAF8F5',
            borderRadius: 14,
            padding: '13px 15px',
            border: '1px solid rgba(180, 142, 76, 0.45)',
            boxShadow: '0 14px 36px rgba(15, 23, 42, 0.32)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 11,
            animation: 'secrateSlideUp 0.3s ease-out',
          }}
        >
          {cfg.trustToast.icon ? (
            <img
              src={cfg.trustToast.icon}
              alt=""
              style={{ width: 38, height: 38, borderRadius: 9, objectFit: 'cover', flexShrink: 0 }}
            />
          ) : (
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 9,
                background: 'rgba(180, 142, 76, 0.2)',
                border: '1px solid rgba(180, 142, 76, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 17,
                flexShrink: 0,
              }}
            >
              🔒
            </div>
          )}

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: '#ebd2a4', marginBottom: 3 }}>
              {cfg.trustToast.title}
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.5, color: 'rgba(250, 248, 245, 0.88)' }}>
              {cfg.trustToast.message}
            </div>
          </div>

          <button
            type="button"
            onClick={dismissTrustToast}
            aria-label="Dismiss privacy notice"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'rgba(250,248,245,0.65)',
              fontSize: 14,
              cursor: 'pointer',
              padding: '2px 4px',
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>
      )}
    </>
  );
}
