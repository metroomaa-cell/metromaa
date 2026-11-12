import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync, copyFileSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

const __dir = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dir, 'data');
const PERSISTENT_DIR = join(DATA_DIR, 'persistent');
const LEGACY_BACKUPS_DIR = join(DATA_DIR, 'backups');

// External safe storage sitting completely outside the git repository (Hostinger protected space)
let EXTERNAL_DIR = process.env.PERSISTENT_DATA_DIR;
if (EXTERNAL_DIR?.startsWith('~/')) EXTERNAL_DIR = join(homedir(), EXTERNAL_DIR.slice(2));
// Hostinger deploys each release under builds/versions/<id>. Never use a
// release-relative directory as the default persistent store on Linux hosts.
if (!EXTERNAL_DIR && process.platform !== 'win32') EXTERNAL_DIR = join(homedir(), 'metrroma-data');
if (!EXTERNAL_DIR) {
  const storeBaseName = existsSync('/var/www/secrate_persistent_data') || __dir.includes('secrate') ? 'secrate_persistent_data' : 'metrroma_persistent_data';
  const candidates = [
    join(__dir, '..', '..', storeBaseName),
    join(__dir, '..', '..', '..', storeBaseName),
    join('/var/www', storeBaseName),
    join(__dir, '..', 'persistent_data')
  ];
  for (const cand of candidates) {
    try {
      if (!existsSync(cand)) mkdirSync(cand, { recursive: true });
      writeFileSync(join(cand, '.probe'), '1');
      unlinkSync(join(cand, '.probe'));
      EXTERNAL_DIR = cand;
      break;
    } catch (_) {}
  }
}
if (!EXTERNAL_DIR) EXTERNAL_DIR = join(DATA_DIR, 'persistent');
const BACKUPS_DIR = join(EXTERNAL_DIR, 'backups');

function copyMissingTree(sourceDir, targetDir) {
  if (!existsSync(sourceDir) || !statSync(sourceDir).isDirectory()) return 0;
  let copied = 0;
  mkdirSync(targetDir, { recursive: true });
  for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const source = join(sourceDir, entry.name);
    const target = join(targetDir, entry.name);
    if (entry.isDirectory()) copied += copyMissingTree(source, target);
    else if (entry.isFile() && !existsSync(target)) {
      try { copyFileSync(source, target); copied += 1; } catch (_) {}
    }
  }
  return copied;
}

function migrateHostingerVersionData() {
  if (process.platform === 'win32') return;
  const marker = join(EXTERNAL_DIR, '.hostinger-version-data-migrated-v1');
  if (existsSync(marker)) return;
  const versionsDir = join(homedir(), 'domains', 'metrroma.com', 'builds', 'versions');
  let versions = [];
  try {
    versions = readdirSync(versionsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({ name: entry.name, mtime: statSync(join(versionsDir, entry.name)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
  } catch { return; }

  const uploadsDir = join(EXTERNAL_DIR, 'uploads');
  const privateApkDir = join(EXTERNAL_DIR, 'private_apk');
  let copied = 0;
  for (const version of versions) {
    const root = join(versionsDir, version.name);
    for (const source of [join(root, 'metrroma_persistent_data'), join(root, 'server', 'data', 'persistent')]) {
      copied += copyMissingTree(source, EXTERNAL_DIR);
    }
    for (const source of [join(root, 'server', 'uploads'), join(root, 'server', 'data', 'persistent_uploads'), join(root, 'uploads')]) {
      copied += copyMissingTree(source, uploadsDir);
    }
    for (const source of [join(root, 'server', 'data', 'private_apk'), join(root, 'data', 'private_apk')]) {
      copied += copyMissingTree(source, privateApkDir);
    }
    copied += copyMissingTree(join(root, 'server', 'data', 'backups'), BACKUPS_DIR);
  }
  if (copied > 0) {
    writeFileSync(marker, new Date().toISOString(), { mode: 0o600 });
    console.log(`[Store] Migrated ${copied} legacy file(s) from Hostinger releases into stable storage.`);
  }
}

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
if (!existsSync(PERSISTENT_DIR)) mkdirSync(PERSISTENT_DIR, { recursive: true });
if (!existsSync(BACKUPS_DIR)) mkdirSync(BACKUPS_DIR, { recursive: true });
try { if (!existsSync(EXTERNAL_DIR)) mkdirSync(EXTERNAL_DIR, { recursive: true }); } catch (_) {}
copyMissingTree(LEGACY_BACKUPS_DIR, BACKUPS_DIR);
try { migrateHostingerVersionData(); } catch (error) { console.error('[Store] Legacy release migration failed:', error.message); }
console.log('[Store] Isolated external database locked at:', EXTERNAL_DIR);

// Primary file paths
const CATALOG = join(DATA_DIR, 'catalog.json');
const PERSISTENT_CATALOG = join(PERSISTENT_DIR, 'catalog.json');
const BACKUP_CATALOG = join(DATA_DIR, 'catalog.metrroma.backup.json');
const EXT_CATALOG = join(EXTERNAL_DIR, 'catalog.json');

const ORDERS = join(DATA_DIR, 'orders.json');
const PERSISTENT_ORDERS = join(PERSISTENT_DIR, 'orders.json');
const BACKUP_ORDERS = join(DATA_DIR, 'orders.metrroma.backup.json');
const EXT_ORDERS = join(EXTERNAL_DIR, 'orders.json');

const SETTINGS = join(DATA_DIR, 'settings.json');
const PERSISTENT_SETTINGS = join(PERSISTENT_DIR, 'settings.json');
const BACKUP_SETTINGS = join(DATA_DIR, 'settings.metrroma.backup.json');
const EXT_SETTINGS = join(EXTERNAL_DIR, 'settings.json');

const COLORS = join(DATA_DIR, 'colors.json');
const PERSISTENT_COLORS = join(PERSISTENT_DIR, 'colors.json');
const BACKUP_COLORS = join(DATA_DIR, 'colors.metrroma.backup.json');
const EXT_COLORS = join(EXTERNAL_DIR, 'colors.json');

const CUSTOMERS = join(DATA_DIR, 'customers.json');
const PERSISTENT_CUSTOMERS = join(PERSISTENT_DIR, 'customers.json');
const BACKUP_CUSTOMERS = join(DATA_DIR, 'customers.metrroma.backup.json');
const EXT_CUSTOMERS = join(EXTERNAL_DIR, 'customers.json');

const COUPONS = join(DATA_DIR, 'coupons.json');
const PERSISTENT_COUPONS = join(PERSISTENT_DIR, 'coupons.json');
const BACKUP_COUPONS = join(DATA_DIR, 'coupons.metrroma.backup.json');
const EXT_COUPONS = join(EXTERNAL_DIR, 'coupons.json');

const REVIEWS = join(DATA_DIR, 'reviews.json');
const PERSISTENT_REVIEWS = join(PERSISTENT_DIR, 'reviews.json');
const BACKUP_REVIEWS = join(DATA_DIR, 'reviews.metrroma.backup.json');
const EXT_REVIEWS = join(EXTERNAL_DIR, 'reviews.json');

const USERS = join(DATA_DIR, 'users.json');
const PERSISTENT_USERS = join(PERSISTENT_DIR, 'users.json');
const BACKUP_USERS = join(DATA_DIR, 'users.metrroma.backup.json');
const EXT_USERS = join(EXTERNAL_DIR, 'users.json');

const INTEGRATIONS = join(DATA_DIR, 'integrations.json');
const PERSISTENT_INTEGRATIONS = join(PERSISTENT_DIR, 'integrations.json');
const BACKUP_INTEGRATIONS = join(DATA_DIR, 'integrations.metrroma.backup.json');
const EXT_INTEGRATIONS = join(EXTERNAL_DIR, 'integrations.json');

const LANDINGS = join(DATA_DIR, 'landings.json');
const PERSISTENT_LANDINGS = join(PERSISTENT_DIR, 'landings.json');
const BACKUP_LANDINGS = join(DATA_DIR, 'landings.metrroma.backup.json');
const EXT_LANDINGS = join(EXTERNAL_DIR, 'landings.json');

const AUDIT_LOGS = join(DATA_DIR, 'audit_logs.json');
const PERSISTENT_AUDIT_LOGS = join(PERSISTENT_DIR, 'audit_logs.json');
const BACKUP_AUDIT_LOGS = join(DATA_DIR, 'audit_logs.metrroma.backup.json');
const EXT_AUDIT_LOGS = join(EXTERNAL_DIR, 'audit_logs.json');

const STAFF_ACTIVITY = join(DATA_DIR, 'staff_activity.json');
const PERSISTENT_STAFF_ACTIVITY = join(PERSISTENT_DIR, 'staff_activity.json');
const BACKUP_STAFF_ACTIVITY = join(DATA_DIR, 'staff_activity.metrroma.backup.json');
const EXT_STAFF_ACTIVITY = join(EXTERNAL_DIR, 'staff_activity.json');

const WA_CONTACTS = join(DATA_DIR, 'wa_chat_contacts.json');
const PERSISTENT_WA_CONTACTS = join(PERSISTENT_DIR, 'wa_chat_contacts.json');
const BACKUP_WA_CONTACTS = join(DATA_DIR, 'wa_chat_contacts.metrroma.backup.json');
const EXT_WA_CONTACTS = join(EXTERNAL_DIR, 'wa_chat_contacts.json');

export const getPersistentDataDirectory = () => EXTERNAL_DIR;

export const DEFAULT_SETTINGS = {
  storeName: 'SECRATE',
  announce: 'free discreet shipping over ৳2500 · cash on delivery nationwide',
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
  appearance: { font: 'Inter', accent: '#b48e4c', desktopColumns: 4, mobileColumns: 2, imageFit: 'contain' },
  homeContent: { en: {}, bn: {} },
  siteContent: { sections: { hero: true, quickCategories: true, collections: true, intro: true, featured: true, benefits: true, faq: true, newsletter: true }, textOverrides: {}, infoPages: {} },
  sliders: [],
  fraudDetector: {
    enabled: true,
    cooldownHours: 24,
    sameProductLimit: 1,
    maxOrdersPerDay: 1,
    maxOrdersPerIp: 2,
    minSecondsBetweenOrders: 30,
    blockByPhone: true,
    blockByIp: true,
    protectIncompleteOrders: true,
    applyOnLandingPages: true,
    sameProductNotice: 'You have already placed an order for this item recently. Please wait before ordering again, or contact our support team.',
    sameProductNoticeBn: 'আপনি ইতিমধ্যে এই পণ্যটির জন্য একটি অর্ডার করেছেন। নতুন অর্ডারের জন্য অপেক্ষা করুন অথবা আমাদের সাথে যোগাযোগ করুন।',
    maxOrdersNotice: 'You have reached the maximum daily order limit from this device. Please contact customer support for urgent orders.',
    maxOrdersNoticeBn: 'আপনার ডিভাইস থেকে আজকের সর্বোচ্চ অর্ডার সীমা পূর্ণ হয়েছে। প্রয়োজনীয় সহায়তায় যোগাযোগ করুন।',
    ipLimitNotice: 'Daily order limit reached from this network/IP address. Please contact customer support.',
    ipLimitNoticeBn: 'আপনার ইন্টারনেট নেটওয়ার্ক (IP) থেকে আজকের সর্বোচ্চ অর্ডারের সীমা অতিক্রম করেছে। সহায়তার জন্য যোগাযোগ করুন।',
    rapidOrderNotice: 'Please wait a moment before submitting another order.',
    rapidOrderNoticeBn: 'অনুগ্রহ করে নতুন অর্ডার সাবমিট করার পূর্বে কিছুক্ষণ অপেক্ষা করুন।',
  },
};

// Safe generic reader that checks external safe copy first (outside git), then persistent, then standard, then backup
function writeAtomic(targetPath, data) {
  mkdirSync(dirname(targetPath), { recursive: true });
  const tempPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tempPath, data, { flag: 'wx' });
  renameSync(tempPath, targetPath);
}

function readSafe(extPath, persistentPath, stdPath, defaultVal, backupPath = null) {
  try {
    if (extPath && existsSync(extPath)) {
      const parsed = JSON.parse(readFileSync(extPath, 'utf8'));
      if (parsed != null) return parsed;
    }
  } catch (_) {}
  try {
    if (existsSync(persistentPath)) {
      const parsed = JSON.parse(readFileSync(persistentPath, 'utf8'));
      if (parsed != null) {
        if (extPath) try { writeAtomic(extPath, JSON.stringify(parsed, null, 2)); } catch (_) {}
        return parsed;
      }
    }
  } catch (_) {}
  try {
    if (existsSync(stdPath)) {
      const parsed = JSON.parse(readFileSync(stdPath, 'utf8'));
      if (parsed != null) {
        if (extPath) try { writeAtomic(extPath, JSON.stringify(parsed, null, 2)); } catch (_) {}
        try { writeAtomic(persistentPath, JSON.stringify(parsed, null, 2)); } catch (_) {}
        return parsed;
      }
    }
  } catch (_) {}
  if (backupPath) {
    try {
      if (existsSync(backupPath)) {
        const parsed = JSON.parse(readFileSync(backupPath, 'utf8'));
        if (parsed != null) {
          if (extPath) try { writeAtomic(extPath, JSON.stringify(parsed, null, 2)); } catch (_) {}
          try {
            writeAtomic(persistentPath, JSON.stringify(parsed, null, 2));
          } catch (_) {}
          return parsed;
        }
      }
    } catch (_) {}
  }
  return defaultVal;
}

// Runtime writes stay outside tracked source data. Keep a second ignored copy and daily recovery snapshot.
function writeSafe(extPath, persistentPath, stdPath, val, backupPrefix = null, backupPath = null) {
  const jsonStr = JSON.stringify(val, null, 2);
  let durableCopies = 0;
  if (extPath) {
    try { writeAtomic(extPath, jsonStr); durableCopies += 1; } catch (e) { console.error('[Store] External write error:', e.message); }
  }
  try { writeAtomic(persistentPath, jsonStr); durableCopies += 1; } catch (e) { console.error('[Store] Persistent write error:', e.message); }
  if (!durableCopies) throw new Error('Could not safely persist data to external or persistent storage; source data was not overwritten.');
  if (backupPrefix) {
    try {
      const day = new Date().toISOString().slice(0, 10);
      writeAtomic(join(BACKUPS_DIR, `${backupPrefix}-${day}.json`), jsonStr);
    } catch (_) {}
  }
}

export function getSettings() {
  const base = { ...DEFAULT_SETTINGS };
  const saved = readSafe(EXT_SETTINGS, PERSISTENT_SETTINGS, SETTINGS, {}, BACKUP_SETTINGS);
  const savedAppearance = saved.appearance && typeof saved.appearance === 'object' && !Array.isArray(saved.appearance) ? saved.appearance : {};
  const savedHomeContent = saved.homeContent && typeof saved.homeContent === 'object' && !Array.isArray(saved.homeContent) ? saved.homeContent : {};
  const savedSiteContent = saved.siteContent && typeof saved.siteContent === 'object' && !Array.isArray(saved.siteContent) ? saved.siteContent : {};
  const savedSections = savedSiteContent.sections && typeof savedSiteContent.sections === 'object' && !Array.isArray(savedSiteContent.sections) ? savedSiteContent.sections : {};
  const savedTextOverrides = savedSiteContent.textOverrides && typeof savedSiteContent.textOverrides === 'object' && !Array.isArray(savedSiteContent.textOverrides) ? savedSiteContent.textOverrides : {};
  const savedInfoPages = savedSiteContent.infoPages && typeof savedSiteContent.infoPages === 'object' && !Array.isArray(savedSiteContent.infoPages) ? savedSiteContent.infoPages : {};
  const defaultSiteContent = DEFAULT_SETTINGS.siteContent;
  return {
    ...base, ...saved,
    appearance: { ...base.appearance, ...savedAppearance },
    homeContent: {
      en: { ...(savedHomeContent.en || {}) },
      bn: { ...(savedHomeContent.bn || {}) },
    },
    siteContent: { ...defaultSiteContent, ...savedSiteContent, sections: { ...defaultSiteContent.sections, ...savedSections }, textOverrides: { ...savedTextOverrides }, infoPages: { ...savedInfoPages } },
  };
}

export function saveSettings(patch) {
  const next = { ...getSettings(), ...patch };
  writeSafe(EXT_SETTINGS, PERSISTENT_SETTINGS, SETTINGS, next, 'settings', BACKUP_SETTINGS);
  return next;
}

export function getCatalog() {
  const prodMap = new Map();
  const catMap = new Map();

  const absorb = (obj) => {
    if (!obj) return;
    if (Array.isArray(obj.categories)) {
      obj.categories.forEach((c) => { if (c && c.slug) catMap.set(c.slug, c); });
    }
    if (Array.isArray(obj.products)) {
      obj.products.forEach((p) => { if (p && p.id) prodMap.set(p.id, p); });
    }
  };

  // A valid external or ignored persistent copy is authoritative, including an intentionally empty catalog.
  for (const source of [EXT_CATALOG, PERSISTENT_CATALOG]) {
    try {
      if (!existsSync(source)) continue;
      const saved = JSON.parse(readFileSync(source, 'utf8'));
      if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
        return {
          products: Array.isArray(saved.products) ? saved.products : [],
          categories: Array.isArray(saved.categories) ? saved.categories : [],
        };
      }
    } catch (_) {}
  }

  // First boot migration: merge legacy copies once, then seed only ignored/external storage.
  try { if (existsSync(BACKUP_CATALOG)) absorb(JSON.parse(readFileSync(BACKUP_CATALOG, 'utf8'))); } catch (_) {}
  try { if (existsSync(CATALOG)) absorb(JSON.parse(readFileSync(CATALOG, 'utf8'))); } catch (_) {}

  const products = Array.from(prodMap.values());
  const categories = Array.from(catMap.values());
  const cat = { products, categories };

  if (products.length > 0 || categories.length > 0) writeSafe(EXT_CATALOG, PERSISTENT_CATALOG, CATALOG, cat, 'catalog', BACKUP_CATALOG);
  return cat;
}

export function saveCatalog(cat) {
  if (!cat || !Array.isArray(cat.products)) return;
  writeSafe(EXT_CATALOG, PERSISTENT_CATALOG, CATALOG, cat, 'catalog', BACKUP_CATALOG);
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
  // EXCLUSIVE SHIELD: If external safe storage exists, it is the 100% SINGLE SOURCE OF TRUTH.
  // NEVER read BACKUP_ORDERS or ORDERS from inside the Git repo, because Git pulls overwrite them!
  try {
    if (existsSync(EXT_ORDERS)) {
      const extList = JSON.parse(readFileSync(EXT_ORDERS, 'utf8'));
      if (Array.isArray(extList)) {
        return extList.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      }
    }
  } catch (_) {}
  try {
    if (existsSync(PERSISTENT_ORDERS)) {
      const persistentList = JSON.parse(readFileSync(PERSISTENT_ORDERS, 'utf8'));
      if (Array.isArray(persistentList)) return persistentList.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    }
  } catch (_) {}

  // Only reached on brand new blank server initialization
  const map = new Map();

  const absorb = (arr) => {
    if (Array.isArray(arr)) {
      arr.forEach((o) => {
        if (o && o.id) {
          const prev = map.get(o.id);
          if (!prev) {
            map.set(o.id, o);
          } else {
            const prevHist = (prev.history || []).length;
            const newHist = (o.history || []).length;
            const prevItems = (prev.items || []).length;
            const newItems = (o.items || []).length;
            if (prev.status === 'approved' && o.status === 'shipped') {
              // keep approved
            } else if (newHist > prevHist || newItems > prevItems || (o.status !== 'incomplete' && prev.status === 'incomplete')) {
              map.set(o.id, { ...prev, ...o });
            }
          }
        }
      });
    }
  };

  // Check fallback paths for one-time initialization
  try { if (existsSync(PERSISTENT_ORDERS)) absorb(JSON.parse(readFileSync(PERSISTENT_ORDERS, 'utf8'))); } catch (_) {}
  try { if (existsSync(ORDERS)) absorb(JSON.parse(readFileSync(ORDERS, 'utf8'))); } catch (_) {}
  try { if (existsSync(BACKUP_ORDERS)) absorb(JSON.parse(readFileSync(BACKUP_ORDERS, 'utf8'))); } catch (_) {}

  if (map.size === 0) {
    try {
      if (existsSync(BACKUPS_DIR)) {
        const files = readdirSync(BACKUPS_DIR).filter((f) => f.startsWith('orders-') && f.endsWith('.json')).sort().reverse();
        for (const f of files) {
          const b = JSON.parse(readFileSync(join(BACKUPS_DIR, f), 'utf8'));
          absorb(b);
          if (map.size > 0) break;
        }
      }
    } catch (_) {}
  }

  const list = Array.from(map.values()).sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

  if (list.length > 0) {
    writeSafe(EXT_ORDERS, PERSISTENT_ORDERS, ORDERS, list, 'orders', BACKUP_ORDERS);
  }
  return list;
}

export function saveOrders(orders) {
  if (!Array.isArray(orders)) return;
  // Safety guard: if attempting to save empty array while existing orders existed, keep an emergency snapshot
  if (orders.length === 0) {
    try {
      if (existsSync(PERSISTENT_ORDERS)) {
        const prev = JSON.parse(readFileSync(PERSISTENT_ORDERS, 'utf8'));
        if (Array.isArray(prev) && prev.length > 0) {
          writeFileSync(join(BACKUPS_DIR, `pre_wipe_orders_${Date.now()}.json`), JSON.stringify(prev, null, 2));
        }
      }
    } catch (_) {}
  }
  writeSafe(EXT_ORDERS, PERSISTENT_ORDERS, ORDERS, orders, 'orders', BACKUP_ORDERS);
}

export function deleteOrder(id) {
  const orders = getOrders();
  const next = orders.filter((x) => x.id !== id);
  if (next.length !== orders.length) {
    saveOrders(next);
    return true;
  }
  return false;
}

export function addOrder(order) {
  const orders = getOrders();
  orders.unshift(order);
  saveOrders(orders);
  return order;
}

export function updateOrderStatus(id, status) {
  const orders = getOrders();
  const o = orders.find((x) => x.id === id || x.id === 'DOT-' + id || 'DOT-' + x.id === id);
  if (!o) return null;
  o.status = status;
  saveOrders(orders);
  return o;
}

export function updateOrder(id, patch) {
  const orders = getOrders();
  const o = orders.find((x) => x.id === id || x.id === 'DOT-' + id || 'DOT-' + x.id === id);
  if (!o) return null;
  if (Array.isArray(patch.history)) {
    o.history = patch.history;
  }
  if (typeof patch.status === 'string' && patch.status && patch.status !== o.status) {
    o.status = patch.status;
    o.history = o.history || [];
    if (!Array.isArray(patch.history)) {
      o.history.push({ status: patch.status, at: new Date().toISOString() });
    }
  }
  if (patch.courier && typeof patch.courier === 'object') {
    const c = patch.courier;
    o.courier = {
      ...(o.courier || {}),
      name: String(c.name ?? o.courier?.name ?? '').trim(),
      consignment: String(c.consignment ?? o.courier?.consignment ?? '').trim(),
      phone: String(c.phone ?? o.courier?.phone ?? '').trim(),
      url: String(c.url ?? o.courier?.url ?? '').trim(),
      accountId: c.accountId ? String(c.accountId) : (o.courier?.accountId || ''),
      liveStatus: c.liveStatus != null ? String(c.liveStatus) : (o.courier?.liveStatus || ''),
      riderNote: c.riderNote != null ? String(c.riderNote) : (o.courier?.riderNote || ''),
      attempt: c.attempt != null ? (Number(c.attempt) || 0) : (o.courier?.attempt || 0),
      courierUpdatedAt: c.courierUpdatedAt != null ? String(c.courierUpdatedAt) : (o.courier?.courierUpdatedAt || ''),
      lastSync: c.lastSync != null ? String(c.lastSync) : (o.courier?.lastSync || ''),
    };
  }
  if (typeof patch.adminNote === 'string') o.adminNote = patch.adminNote.slice(0, 500);
  if (patch.paymentStatus === 'paid' || patch.paymentStatus === 'unpaid') {
    o.paymentStatus = patch.paymentStatus;
    o.paymentUpdatedAt = new Date().toISOString();
  }

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
  const list = readSafe(EXT_COUPONS, PERSISTENT_COUPONS, COUPONS, [], BACKUP_COUPONS);
  return Array.isArray(list) ? list : [];
}
export function saveCoupons(c) {
  writeSafe(EXT_COUPONS, PERSISTENT_COUPONS, COUPONS, Array.isArray(c) ? c : [], 'coupons', BACKUP_COUPONS);
}

export function getReviews() {
  const r = readSafe(EXT_REVIEWS, PERSISTENT_REVIEWS, REVIEWS, {}, BACKUP_REVIEWS);
  if (Array.isArray(r)) {
    return r.reduce((grouped, review) => {
      if (!review || typeof review !== 'object') return grouped;
      const productId = String(review.productId || 'unassigned');
      (grouped[productId] ||= []).push(review);
      return grouped;
    }, {});
  }
  return typeof r === 'object' && r !== null ? r : {};
}
export function saveReviews(r) {
  writeSafe(EXT_REVIEWS, PERSISTENT_REVIEWS, REVIEWS, typeof r === 'object' && r !== null ? r : {}, 'reviews', BACKUP_REVIEWS);
}

export function getUsers() {
  const u = readSafe(EXT_USERS, PERSISTENT_USERS, USERS, [], BACKUP_USERS);
  return Array.isArray(u) ? u : [];
}
export function saveUsers(u) {
  writeSafe(EXT_USERS, PERSISTENT_USERS, USERS, Array.isArray(u) ? u : [], 'users', BACKUP_USERS);
}

export const DEFAULT_INTEGRATIONS = {
  email: { enabled: true, provider: 'resend', resendApiKey: process.env.RESEND_API_KEY || '', adminEmail: 'metroomaa@gmail.com', host: '', port: 587, secure: false, user: '', pass: '', fromName: 'SECRATE', fromEmail: 'onboarding@resend.dev' },
  sms: { enabled: false, url: '', method: 'GET', senderId: '', apiKey: '', templatePlaced: 'SECRATE: order {id} received. total {total}. we will call to confirm. track: {track}', templateStatus: 'SECRATE: order {id} is now {status}. {courier}' },
  couriers: [],
  tracking: { fbEnabled: false, fbPixelId: '1122829254194671', fbToken: '', fbTestCode: '', ttkEnabled: false, ttkPixelId: '', ttkToken: '' },
  fraud: { enabled: false, url: '', method: 'GET', headers: '', totalPath: '', successPath: '', cancelPath: '' },
};

export function getIntegrations() {
  const saved = readSafe(EXT_INTEGRATIONS, PERSISTENT_INTEGRATIONS, INTEGRATIONS, {}, BACKUP_INTEGRATIONS);
  return {
    email: { ...DEFAULT_INTEGRATIONS.email, ...(saved.email || {}) },
    sms: { ...DEFAULT_INTEGRATIONS.sms, ...(saved.sms || {}) },
    couriers: Array.isArray(saved.couriers) ? saved.couriers : [],
    tracking: { ...DEFAULT_INTEGRATIONS.tracking, ...(saved.tracking || {}) },
    fraud: { ...DEFAULT_INTEGRATIONS.fraud, ...(saved.fraud || {}) },
  };
}
export function saveIntegrations(next) {
  writeSafe(EXT_INTEGRATIONS, PERSISTENT_INTEGRATIONS, INTEGRATIONS, next, 'integrations', BACKUP_INTEGRATIONS);
  return next;
}

export const DEFAULT_LOVELOCK_LANDING = {
  id: 'landing_love_forever',
  title: '“LOVE FOREVER” লাক্সারি গিফট বক্স — প্রিয়জনের সেরা উপহার',
  slug: 'love-forever',
  aliases: [],
  status: 'live',
  freeDelivery: false,
  deliveryInside: 80,
  deliveryOutside: 130,
  themeColor: '#CB202D',
  buttonColor: '#E02836',
  pageBgColor: '#FAF7F8',
  status: 'live',
  freeDelivery: false,
  badgeTop: '১০০% অরিজিনাল প্রিমিয়াম কোয়ালিটি নিশ্চিত',
  badgeGuarantee: 'একমাত্র আমরাই দিচ্ছি পণ্য দেখে মূল্য পরিশোধের সুবিধা',
  headline: '“LOVE FOREVER” লাক্সারি গিফট বক্স',
  subtitle: 'ভালোবাসার দিনে প্রিয়জনের মুখে হাসি ফোটান। ১২টি সুবাসিত লাল গোলাপ, প্রিমিয়াম নেকলেস ও গিফট ব্যাগ সহ আকর্ষণীয় প্যাকেজ।',
  videoUrl: '',
  videoBadge: '',
  productTitle: '“LOVE FOREVER” Gift Box',
  productTagline: '১২টি সুবাসিত রয়্যাল রেড সিল্ক রোজ + প্রিমিয়াম গলার হার + ফ্রি গিফট ক্যারিয়ার ব্যাগ + গ্রিটিংস কার্ড',
  heroImage: '/uploads/img_mvcvyjixc2dpi.webp',
  packageTitle: '“LOVE FOREVER” লাক্সারি গিফট বক্স কম্বো',
  offerPriceText: 'অফার মূল্য মাত্র ৫৯০ টাকা',
  freeDeliveryText: '(ক্যাশ অন ডেলিভারিতে সারা বাংলাদেশে দ্রুত হোম ডেলিভারি)',
  benefitsHeading: 'কেন এই গিফট বক্সটি সেরা উপহার?',
  benefits: [
    '🌹 ১২টি আকর্ষণীয় লাল গোলাপ: প্রিমিয়াম রয়্যাল রেড ফিনিশ ও দেখতে একদম তাজা গোলাপের মতো।',
    '💎 Premium Necklace: চকচকে প্রিমিয়াম ডিজাইনের গলার হার যা যেকোনো পোশাকে মানিয়ে যায়।',
    '🛍️ Free Gift Bag: আকর্ষণীয় গিফট ক্যারিয়ার ব্যাগ সহ পরিপাটি প্রেজেন্টেশন।',
    '💌 Greeting Card: মনের না-বলা ভালোবাসার অনুভূতি লিখে জানানোর স্পেশাল কার্ড।',
    '✨ সিক্রেট ড্রয়ার স্পেস: জুয়েলারি বা সারপ্রাইজ গিফট লুকিয়ে রাখার এক্সক্লুসিভ কম্পার্টমেন্ট।',
    '💰 নিশ্চিন্ত ক্যাশ অন ডেলিভারি: কোনো অগ্রিম টাকা ছাড়া ঘরে বসে পণ্য দেখে মূল্য পরিশোধ করুন।'
  ],
  usageHeading: 'উপহার দেয়ার উপযুক্ত উপলক্ষ্যসমূহ:',
  usageSteps: [
    'ওয়াইফ বা প্রিয়তমার জন্মদিনের শুভেচ্ছা জানাতে।',
    'বিবাহবার্ষিকী বা রিলেশনশিপ অ্যানিভার্সারিতে বিশেষ চমক দিতে।',
    'প্রপোজাল মুহূর্ত বা ভালোবাসার বিশেষ দিনকে স্মরণীয় করতে।',
    'প্রিয় মানুষকে অনাবিল আনন্দ ও সারপ্রাইজ উপহার দিতে।'
  ],
  usageImage: '/uploads/img_mvcvyqa8tgqa6.webp',
  usageCaption: 'ভালোবাসার শ্রেষ্ঠ উপহার — পরিপাটি রয়্যাল ফিনিশ',
  reviews: [
    '/uploads/img_mvcvyqj4ab8xt.webp',
    '/uploads/img_mvcvywji3jv5e.webp',
    '/uploads/img_mvcvyjixc2dpi.webp'
  ],
  reviewsBadge: 'ভেরিফায়েড ক্রেতার সন্তুষ্টি',
  reviewsTitle: 'বাস্তব কাস্টমার অভিজ্ঞতা ও ছবি',
  guaranteeBadge: '১০০% সন্তুষ্টি ও নিশ্চিন্ত ক্রয়ের অঙ্গীকার',
  guaranteeText: 'আমাদের প্রদর্শিত পণ্যের সাথে প্রাপ্ত পণ্যের মিল না থাকলে এক টাকাও দিতে হবে না, সরাসরি পার্সেল রিটার্ন করতে পারবেন। যেকোনো প্রশ্ন বা বিস্তারিত জানতে কল করুন।',
  phone: '01633617136',
  whatsapp: '8801633617136',
  packages: [
    {
      id: 'mm-29267',
      title: '“LOVE FOREVER” Gift Box (Black / Red)',
      price: 590,
      originalPrice: 1200,
      image: '/uploads/img_mvcvyjixc2dpi.webp',
      popular: true
    }
  ]
};

export function getLandings() {
  const map = new Map();
  const absorb = (arr) => {
    if (Array.isArray(arr)) {
      arr.forEach((L) => {
        if (L && (L.slug || L.id)) {
          const key = String(L.slug || L.id).toLowerCase();
          map.set(key, { ...(map.get(key) || {}), ...L });
        }
      });
    }
  };
  for (const source of [EXT_LANDINGS, PERSISTENT_LANDINGS]) {
    try {
      if (!existsSync(source)) continue;
      const saved = JSON.parse(readFileSync(source, 'utf8'));
      if (Array.isArray(saved)) return saved;
    } catch (_) {}
  }
  try { if (existsSync(BACKUP_LANDINGS)) absorb(JSON.parse(readFileSync(BACKUP_LANDINGS, 'utf8'))); } catch (_) {}
  try { if (existsSync(LANDINGS)) absorb(JSON.parse(readFileSync(LANDINGS, 'utf8'))); } catch (_) {}

  if (map.size === 0) {
    saveLandings([DEFAULT_LOVELOCK_LANDING]);
    return [DEFAULT_LOVELOCK_LANDING];
  }
  const list = Array.from(map.values());
  if (list.length) writeSafe(EXT_LANDINGS, PERSISTENT_LANDINGS, LANDINGS, list, 'landings', BACKUP_LANDINGS);
  return list;
}

export function saveLandings(list) {
  writeSafe(EXT_LANDINGS, PERSISTENT_LANDINGS, LANDINGS, list, 'landings', BACKUP_LANDINGS);
}

export function getLandingBySlug(slug) {
  const s = String(slug || '').toLowerCase().trim();
  if (!s) return null;
  const list = getLandings();
  const exact = list.find((L) => L && L.slug && L.slug.toLowerCase() === s);
  if (exact) return exact;
  const byAlias = list.find((L) =>
    L && Array.isArray(L.aliases) && L.aliases.some((a) => String(a || '').toLowerCase().trim() === s)
  );
  if (byAlias) return byAlias;
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
  const list = readSafe(EXT_COLORS, PERSISTENT_COLORS, COLORS, null, BACKUP_COLORS);
  // An empty library is intentional: never seed colors that an admin did not create.
  return Array.isArray(list) ? list : [];
}

export function saveColors(colors) {
  writeSafe(EXT_COLORS, PERSISTENT_COLORS, COLORS, colors, 'colors', BACKUP_COLORS);
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

export function syncCustomersFromOrders() {
  const orders = getOrders() || [];
  const list = readSafe(EXT_CUSTOMERS, PERSISTENT_CUSTOMERS, CUSTOMERS, []) || [];
  let modified = false;

  for (const o of orders) {
    if (!o.customer || !o.customer.phone) continue;
    const cleanPhone = String(o.customer.phone).replace(/\D/g, '').slice(-11);
    if (!cleanPhone || cleanPhone.length < 10) continue;

    let existing = list.find((c) => String(c.phone).replace(/\D/g, '').slice(-11) === cleanPhone);
    const myOrders = orders.filter((x) => {
      if (x.status === 'cancelled') return false;
      const xPhone = String(x.customer?.phone || '').replace(/\D/g, '').slice(-11);
      return xPhone === cleanPhone;
    });
    const deliveredOrders = myOrders.filter((x) => x.status === 'delivered');
    const totalSpent = deliveredOrders.reduce((s, x) => s + (Number(x.total) || 0), 0);
    const sorted = [...myOrders].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    const latestOrder = sorted[0];
    const earliestOrder = sorted[sorted.length - 1];

    if (!existing) {
      existing = {
        id: 'cust_' + cleanPhone,
        phone: o.customer.phone,
        name: o.customer.name || 'Customer',
        email: o.customer.email || '',
        ordersCount: myOrders.length,
        totalSpent,
        savedAddress: o.customer.address ? {
          address: o.customer.address,
          district: o.customer.district || '',
          thana: o.customer.thana || '',
          area: o.customer.area || 'outside'
        } : null,
        createdAt: earliestOrder?.createdAt || o.createdAt || new Date().toISOString(),
        lastOrderAt: latestOrder?.createdAt || o.createdAt || new Date().toISOString(),
        welcomeCouponUsed: myOrders.some((x) => String(x.coupon || '').toUpperCase() === 'WELCOME5'),
      };
      list.push(existing);
      modified = true;
    } else {
      let upd = false;
      if (!existing.name && o.customer.name) { existing.name = o.customer.name; upd = true; }
      if (!existing.email && o.customer.email) { existing.email = o.customer.email; upd = true; }
      if (!existing.savedAddress && o.customer.address) {
        existing.savedAddress = {
          address: o.customer.address,
          district: o.customer.district || '',
          thana: o.customer.thana || '',
          area: o.customer.area || 'outside'
        };
        upd = true;
      }
      if (existing.ordersCount !== myOrders.length) { existing.ordersCount = myOrders.length; upd = true; }
      if (existing.totalSpent !== totalSpent) { existing.totalSpent = totalSpent; upd = true; }
      if (latestOrder && existing.lastOrderAt !== latestOrder.createdAt) { existing.lastOrderAt = latestOrder.createdAt; upd = true; }
      if (upd) modified = true;
    }
  }

  if (modified) {
    writeSafe(EXT_CUSTOMERS, PERSISTENT_CUSTOMERS, CUSTOMERS, list, 'customers', BACKUP_CUSTOMERS);
  }
  return list;
}

export function getCustomers() {
  const map = new Map();
  const getPhoneKey = (c) => {
    if (!c) return '';
    const p = String(c.phone || c.id || '').replace(/\D/g, '').slice(-11);
    return p || c.id || '';
  };
  const absorb = (arr) => {
    if (Array.isArray(arr)) {
      arr.forEach((c) => {
        const k = getPhoneKey(c);
        if (k) {
          const prev = map.get(k);
          if (!prev) map.set(k, c);
          else map.set(k, { ...prev, ...c, ordersCount: Math.max(prev.ordersCount || 0, c.ordersCount || 0), totalSpent: Math.max(prev.totalSpent || 0, c.totalSpent || 0) });
        }
      });
    }
  };
  for (const source of [EXT_CUSTOMERS, PERSISTENT_CUSTOMERS]) {
    try {
      if (!existsSync(source)) continue;
      const saved = JSON.parse(readFileSync(source, 'utf8'));
      if (Array.isArray(saved)) return saved;
    } catch (_) {}
  }
  // First boot migration only: recover legacy customer entries and seed safe storage.
  try { if (existsSync(BACKUP_CUSTOMERS)) absorb(JSON.parse(readFileSync(BACKUP_CUSTOMERS, 'utf8'))); } catch (_) {}
  try { if (existsSync(CUSTOMERS)) absorb(JSON.parse(readFileSync(CUSTOMERS, 'utf8'))); } catch (_) {}

  let list = Array.from(map.values());
  if (list.length === 0) {
    list = syncCustomersFromOrders();
  } else {
    writeSafe(EXT_CUSTOMERS, PERSISTENT_CUSTOMERS, CUSTOMERS, list, 'customers', BACKUP_CUSTOMERS);
  }
  return list;
}

export function saveCustomers(list) {
  writeSafe(EXT_CUSTOMERS, PERSISTENT_CUSTOMERS, CUSTOMERS, list, 'customers', BACKUP_CUSTOMERS);
  return list;
}

export function getCustomerByEmail(email) {
  if (!email) return null;
  const clean = String(email).trim().toLowerCase();
  if (!clean) return null;
  return getCustomers().find((c) => c.email && c.email.trim().toLowerCase() === clean) || null;
}

export function getCustomerByPhone(phone) {
  if (!phone) return null;
  const clean = String(phone).replace(/\D/g, '').slice(-11);
  return getCustomers().find((c) => String(c.phone).replace(/\D/g, '').slice(-11) === clean) || null;
}

export function saveCustomer(cust) {
  if (!cust || (!cust.phone && !cust.email && !cust.id)) return null;
  const list = getCustomers();
  const clean = String(cust.phone).replace(/\D/g, '').slice(-11);
  const cleanEmail = cust.email ? String(cust.email).trim().toLowerCase() : '';
  const custId = cust.id || '';
  const idx = list.findIndex((c) => (custId && c.id === custId) || (cleanEmail && c.email && c.email.trim().toLowerCase() === cleanEmail) || (clean && c.phone && String(c.phone).replace(/\D/g, '').slice(-11) === clean));
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
    syncCustomersFromOrders();
    const customers = getCustomers();
    console.log(`[StorageProtection] Live data secured. Safe directory: ${EXTERNAL_DIR}`);
    console.log(`[StorageProtection] Data counts: Products: ${(cat.products || []).length}, Categories: ${(cat.categories || []).length}, Orders: ${orders.length}, Customers: ${customers.length}, Store: ${settings.storeName}`);
    
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

// ==========================================
// STAFF ACTIVITY, PRESENCE & AUDIT LOGS
// ==========================================

export function getBangladeshDate(d = new Date()) {
  const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
  const bdTime = new Date(utc + (3600000 * 6)); // UTC+6
  return bdTime.toISOString().slice(0, 10); // 'YYYY-MM-DD'
}

export function getAuditLogs() {
  const list = readSafe(EXT_AUDIT_LOGS, PERSISTENT_AUDIT_LOGS, AUDIT_LOGS, [], BACKUP_AUDIT_LOGS);
  return Array.isArray(list) ? list : [];
}

export function saveAuditLogs(logs) {
  const clean = Array.isArray(logs) ? logs.slice(0, 5000) : [];
  writeSafe(EXT_AUDIT_LOGS, PERSISTENT_AUDIT_LOGS, AUDIT_LOGS, clean, 'audit_logs', BACKUP_AUDIT_LOGS);
}

export function addAuditLog({ staff, action, targetType = 'order', targetId = '', summary = '', details = {} }) {
  const entry = {
    id: 'log_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    timestamp: new Date().toISOString(),
    staff: {
      username: staff?.username || 'system',
      name: staff?.name || staff?.username || 'System',
      role: staff?.role || 'system',
    },
    action,
    targetType,
    targetId,
    summary,
    details
  };
  const logs = getAuditLogs();
  logs.unshift(entry);
  saveAuditLogs(logs);
  return entry;
}

export function getStaffActivity() {
  const data = readSafe(EXT_STAFF_ACTIVITY, PERSISTENT_STAFF_ACTIVITY, STAFF_ACTIVITY, {}, BACKUP_STAFF_ACTIVITY);
  return (data && typeof data === 'object' && !Array.isArray(data)) ? data : {};
}

export function saveStaffActivity(data) {
  writeSafe(EXT_STAFF_ACTIVITY, PERSISTENT_STAFF_ACTIVITY, STAFF_ACTIVITY, data || {}, 'staff_activity', BACKUP_STAFF_ACTIVITY);
}

// ---- WhatsApp Chat Contacts (Everyone who ever messaged on WhatsApp) ----
export function getWaChatContacts() {
  const list = readSafe(EXT_WA_CONTACTS, PERSISTENT_WA_CONTACTS, WA_CONTACTS, [], BACKUP_WA_CONTACTS);
  return Array.isArray(list) ? list : [];
}

export function saveWaChatContacts(contacts) {
  const clean = Array.isArray(contacts) ? contacts.slice(0, 10000) : [];
  writeSafe(EXT_WA_CONTACTS, PERSISTENT_WA_CONTACTS, WA_CONTACTS, clean, 'wa_chat_contacts', BACKUP_WA_CONTACTS);
}

export function upsertWaChatContact({ phone, name = '', lastMessage = '', isIncoming = true }) {
  if (!phone) return null;
  const rawDigits = String(phone).replace(/\D/g, '');
  if (!rawDigits || rawDigits.length < 10) return null;

  // Standardize BD phone to 01XXXXXXXXX or international digits
  let standardPhone = rawDigits;
  if (rawDigits.startsWith('880')) {
    standardPhone = '0' + rawDigits.slice(3);
  } else if (rawDigits.startsWith('88') && rawDigits.length === 13) {
    standardPhone = '0' + rawDigits.slice(2);
  } else if (!rawDigits.startsWith('0') && rawDigits.length === 10) {
    standardPhone = '0' + rawDigits;
  }

  const contacts = getWaChatContacts();
  const index = contacts.findIndex(c => c.phone === standardPhone || (c.rawDigits && c.rawDigits === rawDigits));
  const now = new Date().toISOString();

  let entry = null;
  if (index >= 0) {
    const existing = contacts[index];
    entry = {
      ...existing,
      name: (name && name !== 'WhatsApp User' && name !== 'Unknown') ? name : existing.name,
      lastChatAt: now,
      lastMessage: lastMessage ? String(lastMessage).slice(0, 200) : existing.lastMessage,
      messageCount: (existing.messageCount || 1) + 1,
      lastDirection: isIncoming ? 'incoming' : 'outgoing',
    };
    contacts[index] = entry;
  } else {
    entry = {
      phone: standardPhone,
      rawDigits,
      name: name && name !== 'WhatsApp User' && name !== 'Unknown' ? name : 'WhatsApp User',
      firstChatAt: now,
      lastChatAt: now,
      lastMessage: lastMessage ? String(lastMessage).slice(0, 200) : '',
      messageCount: 1,
      lastDirection: isIncoming ? 'incoming' : 'outgoing',
      source: 'whatsapp_chat',
    };
    contacts.unshift(entry);
  }

  saveWaChatContacts(contacts);
  return entry;
}

// Sync all historical WhatsApp chat contacts from Baileys auth session storage (LID mappings & device lists)
export function syncWhatsAppSessionContacts(authDirOverride = null) {
  try {
    let authDir = authDirOverride;
    if (!authDir) {
      const candidates = [
        join(EXTERNAL_DIR, 'wa_auth_info'),
        '/var/www/secrate_persistent_data/wa_auth_info',
        join(DATA_DIR, 'wa_auth_info')
      ];
      for (const c of candidates) {
        if (existsSync(c) && statSync(c).isDirectory()) {
          authDir = c;
          break;
        }
      }
    }
    if (!authDir || !existsSync(authDir)) {
      return { ok: false, message: 'Auth dir not found', synced: 0 };
    }

    const files = readdirSync(authDir);
    const waNumbers = new Map();

    for (const f of files) {
      const fullPath = join(authDir, f);
      let stat;
      try { stat = statSync(fullPath); } catch (_) { continue; }
      const mtime = stat.mtime;

      let phoneFound = null;
      if (f.startsWith('lid-mapping-') && f.endsWith('_reverse.json')) {
        try {
          const content = readFileSync(fullPath, 'utf8').trim();
          const val = JSON.parse(content);
          if (typeof val === 'string' && val.length >= 10) phoneFound = val;
        } catch (_) {}
      } else if (f.startsWith('lid-mapping-') && !f.includes('reverse')) {
        const raw = f.replace('lid-mapping-', '').replace('.json', '');
        if (raw.startsWith('8801') || raw.startsWith('01')) phoneFound = raw;
      } else if (f.startsWith('device-list-')) {
        const raw = f.replace('device-list-', '').replace('.json', '');
        if (raw.startsWith('8801') || raw.startsWith('01')) phoneFound = raw;
      }

      if (phoneFound) {
        let clean = phoneFound.replace(/\D/g, '');
        if (clean.startsWith('880')) clean = '0' + clean.slice(3);
        else if (!clean.startsWith('0') && clean.length === 10) clean = '0' + clean;

        if (clean.length === 11 && clean.startsWith('01')) {
          if (!waNumbers.has(clean) || waNumbers.get(clean).mtime < mtime) {
            waNumbers.set(clean, { phone: clean, mtime, rawDigits: '88' + clean });
          }
        }
      }
    }

    if (waNumbers.size === 0) {
      return { ok: true, synced: 0, total: 0 };
    }

    // Map existing orders & customers for verified customer names
    const orders = getOrders() || [];
    const customers = getCustomers() || [];
    const phoneToCust = new Map();

    customers.forEach(c => {
      const p = String(c.phone || c.id || '').replace(/\D/g, '').slice(-11);
      if (p && p.length >= 10 && p.startsWith('01')) {
        phoneToCust.set(p, {
          name: c.name || '',
          ordersCount: Number(c.ordersCount) || 0,
          totalSpent: Number(c.totalSpent) || 0
        });
      }
    });

    orders.forEach(o => {
      const p = String(o.customer?.phone || '').replace(/\D/g, '').slice(-11);
      if (p && p.length >= 10 && p.startsWith('01')) {
        const ex = phoneToCust.get(p) || { name: '', ordersCount: 0, totalSpent: 0 };
        if (!ex.name && o.customer?.name) ex.name = o.customer.name;
        if (o.status !== 'incomplete' && o.status !== 'cancelled') {
          ex.ordersCount++;
          ex.totalSpent += (Number(o.total) || 0);
        }
        phoneToCust.set(p, ex);
      }
    });

    const existingContacts = getWaChatContacts();
    const existingMap = new Map();
    existingContacts.forEach(c => {
      const p = String(c.phone || c.rawDigits || '').replace(/\D/g, '').slice(-11);
      if (p) existingMap.set(p, c);
    });

    const updated = [];
    for (const [phone, data] of waNumbers.entries()) {
      const cust = phoneToCust.get(phone);
      const prev = existingMap.get(phone);

      let name = '';
      if (cust && cust.name && cust.name !== 'Valued Customer' && cust.name !== 'সম্মানিত কাস্টমার') {
        name = cust.name;
      } else if (prev && prev.name && prev.name !== 'WhatsApp User' && prev.name !== 'Valued Customer' && prev.name !== 'সম্মানিত কাস্টমার') {
        name = prev.name;
      } else {
        name = 'হোয়াটসঅ্যাপ গ্রাহক';
      }

      const lastChatAt = prev?.lastChatAt || data.mtime.toISOString();
      const firstChatAt = prev?.firstChatAt || data.mtime.toISOString();

      updated.push({
        phone,
        rawDigits: data.rawDigits,
        name,
        firstChatAt,
        lastChatAt,
        lastMessage: prev?.lastMessage && !prev.lastMessage.startsWith('Order #') ? prev.lastMessage : 'হোয়াটসঅ্যাপ ইনবক্স চ্যাট হিস্ট্রি',
        messageCount: prev?.messageCount || 1,
        ordersCount: cust?.ordersCount || 0,
        totalSpent: cust?.totalSpent || 0,
        lastDirection: prev?.lastDirection || 'incoming',
        source: 'whatsapp_chat',
        isWaChat: true
      });
    }

    updated.sort((a, b) => new Date(b.lastChatAt).getTime() - new Date(a.lastChatAt).getTime());
    saveWaChatContacts(updated);
    return { ok: true, synced: updated.length, total: updated.length };
  } catch (err) {
    console.error('[syncWhatsAppSessionContacts error]:', err);
    return { ok: false, error: err.message, synced: 0 };
  }
}

// In-Memory Presence Tracker (real-time live ping)
const liveStaffPresence = new Map();

export function updateStaffPresence(staff, { active = true, currentPath = '', ip = '', device = '' } = {}) {
  if (!staff || !staff.username) return;
  const username = String(staff.username).toLowerCase();
  const now = Date.now();
  const dateKey = getBangladeshDate();

  const prev = liveStaffPresence.get(username) || {
    username,
    name: staff.name || username,
    role: staff.role || 'staff',
    firstSeen: new Date().toISOString(),
    lastPing: now,
    status: active ? 'active' : 'idle',
    currentPath: currentPath || 'dashboard',
    ip,
    device
  };

  const elapsedSeconds = prev.lastPing ? Math.min(60, Math.max(0, Math.round((now - prev.lastPing) / 1000))) : 30;

  liveStaffPresence.set(username, {
    ...prev,
    name: staff.name || username,
    role: staff.role || 'staff',
    lastPing: now,
    status: active ? 'active' : 'idle',
    currentPath: currentPath || prev.currentPath,
    ip: ip || prev.ip,
    device: device || prev.device
  });

  // Accumulate today's daily activity
  const allActivity = getStaffActivity();
  if (!allActivity[dateKey]) allActivity[dateKey] = {};
  const day = allActivity[dateKey];

  if (!day[username]) {
    day[username] = {
      username,
      name: staff.name || username,
      role: staff.role || 'staff',
      firstLogin: new Date().toISOString(),
      lastActive: new Date().toISOString(),
      activeSeconds: 0,
      idleSeconds: 0,
      ordersHandled: {
        confirmed: 0,
        cancelled: 0,
        approved: 0,
        hold: 0,
        shipped: 0,
        total: 0
      },
      couriersBooked: 0,
      whatsappSent: 0,
      totalRevenueProcessed: 0
    };
  }

  const staffRecord = day[username];
  staffRecord.lastActive = new Date().toISOString();
  if (active) {
    staffRecord.activeSeconds = (staffRecord.activeSeconds || 0) + elapsedSeconds;
  } else {
    staffRecord.idleSeconds = (staffRecord.idleSeconds || 0) + elapsedSeconds;
  }

  saveStaffActivity(allActivity);
}

export function recordStaffKpiAction(staff, actionType, { orderId = '', status = '', amount = 0, courier = '', note = '' } = {}) {
  if (!staff || !staff.username) return;
  const username = String(staff.username).toLowerCase();
  const dateKey = getBangladeshDate();
  const allActivity = getStaffActivity();
  if (!allActivity[dateKey]) allActivity[dateKey] = {};
  const day = allActivity[dateKey];

  if (!day[username]) {
    day[username] = {
      username,
      name: staff.name || username,
      role: staff.role || 'staff',
      firstLogin: new Date().toISOString(),
      lastActive: new Date().toISOString(),
      activeSeconds: 0,
      idleSeconds: 0,
      ordersHandled: { confirmed: 0, cancelled: 0, approved: 0, hold: 0, shipped: 0, total: 0 },
      couriersBooked: 0,
      whatsappSent: 0,
      totalRevenueProcessed: 0
    };
  }

  const record = day[username];
  record.lastActive = new Date().toISOString();

  if (actionType === 'ORDER_STATUS_CHANGED') {
    record.ordersHandled.total = (record.ordersHandled.total || 0) + 1;
    const s = String(status).toLowerCase();
    if (s === 'confirmed') {
      record.ordersHandled.confirmed = (record.ordersHandled.confirmed || 0) + 1;
      if (amount > 0) record.totalRevenueProcessed = (record.totalRevenueProcessed || 0) + amount;
    } else if (s === 'cancelled') {
      record.ordersHandled.cancelled = (record.ordersHandled.cancelled || 0) + 1;
    } else if (s === 'approved') {
      record.ordersHandled.approved = (record.ordersHandled.approved || 0) + 1;
    } else if (s === 'hold') {
      record.ordersHandled.hold = (record.ordersHandled.hold || 0) + 1;
    } else if (s === 'shipped') {
      record.ordersHandled.shipped = (record.ordersHandled.shipped || 0) + 1;
    }
  } else if (actionType === 'COURIER_BOOKED') {
    record.couriersBooked = (record.couriersBooked || 0) + 1;
  } else if (actionType === 'WHATSAPP_SENT') {
    record.whatsappSent = (record.whatsappSent || 0) + 1;
  }

  saveStaffActivity(allActivity);

  let summary = '';
  if (actionType === 'ORDER_STATUS_CHANGED') {
    summary = `Changed order #${orderId} status to ${status.toUpperCase()}`;
  } else if (actionType === 'COURIER_BOOKED') {
    summary = `Booked courier (${courier}) for order #${orderId}`;
  } else if (actionType === 'WHATSAPP_SENT') {
    summary = `Sent WhatsApp message for order #${orderId}`;
  } else {
    summary = note || actionType;
  }

  addAuditLog({
    staff,
    action: actionType,
    targetType: 'order',
    targetId: orderId,
    summary,
    details: { status, amount, courier, note }
  });
}

export function getStaffMonitoringData() {
  const now = Date.now();
  const dateKey = getBangladeshDate();
  const allActivity = getStaffActivity();
  const todayRecords = allActivity[dateKey] || {};

  const users = getUsers() || [];
  const monitoringList = [];

  const allStaffCandidates = [
    { username: 'owner', name: 'Store Owner', role: 'owner' },
    ...users.map(u => ({ username: u.username, name: u.name || u.username, role: u.role || 'staff', id: u.id }))
  ];

  for (const cand of allStaffCandidates) {
    const un = cand.username.toLowerCase();
    const live = liveStaffPresence.get(un);
    const dayStat = todayRecords[un] || {
      firstLogin: null,
      lastActive: null,
      activeSeconds: 0,
      idleSeconds: 0,
      ordersHandled: { confirmed: 0, cancelled: 0, approved: 0, hold: 0, shipped: 0, total: 0 },
      couriersBooked: 0,
      whatsappSent: 0,
      totalRevenueProcessed: 0
    };

    let status = 'offline';
    if (live) {
      const diffSec = Math.round((now - live.lastPing) / 1000);
      if (diffSec <= 90) {
        status = live.status === 'idle' ? 'idle' : 'active';
      } else {
        status = 'offline';
      }
    }

    monitoringList.push({
      username: cand.username,
      name: cand.name,
      role: cand.role,
      status,
      lastPing: live ? live.lastPing : null,
      currentPath: live ? live.currentPath : '',
      firstLogin: dayStat.firstLogin,
      lastActive: dayStat.lastActive,
      activeSeconds: dayStat.activeSeconds || 0,
      idleSeconds: dayStat.idleSeconds || 0,
      ordersHandled: dayStat.ordersHandled || { confirmed: 0, cancelled: 0, approved: 0, hold: 0, shipped: 0, total: 0 },
      couriersBooked: dayStat.couriersBooked || 0,
      whatsappSent: dayStat.whatsappSent || 0,
      totalRevenueProcessed: dayStat.totalRevenueProcessed || 0
    });
  }

  return {
    date: dateKey,
    timestamp: new Date().toISOString(),
    staff: monitoringList,
    recentAuditLogs: getAuditLogs().slice(0, 100)
  };
}

// ==========================================
// IP TELEPHONY, CALL LOGS & VOICE AUDIT
// ==========================================
const CALLS_FILE = join(EXTERNAL_DIR, 'calls.json');
const TELEPHONY_FILE = join(EXTERNAL_DIR, 'telephony.json');
const RECORDINGS_DIR = join(EXTERNAL_DIR, 'uploads', 'recordings');
try { mkdirSync(RECORDINGS_DIR, { recursive: true }); } catch (_) {}

export function getCalls(filters = {}) {
  let list = [];
  try {
    if (existsSync(CALLS_FILE)) {
      list = JSON.parse(readFileSync(CALLS_FILE, 'utf8'));
    }
  } catch (_) {
    list = [];
  }
  if (!Array.isArray(list)) list = [];

  if (filters.orderId) {
    list = list.filter(c => c.orderId === filters.orderId);
  }
  if (filters.staffUsername) {
    list = list.filter(c => c.staff?.username === filters.staffUsername || c.staff?.name === filters.staffUsername);
  }
  if (filters.outcome && filters.outcome !== 'all') {
    list = list.filter(c => c.outcome === filters.outcome);
  }
  if (filters.search) {
    const q = String(filters.search).toLowerCase();
    list = list.filter(c =>
      (c.customerPhone && c.customerPhone.includes(q)) ||
      (c.customerName && c.customerName.toLowerCase().includes(q)) ||
      (c.orderId && c.orderId.toLowerCase().includes(q)) ||
      (c.staff?.name && c.staff.name.toLowerCase().includes(q))
    );
  }

  return list.sort((a, b) => new Date(b.createdAt || b.startedAt || 0) - new Date(a.createdAt || a.startedAt || 0));
}

export function saveCall(callData) {
  let list = [];
  try {
    if (existsSync(CALLS_FILE)) {
      list = JSON.parse(readFileSync(CALLS_FILE, 'utf8'));
    }
  } catch (_) {
    list = [];
  }
  if (!Array.isArray(list)) list = [];

  const id = callData.id || ('call_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7));
  const record = {
    id,
    orderId: callData.orderId || null,
    customerName: callData.customerName || '',
    customerPhone: callData.customerPhone || '',
    productName: callData.productName || '',
    staff: callData.staff || { name: 'Staff', role: 'agent' },
    duration: Math.max(0, parseInt(callData.duration, 10) || 0),
    startedAt: callData.startedAt || new Date().toISOString(),
    endedAt: callData.endedAt || new Date().toISOString(),
    status: callData.status || 'completed',
    outcome: callData.outcome || 'completed',
    notes: String(callData.notes || '').trim(),
    recordingUrl: callData.recordingUrl || null,
    fileSize: parseInt(callData.fileSize, 10) || 0,
    createdAt: new Date().toISOString()
  };

  list.unshift(record);
  saveFile(CALLS_FILE, JSON.stringify(list, null, 2));

  // If orderId is provided, attach to order audit history
  if (record.orderId) {
    try {
      const orders = getOrders();
      const ord = orders.find(o => o.id === record.orderId || o.trackingId === record.orderId);
      if (ord) {
        if (!Array.isArray(ord.history)) ord.history = [];
        const mins = Math.floor(record.duration / 60);
        const secs = record.duration % 60;
        const durStr = `${mins > 0 ? mins + 'm ' : ''}${secs}s`;

        ord.history.unshift({
          at: record.createdAt,
          status: 'call',
          note: `IP Call (${durStr}) · Outcome: ${record.outcome}${record.notes ? ' · Note: ' + record.notes : ''}`,
          staff: record.staff,
          by: record.staff?.name || record.staff?.username || 'Staff',
          callId: record.id,
          recordingUrl: record.recordingUrl,
          duration: record.duration,
          outcome: record.outcome,
          notes: record.notes
        });
        ord.lastUpdated = record.createdAt;
        ord.lastUpdatedBy = record.staff;
        saveOrders(orders);
      }
    } catch (e) {
      console.error('[Store] Error attaching call to order history:', e);
    }
  }

  // Record action in staff performance log
  try {
    if (record.staff?.username) {
      recordStaffAction(record.staff.username, 'call', { callId: record.id, outcome: record.outcome });
    }
  } catch (_) {}

  return record;
}

export function deleteCall(callId) {
  let list = [];
  try {
    if (existsSync(CALLS_FILE)) {
      list = JSON.parse(readFileSync(CALLS_FILE, 'utf8'));
    }
  } catch (_) {
    return false;
  }
  if (!Array.isArray(list)) return false;

  const item = list.find(c => c.id === callId);
  if (!item) return false;

  list = list.filter(c => c.id !== callId);
  saveFile(CALLS_FILE, JSON.stringify(list, null, 2));

  if (item.recordingUrl && item.recordingUrl.startsWith('/uploads/recordings/')) {
    try {
      const fname = item.recordingUrl.replace('/uploads/recordings/', '');
      const fpath = join(RECORDINGS_DIR, fname);
      if (existsSync(fpath)) unlinkSync(fpath);
    } catch (_) {}
  }

  return true;
}

export function getCallStats() {
  const list = getCalls();
  const totalCalls = list.length;
  const totalDuration = list.reduce((acc, c) => acc + (c.duration || 0), 0);
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const todayCalls = list.filter(c => (c.createdAt || '').startsWith(todayStr));
  const confirmedCalls = list.filter(c => c.outcome === 'confirmed');

  const staffStats = {};
  list.forEach(c => {
    const sName = c.staff?.name || c.staff?.username || 'Unknown';
    if (!staffStats[sName]) staffStats[sName] = { calls: 0, duration: 0, confirmed: 0 };
    staffStats[sName].calls++;
    staffStats[sName].duration += (c.duration || 0);
    if (c.outcome === 'confirmed') staffStats[sName].confirmed++;
  });

  return {
    totalCalls,
    totalDuration,
    todayCallsCount: todayCalls.length,
    confirmedCallsCount: confirmedCalls.length,
    avgDuration: totalCalls > 0 ? Math.round(totalDuration / totalCalls) : 0,
    staffStats
  };
}

export function getTelephonySettings() {
  try {
    if (existsSync(TELEPHONY_FILE)) {
      return JSON.parse(readFileSync(TELEPHONY_FILE, 'utf8'));
    }
  } catch (_) {}
  return {
    enabled: true,
    provider: 'iptsp',
    callerId: '09638752122',
    sipServer: '',
    wssUrl: '',
    sipUsername: '',
    sipPassword: '',
    retentionDays: 30,
    autoRecord: true,
    testMode: true
  };
}

export function saveTelephonySettings(settings) {
  const current = getTelephonySettings();
  const merged = { ...current, ...settings, updatedAt: new Date().toISOString() };
  saveFile(TELEPHONY_FILE, JSON.stringify(merged, null, 2));
  return merged;
}

export function cleanupOldRecordings(retentionDays = 30) {
  try {
    if (!existsSync(RECORDINGS_DIR)) return { deleted: 0 };
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    const files = readdirSync(RECORDINGS_DIR);
    let deleted = 0;
    for (const f of files) {
      const p = join(RECORDINGS_DIR, f);
      try {
        const st = statSync(p);
        if (st.isFile() && st.mtimeMs < cutoff) {
          unlinkSync(p);
          deleted++;
        }
      } catch (_) {}
    }
    return { deleted };
  } catch (e) {
    return { error: e.message };
  }
}
