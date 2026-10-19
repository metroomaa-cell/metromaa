// Google Tag Manager + Meta Pixel + dataLayer tracking
let gtmLoaded = false;
let fbLoaded = false;

export function isAdminContext(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const p = (window.location.pathname || '').toLowerCase();
    const h = (window.location.hash || '').toLowerCase();
    return p.includes('/admin') || p.includes('/wp-admin') || h.includes('admin');
  } catch {
    return false;
  }
}

export function dl(data: Record<string, any>) {
  try {
    if (isAdminContext()) return;
    const w = window as any;
    w.dataLayer = w.dataLayer || [];
    w.dataLayer.push(data);
  } catch {}
}

export function fbTrack(name: string, data?: Record<string, any>, isCustom = true, eventId?: string) {
  try {
    if (isAdminContext()) return;
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

export function initFB(id: string) {
  try {
    if (isAdminContext()) return;
    if (fbLoaded || !id || !/^\d+$/.test(id.trim())) return;
    fbLoaded = true;
    const pid = id.trim();
    const w = window as any;
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

export function initGTM(id: string) {
  try {
    if (isAdminContext()) return;
    const w = window as any;
    if (gtmLoaded || !id || !/^GTM-[A-Z0-9]+$/i.test(id.trim())) return;
    const gid = id.trim();
    // If GTM is already present in HTML, do not reinject
    if (document.querySelector(`script[src*="${gid}"]`) || (w.google_tag_manager && w.google_tag_manager[gid])) {
      gtmLoaded = true;
      return;
    }
    gtmLoaded = true;
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
    dl({ event: 'view_item', event_id: eventId, eventID: eventId, ecommerce: { currency: CUR, value: p.price, items: [{ item_id: p.id, item_name: p.name, price: p.price, quantity: 1 }] } });
    dl({ event: 'ViewContent', event_id: eventId, eventID: eventId, content_name: p.name, content_ids: [p.id], content_type: 'product', value: p.price, currency: CUR });
    fbTrack('ViewContent', { content_name: p.name, content_ids: [p.id], content_type: 'product', value: p.price, currency: CUR }, false, eventId);
  } catch {}
}

// Add to cart
export function ecAdd(p: { id: string; name: string; price: number }, qty = 1) {
  try {
    const eventId = uid(`atc_${p.id}`);
    dl({ ecommerce: null });
    dl({ event: 'add_to_cart', event_id: eventId, eventID: eventId, ecommerce: { currency: CUR, value: p.price * qty, items: [{ item_id: p.id, item_name: p.name, price: p.price, quantity: qty }] } });
    dl({ event: 'AddToCart', event_id: eventId, eventID: eventId, content_name: p.name, content_ids: [p.id], content_type: 'product', value: p.price * qty, currency: CUR });
    fbTrack('AddToCart', { content_name: p.name, content_ids: [p.id], content_type: 'product', value: p.price * qty, currency: CUR }, false, eventId);
  } catch {}
}

// Begin checkout / InitiateCheckout
export function ecBeginCheckout(value: number, items: { id: string; name: string; price: number; qty: number }[]) {
  try {
    const eventId = uid('ic');
    dl({ ecommerce: null });
    dl({ event: 'begin_checkout', event_id: eventId, eventID: eventId, ecommerce: { currency: CUR, value, items: items.map((l) => ({ item_id: l.id, item_name: l.name, price: l.price, quantity: l.qty })) } });
    dl({ event: 'InitiateCheckout', event_id: eventId, eventID: eventId, value, currency: CUR, num_items: items.length });
    fbTrack('InitiateCheckout', { value, currency: CUR, num_items: items.length }, false, eventId);
  } catch {}
}

// Purchase
export function ecPurchase(id: string, value: number, items: { id: string; name: string; price: number; qty: number }[], source?: string) {
  try {
    const numValue = Math.round((Number(value) || 0) * 100) / 100;
    const contents = (items || []).map((l) => ({
      id: String(l.id),
      item_price: Number(l.price) || 0,
      quantity: Number(l.qty) || 1,
    }));
    const contentIds = (items || []).map((i) => String(i.id));
    const numItems = (items || []).reduce((sum, i) => sum + (Number(i.qty) || 1), 0);

    dl({ ecommerce: null });
    dl({
      event: 'purchase',
      event_id: String(id),
      eventID: String(id),
      value: numValue,
      currency: CUR,
      order_id: String(id),
      order_source: source || 'direct',
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
