import webpush from 'web-push';
import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { getPersistentDataDirectory, getSettings } from './store.js';

const DATA_ROOT = getPersistentDataDirectory();
try {
  if (!existsSync(DATA_ROOT)) mkdirSync(DATA_ROOT, { recursive: true });
} catch {}

const VAPID_FILE = join(DATA_ROOT, 'push_vapid.json');
const SUBSCRIBERS_FILE = join(DATA_ROOT, 'push_subscribers.json');
const SETTINGS_FILE = join(DATA_ROOT, 'push_popup_settings.json');

function readJsonSafe(filePath, fallback) {
  try {
    if (!existsSync(filePath)) return fallback;
    const raw = readFileSync(filePath, 'utf8');
    if (!raw || !raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(filePath, data) {
  try {
    const tmp = `${filePath}.${Date.now()}.tmp`;
    writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    renameSync(tmp, filePath);
    return true;
  } catch (err) {
    try {
      writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
      return true;
    } catch (e) {
      console.error('[PushEngine] Write failed:', e?.message || err?.message);
      return false;
    }
  }
}

function normalizeBDPhone(phone) {
  const banglaDigits = { '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4', '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9' };
  let p = String(phone || '').replace(/[০-৯]/g, (d) => banglaDigits[d] || d).replace(/[^0-9]/g, '');
  if (p.startsWith('880')) p = p.slice(2);
  else if (p.startsWith('88')) p = p.slice(2);
  if (!p.startsWith('0') && p.length === 10 && p.startsWith('1')) p = '0' + p;
  return p.slice(-11);
}

// Initialize or load VAPID keys once per store
let vapidKeys = readJsonSafe(VAPID_FILE, null);
if (!vapidKeys || !vapidKeys.publicKey || !vapidKeys.privateKey) {
  vapidKeys = {
    ...webpush.generateVAPIDKeys(),
    createdAt: new Date().toISOString(),
  };
  writeJsonAtomic(VAPID_FILE, vapidKeys);
  console.log('[PushEngine] Generated & persisted new VAPID keypair.');
}

try {
  webpush.setVapidDetails(
    'mailto:support@metrroma.com',
    vapidKeys.publicKey,
    vapidKeys.privateKey
  );
} catch (err) {
  console.error('[PushEngine] Failed to configure VAPID details:', err?.message || err);
}

export function getVapidPublicKey() {
  return vapidKeys?.publicKey || '';
}

export const DEFAULT_PUSH_POPUP_SETTINGS = {
  promoPopup: {
    enabled: false,
    mode: 'image_text', // 'image_only' | 'image_text'
    image: '',
    badge: 'SPECIAL OFFER ✨',
    title: 'Welcome to METRROMA',
    description: 'আপনার প্রথম অর্ডারে স্পেশাল ডিসকাউন্ট উপভোগ করুন। ১০০% গোপনীয় প্যাকিংয়ে সারা দেশে ক্যাশ অন ডেলিভারি।',
    couponCode: '',
    buttonText: 'অফার দেখুন',
    buttonLink: '/shop',
    targetPages: 'all', // 'all' | 'home' | 'wellness'
    delaySeconds: 6,
    frequency: 'once_per_day', // 'once_per_day' | 'once_per_session' | 'always'
    campaignId: 'camp_v1',
  },
  pushPrompt: {
    enabled: true,
    title: 'স্পেশাল অফার ও ডেলিভারি আপডেট পান 🔔',
    description: 'নতুন কালেকশন, সিক্রেট ডিসকাউন্ট ও অর্ডার আপডেট সবার আগে পেতে Allow করুন।',
    allowText: 'Allow করুন',
    dismissText: 'পরে',
    icon: '',
    delaySeconds: 12,
  },
  autoAlerts: {
    adminNewOrder: true,
    customerOrderStatus: true,
  },
  trustToast: {
    enabled: true,
    targetPages: 'wellness', // 'wellness' | 'all'
    icon: '',
    title: '🔒 ১০০% গোপনীয় প্যাকিং গ্যারান্টি',
    message: 'প্যাকেটের গায়ে কোনো পণ্যের নাম বা ছবি লেখা থাকে না। ডেলিভারিম্যানও জানবে না ভেতরে কী আছে।',
    delaySeconds: 4,
  },
  broadcastHistory: [],
};

export function getPushPopupSettings() {
  const saved = readJsonSafe(SETTINGS_FILE, null) || {};
  return {
    promoPopup: { ...DEFAULT_PUSH_POPUP_SETTINGS.promoPopup, ...(saved.promoPopup || {}) },
    pushPrompt: { ...DEFAULT_PUSH_POPUP_SETTINGS.pushPrompt, ...(saved.pushPrompt || {}) },
    autoAlerts: { ...DEFAULT_PUSH_POPUP_SETTINGS.autoAlerts, ...(saved.autoAlerts || {}) },
    trustToast: { ...DEFAULT_PUSH_POPUP_SETTINGS.trustToast, ...(saved.trustToast || {}) },
    broadcastHistory: Array.isArray(saved.broadcastHistory) ? saved.broadcastHistory : [],
  };
}

export function savePushPopupSettings(patch = {}, resetPromoDismissals = false) {
  const cur = getPushPopupSettings();
  const nextPromo = {
    ...cur.promoPopup,
    ...(patch.promoPopup || {}),
  };
  if (resetPromoDismissals) {
    nextPromo.campaignId = 'camp_' + Date.now().toString(36);
  }
  const next = {
    promoPopup: nextPromo,
    pushPrompt: { ...cur.pushPrompt, ...(patch.pushPrompt || {}) },
    autoAlerts: { ...cur.autoAlerts, ...(patch.autoAlerts || {}) },
    trustToast: { ...cur.trustToast, ...(patch.trustToast || {}) },
    broadcastHistory: Array.isArray(patch.broadcastHistory) ? patch.broadcastHistory : cur.broadcastHistory,
  };
  writeJsonAtomic(SETTINGS_FILE, next);
  return next;
}

export function getSubscribers() {
  const list = readJsonSafe(SUBSCRIBERS_FILE, []);
  return Array.isArray(list) ? list : [];
}

function saveSubscribers(list) {
  writeJsonAtomic(SUBSCRIBERS_FILE, list);
}

export function upsertPushSubscriber({ subscription, deviceId = '', phone = '', isAdmin = false, userAgent = '' }) {
  if (!subscription || !subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
    throw new Error('Invalid push subscription payload');
  }
  const list = getSubscribers();
  const now = new Date().toISOString();
  const cleanPhone = phone ? normalizeBDPhone(phone) : '';
  const idx = list.findIndex((s) => s.endpoint === subscription.endpoint);

  if (idx >= 0) {
    const existing = list[idx];
    list[idx] = {
      ...existing,
      keys: subscription.keys,
      deviceId: deviceId || existing.deviceId || '',
      phone: cleanPhone || existing.phone || '',
      isAdmin: isAdmin ? true : !!existing.isAdmin,
      userAgent: String(userAgent || existing.userAgent || '').slice(0, 220),
      updatedAt: now,
    };
  } else {
    list.push({
      id: 'sub_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      endpoint: subscription.endpoint,
      keys: subscription.keys,
      deviceId: String(deviceId || ''),
      phone: cleanPhone,
      isAdmin: !!isAdmin,
      userAgent: String(userAgent || '').slice(0, 220),
      createdAt: now,
      updatedAt: now,
    });
  }
  saveSubscribers(list);
  return getPushSubscriberStats();
}

export function linkSubscriberPhone(deviceId, phone) {
  const cleanDid = String(deviceId || '').trim();
  const cleanPhone = normalizeBDPhone(phone);
  if (!cleanDid || cleanDid === 'unknown_device' || !cleanPhone || cleanPhone.length < 10) return false;

  const list = getSubscribers();
  let changed = false;
  for (const s of list) {
    if (s.deviceId === cleanDid && s.phone !== cleanPhone) {
      s.phone = cleanPhone;
      s.updatedAt = new Date().toISOString();
      changed = true;
    }
  }
  if (changed) saveSubscribers(list);
  return changed;
}

export function removePushSubscriber(endpoint) {
  if (!endpoint) return false;
  const list = getSubscribers();
  const next = list.filter((s) => s.endpoint !== endpoint);
  if (next.length !== list.length) {
    saveSubscribers(next);
    return true;
  }
  return false;
}

export function getPushSubscriberStats() {
  const list = getSubscribers();
  const admins = list.filter((s) => s.isAdmin).length;
  const customers = list.filter((s) => !s.isAdmin).length;
  return {
    total: list.length,
    customers,
    admins,
  };
}

function getDefaultStoreIcon() {
  try {
    const st = getSettings() || {};
    const pp = getPushPopupSettings();
    return pp.pushPrompt?.icon || st.favicon || st.logo || '/logo_metrroma.png';
  } catch {
    return '/logo_metrroma.png';
  }
}

async function dispatchToSubscribers(targets, payload) {
  if (!Array.isArray(targets) || targets.length === 0) {
    return { sent: 0, failed: 0, expiredEndpoints: [] };
  }
  const expiredEndpoints = [];
  let sent = 0;
  let failed = 0;
  const jsonPayload = JSON.stringify(payload);

  const CONCURRENCY = 15;
  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    const batch = targets.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: sub.keys },
            jsonPayload,
            { TTL: 86400 }
          );
          sent += 1;
        } catch (err) {
          failed += 1;
          const status = err?.statusCode || err?.status;
          if (status === 404 || status === 410) {
            expiredEndpoints.push(sub.endpoint);
          }
        }
      })
    );
  }

  if (expiredEndpoints.length > 0) {
    const deadSet = new Set(expiredEndpoints);
    const remaining = getSubscribers().filter((s) => !deadSet.has(s.endpoint));
    saveSubscribers(remaining);
  }

  return { sent, failed, expiredEndpoints };
}

export async function sendBroadcastPush({
  title,
  body,
  image = '',
  icon = '',
  url = '/',
  target = 'all', // 'all' | 'admin_test'
  adminEndpoint = '',
}) {
  const cleanTitle = String(title || '').trim();
  const cleanBody = String(body || '').trim();
  if (!cleanTitle || !cleanBody) {
    throw new Error('Title and message are required');
  }

  const allSubs = getSubscribers();
  let targets = [];
  if (target === 'admin_test') {
    targets = allSubs.filter((s) => s.isAdmin || (adminEndpoint && s.endpoint === adminEndpoint));
  } else {
    targets = allSubs;
  }

  const resolvedIcon = icon || getDefaultStoreIcon();
  const payload = {
    title: cleanTitle,
    body: cleanBody,
    icon: resolvedIcon,
    badge: resolvedIcon,
    image: String(image || '').trim() || undefined,
    url: String(url || '/').trim() || '/',
    tag: 'secrate-promo-' + Date.now().toString(36),
  };

  const { sent, failed } = await dispatchToSubscribers(targets, payload);

  // Record in campaign history
  const cur = getPushPopupSettings();
  const entry = {
    id: 'bc_' + Date.now().toString(36),
    at: new Date().toISOString(),
    title: cleanTitle,
    body: cleanBody,
    image: String(image || '').trim(),
    url: payload.url,
    target,
    sent,
    failed,
    totalTargets: targets.length,
  };
  const nextHistory = [entry, ...(cur.broadcastHistory || [])].slice(0, 35);
  savePushPopupSettings({ broadcastHistory: nextHistory });

  return { ok: true, sent, failed, totalTargets: targets.length, entry };
}

export async function sendOrderPushNotifications(order, kind) {
  if (!order || !order.id) return;
  const settings = getPushPopupSettings();
  const allSubs = getSubscribers();
  if (allSubs.length === 0) return;
  const icon = getDefaultStoreIcon();

  // 1. Admin New Order Alert
  if (kind === 'placed' && settings.autoAlerts?.adminNewOrder) {
    const adminTargets = allSubs.filter((s) => s.isAdmin);
    if (adminTargets.length > 0) {
      const custName = order.customer?.name || 'Customer';
      const custPhone = order.customer?.phone || '';
      const itemCount = Array.isArray(order.items) ? order.items.reduce((sum, it) => sum + (Number(it.qty) || 1), 0) : 1;
      await dispatchToSubscribers(adminTargets, {
        title: `🔔 নতুন অর্ডার #${order.id} — Tk ${Number(order.total || 0).toLocaleString('en-US')}`,
        body: `${custName} (${custPhone}) • ${itemCount}টি পণ্য অর্ডার করেছেন`,
        icon,
        badge: icon,
        url: '/admin',
        tag: `admin-order-${order.id}`,
      });
    }
  }

  // 2. Discreet Customer Order Status Push (100% private — never reveals product names or images)
  if (kind === 'status' && settings.autoAlerts?.customerOrderStatus) {
    const status = String(order.status || '').toLowerCase();
    let title = '';
    let body = '';

    if (status === 'approved' || status === 'confirmed') {
      title = 'METRROMA — অর্ডার কনফার্ম হয়েছে ✨';
      body = `আপনার অর্ডার #${order.id} কনফার্ম করা হয়েছে এবং গোপনীয় প্যাকিংয়ে প্রস্তুত হচ্ছে।`;
    } else if (status === 'shipped') {
      const tracking = order.courier?.consignment ? ` (Tracking: ${order.courier.consignment})` : '';
      title = 'METRROMA — পার্সেল কুরিয়ারে পাঠানো হয়েছে 🚚';
      body = `আপনার অর্ডার #${order.id} ডেলিভারির জন্য পাঠানো হয়েছে${tracking}।`;
    } else if (status === 'delivered') {
      title = 'METRROMA — ডেলিভারি সম্পন্ন হয়েছে 💛';
      body = `আপনার অর্ডার #${order.id} সফলভাবে ডেলিভারি হয়েছে। METRROMA-এর সাথে থাকার জন্য ধন্যবাদ!`;
    }

    if (title && body) {
      const cleanOrderPhone = normalizeBDPhone(order.customer?.phone || '');
      const cleanDid = String(order.deviceId || '').trim();
      const customerTargets = allSubs.filter((s) => {
        if (cleanDid && cleanDid !== 'unknown_device' && s.deviceId === cleanDid) return true;
        if (cleanOrderPhone && cleanOrderPhone.length >= 10 && s.phone === cleanOrderPhone) return true;
        return false;
      });
      if (customerTargets.length > 0) {
        await dispatchToSubscribers(customerTargets, {
          title,
          body,
          icon,
          badge: icon,
          url: `/track?id=${encodeURIComponent(order.id)}`,
          tag: `order-status-${order.id}-${status}`,
        });
      }
    }
  }
}
