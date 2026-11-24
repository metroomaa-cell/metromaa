import { getIntegrations, saveIntegrations, getSettings } from './store.js';

// Default templates for Bangladeshi e-commerce
export const DEFAULT_WA_SETTINGS = {
  enabled: true,
  connected: false,
  phone: '',
  device: 'WhatsApp Web',
  pairingCode: '',
  minGapSeconds: 30,
  geminiApiKey: 'AIzaSyCYfaZJHGLzBU9kOHYe2gANL63WVh-DmzE',
  visionMatcherEnabled: true,
  triggers: {
    incomplete: {
      enabled: true,
      delayMinutes: 2,
      template: 'আসসালামু আলাইকুম {name}! {store} থেকে লক্ষ্য করলাম আপনি {items} অর্ডার করার সময় চেকআউট সম্পন্ন করেননি। আপনি কি ক্যাশ অন ডেলিভারিতে অর্ডারটি কনফার্ম করতে চান? মোট মূল্য: ৳{total}।',
    },
    approved: {
      enabled: true,
      template: 'প্রিয় {name}, আপনার অর্ডার #{order_id} সফলভাবে কনফার্ম করা হয়েছে। আমরা দ্রুত পার্সেলটি প্রস্তুত করছি। মোট বিল: ৳{total}। ধন্যবাদ, {store}!',
    },
    shipped: {
      enabled: true,
      template: 'প্রিয় {name}, আপনার অর্ডার #{order_id} কুরিয়ারে ({courier}) বুকিং হয়েছে। ট্র্যাকিং কোড: {consignment}। লাইভ ট্র্যাকিং: {tracking_url}',
    },
    delivered: {
      enabled: true,
      template: `আসসালামু আলাইকুম {name}! 🌸
আপনার অর্ডার #{order_id} সফলভাবে ডেলিভারি সম্পন্ন হয়েছে।

{store}-এর ওপর আস্থা রাখার জন্য আপনাকে আন্তরিক ধন্যবাদ ও কৃতজ্ঞতা জানাচ্ছি! 💖
আশা করি আমাদের পণ্যটি আপনার শতভাগ মনমতো হয়েছে।

আমাদের প্রিমিয়াম ও এক্সক্লুসিভ কালেকশন দেখতে ঘুরে আসুন আমাদের Wellness Corner-এ:
👉 https://metrroma.com/shop/wellness-corner

যেকোনো প্রয়োজনে আমাদের সাথে যোগাযোগ করতে পারেন। আপনার দিনটি শুভ ও আনন্দময় হোক! ✨
— {store}`,
    },
    exchange: {
      enabled: true,
      template: 'প্রিয় {name}, আপনার অর্ডার #{original_order_id}-এর জন্য এক্সচেঞ্জ পার্সেল প্রস্তুত করে কুরিয়ারে পাঠানো হয়েছে। লাইভ ট্র্যাকিং: {tracking_url}। কুরিয়ার রাইডার নতুন পার্সেল দেওয়ার সময় দয়া করে আগের পার্সেলটি রাইডারের হাতে বুঝিয়ে দিন। প্রদেয় বিল: ৳{total}। ধন্যবাদ, {store}!',
    },
    cancelled: {
      enabled: true,
      template: 'প্রিয় {name}, আপনার অর্ডার #{order_id} বাতিল করা হয়েছে। প্রয়োজনে আমাদের সাথে যোগাযোগ করুন। ধন্যবাদ, {store}!',
    },
    night_confirmation: {
      enabled: true,
      allDay: true,
      delayMinutes: 1, // 1-2 min natural anti-ban delay after order
      confirmStatus: 'approved', // 'approved' or 'confirmed'
      template: `আসসালামু আলাইকুম {name}! 🌸
{store}-এ আপনার অর্ডারের জন্য আন্তরিক ধন্যবাদ। (অর্ডার: #{order_id})

ক্যাশ অন ডেলিভারিতে আপনার পার্সেলটি দ্রুত ডেলিভারি নিশ্চিত করতে:

✅ অর্ডারটি কনফার্ম করতে: 1 লিখে পাঠান
❌ অর্ডারটি বাতিল করতে: 2 লিখে পাঠান

💰 মোট প্রদেয় বিল: ৳{total} (ক্যাশ অন ডেলিভারি)
📦 আপনার পার্সেলটি সম্পূর্ণ গোপনীয় ও সুরক্ষিত প্যাকেজিংয়ে পাঠানো হবে।
— {store}`,
      replyConfirmTemplate: `ধন্যবাদ {name}! আপনার #{order_id} নম্বর অর্ডারটি সফলভাবে Approved (নিশ্চিত) করা হয়েছে। মোট বিল: ৳{total} (COD)। দ্রুত আপনার পার্সেলটি কুরিয়ারে হস্তান্তর করা হবে। 💖`,
      replyCancelTemplate: `আপনার অনুরোধ অনুযায়ী #{order_id} নম্বর অর্ডারটি বাতিল (Cancel) করা হয়েছে। ভবিষ্যতে আপনার সেবায় আবার সুযোগ পেলে আনন্দিত হব। ধন্যবাদ! 🌸`,
    },
  },
  logs: [],
};

export function getWhatsAppSettings() {
  const ig = getIntegrations();
  if (!ig.whatsapp) {
    ig.whatsapp = { ...DEFAULT_WA_SETTINGS };
    try { saveIntegrations(ig); } catch (_) {}
  }
  return {
    ...DEFAULT_WA_SETTINGS,
    ...ig.whatsapp,
    geminiApiKey: ig.whatsapp.geminiApiKey || DEFAULT_WA_SETTINGS.geminiApiKey || '',
    triggers: {
      ...DEFAULT_WA_SETTINGS.triggers,
      ...(ig.whatsapp.triggers || {}),
    },
  };
}

export function saveWhatsAppSettings(patch) {
  const ig = getIntegrations();
  const current = getWhatsAppSettings();
  const next = {
    ...current,
    ...patch,
    triggers: {
      ...current.triggers,
      ...(patch.triggers || {}),
    },
  };
  ig.whatsapp = next;
  saveIntegrations(ig);
  return next;
}

export function getBangladeshCurrentHour() {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Dhaka',
      hour: 'numeric',
      hour12: false,
    }).formatToParts(new Date());
    const hPart = parts.find((p) => p.type === 'hour');
    return hPart ? parseInt(hPart.value, 10) : (new Date().getUTCHours() + 6) % 24;
  } catch (_) {
    return (new Date().getUTCHours() + 6) % 24;
  }
}

export function isNightConfirmationTime(settings = null) {
  try {
    const wa = settings || getWhatsAppSettings();
    if (!wa.enabled) return false;
    const cfg = wa.triggers?.night_confirmation || {};
    if (cfg.enabled === false) return false;
    const bdHour = getBangladeshCurrentHour();
    const start = Number(cfg.startHour ?? 23);
    const end = Number(cfg.endHour ?? 8);
    if (start > end) {
      return bdHour >= start || bdHour < end;
    }
    return bdHour >= start && bdHour < end;
  } catch (err) {
    return false;
  }
}

function cleanBDPhone(phone) {
  const banglaDigits = { '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4', '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9' };
  let p = String(phone || '').replace(/[০-৯]/g, (d) => banglaDigits[d] || d).replace(/[^0-9]/g, '');
  if (p.startsWith('880')) p = p.slice(2);
  else if (p.startsWith('88')) p = p.slice(2);
  if (!p.startsWith('0') && p.length === 10 && p.startsWith('1')) p = '0' + p;
  return p;
}

export function formatWhatsAppMessage(template, order) {
  const st = getSettings();
  const store = st.storeName || 'Store';
  const name = order?.customer?.name || 'Sir/Mam';
  const orderId = order?.id || '';
  const total = order?.total || 0;
  const courier = order?.courier?.name || 'Courier';
  const consignment = order?.courier?.consignment || '';
  const phone = order?.customer?.phone || '';

  let trackingUrl = order?.courier?.url || '';
  if (trackingUrl && trackingUrl.includes('pathao.com/courier/tracking/')) {
    const p = phone ? cleanBDPhone(phone) : '';
    trackingUrl = `https://merchant.pathao.com/tracking?consignment_id=${encodeURIComponent(consignment)}${p ? `&phone=${encodeURIComponent(p)}` : ''}`;
  }
  if (!trackingUrl && consignment) {
    const cLow = String(courier).toLowerCase();
    if (cLow.includes('pathao')) {
      const p = phone ? cleanBDPhone(phone) : '';
      trackingUrl = `https://merchant.pathao.com/tracking?consignment_id=${encodeURIComponent(consignment)}${p ? `&phone=${encodeURIComponent(p)}` : ''}`;
    } else if (cLow.includes('steadfast')) {
      trackingUrl = `https://steadfast.com.bd/track/${encodeURIComponent(consignment)}`;
    }
  }
  const storeTrackingUrl = `https://metrroma.com/track?id=${encodeURIComponent(orderId)}`;
  if (!trackingUrl) trackingUrl = storeTrackingUrl;

  const address = order?.customer?.address || '';
  const items = (order?.items || []).map((i) => i.name || i.title || 'পণ্য').join(', ') || 'পণ্য';

  let formatted = String(template || '')
    .replace(/{name}/g, name)
    .replace(/{store}/g, store)
    .replace(/{order_id}/g, orderId)
    .replace(/{original_order_id}/g, order?.originalOrderId || orderId)
    .replace(/{total}/g, String(total))
    .replace(/{courier}/g, courier)
    .replace(/{consignment}/g, consignment)
    .replace(/{tracking_url}/g, trackingUrl)
    .replace(/{courier_tracking_url}/g, trackingUrl)
    .replace(/{store_tracking_url}/g, storeTrackingUrl)
    .replace(/{address}/g, address)
    .replace(/{items}/g, items);

  // Time-of-day contextualizer for 24/7 confirmation
  const bdHour = getBangladeshCurrentHour();
  const isNight = bdHour >= 23 || bdHour < 8;
  if (!isNight) {
    formatted = formatted
      .replace(/যেহেতু এখন অনেক রাত, তাই আপনাকে ফোনে কল করে বিরক্ত না করে হোয়াটসঅ্যাপে কনফার্মেশনের জন্য মেসেজ পাঠাচ্ছি।/g, 'আপনার ক্যাশ অন ডেলিভারি পার্সেলটি দ্রুত ডেলিভারি নিশ্চিত করতে:')
      .replace(/যেহেতু এখন অনেক রাত, তাই ফোনে কল না করে হোয়াটসঅ্যাপে কনফার্মেশনের জন্য মেসেজ পাঠাচ্ছি।/g, 'আপনার ক্যাশ অন ডেলিভারি পার্সেলটি দ্রুত ডেলিভারি নিশ্চিত করতে:');
  }

  // Anti-Ban entropy: invisible zero-width non-joiner creates a distinct hash per message
  const antiBanEntropy = '\u200C'.repeat(Math.floor(Math.random() * 4) + 1);
  return formatted + antiBanEntropy;
}

let baileysSender = null;
export function registerBaileysSender(fn) {
  baileysSender = fn;
}

export async function sendWhatsAppNotification(order, eventType) {
  const wa = getWhatsAppSettings();
  if (!wa.enabled) return { sent: false, reason: 'WhatsApp automation disabled' };

  const trigger = wa.triggers?.[eventType];
  if (!trigger || !trigger.enabled) {
    return { sent: false, reason: `Trigger ${eventType} is disabled` };
  }

  const phone = String(order?.customer?.phone || '').replace(/\D/g, '');
  if (!phone || phone.length < 10) {
    return { sent: false, reason: 'Invalid phone number' };
  }

  const formattedMsg = formatWhatsAppMessage(trigger.template, order);
  let dispatchResult = { sent: true };

  if (baileysSender) {
    try {
      dispatchResult = await baileysSender(phone, formattedMsg, order?.id, eventType);
    } catch (e) {
      console.warn('[WhatsApp Auto-Send Error]:', e?.message || e);
      dispatchResult = { sent: false, error: e?.message };
    }
  }

  const statusLabel = dispatchResult?.sent ? 'sent' : 'queued';
  console.log(`[WhatsApp Auto-Send] (${eventType}) -> ${phone} [${statusLabel}]: ${formattedMsg.slice(0, 80).replace(/\n/g, ' ')}...`);
  return { sent: dispatchResult?.sent !== false, log: dispatchResult?.log };
}

