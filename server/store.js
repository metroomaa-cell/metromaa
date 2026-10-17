import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dir, 'data');
const PERSISTENT_DIR = join(DATA_DIR, 'persistent');
const BACKUPS_DIR = join(DATA_DIR, 'backups');

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
if (!existsSync(PERSISTENT_DIR)) mkdirSync(PERSISTENT_DIR, { recursive: true });
if (!existsSync(BACKUPS_DIR)) mkdirSync(BACKUPS_DIR, { recursive: true });

// Primary file paths
const CATALOG = join(DATA_DIR, 'catalog.json');
const PERSISTENT_CATALOG = join(PERSISTENT_DIR, 'catalog.json');
const BACKUP_CATALOG = join(DATA_DIR, 'catalog.metrroma.backup.json');

const ORDERS = join(DATA_DIR, 'orders.json');
const PERSISTENT_ORDERS = join(PERSISTENT_DIR, 'orders.json');

const SETTINGS = join(DATA_DIR, 'settings.json');
const PERSISTENT_SETTINGS = join(PERSISTENT_DIR, 'settings.json');
const BACKUP_SETTINGS = join(DATA_DIR, 'settings.metrroma.backup.json');

const COLORS = join(DATA_DIR, 'colors.json');
const PERSISTENT_COLORS = join(PERSISTENT_DIR, 'colors.json');

const CUSTOMERS = join(DATA_DIR, 'customers.json');
const PERSISTENT_CUSTOMERS = join(PERSISTENT_DIR, 'customers.json');

const COUPONS = join(DATA_DIR, 'coupons.json');
const PERSISTENT_COUPONS = join(PERSISTENT_DIR, 'coupons.json');

const REVIEWS = join(DATA_DIR, 'reviews.json');
const PERSISTENT_REVIEWS = join(PERSISTENT_DIR, 'reviews.json');

const USERS = join(DATA_DIR, 'users.json');
const PERSISTENT_USERS = join(PERSISTENT_DIR, 'users.json');

const INTEGRATIONS = join(DATA_DIR, 'integrations.json');
const PERSISTENT_INTEGRATIONS = join(PERSISTENT_DIR, 'integrations.json');

const LANDINGS = join(DATA_DIR, 'landings.json');
const PERSISTENT_LANDINGS = join(PERSISTENT_DIR, 'landings.json');

export const DEFAULT_COLORS = [
  { id: 'jet-black', name: 'Jet Black', hex: '#111111' },
  { id: 'pure-white', name: 'Pure White', hex: '#FFFFFF' },
  { id: 'pearl-white', name: 'Pearl / Off-White', hex: '#F8F9FA' },
  { id: 'charcoal-grey', name: 'Charcoal Grey', hex: '#495057' },
  { id: 'silver', name: 'Silver / Metallic', hex: '#C0C0C0' },
  { id: 'gold', name: 'Luxury Gold', hex: '#D4AF37' },
  { id: 'rose-gold', name: 'Rose Gold', hex: '#B76E79' },
  { id: 'gunmetal', name: 'Gunmetal / Matte Grey', hex: '#2C3539' },
  { id: 'navy-blue', name: 'Navy Blue', hex: '#1A2B4C' },
  { id: 'royal-blue', name: 'Royal Blue', hex: '#2563EB' },
  { id: 'sky-blue', name: 'Sky Blue', hex: '#87CEEB' },
  { id: 'deep-maroon', name: 'Deep Maroon', hex: '#58111A' },
  { id: 'burgundy', name: 'Burgundy / Wine', hex: '#800020' },
  { id: 'dusty-rose', name: 'Dusty Rose', hex: '#DCAE96' },
  { id: 'emerald-green', name: 'Emerald Green', hex: '#1B4D3E' },
  { id: 'olive-green', name: 'Olive Green', hex: '#556B2F' },
  { id: 'mint-green', name: 'Mint Green', hex: '#98FF98' },
  { id: 'mocha-brown', name: 'Mocha Brown', hex: '#4A2E1B' },
  { id: 'tan-camel', name: 'Tan / Camel', hex: '#C19A6B' },
  { id: 'desert-beige', name: 'Desert Beige', hex: '#D9CBB7' },
  { id: 'chocolate', name: 'Dark Chocolate', hex: '#3D2314' },
  { id: 'tortoise', name: 'Tortoise Shell / Amber', hex: '#8B4513' },
  { id: 'lavender', name: 'Lavender', hex: '#E6E6FA' },
  { id: 'coral', name: 'Peach / Coral', hex: '#F88379' },
];

export const DEFAULT_SETTINGS = {
  storeName: 'METRROMA',
  announce: '✨ FREE SHIPPING ON ORDERS OVER ৳2500 · 100% AUTHENTIC LIFESTYLE & GIFTS · CASH ON DELIVERY NATIONWIDE',
  deliveryInside: 80,
  deliveryOutside: 130,
  freeShipThreshold: 2500,
  lowStockAt: 5,
  whatsapp: '8801878374762',
  phone: '8801878374762',
  gtmId: 'GTM-WM964FQV',
  fbPixelId: '1122829254194671',
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

// Safe generic reader that checks persistent copy first, then standard path, then backup/default
function readSafe(persistentPath, stdPath, defaultVal, backupPath = null) {
  try {
    if (existsSync(persistentPath)) {
      const parsed = JSON.parse(readFileSync(persistentPath, 'utf8'));
      if (parsed != null) return parsed;
    }
  } catch (_) {}
  try {
    if (existsSync(stdPath)) {
      const parsed = JSON.parse(readFileSync(stdPath, 'utf8'));
      if (parsed != null) {
        try { writeFileSync(persistentPath, JSON.stringify(parsed, null, 2)); } catch (_) {}
        return parsed;
      }
    }
  } catch (_) {}
  if (backupPath) {
    try {
      if (existsSync(backupPath)) {
        const parsed = JSON.parse(readFileSync(backupPath, 'utf8'));
        if (parsed != null) {
          try {
            writeFileSync(persistentPath, JSON.stringify(parsed, null, 2));
            writeFileSync(stdPath, JSON.stringify(parsed, null, 2));
          } catch (_) {}
          return parsed;
        }
      }
    } catch (_) {}
  }
  return defaultVal;
}

// Safe writer that writes to persistent storage (untracked by git) and standard storage
function writeSafe(persistentPath, stdPath, val, backupPrefix = null) {
  const jsonStr = JSON.stringify(val, null, 2);
  try { writeFileSync(persistentPath, jsonStr); } catch (e) { console.error('[Store] Persistent write error:', e.message); }
  try { writeFileSync(stdPath, jsonStr); } catch (e) { console.error('[Store] Standard write error:', e.message); }
  if (backupPrefix) {
    try {
      const day = new Date().toISOString().slice(0, 10);
      writeFileSync(join(BACKUPS_DIR, `${backupPrefix}-${day}.json`), jsonStr);
    } catch (_) {}
  }
}

export function getSettings() {
  const base = { ...DEFAULT_SETTINGS };
  const saved = readSafe(PERSISTENT_SETTINGS, SETTINGS, {}, BACKUP_SETTINGS);
  return { ...base, ...saved };
}

export function saveSettings(patch) {
  const next = { ...getSettings(), ...patch };
  writeSafe(PERSISTENT_SETTINGS, SETTINGS, next, 'settings');
  return next;
}

export function getCatalog() {
  // First, verify persistent catalog
  try {
    if (existsSync(PERSISTENT_CATALOG)) {
      const cat = JSON.parse(readFileSync(PERSISTENT_CATALOG, 'utf8'));
      if (cat && Array.isArray(cat.products) && cat.products.length > 0) {
        // If standard CATALOG is missing or was wiped by git, restore it immediately
        try {
          if (!existsSync(CATALOG) || (JSON.parse(readFileSync(CATALOG, 'utf8')).products || []).length === 0) {
            writeFileSync(CATALOG, JSON.stringify(cat, null, 2));
          }
        } catch (_) {
          try { writeFileSync(CATALOG, JSON.stringify(cat, null, 2)); } catch (_) {}
        }
        return cat;
      }
    }
  } catch (_) {}

  // Fallback to standard catalog
  try {
    if (existsSync(CATALOG)) {
      const cat = JSON.parse(readFileSync(CATALOG, 'utf8'));
      if (cat && Array.isArray(cat.products) && cat.products.length > 0) {
        try { writeFileSync(PERSISTENT_CATALOG, JSON.stringify(cat, null, 2)); } catch (_) {}
        return cat;
      }
    }
  } catch (_) {}

  // Emergency fallback to Metrroma immutable snapshot
  try {
    if (existsSync(BACKUP_CATALOG)) {
      const cat = JSON.parse(readFileSync(BACKUP_CATALOG, 'utf8'));
      if (cat && Array.isArray(cat.products) && cat.products.length > 0) {
        try {
          writeFileSync(PERSISTENT_CATALOG, JSON.stringify(cat, null, 2));
          writeFileSync(CATALOG, JSON.stringify(cat, null, 2));
        } catch (_) {}
        return cat;
      }
    }
  } catch (_) {}

  return { products: [], categories: [] };
}

export function saveCatalog(cat) {
  if (!cat || !Array.isArray(cat.products)) return;
  writeSafe(PERSISTENT_CATALOG, CATALOG, cat, 'catalog');
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

export function getOrders() {
  const list = readSafe(PERSISTENT_ORDERS, ORDERS, []);
  return Array.isArray(list) ? list : [];
}

export function saveOrders(orders) {
  if (!Array.isArray(orders)) return;
  writeSafe(PERSISTENT_ORDERS, ORDERS, orders, 'orders');
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

export function getCoupons() {
  const list = readSafe(PERSISTENT_COUPONS, COUPONS, []);
  return Array.isArray(list) ? list : [];
}
export function saveCoupons(c) {
  writeSafe(PERSISTENT_COUPONS, COUPONS, Array.isArray(c) ? c : []);
}

export function getReviews() {
  const r = readSafe(PERSISTENT_REVIEWS, REVIEWS, {});
  return typeof r === 'object' && r !== null ? r : {};
}
export function saveReviews(r) {
  writeSafe(PERSISTENT_REVIEWS, REVIEWS, typeof r === 'object' && r !== null ? r : {});
}

export function getUsers() {
  const u = readSafe(PERSISTENT_USERS, USERS, []);
  return Array.isArray(u) ? u : [];
}
export function saveUsers(u) {
  writeSafe(PERSISTENT_USERS, USERS, Array.isArray(u) ? u : []);
}

export const DEFAULT_INTEGRATIONS = {
  email: { enabled: true, provider: 'resend', resendApiKey: process.env.RESEND_API_KEY || '', adminEmail: 'metroomaa@gmail.com', host: '', port: 587, secure: false, user: '', pass: '', fromName: 'METRROMA', fromEmail: 'admin@metrroma.com' },
  sms: { enabled: false, url: '', method: 'GET', senderId: '', apiKey: '', templatePlaced: 'METRROMA: order {id} received. total {total}. we will call to confirm. track: {track}', templateStatus: 'METRROMA: order {id} is now {status}. {courier}' },
  couriers: [],
  tracking: { fbEnabled: false, fbPixelId: '1122829254194671', fbToken: '', fbTestCode: '', ttkEnabled: false, ttkPixelId: '', ttkToken: '' },
  fraud: { enabled: false, url: '', method: 'GET', headers: '', totalPath: '', successPath: '', cancelPath: '' },
};

export function getIntegrations() {
  const saved = readSafe(PERSISTENT_INTEGRATIONS, INTEGRATIONS, {});
  return {
    email: { ...DEFAULT_INTEGRATIONS.email, ...(saved.email || {}) },
    sms: { ...DEFAULT_INTEGRATIONS.sms, ...(saved.sms || {}) },
    couriers: Array.isArray(saved.couriers) ? saved.couriers : [],
    tracking: { ...DEFAULT_INTEGRATIONS.tracking, ...(saved.tracking || {}) },
    fraud: { ...DEFAULT_INTEGRATIONS.fraud, ...(saved.fraud || {}) },
  };
}
export function saveIntegrations(next) {
  writeSafe(PERSISTENT_INTEGRATIONS, INTEGRATIONS, next);
  return next;
}

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
  const list = readSafe(PERSISTENT_LANDINGS, LANDINGS, null);
  if (!Array.isArray(list) || list.length === 0) {
    saveLandings([DEFAULT_LOVELOCK_LANDING]);
    return [DEFAULT_LOVELOCK_LANDING];
  }
  return list;
}

export function saveLandings(list) {
  writeSafe(PERSISTENT_LANDINGS, LANDINGS, list);
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

export function getColors() {
  const list = readSafe(PERSISTENT_COLORS, COLORS, null);
  if (!Array.isArray(list) || list.length === 0) {
    saveColors(DEFAULT_COLORS);
    return DEFAULT_COLORS;
  }
  return list;
}

export function saveColors(colors) {
  writeSafe(PERSISTENT_COLORS, COLORS, colors);
  return colors;
}

export function addColor({ name, hex }) {
  if (!name || !name.trim()) return null;
  const list = getColors();
  const cleanName = name.trim();
  const cleanHex = (hex && hex.trim()) || '#111111';
  const existing = list.find((c) => c.name.toLowerCase() === cleanName.toLowerCase());
  if (existing) {
    existing.hex = cleanHex;
    saveColors(list);
    return existing;
  }
  const id = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || ('color-' + Date.now());
  const item = { id, name: cleanName, hex: cleanHex };
  list.push(item);
  saveColors(list);
  return item;
}

export function deleteColor(idOrName) {
  const list = getColors();
  const next = list.filter((c) => c.id !== idOrName && c.name.toLowerCase() !== idOrName.toLowerCase());
  saveColors(next);
  return next;
}

export function getCustomers() {
  const list = readSafe(PERSISTENT_CUSTOMERS, CUSTOMERS, []);
  return Array.isArray(list) ? list : [];
}

export function saveCustomers(list) {
  writeSafe(PERSISTENT_CUSTOMERS, CUSTOMERS, list);
  return list;
}

export function getCustomerByPhone(phone) {
  if (!phone) return null;
  const clean = String(phone).replace(/\D/g, '').slice(-11);
  return getCustomers().find((c) => String(c.phone).replace(/\D/g, '').slice(-11) === clean) || null;
}

export function saveCustomer(cust) {
  if (!cust || !cust.phone) return null;
  const list = getCustomers();
  const clean = String(cust.phone).replace(/\D/g, '').slice(-11);
  const idx = list.findIndex((c) => String(c.phone).replace(/\D/g, '').slice(-11) === clean);
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...cust, updatedAt: new Date().toISOString() };
    saveCustomers(list);
    return list[idx];
  } else {
    const item = { ...cust, createdAt: cust.createdAt || new Date().toISOString() };
    list.unshift(item);
    saveCustomers(list);
    return item;
  }
}

// Persistent Storage Protection Initializer (Called on server startup)
export function initStorageProtection() {
  try {
    const cat = getCatalog();
    const orders = getOrders();
    const settings = getSettings();
    const customers = getCustomers();
    console.log(`[StorageProtection] Live data secured. Products: ${(cat.products || []).length}, Categories: ${(cat.categories || []).length}, Orders: ${orders.length}, Customers: ${customers.length}, Store: ${settings.storeName}`);
    
    // Create an automatic startup snapshot
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const snapshotPath = join(BACKUPS_DIR, `startup_snapshot_${ts}.json`);
    writeFileSync(snapshotPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      productsCount: (cat.products || []).length,
      categoriesCount: (cat.categories || []).length,
      ordersCount: orders.length,
      customersCount: customers.length,
      storeName: settings.storeName
    }, null, 2));

    // Prune snapshots older than 30 days
    const now = Date.now();
    const maxAge = 30 * 24 * 60 * 60 * 1000;
    const files = readdirSync(BACKUPS_DIR);
    for (const f of files) {
      if (f.startsWith('startup_snapshot_') && f.endsWith('.json')) {
        const full = join(BACKUPS_DIR, f);
        try {
          const stats = statSync(full);
          if (now - stats.mtimeMs > maxAge) {
            unlinkSync(full);
          }
        } catch (_) {}
      }
    }
  } catch (err) {
    console.error('[StorageProtection] Startup check error:', err.message);
  }
}
