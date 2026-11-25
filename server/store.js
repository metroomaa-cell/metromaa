import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync, copyFileSync, readdirSync, statSync, unlinkSync, lstatSync, chmodSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

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
const PAYMENT_GATEWAY_KEY_FILE = join(EXTERNAL_DIR, '.payment-gateway.key');

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

const MAILBOXES = join(DATA_DIR, 'mailboxes.json');
const PERSISTENT_MAILBOXES = join(PERSISTENT_DIR, 'mailboxes.json');
const BACKUP_MAILBOXES = join(DATA_DIR, 'mailboxes.metrroma.backup.json');
const EXT_MAILBOXES = join(EXTERNAL_DIR, 'mailboxes.json');

const MAIL_ITEMS = join(DATA_DIR, 'mail_items.json');
const PERSISTENT_MAIL_ITEMS = join(PERSISTENT_DIR, 'mail_items.json');
const BACKUP_MAIL_ITEMS = join(DATA_DIR, 'mail_items.metrroma.backup.json');
const EXT_MAIL_ITEMS = join(EXTERNAL_DIR, 'mail_items.json');

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
  const normalized = {
    ...order,
    id: order?.id || ('DOT-' + Math.random().toString(36).slice(2, 10).toUpperCase()),
    createdAt: order?.createdAt || new Date().toISOString(),
  };
  orders.unshift(normalized);
  saveOrders(orders);
  return normalized;
}

export function addOrdersBulk(newOrders) {
  if (!Array.isArray(newOrders) || newOrders.length === 0) return [];
  const orders = getOrders();
  const added = [];
  for (const order of newOrders) {
    const normalized = {
      ...order,
      id: order?.id || ('DOT-' + Math.random().toString(36).slice(2, 10).toUpperCase()),
      createdAt: order?.createdAt || new Date().toISOString(),
    };
    added.push(normalized);
  }
  orders.unshift(...added);
  saveOrders(orders);
  return added;
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

const PAYMENT_SECRET_PREFIX = 'enc:v1:';
let cachedPaymentEncryptionKey = null;
function getPaymentEncryptionKey() {
  if (cachedPaymentEncryptionKey) return cachedPaymentEncryptionKey;
  const readKeyFile = () => {
    const info = lstatSync(PAYMENT_GATEWAY_KEY_FILE);
    if (info.isSymbolicLink() || !info.isFile()) throw new Error('Payment credential key file is not a regular private file.');
    try { chmodSync(PAYMENT_GATEWAY_KEY_FILE, 0o600); } catch {}
    const encoded = readFileSync(PAYMENT_GATEWAY_KEY_FILE, 'utf8').trim();
    if (!/^[a-f0-9]{64}$/i.test(encoded)) throw new Error('Payment credential key file is invalid.');
    return Buffer.from(encoded, 'hex');
  };
  if (existsSync(PAYMENT_GATEWAY_KEY_FILE)) {
    cachedPaymentEncryptionKey = readKeyFile();
    return cachedPaymentEncryptionKey;
  }
  const candidate = randomBytes(32);
  try {
    mkdirSync(EXTERNAL_DIR, { recursive: true, mode: 0o700 });
    writeFileSync(PAYMENT_GATEWAY_KEY_FILE, `${candidate.toString('hex')}\n`, { flag: 'wx', mode: 0o600 });
    try { chmodSync(PAYMENT_GATEWAY_KEY_FILE, 0o600); } catch {}
    cachedPaymentEncryptionKey = candidate;
    return cachedPaymentEncryptionKey;
  } catch (error) {
    if (error?.code === 'EEXIST') {
      cachedPaymentEncryptionKey = readKeyFile();
      return cachedPaymentEncryptionKey;
    }
    throw new Error(`Cannot create the private payment credential key: ${error.message}`);
  }
}

function protectPaymentSecret(value) {
  const plaintext = String(value ?? '');
  if (!plaintext || plaintext.startsWith(PAYMENT_SECRET_PREFIX)) return plaintext;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getPaymentEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return `${PAYMENT_SECRET_PREFIX}${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${encrypted.toString('base64')}`;
}

function revealPaymentSecret(value) {
  const encoded = String(value ?? '');
  if (!encoded.startsWith(PAYMENT_SECRET_PREFIX)) return encoded; // migrate older plaintext integration files on their next save
  const [ivText, tagText, encryptedText, extra] = encoded.slice(PAYMENT_SECRET_PREFIX.length).split('.');
  if (!ivText || !tagText || !encryptedText || extra !== undefined) throw new Error('Encrypted payment credential data is malformed.');
  try {
    const decipher = createDecipheriv('aes-256-gcm', getPaymentEncryptionKey(), Buffer.from(ivText, 'base64'));
    decipher.setAuthTag(Buffer.from(tagText, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(encryptedText, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    throw new Error('Payment credentials could not be decrypted. Keep the private payment key file with the persistent server data before restoring or moving this store.');
  }
}

function mapPaymentCredentials(payments, transform) {
  if (!payments || typeof payments !== 'object' || Array.isArray(payments)) return {};
  const result = { ...payments };
  for (const [providerId, providerConfig] of Object.entries(result)) {
    if (!providerConfig || typeof providerConfig !== 'object' || Array.isArray(providerConfig)) continue;
    const nextConfig = { ...providerConfig };
    for (const environment of ['sandbox', 'live']) {
      const envConfig = nextConfig[environment];
      if (!envConfig || typeof envConfig !== 'object' || Array.isArray(envConfig)) continue;
      const credentials = envConfig.credentials;
      if (!credentials || typeof credentials !== 'object' || Array.isArray(credentials)) continue;
      nextConfig[environment] = {
        ...envConfig,
        credentials: Object.fromEntries(Object.entries(credentials).map(([key, value]) => [key, transform(value)])),
      };
    }
    result[providerId] = nextConfig;
  }
  return result;
}

export const DEFAULT_INTEGRATIONS = {
  email: { enabled: true, provider: 'resend', resendApiKey: process.env.RESEND_API_KEY || '', adminEmail: 'metroomaa@gmail.com', host: '', port: 587, secure: false, user: '', pass: '', fromName: 'SECRATE', fromEmail: 'onboarding@resend.dev' },
  sms: { enabled: false, url: '', method: 'GET', senderId: '', apiKey: '', templatePlaced: 'SECRATE: order {id} received. total {total}. we will call to confirm. track: {track}', templateStatus: 'SECRATE: order {id} is now {status}. {courier}' },
  couriers: [],
  tracking: { fbEnabled: false, fbPixelId: '1122829254194671', fbToken: '', fbTestCode: '', ttkEnabled: false, ttkPixelId: '', ttkToken: '' },
  fraud: { enabled: false, url: '', method: 'GET', headers: '', totalPath: '', successPath: '', cancelPath: '' },
  payments: {},
};

export function getIntegrations() {
  const saved = readSafe(EXT_INTEGRATIONS, PERSISTENT_INTEGRATIONS, INTEGRATIONS, {}, BACKUP_INTEGRATIONS);
  const sms = { ...DEFAULT_INTEGRATIONS.sms, ...(saved.sms || {}) };
  if (Array.isArray(sms.providers)) sms.providers = sms.providers.map((provider) => ({
    ...provider,
    apiKey: revealPaymentSecret(provider?.apiKey),
    balanceApiKey: revealPaymentSecret(provider?.balanceApiKey),
  }));
  return {
    ...saved,
    email: { ...DEFAULT_INTEGRATIONS.email, ...(saved.email || {}) },
    sms,
    couriers: Array.isArray(saved.couriers) ? saved.couriers : [],
    tracking: { ...DEFAULT_INTEGRATIONS.tracking, ...(saved.tracking || {}) },
    fraud: { ...DEFAULT_INTEGRATIONS.fraud, ...(saved.fraud || {}) },
    payments: mapPaymentCredentials(saved.payments, revealPaymentSecret),
  };
}
export function saveIntegrations(next) {
  const integrations = { ...(next || {}) };
  if (integrations.sms && Array.isArray(integrations.sms.providers)) integrations.sms = {
    ...integrations.sms,
    providers: integrations.sms.providers.map((provider) => ({
      ...provider,
      apiKey: protectPaymentSecret(provider?.apiKey),
      balanceApiKey: protectPaymentSecret(provider?.balanceApiKey),
    })),
  };
  const safeNext = { ...integrations, payments: mapPaymentCredentials(integrations.payments, protectPaymentSecret) };
  writeSafe(EXT_INTEGRATIONS, PERSISTENT_INTEGRATIONS, INTEGRATIONS, safeNext, 'integrations', BACKUP_INTEGRATIONS);
  return next;
}
export function getIntegrationsForBackup() {
  const integrations = getIntegrations();
  const sms = integrations.sms && Array.isArray(integrations.sms.providers) ? {
    ...integrations.sms,
    providers: integrations.sms.providers.map(provider => ({ ...provider, apiKey: protectPaymentSecret(provider.apiKey), balanceApiKey: protectPaymentSecret(provider.balanceApiKey) })),
  } : integrations.sms;
  return { ...integrations, sms, payments: mapPaymentCredentials(integrations.payments, protectPaymentSecret) };
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
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(d);
  const fields = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${fields.year}-${fields.month}-${fields.day}`;
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

export function upsertWaChatContact({ phone, remoteJid = '', name = '', lastMessage = '', isIncoming = true }) {
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
      remoteJid: remoteJid || existing.remoteJid || '',
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
      remoteJid: remoteJid || '',
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

// ---- Business Webmail: Custom Mailboxes & Emails ----
export const DEFAULT_MAILBOXES = [
  { email: 'support@secrate.shop', label: 'Customer Support', isDefault: true },
  { email: 'info@secrate.shop', label: 'General Information' },
  { email: 'billing@secrate.shop', label: 'Accounts & Billing' },
];

export function getMailboxes() {
  const list = readSafe(EXT_MAILBOXES, PERSISTENT_MAILBOXES, MAILBOXES, DEFAULT_MAILBOXES, BACKUP_MAILBOXES);
  return Array.isArray(list) && list.length > 0 ? list : DEFAULT_MAILBOXES;
}

export function saveMailboxes(list) {
  const safeList = Array.isArray(list) ? list : [];
  writeSafe(EXT_MAILBOXES, PERSISTENT_MAILBOXES, MAILBOXES, safeList, 'mailboxes', BACKUP_MAILBOXES);
  return safeList;
}

export function getMailItems() {
  const list = readSafe(EXT_MAIL_ITEMS, PERSISTENT_MAIL_ITEMS, MAIL_ITEMS, [], BACKUP_MAIL_ITEMS);
  return Array.isArray(list) ? list : [];
}

export function saveMailItems(list) {
  const safeList = Array.isArray(list) ? list : [];
  writeSafe(EXT_MAIL_ITEMS, PERSISTENT_MAIL_ITEMS, MAIL_ITEMS, safeList, 'mail_items', BACKUP_MAIL_ITEMS);
  return safeList;
}

// In-Memory Presence Tracker (real-time live ping)
const liveStaffPresence = new Map();

export function updateStaffPresence(staff, { active = true, currentPath = '', ip = '', device = '' } = {}) {
  if (!staff || !staff.username) return;
  const username = String(staff.username).toLowerCase();
  const now = Date.now();
  const dateKey = getBangladeshDate();

  const existing = liveStaffPresence.get(username);
  const prev = existing || {
    username,
    name: staff.name || username,
    role: staff.role || 'staff',
    firstSeen: new Date(now).toISOString(),
    lastPing: now,
    status: active ? 'active' : 'idle',
    currentPath: currentPath || 'dashboard',
    ip,
    device
  };

  // Cap elapsed at 180s to tolerate browser background-tab timer throttling without losing time
  const elapsedSeconds = existing?.lastPing
    ? Math.min(180, Math.max(0, Math.round((now - existing.lastPing) / 1000)))
    : 0;

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
      firstLogin: new Date(now).toISOString(),
      lastActive: new Date(now).toISOString(),
      lastSeen: new Date(now).toISOString(),
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
  staffRecord.lastSeen = new Date(now).toISOString();
  if (active) {
    staffRecord.lastActive = new Date(now).toISOString();
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
  const nowIso = new Date().toISOString();
  record.lastActive = nowIso;
  record.lastSeen = nowIso;

  // Also refresh live presence as active whenever staff performs a real KPI action
  const prevLive = liveStaffPresence.get(username);
  liveStaffPresence.set(username, {
    username,
    name: staff.name || prevLive?.name || username,
    role: staff.role || prevLive?.role || 'staff',
    firstSeen: prevLive?.firstSeen || nowIso,
    lastPing: Date.now(),
    status: 'active',
    currentPath: prevLive?.currentPath || 'orders',
    ip: prevLive?.ip || '',
    device: prevLive?.device || ''
  });

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

function getBangladeshDateOffset(daysAgo = 0) {
  const bdMs = Date.now() + 6 * 60 * 60 * 1000 - daysAgo * 86400000;
  return new Date(bdMs).toISOString().slice(0, 10);
}

function getDateRangeKeys(range = 'today') {
  const r = String(range || 'today').toLowerCase();
  if (r === 'yesterday') return [getBangladeshDateOffset(1)];
  if (r === '7d') return Array.from({ length: 7 }, (_, i) => getBangladeshDateOffset(i));
  if (r === '30d') return Array.from({ length: 30 }, (_, i) => getBangladeshDateOffset(i));
  return [getBangladeshDateOffset(0)];
}

function parseShiftMinutes(hhmm) {
  const m = String(hhmm || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

function getBdMinutesOfDay(isoStr) {
  if (!isoStr) return null;
  const ts = new Date(isoStr).getTime();
  if (!Number.isFinite(ts)) return null;
  const bd = new Date(ts + 6 * 60 * 60 * 1000);
  return bd.getUTCHours() * 60 + bd.getUTCMinutes();
}

export function getStaffMonitoringData(range = 'today') {
  const now = Date.now();
  const dateKey = getBangladeshDate();
  const rangeKeys = getDateRangeKeys(range);
  const rangeKeySet = new Set(rangeKeys);
  const allActivity = getStaffActivity();

  const users = getUsers() || [];
  const allOrders = getOrders() || [];
  const allCalls = getCalls() || [];
  const monitoringList = [];

  const allStaffCandidates = [
    { username: 'owner', name: 'Store Owner', role: 'owner', dailyTarget: 0, commissionPerOrder: 0, shiftStart: '10:00', shiftEnd: '22:00', permissions: { canCancel: true, canEditPrice: true, canExportCsv: true, maskPhone: false } },
    ...users.map(u => ({
      id: u.id,
      username: u.username,
      name: u.name || u.username,
      role: u.role || 'staff',
      dailyTarget: Number(u.dailyTarget) > 0 ? Number(u.dailyTarget) : 25,
      commissionPerOrder: Number(u.commissionPerOrder) >= 0 ? Number(u.commissionPerOrder) : 0,
      shiftStart: u.shiftStart || '10:00',
      shiftEnd: u.shiftEnd || '20:00',
      permissions: u.permissions || { canCancel: false, canEditPrice: false, canExportCsv: true, maskPhone: false }
    }))
  ];

  // Pre-aggregate calls in date range by staff username
  const callAgg = new Map();
  for (const c of allCalls) {
    const cDate = c.createdAt || c.startedAt;
    if (!cDate) continue;
    const bdDate = new Date(new Date(cDate).getTime() + 6 * 60 * 60 * 1000).toISOString().slice(0, 10);
    if (!rangeKeySet.has(bdDate)) continue;
    const un = String(c.staff?.username || '').toLowerCase();
    if (!un) continue;
    if (!callAgg.has(un)) callAgg.set(un, { callsMade: 0, callsAnswered: 0, callDurationSec: 0 });
    const row = callAgg.get(un);
    row.callsMade += 1;
    const dur = Number(c.duration || 0);
    if (c.outcome === 'answered' || c.outcome === 'connected' || dur > 0) {
      row.callsAnswered += 1;
    }
    row.callDurationSec += dur;
  }

  // Pre-aggregate order quality (delivered vs return/lost) & assigned orders per staff
  const orderAgg = new Map();
  for (const o of allOrders) {
    const handler = String(o.confirmedBy || o.assignedTo || o.lastUpdatedBy?.username || '').toLowerCase();
    if (!handler) continue;
    const oDate = o.confirmedAt || o.createdAt;
    const bdDate = oDate ? new Date(new Date(oDate).getTime() + 6 * 60 * 60 * 1000).toISOString().slice(0, 10) : '';
    if (!orderAgg.has(handler)) {
      orderAgg.set(handler, { assignedToday: 0, deliveredCount: 0, returnCount: 0, lostCount: 0, rangeDelivered: 0, rangeReturn: 0 });
    }
    const oa = orderAgg.get(handler);
    if (String(o.assignedTo || '').toLowerCase() === handler && bdDate === dateKey) {
      oa.assignedToday += 1;
    }
    const st = String(o.status || '').toLowerCase();
    if (st === 'delivered') {
      oa.deliveredCount += 1;
      if (rangeKeySet.has(bdDate)) oa.rangeDelivered += 1;
    } else if (st === 'return' || st === 'returned') {
      oa.returnCount += 1;
      if (rangeKeySet.has(bdDate)) oa.rangeReturn += 1;
    } else if (st === 'lost') {
      oa.lostCount += 1;
    }
  }

  const nowBdMin = getBdMinutesOfDay(new Date().toISOString());

  for (const cand of allStaffCandidates) {
    const un = cand.username.toLowerCase();
    const live = liveStaffPresence.get(un);

    // Aggregate activity across rangeKeys
    let firstLogin = null;
    let lastActive = null;
    let lastSeen = null;
    let activeSeconds = 0;
    let idleSeconds = 0;
    const ordersHandled = { confirmed: 0, cancelled: 0, approved: 0, hold: 0, shipped: 0, total: 0 };
    let couriersBooked = 0;
    let whatsappSent = 0;
    let totalRevenueProcessed = 0;

    for (const dk of rangeKeys) {
      const rec = allActivity[dk]?.[un];
      if (!rec) continue;
      if (rec.firstLogin && (!firstLogin || rec.firstLogin < firstLogin)) firstLogin = rec.firstLogin;
      if (rec.lastActive && (!lastActive || rec.lastActive > lastActive)) lastActive = rec.lastActive;
      if (rec.lastSeen && (!lastSeen || rec.lastSeen > lastSeen)) lastSeen = rec.lastSeen;
      activeSeconds += rec.activeSeconds || 0;
      idleSeconds += rec.idleSeconds || 0;
      const oh = rec.ordersHandled || {};
      ordersHandled.confirmed += oh.confirmed || 0;
      ordersHandled.cancelled += oh.cancelled || 0;
      ordersHandled.approved += oh.approved || 0;
      ordersHandled.hold += oh.hold || 0;
      ordersHandled.shipped += oh.shipped || 0;
      ordersHandled.total += oh.total || 0;
      couriersBooked += rec.couriersBooked || 0;
      whatsappSent += rec.whatsappSent || 0;
      totalRevenueProcessed += rec.totalRevenueProcessed || 0;
    }

    const todayRec = allActivity[dateKey]?.[un] || {};

    let status = 'offline';
    if (live) {
      const diffSec = Math.round((now - live.lastPing) / 1000);
      if (diffSec <= 120) {
        status = live.status === 'idle' ? 'idle' : 'active';
      } else {
        status = 'offline';
      }
    } else if (todayRec.lastSeen || todayRec.lastActive) {
      const lastTs = new Date(todayRec.lastSeen || todayRec.lastActive).getTime();
      if (Number.isFinite(lastTs) && Math.round((now - lastTs) / 1000) <= 120) {
        status = 'active';
      }
    }

    const calls = callAgg.get(un) || { callsMade: 0, callsAnswered: 0, callDurationSec: 0 };
    const oq = orderAgg.get(un) || { assignedToday: 0, deliveredCount: 0, returnCount: 0, lostCount: 0, rangeDelivered: 0, rangeReturn: 0 };
    const resolvedTotal = oq.deliveredCount + oq.returnCount + oq.lostCount;
    const deliverySuccessRate = resolvedTotal > 0 ? Math.round((oq.deliveredCount / resolvedTotal) * 100) : null;

    const targetTotal = cand.dailyTarget > 0 ? cand.dailyTarget * rangeKeys.length : 0;
    const targetProgressPct = targetTotal > 0 ? Math.min(100, Math.round((ordersHandled.confirmed / targetTotal) * 100)) : 0;
    const commissionEarned = cand.commissionPerOrder > 0 ? Math.round(ordersHandled.confirmed * cand.commissionPerOrder) : 0;

    // Shift & Late/Idle Alerts (evaluated on today's login)
    const shiftStartMin = parseShiftMinutes(cand.shiftStart);
    const shiftEndMin = parseShiftMinutes(cand.shiftEnd);
    const todayLoginMin = getBdMinutesOfDay(todayRec.firstLogin);
    const isLateLogin = !!(cand.role !== 'owner' && shiftStartMin !== null && todayLoginMin !== null && todayLoginMin > shiftStartMin + 15);
    const inShiftNow = shiftStartMin !== null && shiftEndMin !== null && nowBdMin !== null && nowBdMin >= shiftStartMin && nowBdMin <= shiftEndMin;
    const isLongIdle = !!(cand.role !== 'owner' && inShiftNow && status === 'idle' && (todayRec.idleSeconds || 0) >= 900);

    monitoringList.push({
      id: cand.id || un,
      username: cand.username,
      name: cand.name,
      role: cand.role,
      status,
      lastPing: live ? live.lastPing : null,
      currentPath: live ? live.currentPath : '',
      firstLogin,
      lastActive,
      activeSeconds,
      idleSeconds,
      ordersHandled,
      couriersBooked,
      whatsappSent,
      totalRevenueProcessed,
      callsMade: calls.callsMade,
      callsAnswered: calls.callsAnswered,
      callDurationSec: calls.callDurationSec,
      assignedToday: oq.assignedToday,
      deliveredCount: oq.deliveredCount,
      returnCount: oq.returnCount,
      lostCount: oq.lostCount,
      deliverySuccessRate,
      dailyTarget: cand.dailyTarget,
      targetTotal,
      targetProgressPct,
      commissionPerOrder: cand.commissionPerOrder,
      commissionEarned,
      shiftStart: cand.shiftStart,
      shiftEnd: cand.shiftEnd,
      isLateLogin,
      isLongIdle,
      permissions: cand.permissions
    });
  }

  return {
    date: dateKey,
    range: String(range || 'today'),
    rangeDays: rangeKeys.length,
    timestamp: new Date().toISOString(),
    staff: monitoringList,
    recentAuditLogs: getAuditLogs().slice(0, 100)
  };
}

// ==========================================
// SMART STAFF ASSIGNMENT & NOTIFICATIONS
// ==========================================
const STAFF_NOTIFICATIONS_FILE = join(EXTERNAL_DIR, 'staff_notifications.json');

export function getStaffNotifications(username = '') {
  let list = [];
  try {
    if (existsSync(STAFF_NOTIFICATIONS_FILE)) {
      list = JSON.parse(readFileSync(STAFF_NOTIFICATIONS_FILE, 'utf8'));
    }
  } catch (_) { list = []; }
  if (!Array.isArray(list)) list = [];
  if (username) {
    const un = String(username).toLowerCase();
    list = list.filter(n => {
      const target = String(n.toUsername || '').toLowerCase();
      return target === un || target === 'all';
    });
  }
  return list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

export function addStaffNotification(notif) {
  const list = getStaffNotifications();
  const entry = {
    id: 'sn_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    read: false,
    createdAt: new Date().toISOString(),
    ...notif
  };
  list.unshift(entry);
  if (list.length > 500) list.length = 500;
  try {
    writeFileSync(STAFF_NOTIFICATIONS_FILE, JSON.stringify(list, null, 2));
  } catch (_) {}
  return entry;
}

export function markStaffNotificationsRead(username, ids = []) {
  const list = getStaffNotifications();
  const un = String(username || '').toLowerCase();
  const idSet = Array.isArray(ids) && ids.length > 0 ? new Set(ids) : null;
  let changed = false;
  for (const n of list) {
    const target = String(n.toUsername || '').toLowerCase();
    if ((target === un || target === 'all') && (!idSet || idSet.has(n.id))) {
      if (!n.read) { n.read = true; changed = true; }
    }
  }
  if (changed) {
    try { writeFileSync(STAFF_NOTIFICATIONS_FILE, JSON.stringify(list, null, 2)); } catch (_) {}
  }
  return changed;
}

export function autoAssignOnlineStaff(campaignName = '') {
  const settings = getSettings();
  if (!settings.autoAssignOrders) return null;
  const mon = getStaffMonitoringData('today');
  const onlineStaff = (mon.staff || []).filter(s => s.role !== 'owner' && s.status === 'active');
  if (onlineStaff.length === 0) return null;

  const spends = getCampaignSpends();
  const isPriorityCamp = !!(campaignName && spends[campaignName]?.isPriority);

  if (isPriorityCamp) {
    // Priority campaign -> route to active staff with highest deliverySuccessRate, tie-break by fewest assignedToday
    onlineStaff.sort((a, b) => ((b.deliverySuccessRate ?? -1) - (a.deliverySuccessRate ?? -1)) || (a.assignedToday - b.assignedToday));
  } else {
    // Round-robin by fewest assignedToday, tie-break by fewest ordersHandled.total
    onlineStaff.sort((a, b) => (a.assignedToday - b.assignedToday) || ((a.ordersHandled?.total || 0) - (b.ordersHandled?.total || 0)));
  }
  const chosen = onlineStaff[0];
  return {
    assignedTo: chosen.username,
    assignedToName: chosen.name,
    assignedAt: new Date().toISOString()
  };
}

// ==========================================
// ADS CAMPAIGN SMART ANALYTICS & PROFIT
// ==========================================
const CAMPAIGN_SPENDS_FILE = join(EXTERNAL_DIR, 'campaign_spends.json');

export function getCampaignSpends() {
  try {
    if (existsSync(CAMPAIGN_SPENDS_FILE)) {
      const parsed = JSON.parse(readFileSync(CAMPAIGN_SPENDS_FILE, 'utf8'));
      return parsed && typeof parsed === 'object' ? parsed : {};
    }
  } catch (_) {}
  return {};
}

export function getAdsSyncConfig() {
  const s = getSettings();
  const cfg = s.adsSyncConfig || {};
  const legacyMeta = s.metaAdsConfig || {};
  let metaAccounts = Array.isArray(cfg.metaAccounts) ? cfg.metaAccounts : [];
  if (metaAccounts.length === 0 && legacyMeta.adAccountId) {
    metaAccounts = [{
      id: 'meta_1',
      label: 'Primary Meta Account',
      adAccountId: legacyMeta.adAccountId,
      accessToken: legacyMeta.accessToken || ''
    }];
  }
  const tiktokAccounts = Array.isArray(cfg.tiktokAccounts) ? cfg.tiktokAccounts : [];
  let webhookSecret = cfg.webhookSecret || '';
  if (!webhookSecret) {
    webhookSecret = 'gads_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    saveSettings({ ...s, adsSyncConfig: { ...cfg, metaAccounts, tiktokAccounts, webhookSecret } });
  }
  return {
    metaAccounts,
    tiktokAccounts,
    usdToBdtRate: Number(cfg.usdToBdtRate || legacyMeta.usdToBdtRate) > 0 ? Number(cfg.usdToBdtRate || legacyMeta.usdToBdtRate) : 122,
    lastSyncedAt: cfg.lastSyncedAt || legacyMeta.lastSyncedAt || null,
    webhookSecret
  };
}

export function saveAdsSyncConfig(patch = {}) {
  const s = getSettings();
  const prev = getAdsSyncConfig();
  const prevMetaById = new Map((prev.metaAccounts || []).map(a => [a.id, a]));
  const prevTikById = new Map((prev.tiktokAccounts || []).map(a => [a.id, a]));

  const metaAccounts = Array.isArray(patch.metaAccounts)
    ? patch.metaAccounts.map((a, i) => {
        let acct = String(a.adAccountId || '').trim();
        if (acct && !acct.startsWith('act_')) acct = 'act_' + acct.replace(/[^0-9]/g, '');
        const old = prevMetaById.get(a.id);
        return {
          id: a.id || ('meta_' + Date.now().toString(36) + i),
          label: String(a.label || `Meta Account ${i + 1}`).trim(),
          adAccountId: acct,
          usdRate: Number(a.usdRate) > 0 ? Number(a.usdRate) : null,
          accessToken: String(a.accessToken || '').trim() || old?.accessToken || ''
        };
      }).filter(a => a.adAccountId)
    : prev.metaAccounts;

  const tiktokAccounts = Array.isArray(patch.tiktokAccounts)
    ? patch.tiktokAccounts.map((a, i) => {
        const old = prevTikById.get(a.id);
        return {
          id: a.id || ('tik_' + Date.now().toString(36) + i),
          label: String(a.label || `TikTok Account ${i + 1}`).trim(),
          advertiserId: String(a.advertiserId || '').trim(),
          usdRate: Number(a.usdRate) > 0 ? Number(a.usdRate) : null,
          accessToken: String(a.accessToken || '').trim() || old?.accessToken || ''
        };
      }).filter(a => a.advertiserId)
    : prev.tiktokAccounts;

  const next = {
    metaAccounts,
    tiktokAccounts,
    usdToBdtRate: patch.usdToBdtRate !== undefined && Number(patch.usdToBdtRate) > 0 ? Number(patch.usdToBdtRate) : prev.usdToBdtRate,
    lastSyncedAt: patch.lastSyncedAt !== undefined ? patch.lastSyncedAt : prev.lastSyncedAt,
    webhookSecret: prev.webhookSecret
  };
  saveSettings({ ...s, adsSyncConfig: next });
  return next;
}

export function getMetaAdsConfig() {
  const cfg = getAdsSyncConfig();
  const first = cfg.metaAccounts[0] || {};
  return {
    adAccountId: first.adAccountId || '',
    accessToken: first.accessToken || '',
    usdToBdtRate: cfg.usdToBdtRate,
    lastSyncedAt: cfg.lastSyncedAt
  };
}

export function saveMetaAdsConfig(patch = {}) {
  const prev = getAdsSyncConfig();
  const first = prev.metaAccounts[0] || { id: 'meta_1', label: 'Primary Meta Account', adAccountId: '', accessToken: '' };
  const updatedFirst = {
    ...first,
    adAccountId: patch.adAccountId !== undefined ? patch.adAccountId : first.adAccountId,
    accessToken: patch.accessToken !== undefined && String(patch.accessToken).trim() ? patch.accessToken : first.accessToken
  };
  return saveAdsSyncConfig({
    metaAccounts: updatedFirst.adAccountId ? [updatedFirst, ...prev.metaAccounts.slice(1)] : prev.metaAccounts,
    usdToBdtRate: patch.usdToBdtRate,
    lastSyncedAt: patch.lastSyncedAt
  });
}

export function saveCampaignSpend(campaignKey, patch = {}) {
  const key = String(campaignKey || '').trim();
  if (!key) return null;
  const all = getCampaignSpends();
  const prev = all[key] || {};
  all[key] = {
    adSpend: patch.adSpend !== undefined ? Math.max(0, Number(patch.adSpend) || 0) : (prev.adSpend || 0),
    isPriority: patch.isPriority !== undefined ? !!patch.isPriority : !!prev.isPriority,
    notes: patch.notes !== undefined ? String(patch.notes || '') : (prev.notes || ''),
    impressions: patch.impressions !== undefined ? (Number(patch.impressions) || 0) : (prev.impressions || 0),
    clicks: patch.clicks !== undefined ? (Number(patch.clicks) || 0) : (prev.clicks || 0),
    ctr: patch.ctr !== undefined ? (Number(patch.ctr) || 0) : (prev.ctr || 0),
    spendUsd: patch.spendUsd !== undefined ? (Number(patch.spendUsd) || 0) : (prev.spendUsd || 0),
    metaCampaignName: patch.metaCampaignName !== undefined ? String(patch.metaCampaignName || '') : (prev.metaCampaignName || ''),
    adStatus: patch.adStatus !== undefined ? String(patch.adStatus || '').toUpperCase() : (prev.adStatus || ''),
    syncedAt: patch.syncedAt !== undefined ? patch.syncedAt : (prev.syncedAt || null),
    updatedAt: new Date().toISOString()
  };
  try {
    writeFileSync(CAMPAIGN_SPENDS_FILE, JSON.stringify(all, null, 2));
  } catch (_) {}
  return all[key];
}

export function getCampaignAnalytics(range = '7d') {
  const r = String(range || '7d').toLowerCase();
  const rangeKeys = r === 'all' ? null : new Set(getDateRangeKeys(r));
  const allOrders = getOrders() || [];
  const spends = getCampaignSpends();
  const map = new Map();

  for (const o of allOrders) {
    if (o.status === 'incomplete') continue;
    if (rangeKeys) {
      const bdDate = o.createdAt ? new Date(new Date(o.createdAt).getTime() + 6 * 60 * 60 * 1000).toISOString().slice(0, 10) : '';
      if (!rangeKeys.has(bdDate)) continue;
    }
    const campRaw = String(o.attribution?.campaign || '').trim();
    const key = campRaw || '(Direct / No Campaign)';
    if (!map.has(key)) {
      map.set(key, {
        campaign: key,
        isDirect: !campRaw,
        channel: o.attribution?.channel || o.source || 'direct',
        source: o.attribution?.source || '',
        totalOrders: 0,
        pending: 0,
        confirmed: 0,
        shipped: 0,
        delivered: 0,
        cancelled: 0,
        returned: 0,
        lost: 0,
        grossSales: 0,
        deliveredSales: 0
      });
    }
    const row = map.get(key);
    row.totalOrders += 1;
    const totalAmt = Number(o.total || 0);
    row.grossSales += totalAmt;
    const st = String(o.status || '').toLowerCase();
    if (st === 'pending' || st === 'approved' || st === 'hold') row.pending += 1;
    else if (st === 'confirmed') row.confirmed += 1;
    else if (st === 'shipped') row.shipped += 1;
    else if (st === 'delivered') {
      row.delivered += 1;
      row.deliveredSales += totalAmt;
    } else if (st === 'cancelled') row.cancelled += 1;
    else if (st === 'return' || st === 'returned') row.returned += 1;
    else if (st === 'lost') row.lost += 1;
  }

  const campaigns = [];
  for (const row of map.values()) {
    const cfg = spends[row.campaign] || { adSpend: 0, isPriority: false, notes: '' };
    const activeConfirmed = row.confirmed + row.shipped + row.delivered;
    const confirmRate = row.totalOrders > 0 ? Math.round((activeConfirmed / row.totalOrders) * 100) : 0;
    const resolvedTotal = row.delivered + row.returned + row.lost;
    const deliveryRate = resolvedTotal > 0 ? Math.round((row.delivered / resolvedTotal) * 100) : null;
    const failedTotal = row.cancelled + row.returned + row.lost;
    const cancelReturnRate = row.totalOrders > 0 ? Math.round((failedTotal / row.totalOrders) * 100) : 0;
    const adSpend = Number(cfg.adSpend || 0);
    const costPerOrder = adSpend > 0 && row.totalOrders > 0 ? Math.round(adSpend / row.totalOrders) : 0;
    const costPerDelivered = adSpend > 0 && row.delivered > 0 ? Math.round(adSpend / row.delivered) : 0;
    const netProfit = row.deliveredSales - adSpend;
    const roas = adSpend > 0 ? Number((row.deliveredSales / adSpend).toFixed(2)) : null;
    const isHighLossAlert = !row.isDirect && row.totalOrders >= 3 && cancelReturnRate >= 40;

    campaigns.push({
      ...row,
      confirmRate,
      deliveryRate,
      cancelReturnRate,
      adSpend,
      costPerOrder,
      costPerDelivered,
      netProfit,
      roas,
      isPriority: !!cfg.isPriority,
      notes: cfg.notes || '',
      impressions: Number(cfg.impressions || 0),
      clicks: Number(cfg.clicks || 0),
      ctr: Number(cfg.ctr || 0),
      spendUsd: Number(cfg.spendUsd || 0),
      metaCampaignName: cfg.metaCampaignName || '',
      adStatus: cfg.adStatus || '',
      syncedAt: cfg.syncedAt || null,
      isHighLossAlert
    });
  }

  campaigns.sort((a, b) => b.totalOrders - a.totalOrders);
  const adsCfg = getAdsSyncConfig();
  return {
    range: r,
    campaigns,
    adsConfig: {
      metaAccounts: (adsCfg.metaAccounts || []).map(a => ({ id: a.id, label: a.label, adAccountId: a.adAccountId, usdRate: a.usdRate || null, hasToken: !!a.accessToken })),
      tiktokAccounts: (adsCfg.tiktokAccounts || []).map(a => ({ id: a.id, label: a.label, advertiserId: a.advertiserId, usdRate: a.usdRate || null, hasToken: !!a.accessToken })),
      usdToBdtRate: adsCfg.usdToBdtRate,
      lastSyncedAt: adsCfg.lastSyncedAt,
      webhookSecret: adsCfg.webhookSecret
    },
    summary: {
      totalCampaigns: campaigns.filter(c => !c.isDirect).length,
      totalOrders: campaigns.reduce((s, c) => s + c.totalOrders, 0),
      totalDeliveredSales: campaigns.reduce((s, c) => s + c.deliveredSales, 0),
      totalAdSpend: campaigns.reduce((s, c) => s + c.adSpend, 0),
      highLossAlerts: campaigns.filter(c => c.isHighLossAlert).length
    }
  };
}

// ==========================================
// IP TELEPHONY, CALL LOGS & VOICE AUDIT
// ==========================================
const CALLS_FILE = join(EXTERNAL_DIR, 'calls.json');
const TELEPHONY_FILE = join(EXTERNAL_DIR, 'telephony.json');
const CALL_TRANSFERS_FILE = join(EXTERNAL_DIR, 'call_transfers.json');
const RECORDINGS_DIR = join(EXTERNAL_DIR, 'uploads', 'recordings');
try { mkdirSync(RECORDINGS_DIR, { recursive: true }); } catch (_) {}

export function getCallTransfers(filters = {}) {
  let list = [];
  try {
    if (existsSync(CALL_TRANSFERS_FILE)) list = JSON.parse(readFileSync(CALL_TRANSFERS_FILE, 'utf8'));
  } catch (_) { list = []; }
  if (!Array.isArray(list)) list = [];
  if (filters.status && filters.status !== 'all') list = list.filter((item) => item.status === filters.status);
  return list.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
}

export function saveCallTransfer(data = {}) {
  const list = getCallTransfers();
  const sessionId = String(data.sessionId || '').slice(0, 100);
  const duplicate = list.find((item) => sessionId && item.sessionId === sessionId && item.status !== 'rejected');
  if (duplicate) return duplicate;
  const transfer = {
    id: String(data.id || ('tr_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7))),
    sessionId,
    status: 'pending',
    customerName: String(data.customerName || 'Website Visitor').slice(0, 100),
    customerPhone: String(data.customerPhone || '').slice(0, 32),
    customerAddress: String(data.customerAddress || '').slice(0, 300),
    customerTier: String(data.customerTier || 'New').slice(0, 40),
    productName: String(data.productName || '').slice(0, 180),
    orderId: String(data.orderId || '').slice(0, 100) || null,
    reason: String(data.reason || 'Customer requested human help').slice(0, 300),
    note: String(data.note || '').slice(0, 1200),
    assignedTo: String(data.assignedTo || '').slice(0, 100),
    assignedName: String(data.assignedName || '').slice(0, 100),
    assignedExt: String(data.assignedExt || '').slice(0, 20),
    createdAt: Number(data.createdAt) || Date.now(),
    updatedAt: Date.now(),
    handledBy: '',
    handledAt: null,
  };
  list.unshift(transfer);
  if (list.length > 1000) list.length = 1000;
  writeFileSync(CALL_TRANSFERS_FILE, JSON.stringify(list, null, 2));
  return transfer;
}

export function updateCallTransfer(id, patch = {}) {
  const list = getCallTransfers();
  const index = list.findIndex((item) => item.id === String(id));
  if (index < 0) return null;
  const current = list[index];
  const status = ['pending', 'approved', 'calling', 'completed', 'rejected'].includes(String(patch.status || ''))
    ? String(patch.status) : current.status;
  list[index] = {
    ...current,
    status,
    updatedAt: Date.now(),
    handledBy: patch.handledBy == null ? current.handledBy : String(patch.handledBy).slice(0, 100),
    handledAt: patch.handledAt === undefined ? current.handledAt : patch.handledAt,
    callId: patch.callId === undefined ? current.callId || null : String(patch.callId || '').slice(0, 100) || null,
    outcome: patch.outcome === undefined ? current.outcome || '' : String(patch.outcome || '').slice(0, 300),
  };
  writeFileSync(CALL_TRANSFERS_FILE, JSON.stringify(list, null, 2));
  return list[index];
}

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
    direction: callData.direction === 'inbound' ? 'inbound' : 'outbound',
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
  writeFileSync(CALLS_FILE, JSON.stringify(list, null, 2));

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
          direction: record.direction,
          note: `${record.direction === 'inbound' ? '📥 Incoming' : '📤 Outbound'} IP Call (${durStr}) · Outcome: ${record.outcome}${record.notes ? ' · Note: ' + record.notes : ''}`,
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

export function updateCall(callId, patch = {}) {
  let list = [];
  try {
    if (existsSync(CALLS_FILE)) {
      list = JSON.parse(readFileSync(CALLS_FILE, 'utf8'));
    }
  } catch (_) {
    return null;
  }
  if (!Array.isArray(list)) return null;
  const idx = list.findIndex((c) => c.id === callId);
  if (idx === -1) return null;
  list[idx] = {
    ...list[idx],
    ...(patch.outcome !== undefined ? { outcome: patch.outcome } : {}),
    ...(patch.notes !== undefined ? { notes: String(patch.notes || '').trim() } : {}),
    ...(patch.recordingUrl !== undefined ? { recordingUrl: patch.recordingUrl } : {}),
    ...(patch.fileSize !== undefined ? { fileSize: parseInt(patch.fileSize, 10) || 0 } : {}),
    ...(patch.duration !== undefined ? { duration: Math.max(0, parseInt(patch.duration, 10) || 0) } : {}),
    updatedAt: new Date().toISOString()
  };
  writeFileSync(CALLS_FILE, JSON.stringify(list, null, 2));
  return list[idx];
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
  writeFileSync(CALLS_FILE, JSON.stringify(list, null, 2));

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
  const todayStr = getBangladeshDate();
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
  const defaults = {
    enabled: true,
    provider: 'webrtc',
    callerId: '09638752122',
    sipServer: 'timingboost.xyz',
    wssUrl: 'wss://timingboost.xyz/ws',
    sipUsername: '1001',
    sipPassword: 'TbSip#1001!',
    retentionDays: 30,
    autoRecord: true,
    testMode: false,
    aiCalling: {
      enabled: true,
      voiceEngine: 'gemini_browser', // 'gemini_browser' | 'elevenlabs'
      elevenLabsKey: '',
      elevenLabsVoiceId: 'pNInz6obpgDQGcFmaJgB',
      autoConfirmEnabled: false,
      marketingModeEnabled: true,
      websiteInboundAi: true,
      quietHoursEnabled: true,
      quietStartHour: 22,
      quietEndHour: 9,
      whatsappFallbackOnNoAnswer: true,
      autoTransferOnConfusion: true,
      aiLanguage: 'bn',
      aiPersonaPrompt: ''
    }
  };
  try {
    if (existsSync(TELEPHONY_FILE)) {
      const saved = JSON.parse(readFileSync(TELEPHONY_FILE, 'utf8'));
      return {
        ...defaults,
        ...saved,
        sipServer: saved.sipServer || defaults.sipServer,
        wssUrl: saved.wssUrl || defaults.wssUrl,
        sipUsername: saved.sipUsername || defaults.sipUsername,
        sipPassword: saved.sipPassword || defaults.sipPassword,
        provider: saved.provider && saved.provider !== 'simulation' ? saved.provider : defaults.provider,
        aiCalling: { ...defaults.aiCalling, ...(saved.aiCalling || {}) }
      };
    }
  } catch (_) {}
  return defaults;
}

export function saveTelephonySettings(settings) {
  const current = getTelephonySettings();
  const merged = {
    ...current,
    ...settings,
    aiCalling: { ...(current.aiCalling || {}), ...(settings?.aiCalling || {}) },
    updatedAt: new Date().toISOString()
  };
  writeFileSync(TELEPHONY_FILE, JSON.stringify(merged, null, 2));
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

// ==========================================
// Daily Expenses & True Profit Ledger
// ==========================================
const EXPENSES_FILE = join(EXTERNAL_DIR, 'expenses.json');
const LEGACY_EXPENSES_FILE = join(PERSISTENT_DIR, 'expenses.json');

export function getExpenses() {
  try {
    if (existsSync(EXPENSES_FILE)) {
      const list = JSON.parse(readFileSync(EXPENSES_FILE, 'utf8'));
      return Array.isArray(list) ? list : [];
    }
  } catch (_) {}
  try {
    if (existsSync(LEGACY_EXPENSES_FILE)) {
      const legacy = JSON.parse(readFileSync(LEGACY_EXPENSES_FILE, 'utf8'));
      if (Array.isArray(legacy)) {
        writeAtomic(EXPENSES_FILE, JSON.stringify(legacy, null, 2));
        return legacy;
      }
    }
  } catch (_) {}
  return [];
}

export function addExpense({ date, category, title, amount, note = '', by = 'owner' }) {
  const amt = Math.max(0, Number(amount) || 0);
  const cleanTitle = String(title || '').trim();
  if (!cleanTitle || amt <= 0) return null;
  const list = getExpenses();
  const entry = {
    id: 'exp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    date: date || getBangladeshDate(),
    category: String(category || 'general').trim(),
    title: cleanTitle,
    amount: amt,
    note: String(note || '').trim(),
    by: String(by || 'owner'),
    createdAt: new Date().toISOString(),
  };
  list.unshift(entry);
  try { writeAtomic(EXPENSES_FILE, JSON.stringify(list.slice(0, 2000), null, 2)); } catch (_) {}
  return entry;
}

export function deleteExpense(id) {
  const list = getExpenses().filter((x) => x.id !== id);
  try { writeAtomic(EXPENSES_FILE, JSON.stringify(list, null, 2)); } catch (_) {}
  return list;
}

// ==========================================
// Finance accounts, cash movements and assets
// ==========================================
const FINANCE_WORKSPACE_FILE = join(EXTERNAL_DIR, 'finance_workspace.json');

function readFinanceWorkspace() {
  try {
    const value = JSON.parse(readFileSync(FINANCE_WORKSPACE_FILE, 'utf8'));
    return {
      accounts: Array.isArray(value?.accounts) ? value.accounts : [],
      transactions: Array.isArray(value?.transactions) ? value.transactions : [],
      assets: Array.isArray(value?.assets) ? value.assets : [],
    };
  } catch {
    return { accounts: [], transactions: [], assets: [] };
  }
}

function writeFinanceWorkspace(value) {
  writeAtomic(FINANCE_WORKSPACE_FILE, JSON.stringify(value, null, 2));
}

export function getFinanceWorkspace() {
  return readFinanceWorkspace();
}

export function deleteFinanceExpenseTransaction(expenseId) {
  const data = readFinanceWorkspace();
  const next = data.transactions.filter((entry) => entry.expenseId !== expenseId);
  const removed = data.transactions.length - next.length;
  if (removed) {
    data.transactions = next;
    writeFinanceWorkspace(data);
  }
  return removed;
}

export function addFinanceAccount({ name, type = 'bank', openingBalance = 0, note = '', by = 'owner' }) {
  const cleanName = String(name || '').trim().slice(0, 80);
  const amount = Number(openingBalance);
  const types = new Set(['cash', 'bank', 'mobile_wallet', 'other']);
  if (!cleanName || !Number.isFinite(amount) || amount < 0 || !types.has(type)) return null;
  const data = readFinanceWorkspace();
  const account = {
    id: 'acct_' + randomUUID().slice(0, 12), name: cleanName, type,
    openingBalance: amount, note: String(note || '').trim().slice(0, 300),
    status: 'active', createdAt: new Date().toISOString(), by: String(by || 'owner'),
  };
  data.accounts.unshift(account);
  writeFinanceWorkspace(data);
  return account;
}

export function updateFinanceAccount(id, patch = {}) {
  const data = readFinanceWorkspace();
  const account = data.accounts.find((item) => item.id === id);
  if (!account) return null;
  if (typeof patch.name === 'string' && patch.name.trim()) account.name = patch.name.trim().slice(0, 80);
  if (['active', 'archived'].includes(patch.status)) account.status = patch.status;
  if (typeof patch.note === 'string') account.note = patch.note.trim().slice(0, 300);
  account.updatedAt = new Date().toISOString();
  writeFinanceWorkspace(data);
  return account;
}

export function addFinanceTransaction({ type, accountId, toAccountId = '', amount, date, category = '', title, reference = '', note = '', by = 'owner', expenseId = '' }) {
  const value = Number(amount);
  const cleanTitle = String(title || '').trim().slice(0, 120);
  const data = readFinanceWorkspace();
  const validTypes = new Set(['income', 'expense', 'transfer']);
  const account = data.accounts.find((item) => item.id === accountId && item.status !== 'archived');
  const toAccount = type === 'transfer' ? data.accounts.find((item) => item.id === toAccountId && item.status !== 'archived') : null;
  if (!validTypes.has(type) || !Number.isFinite(value) || value <= 0 || !cleanTitle || !account || (type === 'transfer' && (!toAccount || toAccount.id === account.id))) return null;
  const entry = {
    id: 'txn_' + randomUUID().slice(0, 12), type, accountId: account.id,
    toAccountId: toAccount?.id || '', amount: value,
    date: /^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) ? String(date) : getBangladeshDate(),
    category: String(category || (type === 'income' ? 'other_income' : type === 'expense' ? 'general' : 'transfer')).trim().slice(0, 60),
    title: cleanTitle, reference: String(reference || '').trim().slice(0, 100),
    note: String(note || '').trim().slice(0, 500), expenseId: String(expenseId || ''),
    createdAt: new Date().toISOString(), by: String(by || 'owner'),
  };
  data.transactions.unshift(entry);
  writeFinanceWorkspace(data);
  return entry;
}

export function addFinanceAsset({ name, category = 'equipment', location = '', purchaseDate, purchaseValue, currentValue, usefulLifeMonths = 0, note = '', by = 'owner' }) {
  const cleanName = String(name || '').trim().slice(0, 120);
  const purchase = Number(purchaseValue);
  const current = currentValue === '' || currentValue == null ? purchase : Number(currentValue);
  const life = Number(usefulLifeMonths) || 0;
  if (!cleanName || !Number.isFinite(purchase) || purchase <= 0 || !Number.isFinite(current) || current < 0 || !Number.isFinite(life) || life < 0) return null;
  const data = readFinanceWorkspace();
  const asset = {
    id: 'asset_' + randomUUID().slice(0, 12), name: cleanName,
    category: String(category || 'other').trim().slice(0, 60), location: String(location || '').trim().slice(0, 100),
    purchaseDate: /^\d{4}-\d{2}-\d{2}$/.test(String(purchaseDate || '')) ? String(purchaseDate) : getBangladeshDate(),
    purchaseValue: purchase, currentValue: current, usefulLifeMonths: Math.floor(life),
    status: 'active', note: String(note || '').trim().slice(0, 500),
    createdAt: new Date().toISOString(), by: String(by || 'owner'),
  };
  data.assets.unshift(asset);
  writeFinanceWorkspace(data);
  return asset;
}

export function updateFinanceAsset(id, patch = {}) {
  const data = readFinanceWorkspace();
  const asset = data.assets.find((item) => item.id === id);
  if (!asset) return null;
  if (typeof patch.status === 'string' && ['active', 'sold', 'disposed'].includes(patch.status)) asset.status = patch.status;
  if (patch.currentValue != null && Number.isFinite(Number(patch.currentValue)) && Number(patch.currentValue) >= 0) asset.currentValue = Number(patch.currentValue);
  if (typeof patch.note === 'string') asset.note = patch.note.trim().slice(0, 500);
  asset.updatedAt = new Date().toISOString();
  writeFinanceWorkspace(data);
  return asset;
}

// ==========================================
// WhatsApp Live Inbox Messages Store
// ==========================================
const WA_MESSAGES_FILE = join(EXTERNAL_DIR, 'wa_messages.json');
const LEGACY_WA_MESSAGES_FILE = join(PERSISTENT_DIR, 'wa_messages.json');
const WA_MESSAGE_HISTORY_LIMIT = 20000;

// Keep Inbox history beside WhatsApp contacts in the release-independent store.
// Older builds wrote these messages into the app release folder, so preserve and
// merge that history the first time the persistent file is created.
try {
  if (existsSync(LEGACY_WA_MESSAGES_FILE)) {
    const legacy = JSON.parse(readFileSync(LEGACY_WA_MESSAGES_FILE, 'utf8'));
    if (Array.isArray(legacy)) {
      let persistent = [];
      if (existsSync(WA_MESSAGES_FILE)) {
        const parsed = JSON.parse(readFileSync(WA_MESSAGES_FILE, 'utf8'));
        if (Array.isArray(parsed)) persistent = parsed;
      }
      const merged = new Map();
      for (const message of [...legacy, ...persistent]) {
        const key = String(message?.waMessageId || message?.id || `${message?.phone || ''}:${message?.timestamp || ''}:${message?.direction || ''}`);
        merged.set(key, message);
      }
      const messages = Array.from(merged.values()).sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0)).slice(-WA_MESSAGE_HISTORY_LIMIT);
      writeFileSync(WA_MESSAGES_FILE, JSON.stringify(messages, null, 2));
      console.log(`[WhatsApp Inbox] Preserved ${messages.length} message(s) in persistent storage.`);
    }
  }
} catch (error) {
  console.error('[WhatsApp Inbox] Could not migrate message history:', error?.message || error);
}

function normWaDigits(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  if (!d) return '';
  return d.length >= 10 ? d.slice(-10) : d;
}

function normWaJid(value) {
  return String(value || '').trim().replace(/:\d+(?=@)/, '').toLowerCase();
}

export function getWaMessages(phone = null, remoteJid = '') {
  let list = [];
  try {
    if (existsSync(WA_MESSAGES_FILE)) {
      const parsed = JSON.parse(readFileSync(WA_MESSAGES_FILE, 'utf8'));
      if (Array.isArray(parsed)) list = parsed;
    }
  } catch (_) {}
  if (phone || remoteJid) {
    const key = normWaDigits(phone);
    const jid = normWaJid(remoteJid);
    return list.filter((m) => (key && normWaDigits(m.phone) === key) || (jid && normWaJid(m.remoteJid) === jid));
  }
  return list;
}

export function appendWaMessage({ phone, remoteJid = '', direction = 'in', text = '', mediaType = 'text', mediaUrl = '', fileName = '', mimeType = '', senderName = '', byStaff = '', timestamp = null, waMessageId = '', deliveryStatus = '' }) {
  const cleanPhone = String(phone || remoteJid.split('@')[0] || '').replace(/\D/g, '');
  if (!cleanPhone) return null;
  const list = getWaMessages();
  const cleanWaMessageId = String(waMessageId || '').trim();
  if (cleanWaMessageId) {
    const existing = list.find((message) => message.waMessageId === cleanWaMessageId);
    if (existing) return existing;
  }
  const entry = {
    id: 'wm_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    phone: cleanPhone,
    remoteJid,
    direction,
    text: String(text || '').slice(0, 1500),
    mediaType,
    mediaUrl: String(mediaUrl || '').slice(0, 500),
    fileName: String(fileName || '').slice(0, 180),
    mimeType: String(mimeType || '').slice(0, 120),
    senderName: String(senderName || '').trim(),
    byStaff: String(byStaff || '').trim(),
    waMessageId: cleanWaMessageId,
    deliveryStatus: deliveryStatus || (direction === 'out' ? 'sent' : 'received'),
    timestamp: timestamp || new Date().toISOString(),
  };
  list.push(entry);
  const trimmed = list.length > WA_MESSAGE_HISTORY_LIMIT ? list.slice(-WA_MESSAGE_HISTORY_LIMIT) : list;
  try {
    if (!existsSync(PERSISTENT_DIR)) mkdirSync(PERSISTENT_DIR, { recursive: true });
    writeFileSync(WA_MESSAGES_FILE, JSON.stringify(trimmed, null, 2));
  } catch (_) {}
  return entry;
}

export function updateWaMessageMedia(waMessageId, media = {}) {
  const id = String(waMessageId || '').trim();
  if (!id || !media?.mediaUrl) return false;
  const list = getWaMessages();
  const message = list.find((item) => item.waMessageId === id);
  if (!message) return false;
  message.mediaUrl = String(media.mediaUrl).slice(0, 500);
  if (media.fileName) message.fileName = String(media.fileName).slice(0, 180);
  if (media.mimeType) message.mimeType = String(media.mimeType).slice(0, 120);
  try {
    if (!existsSync(EXTERNAL_DIR)) mkdirSync(EXTERNAL_DIR, { recursive: true, mode: 0o700 });
    writeFileSync(WA_MESSAGES_FILE, JSON.stringify(list.slice(-WA_MESSAGE_HISTORY_LIMIT), null, 2));
  } catch (error) {
    console.error('[WhatsApp Inbox] Could not attach recovered media:', error?.message || error);
    return false;
  }
  return true;
}

// Keep WhatsApp media in its own bounded cache so chats cannot consume
// unbounded VPS storage. Order, payment, and customer records are untouched.
export function pruneWhatsAppInboxMedia({ maxBytes = 512 * 1024 * 1024, maxAgeDays = 180 } = {}) {
  const mediaDir = join(EXTERNAL_DIR, 'uploads', 'wa-inbox');
  if (!existsSync(mediaDir)) return { removed: 0, bytes: 0 };
  const allowedFile = /^[a-f0-9-]{36}\.(?:jpg|png|webp|gif|mp4|3gp|mov|mp3|ogg|webm|wav|amr|pdf|txt|docx|xlsx|apk)$/i;
  const staleBefore = Date.now() - Math.max(1, Number(maxAgeDays) || 180) * 24 * 60 * 60 * 1000;
  const files = [];
  for (const entry of readdirSync(mediaDir, { withFileTypes: true })) {
    if (!entry.isFile() || !allowedFile.test(entry.name)) continue;
    try {
      const path = join(mediaDir, entry.name);
      const info = statSync(path);
      files.push({ name: entry.name, path, size: info.size, mtime: info.mtimeMs });
    } catch (_) {}
  }
  files.sort((a, b) => a.mtime - b.mtime);
  let totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  const removedNames = new Set();
  for (const file of files) {
    if (file.mtime < staleBefore || totalBytes > maxBytes) {
      try { unlinkSync(file.path); totalBytes -= file.size; removedNames.add(file.name); } catch (_) {}
    }
  }
  if (removedNames.size) {
    const list = getWaMessages();
    let changed = false;
    for (const message of list) {
      if (removedNames.has(String(message.mediaUrl || '').split('/').pop())) {
        message.mediaUrl = '';
        message.mediaExpired = true;
        changed = true;
      }
    }
    if (changed) {
      try { writeFileSync(WA_MESSAGES_FILE, JSON.stringify(list.slice(-WA_MESSAGE_HISTORY_LIMIT), null, 2)); }
      catch (error) { console.error('[WhatsApp Inbox] Could not mark expired media:', error?.message || error); }
    }
    console.log(`[WhatsApp Inbox] Storage cleanup removed ${removedNames.size} media file(s); cache is ${(totalBytes / 1024 / 1024).toFixed(1)} MB (max 512 MB, 180-day retention).`);
  }
  return { removed: removedNames.size, bytes: totalBytes };
}

export function appendWaMessages(messages = []) {
  if (!Array.isArray(messages) || messages.length === 0) return { added: 0, total: getWaMessages().length };
  const list = getWaMessages();
  const existingIds = new Set(list.map((message) => String(message?.waMessageId || '')).filter(Boolean));
  let added = 0;
  let updated = false;
  for (const message of messages) {
    const remoteJid = String(message?.remoteJid || '');
    const cleanPhone = String(message?.phone || remoteJid.split('@')[0] || '').replace(/\D/g, '');
    if (!cleanPhone) continue;
    const waMessageId = String(message?.waMessageId || '').trim();
    if (waMessageId && existingIds.has(waMessageId)) {
      const existing = list.find((item) => item.waMessageId === waMessageId);
      if (existing && message?.mediaUrl && !existing.mediaUrl) {
        existing.mediaUrl = String(message.mediaUrl).slice(0, 500);
        existing.fileName = String(message.fileName || existing.fileName || '').slice(0, 180);
        existing.mimeType = String(message.mimeType || existing.mimeType || '').slice(0, 120);
        updated = true;
      }
      continue;
    }
    if (waMessageId) existingIds.add(waMessageId);
    list.push({
      id: 'wm_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      phone: cleanPhone,
      remoteJid,
      direction: message?.direction === 'out' ? 'out' : 'in',
      text: String(message?.text || '').slice(0, 1500),
      mediaType: String(message?.mediaType || 'text'),
      mediaUrl: String(message?.mediaUrl || '').slice(0, 500),
      fileName: String(message?.fileName || '').slice(0, 180),
      mimeType: String(message?.mimeType || '').slice(0, 120),
      senderName: String(message?.senderName || '').trim(),
      byStaff: String(message?.byStaff || '').trim(),
      waMessageId,
      deliveryStatus: message?.deliveryStatus || (message?.direction === 'out' ? 'sent' : 'received'),
      timestamp: message?.timestamp || new Date().toISOString(),
    });
    added += 1;
  }
  if (added > 0 || updated) {
    list.sort((a, b) => new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime());
    const trimmed = list.length > WA_MESSAGE_HISTORY_LIMIT ? list.slice(-WA_MESSAGE_HISTORY_LIMIT) : list;
    try {
      if (!existsSync(EXTERNAL_DIR)) mkdirSync(EXTERNAL_DIR, { recursive: true, mode: 0o700 });
      writeFileSync(WA_MESSAGES_FILE, JSON.stringify(trimmed, null, 2));
    } catch (error) {
      console.error('[WhatsApp Inbox] Could not save history batch:', error?.message || error);
      return { added: 0, total: list.length - added };
    }
  }
  return { added, total: Math.min(list.length, WA_MESSAGE_HISTORY_LIMIT) };
}

export function updateWaMessageDeliveryStatus(waMessageId, deliveryStatus) {
  const id = String(waMessageId || '').trim();
  const status = String(deliveryStatus || '').trim();
  if (!id || !['sent', 'delivered', 'read', 'failed'].includes(status)) return false;
  const list = getWaMessages();
  const message = list.find((item) => item.waMessageId === id);
  if (!message) return false;
  const rank = { sent: 1, delivered: 2, read: 3, failed: 4 };
  if (message.deliveryStatus !== 'failed' && rank[status] < rank[message.deliveryStatus || 'sent']) return true;
  message.deliveryStatus = status;
  try {
    if (!existsSync(PERSISTENT_DIR)) mkdirSync(PERSISTENT_DIR, { recursive: true });
    writeFileSync(WA_MESSAGES_FILE, JSON.stringify(list.slice(-WA_MESSAGE_HISTORY_LIMIT), null, 2));
  } catch (_) {}
  return true;
}

export function getWaInboxThreads() {
  const msgs = getWaMessages();
  const contacts = getWaChatContacts();
  const map = new Map();

  for (const c of contacts) {
    const key = normWaDigits(c.phone);
    if (!key) continue;
    map.set(key, {
      phone: c.phone,
      remoteJid: c.remoteJid || '',
      name: c.name || c.phone,
      lastMessage: c.lastMessage || '',
      lastAt: c.lastMessageAt || c.updatedAt || '',
      unread: 0,
      direction: 'in',
    });
  }

  for (const m of msgs) {
    const key = normWaDigits(m.phone);
    if (!key) continue;
    const prev = map.get(key) || { phone: m.phone, name: m.senderName || m.phone, unread: 0 };
    map.set(key, {
      ...prev,
      phone: m.phone || prev.phone,
      remoteJid: m.remoteJid || prev.remoteJid || '',
      name: (m.direction === 'in' && m.senderName) ? m.senderName : prev.name,
      lastMessage: m.text || `[${m.mediaType}]`,
      lastAt: m.timestamp,
      direction: m.direction,
    });
  }

  return Array.from(map.values())
    .sort((a, b) => new Date(b.lastAt || 0).getTime() - new Date(a.lastAt || 0).getTime());
}

export function normalizeWhatsAppInboxLidAliases() {
  const contacts = getWaChatContacts();
  const authDir = join(EXTERNAL_DIR, 'wa_auth_info');
  const phoneByJid = new Map();
  for (const contact of contacts) {
    const jid = String(contact.remoteJid || '').trim().replace(/:\d+(?=@)/, '').toLowerCase();
    if (!jid.endsWith('@lid')) continue;
    const lid = jid.split('@')[0];
    try {
      const value = JSON.parse(readFileSync(join(authDir, `lid-mapping-${lid}_reverse.json`), 'utf8'));
      let digits = String(value || '').includes('@') ? String(value).split('@')[0].replace(/\D/g, '') : String(value || '').replace(/\D/g, '');
      if (digits.startsWith('880') && digits.length === 13) digits = '0' + digits.slice(3);
      else if (digits.startsWith('88') && digits.length === 13) digits = '0' + digits.slice(2);
      else if (!digits.startsWith('0') && digits.length === 10) digits = '0' + digits;
      if (digits.length >= 10) phoneByJid.set(jid, digits);
    } catch (_) {}
  }
  if (!phoneByJid.size) return { contacts: 0, messages: 0 };

  let mergedCount = 0;
  const groupedContacts = new Map();
  for (const contact of contacts) {
    const jid = String(contact.remoteJid || '').trim().replace(/:\d+(?=@)/, '').toLowerCase();
    const phone = phoneByJid.get(jid) || contact.phone;
    const digits = String(phone || '').replace(/\D/g, '');
    const key = normWaDigits(digits);
    if (!key) {
      groupedContacts.set(`unmapped:${jid}:${groupedContacts.size}`, contact);
      continue;
    }
    const previous = groupedContacts.get(key);
    if (!previous) {
      groupedContacts.set(key, { ...contact, phone, rawDigits: digits });
      continue;
    }
    mergedCount += 1;
    const contactIsNewer = new Date(contact.lastChatAt || 0).getTime() >= new Date(previous.lastChatAt || 0).getTime();
    const newer = contactIsNewer ? contact : previous;
    const older = contactIsNewer ? previous : contact;
    groupedContacts.set(key, {
      ...older,
      ...newer,
      phone,
      rawDigits: digits,
      firstChatAt: [previous.firstChatAt, contact.firstChatAt].filter(Boolean).sort()[0] || newer.firstChatAt,
      messageCount: Number(previous.messageCount || 0) + Number(contact.messageCount || 0),
      name: (newer.name && newer.name !== 'WhatsApp User') ? newer.name : older.name,
    });
  }
  if (mergedCount) saveWaChatContacts(Array.from(groupedContacts.values()));

  const messages = getWaMessages();
  let updatedMessages = 0;
  for (const message of messages) {
    const jid = String(message.remoteJid || '').trim().replace(/:\d+(?=@)/, '').toLowerCase();
    const phone = phoneByJid.get(jid);
    if (phone && message.phone !== phone) {
      message.phone = phone;
      updatedMessages += 1;
    }
  }
  if (updatedMessages) {
    try { writeFileSync(WA_MESSAGES_FILE, JSON.stringify(messages.slice(-WA_MESSAGE_HISTORY_LIMIT), null, 2)); }
    catch (error) { console.error('[WhatsApp Inbox] Could not normalize LID messages:', error?.message || error); }
  }
  return { contacts: mergedCount, messages: updatedMessages };
}

// ==========================================
// Anti-Ban Auto-Recovery & Refill Cycle Logs
// ==========================================
const WA_AUTO_LOGS_FILE = join(PERSISTENT_DIR, 'wa_auto_logs.json');

export function getWaAutoLogs() {
  try {
    if (existsSync(WA_AUTO_LOGS_FILE)) {
      const parsed = JSON.parse(readFileSync(WA_AUTO_LOGS_FILE, 'utf8'));
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch (_) {}
  return [];
}

export function recordWaAutoLog({ type, phone, orderId = '', productId = '', note = '' }) {
  const list = getWaAutoLogs();
  const entry = {
    id: 'wal_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    type,
    phone: String(phone || '').replace(/\D/g, ''),
    orderId,
    productId,
    note,
    date: getBangladeshDate(),
    sentAt: new Date().toISOString(),
  };
  list.unshift(entry);
  try {
    if (!existsSync(PERSISTENT_DIR)) mkdirSync(PERSISTENT_DIR, { recursive: true });
    writeFileSync(WA_AUTO_LOGS_FILE, JSON.stringify(list.slice(0, 3000), null, 2));
  } catch (_) {}
  return entry;
}

export function canSendAutoWa({ type, phone, orderId = '', dailyMax = 15, cooldownDays = 7 }) {
  const logs = getWaAutoLogs();
  const today = getBangladeshDate();
  const todayCount = logs.filter((l) => l.type === type && l.date === today).length;
  if (todayCount >= dailyMax) return { ok: false, reason: 'daily_cap_reached' };

  const key = normWaDigits(phone);
  if (orderId && logs.some((l) => l.type === type && l.orderId === orderId)) {
    return { ok: false, reason: 'already_sent_for_order' };
  }
  const cutoff = Date.now() - cooldownDays * 24 * 60 * 60 * 1000;
  if (logs.some((l) => normWaDigits(l.phone) === key && new Date(l.sentAt).getTime() > cutoff)) {
    return { ok: false, reason: 'phone_cooldown' };
  }
  return { ok: true };
}

// ---- Business Email & Webmail Store ----
const EMAILS_FILE = join(PERSISTENT_DIR, 'emails.json');

export function getEmails(folder = 'all', search = '') {
  let list = [];
  try {
    if (existsSync(EMAILS_FILE)) {
      const parsed = JSON.parse(readFileSync(EMAILS_FILE, 'utf8'));
      if (Array.isArray(parsed)) list = parsed;
    }
  } catch (_) {}

  let filtered = list;
  if (folder === 'starred') {
    filtered = filtered.filter((m) => m.isStarred && m.folder !== 'trash');
  } else if (folder !== 'all') {
    filtered = filtered.filter((m) => m.folder === folder);
  }

  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter((m) =>
      (m.subject || '').toLowerCase().includes(q) ||
      (m.from || '').toLowerCase().includes(q) ||
      (m.fromEmail || '').toLowerCase().includes(q) ||
      (m.to || '').toLowerCase().includes(q) ||
      (m.snippet || '').toLowerCase().includes(q) ||
      (m.bodyText || '').toLowerCase().includes(q)
    );
  }

  filtered.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  return filtered;
}

export function getEmailById(id) {
  const list = getEmails('all');
  const found = list.find((m) => m.id === id);
  if (found && !found.isRead) {
    found.isRead = true;
    try {
      writeFileSync(EMAILS_FILE, JSON.stringify(list, null, 2));
    } catch (_) {}
  }
  return found || null;
}

export function saveEmailEntry(emailData) {
  const list = getEmails('all');
  const id = emailData.id || ('em_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
  const snippet = emailData.snippet || (emailData.bodyText ? emailData.bodyText.slice(0, 120).replace(/\s+/g, ' ') : '');
  const entry = {
    ...emailData,
    id,
    snippet,
    createdAt: emailData.createdAt || new Date().toISOString(),
    isRead: emailData.isRead ?? (emailData.folder === 'sent' ? true : false),
    isStarred: emailData.isStarred || false,
    folder: emailData.folder || 'inbox',
  };
  list.unshift(entry);
  try {
    if (!existsSync(PERSISTENT_DIR)) mkdirSync(PERSISTENT_DIR, { recursive: true });
    writeFileSync(EMAILS_FILE, JSON.stringify(list.slice(0, 5000), null, 2));
  } catch (_) {}
  return entry;
}

export function updateEmailEntry(id, patch = {}) {
  const list = getEmails('all');
  const idx = list.findIndex((m) => m.id === id);
  if (idx === -1) return null;
  list[idx] = { ...list[idx], ...patch, updatedAt: new Date().toISOString() };
  try {
    writeFileSync(EMAILS_FILE, JSON.stringify(list, null, 2));
  } catch (_) {}
  return list[idx];
}

export function deleteEmailEntry(id, permanent = false) {
  let list = getEmails('all');
  const idx = list.findIndex((m) => m.id === id);
  if (idx === -1) return false;
  if (!permanent && list[idx].folder !== 'trash') {
    list[idx].folder = 'trash';
  } else {
    list.splice(idx, 1);
  }
  try {
    writeFileSync(EMAILS_FILE, JSON.stringify(list, null, 2));
  } catch (_) {}
  return true;
}

export function clearDemoEmails() {
  let list = [];
  try {
    if (existsSync(EMAILS_FILE)) {
      const parsed = JSON.parse(readFileSync(EMAILS_FILE, 'utf8'));
      if (Array.isArray(parsed)) list = parsed;
    }
  } catch (_) {}
  const remaining = list.filter((m) => {
    if (m.id === 'em_welcome_secrate') return false;
    if ((m.from || '').toLowerCase().includes('sumon.khan') || (m.fromEmail || '').toLowerCase().includes('sumon.khan')) return false;
    return true;
  });
  try {
    if (!existsSync(PERSISTENT_DIR)) mkdirSync(PERSISTENT_DIR, { recursive: true });
    writeFileSync(EMAILS_FILE, JSON.stringify(remaining, null, 2));
  } catch (_) {}
  return remaining;
}

export function emptyTrashEmails() {
  let list = getEmails('all');
  const remaining = list.filter((m) => m.folder !== 'trash');
  const deletedCount = list.length - remaining.length;
  try {
    if (!existsSync(PERSISTENT_DIR)) mkdirSync(PERSISTENT_DIR, { recursive: true });
    writeFileSync(EMAILS_FILE, JSON.stringify(remaining, null, 2));
  } catch (_) {}
  return deletedCount;
}

export function purgeAllEmails() {
  try {
    if (!existsSync(PERSISTENT_DIR)) mkdirSync(PERSISTENT_DIR, { recursive: true });
    writeFileSync(EMAILS_FILE, JSON.stringify([], null, 2));
  } catch (_) {}
  return [];
}

export function getEmailStats() {
  const list = getEmails('all');
  return {
    inbox: list.filter((m) => m.folder === 'inbox').length,
    unread: list.filter((m) => m.folder === 'inbox' && !m.isRead).length,
    sent: list.filter((m) => m.folder === 'sent').length,
    starred: list.filter((m) => m.isStarred && m.folder !== 'trash').length,
    trash: list.filter((m) => m.folder === 'trash').length,
  };
}

// Custom Mailbox Addresses (Essa moto mail address add/remove)
const MAILBOXES_FILE = join(PERSISTENT_DIR, 'mailboxes.json');

export function getCustomMailAddresses() {
  try {
    if (existsSync(MAILBOXES_FILE)) {
      const parsed = JSON.parse(readFileSync(MAILBOXES_FILE, 'utf8'));
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (_) {}
  return [
    { email: 'support@secrate.shop', label: 'Support Desk', isDefault: true },
    { email: 'owner@secrate.shop', label: 'Owner', isDefault: false }
  ];
}

export function saveCustomMailAddresses(list) {
  try {
    if (!existsSync(PERSISTENT_DIR)) mkdirSync(PERSISTENT_DIR, { recursive: true });
    writeFileSync(MAILBOXES_FILE, JSON.stringify(list, null, 2));
  } catch (_) {}
  return list;
}

export function addCustomMailAddress(email, label = '') {
  const list = getCustomMailAddresses();
  const clean = String(email || '').trim().toLowerCase();
  if (!clean || !clean.includes('@')) return { ok: false, error: 'Invalid email address' };
  if (list.some((item) => item.email.toLowerCase() === clean)) {
    return { ok: false, error: 'Address already exists' };
  }
  const entry = {
    email: clean,
    label: label.trim() || clean.split('@')[0],
    isDefault: list.length === 0,
    addedAt: new Date().toISOString(),
  };
  list.push(entry);
  saveCustomMailAddresses(list);
  return { ok: true, address: entry, list };
}

export function removeCustomMailAddress(email) {
  let list = getCustomMailAddresses();
  const clean = String(email || '').trim().toLowerCase();
  list = list.filter((item) => item.email.toLowerCase() !== clean);
  saveCustomMailAddresses(list);
  return { ok: true, list };
}

export function clearAllCustomMailAddresses() {
  saveCustomMailAddresses([]);
  return { ok: true, list: [] };
}
