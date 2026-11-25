// Google Tag Manager + Meta Pixel + TikTok Pixel + GA4 + dataLayer tracking
let gtmLoaded = false;
let fbLoaded = false;
const initializedFbPixels = new Set<string>();
const initializedTtkPixels = new Set<string>();
const initializedGtm = new Set<string>();
const initializedGa = new Set<string>();

export function isAdminContext(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const p = (window.location.pathname || '').toLowerCase();
    const h = (window.location.hash || '').toLowerCase();
    const hasAdminPath = p.includes('/admin') || p.includes('/wp-admin') || p.includes('/staff');
    const adminHashes = ['admin', 'staff', 'orders', 'catalog', 'inventory', 'finance', 'settings', 'integrations', 'campaigns', 'marketing', 'customers', 'telephony', 'scanner', 'push_popups'];
    const hasAdminHash = adminHashes.some((k) => h.includes(k));
    const isToken = typeof localStorage !== 'undefined' && !!localStorage.getItem('dot_admin_token');
    const isNav = typeof sessionStorage !== 'undefined' && !!sessionStorage.getItem('sa_admin_nav');
    const isAdm = hasAdminPath || hasAdminHash || isNav || isToken;
    if (isAdm) {
      const w = window as any;
      if (w.fbq) {
        w.fbq = function () {};
      }
      if (w.ttq) {
        w.ttq = { track: function () {}, page: function () {}, identify: function () {} };
      }
    }
    return isAdm;
  } catch {
    return false;
  }
}

export function dl(data: Record<string, any>) {
  try {
    if (import.meta.env.DEV || isAdminContext()) return;
    const w = window as any;
    w.dataLayer = w.dataLayer || [];
    w.dataLayer.push(data);
  } catch {}
}

export function fbTrack(name: string, data?: Record<string, any>, isCustom = true, eventId?: string) {
  try {
    if (import.meta.env.DEV || isAdminContext()) return;
    const w = window as any;
    if (typeof w.fbq === 'function') {
      const options = eventId ? { eventID: String(eventId) } : undefined;
      if (isCustom) {
        if (options) w.fbq('trackCustom', name, data, options);
        else w.fbq('trackCustom', name, data);
      } else {
        if (options) w.fbq('track', name, data, options);
        else w.fbq('track', name, data);
      }
    }
  } catch {}
}

export function ttkTrack(event: string, params?: Record<string, any>, eventId?: string) {
  try {
    if (import.meta.env.DEV || isAdminContext()) return;
    const w = window as any;
    if (w.ttq && typeof w.ttq.track === 'function') {
      const opts = eventId ? { event_id: String(eventId) } : undefined;
      w.ttq.track(event, params || {}, opts);
    }
  } catch {}
}

export function setAllowedLandingPixels(pixels: string[]) {
  if (typeof window !== 'undefined') {
    (window as any).__ALLOWED_PIXELS__ = pixels && pixels.length > 0 ? pixels.map(p => String(p).trim()) : null;
  }
}

export function initFB(id: string) {
  try {
    if (import.meta.env.DEV || isAdminContext()) return;
    if (!id || !/^\d+$/.test(id.trim())) return;
    const pid = id.trim();
    const w = window as any;
    if (typeof w.__isPixelAllowed === 'function' && !w.__isPixelAllowed(pid)) {
      console.warn(`[analytics] initFB prevented for disallowed pixel ${pid}`);
      return;
    }
    if (initializedFbPixels.has(pid)) return;
    fbLoaded = true;
    initializedFbPixels.add(pid);

    if (!w.fbq) {
      const n: any = function () {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
      };
      if (!w._fbq) w._fbq = n;
      n.push = n;
      n.loaded = true;
      n.version = '2.0';
      n.queue = [];
      const t = document.createElement('script');
      t.async = true;
      t.src = 'https://connect.facebook.net/en_US/fbevents.js';
      const s = document.getElementsByTagName('script')[0];
      if (s && s.parentNode) s.parentNode.insertBefore(t, s);
      else document.head.appendChild(t);
      w.fbq = n;
    }
    w.fbq('init', pid);
    w.fbq('track', 'PageView');
  } catch {}
}

export function initTikTok(id: string) {
  try {
    if (import.meta.env.DEV || isAdminContext()) return;
    if (!id || !id.trim()) return;
    const tid = id.trim();
    if (initializedTtkPixels.has(tid)) return;
    initializedTtkPixels.add(tid);

    const w = window as any;
    if (!w.ttq) {
      w.TiktokAnalyticsObject = 'ttq';
      const ttq: any = [];
      ttq.methods = ['page', 'track', 'identify', 'instances', 'load', 'on', 'off', 'once', 'ready', 'alias', 'group', 'enableCookie', 'disableCookie', 'holdConsent', 'revokeConsent', 'grantConsent'];
      ttq.setAndDefer = function (t: any, e: any) {
        t[e] = function () {
          t.push([e].concat(Array.prototype.slice.call(arguments, 0)));
        };
      };
      for (let i = 0; i < ttq.methods.length; i++) {
        ttq.setAndDefer(ttq, ttq.methods[i]);
      }
      ttq.instance = function (t: any) {
        const e = ttq._i[t] || [];
        for (let n = 0; n < ttq.methods.length; n++) {
          ttq.setAndDefer(e, ttq.methods[n]);
        }
        return e;
      };
      ttq.load = function (e: any, n: any) {
        const i = 'https://analytics.tiktok.com/i18n/pixel/events.js';
        ttq._i = ttq._i || {};
        ttq._i[e] = [];
        ttq._i[e]._u = i;
        ttq._t = ttq._t || {};
        ttq._t[e] = +new Date();
        ttq._o = ttq._o || {};
        ttq._o[e] = n || {};
        const o = document.createElement('script');
        o.type = 'text/javascript';
        o.async = true;
        o.src = i + '?sdkid=' + e + '&lib=ttq';
        const a = document.getElementsByTagName('script')[0];
        if (a && a.parentNode) a.parentNode.insertBefore(o, a);
        else document.head.appendChild(o);
      };
      w.ttq = ttq;
    }
    w.ttq.load(tid);
    w.ttq.page();
  } catch {}
}

export function initGA4(id: string) {
  try {
    if (import.meta.env.DEV || isAdminContext()) return;
    if (!id || !/^G-[A-Z0-9]+$/i.test(id.trim())) return;
    const gaId = id.trim().toUpperCase();
    if (initializedGa.has(gaId)) return;
    initializedGa.add(gaId);

    const w = window as any;
    w.dataLayer = w.dataLayer || [];
    function gtag() { (w.dataLayer as any).push(arguments); }
    w.gtag = w.gtag || gtag;
    (w.gtag as any)('js', new Date());
    (w.gtag as any)('config', gaId);
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + gaId;
    document.head.appendChild(s);
  } catch {}
}

export function initGTM(id: string) {
  try {
    if (import.meta.env.DEV || isAdminContext()) return;
    if (!id || !/^GTM-[A-Z0-9]+$/i.test(id.trim())) return;
    const gid = id.trim().toUpperCase();
    if (initializedGtm.has(gid)) return;
    initializedGtm.add(gid);
    gtmLoaded = true;

    // If GTM is already present in HTML, do not reinject
    const w = window as any;
    if (document.querySelector(`script[src*="${gid}"]`) || (w.google_tag_manager && w.google_tag_manager[gid])) {
      return;
    }
    w.dataLayer = w.dataLayer || [];
    w.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtm.js?id=' + gid;
    document.head.appendChild(s);
  } catch {}
}

const CUR = 'BDT';

function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// View content / View item
export function ecView(p: { id: string; name: string; price: number }) {
  try {
    const eventId = uid(`vc_${p.id}`);
    dl({ ecommerce: null });
    dl({ event: 'view_item', event_id: eventId, eventID: eventId, content_id: String(p.id), content_ids: [String(p.id)], content_name: p.name, content_type: 'product', contents: [{ content_id: String(p.id), content_name: p.name, content_type: 'product', quantity: 1, price: p.price }], ecommerce: { currency: CUR, value: p.price, items: [{ item_id: p.id, item_name: p.name, price: p.price, quantity: 1 }] } });
    dl({ event: 'ViewContent', event_id: eventId, eventID: eventId, content_id: String(p.id), content_name: p.name, content_ids: [String(p.id)], content_type: 'product', contents: [{ content_id: String(p.id), content_name: p.name, content_type: 'product', quantity: 1, price: p.price }], value: p.price, currency: CUR });
    fbTrack('ViewContent', { content_name: p.name, content_ids: [p.id], content_type: 'product', value: p.price, currency: CUR }, false, eventId);
    ttkTrack('ViewContent', { content_id: String(p.id), content_type: 'product', content_name: p.name, price: p.price, currency: CUR }, eventId);
  } catch {}
}

// Add to cart
export function ecAdd(p: { id: string; name: string; price: number }, qty = 1) {
  try {
    const eventId = uid(`atc_${p.id}`);
    dl({ ecommerce: null });
    dl({ event: 'add_to_cart', event_id: eventId, eventID: eventId, content_id: String(p.id), content_ids: [String(p.id)], content_name: p.name, content_type: 'product', contents: [{ content_id: String(p.id), content_name: p.name, content_type: 'product', quantity: qty, price: p.price }], ecommerce: { currency: CUR, value: p.price * qty, items: [{ item_id: p.id, item_name: p.name, price: p.price, quantity: qty }] } });
    dl({ event: 'AddToCart', event_id: eventId, eventID: eventId, content_id: String(p.id), content_name: p.name, content_ids: [String(p.id)], content_type: 'product', contents: [{ content_id: String(p.id), content_name: p.name, content_type: 'product', quantity: qty, price: p.price }], value: p.price * qty, currency: CUR });
    fbTrack('AddToCart', { content_name: p.name, content_ids: [p.id], content_type: 'product', value: p.price * qty, currency: CUR }, false, eventId);
  } catch {}
}

export function getCookie(name: string): string | undefined {
  if (typeof document === 'undefined' || !document.cookie) return undefined;
  try {
    const parts = document.cookie.split(';');
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i].trim();
      if (p.startsWith(name + '=')) {
        return decodeURIComponent(p.substring(name.length + 1));
      }
    }
  } catch {}
  return undefined;
}

export function formatE164Phone(rawPhone?: string): string {
  if (!rawPhone) return '';
  const digits = String(rawPhone).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('880')) return '+' + digits;
  if (digits.startsWith('01')) return '+880' + digits.slice(1);
  if (digits.length === 10 && digits.startsWith('1')) return '+880' + digits;
  return '+' + digits;
}

export type CustomerTrackingData = {
  name?: string;
  phone?: string;
  city?: string;
  address?: string;
  email?: string;
};

export function buildUserData(c?: CustomerTrackingData) {
  const fbp = getCookie('_fbp');
  const fbc = getCookie('_fbc');
  const e164 = formatE164Phone(c?.phone);
  const nameParts = (c?.name || '').trim().split(/\s+/);
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ') || '';

  const uData: Record<string, any> = {
    phone_number: e164 || undefined,
    phone: e164 || undefined,
    first_name: firstName || undefined,
    last_name: lastName || undefined,
    email: c?.email ? c.email.trim().toLowerCase() : undefined,
    address: {
      first_name: firstName || undefined,
      last_name: lastName || undefined,
      city: c?.city || undefined,
      street: c?.address || undefined,
      country: 'BD',
    },
    fbp: fbp || undefined,
    fbc: fbc || undefined,
  };
  Object.keys(uData).forEach((k) => uData[k] === undefined && delete uData[k]);
  return uData;
}

export function pushUserData(c: CustomerTrackingData) {
  try {
    if (isAdminContext()) return;
    const uData = buildUserData(c);
    dl({
      event: 'user_data_update',
      user_data: uData,
      customer: uData,
    });
  } catch {}
}

// Begin checkout / InitiateCheckout with rich customer user_data for sGTM
export function ecBeginCheckout(
  value: number,
  items: { id: string; name: string; price: number; qty: number }[],
  customer?: CustomerTrackingData
) {
  try {
    const eventId = uid('ic');
    const uData = buildUserData(customer);
    const firstId = items[0]?.id ? String(items[0].id) : '';
    const allIds = items.map((l) => String(l.id));
    const ttContents = items.map((l) => ({ content_id: String(l.id), content_name: l.name, content_type: 'product', quantity: l.qty, price: l.price }));
    dl({ ecommerce: null });
    dl({
      event: 'begin_checkout',
      event_id: eventId,
      eventID: eventId,
      content_id: firstId,
      content_ids: allIds,
      content_type: 'product',
      contents: ttContents,
      user_data: uData,
      customer: uData,
      ecommerce: {
        currency: CUR,
        value,
        items: items.map((l) => ({ item_id: l.id, item_name: l.name, price: l.price, quantity: l.qty })),
      },
    });
    dl({
      event: 'InitiateCheckout',
      event_id: eventId,
      eventID: eventId,
      content_id: firstId,
      content_ids: allIds,
      content_type: 'product',
      contents: ttContents,
      value,
      currency: CUR,
      num_items: items.length,
      user_data: uData,
      customer: uData,
    });
    fbTrack('InitiateCheckout', { value, currency: CUR, num_items: items.length }, false, eventId);
    ttkTrack('InitiateCheckout', { contents: ttContents, value, currency: CUR }, eventId);
  } catch {}
}

// Purchase with rich customer user_data & _fbp/_fbc for sGTM + Meta CAPI
export function ecPurchase(
  id: string,
  value: number,
  items: { id: string; name: string; price: number; qty: number }[],
  source?: string,
  customer?: CustomerTrackingData
) {
  try {
    const numValue = Math.round((Number(value) || 0) * 100) / 100;
    const contents = (items || []).map((l) => ({
      id: String(l.id),
      item_price: Number(l.price) || 0,
      quantity: Number(l.qty) || 1,
    }));
    const contentIds = (items || []).map((i) => String(i.id));
    const numItems = (items || []).reduce((sum, i) => sum + (Number(i.qty) || 1), 0);
    const uData = buildUserData(customer);

    const ttContents = (items || []).map((l) => ({
      content_id: String(l.id),
      content_name: l.name,
      content_type: 'product',
      quantity: Number(l.qty) || 1,
      price: Number(l.price) || 0,
    }));

    dl({ ecommerce: null });
    dl({
      event: 'purchase',
      event_id: String(id),
      eventID: String(id),
      content_id: contentIds[0] || '',
      content_ids: contentIds,
      content_type: 'product',
      contents: ttContents,
      value: numValue,
      currency: CUR,
      order_id: String(id),
      order_source: source || 'direct',
      user_data: uData,
      customer: uData,
      ecommerce: {
        transaction_id: String(id),
        currency: CUR,
        value: numValue,
        items: (items || []).map((l) => ({
          item_id: String(l.id),
          item_name: l.name,
          price: Number(l.price) || 0,
          quantity: Number(l.qty) || 1,
        })),
      },
    });

    fbTrack(
      'Purchase',
      {
        value: numValue,
        currency: CUR,
        content_type: 'product',
        content_ids: contentIds,
        contents,
        num_items: numItems,
      },
      false,
      String(id)
    );
    ttkTrack('CompletePayment', { contents: ttContents, value: numValue, currency: CUR }, String(id));
  } catch {}
}

// Scroll-depth + time-on-page engagement tracking (per page view).
export function trackEngagement(path: string) {
  try {
    if (isAdminContext()) return () => {};
    const start = Date.now();
    const marks: Record<number, boolean> = {};
    const thresholds = [25, 50, 75, 90];
    const onScroll = () => {
      try {
        const el = document.documentElement;
        const max = el.scrollHeight - el.clientHeight;
        const pct = max > 0 ? (el.scrollTop / max) * 100 : 100;
        thresholds.forEach((t) => {
          if (pct >= t && !marks[t]) {
            marks[t] = true;
            const eventId = uid(`ps_${t}`);
            dl({ event: 'PageScroll', percent_scrolled: t, page_path: path, event_id: eventId, eventID: eventId });
            dl({ event: 'scroll_depth', percent_scrolled: t, page_path: path, event_id: eventId, eventID: eventId });
            fbTrack('PageScroll', { percent_scrolled: t, page_path: path }, true, eventId);
          }
        });
      } catch {}
    };
    addEventListener('scroll', onScroll, { passive: true });
    const timers = [10, 30, 60, 120, 180].map((s) => window.setTimeout(() => {
      try {
        const eventId = uid(`top_${s}`);
        dl({ event: 'TimeOnPage', seconds: s, time_spent_seconds: s, page_path: path, event_id: eventId, eventID: eventId });
        dl({ event: 'time_spent', seconds: s, time_spent_seconds: s, page_path: path, event_id: eventId, eventID: eventId });
        dl({ event: 'time_on_page', seconds: s, time_spent_seconds: s, page_path: path, event_id: eventId, eventID: eventId });
        fbTrack('TimeOnPage', { seconds: s, page_path: path }, true, eventId);
      } catch {}
    }, s * 1000));

    let sent = false;
    const sendEng = () => {
      try {
        if (sent) return;
        sent = true;
        dl({ event: 'page_engagement', engagement_seconds: Math.round((Date.now() - start) / 1000), page_path: path });
      } catch {}
    };
    const onVis = () => { if (document.visibilityState === 'hidden') sendEng(); };
    document.addEventListener('visibilitychange', onVis);
    addEventListener('pagehide', sendEng);
    return () => {
      removeEventListener('scroll', onScroll);
      timers.forEach((t) => clearTimeout(t));
      document.removeEventListener('visibilitychange', onVis);
      removeEventListener('pagehide', sendEng);
      sendEng();
    };
  } catch {
    return () => {};
  }
}

// Global click & video tracking (called once on app mount)
let listenersInit = false;
export function initInteractionTracking() {
  if (listenersInit || typeof window === 'undefined' || isAdminContext()) return;
  listenersInit = true;

  try {
    // Click tracking: TelClick, OutboundClick
    document.addEventListener('click', (e) => {
      try {
        const el = e.target as HTMLElement;
        if (!el || typeof el.closest !== 'function') return;
        const target = el.closest('a, button');
        if (!target) return;
        const rawHref = target.getAttribute('href') || (target as any).href || '';
        const href = typeof rawHref === 'string' ? rawHref : '';
        const text = (target.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60);

        // Tel / WhatsApp
        if (href.startsWith('tel:') || href.includes('wa.me') || href.includes('whatsapp') || href.includes('api.whatsapp.com')) {
          const eventId = uid('tel');
          dl({ event: 'TelClick', click_text: text, click_url: href, event_id: eventId, eventID: eventId });
          fbTrack('TelClick', { click_text: text, click_url: href }, true, eventId);
          return;
        }

        // Outbound link
        if (href && /^https?:\/\//i.test(href) && !href.includes(window.location.hostname)) {
          const eventId = uid('out');
          dl({ event: 'OutboundClick', click_text: text, click_url: href, event_id: eventId, eventID: eventId });
          fbTrack('OutboundClick', { click_text: text, click_url: href }, true, eventId);
          return;
        }
      } catch {}
    }, { capture: true, passive: true });

    // Video tracking (HTML5 videos)
    document.addEventListener('play', (e) => {
      try {
        const el = e.target;
        if (el instanceof HTMLMediaElement) {
          const src = el.currentSrc || el.src || 'video';
          const eventId = uid('vid');
          dl({ event: 'WatchVideo', video_url: src, event_id: eventId, eventID: eventId });
          fbTrack('WatchVideo', { video_url: src }, true, eventId);
        }
      } catch {}
    }, { capture: true, passive: true });
  } catch {}
}
