import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const CATALOG = join(__dir, 'data', 'catalog.json');
const ORDERS = join(__dir, 'data', 'orders.json');
const SETTINGS = join(__dir, 'data', 'settings.json');

export const DEFAULT_SETTINGS = {
  storeName: 'dot.',
  announce: 'free discreet shipping over ৳2500 · cash on delivery nationwide',
  deliveryInside: 60,
  deliveryOutside: 120,
  freeShipThreshold: 2500,
  lowStockAt: 5,
  whatsapp: '',
  phone: '',
  gtmId: '',
  logo: '',
  favicon: '',
  sliders: [],
  fraudDetector: {
    enabled: true,
    cooldownHours: 24,
    maxOrdersPerDay: 5,
    minSecondsBetweenOrders: 30,
    blockByPhone: true,
    sameProductNotice: 'You have already placed an order for this item recently. Please wait before ordering again, or contact our support team.',
    maxOrdersNotice: 'You have reached the maximum daily order limit from this device. Please contact customer support for urgent orders.',
    rapidOrderNotice: 'Please wait a moment before submitting another order.',
  },
};

export function getSettings() {
  if (!existsSync(SETTINGS)) return { ...DEFAULT_SETTINGS };
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(readFileSync(SETTINGS, 'utf8')) }; }
  catch { return { ...DEFAULT_SETTINGS }; }
}

export function saveSettings(patch) {
  const next = { ...getSettings(), ...patch };
  writeFileSync(SETTINGS, JSON.stringify(next, null, 2));
  return next;
}

export function getCatalog() {
  return JSON.parse(readFileSync(CATALOG, 'utf8'));
}

export function getOrders() {
  if (!existsSync(ORDERS)) return [];
  return JSON.parse(readFileSync(ORDERS, 'utf8'));
}

export function saveOrders(orders) {
  writeFileSync(ORDERS, JSON.stringify(orders, null, 2));
}

export function addOrder(order) {
  const orders = getOrders();
  orders.unshift(order);
  saveOrders(orders);
  return order;
}

export function updateOrderStatus(id, status) {
  const orders = getOrders();
  const o = orders.find((x) => x.id === id);
  if (!o) return null;
  o.status = status;
  saveOrders(orders);
  return o;
}

export function updateOrder(id, patch) {
  const orders = getOrders();
  const o = orders.find((x) => x.id === id);
  if (!o) return null;
  if (typeof patch.status === 'string' && patch.status && patch.status !== o.status) {
    o.status = patch.status;
    o.history = o.history || [];
    o.history.push({ status: patch.status, at: new Date().toISOString() });
  }
  if (patch.courier && typeof patch.courier === 'object') {
    const c = patch.courier;
    o.courier = {
      name: String(c.name || '').trim(),
      consignment: String(c.consignment || '').trim(),
      phone: String(c.phone || '').trim(),
      url: String(c.url || '').trim(),
      accountId: c.accountId ? String(c.accountId) : (o.courier?.accountId || ''),
      liveStatus: c.liveStatus != null ? String(c.liveStatus) : (o.courier?.liveStatus || ''),
      lastSync: c.lastSync != null ? String(c.lastSync) : (o.courier?.lastSync || ''),
    };
  }
  if (typeof patch.adminNote === 'string') o.adminNote = patch.adminNote.slice(0, 500);

  if (patch.customer && typeof patch.customer === 'object') {
    o.customer = {
      ...o.customer,
      name: patch.customer.name != null ? String(patch.customer.name).trim() : o.customer.name,
      phone: patch.customer.phone != null ? String(patch.customer.phone).trim() : o.customer.phone,
      phone2: patch.customer.phone2 != null ? String(patch.customer.phone2).trim() : (o.customer.phone2 || ''),
      address: patch.customer.address != null ? String(patch.customer.address).trim() : o.customer.address,
      district: patch.customer.district != null ? String(patch.customer.district).trim() : (o.customer.district || ''),
      thana: patch.customer.thana != null ? String(patch.customer.thana).trim() : (o.customer.thana || ''),
      area: patch.customer.area != null ? String(patch.customer.area).trim() : (o.customer.area || ''),
      note: patch.customer.note != null ? String(patch.customer.note).trim() : (o.customer.note || ''),
    };
  }

  if (Array.isArray(patch.items)) {
    o.items = patch.items.map((it) => ({
      id: it.id || '',
      name: String(it.name || '').trim(),
      price: Math.max(0, parseInt(it.price, 10) || 0),
      qty: Math.max(1, parseInt(it.qty, 10) || 1),
      subtotal: Math.max(0, (parseInt(it.price, 10) || 0) * (parseInt(it.qty, 10) || 1)),
      image: it.image || '',
    }));
    o.itemsTotal = o.items.reduce((s, it) => s + it.subtotal, 0);
  }

  if (patch.delivery != null) {
    o.delivery = Math.max(0, parseInt(patch.delivery, 10) || 0);
  }
  if (patch.discount != null) {
    o.discount = Math.max(0, parseInt(patch.discount, 10) || 0);
  }
  if (patch.itemsTotal != null || Array.isArray(patch.items) || patch.delivery != null || patch.discount != null) {
    const itTot = o.itemsTotal != null ? o.itemsTotal : (o.items || []).reduce((s, it) => s + (it.subtotal || it.price * it.qty), 0);
    const del = o.delivery != null ? o.delivery : 0;
    const disc = o.discount != null ? o.discount : 0;
    o.total = Math.max(0, itTot + del - disc);
  } else if (patch.total != null) {
    o.total = Math.max(0, parseInt(patch.total, 10) || 0);
  }

  saveOrders(orders);
  return o;
}

export function saveCatalog(cat) {
  writeFileSync(CATALOG, JSON.stringify(cat, null, 2));
}

export function addProduct(p) {
  const cat = getCatalog();
  cat.products.push(p);
  saveCatalog(cat);
  return p;
}

export function updateProduct(id, patch) {
  const cat = getCatalog();
  const i = cat.products.findIndex((x) => x.id === id);
  if (i < 0) return null;
  cat.products[i] = { ...cat.products[i], ...patch, id };
  saveCatalog(cat);
  return cat.products[i];
}

export function deleteProduct(id) {
  const cat = getCatalog();
  const before = cat.products.length;
  cat.products = cat.products.filter((x) => x.id !== id);
  if (cat.products.length === before) return false;
  saveCatalog(cat);
  return true;
}

export function addCategory(c) {
  const cat = getCatalog();
  if (!c.slug || cat.categories.find((x) => x.slug === c.slug)) return null;
  cat.categories.push(c);
  saveCatalog(cat);
  return c;
}
export function updateCategory(slug, patch) {
  const cat = getCatalog();
  const i = cat.categories.findIndex((x) => x.slug === slug);
  if (i < 0) return null;
  cat.categories[i] = { ...cat.categories[i], ...patch, slug };
  saveCatalog(cat);
  return cat.categories[i];
}
export function deleteCategory(slug) {
  const cat = getCatalog();
  const n = cat.categories.length;
  cat.categories = cat.categories.filter((x) => x.slug !== slug);
  if (cat.categories.length === n) return false;
  saveCatalog(cat);
  return true;
}

const COUPONS = join(__dir, 'data', 'coupons.json');
export function getCoupons() {
  if (!existsSync(COUPONS)) return [];
  try { return JSON.parse(readFileSync(COUPONS, 'utf8')); } catch { return []; }
}
export function saveCoupons(c) { writeFileSync(COUPONS, JSON.stringify(c, null, 2)); }

const REVIEWS = join(__dir, 'data', 'reviews.json');
export function getReviews() {
  if (!existsSync(REVIEWS)) return {};
  try { return JSON.parse(readFileSync(REVIEWS, 'utf8')); } catch { return {}; }
}
export function saveReviews(r) { writeFileSync(REVIEWS, JSON.stringify(r, null, 2)); }

const USERS = join(__dir, 'data', 'users.json');
export function getUsers() {
  if (!existsSync(USERS)) return [];
  try { return JSON.parse(readFileSync(USERS, 'utf8')); } catch { return []; }
}
export function saveUsers(u) { writeFileSync(USERS, JSON.stringify(u, null, 2)); }

const INTEGRATIONS = join(__dir, 'data', 'integrations.json');
export const DEFAULT_INTEGRATIONS = {
  email: { enabled: false, provider: 'resend', resendApiKey: process.env.RESEND_API_KEY || '', adminEmail: 'metroomaa@gmail.com', host: '', port: 587, secure: false, user: '', pass: '', fromName: 'dot.', fromEmail: 'admin@dot.com' },
  sms: { enabled: false, url: '', method: 'GET', senderId: '', apiKey: '', templatePlaced: 'dot.: order {id} received. total {total}. we will call to confirm. track: {track}', templateStatus: 'dot.: order {id} is now {status}. {courier}' },
  couriers: [], // [{ id, provider, label, enabled, apiBase, apiKey, apiSecret, extra }]
  tracking: { fbEnabled: false, fbPixelId: '', fbToken: '', fbTestCode: '', ttkEnabled: false, ttkPixelId: '', ttkToken: '' },
  fraud: { enabled: false, url: '', method: 'GET', headers: '', totalPath: '', successPath: '', cancelPath: '' },
};
export function getIntegrations() {
  if (!existsSync(INTEGRATIONS)) return JSON.parse(JSON.stringify(DEFAULT_INTEGRATIONS));
  try {
    const saved = JSON.parse(readFileSync(INTEGRATIONS, 'utf8'));
    return {
      email: { ...DEFAULT_INTEGRATIONS.email, ...(saved.email || {}) },
      sms: { ...DEFAULT_INTEGRATIONS.sms, ...(saved.sms || {}) },
      couriers: Array.isArray(saved.couriers) ? saved.couriers : [],
      tracking: { ...DEFAULT_INTEGRATIONS.tracking, ...(saved.tracking || {}) },
      fraud: { ...DEFAULT_INTEGRATIONS.fraud, ...(saved.fraud || {}) },
    };
  } catch { return JSON.parse(JSON.stringify(DEFAULT_INTEGRATIONS)); }
}
export function saveIntegrations(next) { writeFileSync(INTEGRATIONS, JSON.stringify(next, null, 2)); return next; }

const LANDINGS = join(__dir, 'data', 'landings.json');

export const DEFAULT_LOVELOCK_LANDING = {
  id: 'landing_lovelock',
  title: 'ম্যাজিক লাভ লক কনডম',
  slug: 'lovelock',
  aliases: ['love-lock', 'magic-condom'],
  status: 'live',
  freeDelivery: true,
  badgeTop: '১০০% অরিজিনাল প্রিমিয়াম কোয়ালিটি নিশ্চিত',
  badgeGuarantee: 'একমাত্র আমরাই দিচ্ছি ৩ দিনের রিপ্লেসমেন্ট গ্যারান্টি',
  headline: 'ম্যাজিক লাভ লক কনডম',
  subtitle: 'এই কনডমটি ব্যবহারে পুরুষাঙ্গ ১ থেকে ১.৫ ইঞ্চি পর্যন্ত সুগঠিত দেখায় এবং মিলনের স্থায়িত্ব ৩০ থেকে ৪০ মিনিট পর্যন্ত বৃদ্ধি করতে সহায়তা করে। কম দামি নকল পণ্য এড়িয়ে অরিজিনাল পণ্য কিনুন।',
  videoUrl: '/landing/lovelock-video.mp4',
  videoBadge: 'ভিডিওতে পণ্যের আসল গঠন, লক সিস্টেম এবং নিখুঁত ব্যবহার প্রণালী দেখুন',
  productTitle: 'লাভ লক ম্যাজিক কনডম',
  productTagline: 'বিশেষ সিলিকন লক প্রযুক্তিসম্পন্ন — যা ব্যবহারে আনে দীর্ঘস্থায়ী পরিতৃপ্তি এবং পরম আত্মবিশ্বাস।',
  heroImage: '/landing/banner-product.png',
  packageTitle: 'লাভ লক ম্যাজিকাল কনডম (একক প্যাক)',
  offerPriceText: 'অফার মূল্য মাত্র ৯৯৯ টাকা',
  freeDeliveryText: '(সারা বাংলাদেশে হোম ডেলিভারি সম্পূর্ণ ফ্রি!)',
  benefitsHeading: 'কেন নিবেন এই ম্যাজিক কনডম?',
  benefits: [
    'এটির পুরুত্ব ৬ মিলিমিটার এবং সম্পূর্ণ দৈর্ঘ্য ৬.৭ ইঞ্চি, যা দেয় আরামদায়ক ও প্রাকৃতিক অনুভূতি।',
    'এই প্রিমিয়াম কনডমটি ৭০০ থেকে ৮০০ বার অথবা ১-২ বছর অনায়াসে ওয়াশ করে ব্যবহার করা যায়।',
    'এটি ব্যবহারে মিলনের স্থায়িত্ব স্বাভাবিকের চেয়ে ৩০ থেকে ৪০ মিনিট পর্যন্ত বৃদ্ধি পেতে সাহায্য করে।',
    'কনডমটির সামনের অংশে ১ থেকে ১.৫ ইঞ্চি ভরাট সিলিকন রয়েছে, যা গোপনাঙ্গকে আরো দীর্ঘ ও আকর্ষণীয় দেখায়।',
    'এটি ফ্রি-সাইজ ও সুপার স্ট্রেচেবল সিলিকনে তৈরি—যেকোনো সাইজের জন্য শতভাগ মানানসই এবং বিশেষ লক সিস্টেমের কারণে মিলনের সময় খুলে যাওয়ার ভয় থাকে না।',
    'আন্তর্জাতিক মানসম্পন্ন ১০০% খাঁটি মেডিকেল গ্রেড TPE সিলিকন দিয়ে তৈরি, যা ত্বকের জন্য সম্পূর্ণ নিরাপদ ও অ্যালার্জি-মুক্ত।'
  ],
  usageHeading: 'ব্যবহারের নিয়মাবলী :',
  usageSteps: [
    'ব্যবহারের পূর্বে সামান্য পরিমাণ ওয়াটার-বেসড লুব্রিকেন্ট বা খাঁটি তেল লাগিয়ে নিন।',
    'কনডমের ছিদ্র দিয়ে প্রবেশ করিয়ে নিচের লক সিস্টেমটি সঠিকভাবে সেট করুন যাতে ব্যবহারের সময় পিছলে না যায়।',
    'মিলন শেষে সাধারণ কুসুম গরম পানি ও সাবান দিয়ে পরিষ্কার করে ছায়াযুক্ত স্থানে শুকিয়ে রাখুন।',
    'সরাসরি প্রখর রোদে না রেখে বাক্সে বা শুকনো ঠান্ডা জায়গায় সংরক্ষণ করুন।'
  ],
  usageImage: '/landing/usage-guide.jpg',
  usageCaption: 'সহজ লক সিস্টেম — শতভাগ নিরাপদ ফিটিং',
  reviews: [
    '/landing/review-1.png',
    '/landing/review-2.png',
    '/landing/review-3.png',
    '/landing/review-4.png'
  ],
  reviewsBadge: '১,৪০০+ ভেরিফায়েড ক্রেতার সন্তুষ্টি',
  reviewsTitle: 'বাস্তব কাস্টমার অভিজ্ঞতা ও রিভিউ',
  guaranteeBadge: 'শতভাগ সন্তুষ্টি ও নিশ্চিন্ত ক্রয়ের অঙ্গীকার',
  guaranteeText: 'আমাদের প্রদর্শিত পণ্যের সাথে প্রাপ্ত পণ্যের মিল না থাকলে এক টাকাও দিতে হবে না, সরাসরি পার্সেল রিটার্ন করতে পারবেন। আর পণ্য পছন্দ না হলেও ডেলিভারি চার্জ দিয়ে রিটার্ন করার সুযোগ রয়েছে। যেকোনো প্রশ্ন বা বিস্তারিত জানতে কল করুন।',
  phone: '09638752122',
  whatsapp: '8801351107157',
  packages: [
    {
      id: 'pmv7bramh',
      title: 'যাদের পেনিস ৪ ইঞ্চি থেকে ৫.৫ ইঞ্চি তাদের জন্য ৬.৭ দাম',
      price: 999,
      originalPrice: 1500,
      image: '/landing/package-6-7.jpg',
      popular: true
    },
    {
      id: 'lovelock-5-7',
      title: '৩.৫ থেকে ৪ ইঞ্চি পেনিস এর জন্য সাইজ ৫.৭',
      price: 1190,
      originalPrice: 1750,
      image: '/landing/package-5-7.jpg',
      popular: false
    }
  ]
};

export function getLandings() {
  if (!existsSync(LANDINGS)) {
    saveLandings([DEFAULT_LOVELOCK_LANDING]);
    return [DEFAULT_LOVELOCK_LANDING];
  }
  try {
    const list = JSON.parse(readFileSync(LANDINGS, 'utf8'));
    if (!Array.isArray(list) || list.length === 0) {
      saveLandings([DEFAULT_LOVELOCK_LANDING]);
      return [DEFAULT_LOVELOCK_LANDING];
    }
    return list;
  } catch {
    return [DEFAULT_LOVELOCK_LANDING];
  }
}

export function saveLandings(list) {
  writeFileSync(LANDINGS, JSON.stringify(list, null, 2));
}

export function getLandingBySlug(slug) {
  const s = String(slug || '').toLowerCase().trim();
  const list = getLandings();
  const found = list.find((L) =>
    (L.slug && L.slug.toLowerCase() === s) ||
    (Array.isArray(L.aliases) && L.aliases.some((a) => a.toLowerCase() === s))
  );
  if (found) return found;
  if (!s || s === 'lovelock' || s === 'love-lock' || s === 'magic-condom') {
    return list[0] || DEFAULT_LOVELOCK_LANDING;
  }
  return null;
}

export function addLanding(landing) {
  const list = getLandings();
  list.push(landing);
  saveLandings(list);
  return landing;
}

export function updateLanding(id, patch) {
  const list = getLandings();
  const idx = list.findIndex((L) => L.id === id || L.slug === id);
  if (idx < 0) return null;
  list[idx] = { ...list[idx], ...patch };
  saveLandings(list);
  return list[idx];
}

export function deleteLanding(id) {
  const list = getLandings();
  const next = list.filter((L) => L.id !== id && L.slug !== id);
  if (next.length === list.length) return false;
  saveLandings(next);
  return true;
}
