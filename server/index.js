process.env.TZ = 'Asia/Dhaka';
import express from 'express';
import cors from 'cors';
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, lstatSync, unlinkSync, renameSync, rmSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomUUID, randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import nodemailer from 'nodemailer';
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
try { dns.setDefaultResultOrder('ipv4first'); } catch {}
import { getCatalog, getOrders, addOrder, updateOrder, deleteOrder, addProduct, updateProduct, deleteProduct, getSettings, saveSettings, saveCatalog, addCategory, updateCategory, deleteCategory, getCoupons, saveCoupons, getReviews, saveReviews, getUsers, saveUsers, getIntegrations, saveIntegrations, getLandings, saveLandings, getLandingBySlug, addLanding, updateLanding, deleteLanding, getColors, saveColors, addColor, deleteColor, getCustomers, saveCustomers, getCustomerByPhone, getCustomerByEmail, saveCustomer, syncCustomersFromOrders, initStorageProtection, getPersistentDataDirectory, getAuditLogs, addAuditLog, getStaffActivity, updateStaffPresence, recordStaffKpiAction, getStaffMonitoringData, getBangladeshDate, getWaChatContacts, upsertWaChatContact, syncWhatsAppSessionContacts } from './store.js';
import { getWhatsAppSettings, saveWhatsAppSettings, sendWhatsAppNotification, formatWhatsAppMessage, isNightConfirmationTime } from './whatsapp_engine.js';
import { startWhatsAppSocket, getWhatsAppLiveStatus, requestPairingCode, sendBaileysMessage, waitForQrCode, clearWhatsAppSession } from './whatsapp_baileys.js';
import { getVapidPublicKey, getPushPopupSettings, savePushPopupSettings, upsertPushSubscriber, linkSubscriberPhone, removePushSubscriber, getPushSubscriberStats, sendBroadcastPush, sendOrderPushNotifications } from './push_engine.js';

const __dir = dirname(fileURLToPath(import.meta.url));
initStorageProtection();

const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => /\.apk$/i.test(req.path) ? res.sendStatus(404) : next());

// Security Headers Middleware
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

app.use(cors());
app.use((req, res, next) => {
  if (req.method === 'POST' && req.path === '/api/admin/backup/restore') return next();
  return express.json({ limit: '10mb' })(req, res, next);
});
app.use((err, req, res, next) => {
  if (err) {
    if (req.path.includes('webhook')) {
      req.body = {};
      return next();
    }
    return res.status(400).json({ error: 'Invalid request payload' });
  }
  next();
});

const UPLOADS = join(getPersistentDataDirectory(), 'uploads');
const LEGACY_UPLOAD_DIRS = [join(__dir, 'uploads'), join(__dir, 'data', 'persistent_uploads'), join(__dir, '..', 'uploads')];
const PRIVATE_APK_DIR = join(getPersistentDataDirectory(), 'private_apk');
const LEGACY_PRIVATE_APK_DIR = join(__dir, 'data', 'private_apk');
mkdirSync(UPLOADS, { recursive: true });
mkdirSync(PRIVATE_APK_DIR, { recursive: true });

// Move legacy app-local uploads into external storage without overwriting newer files.
for (const legacyDir of LEGACY_UPLOAD_DIRS) {
  try {
    for (const name of readdirSync(legacyDir)) {
      const source = join(legacyDir, name);
      const target = join(UPLOADS, name);
      if (!existsSync(target) && statSync(source).isFile()) copyFileSync(source, target);
    }
  } catch {}
}
try {
  for (const name of readdirSync(LEGACY_PRIVATE_APK_DIR)) {
    const source = join(LEGACY_PRIVATE_APK_DIR, name);
    const target = join(PRIVATE_APK_DIR, name);
    if (!existsSync(target) && statSync(source).isFile()) copyFileSync(source, target);
  }
} catch {}

const UPLOAD_DIRS = { app: LEGACY_UPLOAD_DIRS[0], persistent: UPLOADS, root: LEGACY_UPLOAD_DIRS[2] };
function removeUploadedFile(name) {
  let removed = false;
  for (const dir of [UPLOADS, ...LEGACY_UPLOAD_DIRS]) {
    try { unlinkSync(join(dir, name)); removed = true; } catch {}
  }
  return removed;
}
function collectBackupMedia() {
  const media = [];
  for (const [location, dir] of Object.entries(UPLOAD_DIRS)) {
    for (const name of readdirSync(dir)) {
      if (!name || name.startsWith('.')) continue;
      const path = join(dir, name);
      try {
        if (!statSync(path).isFile()) continue;
        media.push({ location, name, data: readFileSync(path).toString('base64') });
      } catch {}
    }
  }
  return media;
}

const FRONTEND_ROOT = join(__dir, '..', 'web');
const FRONTEND_ROOT_FILES = new Set(['index.html', 'package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts']);
function isAllowedFrontendPath(relativePath) {
  if (typeof relativePath !== 'string' || !relativePath || relativePath.includes('\\') || relativePath.startsWith('/')) return false;
  const parts = relativePath.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..' || part.startsWith('.'))) return false;
  return FRONTEND_ROOT_FILES.has(relativePath) || ['src/', 'public/', 'dist/'].some((prefix) => relativePath.startsWith(prefix));
}
function collectFrontendFiles() {
  const files = [];
  const addFile = (relativePath, absolutePath) => {
    const info = lstatSync(absolutePath);
    if (!info.isFile() || info.isSymbolicLink()) return;
    files.push({ path: relativePath, data: readFileSync(absolutePath).toString('base64') });
  };
  for (const name of FRONTEND_ROOT_FILES) {
    const path = join(FRONTEND_ROOT, name);
    if (existsSync(path)) addFile(name, path);
  }
  const walk = (directory, prefix) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const relativePath = `${prefix}/${entry.name}`;
      if (!isAllowedFrontendPath(relativePath)) continue;
      const absolutePath = join(directory, entry.name);
      if (entry.isDirectory() && !entry.isSymbolicLink()) walk(absolutePath, relativePath);
      else if (entry.isFile()) addFile(relativePath, absolutePath);
    }
  };
  for (const directory of ['src', 'public', 'dist']) {
    const path = join(FRONTEND_ROOT, directory);
    if (existsSync(path) && lstatSync(path).isDirectory()) walk(path, directory);
  }
  return files;
}
function getSafeFrontendTarget(relativePath) {
  if (!isAllowedFrontendPath(relativePath)) throw new Error('Frontend backup contains a path outside the allowed frontend files.');
  const parts = relativePath.split('/');
  let parent = FRONTEND_ROOT;
  for (const part of parts.slice(0, -1)) {
    const next = join(parent, part);
    if (existsSync(next)) {
      const info = lstatSync(next);
      if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Frontend restore cannot write through a symbolic link.');
    } else mkdirSync(next);
    parent = next;
  }
  const target = join(parent, parts.at(-1));
  if (existsSync(target) && lstatSync(target).isSymbolicLink()) throw new Error('Frontend restore cannot replace a symbolic link.');
  return target;
}

function createStoreBackup(includeFrontend = false) {
  const backup = {
    format: 'metrroma-store-backup', version: '3.1', exportedAt: new Date().toISOString(),
    store: getSettings().storeName || 'Store', orders: getOrders(), customers: getCustomers(),
    catalog: getCatalog(), settings: getSettings(), integrations: getIntegrations(),
    landings: getLandings(), coupons: getCoupons(), reviews: getReviews(), colors: getColors(),
    users: getUsers(), media: collectBackupMedia(),
    ...(includeFrontend ? { frontendFiles: collectFrontendFiles() } : {}),
  };
  const digest = createHash('sha256').update(JSON.stringify(backup)).digest('hex');
  backup.manifest = {
    algorithm: 'SHA-256', digest,
    counts: {
      orders: backup.orders.length,
      customers: backup.customers.length,
      products: (backup.catalog.products || []).length,
      categories: (backup.catalog.categories || []).length,
      staff: backup.users.length,
      media: backup.media.length,
      frontendFiles: backup.frontendFiles?.length || 0,
    },
  };
  return backup;
}

const staticUploadOptions = {
  maxAge: '30d',
  setHeaders: (res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
  }
};
app.use('/uploads', express.static(UPLOADS, staticUploadOptions));
for (const legacyDir of LEGACY_UPLOAD_DIRS) app.use('/uploads', express.static(legacyDir, staticUploadOptions));

const withFlags = (p) => ({ ...p, soldOut: !!p.soldOut || (p.stock != null && p.stock <= 0) });

const BD_PHONE = /^01[3-9]\d{8}$/;

function isFakeBDPhone(phone) {
  const p = cleanBDPhone(phone);
  if (!/^01[3-9]\d{8}$/.test(p)) return true;
  const rest = p.slice(3);
  if (/(.)\1{5,}/.test(rest)) return true;
  const fakes = [
    '01712345678', '01812345678', '01912345678', '01612345678', '01512345678', '01312345678', '01412345678',
    '01700000000', '01800000000', '01900000000', '01600000000', '01500000000', '01300000000', '01400000000',
    '01711111111', '01811111111', '01911111111', '01611111111', '01722222222', '01822222222', '01922222222'
  ];
  if (fakes.includes(p)) return true;
  return false;
}

// ---- incomplete / abandoned checkout capture (order appears after a valid checkout is started but not placed) ----
const draftTimers = new Map(); // phone -> { timer, data }
function cancelDraft(phone) {
  if (!phone) return;
  const clean = String(phone).replace(/\D/g, '').slice(-11);
  const d = draftTimers.get(clean) || draftTimers.get(phone);
  if (d) {
    clearTimeout(d.timer);
    draftTimers.delete(clean);
    draftTimers.delete(phone);
  }
}
function buildDraftOrder(data) {
  const catalog = getCatalog().products || [];
  const c = data.customer || {};
  let landingPage = null;
  if (c.landing) {
    const L = getLandingBySlug(String(c.landing));
    if (L && L.status === 'live') landingPage = L;
  }
  const lines = [];
  for (const it of (data.items || [])) {
    // 1. Variant offer match from landing page
    if (landingPage && Array.isArray(landingPage.variants) && landingPage.variants.length > 0) {
      const variant = landingPage.variants.find((v) =>
        v.id === it.variantId ||
        v.id === it.id ||
        (it.variantTitle && v.title === it.variantTitle) ||
        (it.name && it.name.includes(v.title))
      );
      if (variant) {
        const p = catalog.find((x) => x.id === it.id) || catalog.find((x) => (landingPage.productIds || []).includes(x.id));
        const qty = Math.max(1, Math.min(20, parseInt(it.qty, 10) || 1));
        const baseName = (p && p.name) || landingPage.title || 'Package';
        const name = `${baseName} — ${variant.title}${variant.size ? ' (' + variant.size + ')' : ''}`;
        const image = it.image || variant.image || (p && p.image) || landingPage.heroImage || '';
        lines.push({
          id: (p && p.id) || variant.id,
          variantId: variant.id,
          variantTitle: variant.title,
          name,
          price: variant.price,
          qty,
          subtotal: variant.price * qty,
          image,
          color: it.color || '',
          size: it.size || '',
        });
        continue;
      }
    }

    // 2. Landing package match (e.g. LoveLock / Love Forever package)
    if (landingPage && Array.isArray(landingPage.packages) && landingPage.packages.length > 0) {
      const pkg = landingPage.packages.find((p) => p.id === it.id || p.id === it.productId || (it.name && it.name.includes(p.title)));
      if (pkg) {
        const qty = Math.max(1, Math.min(20, parseInt(it.qty, 10) || 1));
        const name = it.name || pkg.title || landingPage.title;
        const image = it.image || pkg.image || landingPage.heroImage || '';
        lines.push({
          id: pkg.id,
          name,
          price: pkg.price,
          qty,
          subtotal: pkg.price * qty,
          image,
          color: it.color || '',
          variantTitle: it.variantTitle || (it.color ? `Color: ${it.color}` : ''),
        });
        continue;
      }
    }

    // 3. Catalog product match (by ID, composite ID prefix, or slug)
    const baseId = it.productId || (it.id ? String(it.id).split('-')[0] + (String(it.id).startsWith('mm-') ? '-' + String(it.id).split('-')[1] : '') : '');
    const p = catalog.find((x) => x.id === it.id) || catalog.find((x) => x.id === baseId) || catalog.find((x) => x.slug === it.id);

    const qty = Math.max(1, Math.min(20, parseInt(it.qty, 10) || 1));
    const itemPrice = Number(it.price) || (p ? p.price : 0);
    const itemImage = it.image || (p ? (p.images?.[0] || p.image) : '') || (landingPage ? landingPage.heroImage : '');
    const itemName = it.name || (p ? p.name : 'Product');
    const colorStr = it.color || '';
    const sizeStr = it.size || '';
    const variantTitle = it.variantTitle || [colorStr, sizeStr].filter(Boolean).join(' · ');

    lines.push({
      id: (p && p.id) || it.id || 'item',
      name: itemName,
      price: itemPrice,
      qty,
      subtotal: itemPrice * qty,
      image: itemImage,
      color: colorStr,
      size: sizeStr,
      variantTitle,
    });
  }

  // 4. Fallback if lines is empty but landing page exists
  if (lines.length === 0 && landingPage) {
    const pkg = (Array.isArray(landingPage.packages) && landingPage.packages[0]) || (Array.isArray(landingPage.variants) && landingPage.variants[0]);
    if (pkg) {
      lines.push({
        id: pkg.id || 'lp-item',
        name: pkg.title || landingPage.productTitle || landingPage.title,
        price: Number(pkg.price) || Number(landingPage.offerPrice) || 0,
        qty: 1,
        subtotal: Number(pkg.price) || Number(landingPage.offerPrice) || 0,
        image: pkg.image || landingPage.heroImage || '',
      });
    }
  }

  const itemsTotal = lines.reduce((s, l) => s + l.subtotal, 0);
  const settings = getSettings();
  const area = c.area === 'outside' ? 'outside' : 'inside';
  let delInside = settings.deliveryInside;
  let delOutside = settings.deliveryOutside;
  let isFreeDelivery = itemsTotal >= settings.freeShipThreshold;
  if (landingPage) {
    isFreeDelivery = landingPage.freeDelivery !== false;
    const insideCharge = landingPage.deliveryInside != null && landingPage.deliveryInside !== '' ? landingPage.deliveryInside : landingPage.customDeliveryInside;
    const outsideCharge = landingPage.deliveryOutside != null && landingPage.deliveryOutside !== '' ? landingPage.deliveryOutside : landingPage.customDeliveryOutside;
    if (insideCharge != null && insideCharge !== '') delInside = Number(insideCharge);
    if (outsideCharge != null && outsideCharge !== '') delOutside = Number(outsideCharge);
  }
  if (c.freeDelivery === true || c.shippingCost === 0 || (data.shipping && data.shipping.cost === 0)) {
    isFreeDelivery = true;
  }
  const delivery = isFreeDelivery ? 0 : (area === 'outside' ? delOutside : delInside);
  let discount = 0, couponCode = '';
  if (landingPage) {
    const isVariantLp = Array.isArray(landingPage.variants) && landingPage.variants.length > 0;
    if (!isVariantLp && landingPage.offerPrice > 0 && itemsTotal > landingPage.offerPrice) {
      discount += itemsTotal - landingPage.offerPrice;
    }
  }
  if (c.coupon) { const cp = couponFor(c.coupon, itemsTotal, c.phone); if (cp && !cp.error) { discount += cp.discount; couponCode = cp.code; } }
  discount = Math.min(discount, itemsTotal);
  const total = Math.max(0, itemsTotal + delivery - discount);
  const now = new Date().toISOString();
  const draftId = 'DOT-' + randomUUID().slice(0, 8).toUpperCase();
  return {
    id: draftId,
    createdAt: now,
    status: 'incomplete',
    draftType: 'abandoned_checkout',
    recovered: false,
    payment: 'cash_on_delivery',
    source: String(c.source || (landingPage ? 'l/' + landingPage.slug : 'direct')).slice(0, 60),
    landing: landingPage ? landingPage.slug : '',
    recoveryUrl: landingPage ? `https://metrroma.com/l/${landingPage.slug}?recover=${draftId}` : `https://metrroma.com/checkout?recover=${draftId}`,
    deviceId: data.deviceId || '',
    ip: data.ip || '',
    customer: {
      name: String(c.name || '').trim() || 'Customer',
      phone: String(c.phone || '').trim(),
      address: String(c.address || '').trim(),
      area,
      district: String(c.district || '').trim(),
      thana: String(c.thana || '').trim(),
      note: String(c.note || '').trim()
    },
    items: lines,
    itemsTotal,
    delivery,
    discount,
    coupon: couponCode,
    total,
    history: [{ status: 'incomplete', at: now, note: 'Customer entered details at checkout but did not finish placing order' }],
  };
}

// customer checkout pings this while filling the form; a draft is captured only if nothing is placed within 90 seconds
app.post('/api/checkout/ping', (req, res) => {
  const b = req.body || {};
  const c = b.customer || {};
  const phone = String(c.phone || '').trim().replace(/[-+ ]/g, '');
  if (!BD_PHONE.test(phone)) return res.status(204).end();
  const cleanPhone = phone.replace(/\D/g, '').slice(-11);
  if (isFakeBDPhone(cleanPhone)) return res.status(204).end();

  const rawDid = req.headers['x-device-id'] || b.deviceId || c.deviceId || '';
  const deviceId = String(rawDid).trim();
  const clientIp = getClientIp(req);

  // Fraud protection on incomplete orders: don't create draft for blocked/duplicate users
  const settings = getSettings();
  const fd = settings.fraudDetector || {};
  if (fd.enabled !== false && fd.protectIncompleteOrders !== false) {
    const allOrders = getOrders() || [];
    const nowMs = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const cooldownMs = (Number(fd.cooldownHours) || 24) * 60 * 60 * 1000;

    // Check if customer already placed a real order within the day/cooldown window
    const recentRealOrder = allOrders.find((o) => {
      if (o.status === 'cancelled' || o.status === 'incomplete') return false;
      const t = new Date(o.createdAt).getTime();
      if (isNaN(t) || (nowMs - t) >= Math.max(cooldownMs, dayMs)) return false;
      const isSamePhone = cleanBDPhone(o.customer?.phone) === cleanPhone;
      const isSameDevice = !!(deviceId && o.deviceId && o.deviceId === deviceId);
      const isSameIp = !!(fd.blockByIp !== false && clientIp && clientIp !== 'unknown_ip' && o.ip && o.ip === clientIp);
      return isSamePhone || isSameDevice || isSameIp;
    });

    if (recentRealOrder) {
      return res.status(204).end();
    }
  }

  const name = String(c.name || '').trim() || 'Customer';
  const data = {
    deviceId,
    ip: clientIp,
    userAgent: req.get('user-agent') || '',
    fbp: req.cookies?._fbp || req.body?.fbp || req.headers['x-fbp'] || '',
    fbc: req.cookies?._fbc || req.body?.fbc || req.headers['x-fbc'] || '',
    customer: {
      name,
      phone: cleanPhone,
      address: c.address || '',
      area: c.area || 'outside',
      district: c.district || '',
      thana: c.thana || '',
      note: c.note || '',
      coupon: c.coupon || '',
      source: c.source || (c.landing ? 'l/' + c.landing : 'direct'),
      landing: c.landing || '',
      freeDelivery: c.freeDelivery === true,
      shippingCost: c.shippingCost != null ? Number(c.shippingCost) : (b.shipping?.cost != null ? Number(b.shipping.cost) : null),
    },
    shipping: b.shipping || undefined,
    items: Array.isArray(b.items) ? b.items : [],
  };

  const existing = draftTimers.get(cleanPhone);
  if (existing) {
    existing.data = data;
    return res.json({ ok: true });
  }

  const configuredDelayMinutes = Number(getWhatsAppSettings().triggers?.incomplete?.delayMinutes);
  const incompleteDelayMs = Math.max(1, Math.min(120, Number.isFinite(configuredDelayMinutes) && configuredDelayMinutes ? configuredDelayMinutes : 2)) * 60 * 1000;
  const entry = { data };
  entry.timer = setTimeout(() => {
    draftTimers.delete(cleanPhone);
    try {
      // 1. If customer completed an actual order, do not capture as abandoned
      const realOrder = getOrders().find((o) => o.status !== 'incomplete' && o.customer && String(o.customer.phone).replace(/\D/g, '').slice(-11) === cleanPhone && Date.now() - new Date(o.createdAt).getTime() < incompleteDelayMs + 240000);
      if (realOrder) return;

      const draft = buildDraftOrder(entry.data);

      // 2. If an incomplete order already exists for this phone or device, update it with new items/info
      const existingDraft = getOrders().find((o) => o.status === 'incomplete' && (
        (o.customer && String(o.customer.phone).replace(/\D/g, '').slice(-11) === cleanPhone) ||
        (deviceId && o.deviceId && o.deviceId === deviceId)
      ));
      if (existingDraft) {
        updateOrder(existingDraft.id, {
          customer: draft.customer,
          items: draft.items,
          itemsTotal: draft.itemsTotal,
          delivery: draft.delivery,
          discount: draft.discount,
          total: draft.total,
          source: draft.source,
          landing: draft.landing,
          recoveryUrl: draft.recoveryUrl,
          deviceId: draft.deviceId,
          ip: draft.ip,
        });
      } else {
        addOrder(draft);
        notifyOrder(draft, 'incomplete');
      }
    } catch (err) {
      console.error('[DraftCapture] Error capturing incomplete order:', err.message);
    }
  }, incompleteDelayMs);

  draftTimers.set(cleanPhone, entry);
  res.json({ ok: true });
});

// ---- public catalog ----
app.get('/api/categories', (_req, res) => res.json(getCatalog().categories));

// ---- master color library ----
app.get('/api/colors', (_req, res) => res.json({ colors: getColors() }));
app.post('/api/colors', (req, res) => {
  const { name, hex } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Color name required' });
  const item = addColor({ name: String(name).trim(), hex: String(hex || '#111111').trim() });
  res.json({ success: true, color: item, colors: getColors() });
});
app.delete('/api/colors/:id', (req, res) => {
  const next = deleteColor(req.params.id);
  res.json({ success: true, colors: next });
});

app.get('/api/settings', (_req, res) => {
  const publicSettings = { ...getSettings() };
  delete publicSettings.ownerPassword;
  res.json(publicSettings);
});
app.put('/api/settings', adminAuth, requireRole('owner', 'manager'), (req, res) => {
  const b = req.body || {};
  const num = (v, d) => { const n = parseInt(v, 10); return isNaN(n) ? d : Math.max(0, n); };
  const cur = getSettings();
  const homeContentKeys = ['collectionEyebrow', 'collectionTitle', 'collectionDescription', 'introTitle', 'introDescription', 'featuredEyebrow', 'featuredTitle', 'featuredDescription', 'newsletterEyebrow', 'newsletterTitle', 'newsletterDescription'];
  const homeContent = { en: { ...(cur.homeContent?.en || {}) }, bn: { ...(cur.homeContent?.bn || {}) } };
  for (const lang of ['en', 'bn']) {
    const incoming = b.homeContent?.[lang];
    if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) continue;
    for (const key of homeContentKeys) {
      if (typeof incoming[key] === 'string') homeContent[lang][key] = incoming[key].trim().slice(0, 900);
    }
    if (Array.isArray(incoming.faqs)) {
      homeContent[lang].faqs = incoming.faqs.slice(0, 8).map((faq) => ({
        q: typeof faq?.q === 'string' ? faq.q.trim().slice(0, 240) : '',
        a: typeof faq?.a === 'string' ? faq.a.trim().slice(0, 900) : '',
      }));
    }
  }
  const sectionKeys = ['hero', 'quickCategories', 'collections', 'intro', 'featured', 'benefits', 'faq', 'newsletter'];
  const currentSiteContent = cur.siteContent || {};
  const currentSections = currentSiteContent.sections || {};
  const incomingSections = b.siteContent?.sections && typeof b.siteContent.sections === 'object' && !Array.isArray(b.siteContent.sections) ? b.siteContent.sections : {};
  const sections = { ...currentSections };
  for (const key of sectionKeys) if (typeof incomingSections[key] === 'boolean') sections[key] = incomingSections[key];
  const textOverrides = { ...(currentSiteContent.textOverrides || {}) };
  const incomingOverrides = b.siteContent?.textOverrides && typeof b.siteContent.textOverrides === 'object' && !Array.isArray(b.siteContent.textOverrides) ? b.siteContent.textOverrides : {};
  for (const [key, value] of Object.entries(incomingOverrides).slice(0, 500)) {
    if (!key || key.length > 500 || !value || typeof value !== 'object' || Array.isArray(value)) continue;
    const en = typeof value.en === 'string' ? value.en.trim().slice(0, 1200) : '';
    const bn = typeof value.bn === 'string' ? value.bn.trim().slice(0, 1200) : '';
    if (en || bn) textOverrides[key] = { en, bn };
    else delete textOverrides[key];
  }
  const siteContent = { sections, textOverrides };
  siteContent.infoPages = { ...(currentSiteContent.infoPages || {}) };
  const infoPageKeys = ['shipping', 'returns', 'contact', 'about', 'privacy', 'terms', 'journal'];
  const incomingInfoPages = b.siteContent?.infoPages && typeof b.siteContent.infoPages === 'object' && !Array.isArray(b.siteContent.infoPages) ? b.siteContent.infoPages : {};
  for (const slug of infoPageKeys) {
    const incomingPage = incomingInfoPages[slug];
    if (!incomingPage || typeof incomingPage !== 'object' || Array.isArray(incomingPage)) continue;
    const page = { ...(siteContent.infoPages[slug] || {}) };
    for (const lang of ['en', 'bn']) {
      const incomingLang = incomingPage[lang];
      if (!incomingLang || typeof incomingLang !== 'object' || Array.isArray(incomingLang)) continue;
      const localized = { ...(page[lang] || {}) };
      if (typeof incomingLang.title === 'string') localized.title = incomingLang.title.trim().slice(0, 180);
      if (Array.isArray(incomingLang.body)) localized.body = incomingLang.body.slice(0, 6).map((p) => typeof p === 'string' ? p.trim().slice(0, 1500) : '');
      page[lang] = localized;
    }
    siteContent.infoPages[slug] = page;
  }
  const curFd = cur.fraudDetector || {};
  let fraudDetector = curFd;
  if (b.fraudDetector && typeof b.fraudDetector === 'object') {
    const inFd = b.fraudDetector;
    fraudDetector = {
      enabled: inFd.enabled !== false,
      cooldownHours: Math.max(1, Math.min(720, parseInt(inFd.cooldownHours, 10) || 24)),
      sameProductLimit: Math.max(1, Math.min(50, parseInt(inFd.sameProductLimit, 10) || 1)),
      maxOrdersPerDay: Math.max(1, Math.min(100, parseInt(inFd.maxOrdersPerDay, 10) || 1)),
      maxOrdersPerIp: Math.max(1, Math.min(100, parseInt(inFd.maxOrdersPerIp, 10) || 2)),
      minSecondsBetweenOrders: Math.max(0, Math.min(600, parseInt(inFd.minSecondsBetweenOrders, 10) || 30)),
      blockByPhone: inFd.blockByPhone !== false,
      blockByIp: inFd.blockByIp !== false,
      protectIncompleteOrders: inFd.protectIncompleteOrders !== false,
      applyOnLandingPages: inFd.applyOnLandingPages !== false,
      sameProductNotice: typeof inFd.sameProductNotice === 'string' && inFd.sameProductNotice.trim() ? inFd.sameProductNotice.trim() : (curFd.sameProductNotice || 'You have already placed an order for this item recently. Please wait before ordering again, or contact our support team.'),
      sameProductNoticeBn: typeof inFd.sameProductNoticeBn === 'string' && inFd.sameProductNoticeBn.trim() ? inFd.sameProductNoticeBn.trim() : (curFd.sameProductNoticeBn || 'আপনি ইতিমধ্যে এই পণ্যটির জন্য একটি অর্ডার করেছেন। নতুন অর্ডারের জন্য অপেক্ষা করুন অথবা আমাদের সাথে যোগাযোগ করুন।'),
      maxOrdersNotice: typeof inFd.maxOrdersNotice === 'string' && inFd.maxOrdersNotice.trim() ? inFd.maxOrdersNotice.trim() : (curFd.maxOrdersNotice || 'You have reached the maximum daily order limit from this device. Please contact customer support for urgent orders.'),
      maxOrdersNoticeBn: typeof inFd.maxOrdersNoticeBn === 'string' && inFd.maxOrdersNoticeBn.trim() ? inFd.maxOrdersNoticeBn.trim() : (curFd.maxOrdersNoticeBn || 'আপনার ডিভাইস থেকে আজকের সর্বোচ্চ অর্ডার সীমা পূর্ণ হয়েছে। প্রয়োজনীয় সহায়তায় যোগাযোগ করুন।'),
      ipLimitNotice: typeof inFd.ipLimitNotice === 'string' && inFd.ipLimitNotice.trim() ? inFd.ipLimitNotice.trim() : (curFd.ipLimitNotice || 'Daily order limit reached from this network/IP address. Please contact customer support.'),
      ipLimitNoticeBn: typeof inFd.ipLimitNoticeBn === 'string' && inFd.ipLimitNoticeBn.trim() ? inFd.ipLimitNoticeBn.trim() : (curFd.ipLimitNoticeBn || 'আপনার ইন্টারনেট নেটওয়ার্ক (IP) থেকে আজকের সর্বোচ্চ অর্ডারের সীমা অতিক্রম করেছে। সহায়তার জন্য যোগাযোগ করুন।'),
      rapidOrderNotice: typeof inFd.rapidOrderNotice === 'string' && inFd.rapidOrderNotice.trim() ? inFd.rapidOrderNotice.trim() : (curFd.rapidOrderNotice || 'Please wait a moment before submitting another order.'),
      rapidOrderNoticeBn: typeof inFd.rapidOrderNoticeBn === 'string' && inFd.rapidOrderNoticeBn.trim() ? inFd.rapidOrderNoticeBn.trim() : (curFd.rapidOrderNoticeBn || 'অনুগ্রহ করে নতুন অর্ডার সাবমিট করার পূর্বে কিছুক্ষণ অপেক্ষা করুন।'),
    };
  }
  res.json(saveSettings({
    storeName: typeof b.storeName === 'string' && b.storeName.trim() ? b.storeName.slice(0, 40) : cur.storeName,
    announce: typeof b.announce === 'string' ? b.announce.slice(0, 160) : cur.announce,
    deliveryInside: num(b.deliveryInside, cur.deliveryInside),
    deliveryOutside: num(b.deliveryOutside, cur.deliveryOutside),
    freeShipThreshold: num(b.freeShipThreshold, cur.freeShipThreshold),
    lowStockAt: num(b.lowStockAt, cur.lowStockAt),
    whatsapp: typeof b.whatsapp === 'string' ? b.whatsapp.replace(/[^0-9]/g, '') : cur.whatsapp,
    phone: typeof b.phone === 'string' ? b.phone.trim() : cur.phone,
    gtmId: typeof b.gtmId === 'string' ? b.gtmId.trim().slice(0, 20) : cur.gtmId,
    fbPixelId: typeof b.fbPixelId === 'string' ? b.fbPixelId.trim().slice(0, 30) : cur.fbPixelId,
    logo: typeof b.logo === 'string' ? b.logo.trim() : (cur.logo || ''),
    favicon: typeof b.favicon === 'string' ? b.favicon.trim() : (cur.favicon || ''),
    appearance: (() => {
      const a = b.appearance && typeof b.appearance === 'object' ? b.appearance : cur.appearance || {};
      const fonts = ['Inter', 'Anek Bangla', 'Hind Siliguri', 'Playfair Display', 'Cormorant Garamond'];
      const fit = ['contain', 'cover'];
      const accent = /^#[0-9a-f]{6}$/i.test(a.accent || '') ? a.accent : (cur.appearance?.accent || '#b48e4c');
      return {
        font: fonts.includes(a.font) ? a.font : (cur.appearance?.font || 'Inter'),
        accent,
        desktopColumns: [2, 3, 4].includes(Number(a.desktopColumns)) ? Number(a.desktopColumns) : (cur.appearance?.desktopColumns || 4),
        mobileColumns: [1, 2].includes(Number(a.mobileColumns)) ? Number(a.mobileColumns) : (cur.appearance?.mobileColumns || 2),
        imageFit: fit.includes(a.imageFit) ? a.imageFit : (cur.appearance?.imageFit || 'contain'),
      };
    })(),
    homeContent,
    siteContent,
    sliders: Array.isArray(b.sliders) ? b.sliders : (cur.sliders || []),
    homepageSections: Array.isArray(b.homepageSections) ? b.homepageSections.slice(0, 30).map((section) => ({
      id: String(section?.id || '').slice(0, 80),
      title: String(section?.title || '').trim().slice(0, 80),
      eyebrow: String(section?.eyebrow || '').trim().slice(0, 50),
      buttonText: String(section?.buttonText || 'View the collection').trim().slice(0, 40),
      category: String(section?.category || '').trim().slice(0, 100),
      count: Math.max(1, Math.min(30, parseInt(section?.count, 10) || 5)),
      active: section?.active !== false, isFlashSale: !!section?.isFlashSale,
      placement: ['after-brands', 'after-categories', 'after-promo', 'after-sale', 'after-story', 'before-newsletter', 'before-footer'].includes(section?.placement) ? section.placement : 'after-story',
      productIds: Array.isArray(section?.productIds) ? [...new Set(section.productIds.map(String))].slice(0, 100) : [],
    })).filter((section) => section.title && section.category) : (cur.homepageSections || []),
    apkVersion: typeof b.apkVersion === 'string' ? b.apkVersion.trim().slice(0, 30) : (cur.apkVersion || ''),
    fraudDetector,
  }));
});

app.post('/api/app-apk', adminAuth, requireRole('owner', 'manager'), express.raw({ type: ['application/vnd.android.package-archive', 'application/octet-stream'], limit: '50mb' }), (req, res) => {
  if (!Buffer.isBuffer(req.body) || req.body.length < 8 || req.body.length > 50 * 1024 * 1024) return res.status(400).json({ error: 'APK file is empty or too large.' });
  const filename = String(req.query.filename || 'Metrroma-Admin.apk').replace(/[^a-zA-Z0-9._-]/g, '-').slice(-100);
  if (!filename.toLowerCase().endsWith('.apk')) return res.status(400).json({ error: 'Please upload an .apk file.' });
  const savedName = `admin-${Date.now()}-${filename}`;
  writeFileSync(join(PRIVATE_APK_DIR, savedName), req.body, { mode: 0o600 });
  const version = String(req.query.version || '').trim().slice(0, 30);
  const settings = saveSettings({ apkStorageName: savedName, apkVersion: version || getSettings().apkVersion || '' });
  res.json({ ok: true, name: filename, version: settings.apkVersion });
});
app.get('/api/admin/app-apk/download', adminAuth, requireRole('owner', 'manager'), (req, res) => {
  const savedName = String(getSettings().apkStorageName || '');
  if (!savedName || savedName.includes('..') || savedName.includes('/') || savedName.includes('\\')) return res.status(404).json({ error: 'No private admin APK has been uploaded.' });
  const file = join(PRIVATE_APK_DIR, savedName);
  if (!existsSync(file)) return res.status(404).json({ error: 'The saved APK file is missing.' });
  res.setHeader('Content-Type', 'application/vnd.android.package-archive');
  res.setHeader('Content-Disposition', `attachment; filename="${savedName.replace(/"/g, '')}"`);
  res.sendFile(file);
});

app.get('/api/products', (req, res) => {
  let items = getCatalog().products;
  if (req.query.category) {
    const qCat = String(req.query.category).trim();
    const catalog = getCatalog();
    const childSlugs = (catalog.categories || [])
      .filter((c) => c.parentSlug === qCat)
      .map((c) => c.slug);
    const validSlugs = new Set([qCat, ...childSlugs]);
    items = items.filter((p) => {
      if (validSlugs.has(p.category)) return true;
      if (p.subCategory && validSlugs.has(p.subCategory)) return true;
      if (Array.isArray(p.categories) && p.categories.some((c) => validSlugs.has(c))) return true;
      return false;
    });
  }
  if (req.query.q) {
    const q = String(req.query.q).trim().toLowerCase();
    const cleanHex = q.replace(/#/g, '');
    items = items.filter((p) => {
      const colNames = (p.colors || []).map((c) => (typeof c === 'string' ? c : c.name)).join(' ').toLowerCase();
      const colHexes = (p.colors || []).map((c) => (typeof c === 'object' && c.hex ? c.hex : '')).join(' ').toLowerCase();
      const varCols = (p.variations || []).map((v) => `${v.color || ''} ${v.colorHex || ''}`).join(' ').toLowerCase();
      const varSizes = (p.variations || []).map((v) => v.size || '').join(' ').toLowerCase();
      const hay = `${p.name || ''} ${p.desc || ''} ${p.shortDesc || ''} ${p.category || ''} ${p.tag || ''} ${p.sku || ''} ${p.slug || ''} ${p.size || ''} ${colNames} ${varCols} ${varSizes}`.toLowerCase();
      return (
        hay.includes(q) ||
        colHexes.includes(q) ||
        (cleanHex.length >= 3 && colHexes.replace(/#/g, '').includes(cleanHex))
      );
    });
  }
  res.json(items.map(withFlags));
});

app.get('/api/products/:slug', (req, res) => {
  const p = getCatalog().products.find((x) => x.slug === req.params.slug);
  if (!p) return res.status(404).json({ error: 'not found' });
  res.json(withFlags(p));
});

// ---- Facebook / Meta Product Catalog Feed (XML & CSV) ----
function buildFeedAbsoluteUrl(path) {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const clean = path.startsWith('/') ? path : '/' + path;
  return `https://metrroma.com${clean}`;
}

function escapeXmlFeed(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function generateFacebookXmlFeed() {
  const catalog = getCatalog();
  const products = (catalog.products || []).filter((p) => !p.seoExclude);
  const settings = getSettings();
  const storeName = settings.storeName || 'METRROMA';

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">\n`;
  xml += `  <channel>\n`;
  xml += `    <title><![CDATA[${storeName} Product Catalog]]></title>\n`;
  xml += `    <link>https://metrroma.com</link>\n`;
  xml += `    <description><![CDATA[Official Live Product Catalog for ${storeName}]]></description>\n`;

  for (const p of products) {
    const id = p.id;
    const title = p.name || 'Product';
    const rawDesc = p.desc || p.shortDesc || p.seoDesc || p.name || '';
    const desc = rawDesc.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();
    const link = `https://metrroma.com/product/${encodeURIComponent(p.slug || p.id)}`;
    const imageLink = buildFeedAbsoluteUrl(p.image || (p.images && p.images[0]) || '/uploads/banner_metrroma_desktop.webp');
    const isOutOfStock = (p.stock != null && p.stock <= 0) || p.soldOut === true;
    const availability = isOutOfStock ? 'out of stock' : 'in stock';

    const originalPrice = p.compareAt && p.compareAt > p.price ? p.compareAt : p.price;
    const priceStr = `${Number(originalPrice || 0).toFixed(2)} BDT`;
    const salePriceStr = p.compareAt && p.compareAt > p.price ? `${Number(p.price || 0).toFixed(2)} BDT` : '';
    const brand = 'METRROMA';
    const category = p.category || 'Health & Beauty';

    xml += `    <item>\n`;
    xml += `      <g:id>${escapeXmlFeed(id)}</g:id>\n`;
    xml += `      <g:title><![CDATA[${title}]]></g:title>\n`;
    xml += `      <g:description><![CDATA[${desc}]]></g:description>\n`;
    xml += `      <g:link>${escapeXmlFeed(link)}</g:link>\n`;
    xml += `      <g:image_link>${escapeXmlFeed(imageLink)}</g:image_link>\n`;
    if (Array.isArray(p.images) && p.images.length > 1) {
      for (const extraImg of p.images.slice(1, 8)) {
        if (extraImg && extraImg !== p.image) {
          xml += `      <g:additional_image_link>${escapeXmlFeed(buildFeedAbsoluteUrl(extraImg))}</g:additional_image_link>\n`;
        }
      }
    }
    xml += `      <g:brand><![CDATA[${brand}]]></g:brand>\n`;
    xml += `      <g:condition>new</g:condition>\n`;
    xml += `      <g:availability>${availability}</g:availability>\n`;
    xml += `      <g:price>${priceStr}</g:price>\n`;
    if (salePriceStr) {
      xml += `      <g:sale_price>${salePriceStr}</g:sale_price>\n`;
    }
    xml += `      <g:google_product_category><![CDATA[Health & Beauty]]></g:google_product_category>\n`;
    xml += `      <g:product_type><![CDATA[${category}]]></g:product_type>\n`;
    xml += `      <g:content_id>${escapeXmlFeed(id)}</g:content_id>\n`;
    xml += `    </item>\n`;
  }

  xml += `  </channel>\n`;
  xml += `</rss>`;
  return xml;
}

function generateFacebookCsvFeed() {
  const catalog = getCatalog();
  const products = (catalog.products || []).filter((p) => !p.seoExclude);
  const rows = [
    ['id', 'title', 'description', 'availability', 'condition', 'price', 'sale_price', 'link', 'image_link', 'brand', 'google_product_category'].join(',')
  ];

  for (const p of products) {
    const id = `"${String(p.id).replace(/"/g, '""')}"`;
    const title = `"${String(p.name || '').replace(/"/g, '""')}"`;
    const rawDesc = p.desc || p.shortDesc || p.seoDesc || p.name || '';
    const desc = `"${rawDesc.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').replace(/"/g, '""').trim()}"`;
    const isOutOfStock = (p.stock != null && p.stock <= 0) || p.soldOut === true;
    const availability = isOutOfStock ? 'out of stock' : 'in stock';
    const condition = 'new';
    const originalPrice = p.compareAt && p.compareAt > p.price ? p.compareAt : p.price;
    const price = `"${Number(originalPrice || 0).toFixed(2)} BDT"`;
    const salePrice = p.compareAt && p.compareAt > p.price ? `"${Number(p.price || 0).toFixed(2)} BDT"` : '""';
    const link = `"https://metrroma.com/product/${encodeURIComponent(p.slug || p.id)}"`;
    const imageLink = `"${buildFeedAbsoluteUrl(p.image || (p.images && p.images[0]) || '/uploads/banner_metrroma_desktop.webp')}"`;
    const brand = '"METRROMA"';
    const cat = '"Health & Beauty"';

    rows.push([id, title, desc, availability, condition, price, salePrice, link, imageLink, brand, cat].join(','));
  }

  return rows.join('\n');
}

app.get(['/api/feed/facebook.xml', '/api/feed/facebook', '/feed/facebook.xml', '/catalog.xml', '/products.xml'], (_req, res) => {
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=600, s-maxage=1800');
  res.send(generateFacebookXmlFeed());
});

app.get(['/api/feed/facebook.csv', '/feed/facebook.csv'], (_req, res) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=600, s-maxage=1800');
  res.send(generateFacebookCsvFeed());
});

// ---- checkout (cash on delivery) ----
app.post('/api/orders', (req, res) => {
  const { items, customer, attribution: rawAttribution } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'cart is empty' });
  const c = customer || {};
  const refererHeader = String(req.headers['referer'] || '').toLowerCase();
  let serverDetectedChannel = '';
  if (refererHeader.includes('facebook.com') || refererHeader.includes('fb.me')) serverDetectedChannel = 'facebook';
  else if (refererHeader.includes('tiktok.com')) serverDetectedChannel = 'tiktok';
  else if (refererHeader.includes('google.com') || refererHeader.includes('google.')) serverDetectedChannel = 'google';
  else if (refererHeader.includes('yahoo.com')) serverDetectedChannel = 'yahoo';
  else if (refererHeader.includes('chatgpt.com') || refererHeader.includes('openai.com')) serverDetectedChannel = 'chatgpt';
  else if (refererHeader.includes('claude.ai')) serverDetectedChannel = 'claude';
  else if (refererHeader.includes('perplexity.ai')) serverDetectedChannel = 'perplexity';
  else if (refererHeader.includes('copilot.microsoft.com') || refererHeader.includes('bing.com')) serverDetectedChannel = 'copilot';

  const attribution = rawAttribution && typeof rawAttribution === 'object' ? {
    channel: String(rawAttribution.channel || serverDetectedChannel || '').trim().slice(0, 100),
    source: String(rawAttribution.source || '').trim().slice(0, 100),
    medium: String(rawAttribution.medium || '').trim().slice(0, 100),
    campaign: String(rawAttribution.campaign || '').trim().slice(0, 120),
    referrer: String(rawAttribution.referrer || req.headers['referer'] || '').trim().slice(0, 150),
    clickId: String(rawAttribution.clickId || '').trim().slice(0, 120),
  } : (serverDetectedChannel ? { channel: serverDetectedChannel, source: `${serverDetectedChannel}_referral`, referrer: req.headers['referer'] } : null);
  if (!c.name || c.name.trim().length < 2) return res.status(400).json({ error: 'please enter your name' });
  if (!BD_PHONE.test(String(c.phone || '').trim())) return res.status(400).json({ error: 'enter a valid bangladeshi mobile number' });
  if (!c.address || c.address.trim().length < 6) return res.status(400).json({ error: 'please enter a full delivery address' });

  const catalog = getCatalog().products;
  let landingPage = null;
  let landingSlug = '';
  if (c.landing) {
    const L = getLandingBySlug(String(c.landing));
    if (L && L.status === 'live') {
      landingSlug = L.slug;
      landingPage = L;
    }
  }

  const lines = [];
  for (const it of items) {
    // 1. Variant offer match from landing page
    if (landingPage && Array.isArray(landingPage.variants) && landingPage.variants.length > 0) {
      const variant = landingPage.variants.find((v) =>
        v.id === it.variantId ||
        v.id === it.id ||
        (it.variantTitle && v.title === it.variantTitle) ||
        (it.name && it.name.includes(v.title))
      );
      if (variant) {
        const p = catalog.find((x) => x.id === it.id) || catalog.find((x) => (landingPage.productIds || []).includes(x.id));
        if (p && (p.soldOut || (p.stock != null && p.stock <= 0))) {
          return res.status(400).json({ error: `${p.name} is sold out` });
        }
        const qty = Math.max(1, Math.min(20, parseInt(it.qty, 10) || 1));
        const baseName = (p && p.name) || landingPage.title || 'Product';
        const itemName = `${baseName} — ${variant.title}${variant.size ? ' (' + variant.size + ')' : ''}`;
        const itemImage = variant.image || (p && p.image) || landingPage.heroImage || '';
        lines.push({
          id: (p && p.id) || variant.id,
          variantId: variant.id,
          variantTitle: variant.title,
          name: itemName,
          sku: variant.sku || (p && p.sku) || it.sku || '',
          price: variant.price,
          qty,
          subtotal: variant.price * qty,
          image: itemImage,
        });
        continue;
      }
    }

    // 2. Landing package match (e.g. packages in landing page)
    if (landingPage && Array.isArray(landingPage.packages) && landingPage.packages.length > 0) {
      const pkg = landingPage.packages.find((pk) =>
        pk.id === it.id ||
        pk.id === it.productId ||
        (it.name && it.name.includes(pk.title))
      );
      if (pkg) {
        const p = catalog.find((x) => x.id === it.id) || catalog.find((x) => x.id === pkg.id) || catalog.find((x) => (landingPage.productIds || []).includes(x.id));
        const qty = Math.max(1, Math.min(20, parseInt(it.qty, 10) || 1));
        const name = it.name || pkg.title || landingPage.title;
        const image = it.image || pkg.image || landingPage.heroImage || '';
        lines.push({
          id: pkg.id,
          name,
          sku: pkg.sku || (p && p.sku) || it.sku || '',
          price: pkg.price,
          qty,
          subtotal: pkg.price * qty,
          image,
          color: it.color || '',
          size: it.size || '',
        });
        continue;
      }
    }

    // 3. Robust standard product match (handling mm-29267, mm-29267-Black, mm-29610, slug, title, etc.)
    const cleanId = String(it.id || '').trim();
    const baseId = it.productId || (cleanId.startsWith('mm-') ? cleanId.split('-').slice(0, 2).join('-') : (cleanId.includes('-') ? cleanId.split('-')[0] : cleanId));
    const p = catalog.find((x) => x.id === cleanId) ||
              catalog.find((x) => x.id === baseId) ||
              catalog.find((x) => x.slug === cleanId) ||
              (landingPage && catalog.find((x) => (landingPage.productIds || []).includes(x.id))) ||
              catalog.find((x) => it.name && x.name && (x.name.includes(it.name) || it.name.includes(x.name)));

    if (!p) {
      if (it.name || it.price != null || it.subtotal != null) {
        const qty = Math.max(1, Math.min(20, parseInt(it.qty, 10) || 1));
        const itemPrice = Number(it.price) || Number(it.subtotal) || 590;
        lines.push({
          id: cleanId || 'item',
          name: it.name || 'Product',
          price: itemPrice,
          qty,
          subtotal: itemPrice * qty,
          image: it.image || (landingPage ? landingPage.heroImage : ''),
          color: it.color || '',
          size: it.size || '',
        });
        continue;
      }
      return res.status(400).json({ error: `unknown product: ${it.id}` });
    }
    if (p.soldOut || (p.stock != null && p.stock <= 0)) return res.status(400).json({ error: `${p.name} is sold out` });
    const qty = Math.max(1, Math.min(20, parseInt(it.qty, 10) || 1));
    if (p.stock != null && p.stock < qty) return res.status(400).json({ error: `only ${p.stock} left of ${p.name}` });

    let itemPrice = p.price;
    let itemSku = p.sku || '';
    if (it.variantId && Array.isArray(p.variations)) {
      const v = p.variations.find((x) => x.id === it.variantId);
      if (v && v.price) itemPrice = v.price;
      if (v && v.sku) itemSku = v.sku;
    } else if (it.price && Number(it.price) > 0) {
      itemPrice = Number(it.price);
    }

    const sizeStr = it.size || '';
    const colorStr = it.color || '';
    const variantDesc = [sizeStr ? `Size: ${sizeStr}` : '', colorStr ? `Color: ${colorStr}` : ''].filter(Boolean).join(' · ');
    const itemName = variantDesc && (!it.name || !it.name.includes(variantDesc))
      ? `${p.name} (${variantDesc})`
      : (it.name || p.name);

    lines.push({
      id: p.id,
      variantId: it.variantId,
      size: sizeStr,
      color: colorStr,
      name: itemName,
      sku: it.sku || itemSku || '',
      price: itemPrice,
      qty,
      subtotal: itemPrice * qty,
      image: it.image || p.image,
    });
  }

  const itemsTotal = lines.reduce((s, l) => s + l.subtotal, 0);
  const settings = getSettings();

  // Fraud Detector & Multi-Level Device / IP / Phone Rate Limiting
  const fd = settings.fraudDetector || {};
  const rawDid = req.headers['x-device-id'] || req.body?.deviceId || c.deviceId || '';
  const deviceId = String(rawDid).trim();
  const clientIp = getClientIp(req);
  const phoneClean = cleanBDPhone(c.phone);

  if (!/^01[3-9]\d{8}$/.test(phoneClean) || isFakeBDPhone(phoneClean)) {
    return res.status(400).json({ error: 'অনুগ্রহ করে সঠিক ১১ ডিজিটের সক্রিয় বাংলাদেশি মোবাইল নম্বর প্রদান করুন (যেমন: 017XXXXXXXX)' });
  }

  if (fd.enabled !== false) {
    const isLanding = !!(landingSlug || c.landing);
    if (isLanding && fd.applyOnLandingPages === false) {
      // bypassed for landing pages only if explicitly disabled
    } else {
      const nowMs = Date.now();
      const cooldownMs = (Number(fd.cooldownHours) || 24) * 60 * 60 * 1000;
      const dayMs = 24 * 60 * 60 * 1000;
      const minSecMs = (Number(fd.minSecondsBetweenOrders) || 30) * 1000;
      const maxOrdersDevice = Number(fd.maxOrdersPerDay) || 1;
      const maxOrdersIp = Number(fd.maxOrdersPerIp) || 2;
      const maxSameProduct = Number(fd.sameProductLimit) || 1;

      const allOrders = getOrders() || [];
      const recentOrders = allOrders.filter((o) => {
        if (o.status === 'cancelled' || o.status === 'incomplete') return false;
        const t = new Date(o.createdAt).getTime();
        return !isNaN(t) && (nowMs - t) < Math.max(cooldownMs, dayMs);
      });

      const incomingItemIds = new Set(lines.map((l) => String(l.id || l.variantId || '')));
      const incomingLanding = String(landingSlug || c.landing || '').trim();

      let deviceOrdersCount24h = 0;
      let ipOrdersCount24h = 0;
      let lastOrderTimeMs = 0;
      let sameProductOrderCount = 0;

      for (const o of recentOrders) {
        const oTime = new Date(o.createdAt).getTime();
        const oIp = o.ip || '';
        const isSameDevice = !!(deviceId && o.deviceId && o.deviceId === deviceId);
        const isSamePhone = !!(fd.blockByPhone !== false && phoneClean && cleanBDPhone(o.customer?.phone) === phoneClean);
        const isSameIp = !!(fd.blockByIp !== false && clientIp && clientIp !== 'unknown_ip' && oIp && oIp === clientIp);

        // Check rapid clicks from same device, phone, or IP
        if (isSameDevice || isSamePhone || isSameIp) {
          if (oTime > lastOrderTimeMs) {
            lastOrderTimeMs = oTime;
          }
        }

        // Count device / phone daily orders
        if (isSameDevice || isSamePhone) {
          if ((nowMs - oTime) < dayMs) {
            deviceOrdersCount24h++;
          }
          if ((nowMs - oTime) < cooldownMs) {
            const oLanding = String(o.landing || '').trim();
            const oItems = Array.isArray(o.items) ? o.items : [];
            const hasMatchingItem = oItems.some((it) => incomingItemIds.has(String(it.id || it.variantId || '')));
            const hasMatchingLanding = !!(incomingLanding && oLanding && incomingLanding === oLanding);
            if (hasMatchingItem || hasMatchingLanding) {
              sameProductOrderCount++;
            }
          }
        }

        // Count IP daily orders separately
        if (isSameIp && (nowMs - oTime) < dayMs) {
          ipOrdersCount24h++;
        }
      }

      // 1. Rapid submission spam
      if (lastOrderTimeMs > 0 && (nowMs - lastOrderTimeMs) < minSecMs) {
        return res.status(429).json({
          error: fd.rapidOrderNoticeBn || fd.rapidOrderNotice || 'অনুগ্রহ করে নতুন অর্ডার সাবমিট করার পূর্বে কিছুক্ষণ অপেক্ষা করুন।'
        });
      }

      // 2. Same-Product Cooldown Limit
      if (sameProductOrderCount >= maxSameProduct) {
        return res.status(429).json({
          error: fd.sameProductNoticeBn || fd.sameProductNotice || 'আপনি ইতিমধ্যে এই পণ্যটির জন্য একটি অর্ডার করেছেন। নতুন অর্ডারের জন্য অপেক্ষা করুন।'
        });
      }

      // 3. Daily Max Orders Per Device / Phone Limit
      if (deviceOrdersCount24h >= maxOrdersDevice) {
        return res.status(429).json({
          error: fd.maxOrdersNoticeBn || fd.maxOrdersNotice || 'আপনার ডিভাইস থেকে আজকের সর্বোচ্চ অর্ডার সংখ্যা পূর্ণ হয়েছে।'
        });
      }

      // 4. Daily Max Orders Per IP Address Limit
      if (ipOrdersCount24h >= maxOrdersIp) {
        return res.status(429).json({
          error: fd.ipLimitNoticeBn || fd.ipLimitNotice || 'আপনার ইন্টারনেট নেটওয়ার্ক (IP) থেকে আজকের সর্বোচ্চ অর্ডারের সীমা অতিক্রম করেছে।'
        });
      }
    }
  }

  const area = c.area === 'outside' ? 'outside' : 'inside';
  let delInside = Number(settings.deliveryInside) || 80;
  let delOutside = Number(settings.deliveryOutside) || 130;
  let isFreeDelivery = false;
  if (landingPage) {
    isFreeDelivery = landingPage.freeDelivery === true;
    const insideCharge = landingPage.deliveryInside != null && landingPage.deliveryInside !== '' ? landingPage.deliveryInside : landingPage.customDeliveryInside;
    const outsideCharge = landingPage.deliveryOutside != null && landingPage.deliveryOutside !== '' ? landingPage.deliveryOutside : landingPage.customDeliveryOutside;
    if (insideCharge != null && insideCharge !== '') delInside = Number(insideCharge);
    if (outsideCharge != null && outsideCharge !== '') delOutside = Number(outsideCharge);
  } else {
    isFreeDelivery = Boolean(settings.freeShipThreshold && itemsTotal >= settings.freeShipThreshold);
    if (c.freeDelivery === true || c.shippingCost === 0 || req.body?.shipping?.cost === 0) {
      isFreeDelivery = true;
    }
  }
  const delivery = isFreeDelivery ? 0 : (area === 'outside' ? delOutside : delInside);
  let discount = 0, couponCode = '';
  if (landingPage) {
    const isVariantLp = Array.isArray(landingPage.variants) && landingPage.variants.length > 0;
    if (!isVariantLp && landingPage.offerPrice > 0 && itemsTotal > landingPage.offerPrice) {
      discount += itemsTotal - landingPage.offerPrice;
    }
  }
  if (c.coupon) {
    const cp = couponFor(c.coupon, itemsTotal, c.phone);
    if (cp && !cp.error) {
      discount += cp.discount;
      couponCode = cp.code;
    }
  }
  discount = Math.min(discount, itemsTotal);
  const total = Math.max(0, itemsTotal + delivery - discount);
  const order = {
    id: 'DOT-' + randomUUID().slice(0, 8).toUpperCase(),
    createdAt: new Date().toISOString(),
    status: 'pending',
    payment: 'cash_on_delivery',
    source: String(
      (attribution && attribution.channel && attribution.channel !== 'direct' ? attribution.channel : '') ||
      (c.source && !c.source.startsWith('landing_') && !c.source.startsWith('l/') ? c.source : '') ||
      (attribution?.channel || (landingSlug ? 'facebook' : 'direct'))
    ).slice(0, 60),
    attribution,
    landing: landingSlug,
    deviceId,
    ip: clientIp,
    customer: {
      name: c.name.trim(),
      phone: String(c.phone).trim(),
      address: c.address.trim(),
      area,
      district: String(c.district || '').trim(),
      thana: String(c.thana || '').trim(),
      note: (c.note || '').trim(),
    },
    items: lines,
    itemsTotal,
    delivery,
    discount,
    coupon: couponCode,
    total,
    history: [{ status: 'pending', at: new Date().toISOString() }],
  };
  addOrder(order);
  cancelDraft(order.customer.phone); // completed in time — don't capture an incomplete draft
  try {
    const cleanP = String(order.customer.phone).replace(/\D/g, '').slice(-11);
    const existingDraft = getOrders().find((o) => o.status === 'incomplete' && o.customer && String(o.customer.phone).replace(/\D/g, '').slice(-11) === cleanP);
    if (existingDraft) deleteOrder(existingDraft.id);
  } catch (_) {}
  notifyOrder(order, 'placed');
  try { linkSubscriberPhone(deviceId, order.customer.phone); } catch (_) {}
  trackPurchase(order).catch(() => {}); // server-side FB CAPI + TikTok Events (best effort)

  // Link order to customer & mark welcome coupon used if applied
  try {
    const cleanP = String(order.customer.phone).replace(/\D/g, '').slice(-11);
    const existingCust = getCustomerByPhone(cleanP);
    if (existingCust) {
      const updateData = {
        ...existingCust,
        name: existingCust.name && existingCust.name !== 'Customer' ? existingCust.name : (order.customer.name || 'Customer'),
        ordersCount: (existingCust.ordersCount || 0) + 1,
        lastOrderAt: order.createdAt,
      };
      if (couponCode === 'WELCOME5') {
        updateData.welcomeCouponUsed = true;
      }
      if (!existingCust.savedAddress?.address && order.customer.address) {
        updateData.savedAddress = {
          address: order.customer.address,
          district: order.customer.district || '',
          thana: order.customer.thana || '',
          area: order.customer.area || 'outside',
        };
      }
      saveCustomer(updateData);
    } else {
      saveCustomer({
        id: 'cust_' + cleanP,
        phone: order.customer.phone,
        name: order.customer.name || 'Customer',
        email: order.customer.email || '',
        ordersCount: 1,
        totalSpent: 0,
        savedAddress: {
          address: order.customer.address || '',
          district: order.customer.district || '',
          thana: order.customer.thana || '',
          area: order.customer.area || 'outside',
        },
        createdAt: order.createdAt,
        lastOrderAt: order.createdAt,
        welcomeCouponUsed: couponCode === 'WELCOME5',
      });
    }
  } catch {}
  const cat = getCatalog();
  let changed = false;
  for (const l of lines) {
    const pp = cat.products.find((x) => x.id === l.id);
    if (pp && pp.stock != null) {
      pp.stock = Math.max(0, pp.stock - l.qty);
      if (pp.stock === 0) pp.soldOut = true;
      changed = true;
    }
  }
  if (changed) saveCatalog(cat);
  res.status(201).json({ id: order.id, total: order.total, status: order.status });
});

// ---- track order (public: supports Order ID, Phone, or ID+Phone) ----
app.get('/api/track', async (req, res) => {
  const qId = String(req.query.id || req.query.order || '').trim().toUpperCase();
  const rawPhone = String(req.query.phone || '').trim();
  const qPhone = rawPhone.replace(/\D/g, '').slice(-11);

  if (!qId && !qPhone) {
    return res.status(400).json({ error: 'Please enter your Order ID or Phone number' });
  }

  const orders = getOrders() || [];
  let order = null;

  if (qId && qPhone) {
    order = orders.find((o) => {
      const p = String(o.customer?.phone || '').replace(/\D/g, '').slice(-11);
      return (o.id === qId || o.id === 'DOT-' + qId || String(o.id).toUpperCase() === qId) && p === qPhone;
    });
  } else if (qId) {
    order = orders.find((o) => o.id === qId || o.id === 'DOT-' + qId || String(o.id).toUpperCase() === qId);
  } else if (qPhone) {
    const matches = orders.filter((o) => {
      const p = String(o.customer?.phone || '').replace(/\D/g, '').slice(-11);
      return p === qPhone;
    });
    matches.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    order = matches[0];
  }

  if (!order) {
    return res.status(404).json({ error: 'No order found with the provided details. Please check your Order ID or phone number.' });
  }

  function maskPhoneForPrivacy(phone) {
    if (!phone) return '';
    const digits = String(phone).replace(/\D/g, '');
    if (digits.length >= 10) {
      const f = digits.slice(-11, -7) || digits.slice(0, 4);
      const l = digits.slice(-3);
      return f + '••••' + l;
    }
    return String(phone).slice(0, 3) + '••••' + String(phone).slice(-2);
  }

  function maskAddressForPrivacy(addr, dist) {
    const full = [addr, dist].filter(Boolean).join(', ').trim();
    if (!full) return 'সুরক্ষিত ডেলিভারি ঠিকানা 🔒';
    const parts = full.split(/[,।\n]/).map((p) => p.trim()).filter(Boolean);
    if (parts.length > 1) {
      return parts[0] + ', •••••••• (🔒 সুরক্ষার্থে সম্পূর্ণ ঠিকানা আড়ালকৃত)';
    }
    if (full.length > 10) {
      return full.slice(0, 8) + '•••••••• (🔒 সুরক্ষার্থে সম্পূর্ণ ঠিকানা আড়ালকৃত)';
    }
    return full + ' ••• (🔒)';
  }

  try { order = await syncOrderCourier(order); } catch {}
  res.json({
    id: order.id,
    createdAt: order.createdAt,
    status: order.status,
    payment: order.payment,
    items: order.items,
    itemsTotal: order.itemsTotal,
    delivery: order.delivery,
    discount: order.discount,
    total: order.total,
    customer: {
      name: order.customer?.name || '',
      phone: maskPhoneForPrivacy(order.customer?.phone),
      address: maskAddressForPrivacy(order.customer?.address, order.customer?.district),
      district: order.customer?.district || '',
      area: order.customer?.area || '',
    },
    courier: order.courier || null,
    history: order.history || [],
  });
});

// ---- admin auth: owner master key + staff accounts with roles ----
const SESSION_TTL_MS = 72 * 60 * 60 * 1000; // 72 hours (strictly matches Shakil Ecom app SESSION_DURATION_MS)
const ADMIN_SESSIONS_FILE = join(getPersistentDataDirectory(), 'admin_sessions.json');
const sessions = new Map(); // SHA-256 token hash -> { role, name, username, email, expiresAt }
const pendingOtps = new Map(); // tempToken -> { username, role, name, otp, email, expiresAt }
const pendingPasswordResets = new Map(); // resetToken -> { username, email, otp, expiresAt }

function sessionKey(token) {
  return createHash('sha256').update(String(token || '')).digest('hex');
}

function persistAdminSessions() {
  const tempFile = `${ADMIN_SESSIONS_FILE}.${process.pid}.tmp`;
  try {
    const persistentDir = getPersistentDataDirectory();
    mkdirSync(persistentDir, { recursive: true });
    writeFileSync(tempFile, JSON.stringify(Object.fromEntries(sessions)), { mode: 0o600 });
    renameSync(tempFile, ADMIN_SESSIONS_FILE);
    return true;
  } catch (error) {
    try { if (existsSync(tempFile)) unlinkSync(tempFile); } catch (_) {}
    console.error('[Auth] Could not persist admin sessions:', error.message);
    return false;
  }
}

function loadAdminSessions() {
  try {
    if (!existsSync(ADMIN_SESSIONS_FILE)) return;
    const saved = JSON.parse(readFileSync(ADMIN_SESSIONS_FILE, 'utf8'));
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return;
    let changed = false;
    for (const [hash, session] of Object.entries(saved)) {
      if (!/^[a-f0-9]{64}$/i.test(hash) || !session || typeof session !== 'object' || !Number.isFinite(Number(session.expiresAt))) {
        changed = true;
        continue;
      }
      if (Number(session.expiresAt) <= Date.now()) {
        changed = true;
        continue;
      }
      sessions.set(hash, session);
    }
    if (changed) persistAdminSessions();
    console.log(`[Auth] Restored ${sessions.size} persistent admin session(s).`);
  } catch (error) {
    console.error('[Auth] Could not load persisted admin sessions:', error.message);
  }
}

const hashPw = (pw, salt) => scryptSync(pw, salt, 32).toString('hex');
const makeHash = (pw) => { const salt = randomBytes(8).toString('hex'); return { salt, hash: hashPw(pw, salt) }; };
function checkPw(pw, user) {
  try { const a = Buffer.from(hashPw(pw, user.salt), 'hex'); const b = Buffer.from(user.hash, 'hex'); return a.length === b.length && timingSafeEqual(a, b); } catch { return false; }
}
function checkOwnerPassword(pw) {
  if (!pw) return false;
  const st = getSettings();
  if (st.ownerPassword && st.ownerPassword.hash && st.ownerPassword.salt) {
    return checkPw(pw, st.ownerPassword);
  }
  return !!(process.env.ADMIN_TOKEN && pw === process.env.ADMIN_TOKEN);
}
function hasAdminAccess() {
  const st = getSettings();
  return !!(process.env.ADMIN_TOKEN || (st.ownerPassword && st.ownerPassword.hash));
}
function getOwnerEmail() {
  const ig = getIntegrations();
  return (ig.email?.adminEmail || 'metroomaa@gmail.com').trim().toLowerCase();
}
function maskEmail(em) {
  return String(em || '').replace(/^(.)(.*)(@.*)$/, (_, a, b, c) => a + '*'.repeat(Math.min(5, Math.max(2, b.length))) + c);
}

function resolveAuth(req) {
  const token = req.get('x-admin-token') || req.query?.token || '';
  if (!token) return null;
  const key = sessionKey(token);
  const session = sessions.get(key);
  if (!session) {
    const masterToken = process.env.ADMIN_TOKEN || '';
    if (masterToken && token === masterToken) {
      return { role: 'owner', name: 'Owner', username: 'owner', email: getOwnerEmail(), expiresAt: Date.now() + SESSION_TTL_MS };
    }
    return null;
  }
  if (session.expiresAt && Date.now() > session.expiresAt) {
    sessions.delete(key);
    persistAdminSessions();
    return null;
  }
  if (session.role !== 'owner') {
    const currentUser = getUsers().find((user) => user.username === session.username);
    if (!currentUser) {
      sessions.delete(key);
      persistAdminSessions();
      return null;
    }
    session.role = currentUser.role;
    session.name = currentUser.name;
    session.email = currentUser.email || '';
    session.allowedProducts = Array.isArray(currentUser.allowedProducts) ? currentUser.allowedProducts : [];
    persistAdminSessions();
  }
  return session;
}
function adminAuth(req, res, next) {
  if (!hasAdminAccess()) return res.status(503).json({ error: 'admin disabled: set ADMIN_TOKEN' });
  const auth = resolveAuth(req);
  if (!auth) return res.status(401).json({ error: 'unauthorized: session expired or invalid' });
  req.admin = auth;
  next();
}
loadAdminSessions();
function requireRole(...roles) {
  return (req, res, next) => { if (!req.admin || !roles.includes(req.admin.role)) return res.status(403).json({ error: 'your role cannot do this' }); next(); };
}

function renderSecurityOtpHtml({ storeName, title, subtitle, otp, userName, userEmail, expiresMin = 10, note }) {
  const cleanOtp = String(otp || '').trim();

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#090d16;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#090d16;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:500px;background:linear-gradient(180deg, #131c2e 0%, #0c121d 100%);border:1px solid rgba(255,255,255,0.12);border-radius:24px;box-shadow:0 24px 60px rgba(0,0,0,0.7),inset 0 1px 0 rgba(255,255,255,0.18);overflow:hidden;">
          <tr>
            <td style="height:4px;background:linear-gradient(90deg, #e7b486 0%, #f59e0b 50%, #38bdf8 100%);"></td>
          </tr>
          <tr>
            <td style="padding:36px 32px 32px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td align="left">
                    <div style="font-size:22px;font-weight:800;letter-spacing:-0.03em;color:#ffffff;">
                      ${storeName || 'Store'}<span style="color:#e7b486;">.</span>
                      <span style="display:inline-block;margin-left:6px;font-size:11px;font-weight:700;letter-spacing:0.08em;color:#94a3b8;text-transform:uppercase;background:rgba(255,255,255,0.06);padding:3px 8px;border-radius:6px;border:1px solid rgba(255,255,255,0.08);">ADMIN</span>
                    </div>
                  </td>
                  <td align="right">
                    <span style="display:inline-block;padding:5px 12px;border-radius:20px;font-size:11px;font-weight:600;letter-spacing:0.04em;color:#38bdf8;background:rgba(56,189,248,0.1);border:1px solid rgba(56,189,248,0.25);">
                      🔒 2FA AUTH
                    </span>
                  </td>
                </tr>
              </table>

              <div style="text-align:center;padding:28px 0 14px;">
                <div style="display:inline-block;width:60px;height:60px;line-height:60px;border-radius:20px;background:rgba(231,180,134,0.14);border:1.5px solid rgba(231,180,134,0.35);text-align:center;font-size:28px;box-shadow:0 8px 24px rgba(231,180,134,0.18);margin-bottom:14px;">
                  🛡️
                </div>
                <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.02em;">
                  ${title}
                </h1>
                <p style="margin:0;font-size:14px;color:#94a3b8;line-height:1.5;">
                  ${subtitle}
                </p>
              </div>

              <!-- Effortlessly Selectable / Copyable Code Container -->
              <div style="margin:24px auto 26px;text-align:center;max-width:320px;">
                <div style="background:linear-gradient(135deg, rgba(231,180,134,0.14) 0%, rgba(56,189,248,0.12) 100%);border:2px solid #e7b486;border-radius:16px;padding:16px 20px;text-align:center;box-shadow:0 8px 24px rgba(0,0,0,0.5);-webkit-user-select:all;-moz-user-select:all;user-select:all;">
                  <span style="font-size:38px;font-weight:800;letter-spacing:10px;font-family:'SF Mono',Consolas,Menlo,monospace;color:#ffffff;text-shadow:0 0 16px rgba(231,180,134,0.7);display:inline-block;padding-left:10px;-webkit-user-select:all;-moz-user-select:all;user-select:all;">${cleanOtp}</span>
                </div>
                <div style="margin-top:10px;font-size:12px;color:#cbd5e1;font-weight:500;">
                  👆 <strong>Tap & hold</strong> to copy · Single-use passcode
                </div>
              </div>

              <div style="background:rgba(255,255,255,0.035);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:16px 18px;margin-bottom:24px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td style="padding-bottom:8px;font-size:12.5px;color:#94a3b8;">
                      <strong style="color:#e2e8f0;">⏱ Validity:</strong> Expires in <span style="color:#f59e0b;font-weight:600;">${expiresMin} minutes</span>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding-bottom:8px;font-size:12.5px;color:#94a3b8;">
                      <strong style="color:#e2e8f0;">👤 Account:</strong> <span style="color:#e2e8f0;">${userName || 'Admin'}</span> (${userEmail})
                    </td>
                  </tr>
                  <tr>
                    <td style="font-size:12.5px;color:#94a3b8;">
                      <strong style="color:#e2e8f0;">🛡 Security:</strong> High-grade session protection. All sessions auto-expire after 48h.
                    </td>
                  </tr>
                </table>
              </div>

              <p style="margin:0;font-size:12px;color:#64748b;line-height:1.5;text-align:center;">
                ${note || 'If you did not initiate this login attempt, someone may be trying to access your store. Please contact your security team immediately.'}
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:16px 32px;background:rgba(0,0,0,0.3);border-top:1px solid rgba(255,255,255,0.06);text-align:center;font-size:11.5px;color:#64748b;">
              © ${new Date().getFullYear()} ${storeName || 'Store'}. Security Authentication Service.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

function renderAdminVerificationHtml(otp) {
  const code = String(otp || '').replace(/\D/g, '').slice(0, 6);
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:32px 16px;background:#fff;color:#111;font-family:Arial,Helvetica,sans-serif;text-align:center;">
  <div style="margin:0 auto;max-width:360px;">
    <p style="margin:0 0 18px;font-size:30px;font-weight:700;letter-spacing:8px;">${code}</p>
    <p style="margin:0;font-size:14px;line-height:1.5;">This code is valid for 10 minutes.</p>
  </div>
</body>
</html>`;
}

function getClientIp(req) {
  const fwd = req.headers['cf-connecting-ip'] || req.headers['x-real-ip'] || req.headers['x-forwarded-for'];
  if (fwd) {
    const list = String(fwd).split(',');
    if (list.length > 0 && list[0].trim()) return list[0].trim();
  }
  return String(req.socket?.remoteAddress || req.ip || '').replace(/^::ffff:/, '').trim() || 'unknown_ip';
}

// Rate limiting for admin login: max 5 failed attempts per IP within 15 minutes
const loginRateLimit = new Map(); // ip -> { failedCount, lockedUntil }
function checkLoginRateLimit(ip) {
  const record = loginRateLimit.get(ip);
  if (!record) return { allowed: true };
  if (record.lockedUntil && Date.now() < record.lockedUntil) {
    const minutesLeft = Math.ceil((record.lockedUntil - Date.now()) / 60000);
    return { allowed: false, error: `Too many failed login attempts. Temporarily locked for ${minutesLeft} minute(s).` };
  }
  if (record.lockedUntil && Date.now() >= record.lockedUntil) {
    loginRateLimit.delete(ip);
    return { allowed: true };
  }
  return { allowed: true };
}
function recordLoginFailure(ip) {
  const record = loginRateLimit.get(ip) || { failedCount: 0 };
  record.failedCount += 1;
  if (record.failedCount >= 5) {
    record.lockedUntil = Date.now() + 15 * 60 * 1000; // 15 min lockout
  }
  loginRateLimit.set(ip, record);
}
function recordLoginSuccess(ip) {
  loginRateLimit.delete(ip);
}

// 1. Login Endpoint (validates password, triggers 6-digit OTP email)
app.post('/api/admin/login', async (req, res) => {
  if (!hasAdminAccess()) return res.status(503).json({ error: 'admin disabled: set ADMIN_TOKEN' });
  const clientIp = getClientIp(req);
  const rateStatus = checkLoginRateLimit(clientIp);
  if (!rateStatus.allowed) {
    return res.status(429).json({ error: rateStatus.error });
  }

  const u = String(req.body?.username || '').trim().toLowerCase();
  const p = String(req.body?.password || '');
  
  let user = null;
  const isOwner = (u === 'owner' || u === '') && checkOwnerPassword(p);
  if (isOwner) {
    user = { role: 'owner', name: 'Owner', username: 'owner', email: getOwnerEmail(), allowedProducts: [], skipOtp: false };
  } else {
    user = getUsers().find((x) => x.username === u);
    if (!user || !checkPw(p, user)) {
      recordLoginFailure(clientIp);
      return res.status(401).json({ error: 'Wrong username or password' });
    }
  }

  recordLoginSuccess(clientIp);

  const ig = getIntegrations();
  const emailActive = !!(ig.email?.enabled && (ig.email?.resendApiKey || ig.email?.host));

  // Security Policy: OTP verification code strictly required for Owner and ALL Staff
  if (emailActive) {
    const targetEmail = user.role === 'owner'
      ? getOwnerEmail().trim()
      : String(user.email || '').trim();

    if (!targetEmail || !targetEmail.includes('@')) {
      return res.status(400).json({
        error: 'এই স্টাফ অ্যাকাউন্টে নিজস্ব কোনো ইমেইল যুক্ত করা নেই। স্টোর অ্যাডমিনকে Staff প্যানেল থেকে আপনার ইমেইল যুক্ত করতে বলুন।'
      });
    }

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const tempToken = 't_' + randomBytes(16).toString('hex');
    const st = getSettings();
    const storeName = (st.storeName && st.storeName !== 'dot.') ? st.storeName : 'METRROMA';

    console.log(`[Admin Security OTP] Generated login verification code for ${user.username} (${targetEmail}): ${otp}`);

    const emailRes = await sendEmail(
      targetEmail,
      `${storeName} Verification Code: ${otp}`,
      renderSecurityOtpHtml({
        storeName,
        title: 'Admin Login Verification',
        subtitle: `Hi <strong>${user.name || user.username}</strong>, enter this 6-digit verification code to sign in to your <strong>${storeName}</strong> account:`,
        otp,
        userName: user.name || user.username,
        userEmail: targetEmail,
        expiresMin: 10,
        note: 'Never share this verification code with anyone.'
      })
    );

    if (!emailRes.ok) {
      console.warn(`[OTP] Direct delivery to ${targetEmail} failed (${emailRes.error}).`);
      const isResendSandbox = String(emailRes.error || '').toLowerCase().includes('only send testing emails') || String(emailRes.error || '').toLowerCase().includes('not verified');
      if (isResendSandbox && targetEmail !== getOwnerEmail()) {
        const ownerEmail = getOwnerEmail();
        console.log(`[OTP] Forwarding staff ${user.username} verification code to owner: ${ownerEmail}`);
        await sendEmail(
          ownerEmail,
          `[Staff: ${user.name || user.username}] ${storeName} Verification Code: ${otp}`,
          renderSecurityOtpHtml({
            storeName,
            title: `Staff Login Verification (${user.name || user.username})`,
            subtitle: `Staff <strong>${user.name || user.username}</strong> (${targetEmail}) is signing in. Verification code:`,
            otp,
            userName: user.name || user.username,
            userEmail: targetEmail,
            expiresMin: 10,
            note: 'Provide this code to your staff member to authorize sign in.'
          })
        );
      } else {
        return res.status(503).json({
          error: isResendSandbox
            ? `${targetEmail}-এ ভেরিফিকেশন কোড পাঠানো যায়নি কারণ ইমেইল ডোমেইন ভেরিফায়েড নয়।`
            : `${targetEmail}-এ ভেরিফিকেশন কোড পাঠানো যায়নি (${emailRes.error || 'Email error'})।`
        });
      }
    }

    pendingOtps.set(tempToken, {
      username: user.username,
      role: user.role,
      name: user.name,
      otp,
      email: targetEmail,
      allowedProducts: Array.isArray(user.allowedProducts) ? user.allowedProducts : [],
      expiresAt: Date.now() + 10 * 60 * 1000 // 10 minutes
    });

    return res.json({
      otpRequired: true,
      tempToken,
      emailMasked: maskEmail(targetEmail),
    });
  }

  // Fallback: direct 30-day session if email is disabled or skipOtp is enabled
  const token = 's_' + randomBytes(24).toString('hex');
  const expiresAt = Date.now() + SESSION_TTL_MS;
  sessions.set(sessionKey(token), { role: user.role, name: user.name, username: user.username, email: user.email || getOwnerEmail(), allowedProducts: Array.isArray(user.allowedProducts) ? user.allowedProducts : [], expiresAt });
  if (!persistAdminSessions()) {
    sessions.delete(sessionKey(token));
    return res.status(503).json({ error: 'Secure session storage is unavailable. Please contact the store administrator.' });
  }
  res.json({ token, role: user.role, name: user.name, expiresAt });
});

// 2. Verify OTP Endpoint
app.post('/api/admin/verify-otp', (req, res) => {
  const { tempToken, otp } = req.body || {};
  if (!tempToken || !otp) return res.status(400).json({ error: 'Missing temporary token or OTP' });
  const pending = pendingOtps.get(tempToken);
  if (!pending) return res.status(400).json({ error: 'Session expired. Please sign in again.' });
  if (Date.now() > pending.expiresAt) {
    pendingOtps.delete(tempToken);
    return res.status(400).json({ error: 'OTP expired. Please request a new code.' });
  }
  if (String(pending.otp).trim() !== String(otp).trim()) {
    pending.attempts = (pending.attempts || 0) + 1;
    if (pending.attempts >= 5) {
      pendingOtps.delete(tempToken);
      return res.status(429).json({ error: 'Too many incorrect OTP attempts. Security lock triggered. Please sign in again.' });
    }
    return res.status(400).json({ error: `Invalid OTP code. Please check your email. (${5 - pending.attempts} attempts remaining)` });
  }

  // Valid OTP! Issue 30-day session
  const token = 's_' + randomBytes(24).toString('hex');
  const expiresAt = Date.now() + SESSION_TTL_MS;
  sessions.set(sessionKey(token), {
    role: pending.role,
    name: pending.name,
    username: pending.username,
    email: pending.email,
    allowedProducts: Array.isArray(pending.allowedProducts) ? pending.allowedProducts : [],
    expiresAt
  });
  if (!persistAdminSessions()) {
    sessions.delete(sessionKey(token));
    return res.status(503).json({ error: 'Secure session storage is unavailable. Please contact the store administrator.' });
  }
  pendingOtps.delete(tempToken);

  res.json({
    token,
    role: pending.role,
    name: pending.name,
    username: pending.username,
    expiresAt
  });
});

// 3. Resend OTP
app.post('/api/admin/resend-otp', async (req, res) => {
  const { tempToken } = req.body || {};
  const pending = pendingOtps.get(tempToken);
  if (!pending) return res.status(400).json({ error: 'Session expired. Please sign in again.' });
  
  const otp = String(Math.floor(100000 + Math.random() * 900000));
  pending.otp = otp;
  pending.expiresAt = Date.now() + 10 * 60 * 1000;
  pendingOtps.set(tempToken, pending);

  const st = getSettings();
  const storeName = (st.storeName && st.storeName !== 'dot.') ? st.storeName : 'METRROMA';

  const emailRes = await sendEmail(
    pending.email,
    `${storeName} Verification Code: ${otp}`,
    renderSecurityOtpHtml({
      storeName,
      title: 'Admin Login Verification',
      subtitle: `Hi <strong>${pending.name || pending.username}</strong>, here is your new 6-digit verification code:`,
      otp,
      userName: pending.name || pending.username,
      userEmail: pending.email,
      expiresMin: 10,
      note: 'Never share this verification code with anyone.'
    })
  );

  if (!emailRes.ok) {
    return res.status(503).json({
      error: `${pending.email}-এ ভেরিফিকেশন কোড পাঠানো যায়নি (${emailRes.error || 'Email delivery failed'})।`
    });
  }

  res.json({ ok: true, emailMasked: maskEmail(pending.email) });
});

// 4. Forgot Password (requests OTP to reset password)
app.post('/api/admin/forgot-password', async (req, res) => {
  const u = String(req.body?.usernameOrEmail || '').trim().toLowerCase();
  let user = null;
  if (u === 'owner' || u === getOwnerEmail()) {
    user = { username: 'owner', name: 'Owner', role: 'owner', email: getOwnerEmail() };
  } else {
    user = getUsers().find((x) => x.username === u || (x.email && x.email.toLowerCase() === u));
  }
  if (!user) return res.status(404).json({ error: 'No admin account found with that username or email' });

  const targetEmail = user.role === 'owner' ? getOwnerEmail() : String(user.email || '').trim();
  if (!targetEmail || !targetEmail.includes('@')) {
    return res.status(400).json({ error: 'No email address is registered on this staff account. Please contact the store owner.' });
  }
  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const resetToken = 'r_' + randomBytes(16).toString('hex');
  const st = getSettings();
  const storeName = st.storeName || 'Store';

  pendingPasswordResets.set(resetToken, {
    username: user.username,
    email: targetEmail,
    otp,
    expiresAt: Date.now() + 15 * 60 * 1000 // 15 minutes
  });

  await sendEmail(
    targetEmail,
    `${storeName} — Password Reset Code: ${otp}`,
    renderSecurityOtpHtml({
      storeName,
      title: 'Admin Password Reset',
      subtitle: `A password reset was requested for admin <strong>${user.username}</strong>. Use the 6-digit code below to set a new password:`,
      otp,
      userName: user.name || user.username,
      userEmail: targetEmail,
      expiresMin: 15,
      note: "If you did not request this password reset, your account remains secure and you can safely ignore this email."
    })
  );

  res.json({ ok: true, resetToken, emailMasked: maskEmail(targetEmail) });
});

// 5. Reset Password (verifies OTP, updates password)
app.post('/api/admin/reset-password', (req, res) => {
  const { resetToken, otp, newPassword } = req.body || {};
  if (!resetToken || !otp || !newPassword || String(newPassword).length < 8) {
    return res.status(400).json({ error: 'All fields required, new password must be at least 8 characters' });
  }
  const pending = pendingPasswordResets.get(resetToken);
  if (!pending) return res.status(400).json({ error: 'Reset session expired. Please request a new one.' });
  if (Date.now() > pending.expiresAt) {
    pendingPasswordResets.delete(resetToken);
    return res.status(400).json({ error: 'Reset code expired. Please request a new one.' });
  }
  if (String(pending.otp).trim() !== String(otp).trim()) {
    return res.status(400).json({ error: 'Invalid reset code' });
  }

  // Apply new password
  if (pending.username === 'owner') {
    const { salt, hash } = makeHash(String(newPassword));
    saveSettings({ ownerPassword: { salt, hash, updatedAt: new Date().toISOString() } });
    process.env.ADMIN_TOKEN = String(newPassword);
  } else {
    const users = getUsers();
    const u = users.find((x) => x.username === pending.username);
    if (u) {
      const { salt, hash } = makeHash(String(newPassword));
      u.salt = salt;
      u.hash = hash;
      saveUsers(users);
    }
  }

  pendingPasswordResets.delete(resetToken);
  res.json({ ok: true, message: 'Password successfully changed! Please sign in with your new password.' });
});

app.post('/api/admin/change-password', adminAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!newPassword || String(newPassword).length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters' });
  const admin = req.admin;
  if (admin.role === 'owner') {
    if (!checkOwnerPassword(currentPassword)) return res.status(400).json({ error: 'Current password incorrect' });
    const { salt, hash } = makeHash(String(newPassword));
    saveSettings({ ownerPassword: { salt, hash, updatedAt: new Date().toISOString() } });
    process.env.ADMIN_TOKEN = String(newPassword);
    for (const [key, session] of sessions) if (session.role === 'owner') sessions.delete(key);
    persistAdminSessions();
    return res.json({ ok: true, message: 'Owner master password updated successfully!' });
  }
  const users = getUsers();
  const u = users.find((x) => x.username === admin.username);
  if (!u || !checkPw(currentPassword, u)) return res.status(400).json({ error: 'Current password incorrect' });
  const { salt, hash } = makeHash(String(newPassword));
  u.salt = salt;
  u.hash = hash;
  saveUsers(users);
  for (const [key, session] of sessions) if (session.username === admin.username) sessions.delete(key);
  persistAdminSessions();
  res.json({ ok: true, message: 'Password updated successfully!' });
});

app.put('/api/admin/security-email', adminAuth, requireRole('owner'), (req, res) => {
  const { email } = req.body || {};
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) return res.status(400).json({ error: 'Valid email address required' });
  const ig = getIntegrations();
  ig.email.adminEmail = cleanEmail;
  saveIntegrations(ig);
  res.json({ ok: true, adminEmail: cleanEmail });
});

app.get('/api/admin/me', adminAuth, (req, res) => res.json(req.admin));
app.post('/api/admin/logout', adminAuth, (req, res) => {
  const token = req.get('x-admin-token') || '';
  sessions.delete(sessionKey(token));
  persistAdminSessions();
  res.json({ ok: true });
});

app.get('/api/admin/users', adminAuth, requireRole('owner'), (_q, res) => res.json(getUsers().map((u) => ({ id: u.id, username: u.username, name: u.name, email: u.email || '', role: u.role, skipOtp: !!u.skipOtp, allowedProducts: Array.isArray(u.allowedProducts) ? u.allowedProducts : [] }))));

app.post('/api/admin/users', adminAuth, requireRole('owner'), async (req, res) => {
  const b = req.body || {};
  const username = String(b.username || '').trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '');
  const name = String(b.name || '').trim() || username;
  const email = String(b.email || '').trim().toLowerCase();
  const role = ['manager', 'staff'].includes(b.role) ? b.role : 'staff';
  const allowedProducts = Array.isArray(b.allowedProducts) ? b.allowedProducts.map(String) : [];
  const password = String(b.password || '');
  const skipOtp = !!b.skipOtp;
  if (!username || password.length < 4) return res.status(400).json({ error: 'Username and a 4+ character password are required' });
  if (!skipOtp && (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))) {
    return res.status(400).json({ error: 'স্টাফের নিজস্ব ভেরিফিকেশন কোডের জন্য একটি সঠিক ইমেইল ঠিকানা দেওয়া আবশ্যক।' });
  }
  const users = getUsers();
  if (users.find((u) => u.username === username)) return res.status(400).json({ error: 'username already exists' });
  const { salt, hash } = makeHash(password);
  const newUser = { id: 'u' + Date.now().toString(36), username, name, email, role, skipOtp, allowedProducts, salt, hash, createdAt: new Date().toISOString() };
  users.push(newUser);
  saveUsers(users);

  // Send onboarding email to new staff member
  if (email) {
    const host = req.get('host') || 'dot.metromaa.com';
    const loginUrl = `${req.protocol}://${host}/admin`;
    sendEmail(
      email,
      `Welcome to METRROMA Admin Team — Your Login Credentials`,
      `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;padding:28px;background:#17120E;color:#ECE4D8;border-radius:18px;border:1px solid rgba(231,180,134,0.3);">
        <div style="font-size:24px;font-weight:700;margin-bottom:6px;color:#ECE4D8;">dot<span style="color:#E7B486;">.</span> <span style="font-size:14px;color:#A99E8E;font-weight:400;">staff onboarding</span></div>
        <p style="color:#A99E8E;font-size:14px;margin:12px 0 20px;">Hi <b>${name}</b>, your admin account has been created with the role of <b>${role.toUpperCase()}</b>.</p>
        <div style="background:rgba(231,180,134,0.08);border:1px solid rgba(231,180,134,0.25);border-radius:14px;padding:20px;margin:18px 0;line-height:1.7;">
          <div style="margin-bottom:8px;"><span style="color:#A99E8E;font-size:13px;">Login URL:</span><br><a href="${loginUrl}" style="color:#E7B486;font-weight:600;word-break:break-all;">${loginUrl}</a></div>
          <div style="margin-bottom:8px;"><span style="color:#A99E8E;font-size:13px;">Username:</span><br><code style="background:rgba(0,0,0,0.4);padding:4px 8px;border-radius:6px;color:#ECE4D8;font-size:14px;">${username}</code></div>
          <div style="color:#A99E8E;font-size:13px;">For security, your temporary password is shared separately by the store owner. Never share your password or verification code.</div>
        </div>
        <p style="color:#6F665A;font-size:12px;line-height:1.5;">🔒 Security Notice: Your session automatically expires every 30 days. When signing in, you will be prompted for an email OTP verification.</p>
      </div>
      `
    ).catch(() => {});
  }

  res.status(201).json({ username, name, email, role, skipOtp, allowedProducts });
});

app.patch('/api/admin/users/:id', adminAuth, requireRole('owner'), (req, res) => {
  const users = getUsers();
  const u = users.find((x) => x.id === req.params.id);
  if (!u) return res.status(404).json({ error: 'User not found' });
  const b = req.body || {};
  if (b.name != null) u.name = String(b.name).trim() || u.name;
  if (b.email != null) u.email = String(b.email).trim().toLowerCase();
  if (b.role && ['manager', 'staff'].includes(b.role)) u.role = b.role;
  if (b.skipOtp != null) u.skipOtp = !!b.skipOtp;
  if (Array.isArray(b.allowedProducts)) u.allowedProducts = b.allowedProducts.map(String);
  if (!u.skipOtp && (!u.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(u.email))) {
    return res.status(400).json({ error: '2FA OTP চালু রাখতে স্টাফের নিজস্ব ইমেইল ঠিকানা অবশ্যই দিতে হবে।' });
  }
  if (b.password && String(b.password).length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });
  if (b.password) {
    const { salt, hash } = makeHash(String(b.password));
    u.salt = salt;
    u.hash = hash;
  }
  saveUsers(users);
  res.json({ id: u.id, username: u.username, name: u.name, email: u.email || '', role: u.role, skipOtp: !!u.skipOtp, allowedProducts: Array.isArray(u.allowedProducts) ? u.allowedProducts : [] });
});

app.post('/api/admin/users/:id/test-otp', adminAuth, requireRole('owner'), async (req, res) => {
  const u = getUsers().find((x) => x.id === req.params.id);
  if (!u) return res.status(404).json({ error: 'Staff member not found' });
  if (!u.email || !u.email.includes('@')) {
    return res.status(400).json({ error: 'এই স্টাফের কোনো ইমেইল ঠিকানা সেভ করা নেই।' });
  }
  const st = getSettings();
  const storeName = (st.storeName && st.storeName !== 'dot.') ? st.storeName : 'METRROMA';
  const sampleOtp = String(Math.floor(100000 + Math.random() * 900000));
  const out = await sendEmail(
    u.email,
    `${storeName} Staff Email Verification Test (${sampleOtp})`,
    renderSecurityOtpHtml({
      storeName,
      title: 'Staff OTP Delivery Verified ✓',
      subtitle: `Hi <strong>${u.name || u.username}</strong>, your staff email is properly connected! Future login verification codes will arrive directly in this inbox (${u.email}). Sample code:`,
      otp: sampleOtp,
      userName: u.name || u.username,
      userEmail: u.email,
      expiresMin: 10,
      note: 'This was a test triggered by the Store Owner to confirm direct staff OTP delivery.'
    })
  );
  if (!out.ok) {
    return res.status(400).json({ error: out.error || 'Could not deliver test email' });
  }
  res.json({ ok: true, email: u.email });
});

app.delete('/api/admin/users/:id', adminAuth, requireRole('owner'), (req, res) => {
  const users = getUsers();
  const removed = users.find((u) => u.id === req.params.id);
  saveUsers(users.filter((u) => u.id !== req.params.id));
  if (removed) {
    for (const [key, session] of sessions) if (session.username === removed.username) sessions.delete(key);
    persistAdminSessions();
  }
  res.json({ ok: true });
});

app.get('/api/orders', adminAuth, (req, res) => {
  let list = getOrders();
  if (req.admin.role === 'staff' && Array.isArray(req.admin.allowedProducts) && req.admin.allowedProducts.length > 0) {
    const allowed = req.admin.allowedProducts;
    list = list.filter((o) => (o.items || []).some((it) => allowed.includes(String(it.id)) || allowed.includes(String(it.slug))));
  }
  res.json(list);
});

// Admin create manual order (Phone call, WhatsApp, Facebook Messenger, POS)
app.post('/api/admin/orders', adminAuth, requireRole('owner', 'manager'), (req, res) => {
  const { customer, items, delivery, discount, source, status, adminNote, courier } = req.body || {};
  const c = customer || {};
  const rawPhone = String(c.phone || '').trim();
  const phoneClean = cleanBDPhone(rawPhone) || rawPhone.replace(/\D/g, '');
  if (!phoneClean || phoneClean.length < 11) {
    return res.status(400).json({ error: 'সঠিক ১১ ডিজিটের মোবাইল নম্বর প্রদান করুন' });
  }
  const adminCatalog = getCatalog().products || [];
  const lines = Array.isArray(items) ? items.map((it) => {
    const qty = Math.max(1, parseInt(it.qty, 10) || 1);
    const price = Number(it.price) || 0;
    const catProd = adminCatalog.find((x) => x.id === it.id);
    return {
      id: it.id || 'custom',
      name: String(it.name || 'Product').trim(),
      sku: it.sku || (catProd && catProd.sku) || '',
      price,
      qty,
      subtotal: price * qty,
      image: it.image || '',
      variantId: it.variantId || '',
      variantTitle: it.variantTitle || '',
      size: it.size || '',
      color: it.color || '',
    };
  }) : [];
  if (lines.length === 0) {
    return res.status(400).json({ error: 'কমপক্ষে একটি পণ্য যোগ করুন' });
  }

  const itemsTotal = lines.reduce((s, it) => s + it.subtotal, 0);
  const deliveryFee = delivery != null ? Math.max(0, Number(delivery)) : 0;
  const discountAmt = discount != null ? Math.max(0, Number(discount)) : 0;
  const total = Math.max(0, itemsTotal + deliveryFee - discountAmt);
  const now = new Date().toISOString();
  const orderId = 'DOT-' + randomUUID().slice(0, 8).toUpperCase();
  const initialStatus = status || 'confirmed';
  const orderSource = String(source || 'phone_call').trim();
  const area = c.area === 'outside' ? 'outside' : (c.district && c.district.toLowerCase() === 'dhaka' ? 'inside' : (c.area || 'inside'));

  const order = {
    id: orderId,
    createdAt: now,
    status: initialStatus,
    payment: 'cash_on_delivery',
    source: orderSource,
    customer: {
      name: String(c.name || 'Customer').trim(),
      phone: phoneClean,
      phone2: String(c.phone2 || '').trim(),
      address: String(c.address || '').trim(),
      area,
      district: String(c.district || '').trim(),
      thana: String(c.thana || '').trim(),
      note: String(c.note || '').trim(),
    },
    adminNote: String(adminNote || `Manual order entry (${orderSource}) by ${req.admin?.name || 'Admin'}`).trim(),
    items: lines,
    itemsTotal,
    delivery: deliveryFee,
    discount: discountAmt,
    total,
    courier: courier || null,
    history: [
      { status: initialStatus, at: now, note: `Manual order created via ${orderSource === 'whatsapp' ? 'WhatsApp' : orderSource === 'phone_call' ? 'Phone Call' : orderSource} by ${req.admin?.name || 'Admin'}` }
    ],
  };

  addOrder(order);
  cancelDraft(phoneClean);
  try {
    const existingDraft = getOrders().find((o) => o.status === 'incomplete' && o.customer && String(o.customer.phone).replace(/\D/g, '').slice(-11) === phoneClean);
    if (existingDraft) deleteOrder(existingDraft.id);
  } catch (_) {}
  notifyOrder(order, 'placed');
  res.status(201).json(order);
});

app.patch('/api/orders/:id', adminAuth, (req, res) => {
  if (req.admin.role === 'staff') {
    const allowedFields = new Set(['status', 'courier', 'adminNote']);
    const submittedFields = Object.keys(req.body || {});
    if (submittedFields.some((field) => !allowedFields.has(field))) {
      return res.status(403).json({ error: 'Staff can only update order status, courier details, and internal notes' });
    }
    const nextStatus = req.body?.status;
    if (nextStatus && !['pending', 'approved', 'confirmed', 'shipped'].includes(String(nextStatus))) {
      return res.status(403).json({ error: 'Staff cannot cancel, return, or mark an order delivered' });
    }
  }
  const before = getOrders().find((x) => x.id === req.params.id || x.id === 'DOT-' + req.params.id || 'DOT-' + x.id === req.params.id);
  if (!before) return res.status(404).json({ error: 'not found' });
  if (req.admin.role === 'staff' && Array.isArray(req.admin.allowedProducts) && req.admin.allowedProducts.length > 0) {
    const allowed = req.admin.allowedProducts;
    const hasAccess = (before.items || []).some((it) => allowed.includes(String(it.id)) || allowed.includes(String(it.slug)));
    if (!hasAccess) return res.status(403).json({ error: 'You do not have permission for this order' });
  }
  const { status, courier, adminNote, customer, items, delivery, discount, itemsTotal, total, paymentStatus } = req.body || {};
  if (paymentStatus !== undefined && !['paid', 'unpaid'].includes(String(paymentStatus))) {
    return res.status(400).json({ error: 'paymentStatus must be paid or unpaid' });
  }

  const staffInfo = {
    username: req.admin?.username || 'admin',
    name: req.admin?.name || req.admin?.username || 'Staff',
    role: req.admin?.role || 'staff'
  };

  const history = Array.isArray(before.history) ? [...before.history] : [];
  if (status && before.status !== status) {
    history.push({
      status,
      at: new Date().toISOString(),
      note: adminNote || `Status changed from ${before.status} to ${status}`,
      staff: staffInfo
    });
    recordStaffKpiAction(req.admin, 'ORDER_STATUS_CHANGED', {
      orderId: before.id,
      status,
      amount: Number(before.total || 0),
      note: adminNote || ''
    });
  } else if (adminNote && adminNote !== before.adminNote) {
    history.push({
      status: before.status,
      at: new Date().toISOString(),
      note: `Note: ${adminNote}`,
      staff: staffInfo
    });
  }

  const lastUpdatedBy = {
    ...staffInfo,
    at: new Date().toISOString()
  };

  const o = updateOrder(req.params.id, {
    status, courier, adminNote, customer, items, delivery, discount, itemsTotal, total, paymentStatus,
    history,
    lastUpdatedBy
  });
  if (status && before && before.status !== status) notifyOrder(o, 'status');
  res.json(o);
});

app.delete('/api/orders/:id', adminAuth, requireRole('owner', 'manager'), (req, res) => {
  const before = getOrders().find((x) => x.id === req.params.id || x.id === 'DOT-' + req.params.id || 'DOT-' + x.id === req.params.id);
  if (!before) return res.status(404).json({ error: 'not found' });
  if (req.admin.role === 'staff' && Array.isArray(req.admin.allowedProducts) && req.admin.allowedProducts.length > 0) {
    const allowed = req.admin.allowedProducts;
    const hasAccess = (before.items || []).some((it) => allowed.includes(String(it.id)) || allowed.includes(String(it.slug)));
    if (!hasAccess) return res.status(403).json({ error: 'You do not have permission for this order' });
  }
  const ok = deleteOrder(req.params.id);
  res.json({ ok });
});

// ---- admin product management ----
function slugify(s) {
  return String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
function normalizeProduct(b) {
  b = b || {};
  const name = String(b.name || '').trim();
  let images = Array.isArray(b.images) ? b.images.map((s) => String(s).trim()).filter(Boolean) : [];

  // Normalize colors with image and hex (WooCommerce style attributes)
  const colors = Array.isArray(b.colors)
    ? b.colors
        .map((c) => {
          if (typeof c === 'string') return { name: c.trim(), hex: '', image: '' };
          return {
            name: String(c.name || '').trim(),
            hex: String(c.hex || '').trim(),
            image: String(c.image || '').trim(),
          };
        })
        .filter((c) => c.name)
    : [];

  // Normalize variations with size, color, sku, price, stock, and image
  const variations = Array.isArray(b.variations)
    ? b.variations.map((v) => ({
        id: String(v.id || 'v_' + Math.random().toString(36).slice(2, 9)),
        title: String(v.title || '').trim(),
        size: String(v.size || '').trim(),
        color: String(v.color || '').trim(),
        colorHex: String(v.colorHex || '').trim(),
        price: v.price != null && v.price !== '' ? Math.max(0, parseInt(v.price, 10) || 0) : Math.max(0, parseInt(b.price, 10) || 0),
        compareAt: v.compareAt ? Math.max(0, parseInt(v.compareAt, 10) || 0) : 0,
        stock: v.stock === '' || v.stock === null || v.stock === undefined ? null : Math.max(0, parseInt(v.stock, 10) || 0),
        sku: String(v.sku || '').trim(),
        image: String(v.image || '').trim(),
      }))
    : [];

  // Collect any color or variation images into the product gallery
  colors.forEach((c) => {
    if (c.image && !images.includes(c.image)) images.push(c.image);
  });
  variations.forEach((v) => {
    if (v.image && !images.includes(v.image)) images.push(v.image);
  });

  const image = String(b.image || '').trim() || images[0] || '';
  if (image && !images.includes(image)) images.unshift(image);

  return {
    name,
    slug: slugify(b.slug || name),
    price: Math.max(0, parseInt(b.price, 10) || 0),
    compareAt: Math.max(0, parseInt(b.compareAt, 10) || 0),
    category: String(b.category || '').trim(),
    subCategory: String(b.subCategory || '').trim(),
    categories: Array.isArray(b.categories)
      ? Array.from(new Set(b.categories.map((c) => String(c).trim()).filter(Boolean)))
      : (b.subCategory ? [String(b.category).trim(), String(b.subCategory).trim()].filter(Boolean) : [String(b.category).trim()].filter(Boolean)),
    adult: !!b.adult,
    tag: String(b.tag || '').trim(),
    desc: String(b.desc || '').trim(),
    shortDesc: String(b.shortDesc || '').trim(),
    longDesc: String(b.longDesc || '').trim(),
    size: String(b.size || '').trim(),
    sku: String(b.sku || '').trim(),
    weight: String(b.weight || '').trim(),
    seoTitle: String(b.seoTitle || '').trim(),
    seoDesc: String(b.seoDesc || '').trim(),
    customDeliveryInside: b.customDeliveryInside != null && b.customDeliveryInside !== '' ? Number(b.customDeliveryInside) : null,
    customDeliveryOutside: b.customDeliveryOutside != null && b.customDeliveryOutside !== '' ? Number(b.customDeliveryOutside) : null,
    variations,
    colors,
    image,
    images,
    stock: b.stock === '' || b.stock === null || b.stock === undefined ? null : Math.max(0, parseInt(b.stock, 10) || 0),
    lowStockThreshold: b.lowStockThreshold != null && b.lowStockThreshold !== '' ? Math.max(0, parseInt(b.lowStockThreshold, 10)) : 5,
    soldOut: !!b.soldOut,
  };
}

app.post('/api/upload', adminAuth, requireRole('owner', 'manager'), (req, res) => {
  const dataUrl = req.body?.dataUrl || req.body?.image || req.body?.data || '';
  const m = dataUrl.match(/^data:(?:image\/(png|jpe?g|webp|gif|avif|svg\+xml|x-icon|vnd\.microsoft\.icon));base64,(.+)$/i);
  if (!m) return res.status(400).json({ error: 'invalid image' });
  let ext = m[1].toLowerCase();
  if (ext === 'jpeg') ext = 'jpg';
  else if (ext === 'svg+xml') ext = 'svg';
  else if (ext.includes('icon')) ext = 'ico';
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 6 * 1024 * 1024) return res.status(400).json({ error: 'image too large (max 6MB)' });

  // Deduplicate: check if identical image content already exists on disk
  try {
    const hash = createHash('md5').update(buf).digest('hex');
    const existingFiles = readdirSync(UPLOADS).filter((f) => !f.startsWith('.'));
    for (const f of existingFiles) {
      const full = join(UPLOADS, f);
      try {
        const existingBuf = readFileSync(full);
        if (existingBuf.length === buf.length) {
          const existingHash = createHash('md5').update(existingBuf).digest('hex');
          if (existingHash === hash) {
            return res.json({ url: '/uploads/' + f, deduplicated: true });
          }
        }
      } catch {}
    }
  } catch {}

  const nm = 'img_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7) + '.' + ext;
  try { writeFileSync(join(UPLOADS, nm), buf, { flag: 'wx' }); }
  catch (error) { console.error('[Media] Persistent upload failed:', error.message); return res.status(503).json({ error: 'Could not save image to persistent storage.' }); }
  res.json({ url: '/uploads/' + nm });
});

// media / file manager with smart usage tracking & duplicate detection
function getMediaUsageMap() {
  const map = new Map();
  const add = (url, type, id, title) => {
    if (!url || typeof url !== 'string') return;
    const cleanUrl = url.trim();
    const fn = cleanUrl.split('/').pop();
    if (!map.has(cleanUrl)) map.set(cleanUrl, []);
    map.get(cleanUrl).push({ type, id, title });
    if (fn && fn !== cleanUrl) {
      if (!map.has(fn)) map.set(fn, []);
      map.get(fn).push({ type, id, title });
    }
  };

  try {
    const cat = getCatalog();
    (cat.products || []).forEach((p) => {
      if (p.image) add(p.image, 'Product', p.id, p.name);
      if (Array.isArray(p.images)) p.images.forEach((img) => add(img, 'Product', p.id, p.name));
    });
    (cat.categories || []).forEach((c) => {
      if (c.image) add(c.image, 'Category', c.id, c.name);
    });
  } catch {}

  try {
    const landings = getLandings();
    (landings || []).forEach((l) => {
      if (l.heroImage) add(l.heroImage, 'Landing', l.id, l.title);
      if (Array.isArray(l.gallery)) l.gallery.forEach((g) => add(g, 'Landing', l.id, l.title));
      if (Array.isArray(l.variants)) l.variants.forEach((v) => { if (v.image) add(v.image, 'Landing', l.id, `${l.title} (${v.title})`); });
    });
  } catch {}

  try {
    const st = getSettings();
    if (st.logo) add(st.logo, 'Store Logo', 'logo', 'Store Logo');
    if (st.favicon) add(st.favicon, 'Favicon', 'favicon', 'Favicon');
  } catch {}

  try {
    const pp = getPushPopupSettings();
    if (pp.promoPopup?.image) add(pp.promoPopup.image, 'Promo Popup', 'promo', 'Promo Popup Banner');
    if (pp.pushPrompt?.icon) add(pp.pushPrompt.icon, 'Push Prompt', 'push_icon', 'Push Opt-in Icon');
    if (pp.trustToast?.icon) add(pp.trustToast.icon, 'Trust Toast', 'trust_icon', 'Trust Toast Icon');
    (pp.broadcastHistory || []).forEach((b) => {
      if (b.image) add(b.image, 'Push Campaign', b.id || 'bc', b.title || 'Push Broadcast');
    });
  } catch {}

  return map;
}

app.get('/api/admin/media', adminAuth, requireRole('owner', 'manager'), (_q, res) => {
  try {
    const usageMap = getMediaUsageMap();
    const hashGroups = new Map();
    const all = readdirSync(UPLOADS).filter((f) => !f.startsWith('.'));
    const files = all.map((f) => {
      const full = join(UPLOADS, f);
      const st = statSync(full);
      const url = '/uploads/' + f;
      const rawUsage = usageMap.get(url) || usageMap.get(f) || [];
      const usedIn = [];
      const seen = new Set();
      for (const u of rawUsage) {
        const key = `${u.type}:${u.id}`;
        if (!seen.has(key)) { seen.add(key); usedIn.push(u); }
      }

      let hash = '';
      let isDuplicate = false;
      let duplicateOf = '';
      if (st.size > 0 && st.size < 20 * 1024 * 1024) {
        try {
          const buf = readFileSync(full);
          hash = createHash('md5').update(buf).digest('hex');
          if (hashGroups.has(hash)) {
            isDuplicate = true;
            duplicateOf = hashGroups.get(hash);
          } else {
            hashGroups.set(hash, f);
          }
        } catch {}
      }

      return {
        name: f,
        url,
        size: st.size,
        at: st.mtimeMs,
        hash,
        isDuplicate,
        duplicateOf,
        usedCount: usedIn.length,
        usedIn,
        isBroken: st.size === 0,
      };
    }).sort((a, b) => b.at - a.at);
    res.json(files);
  } catch { res.json([]); }
});

app.delete('/api/admin/media/:name', adminAuth, requireRole('owner', 'manager'), (req, res) => {
  const name = String(req.params.name || '');
  if (!/^[\w.\-]+$/.test(name) || name.includes('..')) return res.status(400).json({ error: 'bad filename' });
  if (removeUploadedFile(name)) res.json({ ok: true }); else res.status(404).json({ error: 'not found' });
});

app.post('/api/admin/media/bulk-delete', adminAuth, requireRole('owner', 'manager'), (req, res) => {
  const names = Array.isArray(req.body?.names) ? req.body.names : [];
  let deleted = 0;
  for (const n of names) {
    const name = String(n || '').trim();
    if (/^[\w.\-]+$/.test(name) && !name.includes('..')) {
      if (removeUploadedFile(name)) deleted++;
    }
  }
  res.json({ ok: true, deleted });
});

app.post('/api/admin/media/clean-duplicates', adminAuth, requireRole('owner', 'manager'), (_q, res) => {
  try {
    const usageMap = getMediaUsageMap();
    const hashGroups = new Map();
    const all = readdirSync(UPLOADS).filter((f) => !f.startsWith('.'));
    let deleted = 0;
    const sorted = all.map((f) => ({ f, st: statSync(join(UPLOADS, f)) })).sort((a, b) => a.st.mtimeMs - b.st.mtimeMs);
    for (const { f, st } of sorted) {
      if (st.size === 0) continue;
      try {
        const buf = readFileSync(join(UPLOADS, f));
        const hash = createHash('md5').update(buf).digest('hex');
        if (hashGroups.has(hash)) {
          const used = usageMap.get('/uploads/' + f) || usageMap.get(f) || [];
          if (used.length === 0) {
            removeUploadedFile(f);
            deleted++;
            continue;
          }
        }
        hashGroups.set(hash, f);
      } catch {}
    }
    res.json({ ok: true, deleted });
  } catch (err) { res.status(500).json({ error: String(err.message || err) }); }
});

app.post('/api/admin/media/clean-broken', adminAuth, requireRole('owner', 'manager'), (_q, res) => {
  try {
    const all = readdirSync(UPLOADS).filter((f) => !f.startsWith('.'));
    let deleted = 0;
    for (const f of all) {
      try {
        const st = statSync(join(UPLOADS, f));
        if (st.size === 0) { removeUploadedFile(f); deleted++; }
      } catch {}
    }
    res.json({ ok: true, deleted });
  } catch (err) { res.status(500).json({ error: String(err.message || err) }); }
});

app.post('/api/products', adminAuth, requireRole('owner', 'manager'), (req, res) => {
  const p = normalizeProduct(req.body);
  if (!p.name) return res.status(400).json({ error: 'product name is required' });
  if (!p.price) return res.status(400).json({ error: 'price must be greater than 0' });
  if (!p.category || !getCatalog().categories.some((category) => category.slug === p.category)) return res.status(400).json({ error: 'Select a category created in Category Management.' });
  p.id = 'p' + Date.now().toString(36);
  addProduct(p);
  res.status(201).json(p);
});

app.put('/api/products/:id', adminAuth, requireRole('owner', 'manager'), (req, res) => {
  const p = normalizeProduct(req.body);
  if (!p.name) return res.status(400).json({ error: 'product name is required' });
  const existingProduct = getCatalog().products.find((product) => product.id === req.params.id);
  if (p.category && p.category !== existingProduct?.category && !getCatalog().categories.some((category) => category.slug === p.category)) return res.status(400).json({ error: 'Select a category created in Category Management.' });
  const o = updateProduct(req.params.id, p);
  if (!o) return res.status(404).json({ error: 'not found' });
  res.json(o);
});

app.patch('/api/products/:id/stock', adminAuth, requireRole('owner', 'manager'), (req, res) => {
  const { stock, soldOut, lowStockThreshold } = req.body;
  const patch = {};
  if (stock !== undefined) {
    patch.stock = (stock === null || stock === '' || stock === '∞') ? null : Math.max(0, parseInt(stock, 10) || 0);
  }
  if (soldOut !== undefined) {
    patch.soldOut = !!soldOut;
  }
  if (lowStockThreshold !== undefined) {
    patch.lowStockThreshold = (lowStockThreshold === null || lowStockThreshold === '') ? 5 : Math.max(0, parseInt(lowStockThreshold, 10) || 0);
  }
  const o = updateProduct(req.params.id, patch);
  if (!o) return res.status(404).json({ error: 'not found' });
  res.json(o);
});

app.delete('/api/products/:id', adminAuth, requireRole('owner', 'manager'), (req, res) => {
  if (!deleteProduct(req.params.id)) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

// ---- coupons & reviews ----
function couponFor(code, subtotal, phone) {
  const cleanCode = String(code || '').trim().toUpperCase();
  const c = getCoupons().find((x) => x.code.toUpperCase() === cleanCode && x.active !== false);
  if (!c) return null;
  if (c.minSubtotal && subtotal < c.minSubtotal) return { error: `Add more items to use ${c.code} (minimum ৳${c.minSubtotal})` };

  if (cleanCode === 'WELCOME5' || c.isWelcome) {
    if (!phone) {
      return { error: 'Please enter your 11-digit mobile number to apply the 5% first order discount.' };
    }
    const cleanPhone = String(phone).replace(/\D/g, '').slice(-11);
    const pastOrders = (getOrders() || []).filter((o) => {
      if (o.status === 'cancelled') return false;
      return String(o.customer?.phone || '').replace(/\D/g, '').slice(-11) === cleanPhone;
    });
    const cust = getCustomerByPhone(cleanPhone);
    if (pastOrders.length > 0 || (cust && cust.welcomeCouponUsed)) {
      return { error: 'The 5% welcome code WELCOME5 is only valid for your first order.' };
    }
  }

  let discount = c.type === 'percent' ? Math.round((subtotal * c.value) / 100) : c.value;
  discount = Math.min(discount, subtotal);
  return { code: c.code, type: c.type, value: c.value, discount };
}
app.post('/api/coupon/validate', (req, res) => {
  const r = couponFor(req.body?.code, Math.max(0, parseInt(req.body?.subtotal, 10) || 0), req.body?.phone);
  if (!r) return res.status(404).json({ error: 'invalid or expired code' });
  if (r.error) return res.status(400).json({ error: r.error });
  res.json(r);
});
app.get('/api/coupons', adminAuth, requireRole('owner', 'manager'), (_q, res) => res.json(getCoupons()));
app.post('/api/coupons', adminAuth, requireRole('owner', 'manager'), (req, res) => {
  const b = req.body || {};
  const code = String(b.code || '').trim().toUpperCase();
  if (!code) return res.status(400).json({ error: 'code required' });
  const coupons = getCoupons();
  if (coupons.find((c) => c.code === code)) return res.status(400).json({ error: 'code already exists' });
  const c = { code, type: b.type === 'flat' ? 'flat' : 'percent', value: Math.max(0, parseInt(b.value, 10) || 0), minSubtotal: Math.max(0, parseInt(b.minSubtotal, 10) || 0), active: true };
  coupons.push(c); saveCoupons(coupons); res.status(201).json(c);
});
app.delete('/api/coupons/:code', adminAuth, requireRole('owner', 'manager'), (req, res) => {
  saveCoupons(getCoupons().filter((c) => c.code !== req.params.code));
  res.json({ ok: true });
});
app.get('/api/reviews/:pid', (req, res) => {
  const list = (getReviews()[req.params.pid] || []).filter((review) => !review.status || review.status === 'approved');
  const avg = list.length ? list.reduce((s, r) => s + r.rating, 0) / list.length : 0;
  res.json({ count: list.length, avg: Math.round(avg * 10) / 10, reviews: list });
});
app.get('/api/admin/reviews', adminAuth, requireRole('owner', 'manager'), (req, res) => {
  const all = getReviews();
  const reviews = Object.entries(all).flatMap(([productId, list]) =>
    (Array.isArray(list) ? list : []).map((review) => ({
      ...review,
      productId,
      status: review.status || 'approved',
    }))
  ).sort((a, b) => new Date(b.at || 0).getTime() - new Date(a.at || 0).getTime());
  res.json({ reviews });
});
app.post('/api/reviews', (req, res) => {
  const b = req.body || {};
  const pid = String(b.productId || '').trim();
  const rating = Math.max(1, Math.min(5, parseInt(b.rating, 10) || 0));
  const name = String(b.name || '').trim().slice(0, 40);
  const text = String(b.text || '').trim().slice(0, 500);
  if (!pid || !rating || !name) return res.status(400).json({ error: 'name and rating required' });
  const all = getReviews(); const list = all[pid] || [];
  list.unshift({ id: randomUUID().slice(0, 8), name, rating, text, at: new Date().toISOString(), status: 'pending' });
  all[pid] = list; saveReviews(all);
  res.status(201).json({ ok: true, status: 'pending' });
});
app.patch('/api/admin/reviews/:pid/:id', adminAuth, requireRole('owner', 'manager'), (req, res) => {
  const body = req.body || {};
  const hasStatus = Object.prototype.hasOwnProperty.call(body, 'status');
  const hasReply = Object.prototype.hasOwnProperty.call(body, 'adminReply');
  const status = String(body.status || '');
  if (!hasStatus && !hasReply) return res.status(400).json({ error: 'status or adminReply required' });
  if (hasStatus && !['approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'status must be approved or rejected' });
  if (hasReply && typeof body.adminReply !== 'string') return res.status(400).json({ error: 'adminReply must be text' });
  const all = getReviews();
  const list = all[req.params.pid] || [];
  const review = list.find((item) => item.id === req.params.id);
  if (!review) return res.status(404).json({ error: 'review not found' });
  if (hasStatus) review.status = status;
  if (hasReply) review.adminReply = body.adminReply.trim().slice(0, 2000);
  all[req.params.pid] = list;
  saveReviews(all);
  res.json({ ok: true, ...(hasStatus ? { status } : {}), ...(hasReply ? { adminReply: review.adminReply } : {}) });
});
app.delete('/api/reviews/:pid/:id', adminAuth, requireRole('owner', 'manager'), (req, res) => {
  const all = getReviews(); all[req.params.pid] = (all[req.params.pid] || []).filter((r) => r.id !== req.params.id); saveReviews(all); res.json({ ok: true });
});

// ---- admin category management ----
function normalizeCategory(b) {
  b = b || {};
  const name = String(b.name || '').trim();
  return { slug: slugify(b.slug || name), name, adult: !!b.adult, blurb: String(b.blurb || '').trim(), image: String(b.image || '').trim() };
}
app.post('/api/categories', adminAuth, requireRole('owner', 'manager'), (req, res) => {
  const c = normalizeCategory(req.body);
  if (!c.name || !c.slug) return res.status(400).json({ error: 'category name is required' });
  if (!addCategory(c)) return res.status(400).json({ error: 'category already exists' });
  res.status(201).json(c);
});
app.put('/api/categories/:slug', adminAuth, requireRole('owner', 'manager'), (req, res) => {
  const c = normalizeCategory(req.body);
  const r = updateCategory(req.params.slug, { name: c.name, adult: c.adult, blurb: c.blurb, image: c.image });
  if (!r) return res.status(404).json({ error: 'not found' });
  res.json(r);
});
app.delete('/api/categories/:slug', adminAuth, requireRole('owner', 'manager'), (req, res) => {
  if (!deleteCategory(req.params.slug)) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

// ---- landing pages management ----
app.get('/api/landings', (_req, res) => {
  res.json(getLandings());
});

app.get('/api/landings/:slug', (req, res) => {
  const landing = getLandingBySlug(req.params.slug);
  if (!landing) return res.status(404).json({ error: 'landing page not found' });
  res.json(landing);
});

app.post('/api/landings', adminAuth, requireRole('owner', 'manager'), (req, res) => {
  const b = req.body || {};
  const title = String(b.title || '').trim();
  if (!title) return res.status(400).json({ error: 'Landing title is required' });
  const slug = slugify(b.slug || title);
  const landing = {
    ...b,
    id: b.id || 'landing_' + Date.now().toString(36),
    title,
    slug,
    status: b.status === 'draft' ? 'draft' : 'live',
  };
  addLanding(landing);
  res.status(201).json(landing);
});

app.put('/api/landings/:id', adminAuth, requireRole('owner', 'manager'), (req, res) => {
  const updated = updateLanding(req.params.id, req.body || {});
  if (!updated) return res.status(404).json({ error: 'Landing page not found' });
  res.json(updated);
});

app.delete('/api/landings/:id', adminAuth, requireRole('owner', 'manager'), (req, res) => {
  if (!deleteLanding(req.params.id)) return res.status(404).json({ error: 'Landing page not found' });
  res.json({ ok: true });
});

// ---- self-hosted web push & smart on-site pop-ups ----
app.get('/api/notifications/public', (_req, res) => {
  const s = getPushPopupSettings();
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.json({
    vapidPublicKey: getVapidPublicKey(),
    promoPopup: s.promoPopup,
    pushPrompt: s.pushPrompt,
    trustToast: s.trustToast,
  });
});

app.post('/api/push/subscribe', (req, res) => {
  try {
    const b = req.body || {};
    const did = String(b.deviceId || req.get('x-device-id') || '').slice(0, 80);
    const stats = upsertPushSubscriber({
      subscription: b.subscription,
      deviceId: did,
      phone: b.phone || '',
      isAdmin: false,
      userAgent: req.get('user-agent') || '',
    });
    res.json({ ok: true, total: stats.total });
  } catch (err) {
    res.status(400).json({ error: String(err?.message || 'Subscription failed') });
  }
});

app.post('/api/push/unsubscribe', (req, res) => {
  const endpoint = String(req.body?.endpoint || '');
  removePushSubscriber(endpoint);
  res.json({ ok: true });
});

app.post('/api/push/link-phone', (req, res) => {
  const did = String(req.body?.deviceId || req.get('x-device-id') || '').slice(0, 80);
  const phone = String(req.body?.phone || '');
  const linked = linkSubscriberPhone(did, phone);
  res.json({ ok: true, linked });
});

app.get('/api/admin/notifications', adminAuth, requireRole('owner', 'manager'), (_req, res) => {
  res.json({
    vapidPublicKey: getVapidPublicKey(),
    settings: getPushPopupSettings(),
    stats: getPushSubscriberStats(),
  });
});

app.put('/api/admin/notifications', adminAuth, requireRole('owner', 'manager'), (req, res) => {
  const b = req.body || {};
  const resetPromo = !!b.resetPromoDismissals;
  const settings = savePushPopupSettings(
    {
      promoPopup: b.promoPopup,
      pushPrompt: b.pushPrompt,
      autoAlerts: b.autoAlerts,
      trustToast: b.trustToast,
    },
    resetPromo
  );
  res.json({ ok: true, settings, stats: getPushSubscriberStats() });
});

app.post('/api/admin/push/subscribe-admin', adminAuth, requireRole('owner', 'manager'), (req, res) => {
  try {
    const b = req.body || {};
    const did = String(b.deviceId || req.get('x-device-id') || '').slice(0, 80);
    const stats = upsertPushSubscriber({
      subscription: b.subscription,
      deviceId: did,
      isAdmin: true,
      userAgent: req.get('user-agent') || '',
    });
    res.json({ ok: true, stats });
  } catch (err) {
    res.status(400).json({ error: String(err?.message || 'Could not enable admin push alerts') });
  }
});

app.post('/api/admin/push/broadcast', adminAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const b = req.body || {};
    const result = await sendBroadcastPush({
      title: b.title,
      body: b.body,
      image: b.image,
      icon: b.icon,
      url: b.url,
      target: b.target === 'admin_test' ? 'admin_test' : 'all',
      adminEndpoint: b.adminEndpoint || '',
    });
    res.json({
      ...result,
      stats: getPushSubscriberStats(),
      broadcastHistory: getPushPopupSettings().broadcastHistory,
    });
  } catch (err) {
    res.status(400).json({ error: String(err?.message || 'Broadcast failed') });
  }
});

// ---- integrations: email (SMTP), bulk SMS (generic HTTP), couriers (generic templated API) ----
function fillTpl(tpl, map) { return String(tpl || '').replace(/\{(\w+)\}/g, (_, k) => (map[k] != null ? String(map[k]) : '')); }
async function sendEmail(to, subject, html) {
  const e = getIntegrations().email;
  if (!e || !e.enabled) return { ok: false, error: 'email not configured or disabled' };
  const st = getSettings() || {};
  const defaultBrand = (st.storeName && st.storeName !== 'dot.') ? st.storeName : 'METRROMA';
  const fromName = (e.fromName && e.fromName !== 'dot.') ? e.fromName : defaultBrand;

  const hasSmtp = !!(e.host && e.user && e.pass);
  const hasResend = !!(e.resendApiKey || process.env.RESEND_API_KEY);

  const trySmtp = async () => {
    const host = String(e.host || '').trim();
    const user = String(e.user || '').trim();
    const isGmail = host.toLowerCase().includes('gmail.com');
    const pass = isGmail ? String(e.pass || '').replace(/\s+/g, '') : String(e.pass || '');
    const port = Number(e.port) || (isGmail ? 465 : 587);
    const secure = port === 465 ? true : !!e.secure;
    const senderAddr = (isGmail || !e.fromEmail || e.fromEmail.includes('dot.metromaa.com')) ? user : e.fromEmail;
    try {
      const tx = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user, pass },
      });
      await tx.sendMail({
        from: `"${fromName}" <${senderAddr}>`,
        to,
        subject,
        html,
      });
      return { ok: true, via: 'smtp' };
    } catch (err) {
      return { ok: false, error: String(err?.message || err) };
    }
  };

  const tryResend = async () => {
    const key = e.resendApiKey || process.env.RESEND_API_KEY;
    if (!key) return { ok: false, error: 'Resend API key missing' };
    let from = e.fromEmail ? `"${fromName}" <${e.fromEmail}>` : `"${fromName}" <onboarding@resend.dev>`;
    try {
      let r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to, subject, html }),
      });
      let d = await r.json();
      if (!r.ok && d?.message && (d.message.includes('domain is not verified') || d.message.includes('not verified') || d.message.includes('validation_error'))) {
        from = `"${fromName}" <onboarding@resend.dev>`;
        r = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from, to, subject, html }),
        });
        d = await r.json();
      }
      if (!r.ok) return { ok: false, error: d?.message || 'Resend delivery failed' };
      return { ok: true, id: d?.id, via: 'resend' };
    } catch (err) {
      return { ok: false, error: String(err?.message || err) };
    }
  };

  // Respect explicit SMTP selection first
  if (e.provider === 'smtp') {
    if (hasSmtp) {
      const smtpRes = await trySmtp();
      if (smtpRes.ok || !hasResend) return smtpRes;
    }
    if (hasResend) return await tryResend();
    return { ok: false, error: 'SMTP host, email, and App Password are required' };
  }

  // Otherwise try Resend first, and automatically fall back to SMTP if Resend is in sandbox/unverified mode
  if (hasResend) {
    const resendRes = await tryResend();
    if (resendRes.ok) return resendRes;
    if (hasSmtp) {
      const smtpFallback = await trySmtp();
      if (smtpFallback.ok) return smtpFallback;
    }
    return resendRes;
  }

  if (hasSmtp) return await trySmtp();
  return { ok: false, error: 'Email provider not configured' };
}
async function sendSMS(phone, message) {
  const s = getIntegrations().sms;
  if (!s.enabled || !s.url) return { ok: false, error: 'sms not configured' };
  const url = fillTpl(s.url, { phone: encodeURIComponent(phone), msg: encodeURIComponent(message), message: encodeURIComponent(message), apiKey: encodeURIComponent(s.apiKey || ''), senderId: encodeURIComponent(s.senderId || '') });
  try {
    const r = await fetch(url, { method: (s.method || 'GET').toUpperCase() });
    const text = await r.text();
    return { ok: r.ok, status: r.status, body: text.slice(0, 300) };
  } catch (err) { return { ok: false, error: String(err.message || err) }; }
}
async function notifyOrder(o, kind) {
  try {
    const ig = getIntegrations();
    const map = { id: o.id, total: '৳' + o.total, status: o.status, name: o.customer?.name || '', phone: o.customer?.phone || '', track: o.id, courier: o.courier?.name ? `${o.courier.name} ${o.courier.consignment || ''}`.trim() : '' };
    if (ig.sms.enabled && o.customer?.phone) {
      const tpl = kind === 'placed' ? ig.sms.templatePlaced : ig.sms.templateStatus;
      sendSMS(o.customer.phone, fillTpl(tpl, map)).catch(() => {});
    }
    if (ig.email.enabled && o.customer?.email) {
      const subj = kind === 'placed' ? `METRROMA — order ${o.id} received` : `METRROMA — order ${o.id} is ${o.status}`;
      sendEmail(o.customer.email, subj, `<p>Hi ${map.name},</p><p>Your order <b>${o.id}</b> is <b>${o.status}</b>.</p><p>Total: ${map.total} (cash on delivery)</p>${map.courier ? `<p>Courier: ${map.courier}</p>` : ''}<p>— dot.</p>`).catch(() => {});
    }
    // Automated WhatsApp message
    try {
      let waEvent = kind === 'exchange' ? 'exchange' : o.status === 'incomplete' ? 'incomplete' : o.status === 'approved' ? 'approved' : o.status === 'shipped' ? (o.isExchange ? 'exchange' : 'shipped') : o.status === 'delivered' ? 'delivered' : o.status === 'cancelled' ? 'cancelled' : null;
      
      // 24/7 Automated Interactive Order Confirmation (Day & Night with anti-ban natural delay)
      if (kind === 'placed') {
        const waCfg = getWhatsAppSettings()?.triggers?.night_confirmation || {};
        const isEnabled = waCfg.enabled !== false;
        if (isEnabled) {
          const delayMin = Math.max(1, Math.min(30, Number(waCfg.delayMinutes) || 1));
          const delayMs = (delayMin * 60 * 1000) + Math.floor(Math.random() * 25000);
          console.log(`[Order Confirmation Anti-Ban] Order #${o.id} message scheduled in ${(delayMs / 1000).toFixed(0)}s...`);
          setTimeout(() => {
            sendWhatsAppNotification(o, 'night_confirmation').then((res) => {
              if (res?.sent !== false) {
                try {
                  const ords = getOrders();
                  const target = ords.find((x) => x.id === o.id);
                  if (target) {
                    target.nightConfirmationSent = true;
                    target.nightConfirmationSentAt = new Date().toISOString();
                    target.history = target.history || [];
                    target.history.push({
                      status: target.status,
                      note: `Interactive order confirmation WhatsApp sent (after ${(delayMs / 1000).toFixed(0)}s anti-ban delay)`,
                      at: new Date().toISOString(),
                    });
                    saveOrders(ords);
                  }
                } catch (_) {}
              }
            }).catch(() => {});
          }, delayMs);
          return;
        }
      }

      if (waEvent) {
        sendWhatsAppNotification(o, waEvent).then((res) => {
          if (waEvent === 'night_confirmation' && res?.sent !== false) {
            try {
              const ords = getOrders();
              const target = ords.find((x) => x.id === o.id);
              if (target) {
                target.nightConfirmationSent = true;
                target.nightConfirmationSentAt = new Date().toISOString();
                target.history = target.history || [];
                target.history.push({
                  status: target.status,
                  note: 'Night order confirmation message sent via WhatsApp (11 PM - 8 AM)',
                  at: new Date().toISOString(),
                });
                saveOrders(ords);
              }
            } catch (_) {}
          }
        }).catch(() => {});
      }
    } catch (_) {}
    // Automated Web Push Notification (Admin New Order + Discreet Customer Status)
    try {
      sendOrderPushNotifications(o, kind).catch(() => {});
    } catch (_) {}
  } catch {}
}
const pathaoTokenCache = new Map(); // accId -> { token, expiresAt }
async function getPathaoToken(acc) {
  const cached = pathaoTokenCache.get(acc.id);
  if (cached && cached.expiresAt > Date.now() + 60000) {
    return cached.token;
  }
  const clientId = acc.clientId || acc.apiKey;
  const clientSecret = acc.clientSecret || acc.apiSecret;
  const username = acc.username || acc.email;
  const password = acc.password;

  if (!clientId || !clientSecret || !username || !password) {
    throw new Error('Pathao credentials incomplete (need Client ID, Client Secret, Email, Password)');
  }

  const r = await fetch('https://api-hermes.pathao.com/aladdin/api/v1/issue-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'password',
      username,
      password,
    }),
  });
  const data = await r.json();
  if (!r.ok || !data.access_token) {
    throw new Error(data.message || data.error || 'Failed to authenticate with Pathao');
  }
  const expiresAt = Date.now() + (Number(data.expires_in) || 2592000) * 1000;
  pathaoTokenCache.set(acc.id, { token: data.access_token, expiresAt });
  return data.access_token;
}

function cleanBDPhone(phone) {
  const banglaDigits = { '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4', '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9' };
  let p = String(phone || '').replace(/[০-৯]/g, (d) => banglaDigits[d] || d).replace(/[^0-9]/g, '');
  if (p.startsWith('880')) p = p.slice(2);
  else if (p.startsWith('88')) p = p.slice(2);
  if (!p.startsWith('0') && p.length === 10 && p.startsWith('1')) p = '0' + p;
  return p;
}

function sanitizeCredential(name, val) {
  const s = String(val || '').trim();
  if (!s) return '';
  if (/[\u2022\u25cf\u2219\u00b7]/.test(s)) {
    throw new Error(`Masked bullet dots (••••••) detected in ${name}. Please re-paste the actual unmasked key from your merchant panel.`);
  }
  if (!/^[\x20-\x7E]*$/.test(s)) {
    throw new Error(`Invalid non-ASCII characters in ${name}. Only standard alphanumeric characters are allowed.`);
  }
  return s;
}

function getCourierTrackUrl(acc, consignment, phone) {
  if (!consignment) return '';
  const prov = String(acc?.provider || '').toLowerCase();
  if (prov === 'pathao') {
    const p = phone ? cleanBDPhone(phone) : '';
    return `https://merchant.pathao.com/tracking?consignment_id=${encodeURIComponent(consignment)}${p ? `&phone=${encodeURIComponent(p)}` : ''}`;
  }
  if (prov === 'steadfast') return `https://steadfast.com.bd/track/${encodeURIComponent(consignment)}`;
  if (prov === 'carrybee') return `https://carrybee.com/tracking?consignment_id=${encodeURIComponent(consignment)}`;
  if (prov === 'redx') return `https://redx.com.bd/track-global-parcel/?trackingId=${encodeURIComponent(consignment)}`;
  return acc?.trackUrl ? fillTpl(acc.trackUrl, { consignment, phone: phone || '' }) : '';
}

function resolveItemSku(it, order) {
  if (it?.sku && String(it.sku).trim()) return String(it.sku).trim();
  const catalog = getCatalog()?.products || [];
  const cleanId = String(it?.id || '').trim();
  const baseId = it?.productId || (cleanId.startsWith('mm-') ? cleanId.split('-').slice(0, 2).join('-') : cleanId);
  const p = catalog.find((x) => x.id === cleanId || x.id === baseId || x.slug === cleanId);
  if (p) {
    if (it?.variantId && Array.isArray(p.variations)) {
      const v = p.variations.find((x) => x.id === it.variantId);
      if (v?.sku && String(v.sku).trim()) return String(v.sku).trim();
    }
    if (p.sku && String(p.sku).trim()) return String(p.sku).trim();
  }
  if (order?.landing) {
    const landings = getLandings() || [];
    const lp = landings.find((l) => l.slug === order.landing);
    if (lp) {
      if (Array.isArray(lp.packages)) {
        const pk = lp.packages.find((k) => k.id === cleanId || k.title === it?.name);
        if (pk?.sku && String(pk.sku).trim()) return String(pk.sku).trim();
      }
      if (lp.sku && String(lp.sku).trim()) return String(lp.sku).trim();
    }
  }
  if (order?.landing) {
    return `${order.landing.toUpperCase().replace(/[^A-Z0-9]/g, '')}-${String(cleanId || '01').slice(-4)}`;
  }
  return `SKU-${String(cleanId || '01').replace(/^mm-|^prod-/, '').toUpperCase()}`;
}

function getOrderCourierSkuSummary(order) {
  const items = Array.isArray(order?.items) ? order.items : [];
  if (!items.length) return 'SKU-PARCEL';
  return items.map((it) => `${resolveItemSku(it, order)} x${it.qty || 1}`).join(', ');
}

async function bookCourier(acc, o) {
  if (!acc) return { ok: false, error: 'Courier account not found' };
  const prov = String(acc.provider || '').toLowerCase();
  const codAmount = o.paymentStatus === 'paid' ? 0 : Number(o.total || 0);

  // 1. PATHAO
  if (prov === 'pathao' || (acc.clientId && acc.username)) {
    try {
      const token = await getPathaoToken(acc);
      const storeId = parseInt(acc.storeId || acc.apiSecret, 10);
      if (!storeId) {
        return { ok: false, error: 'Pathao Store ID is missing. Please enter your Store ID in Integrations.' };
      }
      const cleanOrderId = String(o.id || Date.now()).replace(/^#/, '').trim();
      const body = {
        store_id: storeId,
        merchant_order_id: cleanOrderId,
        recipient_name: o.customer?.name || 'Customer',
        recipient_phone: cleanBDPhone(o.customer?.phone),
        recipient_address: o.customer?.address || 'N/A',
        recipient_city: parseInt(acc.cityId || '1', 10),
        recipient_zone: parseInt(acc.zoneId || '1', 10),
        delivery_type: 48,
        item_type: 2,
        special_instruction: [o.isExchange ? '[EXCHANGE PARCEL] কাস্টমার থেকে আগের পার্সেলটি রিসিভ করে এই নতুন পার্সেল দিন' : '', o.customer?.note, `SKU: ${getOrderCourierSkuSummary(o)}`].filter(Boolean).join(' | '),
        item_quantity: 1,
        item_weight: 0.5,
        amount_to_collect: codAmount,
        item_description: getOrderCourierSkuSummary(o),
      };
      const r = await fetch('https://api-hermes.pathao.com/aladdin/api/v1/orders', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      const consignment = data?.data?.consignment_id || data?.consignment_id || '';
      if (!r.ok || !consignment) {
        return { ok: false, error: data.message || JSON.stringify(data.errors || data) };
      }
      return { ok: true, status: 200, consignment, trackUrl: getCourierTrackUrl(acc, consignment, o?.customer?.phone), body: JSON.stringify(data) };
    } catch (err) {
      return { ok: false, error: String(err.message || err) };
    }
  }

  // 2. STEADFAST
  if (prov === 'steadfast') {
    const apiKey = acc.apiKey;
    const secretKey = acc.apiSecret || acc.secretKey;
    if (!apiKey || !secretKey) {
      return { ok: false, error: 'Steadfast API Key and Secret Key are required. Please configure in Integrations.' };
    }
    let url = acc.bookUrl || 'https://portal.packzy.com/api/v1/create_order';
    if (url.includes('portal.steadfast.com.bd')) {
      url = url.replace('portal.steadfast.com.bd', 'portal.packzy.com');
    }
    const cleanInvoice = String(o.id || Date.now()).replace(/^#/, '').trim();
    const rawAddr = String(o.customer?.address || '').trim();
    const fullAddr = rawAddr.length < 10 
      ? [rawAddr, o.customer?.district || 'Dhaka City'].filter(Boolean).join(', ') 
      : rawAddr;
    const body = {
      invoice: cleanInvoice,
      recipient_name: o.customer?.name || 'Customer',
      recipient_phone: cleanBDPhone(o.customer?.phone),
      recipient_address: fullAddr || 'Dhaka City, Dhaka',
      cod_amount: codAmount,
      note: [o.isExchange ? '[EXCHANGE PARCEL] কাস্টমার থেকে আগের পার্সেল রিসিভ করে এই নতুন পার্সেল দিন' : '', o.customer?.note, `SKU: ${getOrderCourierSkuSummary(o)}`].filter(Boolean).join(' | '),
    };
    try {
      let r;
      try {
        r = await fetch(url, {
          method: 'POST',
          headers: {
            'Api-Key': apiKey,
            'Secret-Key': secretKey,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify(body),
        });
      } catch (fErr) {
        if (!url.includes('portal.packzy.com')) {
          r = await fetch('https://portal.packzy.com/api/v1/create_order', {
            method: 'POST',
            headers: {
              'Api-Key': apiKey,
              'Secret-Key': secretKey,
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
            body: JSON.stringify(body),
          });
        } else {
          throw fErr;
        }
      }
      const text = await r.text();
      let data; try { data = JSON.parse(text); } catch { data = {}; }
      if (text.includes('Account is not active') || data?.message === 'Account is not active!') {
        return { ok: false, error: 'Steadfast account is not active! Please activate your merchant account in the Steadfast courier portal.' };
      }
      const consignment = String(data?.consignment?.consignment_id || data?.consignment?.tracking_code || data?.tracking_code || data?.consignment_id || '').trim();
      if (!r.ok || !consignment || data.status === 400 || data.status === 401) {
        return { ok: false, error: data.message || (data.errors ? JSON.stringify(data.errors) : text.slice(0, 300)) };
      }
      return { ok: true, status: 200, consignment, trackUrl: getCourierTrackUrl(acc, consignment, o?.customer?.phone), body: text.slice(0, 400) };
    } catch (err) {
      return { ok: false, error: String(err.message || err) };
    }
  }

  // 3. CARRYBEE
  if (prov === 'carrybee') {
    const clientId = acc.clientId || acc.apiKey;
    const clientSecret = acc.clientSecret || acc.apiSecret;
    const clientContext = acc.clientContext || '';
    if (!clientId || !clientSecret) {
      return { ok: false, error: 'CarryBee Client ID and Client Secret are required.' };
    }
    const baseUrl = acc.baseUrl || (acc.environment === 'sandbox' ? 'https://sandbox.carrybee.com' : 'https://developers.carrybee.com');
    const storeId = parseInt(acc.storeId || '1', 10);
    const cleanOrderId = String(o.id || Date.now()).replace(/^#/, '').trim();

    // 3a. Resolve city_id and zone_id dynamically via CarryBee address resolution API
    let cityId = parseInt(acc.cityId, 10) || 0;
    let zoneId = parseInt(acc.zoneId, 10) || 0;

    const rawAddr = String(o.customer?.address || '').trim();
    const district = String(o.customer?.district || '').trim();
    const city = String(o.customer?.city || '').trim();
    const queryAddress = [rawAddr, district, city].filter(Boolean).join(', ') || 'Dhaka';

    if (!cityId || !zoneId) {
      try {
        const addrRes = await fetch(`${baseUrl}/api/v2/address-details`, {
          method: 'POST',
          headers: {
            'Client-ID': clientId,
            'Client-Secret': clientSecret,
            'Client-Context': clientContext,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({ query: queryAddress.length < 7 || queryAddress.toLowerCase() === 'dhaka' ? `${queryAddress}, Dhaka City` : queryAddress }),
        });
        const addrData = await addrRes.json();
        if (addrData && !addrData.error && addrData.data?.city_id && addrData.data?.zone_id) {
          cityId = parseInt(addrData.data.city_id, 10);
          zoneId = parseInt(addrData.data.zone_id, 10);
        } else if (addrRes.status === 422) {
          const retryRes = await fetch(`${baseUrl}/api/v2/address-details`, {
            method: 'POST',
            headers: {
              'Client-ID': clientId,
              'Client-Secret': clientSecret,
              'Client-Context': clientContext,
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
            body: JSON.stringify({ query: `${queryAddress}, Dhaka City` }),
          });
          const retryData = await retryRes.json();
          if (retryData && !retryData.error && retryData.data?.city_id && retryData.data?.zone_id) {
            cityId = parseInt(retryData.data.city_id, 10);
            zoneId = parseInt(retryData.data.zone_id, 10);
          }
        }
      } catch (err) {
        console.warn('[CarryBee] Address lookup warning:', err.message);
      }
    }

    // Fallback if still unassigned: Dhaka City (city_id: 14, zone_id: 5)
    if (!cityId || !zoneId) {
      const lowerAll = (queryAddress + ' ' + district).toLowerCase();
      if (lowerAll.includes('chittagong') || lowerAll.includes('chattogram')) {
        cityId = 10; zoneId = 521;
      } else if (lowerAll.includes('sylhet')) {
        cityId = 62; zoneId = 542;
      } else {
        cityId = 14; zoneId = 5;
      }
    }

    // Weight in grams (integer, minimum 100g, default 500g)
    const rawWeight = Number(o.weight || 0.5);
    const weightInGrams = rawWeight > 10 ? Math.round(rawWeight) : Math.round(rawWeight * 1000);
    const itemWeight = Math.max(100, weightInGrams || 500);

    const body = {
      store_id: storeId,
      merchant_order_id: cleanOrderId,
      delivery_type: 1,
      product_type: 1,
      recipient_phone: cleanBDPhone(o.customer?.phone),
      recipient_name: o.customer?.name || 'Customer',
      recipient_address: queryAddress.length < 10 ? `${queryAddress}, Dhaka City` : queryAddress,
      city_id: cityId,
      zone_id: zoneId,
      item_weight: itemWeight,
      item_quantity: 1,
      collectable_amount: codAmount,
      product_description: getOrderCourierSkuSummary(o),
    };

    try {
      const r = await fetch(`${baseUrl}/api/v2/orders`, {
        method: 'POST',
        headers: {
          'Client-ID': clientId,
          'Client-Secret': clientSecret,
          'Client-Context': clientContext,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(body),
      });
      const text = await r.text();
      let data; try { data = JSON.parse(text); } catch { data = {}; }
      const consignment = String(data?.data?.order?.consignment_id || data?.data?.consignment_id || data?.consignment_id || data?.order_id || '').trim();
      if (!r.ok || !consignment || data.error) {
        return { ok: false, error: data.message || (data.errors ? JSON.stringify(data.errors) : text.slice(0, 300)) };
      }
      return { ok: true, status: 200, consignment, trackUrl: getCourierTrackUrl(acc, consignment, o?.customer?.phone), body: text.slice(0, 400) };
    } catch (err) {
      return { ok: false, error: String(err.message || err) };
    }
  }

  // 4. REDX
  if (prov === 'redx') {
    const token = acc.apiKey || acc.token;
    if (!token) {
      return { ok: false, error: 'RedX API Access Token is required.' };
    }
    const authHeader = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
    const baseUrl = acc.environment === 'sandbox' ? 'https://sandbox.redx.com.bd' : 'https://openapi.redx.com.bd';
    const url = acc.bookUrl || `${baseUrl}/v1.0.0-beta/parcel`;
    const cleanInvoice = String(o.id || Date.now()).replace(/^#/, '').trim();
    const body = {
      customer_name: o.customer?.name || 'Customer',
      customer_phone: cleanBDPhone(o.customer?.phone),
      customer_address: o.customer?.address || 'N/A',
      merchant_invoice_id: cleanInvoice,
      cash_collection_amount: codAmount,
      parcel_weight: 500,
      instruction: o.customer?.note || 'Deliver discreetly',
      ...(acc.storeId ? { pickup_store_id: parseInt(acc.storeId, 10) } : {}),
    };
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: {
          'API-ACCESS-TOKEN': authHeader,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(body),
      });
      const text = await r.text();
      let data; try { data = JSON.parse(text); } catch { data = {}; }
      const consignment = String(data?.tracking_id || data?.data?.tracking_id || '').trim();
      if (!r.ok || !consignment) {
        return { ok: false, error: data.message || (data.errors ? JSON.stringify(data.errors) : text.slice(0, 300)) };
      }
      return { ok: true, status: 200, consignment, trackUrl: getCourierTrackUrl(acc, consignment, o?.customer?.phone), body: text.slice(0, 400) };
    } catch (err) {
      return { ok: false, error: String(err.message || err) };
    }
  }

  // 5. CUSTOM / GENERIC FALLBACK
  if (!acc.bookUrl) return { ok: false, error: 'This courier account has no booking URL configured.' };
  const map = { name: o.customer?.name || '', phone: cleanBDPhone(o.customer?.phone), address: o.customer?.address || '', amount: codAmount, cod: codAmount, invoice: o.id, id: o.id, note: o.customer?.note || '', apiKey: acc.apiKey || '', apiSecret: acc.apiSecret || '', items: getOrderCourierSkuSummary(o) };
  let headers = { 'Content-Type': 'application/json' };
  try { if (acc.bookHeaders) headers = { ...headers, ...JSON.parse(fillTpl(acc.bookHeaders, map)) }; } catch {}
  const method = (acc.bookMethod || 'POST').toUpperCase();
  const body = acc.bookBody ? fillTpl(acc.bookBody, map) : JSON.stringify({ invoice: o.id, recipient_name: map.name, recipient_phone: map.phone, recipient_address: map.address, cod_amount: map.amount });
  try {
    const r = await fetch(fillTpl(acc.bookUrl, map), { method, headers, body: method === 'GET' ? undefined : body });
    const text = await r.text();
    let data; try { data = JSON.parse(text); } catch { data = {}; }
    let consignment = '';
    if (acc.consignmentPath) consignment = acc.consignmentPath.split('.').reduce((v, k) => (v == null ? v : v[k]), data);
    consignment = String(consignment || data.consignment_id || data.tracking_code || data.consignment || '');
    return { ok: r.ok, status: r.status, consignment, trackUrl: getCourierTrackUrl(acc, consignment, o?.customer?.phone), body: text.slice(0, 400) };
  } catch (err) { return { ok: false, error: String(err.message || err) }; }
}

function mapCourierStatus(raw) {
  const s = String(raw || '').toLowerCase().trim().replace(/[\s-]+/g, '_');
  if (!s) return '';
  if (['delivered', 'successful', 'complete', 'completed', 'paid', 'customer_confirmed'].includes(s)) return 'delivered';
  if (['return', 'returned', 'return_received', 'partial_delivered', 'rto', 'lost', 'damaged', 'delivery_failed', 'failed'].includes(s)) return 'return';
  if (['cancelled', 'canceled', 'cancel', 'rejected'].includes(s)) return 'cancelled';
  if (['hold', 'on_hold', 'rescheduled', 'delayed', 'pending_delivery'].includes(s)) return 'hold';
  if (['shipped', 'in_transit', 'picked', 'picked_up', 'out_for_delivery', 'dispatched', 'at_hub', 'intransit', 'assigned', 'delivery_in_progress', 'at_the_sorting_hub', 'received_at_last_mile_hub', 'assigned_for_delivery', 'pickup', 'pickup_requested', 'pickup_pending', 'pickup_assigned', 'assigned_for_pickup'].includes(s)) return 'shipped';
  if (['confirmed', 'accepted', 'approved', 'in_review'].includes(s)) return 'confirmed';
  return '';
}

async function courierStatus(acc, consignment) {
  if (!consignment) return { ok: false, error: 'No consignment id' };
  const prov = String(acc.provider || '').toLowerCase();

  // 1. PATHAO
  if (prov === 'pathao' || acc.clientId && acc.username) {
    try {
      const token = await getPathaoToken(acc);
      const r = await fetch(`https://api-hermes.pathao.com/aladdin/api/v1/orders/${consignment}/info`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
      });
      const data = await r.json();
      const raw = data?.data?.order_status || data?.order_status || '';
      return { ok: r.ok, raw, mapped: mapCourierStatus(raw), riderNote: data?.data?.status_reason || '' };
    } catch (err) {
      return { ok: false, error: String(err.message || err) };
    }
  }

  // 2. STEADFAST
  if (prov === 'steadfast') {
    try {
      const apiKey = acc.apiKey;
      const secretKey = acc.apiSecret || acc.secretKey;
      let r;
      try {
        r = await fetch(`https://portal.packzy.com/api/v1/status_by_cid/${consignment}`, {
          headers: { 'Api-Key': apiKey, 'Secret-Key': secretKey, 'Accept': 'application/json' },
        });
      } catch {
        r = await fetch(`https://portal.steadfast.com.bd/api/v1/status_by_cid/${consignment}`, {
          headers: { 'Api-Key': apiKey, 'Secret-Key': secretKey, 'Accept': 'application/json' },
        });
      }
      const data = await r.json();
      const raw = data?.delivery_status || data?.status || '';
      return { ok: r.ok, raw, mapped: mapCourierStatus(raw), riderNote: data?.note || '' };
    } catch (err) {
      return { ok: false, error: String(err.message || err) };
    }
  }

  // 3. CARRYBEE
  if (prov === 'carrybee') {
    try {
      const baseUrl = acc.baseUrl || (acc.environment === 'sandbox' ? 'https://sandbox.carrybee.com' : 'https://developers.carrybee.com');
      const r = await fetch(`${baseUrl}/api/v2/orders/${consignment}/details`, {
        headers: {
          'Client-ID': acc.clientId || acc.apiKey,
          'Client-Secret': acc.clientSecret || acc.apiSecret,
          'Client-Context': acc.clientContext || '',
          'Accept': 'application/json',
        },
      });
      const data = await r.json();
      const d = data?.data || {};
      const raw = String(d.transfer_status || d.order?.order_status || d.order_status || d.status || '').trim();
      const riderNote = String(d.note || d.reason || d.status_reason || d.order?.status_reason || d.comment || '').trim();
      return { ok: r.ok, raw, mapped: mapCourierStatus(raw), riderNote };
    } catch (err) {
      return { ok: false, error: String(err.message || err) };
    }
  }

  // 4. REDX
  if (prov === 'redx') {
    try {
      const token = acc.apiKey || acc.token;
      const authHeader = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
      const baseUrl = acc.environment === 'sandbox' ? 'https://sandbox.redx.com.bd' : 'https://openapi.redx.com.bd';
      const r = await fetch(`${baseUrl}/v1.0.0-beta/parcel/track/${consignment}`, {
        headers: { 'API-ACCESS-TOKEN': authHeader, 'Accept': 'application/json' },
      });
      const data = await r.json();
      const raw = data?.tracking?.[0]?.messageEn || data?.tracking?.[0]?.status || data?.status || '';
      const riderNote = data?.tracking?.[0]?.reason || '';
      return { ok: r.ok, raw, mapped: mapCourierStatus(raw), riderNote };
    } catch (err) {
      return { ok: false, error: String(err.message || err) };
    }
  }

  // 5. CUSTOM FALLBACK
  if (!acc.statusUrl) return { ok: false, error: 'No status URL configured' };
  const map = { consignment, apiKey: acc.apiKey || '', apiSecret: acc.apiSecret || '' };
  let headers = {};
  try { if (acc.statusHeaders) headers = JSON.parse(fillTpl(acc.statusHeaders, map)); else if (acc.bookHeaders) headers = JSON.parse(fillTpl(acc.bookHeaders, map)); } catch {}
  try {
    const r = await fetch(fillTpl(acc.statusUrl, map), { method: (acc.statusMethod || 'GET').toUpperCase(), headers });
    const text = await r.text();
    let data; try { data = JSON.parse(text); } catch { data = {}; }
    let raw = acc.statusPath ? acc.statusPath.split('.').reduce((v, k) => (v == null ? v : v[k]), data) : (data.delivery_status || data.status || data.order_status || '');
    raw = String(raw || '');
    let riderNote = acc.notePath ? acc.notePath.split('.').reduce((v, k) => (v == null ? v : v[k]), data) : (data.note || data.rider_note || '');
    let mapped = '';
    if (acc.statusMap) { try { const m = JSON.parse(acc.statusMap); mapped = m[raw] || m[raw.toLowerCase()] || ''; } catch {} }
    if (!mapped) mapped = mapCourierStatus(raw);
    return { ok: r.ok, raw, mapped, riderNote: String(riderNote || '').trim(), body: text.slice(0, 300) };
  } catch (err) { return { ok: false, error: String(err.message || err) }; }
}

// pull live courier status and reflect it onto the order (throttled so public track endpoint can call it freely)
async function syncOrderCourier(order, force) {
  const c = order.courier;
  if (!c || !c.consignment) return order;
  const last = c.lastSync ? new Date(c.lastSync).getTime() : 0;
  if (!force && Date.now() - last < 30000) return order;
  const accs = getIntegrations().couriers || [];
  const acc = accs.find((a) => a.id === c.accountId) || accs.find((a) => a.label === c.name) || accs.find((a) => a.provider === c.name);
  if (!acc) return order;
  const isNative = ['pathao', 'steadfast', 'carrybee', 'redx'].includes(String(acc.provider || '').toLowerCase());
  if (!isNative && !acc.statusUrl) return order;
  const r = await courierStatus(acc, c.consignment);
  if (!r.ok) return order;

  const rawStatus = r.raw || c.liveStatus || '';
  const mappedStatus = r.mapped || mapCourierStatus(rawStatus);
  const riderNote = r.riderNote || c.riderNote || '';

  let cleanTrackUrl = c.url || '';
  if (!cleanTrackUrl || cleanTrackUrl.includes('pathao.com/courier/tracking/')) {
    cleanTrackUrl = getCourierTrackUrl(acc, c.consignment, order.customer?.phone);
  }

  const patch = {
    courier: {
      ...c,
      url: cleanTrackUrl,
      liveStatus: rawStatus,
      riderNote: riderNote,
      lastSync: new Date().toISOString(),
    },
  };

  let effectiveMapped = mappedStatus;
  // Guard: Never demote an order from shipped/delivered back to confirmed/pending via courier sync
  if ((order.status === 'shipped' || order.status === 'delivered') && (effectiveMapped === 'confirmed' || effectiveMapped === 'pending' || !effectiveMapped)) {
    effectiveMapped = order.status;
  }

  const changed = effectiveMapped && effectiveMapped !== order.status;
  if (changed) {
    patch.status = effectiveMapped;
    const history = Array.isArray(order.history) ? [...order.history] : [];
    history.push({
      status: effectiveMapped,
      at: new Date().toISOString(),
      note: riderNote ? `Courier (${c.name || 'Courier'}): ${rawStatus} · Note: ${riderNote}` : `Courier (${c.name || 'Courier'}): ${rawStatus}`,
    });
    patch.history = history;
  } else if (riderNote && riderNote !== c.riderNote) {
    const history = Array.isArray(order.history) ? [...order.history] : [];
    history.push({
      status: order.status,
      at: new Date().toISOString(),
      note: `Rider update: ${riderNote}`,
    });
    patch.history = history;
  }

  const updated = updateOrder(order.id, patch) || order;
  if (changed) notifyOrder(updated, 'status');
  return updated;
}

// Background Courier Auto-Sync Worker
// Automatically queries Pathao, Steadfast, CarryBee, RedX for active shipments every 5 minutes
let isAutoSyncingCouriers = false;
async function runBackgroundCourierSync() {
  if (isAutoSyncingCouriers) return;
  isAutoSyncingCouriers = true;
  try {
    const orders = getOrders() || [];
    // Active orders that are out with courier but not yet delivered / returned / cancelled
    const activeOrders = orders.filter((o) => {
      const st = String(o.status || '').toLowerCase();
      const hasConsignment = !!(o.courier && o.courier.consignment);
      return hasConsignment && ['shipped', 'confirmed', 'hold'].includes(st);
    });

    if (activeOrders.length === 0) return;
    console.log(`[Courier Auto-Sync] Checking ${activeOrders.length} active shipments...`);

    for (const order of activeOrders) {
      try {
        await syncOrderCourier(order, true);
        await new Promise((r) => setTimeout(r, 500));
      } catch (err) {
        console.error(`[Courier Auto-Sync] Error syncing order #${order.id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[Courier Auto-Sync] Background task error:', err.message);
  } finally {
    isAutoSyncingCouriers = false;
  }
}
function normPhone(p) { let d = String(p || '').replace(/\D/g, ''); if (d.length === 11 && d.startsWith('01')) d = '88' + d; return d; }
// server-side conversions: Facebook CAPI + TikTok Events API (Purchase), shared event_id for browser dedup
async function trackPurchase(order) {
  const tr = getIntegrations().tracking || {};
  const out = {};
  const eventId = String(order.id);
  const value = Math.round((Number(order.total) || 0) * 100) / 100;
  const c = order.customer || {};
  const rawP = String(c.phone || '').replace(/\D/g, '');
  const e164 = rawP.startsWith('880') ? rawP : (rawP.startsWith('0') ? '88' + rawP : '880' + rawP);
  const ph = e164 ? createHash('sha256').update(e164).digest('hex') : createHash('sha256').update(normPhone(c.phone)).digest('hex');

  const nameParts = String(c.name || '').trim().toLowerCase().split(/\s+/);
  const fn = nameParts[0] ? createHash('sha256').update(nameParts[0]).digest('hex') : undefined;
  const ln = nameParts.slice(1).join(' ') ? createHash('sha256').update(nameParts.slice(1).join(' ')).digest('hex') : undefined;
  const rawCity = String(c.district || c.area || c.city || '').trim().toLowerCase();
  const ct = rawCity ? createHash('sha256').update(rawCity).digest('hex') : undefined;
  const country = createHash('sha256').update('bd').digest('hex');
  const em = c.email ? createHash('sha256').update(String(c.email).trim().toLowerCase()).digest('hex') : undefined;

  const ids = (order.items || []).map((i) => String(i.id));
  const numItems = (order.items || []).reduce((s, i) => s + (Number(i.qty) || 1), 0);
  const ts = Math.floor(Date.now() / 1000);
  const sourceUrl = order.landing ? `https://metrroma.com/page/${order.landing}` : 'https://metrroma.com/';

  const userData = {
    ph: [ph],
    country: [country],
  };
  if (fn) userData.fn = [fn];
  if (ln) userData.ln = [ln];
  if (ct) userData.ct = [ct];
  if (em) userData.em = [em];
  if (order.ip) userData.client_ip_address = order.ip;
  if (order.userAgent) userData.client_user_agent = order.userAgent;
  if (order.fbp) userData.fbp = order.fbp;
  if (order.fbc) userData.fbc = order.fbc;

  try {
    if (tr.fbEnabled && tr.fbPixelId && tr.fbToken) {
      const body = {
        data: [{
          event_name: 'Purchase',
          event_time: ts,
          event_id: eventId,
          action_source: 'website',
          event_source_url: sourceUrl,
          user_data: userData,
          custom_data: {
            currency: 'BDT',
            value,
            content_type: 'product',
            content_ids: ids,
            num_items: numItems,
            contents: (order.items || []).map((i) => ({
              id: String(i.id),
              quantity: Number(i.qty) || 1,
              item_price: Number(i.price) || 0,
            })),
          },
        }],
      };
      if (tr.fbTestCode) body.test_event_code = tr.fbTestCode;
      const r = await fetch(`https://graph.facebook.com/v19.0/${tr.fbPixelId}/events?access_token=${encodeURIComponent(tr.fbToken)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      out.fb = { status: r.status, body: (await r.text()).slice(0, 300) };
    }
    if (tr.ttkEnabled && tr.ttkPixelId && tr.ttkToken) {
      const body = {
        event_source: 'web',
        event_source_id: tr.ttkPixelId,
        data: [{
          event: 'CompletePayment',
          event_time: ts,
          event_id: eventId,
          user: { phone: ph },
          properties: {
            currency: 'BDT',
            value,
            contents: (order.items || []).map((i) => ({
              content_id: String(i.id),
              quantity: Number(i.qty) || 1,
              price: Number(i.price) || 0,
            })),
          },
        }],
      };
      const r = await fetch('https://business-api.tiktok.com/open_api/v1.3/event/track/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Access-Token': tr.ttkToken },
        body: JSON.stringify(body),
      });
      out.ttk = { status: r.status, body: (await r.text()).slice(0, 300) };
    }
  } catch (e) { out.error = String(e.message || e); }
  return out;
}
function dig(obj, path) { if (!path) return undefined; try { return path.split('.').reduce((v, k) => (v == null ? v : v[k]), obj); } catch { return undefined; } }

function fetchIPv4(url, options = {}) {
  return new Promise((resolve, reject) => {
    try {
      const parsed = new URL(url);
      const isHttps = parsed.protocol === 'https:';
      const lib = isHttps ? https : http;

      const reqOptions = {
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: options.method || 'GET',
        family: 4,
        headers: options.headers || {},
        timeout: options.timeout || 12000,
      };

      const req = lib.request(reqOptions, (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const bodyText = Buffer.concat(chunks).toString('utf8');
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            statusText: res.statusMessage,
            headers: res.headers,
            text: async () => bodyText,
            json: async () => {
              try { return JSON.parse(bodyText); } catch { return {}; }
            },
          });
        });
      });

      req.on('timeout', () => {
        req.destroy(new Error(`Request timeout (${reqOptions.timeout}ms)`));
      });

      req.on('error', (err) => {
        reject(err);
      });

      if (options.body) {
        if (typeof options.body === 'string' || Buffer.isBuffer(options.body)) {
          req.write(options.body);
        } else {
          req.write(JSON.stringify(options.body));
        }
      }

      req.end();
    } catch (err) {
      reject(err);
    }
  });
}

async function fraudCheck(phone, customFraudConfig) {
  const p0 = cleanBDPhone(phone);
  const p88 = normPhone(phone);
  if (!p0) return { ok: false, error: 'Valid phone number is required (e.g. 01XXXXXXXXX)' };

  const couriersList = [];
  const ig = getIntegrations();
  const allSavedCouriers = ig.couriers || [];
  const fr = customFraudConfig || ig.fraud || {};
  let aggregatorSummary = null;
  let riskVerdict = null;

  // 1. Internal Store Order Records
  try {
    const orders = getOrders() || [];
    const custOrders = orders.filter((o) => {
      const ph = cleanBDPhone(o.customer?.phone);
      const ph2 = cleanBDPhone(o.customer?.phone2);
      return (ph && ph === p0) || (ph2 && ph2 === p0);
    });

    if (custOrders.length > 0) {
      let storeDelivered = 0;
      let storeCancelled = 0;
      let storeInTransit = 0;
      const courierGroups = {};

      for (const ord of custOrders) {
        const cName = ord.courier?.name || 'Store Internal';
        if (!courierGroups[cName]) courierGroups[cName] = { total: 0, delivered: 0, cancelled: 0 };
        courierGroups[cName].total++;

        const st = String(ord.status || '').toLowerCase();
        if (st === 'delivered' || st === 'completed') {
          storeDelivered++;
          courierGroups[cName].delivered++;
        } else if (st === 'cancelled' || st === 'return' || st === 'returned' || st === 'failed') {
          storeCancelled++;
          courierGroups[cName].cancelled++;
        } else {
          storeInTransit++;
        }
      }

      couriersList.push({
        courier: 'Store Internal Orders',
        source: 'internal',
        total: custOrders.length,
        delivered: storeDelivered,
        cancelled: storeCancelled,
        pending: storeInTransit,
        rate: custOrders.length > 0 ? Math.round((storeDelivered / custOrders.length) * 100) : 0,
        returnRate: custOrders.length > 0 ? Math.round((storeCancelled / custOrders.length) * 100) : 0,
        breakdown: courierGroups,
      });
    }
  } catch (err) {
    console.error('Store fraud history error:', err);
  }

  // 2. Direct Steadfast Fraud API Check
  const sfAcc = allSavedCouriers.find(
    (c) => c.enabled && String(c.provider || '').toLowerCase() === 'steadfast' && (c.apiKey || c.clientId) && (c.apiSecret || c.clientSecret)
  );
  if (sfAcc) {
    try {
      const apiKey = sfAcc.apiKey || sfAcc.clientId;
      const secretKey = sfAcc.apiSecret || sfAcc.clientSecret;
      const sfRes = await fetchIPv4(`https://portal.packzy.com/api/v1/fraud_check/${p0}`, {
        method: 'GET',
        headers: {
          'Api-Key': apiKey,
          'Secret-Key': secretKey,
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        },
      });
      const sfData = await sfRes.json();
      if (sfRes.ok && (sfData.status === 200 || sfData.total_parcel !== undefined)) {
        const t = Number(sfData.total_parcel ?? sfData.total ?? 0);
        const d = Number(sfData.total_delivery ?? sfData.delivered ?? 0);
        const c = Number(sfData.total_cancelled ?? sfData.cancelled ?? 0);
        couriersList.push({
          courier: 'Steadfast',
          source: 'steadfast',
          total: t,
          delivered: d,
          cancelled: c,
          rate: t > 0 ? Math.round((d / t) * 100) : 0,
          returnRate: t > 0 ? Math.round((c / t) * 100) : 0,
        });
      } else if (sfData.status === 403 || (sfData.message && sfData.message.toLowerCase().includes('inactive'))) {
        couriersList.push({
          courier: 'Steadfast',
          source: 'steadfast',
          total: 0,
          delivered: 0,
          cancelled: 0,
          rate: 0,
          returnRate: 0,
          status: 'inactive',
          notice: 'Account inactive or lacks Steadfast Fraud API permission',
        });
      }
    } catch (err) {
      console.error('Steadfast live fraud check error:', err);
    }
  }

  // 3. Direct Pathao Success Rate API (if Pathao is configured)
  const pathaoAcc = allSavedCouriers.find(
    (c) => c.enabled && String(c.provider || '').toLowerCase() === 'pathao' && c.clientId && c.username
  );
  if (pathaoAcc) {
    try {
      const token = await getPathaoToken(pathaoAcc);
      if (token) {
        const pRes = await fetchIPv4(`https://api-hermes.pathao.com/aladdin/api/v1/user/success-rate?phone=${p0}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          },
        });
        if (pRes.ok) {
          const pData = await pRes.json();
          const pInfo = pData.data || pData;
          const d = Number(pInfo.delivered_order ?? pInfo.delivered ?? pInfo.success ?? 0);
          const c = Number(pInfo.returned_order ?? pInfo.returned ?? pInfo.cancelled ?? 0);
          let t = Number(pInfo.total_order ?? pInfo.total_parcel ?? pInfo.total ?? 0);
          if (t < d + c) t = d + c;
          if (t > 0 || d > 0 || c > 0) {
            couriersList.push({
              courier: 'Pathao',
              source: 'pathao',
              total: t,
              delivered: d,
              cancelled: c,
              rate: t > 0 ? Math.round((d / t) * 100) : 0,
              returnRate: t > 0 ? Math.round((c / t) * 100) : 0,
            });
          }
        }
      }
    } catch (err) {}
  }

  // 4. External Aggregated Fraud Check (BDCourier, FraudChecker, Custom API)
  if (fr.enabled && (fr.url || fr.bdcourierApiKey)) {
    try {
      let url = fr.url;
      let method = (fr.method || 'GET').toUpperCase();
      let headers = { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' };
      let body = undefined;

      // Direct BDCourier Integration if API key is configured or URL is bdcourier
      if (fr.bdcourierApiKey || (url && url.includes('bdcourier'))) {
        const apiKey = String(fr.bdcourierApiKey || '').trim() || (fr.headers ? (() => { try { return JSON.parse(fr.headers).Authorization?.replace(/^Bearer\s+/i, ''); } catch { return ''; } })() : '');
        url = url || 'https://api.bdcourier.com/courier-check';
        method = 'POST';
        if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify({ phone: p0 });
      } else if (url) {
        url = url.replace(/\{phone\}/g, encodeURIComponent(p88)).replace(/\{phone0\}/g, encodeURIComponent(p0));
        try { if (fr.headers) headers = { ...headers, ...JSON.parse(fr.headers) }; } catch {}
        if (method === 'POST') {
          body = JSON.stringify({ phone: p0 });
        }
      }

      let extRes;
      try {
        extRes = await fetchIPv4(url, { method, headers, body });
        if (!extRes.ok && url && url.includes('bdcourier.com/courier-check')) {
          try {
            const fallbackRes = await fetchIPv4('https://api.bdcourier.com/old/courier-check', { method, headers, body });
            if (fallbackRes.ok) extRes = fallbackRes;
          } catch {}
        }
      } catch (networkErr) {
        couriersList.push({
          courier: 'BD Courier API',
          source: 'aggregator',
          total: 0,
          delivered: 0,
          cancelled: 0,
          rate: 0,
          returnRate: 0,
          status: 'error',
          notice: `Connection error: ${networkErr.message || networkErr}`,
        });
      }

      let extData = {};
      if (extRes) {
        const extText = await extRes.text();
        try { extData = JSON.parse(extText); } catch { extData = {}; }

        if (!extRes.ok || extData.status === 'error') {
          let errMsg = extData.message || `API error (${extRes.status})`;
          if (extRes.status === 401 || (errMsg && errMsg.toLowerCase().includes('token not found'))) {
            errMsg = 'Invalid Bearer token: Token not found in database. Please click copy (📋) next to API Key on app.courier.com.bd/api and save.';
          }
          couriersList.push({
            courier: 'BD Courier API',
            source: 'aggregator',
            total: 0,
            delivered: 0,
            cancelled: 0,
            rate: 0,
            returnRate: 0,
            status: 'error',
            notice: errMsg,
          });
        }
      }

      // Check if extData has courier breakdown:
      riskVerdict = extData.risk_verdict || null;

      if (extRes && extRes.ok && extData.status !== 'error') {
        const courierMap = extData.courierData || extData.courier_data || extData.couriers || extData.data?.courierData || extData.data?.couriers || extData.data;
        aggregatorSummary = extData.data?.summary || extData.summary || null;
        const knownCouriers = ['steadfast', 'pathao', 'redx', 'carrybee', 'paperfly', 'ecourier', 'e_courier', 'sundarban', 'sa_paribahan', 'courrierfast', 'parceldex'];
        let foundNested = false;

        if (typeof courierMap === 'object' && courierMap !== null) {
          for (const k of Object.keys(courierMap)) {
            if (k.toLowerCase() === 'summary') continue; // Skip summary row so it never double counts
            const lk = k.toLowerCase().replace(/[^a-z0-9]/g, '');
            const matchedKnown = knownCouriers.find((c) => lk.includes(c));
            if (matchedKnown || (courierMap[k] && typeof courierMap[k] === 'object' && ('total' in courierMap[k] || 'delivered' in courierMap[k] || 'total_parcel' in courierMap[k]))) {
              foundNested = true;
              const sub = courierMap[k];
              const d = Number(sub.success_parcel ?? sub.delivered ?? sub.total_delivery ?? sub.successParcel ?? 0);
              const c = Number(sub.cancelled_parcel ?? sub.cancel_parcel ?? sub.cancelled ?? sub.total_cancelled ?? sub.cancelParcel ?? 0);
              let t = Number(sub.total_parcel ?? sub.total ?? sub.totalParcel ?? 0);
              if (t < d + c) t = d + c;
              const cName = sub.name || (k.charAt(0).toUpperCase() + k.slice(1));
              const logo = sub.logo || '';
              const notice = sub.notice || '';
              const subRate = sub.success_ratio != null ? Math.round(Number(sub.success_ratio)) : (t > 0 ? Math.round((d / t) * 100) : 0);
              const subReturnRate = t > 0 ? (sub.success_ratio != null ? Math.max(0, 100 - subRate) : Math.round((c / t) * 100)) : 0;

              const existingIdx = couriersList.findIndex((x) => x.courier.toLowerCase() === cName.toLowerCase());
              if (existingIdx >= 0) {
                if (t >= couriersList[existingIdx].total) {
                  couriersList[existingIdx] = {
                    courier: cName,
                    source: 'aggregator',
                    total: t,
                    delivered: d,
                    cancelled: c,
                    rate: subRate,
                    returnRate: subReturnRate,
                    logo,
                    notice,
                  };
                }
              } else {
                couriersList.push({
                  courier: cName,
                  source: 'aggregator',
                  total: t,
                  delivered: d,
                  cancelled: c,
                  rate: subRate,
                  returnRate: subReturnRate,
                  logo,
                  notice,
                });
              }
            }
          }
        }

        if (!foundNested) {
          const num = (v) => { const n = parseInt(v, 10); return isNaN(n) ? 0 : n; };
          const extDel = num(dig(extData, fr.successPath) ?? extData.success_parcel ?? extData.delivered ?? extData.successParcel);
          const extCan = num(dig(extData, fr.cancelPath) ?? extData.cancelled_parcel ?? extData.cancel_parcel ?? extData.cancelled ?? extData.cancelParcel);
          let extTot = num(dig(extData, fr.totalPath) ?? extData.total_parcel ?? extData.total ?? extData.totalParcel);
          if (extTot < extDel + extCan) extTot = extDel + extCan;
          if (extTot > 0) {
            couriersList.push({
              courier: 'Courier Aggregator History',
              source: 'aggregator',
              total: extTot,
              delivered: extDel,
              cancelled: extCan,
              rate: extTot > 0 ? Math.round((extDel / extTot) * 100) : 0,
              returnRate: extTot > 0 ? Math.round((extCan / extTot) * 100) : 0,
            });
          }
        }
      }
    } catch (err) {
      console.error('External fraud API error:', err);
    }
  }

  // 5. Grand Totals Calculation
  let grandTotal = 0;
  let grandDelivered = 0;
  let grandCancelled = 0;

  for (const item of couriersList) {
    if (item.total > 0) {
      grandTotal += item.total;
      grandDelivered += item.delivered;
      grandCancelled += item.cancelled;
    }
  }

  const resolvedFinished = grandDelivered + grandCancelled;
  let successRate = resolvedFinished > 0
    ? Math.round((grandDelivered / resolvedFinished) * 100)
    : (grandTotal > 0 ? 100 : null);
  let returnRate = resolvedFinished > 0
    ? Math.round((grandCancelled / resolvedFinished) * 100)
    : (grandTotal > 0 ? 0 : null);

  // Only consider aggregator rate if the aggregator actually has parcels (> 0)
  if (aggregatorSummary && Number(aggregatorSummary.total_parcel || 0) > 0 && aggregatorSummary.success_ratio != null) {
    const aggDel = Number(aggregatorSummary.success_parcel || 0);
    const aggCan = Number(aggregatorSummary.cancelled_parcel || 0);
    const combDel = grandDelivered + aggDel;
    const combCan = grandCancelled + aggCan;
    const combFinished = combDel + combCan;
    if (combFinished > 0) {
      successRate = Math.round((combDel / combFinished) * 100);
      returnRate = Math.round((combCan / combFinished) * 100);
    }
  }

  let risk = 'unknown';
  if (grandDelivered > 0 && grandCancelled === 0) {
    // Verified 100% successful deliveries with 0 cancellations!
    risk = 'low';
    riskVerdict = {
      level: 'safe',
      label: 'Verified Buyer',
      action: '✓ OK to ship',
      color: 'green',
      reasons: [`100% Success Rate (${grandDelivered} delivered, 0 returned)`]
    };
  } else if (resolvedFinished > 0) {
    if (successRate >= 80) {
      risk = 'low';
      riskVerdict = {
        level: 'safe',
        label: 'Safe Customer',
        action: '✓ OK to ship',
        color: 'green',
        reasons: [`${successRate}% Delivery Success Rate`]
      };
    } else if (successRate >= 60) {
      risk = 'medium';
      riskVerdict = {
        level: 'medium',
        label: 'Moderate Returns',
        action: '⚠ Confirm by phone',
        color: 'yellow',
        reasons: [`${returnRate}% Return Rate`]
      };
    } else {
      risk = 'high';
      riskVerdict = {
        level: 'high_risk',
        label: 'High Return Alert',
        action: '⛔ Call customer before shipping',
        color: 'red',
        reasons: [`${returnRate}% Return Rate (${grandCancelled} of ${resolvedFinished} returned)`]
      };
    }
  } else if (riskVerdict && riskVerdict.level && Number(aggregatorSummary?.total_parcel || 0) > 0) {
    risk = riskVerdict.level === 'safe' ? 'low' : riskVerdict.level === 'medium' ? 'medium' : 'high';
  } else if (grandTotal > 0) {
    risk = 'low';
    riskVerdict = {
      level: 'safe',
      label: 'Active Order',
      action: '✓ In progress',
      color: 'green',
      reasons: ['No return history recorded']
    };
  } else {
    risk = 'unknown';
    riskVerdict = {
      level: 'unknown',
      label: 'New Customer',
      action: 'ℹ️ First time buyer',
      color: 'blue',
      reasons: ['No previous courier history found']
    };
  }

  return {
    ok: true,
    phone: p0,
    total: grandTotal,
    success: grandDelivered,
    cancel: grandCancelled,
    delivered: grandDelivered,
    cancelled: grandCancelled,
    rate: successRate,
    returnRate: returnRate,
    risk,
    riskVerdict,
    aggregatorSummary,
    couriers: couriersList,
  };
}
function maskSecret(v) { return v ? '••••••' : ''; }
function maskedIntegrations() {
  const ig = getIntegrations();
  return {
    email: { ...ig.email, pass: maskSecret(ig.email.pass), hasPass: !!ig.email.pass },
    sms: { ...ig.sms, apiKey: maskSecret(ig.sms.apiKey), hasApiKey: !!ig.sms.apiKey },
    couriers: (ig.couriers || []).map((c) => ({
      ...c,
      apiKey: c.apiKey || c.clientId || '',
      apiSecret: maskSecret(c.apiSecret || c.clientSecret),
      clientId: c.clientId || c.apiKey || '',
      clientSecret: maskSecret(c.clientSecret || c.apiSecret),
      hasApiKey: !!(c.apiKey || c.clientId),
      hasApiSecret: !!(c.apiSecret || c.clientSecret),
      webhookSecret: c.webhookSecret || randomUUID(),
      headerValue: c.headerValue || '40489fe0-9386-4fc9-8e92-2b2fcb9d451c',
    })),
    tracking: { ...ig.tracking, fbToken: maskSecret(ig.tracking.fbToken), ttkToken: maskSecret(ig.tracking.ttkToken), hasFbToken: !!ig.tracking.fbToken, hasTtkToken: !!ig.tracking.ttkToken },
    fraud: { ...ig.fraud },
  };
}
function keepSecret(incoming, current) { return (incoming === '' || incoming == null || incoming === '••••••') ? current : incoming; }

app.get('/api/admin/integrations', adminAuth, requireRole('owner', 'manager'), (_q, res) => res.json(maskedIntegrations()));
app.put('/api/admin/integrations', adminAuth, requireRole('owner', 'manager'), (req, res) => {
  const cur = getIntegrations();
  const b = req.body || {};
  const email = { ...cur.email, ...(b.email || {}) };
  if (b.email) email.pass = keepSecret(b.email.pass, cur.email.pass);
  const sms = { ...cur.sms, ...(b.sms || {}) };
  if (b.sms) sms.apiKey = keepSecret(b.sms.apiKey, cur.sms.apiKey);
  let couriers = cur.couriers;
  if (Array.isArray(b.couriers)) {
    couriers = b.couriers.map((inc) => {
      const prev = cur.couriers.find((c) => c.id === inc.id) || {};
      const webhookSecret = inc.webhookSecret || prev.webhookSecret || randomUUID();
      const rawKey = inc.apiKey || inc.clientId || prev.apiKey || prev.clientId || '';
      const rawSec = keepSecret(inc.apiSecret || inc.clientSecret, prev.apiSecret || prev.clientSecret || '');
      return {
        ...inc,
        apiKey: keepSecret(inc.apiKey, prev.apiKey || rawKey),
        apiSecret: keepSecret(inc.apiSecret, prev.apiSecret || rawSec),
        clientId: inc.clientId || rawKey,
        clientSecret: keepSecret(inc.clientSecret, prev.clientSecret || rawSec),
        clientContext: inc.clientContext != null ? inc.clientContext : (prev.clientContext || ''),
        webhookSecret,
        headerValue: inc.headerValue != null ? inc.headerValue : (prev.headerValue || '40489fe0-9386-4fc9-8e92-2b2fcb9d451c'),
      };
    });
  }
  const tracking = { ...cur.tracking, ...(b.tracking || {}) };
  if (b.tracking) { tracking.fbToken = keepSecret(b.tracking.fbToken, cur.tracking.fbToken); tracking.ttkToken = keepSecret(b.tracking.ttkToken, cur.tracking.ttkToken); }
  const fraud = { ...cur.fraud, ...(b.fraud || {}) };
  saveIntegrations({ email, sms, couriers, tracking, fraud });
  res.json(maskedIntegrations());
});
app.post('/api/admin/fraud/check', adminAuth, requireRole('owner', 'manager'), async (req, res) => {
  const phone = String(req.body?.phone || '').trim();
  if (!phone) return res.status(400).json({ error: 'phone required' });
  res.json(await fraudCheck(phone, req.body?.fraudConfig));
});
app.post('/api/admin/fraud/ping', adminAuth, requireRole('owner', 'manager'), async (req, res) => {
  const apiKey = String(req.body?.apiKey || '').trim();
  if (!apiKey) return res.status(400).json({ ok: false, error: 'API key is required' });
  try {
    const pingRes = await fetchIPv4('https://api.bdcourier.com/check-connection', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      },
    });
    const pingData = await pingRes.json();
    if (pingRes.ok && (pingData.status === 'success' || pingData.data?.connected)) {
      return res.json({ ok: true, message: 'Connected to BD Courier successfully!' });
    }
    return res.json({ ok: false, status: pingRes.status, message: pingData.message || `Connection failed (${pingRes.status})` });
  } catch (err) {
    return res.json({ ok: false, message: err.message || 'Connection error' });
  }
});
app.post('/api/admin/tracking/test', adminAuth, requireRole('owner', 'manager'), async (req, res) => {
  const samplePrices = [890, 1199, 1499, 1680, 2270];
  const samplePrice = samplePrices[Math.floor(Math.random() * samplePrices.length)];
  const sample = { id: 'TEST-' + randomUUID().slice(0, 8).toUpperCase(), total: samplePrice, customer: { phone: '01710000000' }, items: [{ id: 'test_item', name: 'sample product', price: samplePrice, qty: 1 }] };
  const out = await trackPurchase(sample);
  if (!out.fb && !out.ttk) return res.json({ error: 'enable Facebook or TikTok and save tokens first' });
  res.json(out);
});
app.post('/api/admin/sms/test', adminAuth, requireRole('owner', 'manager'), async (req, res) => {
  const phone = String(req.body?.phone || '').trim();
  if (!BD_PHONE.test(phone)) return res.status(400).json({ error: 'enter a valid bd phone number' });
  res.json(await sendSMS(phone, 'METRROMA test sms — your SMS integration works ✓'));
});
app.post('/api/admin/email/test', adminAuth, requireRole('owner', 'manager'), async (req, res) => {
  const to = String(req.body?.to || '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return res.status(400).json({ error: 'enter a valid email address' });
  res.json(await sendEmail(to, 'METRROMA test email ✓', '<p>Your METRROMA email integration works.</p>'));
});
app.post('/api/admin/courier/book', adminAuth, (req, res) => {
  const { orderId, accountId, courierName } = req.body || {};
  const o = getOrders().find((x) => x.id === orderId || x.id === 'DOT-' + orderId || 'DOT-' + x.id === orderId);
  if (!o) return res.status(404).json({ error: 'order not found' });
  if (!['approved', 'confirmed'].includes(String(o.status || '').toLowerCase())) {
    return res.status(400).json({ error: 'শুধুমাত্র Approved বা Confirmed স্ট্যাটাসের অর্ডার কুরিয়ারে পাঠানো যাবে।' });
  }
  const accs = getIntegrations().couriers || [];
  const target = (courierName || accountId || '').toLowerCase();
  const acc = accs.find((c) => c.id === accountId || c.label?.toLowerCase() === target || c.provider?.toLowerCase() === target);
  const isNative = ['pathao', 'steadfast', 'carrybee', 'redx'].includes(String(acc?.provider || '').toLowerCase());

  if (!acc || (!acc.bookUrl && !isNative)) {
    const name = courierName || acc?.label || acc?.provider || accountId || 'Courier';
    const courier = { name, consignment: '', phone: acc?.hotline || '', url: '', lastSync: '' };
    const history = Array.isArray(o.history) ? [...o.history] : [];
    history.push({ status: 'shipped', at: new Date().toISOString(), note: `Dispatched via ${name}` });
    const updated = updateOrder(o.id, { courier, status: 'shipped', history }) || o;
    notifyOrder(updated, 'status');
    return res.json({ ok: true, consignment: '', courier, status: 'shipped' });
  }

  bookCourier(acc, o).then((r) => {
    if (r.ok) {
      const trackUrl = r.trackUrl || getCourierTrackUrl(acc, r.consignment, o?.customer?.phone);
      const courier = {
        name: acc.label || acc.provider || 'Courier',
        accountId: acc.id,
        consignment: r.consignment || '',
        phone: acc.hotline || '',
        url: trackUrl,
        lastSync: new Date().toISOString(),
      };
      const history = Array.isArray(o.history) ? [...o.history] : [];
      history.push({
        status: 'shipped',
        at: new Date().toISOString(),
        note: `Booked via ${acc.label || acc.provider} #${r.consignment || ''}`,
        staff: { username: req.admin.username, name: req.admin.name || req.admin.username, role: req.admin.role }
      });
      recordStaffKpiAction(req.admin, 'COURIER_BOOKED', {
        orderId: o.id,
        courier: acc.label || acc.provider,
        consignment: r.consignment,
        amount: Number(o.total || 0)
      });
      const updated = updateOrder(o.id, { courier, status: 'shipped', history, lastUpdatedBy: { username: req.admin.username, name: req.admin.name, role: req.admin.role, at: new Date().toISOString() } }) || o;
      notifyOrder(updated, 'status');
      return res.json({ ok: true, consignment: r.consignment, courier, status: 'shipped' });
    }
    res.json(r);
  }).catch((err) => res.status(500).json({ error: String(err.message || err) }));
});

// ---- Exchange Order Creation Endpoint ----
app.post('/api/admin/orders/:id/exchange', adminAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const origId = req.params.id;
    const allOrders = getOrders();
    const orig = allOrders.find((x) => x.id === origId || x.id === 'DOT-' + origId || 'DOT-' + x.id === origId);
    if (!orig) return res.status(404).json({ error: 'Original order not found' });
    if (orig.status !== 'delivered') {
      return res.status(400).json({ error: 'Only delivered orders can be exchanged' });
    }

    const {
      newItem,
      exchangeReason = 'Size/Product change',
      codAmount = 100,
      courierName,
      accountId,
      autoBookCourier = true,
    } = req.body || {};

    if (!newItem || !newItem.name) {
      return res.status(400).json({ error: 'Replacement item name is required' });
    }

    // Generate unique exchange order ID
    let exId = `${orig.id}-EX`;
    let counter = 2;
    while (allOrders.some((x) => x.id === exId)) {
      exId = `${orig.id}-EX${counter++}`;
    }

    const cleanCod = Math.max(0, Number(codAmount) || 0);
    const itemQty = Math.max(1, Number(newItem.qty) || 1);
    const itemPrice = Math.max(0, Number(newItem.price) || 0);

    const riderInstruction = `[EXCHANGE PARCEL] কাস্টমার থেকে আগের পার্সেলটি রিসিভ করে এই নতুন পার্সেল হ্যান্ডওভার করুন। COD: ৳${cleanCod}`;

    const exItem = {
      id: newItem.id || ('ex-' + Date.now().toString(36)),
      name: String(newItem.name).trim(),
      price: itemPrice,
      qty: itemQty,
      sku: newItem.sku ? String(newItem.sku).trim() : '',
      image: newItem.image || '',
    };

    const exOrder = {
      id: exId,
      originalOrderId: orig.id,
      isExchange: true,
      exchangeReason: String(exchangeReason || '').trim(),
      createdAt: new Date().toISOString(),
      source: 'exchange',
      status: 'approved',
      payment: 'cash_on_delivery',
      paymentStatus: cleanCod > 0 ? 'unpaid' : 'paid',
      customer: {
        ...(orig.customer || {}),
        note: riderInstruction,
      },
      items: [exItem],
      itemsTotal: itemPrice * itemQty,
      delivery: cleanCod,
      discount: 0,
      total: cleanCod, // Cash to collect from customer
      history: [
        {
          status: 'approved',
          at: new Date().toISOString(),
          note: `Exchange order created from #${orig.id}. Reason: ${exchangeReason}`,
        },
      ],
    };

    // Auto-book with courier if requested
    if (autoBookCourier) {
      const accs = getIntegrations().couriers || [];
      const target = String(courierName || accountId || '').toLowerCase();
      const acc = accs.find((c) => c.id === accountId || c.label?.toLowerCase() === target || c.provider?.toLowerCase() === target) || accs[0];

      if (acc) {
        try {
          const r = await bookCourier(acc, exOrder);
          if (r.ok && r.consignment) {
            const trackUrl = r.trackUrl || getCourierTrackUrl(acc, r.consignment, exOrder.customer?.phone);
            exOrder.courier = {
              name: acc.label || acc.provider || 'Courier',
              accountId: acc.id,
              consignment: r.consignment,
              phone: acc.hotline || '',
              url: trackUrl,
              lastSync: new Date().toISOString(),
            };
            exOrder.status = 'shipped';
            exOrder.history.push({
              status: 'shipped',
              at: new Date().toISOString(),
              note: `Booked via ${acc.label || acc.provider} #${r.consignment}`,
            });
          }
        } catch (cErr) {
          console.warn('[Exchange Courier Booking Warning]:', cErr.message);
        }
      }
    }

    // Save exchange order to database
    addOrder(exOrder);

    // Update original order
    const origHistory = Array.isArray(orig.history) ? [...orig.history] : [];
    origHistory.push({
      status: orig.status,
      at: new Date().toISOString(),
      note: `Exchange Order #${exOrder.id} created (Replacement: ${exItem.name}, COD: ৳${cleanCod}).`,
    });
    const updatedOrig = updateOrder(orig.id, {
      exchangeOrderId: exOrder.id,
      exchangeStatus: 'exchange_in_progress',
      history: origHistory,
    });

    // Notify customer via WhatsApp
    notifyOrder(exOrder, 'exchange');

    return res.json({
      ok: true,
      exchangeOrder: exOrder,
      originalOrder: updatedOrig || orig,
    });
  } catch (err) {
    console.error('[Create Exchange Error]:', err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

app.post('/api/admin/courier/sync', adminAuth, requireRole('owner', 'manager'), async (req, res) => {
  const o = getOrders().find((x) => x.id === req.body?.orderId);
  if (!o) return res.status(404).json({ error: 'order not found' });
  if (!o.courier || !o.courier.consignment) return res.status(400).json({ error: 'this order has no courier consignment to sync' });
  try { const updated = await syncOrderCourier(o, true); res.json({ ok: true, status: updated.status, liveStatus: updated.courier?.liveStatus || '', courier: updated.courier }); }
  catch (err) { res.status(500).json({ error: String(err.message || err) }); }
});

app.post('/api/admin/courier/sync-all', adminAuth, requireRole('owner', 'manager'), async (req, res) => {
  const all = getOrders();
  const eligible = all.filter((o) => o.courier && o.courier.consignment && !['delivered', 'cancelled'].includes(o.status));
  let updatedCount = 0;
  for (const o of eligible) {
    try {
      await syncOrderCourier(o, true);
      updatedCount++;
    } catch {}
  }
  res.json({ ok: true, synced: updatedCount, total: eligible.length, orders: getOrders() });
});

// Universal test connection route for Pathao, Steadfast, CarryBee, and RedX
app.post('/api/admin/courier/test-connection', adminAuth, requireRole('owner', 'manager'), async (req, res) => {
  let { id, provider, apiKey, apiSecret, clientId, clientSecret, username, password, clientContext, environment, token } = req.body || {};
  const prov = String(provider || '').toLowerCase();

  // If credentials are masked '••••••' or missing, resolve from saved integrations!
  const savedCouriers = getIntegrations()?.couriers || [];
  const existing = savedCouriers.find((x) => (id && x.id === id) || (x.provider && x.provider.toLowerCase() === prov));
  if (existing) {
    if (!apiKey || /[\u2022\u25cf\u2219\u00b7]/.test(apiKey)) apiKey = existing.apiKey || '';
    if (!apiSecret || /[\u2022\u25cf\u2219\u00b7]/.test(apiSecret)) apiSecret = existing.apiSecret || existing.secretKey || '';
    if (!clientId || /[\u2022\u25cf\u2219\u00b7]/.test(clientId)) clientId = existing.clientId || existing.apiKey || '';
    if (!clientSecret || /[\u2022\u25cf\u2219\u00b7]/.test(clientSecret)) clientSecret = existing.clientSecret || existing.apiSecret || '';
    if (!username || /[\u2022\u25cf\u2219\u00b7]/.test(username)) username = existing.username || '';
    if (!password || /[\u2022\u25cf\u2219\u00b7]/.test(password)) password = existing.password || '';
    if (!token || /[\u2022\u25cf\u2219\u00b7]/.test(token)) token = existing.apiKey || existing.token || '';
  }

  try {
    // 1. Pathao test
    if (prov === 'pathao') {
      const cId = sanitizeCredential('Client ID', clientId);
      const cSec = sanitizeCredential('Client Secret', clientSecret);
      const uName = sanitizeCredential('Email / Username', username);
      const pass = sanitizeCredential('Password', password);
      if (!cId || !cSec || !uName || !pass) {
        return res.status(400).json({ error: 'Client ID, Client Secret, Email, and Password are required for Pathao.' });
      }
      const r = await fetch('https://api-hermes.pathao.com/aladdin/api/v1/issue-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ client_id: cId, client_secret: cSec, grant_type: 'password', username: uName, password: pass }),
      });
      const d = await r.json();
      if (!r.ok || !d.access_token) {
        return res.status(400).json({ error: d.message || d.error || 'Pathao authentication failed. Please check credentials.' });
      }
      let stores = [];
      try {
        const sRes = await fetch('https://api-hermes.pathao.com/aladdin/api/v1/stores', {
          headers: { 'Authorization': `Bearer ${d.access_token}`, 'Accept': 'application/json' },
        });
        const sData = await sRes.json();
        stores = sData?.data?.data || sData?.data || [];
      } catch {}
      return res.json({ ok: true, message: `Connected to Pathao successfully! Found ${stores.length} store(s).`, stores });
    }

    // 2. Steadfast test (balance check)
    if (prov === 'steadfast') {
      const key = sanitizeCredential('API Key', apiKey);
      const secret = sanitizeCredential('Secret Key', apiSecret || req.body?.secretKey);
      if (!key || !secret) {
        return res.status(400).json({ error: 'API Key and Secret Key are required for Steadfast.' });
      }
      let r;
      try {
        r = await fetch('https://portal.packzy.com/api/v1/get_balance', {
          headers: { 'Api-Key': key, 'Secret-Key': secret, 'Accept': 'application/json' },
        });
      } catch {
        r = await fetch('https://portal.steadfast.com.bd/api/v1/get_balance', {
          headers: { 'Api-Key': key, 'Secret-Key': secret, 'Accept': 'application/json' },
        });
      }
      const d = await r.json();
      if (!r.ok || d.status === 401 || d.status === 400) {
        return res.status(400).json({ error: d.message || 'Steadfast authentication failed. Check your API Key & Secret Key.' });
      }
      return res.json({ ok: true, message: `Connected to Steadfast! Current Balance: ৳${d.current_balance ?? 0}`, balance: d.current_balance });
    }

    // 3. CarryBee test (stores check)
    if (prov === 'carrybee') {
      const cId = sanitizeCredential('Client ID', clientId || apiKey);
      const cSec = sanitizeCredential('Client Secret', clientSecret || apiSecret);
      if (!cId || !cSec) {
        return res.status(400).json({ error: 'Client ID and Client Secret are required for CarryBee.' });
      }
      const baseUrl = environment === 'sandbox' ? 'https://sandbox.carrybee.com' : 'https://developers.carrybee.com';
      const ctx = sanitizeCredential('Client Context', clientContext) || '';
      const r = await fetch(`${baseUrl}/api/v2/stores`, {
        headers: {
          'Client-ID': cId,
          'Client-Secret': cSec,
          ...(ctx ? { 'Client-Context': ctx } : {}),
          'Accept': 'application/json'
        },
      });
      const text = await r.text();
      let d; try { d = JSON.parse(text); } catch { d = {}; }
      if (!r.ok || d.error || d.message === 'An unexpected error occurred') {
        const errDetail = d.message || d.error || `HTTP ${r.status}: Authentication failed`;
        return res.status(400).json({ error: `${errDetail}. Check that Client ID and Client Secret match your CarryBee Developer credentials.` });
      }
      const stores = d.data || d.stores || [];
      return res.json({ ok: true, message: `Connected to CarryBee successfully! Found ${Array.isArray(stores) ? stores.length : 1} store(s).`, stores: Array.isArray(stores) ? stores : [] });
    }

    // 4. RedX test (pickup stores check)
    if (prov === 'redx') {
      const t = sanitizeCredential('API Access Token', apiKey || token);
      if (!t) return res.status(400).json({ error: 'API Access Token is required for RedX.' });
      const authHeader = t.startsWith('Bearer ') ? t : `Bearer ${t}`;
      let baseUrl = environment === 'sandbox' ? 'https://sandbox.redx.com.bd' : 'https://openapi.redx.com.bd';
      let r = await fetch(`${baseUrl}/v1.0.0-beta/pickup/stores`, {
        headers: { 'API-ACCESS-TOKEN': authHeader, 'Accept': 'application/json' },
      });
      let d = await r.json();

      // If production failed with invalid signature / 401, auto-try sandbox
      if (!r.ok && environment !== 'sandbox') {
        try {
          const sRes = await fetch('https://sandbox.redx.com.bd/v1.0.0-beta/pickup/stores', {
            headers: { 'API-ACCESS-TOKEN': authHeader, 'Accept': 'application/json' },
          });
          const sData = await sRes.json();
          if (sRes.ok && !sData.error) {
            r = sRes;
            d = sData;
            baseUrl = 'https://sandbox.redx.com.bd';
          }
        } catch {}
      }

      if (!r.ok || d.error) {
        return res.status(400).json({ error: d.message || 'RedX authentication failed. Check your Access Token.' });
      }
      const stores = d.pickup_stores || d.stores || [];
      const envNotice = baseUrl.includes('sandbox') ? ' (Sandbox)' : '';
      return res.json({
        ok: true,
        message: `Connected to RedX${envNotice} successfully! Found ${stores.length} pickup store(s).`,
        stores,
        environment: baseUrl.includes('sandbox') ? 'sandbox' : 'production',
      });
    }

    return res.status(400).json({ error: `Unsupported courier provider: ${provider}` });
  } catch (err) {
    res.status(400).json({ error: String(err.message || err) });
  }
});

// Keep pathao-test as backwards-compatible alias
app.post('/api/admin/courier/pathao-test', adminAuth, requireRole('owner', 'manager'), async (req, res) => {
  req.body = { ...req.body, provider: 'Pathao' };
  const { clientId, clientSecret, username, password } = req.body;
  if (!clientId || !clientSecret || !username || !password) {
    return res.status(400).json({ error: 'Client ID, Client Secret, Username, and Password are required' });
  }
  try {
    const r = await fetch('https://api-hermes.pathao.com/aladdin/api/v1/issue-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, grant_type: 'password', username, password }),
    });
    const d = await r.json();
    if (!r.ok || !d.access_token) {
      return res.status(400).json({ error: d.message || d.error || 'Pathao authentication failed.' });
    }
    let stores = [];
    try {
      const sRes = await fetch('https://api-hermes.pathao.com/aladdin/api/v1/stores', {
        headers: { 'Authorization': `Bearer ${d.access_token}`, 'Accept': 'application/json' },
      });
      const sData = await sRes.json();
      stores = sData?.data?.data || sData?.data || [];
    } catch {}
    res.json({ ok: true, message: 'Connected to Pathao successfully!', stores });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});
// ==========================================
// 1. BULK COURIER AUTO-BOOKING
// ==========================================
app.post('/api/admin/courier/bulk-book', adminAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { orderIds = [], defaultCourierName, courierMap = {} } = req.body || {};
  if (!Array.isArray(orderIds) || !orderIds.length) {
    return res.status(400).json({ error: 'No orders provided' });
  }

  const allOrders = getOrders();
  const accs = getIntegrations().couriers || [];
  const results = [];

  for (const id of orderIds) {
    const o = allOrders.find((x) => x.id === id || x.id === 'DOT-' + id || 'DOT-' + x.id === id);
    if (!o) {
      results.push({ orderId: id, ok: false, error: 'Order not found' });
      continue;
    }
    // If already booked with courier consignment, just ensure status is shipped (if approved/confirmed)
    if (o.courier?.consignment) {
      if (['approved', 'confirmed'].includes(String(o.status || '').toLowerCase())) {
        updateOrder(o.id, { status: 'shipped' });
      }
      results.push({ orderId: id, ok: true, alreadyBooked: true, consignment: o.courier.consignment, courier: o.courier });
      continue;
    }
    if (!['approved', 'confirmed'].includes(String(o.status || '').toLowerCase())) {
      results.push({ orderId: id, ok: false, error: 'Only Approved or Confirmed orders can be sent to courier' });
      continue;
    }

    const preferredCourier = courierMap[id] || (o.id && courierMap[o.id]) || o.courier?.name || defaultCourierName;
    const courierTarget = (preferredCourier || accs[0]?.label || accs[0]?.provider || 'Steadfast').toLowerCase();
    const acc = accs.find((c) => c.label?.toLowerCase() === courierTarget || c.provider?.toLowerCase() === courierTarget) || accs[0];
    const isNative = ['pathao', 'steadfast', 'carrybee', 'redx'].includes(String(acc?.provider || '').toLowerCase());

    if (!acc || (!acc.bookUrl && !isNative)) {
      const name = acc?.label || acc?.provider || defaultCourierName || 'Manual Courier';
      const courier = { name, consignment: '', phone: acc?.hotline || '', url: '', lastSync: '' };
      const history = Array.isArray(o.history) ? [...o.history] : [];
      history.push({ status: 'shipped', at: new Date().toISOString(), note: `Dispatched via ${name}` });
      const updated = updateOrder(o.id, { courier, status: 'shipped', history }) || o;
      notifyOrder(updated, 'status');
      results.push({ orderId: id, ok: true, consignment: '', courier, status: 'shipped' });
      continue;
    }

    try {
      const r = await bookCourier(acc, o);
      if (r.ok) {
        const trackUrl = r.trackUrl || getCourierTrackUrl(acc, r.consignment, o?.customer?.phone);
        const courier = {
          name: acc.label || acc.provider || 'Courier',
          accountId: acc.id,
          consignment: r.consignment || '',
          phone: acc.hotline || '',
          url: trackUrl,
          lastSync: new Date().toISOString(),
        };
        const history = Array.isArray(o.history) ? [...o.history] : [];
        history.push({ status: 'shipped', at: new Date().toISOString(), note: `Booked via ${acc.label || acc.provider} #${r.consignment || ''}` });
        const updated = updateOrder(o.id, { courier, status: 'shipped', history }) || o;
        notifyOrder(updated, 'status');
        results.push({ orderId: id, ok: true, consignment: r.consignment, courier, status: 'shipped' });
      } else {
        results.push({ orderId: id, ok: false, error: r.error || 'Courier rejected booking' });
      }
    } catch (err) {
      results.push({ orderId: id, ok: false, error: String(err.message || err) });
    }
  }

  res.json({ ok: true, results });
});

// ==========================================
// 2. DEDICATED STORE BACKUP & RESTORE
// ==========================================
app.get('/api/admin/backup/export', adminAuth, requireRole('owner'), (req, res) => {
  try {
    const backupData = createStoreBackup(req.query.includeFrontend === 'true');
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="store_backup_${new Date().toISOString().slice(0, 10)}.json"`);
    res.json(backupData);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create backup: ' + err.message });
  }
});

app.post('/api/admin/backup/restore', adminAuth, requireRole('owner'), express.json({ limit: '100mb' }), (req, res) => {
  try {
    const payload = req.body;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return res.status(400).json({ error: 'Invalid backup file structure' });
    }
    if (payload.format && payload.format !== 'metrroma-store-backup') {
      return res.status(400).json({ error: 'This backup belongs to a different application.' });
    }
    const isObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
    const complete = Array.isArray(payload.orders) && Array.isArray(payload.customers) &&
      isObject(payload.catalog) && Array.isArray(payload.catalog.products) && Array.isArray(payload.catalog.categories) &&
      isObject(payload.settings) && isObject(payload.integrations) && Array.isArray(payload.landings) &&
      Array.isArray(payload.coupons) && Array.isArray(payload.colors) && Array.isArray(payload.users) &&
      isObject(payload.reviews) && Array.isArray(payload.media);
    if (!complete) return res.status(400).json({ error: 'The backup is incomplete or missing required store sections.' });
    if (payload.frontendFiles != null) {
      if (!Array.isArray(payload.frontendFiles) || payload.frontendFiles.length > 5000) {
        return res.status(400).json({ error: 'The frontend backup section is invalid.' });
      }
      const seenPaths = new Set();
      let frontendBytes = 0;
      for (const file of payload.frontendFiles) {
        if (!file || !isAllowedFrontendPath(file.path) || seenPaths.has(file.path) || typeof file.data !== 'string' ||
          !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.data)) {
          return res.status(400).json({ error: 'The frontend backup contains an invalid file entry.' });
        }
        seenPaths.add(file.path);
        frontendBytes += Buffer.from(file.data, 'base64').length;
        if (frontendBytes > 70 * 1024 * 1024) return res.status(413).json({ error: 'The frontend backup exceeds the 70 MB restore limit.' });
      }
    }
    if (payload.manifest) {
      const { manifest, ...unsignedBackup } = payload;
      const expectedDigest = String(manifest.digest || '');
      const actualDigest = createHash('sha256').update(JSON.stringify(unsignedBackup)).digest('hex');
      if (manifest.algorithm !== 'SHA-256' || !/^[a-f0-9]{64}$/i.test(expectedDigest) || actualDigest !== expectedDigest.toLowerCase()) {
        return res.status(400).json({ error: 'Backup integrity check failed. The file may be damaged or modified.' });
      }
    }
    if (payload.media != null && (!Array.isArray(payload.media) || payload.media.some((m) => !m || !['app', 'persistent', 'root'].includes(m.location) || typeof m.name !== 'string' || m.name !== m.name.split(/[\\/]/).pop() || !/^[\w.-]+$/.test(m.name) || typeof m.data !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(m.data)))) {
      return res.status(400).json({ error: 'Backup contains an invalid media file entry.' });
    }
    // Preserve the exact current state before applying any part of a restore.
    const backupDir = join(getPersistentDataDirectory(), 'backups');
    mkdirSync(backupDir, { recursive: true });
    const beforeRestore = createStoreBackup(Array.isArray(payload.frontendFiles));
    const snapshotFile = join(backupDir, `pre-restore-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    writeFileSync(snapshotFile, JSON.stringify(beforeRestore, null, 2), { flag: 'wx' });
    const counts = {};

    if (Array.isArray(payload.orders)) {
      saveOrders(payload.orders);
      counts.orders = payload.orders.length;
    }
    if (Array.isArray(payload.customers)) {
      saveCustomers(payload.customers);
      counts.customers = payload.customers.length;
    }
    if (payload.catalog && Array.isArray(payload.catalog.products)) {
      saveCatalog(payload.catalog);
      counts.products = payload.catalog.products.length;
      counts.categories = (payload.catalog.categories || []).length;
    }
    if (payload.settings && typeof payload.settings === 'object') {
      saveSettings(payload.settings);
      counts.settings = true;
    }
    if (payload.integrations && typeof payload.integrations === 'object') {
      saveIntegrations(payload.integrations);
      counts.integrations = true;
    }
    if (Array.isArray(payload.landings)) {
      saveLandings(payload.landings);
      counts.landings = payload.landings.length;
    }
    if (Array.isArray(payload.coupons)) {
      saveCoupons(payload.coupons);
      counts.coupons = payload.coupons.length;
    }
    if (Array.isArray(payload.colors)) {
      saveColors(payload.colors);
      counts.colors = payload.colors.length;
    }
    if (Array.isArray(payload.users)) {
      saveUsers(payload.users);
      counts.users = payload.users.length;
    }
    if (payload.reviews && typeof payload.reviews === 'object' && !Array.isArray(payload.reviews)) {
      saveReviews(payload.reviews);
      counts.reviews = Object.keys(payload.reviews).length;
    }
    if (Array.isArray(payload.media)) {
      for (const item of payload.media) {
        const target = join(UPLOAD_DIRS[item.location], item.name);
        const bytes = Buffer.from(item.data, 'base64');
        writeFileSync(target, bytes);
      }
      counts.media = payload.media.length;
    }

    if (Array.isArray(payload.frontendFiles)) {
      const restoredPaths = new Set(payload.frontendFiles.map((file) => file.path));
      for (const file of payload.frontendFiles) {
        const target = getSafeFrontendTarget(file.path);
        writeFileSync(target, Buffer.from(file.data, 'base64'));
      }
      const cleanUnlisted = (directory, prefix) => {
        if (!existsSync(directory) || !lstatSync(directory).isDirectory()) return;
        for (const entry of readdirSync(directory, { withFileTypes: true })) {
          if (entry.name.startsWith('.')) continue;
          const relativePath = `${prefix}/${entry.name}`;
          const target = join(directory, entry.name);
          if (entry.isDirectory() && !entry.isSymbolicLink()) cleanUnlisted(target, relativePath);
          else if (entry.isFile() && isAllowedFrontendPath(relativePath) && !restoredPaths.has(relativePath)) unlinkSync(target);
        }
      };
      for (const directory of ['src', 'public', 'dist']) cleanUnlisted(join(FRONTEND_ROOT, directory), directory);
      counts.frontendFiles = payload.frontendFiles.length;
    }

    res.json({ ok: true, message: 'Store restored successfully', counts, preRestoreSnapshot: snapshotFile.split(/[\\/]/).pop() });
  } catch (err) {
    res.status(500).json({ error: 'Restore failed: ' + err.message });
  }
});

// ==========================================
// 3. FINANCE & COURIER RECONCILIATION LEDGER
// ==========================================
app.get('/api/admin/finance/summary', adminAuth, requireRole('owner', 'manager'), (req, res) => {
  const orders = getOrders();
  let totalGross = 0;
  let totalDelivered = 0;
  let totalInTransit = 0;
  let totalCourierFees = 0;
  let totalReconciled = 0;

  const orderRows = orders.map((o) => {
    const total = Number(o.total) || 0;
    const isDelivered = o.status === 'delivered';
    const isShipped = o.status === 'shipped';
    const isCancelled = o.status === 'cancelled';

    const deliveryCharge = Number(o.delivery) || (o.customer?.area === 'inside' ? 80 : 130);
    const codCharge = Math.round(total * 0.01);
    const courierFee = deliveryCharge + codCharge;
    const netReceivable = Math.max(0, total - courierFee);

    if (!isCancelled) totalGross += total;
    if (isDelivered) {
      totalDelivered += total;
      totalCourierFees += courierFee;
      if (o.payoutReceived) totalReconciled += netReceivable;
    } else if (isShipped) {
      totalInTransit += total;
    }

    return {
      id: o.id,
      createdAt: o.createdAt,
      customerName: o.customer?.name || 'Customer',
      phone: o.customer?.phone || '',
      district: o.customer?.district || o.customer?.area || '',
      total,
      status: o.status,
      courierName: o.courier?.name || 'Unassigned',
      consignment: o.courier?.consignment || '',
      courierFee,
      netReceivable,
      payoutReceived: !!o.payoutReceived,
      payoutDate: o.payoutDate || null,
    };
  });

  res.json({
    totalGross,
    totalDelivered,
    totalInTransit,
    totalCourierFees,
    netDeliveredCash: totalDelivered - totalCourierFees,
    totalReconciled,
    pendingCourierBalance: (totalDelivered - totalCourierFees) - totalReconciled,
    orders: orderRows,
  });
});

app.post('/api/admin/finance/toggle-payout', adminAuth, requireRole('owner', 'manager'), (req, res) => {
  const { orderId, received } = req.body || {};
  const o = getOrders().find((x) => x.id === orderId || x.id === 'DOT-' + orderId || 'DOT-' + x.id === orderId);
  if (!o) return res.status(404).json({ error: 'Order not found' });
  const updated = updateOrder(orderId, {
    payoutReceived: !!received,
    payoutDate: received ? new Date().toISOString() : null,
  });
  res.json({ ok: true, order: updated });
});

// ==========================================
// 4. WHATSAPP AUTOMATION HUB
// ==========================================
// REAL BAILEYS WHATSAPP ENGINE ROUTES
// ==========================================
app.get('/api/admin/whatsapp/status', adminAuth, requireRole('owner', 'manager'), (req, res) => {
  try {
    const live = getWhatsAppLiveStatus();
    res.json(live);
  } catch (err) {
    res.json(getWhatsAppSettings());
  }
});

app.post('/api/admin/whatsapp/start-session', adminAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const forceNew = req.body?.reset !== false;
    const result = await startWhatsAppSocket(forceNew);
    if (!result?.connected) {
      await waitForQrCode(3500).catch(() => {});
    }
    const live = getWhatsAppLiveStatus();
    res.json({ ok: true, result, ...live });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/whatsapp/request-pair-code', adminAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { phone } = req.body || {};
    if (!phone) return res.status(400).json({ error: 'Phone number is required' });
    const pairingCode = await requestPairingCode(phone);
    res.json({ ok: true, pairingCode });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/admin/whatsapp/settings', adminAuth, requireRole('owner', 'manager'), (req, res) => {
  const updated = saveWhatsAppSettings(req.body || {});
  res.json({ ok: true, settings: updated });
});

app.post('/api/admin/whatsapp/connect', adminAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { phone, device, mode } = req.body || {};
    const settings = getSettings();
    const storePhone = phone || settings.whatsapp || settings.phone || '01878374762';
    const cleanPhone = String(storePhone).replace(/\D/g, '').slice(-11);
    
    // Trigger socket start if not running
    startWhatsAppSocket(false).catch(() => {});

    const updated = saveWhatsAppSettings({
      connected: true,
      phone: cleanPhone || '01878374762',
      device: device || (mode === 'qr' ? 'WhatsApp Web (Live Multi-Device)' : 'WhatsApp Web (Connected)'),
    });
    res.json({ ok: true, settings: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/whatsapp/disconnect', adminAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    clearWhatsAppSession();
    const updated = saveWhatsAppSettings({
      connected: false,
      phone: '',
      device: 'Disconnected',
      pairingCode: '',
    });
    res.json({ ok: true, settings: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/whatsapp/send', adminAuth, requireRole('owner', 'manager'), async (req, res) => {
  const { phone, message, orderId, imageUrl, eventType, delayMs } = req.body || {};
  if (!phone || (!message && !imageUrl)) return res.status(400).json({ error: 'Phone and either message or image are required' });
  try {
    const result = await sendBaileysMessage(phone, message || '', orderId || null, eventType || 'marketing_offer', imageUrl || null, delayMs || null);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- 24/7 VPS Server-Side Background WhatsApp Broadcast Engine ----
// This runs directly on the Linux server process so sending NEVER STOPS
// even if admin shuts down PC, closes browser, or turns off the screen.
let serverCampaign = {
  id: null,
  status: 'idle', // 'idle' | 'running' | 'paused' | 'stopped' | 'completed'
  caption: '',
  imageUrl: null,
  delaySeconds: 5,
  targets: [],
  currentIndex: 0,
  sentCount: 0,
  failedCount: 0,
  currentTarget: '',
  startedAt: null,
  finishedAt: null,
  logs: []
};

let serverCampaignActive = false;

async function runServerCampaignWorker() {
  if (serverCampaignActive) return;
  serverCampaignActive = true;

  console.log('[Server Campaign] Background broadcast worker started.');

  try {
    while (serverCampaign && serverCampaign.status === 'running') {
      if (serverCampaign.currentIndex >= serverCampaign.targets.length) {
        serverCampaign.status = 'completed';
        serverCampaign.finishedAt = Date.now();
        serverCampaign.currentTarget = '';
        console.log(`[Server Campaign] All ${serverCampaign.targets.length} messages sent successfully!`);
        break;
      }

      const target = serverCampaign.targets[serverCampaign.currentIndex];
      if (!target || !target.phone) {
        serverCampaign.currentIndex++;
        continue;
      }

      // Check if WhatsApp is currently connected
      const liveStatus = getWhatsAppLiveStatus();
      if (!liveStatus.connected) {
        console.warn('[Server Campaign] WhatsApp disconnected! Pausing campaign until reconnected.');
        serverCampaign.status = 'paused';
        serverCampaign.currentTarget = '⚠️ হোয়াটসঅ্যাপ সংযোগ বিচ্ছিন্ন (নতুন নম্বর লিংক করে Resume চাপুন)';
        break;
      }

      // Smart Anti-Ban: Every 25 messages, take a 45-second natural rest to prevent bulk spam flags
      if (serverCampaign.sentCount > 0 && serverCampaign.sentCount % 25 === 0) {
        console.log('[Server Campaign] Anti-Ban batch break: waiting 45s after 25 messages...');
        serverCampaign.currentTarget = '🛡️ অ্যান্টি-ব্যান বিশ্রাম বিরতি (৪৫ সেকেন্ড অপেক্ষা)...';
        let restElapsed = 0;
        while (restElapsed < 45000 && serverCampaign.status === 'running') {
          await new Promise(r => setTimeout(r, 1000));
          restElapsed += 1000;
        }
        if (serverCampaign.status !== 'running') break;
      }

      serverCampaign.currentTarget = `${target.name || 'কাস্টমার'} (${target.phone})`;

      // Subtle dynamic variation at the end so WhatsApp cannot flag identical message hashes
      const subtleVariations = [' ✨', ' 🛍️', ' 🌸', ' 🚀', ' 🌟', ''];
      const variation = subtleVariations[serverCampaign.sentCount % subtleVariations.length];

      const personalizedMsg = ((serverCampaign.caption || '') + variation)
        .replace(/\\n/g, '\n')
        .replace(/\{name\}/g, target.name || 'সম্মানিত গ্রাহক')
        .replace(/\{store\}/g, 'METRROMA')
        .replace(/\{phone\}/g, target.phone);

      try {
        const res = await sendBaileysMessage(
          target.phone,
          personalizedMsg,
          null,
          'marketing_offer',
          serverCampaign.imageUrl,
          serverCampaign.delaySeconds * 1000
        );

        const bdTime = new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Dhaka' });

        if (res?.sent !== false) {
          serverCampaign.sentCount++;
          serverCampaign.logs.unshift({
            phone: target.phone,
            name: target.name || 'কাস্টমার',
            time: bdTime,
            status: 'success'
          });
        } else {
          serverCampaign.failedCount++;
          serverCampaign.logs.unshift({
            phone: target.phone,
            name: target.name || 'কাস্টমার',
            time: bdTime,
            status: 'failed',
            error: res?.reason || 'Failed'
          });
        }
      } catch (err) {
        serverCampaign.failedCount++;
        serverCampaign.logs.unshift({
          phone: target.phone,
          name: target.name || 'কাস্টমার',
          time: new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Dhaka' }),
          status: 'failed',
          error: err?.message || 'Error'
        });
      }

      serverCampaign.logs = serverCampaign.logs.slice(0, 100);
      serverCampaign.currentIndex++;

      // Background Human Delay on the VPS
      if (serverCampaign.currentIndex < serverCampaign.targets.length && serverCampaign.status === 'running') {
        const waitMs = (serverCampaign.delaySeconds || 5) * 1000 + Math.floor(Math.random() * 800);
        let elapsed = 0;
        while (elapsed < waitMs && serverCampaign.status === 'running') {
          await new Promise(r => setTimeout(r, 400));
          elapsed += 400;
        }
      }
    }
  } catch (err) {
    console.error('[Server Campaign Worker Fatal]:', err);
  } finally {
    serverCampaignActive = false;
    console.log('[Server Campaign] Worker cycle finished. Current status:', serverCampaign?.status);
  }
}

app.get('/api/admin/whatsapp/campaign/status', adminAuth, requireRole('owner', 'manager'), (req, res) => {
  res.json({ ok: true, campaign: serverCampaign });
});

app.post('/api/admin/whatsapp/campaign/start', adminAuth, requireRole('owner', 'manager'), (req, res) => {
  const { targets, caption, imageUrl, delaySeconds } = req.body || {};
  if (!Array.isArray(targets) || targets.length === 0) {
    return res.status(400).json({ error: 'No targets specified' });
  }

  serverCampaign = {
    id: 'camp_' + Date.now(),
    status: 'running',
    caption: caption || '',
    imageUrl: imageUrl || null,
    delaySeconds: Math.max(3, Number(delaySeconds) || 5),
    targets,
    currentIndex: 0,
    sentCount: 0,
    failedCount: 0,
    currentTarget: '',
    startedAt: Date.now(),
    finishedAt: null,
    logs: []
  };

  runServerCampaignWorker().catch((e) => console.error('[Server Campaign Trigger Error]:', e));
  res.json({ ok: true, campaign: serverCampaign });
});

app.post('/api/admin/whatsapp/campaign/pause', adminAuth, requireRole('owner', 'manager'), (req, res) => {
  if (serverCampaign && serverCampaign.status === 'running') {
    serverCampaign.status = 'paused';
  }
  res.json({ ok: true, campaign: serverCampaign });
});

app.post('/api/admin/whatsapp/campaign/resume', adminAuth, requireRole('owner', 'manager'), (req, res) => {
  if (serverCampaign && serverCampaign.status === 'paused') {
    serverCampaign.status = 'running';
    runServerCampaignWorker().catch((e) => console.error('[Server Campaign Resume Error]:', e));
  }
  res.json({ ok: true, campaign: serverCampaign });
});

app.post('/api/admin/whatsapp/campaign/stop', adminAuth, requireRole('owner', 'manager'), (req, res) => {
  if (serverCampaign) {
    serverCampaign.status = 'stopped';
    serverCampaign.finishedAt = Date.now();
    serverCampaign.currentTarget = '';
  }
  res.json({ ok: true, campaign: serverCampaign });
});

// WhatsApp Marketing Audiences (Segmentation for Bulk Offers)
app.get('/api/admin/whatsapp/audiences', adminAuth, requireRole('owner', 'manager'), (req, res) => {
  try {
    const allCustomers = getCustomers() || [];
    const allOrders = getOrders() || [];
    const waChatContacts = getWaChatContacts() || [];

    const uniqueMap = new Map();

    // 1. WhatsApp Chat Contacts (Actual leads who messaged / interacted on WhatsApp)
    waChatContacts.forEach(w => {
      const rawPhone = String(w.phone || w.rawDigits || '').replace(/\D/g, '').slice(-11);
      if (rawPhone && rawPhone.length >= 10 && rawPhone.startsWith('01')) {
        uniqueMap.set(rawPhone, {
          phone: rawPhone,
          name: (w.name && w.name !== 'WhatsApp User' && w.name !== 'Valued Customer') ? w.name : 'হোয়াটসঅ্যাপ গ্রাহক',
          totalSpent: Number(w.totalSpent) || 0,
          ordersCount: Number(w.ordersCount) || 0,
          lastOrderDate: w.lastChatAt || '',
          lastChatAt: w.lastChatAt || '',
          lastMessage: w.lastMessage || 'হোয়াটসঅ্যাপ চ্যাট হিস্ট্রি',
          segment: (Number(w.ordersCount) > 0 ? 'customer' : 'wa_chat'),
          isWaChat: true,
          source: 'whatsapp_chat'
        });
      }
    });

    // 2. From customers collection
    allCustomers.forEach(c => {
      const rawPhone = String(c.phone || c.id || '').replace(/\D/g, '').slice(-11);
      if (rawPhone && rawPhone.length >= 10 && rawPhone.startsWith('01')) {
        const existing = uniqueMap.get(rawPhone);
        if (existing) {
          if (c.name && (!existing.name || existing.name === 'হোয়াটসঅ্যাপ গ্রাহক' || existing.name === 'WhatsApp User' || existing.name === 'Valued Customer')) {
            existing.name = c.name;
          }
          if (c.totalSpent) existing.totalSpent = Math.max(existing.totalSpent, Number(c.totalSpent) || 0);
          if (c.ordersCount) existing.ordersCount = Math.max(existing.ordersCount, Number(c.ordersCount) || 0);
          if (existing.ordersCount > 0) existing.segment = 'customer';
        } else {
          uniqueMap.set(rawPhone, {
            phone: rawPhone,
            name: c.name || 'সম্মানিত কাস্টমার',
            totalSpent: Number(c.totalSpent) || 0,
            ordersCount: Number(c.ordersCount) || 0,
            lastOrderDate: c.lastOrderDate || c.updatedAt || c.createdAt || '',
            lastChatAt: '',
            lastMessage: '',
            segment: (c.ordersCount > 0 ? 'customer' : 'lead'),
            isWaChat: false,
            source: 'store_customer'
          });
        }
      }
    });

    // 3. From orders collection to guarantee all order contacts are included
    allOrders.forEach(o => {
      const rawPhone = String(o.customer?.phone || '').replace(/\D/g, '').slice(-11);
      if (rawPhone && rawPhone.length >= 10 && rawPhone.startsWith('01')) {
        const existing = uniqueMap.get(rawPhone);
        if (existing) {
          if (o.customer?.name && (!existing.name || existing.name === 'হোয়াটসঅ্যাপ গ্রাহক' || existing.name === 'WhatsApp User' || existing.name === 'Valued Customer' || existing.name === 'সম্মানিত কাস্টমার')) {
            existing.name = o.customer.name;
          }
          if (o.status !== 'incomplete' && o.status !== 'cancelled') {
            existing.ordersCount = (existing.ordersCount || 0) + 1;
            existing.totalSpent = (existing.totalSpent || 0) + (Number(o.total) || 0);
            existing.segment = 'customer';
          }
          if (o.createdAt && (!existing.lastOrderDate || new Date(o.createdAt) > new Date(existing.lastOrderDate))) {
            existing.lastOrderDate = o.createdAt;
          }
        } else {
          const isSuccess = o.status !== 'incomplete' && o.status !== 'cancelled';
          uniqueMap.set(rawPhone, {
            phone: rawPhone,
            name: o.customer?.name || 'সম্মানিত কাস্টমার',
            totalSpent: isSuccess ? (Number(o.total) || 0) : 0,
            ordersCount: isSuccess ? 1 : 0,
            lastOrderDate: o.createdAt || '',
            lastChatAt: '',
            lastMessage: '',
            segment: isSuccess ? 'customer' : (o.status === 'incomplete' ? 'incomplete' : 'lead'),
            isWaChat: false,
            source: 'store_order'
          });
        }
      }
    });

    const audienceList = Array.from(uniqueMap.values());
    res.json({
      ok: true,
      totalCount: audienceList.length,
      customers: audienceList,
      counts: {
        all: audienceList.length,
        buyers: audienceList.filter(c => c.ordersCount > 0).length,
        incomplete: audienceList.filter(c => c.segment === 'incomplete' && c.ordersCount === 0).length,
        wa_chats: audienceList.filter(c => c.isWaChat === true).length,
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Sync past chat logs/contacts from Baileys auth session files into WhatsApp Chat Leads
app.post('/api/admin/whatsapp/sync-chats', adminAuth, requireRole('owner', 'manager'), (req, res) => {
  try {
    const result = syncWhatsAppSessionContacts();
    const contacts = getWaChatContacts();
    res.json({ ok: true, synced: result.synced || 0, totalContacts: contacts.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Export WhatsApp & Customer Contacts to CSV for Permanent Offline Backup (Anti-Ban Protection)
app.get('/api/admin/whatsapp/export-contacts', adminAuth, requireRole('owner', 'manager'), (req, res) => {
  try {
    const waChatContacts = getWaChatContacts() || [];
    const allCustomers = getCustomers() || [];
    const allOrders = getOrders() || [];
    const type = req.query.type || 'all';

    const uniqueMap = new Map();

    waChatContacts.forEach(w => {
      const p = String(w.phone || w.rawDigits || '').replace(/\D/g, '').slice(-11);
      if (p && p.length >= 10 && p.startsWith('01')) {
        uniqueMap.set(p, {
          phone: p,
          name: (w.name && w.name !== 'WhatsApp User') ? w.name : 'হোয়াটসঅ্যাপ গ্রাহক',
          ordersCount: Number(w.ordersCount) || 0,
          totalSpent: Number(w.totalSpent) || 0,
          lastActive: w.lastChatAt ? new Date(w.lastChatAt).toLocaleString('en-BD', { timeZone: 'Asia/Dhaka' }) : '',
          source: 'WhatsApp Inbox Chat',
          isWaChat: true
        });
      }
    });

    allCustomers.forEach(c => {
      const p = String(c.phone || c.id || '').replace(/\D/g, '').slice(-11);
      if (p && p.length >= 10 && p.startsWith('01')) {
        const ex = uniqueMap.get(p);
        if (ex) {
          if (c.name && (!ex.name || ex.name === 'হোয়াটসঅ্যাপ গ্রাহক')) ex.name = c.name;
          if (c.ordersCount) ex.ordersCount = Math.max(ex.ordersCount, Number(c.ordersCount) || 0);
          if (c.totalSpent) ex.totalSpent = Math.max(ex.totalSpent, Number(c.totalSpent) || 0);
        } else {
          uniqueMap.set(p, {
            phone: p,
            name: c.name || 'কাস্টমার',
            ordersCount: Number(c.ordersCount) || 0,
            totalSpent: Number(c.totalSpent) || 0,
            lastActive: c.lastOrderDate || '',
            source: 'Website Customer',
            isWaChat: false
          });
        }
      }
    });

    allOrders.forEach(o => {
      const p = String(o.customer?.phone || '').replace(/\D/g, '').slice(-11);
      if (p && p.length >= 10 && p.startsWith('01')) {
        const ex = uniqueMap.get(p);
        if (ex) {
          if (o.customer?.name && (!ex.name || ex.name === 'হোয়াটসঅ্যাপ গ্রাহক' || ex.name === 'কাস্টমার')) ex.name = o.customer.name;
          if (o.status !== 'incomplete' && o.status !== 'cancelled') {
            ex.ordersCount = (ex.ordersCount || 0) + 1;
            ex.totalSpent = (ex.totalSpent || 0) + (Number(o.total) || 0);
          }
        }
      }
    });

    let list = Array.from(uniqueMap.values());
    if (type === 'wa_chats') {
      list = list.filter(c => c.isWaChat);
    } else if (type === 'buyers') {
      list = list.filter(c => c.ordersCount > 0);
    }

    const rows = [
      ['Phone Number', 'Customer Name', 'Total Orders', 'Total Spent (BDT)', 'Last Active Date', 'Source Channel']
    ];
    list.forEach(item => {
      rows.push([
        `"${item.phone}"`,
        `"${String(item.name).replace(/"/g, '""')}"`,
        item.ordersCount,
        item.totalSpent,
        `"${item.lastActive}"`,
        `"${item.source}"`
      ]);
    });

    const csvContent = '\uFEFF' + rows.map(r => r.join(',')).join('\r\n');
    const filename = `METRROMA_Contacts_Backup_${type}_${new Date().toISOString().slice(0, 10)}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvContent);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Universal courier webhook endpoint (Multi-Account Support for Pathao, Steadfast, CarryBee, RedX, Generic) ----
app.all([
  '/api/webhooks/:provider/:accId',
  '/api/webhook/:provider/:accId',
  '/api/webhooks/:provider',
  '/api/webhook/:provider',
  '/api/webhooks',
  '/api/webhook',
], (req, res) => {
  console.log('[WEBHOOK]', req.method, req.url, 'headers:', JSON.stringify(req.headers), 'body:', JSON.stringify(req.body));
  const allSavedCouriers = getIntegrations()?.couriers || [];
  const pathParts = (req.path || '').split('/').filter(Boolean);
  // e.g. /api/webhooks/carrybee/c123 -> parts: ['api', 'webhooks', 'carrybee', 'c123']
  const provParam = String(req.params?.provider || (pathParts[2] && !pathParts[2].startsWith('c') ? pathParts[2] : '')).toLowerCase();
  const accIdParam = String(req.params?.accId || req.query?.acc || req.query?.accId || (pathParts[3] || (pathParts[2] && pathParts[2].startsWith('c') ? pathParts[2] : ''))).trim();

  const incomingSecret = String(req.query?.secret || req.body?.secret || req.body?.Secret || '').trim();
  const incomingCbHeader = String(
    req.get('x-cb-webhook-integration-header') ||
    req.headers['x-cb-webhook-integration-header'] ||
    req.get('X-CB-Webhook-Integration-Header') ||
    req.get('headervalue') ||
    req.get('HeaderValue') ||
    req.get('Header-Value') ||
    req.get('x-carrybee-webhook-signature') ||
    req.body?.HeaderValue ||
    req.body?.headerValue ||
    req.body?.challenge ||
    req.body?.secret ||
    req.query?.HeaderValue ||
    req.query?.headerValue ||
    req.query?.secret ||
    ''
  ).trim();
  const incomingPathaoSecret = String(
    req.get('x-pathao-merchant-webhook-integration-secret') ||
    req.headers['x-pathao-merchant-webhook-integration-secret'] ||
    req.get('X-Pathao-Merchant-Webhook-Integration-Secret') ||
    ''
  ).trim();

  // Find exact courier instance:
  let matchedCourier = null;
  // 1. Priority: match by account ID (exact or partial prefix match)
  if (accIdParam) {
    matchedCourier = allSavedCouriers.find((c) => c.id === accIdParam || (c.id && (c.id.startsWith(accIdParam) || accIdParam.startsWith(c.id))));
  }
  // 2. Priority: match by unique webhookSecret
  if (!matchedCourier && incomingSecret) {
    matchedCourier = allSavedCouriers.find((c) => c.webhookSecret === incomingSecret);
  }
  if (!matchedCourier && incomingCbHeader) {
    matchedCourier = allSavedCouriers.find((c) => c.webhookSecret === incomingCbHeader);
  }
  if (!matchedCourier && incomingPathaoSecret) {
    matchedCourier = allSavedCouriers.find((c) => c.webhookSecret === incomingPathaoSecret);
  }
  // 3. Fallback: match by provider name from URL path
  if (!matchedCourier && provParam) {
    matchedCourier = allSavedCouriers.find((c) => String(c.provider || '').toLowerCase() === provParam);
  }
  // 4. Fallback if courier provider matches path
  if (!matchedCourier) {
    for (const p of ['carrybee', 'steadfast', 'pathao', 'redx']) {
      if (req.path.toLowerCase().includes(p)) {
        matchedCourier = allSavedCouriers.find((c) => String(c.provider || '').toLowerCase() === p);
        break;
      }
    }
  }

  const detectedProv = (matchedCourier?.provider || provParam || (req.path.includes('carrybee') ? 'carrybee' : req.path.includes('pathao') ? 'pathao' : req.path.includes('steadfast') ? 'steadfast' : req.path.includes('redx') ? 'redx' : 'courier')).toLowerCase();

  // Pathao secret header echo:
  const pathaoEchoValue = incomingPathaoSecret || incomingSecret || matchedCourier?.webhookSecret || '';
  if (pathaoEchoValue) {
    res.setHeader('X-Pathao-Merchant-Webhook-Integration-Secret', pathaoEchoValue);
  }

  // CarryBee Handshake / Response Header:
  const cbEchoValue = incomingCbHeader || incomingSecret || matchedCourier?.webhookSecret || '40489fe0-9386-4fc9-8e92-2b2fcb9d451c';
  const finalHeaderValue = String(matchedCourier?.headerValue || '40489fe0-9386-4fc9-8e92-2b2fcb9d451c').trim();
  res.setHeader('X-CB-Webhook-Integration-Header', finalHeaderValue);
  res.setHeader('x-cb-webhook-integration-header', finalHeaderValue);
  res.setHeader('HeaderValue', finalHeaderValue);
  res.setHeader('Header-Value', finalHeaderValue);
  res.setHeader('headervalue', finalHeaderValue);
  res.setHeader('X-Carrybee-Webhook-Signature', cbEchoValue);
  res.setHeader('X-Webhook-Secret', cbEchoValue);

  // Echo any custom x-cb or x-pathao headers from request
  for (const [k, v] of Object.entries(req.headers || {})) {
    if (k.toLowerCase().startsWith('x-cb-') || k.toLowerCase().startsWith('x-pathao-')) {
      try { res.setHeader(k, v); } catch {}
    }
  }

  const isCarryBee = detectedProv === 'carrybee' || !!incomingCbHeader || req.path.toLowerCase().includes('carrybee');
  // CarryBee requires HTTP 202 Accepted; other couriers expect HTTP 200 OK
  const ackStatus = isCarryBee ? 202 : 200;

  const handshakeResponse = {
    success: true,
    status: 'ok',
    ok: true,
    message: 'CarryBee Webhook Handshake successful',
    account: matchedCourier?.id || 'default',
    provider: detectedProv,
    secret: cbEchoValue,
    HeaderValue: finalHeaderValue,
    HeaderKey: 'X-CB-Webhook-Integration-Header',
    headerValue: finalHeaderValue,
    headerKey: 'X-CB-Webhook-Integration-Header',
    'Header-Value': finalHeaderValue,
    data: {
      HeaderValue: finalHeaderValue,
      HeaderKey: 'X-CB-Webhook-Integration-Header',
      headerValue: finalHeaderValue,
      headerKey: 'X-CB-Webhook-Integration-Header',
      secret: cbEchoValue,
    }
  };

  if (req.method === 'GET' || req.method === 'OPTIONS' || req.method === 'HEAD') {
    return res.status(ackStatus).json(handshakeResponse);
  }

  const b = req.body || {};

  // Handshake verification event from Pathao or CarryBee or test ping
  const isCarryBeePing = isCarryBee && (!b.consignment_id && !b.order_id && !b.tracking_code);
  if (b.event === 'webhook_integration' || b.type === 'handshake' || b.test || isCarryBeePing) {
    return res.status(ackStatus).json(handshakeResponse);
  }

  // Live parcel status update event (supports Pathao, Steadfast, CarryBee, RedX, Paperfly)
  const consignment = String(b.consignment_id || b.consignment || b.tracking_code || b.tracking_id || '').trim();
  const orderId = String(b.merchant_order_id || b.order_id || b.invoice || b.invoice_id || b.merchant_invoice_id || '').trim();
  const rawStatus = String(b.order_status || b.status || b.delivery_status || '').trim();
  const riderNote = String(b.status_reason || b.note || b.rider_note || b.comment || b.reason || '').trim();

  if (consignment || orderId) {
    const orders = getOrders();
    const o = orders.find((x) => (orderId && (x.id === orderId || x.id === 'DOT-' + orderId || 'DOT-' + x.id === orderId)) || 
                                 (consignment && x.courier?.consignment === consignment));
    if (o) {
      const mapped = mapCourierStatus(rawStatus);
      const patch = {
        courier: {
          ...o.courier,
          liveStatus: rawStatus,
          riderNote: riderNote || o.courier?.riderNote || '',
          lastSync: new Date().toISOString(),
          ...(matchedCourier ? { accountId: matchedCourier.id, name: matchedCourier.label || matchedCourier.provider } : {})
        },
      };

      let effectiveMapped = mapped;
      if ((o.status === 'shipped' || o.status === 'delivered') && (effectiveMapped === 'confirmed' || effectiveMapped === 'pending' || !effectiveMapped)) {
        effectiveMapped = o.status;
      }

      const changed = effectiveMapped && effectiveMapped !== o.status;
      if (changed) {
        patch.status = effectiveMapped;
        const history = Array.isArray(o.history) ? [...o.history] : [];
        history.push({
          status: mapped,
          at: new Date().toISOString(),
          note: riderNote ? `Courier Webhook (${matchedCourier?.label || detectedProv}): ${rawStatus} · Note: ${riderNote}` : `Courier Webhook (${matchedCourier?.label || detectedProv}): ${rawStatus}`,
        });
        patch.history = history;
      } else if (riderNote && riderNote !== o.courier?.riderNote) {
        const history = Array.isArray(o.history) ? [...o.history] : [];
        history.push({
          status: o.status,
          at: new Date().toISOString(),
          note: `Courier Rider Note: ${riderNote}`,
        });
        patch.history = history;
      }

      const updated = updateOrder(o.id, patch);
      if (changed && updated) notifyOrder(updated, 'status');
    }
  }

  res.status(ackStatus).json({
    ok: true,
    status: 'received',
    provider: detectedProv,
    account: matchedCourier?.id || 'default',
    HeaderKey: 'X-CB-Webhook-Integration-Header',
    HeaderValue: cbEchoValue,
    headerKey: 'X-CB-Webhook-Integration-Header',
    headerValue: cbEchoValue,
  });
});

// ---- warehouse QR code / barcode scanner (ship, receive return & restock, lookup) ----
app.post('/api/admin/scanner/scan', adminAuth, (req, res) => {
  const { code, mode, courierName } = req.body || {};
  const query = String(code || '').trim().toUpperCase();
  if (!query) return res.status(400).json({ error: 'scan code required' });

  const orders = getOrders();
  // Find by order ID (e.g. DOT-XXXX or XXXX), or by courier consignment
  const o = orders.find((x) => x.id === query || x.id === 'DOT-' + query || (x.courier && x.courier.consignment && x.courier.consignment.toUpperCase() === query));

  if (!o) return res.status(404).json({ error: `No order found matching "${query}"` });

  if (req.admin.role === 'staff' && Array.isArray(req.admin.allowedProducts) && req.admin.allowedProducts.length > 0) {
    const allowed = req.admin.allowedProducts;
    const hasAccess = (o.items || []).some((it) => allowed.includes(String(it.id)) || allowed.includes(String(it.slug)));
    if (!hasAccess) return res.status(403).json({ error: 'You do not have permission to process orders for this product' });
  }

  const dist = (o.customer?.district || o.customer?.address || '').toLowerCase();
  const isDhaka = ['dhaka', 'gazipur', 'narayanganj', 'savar', 'gulshan', 'dhanmondi', 'uttara', 'mirpur'].some((x) => dist.includes(x));
  const suggested = isDhaka ? 'Pathao' : 'Steadfast';

  if (mode === 'ship') {
    let assignedCourier = o.courier ? { ...o.courier } : {};
    let warning = null;

    if (courierName && courierName !== 'auto') {
      if (o.courier?.name && o.courier.name.toLowerCase() !== courierName.toLowerCase()) {
        warning = `Caution: Order was originally assigned to ${o.courier.name}! Handing over to ${courierName}.`;
      }
      assignedCourier.name = courierName;
    } else if (!assignedCourier.name) {
      assignedCourier.name = suggested;
    }

    const history = Array.isArray(o.history) ? [...o.history] : [];
    history.push({ status: 'shipped', at: new Date().toISOString(), note: `Dispatched via QR Scanner (${assignedCourier.name})` });
    const updated = updateOrder(o.id, { status: 'shipped', courier: assignedCourier, history }) || o;
    notifyOrder(updated, 'status');
    return res.json({
      ok: true,
      action: 'shipped',
      order: updated,
      courier: assignedCourier.name,
      consignment: assignedCourier.consignment || '',
      suggested,
      warning,
      zone: isDhaka ? 'Inside Dhaka' : 'Outside Dhaka',
    });
  }

  if (mode === 'return') {
    const history = Array.isArray(o.history) ? [...o.history] : [];
    history.push({ status: 'return', at: new Date().toISOString(), note: 'Return Received & Products Restocked via QR Scanner' });
    const updated = updateOrder(o.id, { status: 'return', history }) || o;
    // Auto-restock products
    const cat = getCatalog();
    let restocked = false;
    for (const item of (o.items || [])) {
      const p = cat.products.find((x) => x.id === item.id);
      if (p && p.stock != null) {
        p.stock += item.qty || 1;
        if (p.stock > 0) p.soldOut = false;
        restocked = true;
      }
    }
    if (restocked) saveCatalog(cat);
    notifyOrder(updated, 'status');
    return res.json({ ok: true, action: 'return_received', order: updated, restocked: o.items });
  }

  if (mode === 'return_lost' || mode === 'lost' || mode === 'damaged') {
    const history = Array.isArray(o.history) ? [...o.history] : [];
    const isDamaged = mode === 'damaged';
    const noteText = isDamaged 
      ? `Parcel Returned DAMAGED / BROKEN. Courier compensation claim needed for Tk ${o.total || 0}.`
      : `Parcel LOST / MISSING by Courier (${o.courier?.name || 'Courier'}). Compensation claim needed for Tk ${o.total || 0}.`;

    history.push({ status: 'cancelled', at: new Date().toISOString(), note: noteText });
    const updated = updateOrder(o.id, { 
      status: 'cancelled', 
      lossClaim: { 
        type: isDamaged ? 'damaged' : 'lost_in_courier', 
        amount: o.total || 0, 
        courier: o.courier?.name || '', 
        consignment: o.courier?.consignment || '',
        flaggedAt: new Date().toISOString() 
      },
      history 
    }) || o;

    notifyOrder(updated, 'status');
    return res.json({ 
      ok: true, 
      action: 'lost_flagged', 
      order: updated, 
      claimAmount: o.total || 0,
      courier: o.courier?.name || 'Courier' 
    });
  }

  // Lookup mode
  res.json({
    ok: true,
    action: 'lookup',
    order: o,
    courier: o.courier?.name || suggested,
    consignment: o.courier?.consignment || '',
    suggested,
    zone: isDhaka ? 'Inside Dhaka' : 'Outside Dhaka',
  });
});

// ==========================================
// CUSTOMER VIP ACCOUNT SYSTEM (PHONE OTP)
// ==========================================
const customerOtpCache = new Map(); // cleanPhone -> { code, name, expiresAt, attempts }
const customerSessions = new Map(); // token -> { phone, expiresAt }
const CUST_SESSION_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days

function resolveCustomer(req) {
  const token = req.get('x-customer-token') || '';
  if (!token) return null;
  const sess = customerSessions.get(token);
  if (!sess) return null;
  if (Date.now() > sess.expiresAt) {
    customerSessions.delete(token);
    return null;
  }
  let cust = null;
  if (sess.id) cust = getCustomers().find((x) => x.id === sess.id);
  if (!cust && sess.email) cust = getCustomerByEmail(sess.email);
  if (!cust && sess.phone) cust = getCustomerByPhone(sess.phone);
  return cust;
}

function customerAuth(req, res, next) {
  const cust = resolveCustomer(req);
  if (!cust) return res.status(401).json({ error: 'Please sign in to your VIP account' });
  req.customer = cust;
  next();
}

function enrichCustomer(cust) {
  if (!cust) return null;
  const cleanPhone = String(cust.phone || '').replace(/\D/g, '').slice(-11);
  const custEmail = String(cust.email || '').trim().toLowerCase();
  const allOrders = getOrders() || [];
  const myOrders = allOrders.filter((o) => {
    if (o.status === 'cancelled') return false;
    const oPhone = String(o.customer?.phone || '').replace(/\D/g, '').slice(-11);
    const oEmail = String(o.customer?.email || '').trim().toLowerCase();
    if (cleanPhone && oPhone && oPhone === cleanPhone) return true;
    if (custEmail && oEmail && oEmail === custEmail) return true;
    return false;
  });

  const deliveredOrders = myOrders.filter((o) => o.status === 'delivered');
  const totalSpent = deliveredOrders.reduce((s, o) => s + (Number(o.total) || 0), 0);

  let tier = 'VIP Member';
  if (totalSpent >= 15000) tier = 'Platinum VIP';
  else if (totalSpent >= 7500) tier = 'Gold VIP';
  else if (totalSpent >= 3000) tier = 'Silver VIP';

  const hasUsedWelcome = cust.welcomeCouponUsed || myOrders.some((o) => String(o.coupon || '').toUpperCase() === 'WELCOME5');

  return {
    id: cust.id,
    phone: cust.phone || '',
    name: cust.name || 'VIP Member',
    email: cust.email || '',
    picture: cust.picture || '',
    ordersCount: myOrders.length,
    totalSpent,
    tier,
    savedAddress: cust.savedAddress || { address: '', district: '', thana: '', area: 'outside' },
    wishlist: Array.isArray(cust.wishlist) ? cust.wishlist : [],
    firstOrderDiscountAvailable: !hasUsedWelcome && myOrders.length === 0,
    welcomeCoupon: 'WELCOME5',
    createdAt: cust.createdAt,
    orders: myOrders.map((o) => ({
      id: o.id,
      createdAt: o.createdAt,
      status: o.status,
      total: o.total,
      subtotal: o.itemsTotal || o.subtotal,
      shippingCost: o.delivery != null ? o.delivery : o.shippingCost,
      discount: o.discount,
      coupon: o.coupon,
      items: o.items || [],
      courier: o.courier || null,
      address: o.customer?.address || '',
      district: o.customer?.district || '',
      thana: o.customer?.thana || '',
    })),
  };
}

// 1. Send OTP (Strict Log In vs Sign Up separation with 1m->10m timer & device limits)
app.post('/api/customer/send-otp', async (req, res) => {
  const mode = req.body?.mode === 'signup' ? 'signup' : 'login';
  let email = String(req.body?.email || '').trim().toLowerCase();
  let phone = String(req.body?.phone || '').replace(/\D/g, '').slice(-11);
  const identifier = String(req.body?.identifier || '').trim();
  const name = String(req.body?.name || '').trim().slice(0, 50);

  // Allow flexible identifier in login mode (either email or phone)
  if (identifier) {
    if (identifier.includes('@')) {
      email = identifier.toLowerCase();
    } else {
      phone = identifier.replace(/\D/g, '').slice(-11);
    }
  }

  const rawDid = req.headers['x-device-id'] || req.body?.deviceId || '';
  const deviceId = String(rawDid).trim();

  if (mode === 'signup') {
    // Validate required signup fields
    if (!name) {
      return res.status(400).json({ error: 'Please enter your full name' });
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address (e.g. example@gmail.com)' });
    }
    if (!phone || !/^01[3-9]\d{8}$/.test(phone)) {
      return res.status(400).json({ error: 'Please enter a valid 11-digit mobile number (01XXXXXXXXX)' });
    }

    // A. Anti-Abuse Device Limit: Prevent creating multiple fake accounts from the same device
    if (deviceId && deviceId !== 'unknown_device') {
      const deviceAccounts = getCustomers().filter((c) => c.deviceId && c.deviceId === deviceId);
      if (deviceAccounts.length >= 1) {
        return res.status(403).json({
          error: 'An account has already been registered from this device. Please use Log In to access your account.'
        });
      }
    }

    // B. Prevent duplicate accounts with existing email or phone
    const existingEmail = getCustomerByEmail(email);
    const existingPhone = getCustomerByPhone(phone);
    if (existingEmail || existingPhone) {
      return res.status(400).json({
        error: 'An account already exists with this ' + (existingEmail ? 'email address' : 'mobile number') + '. Please Log In instead.'
      });
    }
  } else {
    // --- LOG IN MODE ---
    if (!email && !phone) {
      return res.status(400).json({ error: 'Please enter your registered email or 11-digit mobile number' });
    }

    // Must verify that account already exists
    let cust = null;
    if (email) cust = getCustomerByEmail(email);
    if (!cust && phone) cust = getCustomerByPhone(phone);
    if (!cust) {
      return res.status(404).json({
        error: 'No account found with this ' + (email ? 'email address' : 'mobile number') + '. Please click Sign Up to create an account.'
      });
    }
    if (cust.email && !email) email = cust.email;
    if (cust.phone && !phone) phone = cust.phone;
  }

  // --- RESEND TIMER CHECK (1 min for 1st resend, 10 min for subsequent) ---
  const cacheKey = (email || phone).toLowerCase();
  const prev = customerOtpCache.get(cacheKey) || (phone ? customerOtpCache.get(phone) : null) || (email ? customerOtpCache.get(email) : null);

  if (prev) {
    const resendCount = prev.resendCount || 0;
    const requiredWaitMs = resendCount === 0 ? 60 * 1000 : 10 * 60 * 1000;
    const elapsed = Date.now() - (prev.lastSentAt || 0);
    if (elapsed < requiredWaitMs) {
      const remSec = Math.ceil((requiredWaitMs - elapsed) / 1000);
      const remText = remSec > 60 ? `${Math.ceil(remSec / 60)} minute(s)` : `${remSec} second(s)`;
      return res.status(429).json({ error: `Please wait ${remText} before requesting another code.` });
    }
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const newResendCount = prev ? (prev.resendCount || 0) + 1 : 0;

  const otpPayload = {
    code,
    mode,
    email,
    phone,
    name: name || (prev?.name || ''),
    deviceId,
    resendCount: newResendCount,
    lastSentAt: Date.now(),
    expiresAt: Date.now() + 15 * 60 * 1000,
    attempts: 0,
  };
  if (email) customerOtpCache.set(email.toLowerCase(), otpPayload);
  if (phone) customerOtpCache.set(phone, otpPayload);

  const storeName = getSettings().storeName || 'METRROMA';
  let emailSent = false;

  // Send Code via Email API
  if (email) {
    const emailHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:24px;background:#090d16;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#ffffff;">
  <div style="max-width:480px;margin:0 auto;background:#131c2e;border:1px solid rgba(255,255,255,0.12);border-radius:16px;padding:32px 24px;text-align:center;">
    <div style="font-size:20px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:#e7b486;margin-bottom:6px;">${storeName}</div>
    <div style="font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#94a3b8;margin-bottom:20px;">
      ${mode === 'signup' ? 'VIP Account Registration' : 'VIP Account Login'}
    </div>
    
    <p style="font-size:14px;color:#cbd5e1;margin:0 0 16px;line-height:1.5;">
      Hello ${name || 'VIP Member'},<br>
      Your 6-digit ${mode === 'signup' ? 'registration' : 'login'} verification code is:
    </p>

    <div style="background:rgba(231,180,134,0.12);border:2px solid #e7b486;border-radius:12px;padding:14px 24px;display:inline-block;margin:12px 0 20px;">
      <span style="font-size:32px;font-weight:800;letter-spacing:0.25em;color:#ffffff;">${code}</span>
    </div>

    <p style="font-size:12.5px;color:#94a3b8;margin:0;line-height:1.5;">
      This code is valid for 15 minutes. If you did not request this, please ignore this email.
    </p>
  </div>
</body>
</html>`.trim();

    try {
      const emailRes = await sendEmail(email, `${storeName} ${mode === 'signup' ? 'Registration' : 'Login'} Code: ${code}`, emailHtml);
      if (emailRes && emailRes.ok) emailSent = true;
    } catch (err) {
      console.warn('[Customer OTP] Email send error:', err.message);
    }
  }

  // Also send via SMS if phone is provided
  if (phone) {
    const smsText = `${storeName}: Your ${mode === 'signup' ? 'registration' : 'login'} code is ${code}. Valid for 15 minutes.`;
    await sendSMS(phone, smsText).catch(() => ({ ok: false }));
  }

  res.json({
    ok: true,
    message: emailSent
      ? `Verification code sent to ${email}`
      : `Verification code sent to ${email || '+88 ' + phone}`,
    nextWaitSeconds: newResendCount === 0 ? 60 : 600,
    demoCode: emailSent ? undefined : code,
  });
});

// 2. Verify OTP and authenticate/create customer
app.post('/api/customer/verify-otp', (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const phone = String(req.body?.phone || '').replace(/\D/g, '').slice(-11);
  const identifier = String(req.body?.identifier || '').trim().toLowerCase();
  const code = String(req.body?.code || '').trim();
  const name = String(req.body?.name || '').trim().slice(0, 50);

  if (!code) {
    return res.status(400).json({ error: 'Verification code is required' });
  }

  const cached = (email ? customerOtpCache.get(email) : null) || (phone ? customerOtpCache.get(phone) : null) || (identifier ? customerOtpCache.get(identifier) : null);

  if (!cached) {
    return res.status(400).json({ error: 'Verification code expired or not requested. Please request a new code.' });
  }
  if (Date.now() > cached.expiresAt) {
    if (email) customerOtpCache.delete(email);
    if (phone) customerOtpCache.delete(phone);
    return res.status(400).json({ error: 'Verification code expired. Please request a new one.' });
  }

  if (cached.code !== code) {
    cached.attempts = (cached.attempts || 0) + 1;
    if (cached.attempts >= 5) {
      if (email) customerOtpCache.delete(email);
      if (phone) customerOtpCache.delete(phone);
      return res.status(400).json({ error: 'Too many incorrect attempts. Please request a new code.' });
    }
    return res.status(400).json({ error: 'Invalid verification code. Please check and try again.' });
  }

  if (email) customerOtpCache.delete(email);
  if (phone) customerOtpCache.delete(phone);

  const finalEmail = email || cached.email || '';
  const cleanPhone = phone || cached.phone || '';
  let cust = null;
  if (finalEmail) cust = getCustomerByEmail(finalEmail);
  if (!cust && cleanPhone) cust = getCustomerByPhone(cleanPhone);

  let isNew = false;
  if (!cust) {
    isNew = true;
    cust = saveCustomer({
      id: 'cust_' + randomUUID().slice(0, 8),
      phone: cleanPhone,
      email: finalEmail,
      name: name || cached.name || 'VIP Member',
      deviceId: cached.deviceId || '',
      savedAddress: { address: '', district: '', thana: '', area: 'outside' },
      wishlist: [],
      welcomeCouponUsed: false,
    });
  } else {
    // Returning customer logging in — DOES NOT create a new account or new coupon!
    const updates = { ...cust };
    if (name && cust.name !== name) updates.name = name;
    if (finalEmail && (!cust.email || cust.email !== finalEmail)) updates.email = finalEmail;
    if (cleanPhone && (!cust.phone || cust.phone !== cleanPhone)) updates.phone = cleanPhone;
    if (cached.deviceId && !cust.deviceId) updates.deviceId = cached.deviceId;
    cust = saveCustomer(updates);
  }

  const token = 'cust_' + randomBytes(24).toString('hex');
  customerSessions.set(token, { id: cust.id, phone: cust.phone, email: cust.email, expiresAt: Date.now() + CUST_SESSION_TTL });

  res.json({
    ok: true,
    token,
    isNew,
    customer: enrichCustomer(cust),
  });
});

// 2b. Authenticate with Google OAuth 2.0 / Identity Services
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '768607828735-81q2voar33po1rc9qnvakheil5h8oeri.apps.googleusercontent.com';

app.post('/api/customer/google', async (req, res) => {
  const credential = String(req.body?.credential || '').trim();
  const deviceId = String(req.body?.deviceId || req.get('x-device-id') || '').trim();

  if (!credential) {
    return res.status(400).json({ error: 'Google credential token is required' });
  }

  try {
    const gResp = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
    if (!gResp.ok) {
      const errData = await gResp.json().catch(() => ({}));
      return res.status(401).json({ error: errData.error_description || 'Invalid Google credential token' });
    }

    const payload = await gResp.json();

    // Verify token audience matches our Client ID
    const audMatch = payload.aud === GOOGLE_CLIENT_ID || payload.azp === GOOGLE_CLIENT_ID;
    if (!audMatch) {
      return res.status(401).json({ error: 'Google token audience mismatch' });
    }

    const email = String(payload.email || '').trim().toLowerCase();
    if (!email) {
      return res.status(400).json({ error: 'No email address found in Google account' });
    }

    const name = String(payload.name || '').trim().slice(0, 60);
    const googleId = String(payload.sub || '');
    const picture = String(payload.picture || '');

    // Look up existing customer by email
    let cust = getCustomerByEmail(email);
    let isNew = false;

    if (!cust) {
      isNew = true;
      cust = saveCustomer({
        id: 'cust_' + randomUUID().slice(0, 8),
        phone: '',
        email,
        name: name || 'VIP Member',
        googleId,
        picture,
        deviceId,
        savedAddress: { address: '', district: '', thana: '', area: 'outside' },
        wishlist: [],
        welcomeCouponUsed: false,
      });
    } else {
      const updates = { ...cust };
      if ((!cust.name || cust.name === 'VIP Member') && name) updates.name = name;
      if (!cust.googleId && googleId) updates.googleId = googleId;
      if (!cust.picture && picture) updates.picture = picture;
      if (deviceId && !cust.deviceId) updates.deviceId = deviceId;
      cust = saveCustomer(updates);
    }

    const token = 'cust_' + randomBytes(24).toString('hex');
    customerSessions.set(token, {
      id: cust.id,
      phone: cust.phone || '',
      email: cust.email,
      expiresAt: Date.now() + CUST_SESSION_TTL,
    });

    res.json({
      ok: true,
      token,
      isNew,
      customer: enrichCustomer(cust),
    });
  } catch (err) {
    console.error('Google auth error:', err);
    res.status(500).json({ error: 'Failed to verify Google sign-in. Please try again.' });
  }
});

// 3. Get currently logged in customer
app.get('/api/customer/me', customerAuth, (req, res) => {
  res.json({ ok: true, customer: enrichCustomer(req.customer) });
});

// 4. Update customer profile & address
app.put('/api/customer/profile', customerAuth, (req, res) => {
  const b = req.body || {};
  const patch = {};
  if (typeof b.name === 'string') patch.name = b.name.trim().slice(0, 60);
  if (typeof b.email === 'string') patch.email = b.email.trim().slice(0, 80);
  if (typeof b.phone === 'string') patch.phone = b.phone.replace(/\D/g, '').slice(-11);
  if (b.savedAddress && typeof b.savedAddress === 'object') {
    patch.savedAddress = {
      address: String(b.savedAddress.address || '').trim().slice(0, 200),
      district: String(b.savedAddress.district || '').trim().slice(0, 50),
      thana: String(b.savedAddress.thana || '').trim().slice(0, 50),
      area: b.savedAddress.district === 'Dhaka' ? 'inside' : 'outside',
    };
  }
  const updated = saveCustomer({ ...req.customer, ...patch });
  res.json({ ok: true, customer: enrichCustomer(updated) });
});

// 5. Toggle wishlist item
app.post('/api/customer/wishlist', customerAuth, (req, res) => {
  const pid = String(req.body?.productId || '').trim();
  if (!pid) return res.status(400).json({ error: 'productId required' });
  const list = Array.isArray(req.customer.wishlist) ? [...req.customer.wishlist] : [];
  const idx = list.indexOf(pid);
  if (idx >= 0) list.splice(idx, 1);
  else list.push(pid);
  const updated = saveCustomer({ ...req.customer, wishlist: list });
  res.json({ ok: true, wishlist: updated.wishlist });
});

// 6. Logout
app.post('/api/customer/logout', (req, res) => {
  const token = req.get('x-customer-token');
  if (token) customerSessions.delete(token);
  res.json({ ok: true });
});

// 7. Admin Customer Management
app.get('/api/admin/customers', adminAuth, (req, res) => {
  syncCustomersFromOrders();
  const allCust = getCustomers();
  const allOrders = getOrders() || [];
  const enriched = allCust.map((c) => {
    const cleanPhone = String(c.phone).replace(/\D/g, '').slice(-11);
    const myOrders = allOrders.filter((o) => {
      if (o.status === 'cancelled') return false;
      const oPhone = String(o.customer?.phone || '').replace(/\D/g, '').slice(-11);
      return oPhone === cleanPhone;
    });
    const delivered = myOrders.filter((o) => o.status === 'delivered');
    const totalSpent = delivered.reduce((s, o) => s + (Number(o.total) || 0), 0);
    const lastOrder = myOrders[0]?.createdAt || c.createdAt;
    return {
      id: c.id,
      phone: c.phone,
      name: c.name || 'VIP Member',
      email: c.email || '',
      ordersCount: myOrders.length,
      totalSpent,
      savedAddress: c.savedAddress || null,
      createdAt: c.createdAt,
      lastOrderAt: lastOrder,
      welcomeCouponUsed: c.welcomeCouponUsed || myOrders.some((o) => String(o.coupon || '').toUpperCase() === 'WELCOME5'),
    };
  });
  res.json({ customers: enriched });
});

// ---- serve built frontend in production ----
const dist = join(__dir, '..', 'web', 'dist');
if (existsSync(dist)) {
  app.get(['/shakilecom', '/shakilecom.apk', '/ShakilEcom.apk'], (_req, res) => {
    const candidatePaths = [
      join(__dir, '..', 'private', 'admin-apks', 'ShakilEcom.apk'),
      join(__dir, 'data', 'private_apk', 'ShakilEcom.apk'),
      '/var/www/dot/private/admin-apks/ShakilEcom.apk',
      '/root/metrroma-backups/apks/ShakilEcom.apk'
    ];
    for (const p of candidatePaths) {
      if (existsSync(p)) {
        res.setHeader('Content-Disposition', 'attachment; filename="ShakilEcom.apk"');
        res.setHeader('Content-Type', 'application/vnd.android.package-archive');
        return res.sendFile(p);
      }
    }
    return res.status(404).send('ShakilEcom APK file not found');
  });
  app.get(['/admin.html', '/admin'], (_req, res) => res.redirect(301, '/wp-admin'));
  const SEO_ORIGIN = 'https://metrroma.com';
  const xmlEscape = (value) => String(value ?? '').replace(/[<>&'\"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]);
  const htmlEscape = (value) => String(value ?? '').replace(/[&<>\"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const absoluteUrl = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return `${SEO_ORIGIN}/uploads/img_mvdpqsl1t81m6.webp`;
    try { return new URL(raw, `${SEO_ORIGIN}/`).href; } catch { return `${SEO_ORIGIN}/`; }
  };
  app.get('/sitemap.xml', (_req, res) => {
    const { products = [], categories = [] } = getCatalog();
    const urls = new Map();
    const addUrl = (path, lastmod = '') => {
      const loc = new URL(path, `${SEO_ORIGIN}/`).href;
      const date = lastmod && !Number.isNaN(Date.parse(lastmod)) ? new Date(lastmod).toISOString().slice(0, 10) : '';
      urls.set(loc, date || urls.get(loc) || '');
    };
    addUrl('/');
    addUrl('/shop');
    for (const category of categories) {
      if (category?.slug) addUrl(`/shop/${encodeURIComponent(category.slug)}`, category.updatedAt);
    }
    for (const product of products) {
      const slug = String(product?.slug || product?.id || '').trim();
      if (!slug || product.archived || product.status === 'draft' || product.published === false) continue;
      addUrl(`/product/${encodeURIComponent(slug)}`, product.updatedAt || product.createdAt);
    }
    for (const landing of getLandings()) {
      const slug = String(landing?.slug || '').trim();
      if (slug && landing.status === 'live') addUrl(`/${encodeURIComponent(slug)}`, landing.updatedAt || landing.createdAt);
    }
    const body = [...urls.entries()].map(([loc, lastmod]) => `  <url><loc>${xmlEscape(loc)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`).join('\n');
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
    res.type('application/xml; charset=utf-8').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>`);
  });
  app.use(express.static(dist, {
    setHeaders: (res, path) => {
      if (path.endsWith('sw.js')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Service-Worker-Allowed', '/');
      } else if (path.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      } else if (path.includes('/assets/') || path.includes('\\assets\\')) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    }
  }));
  app.get('*', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    const indexPath = join(dist, 'index.html');
    if (!existsSync(indexPath)) return res.status(404).send('Not found');

    try {
      let html = readFileSync(indexPath, 'utf8');
      const baseUrl = 'https://metrroma.com';
      const path = req.path || '/';

      const cleanPath = path.replace(/^\/+|\/+$/g, '');
      const parts = cleanPath.split('/').filter(Boolean);
      let targetProduct = null;
      let targetCategory = null;

      const catalog = getCatalog().products || [];
      if (parts[0] === 'product' && parts[1]) {
        const slug = parts[1].toLowerCase();
        targetProduct = catalog.find((p) => p.slug?.toLowerCase() === slug || p.id === parts[1]);
      } else if (parts.length === 1 && !['shop', 'categories', 'category', 'checkout', 'confirm', 'track', 'wp-admin', 'account', 'admin', 'terms', 'privacy', 'refund', 'contact'].includes(parts[0])) {
        const slug = parts[0].toLowerCase();
        targetProduct = catalog.find((p) => p.slug?.toLowerCase() === slug || p.id === parts[0] || (slug === 'love-forever' && p.id === 'mm-29267') || (slug === 'love-forever-gift-box' && p.id === 'mm-29267'));
      }

      if (['categories', 'category', 'shop'].includes(parts[0]) && parts[1]) {
        targetCategory = (getCatalog().categories || []).find((category) => category.slug?.toLowerCase() === parts[1].toLowerCase()) || null;
      }

      if (targetProduct) {
        const pTitle = String(targetProduct.seoTitle || `${targetProduct.name} — METRROMA`).slice(0, 70);
        const pDesc = String(targetProduct.seoDesc || targetProduct.shortDesc || targetProduct.desc || targetProduct.name).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
        const pImg = absoluteUrl(targetProduct.image || (targetProduct.images && targetProduct.images[0]));
        const pUrl = `${baseUrl}/product/${encodeURIComponent(targetProduct.slug || targetProduct.id)}`;
        const pPrice = String(targetProduct.price || 0);
        const productJsonLd = {
          '@context': 'https://schema.org', '@type': 'Product',
          name: targetProduct.name, description: pDesc, image: [pImg], url: pUrl,
          sku: targetProduct.sku || undefined, brand: { '@type': 'Brand', name: 'METRROMA' },
          offers: {
            '@type': 'Offer', url: pUrl, priceCurrency: 'BDT', price: Number(targetProduct.price || 0),
            availability: targetProduct.soldOut || Number(targetProduct.stock) === 0 ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
            itemCondition: 'https://schema.org/NewCondition', seller: { '@type': 'Organization', name: 'METRROMA' },
          },
        };

        html = html
          .replace(/<title>[\s\S]*?<\/title>/i, `<title>${htmlEscape(pTitle)}</title>`)
          .replace(/<meta name="description" content="[^"]*"/i, `<meta name="description" content="${htmlEscape(pDesc)}"`)
          .replace(/<meta property="og:title" content="[^"]*"/i, `<meta property="og:title" content="${htmlEscape(pTitle)}"`)
          .replace(/<meta property="og:description" content="[^"]*"/i, `<meta property="og:description" content="${htmlEscape(pDesc)}"`)
          .replace(/<meta property="og:image" content="[^"]*"/i, `<meta property="og:image" content="${htmlEscape(pImg)}"`)
          .replace(/<meta property="og:image:secure_url" content="[^"]*"/i, `<meta property="og:image:secure_url" content="${htmlEscape(pImg)}"`)
          .replace(/<meta name="twitter:title" content="[^"]*"/i, `<meta name="twitter:title" content="${htmlEscape(pTitle)}"`)
          .replace(/<meta name="twitter:description" content="[^"]*"/i, `<meta name="twitter:description" content="${htmlEscape(pDesc)}"`)
          .replace(/<meta name="twitter:image" content="[^"]*"/i, `<meta name="twitter:image" content="${htmlEscape(pImg)}"`);

        const extraTags = `
    <meta property="og:url" content="${pUrl}" />
    <meta property="og:type" content="product" />
    <meta property="product:price:amount" content="${pPrice}" />
    <meta property="product:price:currency" content="BDT" />
    <meta property="og:image:secure_url" content="${pImg}" />
    <script type="application/ld+json">${JSON.stringify(productJsonLd).replace(/</g, '\\u003c')}</script>`;
        html = html
          .replace(/<link rel="canonical" href="[^"]*"\s*\/?\s*>/i, `<link rel="canonical" href="${htmlEscape(pUrl)}" />`)
          .replace('</head>', `${extraTags}\n</head>`);
      } else if (targetCategory) {
        const title = `${targetCategory.name} — METRROMA`;
        const description = String(targetCategory.blurb || `Shop ${targetCategory.name} from METRROMA. Authentic products with delivery across Bangladesh.`).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
        const url = `${baseUrl}/categories/${encodeURIComponent(targetCategory.slug)}`;
        const categoryProducts = (getCatalog().products || []).filter((product) => product.category === targetCategory.slug && !product.archived && product.status !== 'draft' && product.published !== false);
        const listJsonLd = {
          '@context': 'https://schema.org', '@type': 'CollectionPage', name: title, description, url,
          mainEntity: { '@type': 'ItemList', itemListElement: categoryProducts.slice(0, 50).map((product, index) => ({ '@type': 'ListItem', position: index + 1, url: `${baseUrl}/product/${encodeURIComponent(product.slug || product.id)}`, name: product.name })) },
        };
        html = html
          .replace(/<title>[\s\S]*?<\/title>/i, `<title>${htmlEscape(title)}</title>`)
          .replace(/<meta name="description" content="[^"]*"/i, `<meta name="description" content="${htmlEscape(description)}"`)
          .replace(/<meta property="og:title" content="[^"]*"/i, `<meta property="og:title" content="${htmlEscape(title)}"`)
          .replace(/<meta property="og:description" content="[^"]*"/i, `<meta property="og:description" content="${htmlEscape(description)}"`)
          .replace(/<meta property="og:image" content="[^"]*"/i, `<meta property="og:image" content="${htmlEscape(absoluteUrl(targetCategory.image))}"`)
          .replace(/<meta property="og:image:secure_url" content="[^"]*"/i, `<meta property="og:image:secure_url" content="${htmlEscape(absoluteUrl(targetCategory.image))}"`)
          .replace(/<link rel="canonical" href="[^"]*"\s*\/?\s*>/i, `<link rel="canonical" href="${htmlEscape(url)}" />`)
          .replace('</head>', `\n    <meta property="og:url" content="${htmlEscape(url)}" /><meta property="og:type" content="website" /><script type="application/ld+json">${JSON.stringify(listJsonLd).replace(/</g, '\\u003c')}</script>\n</head>`);
      } else {
        html = html.replace(/<meta property="og:image" content="(\/[^"]+)"/i, `<meta property="og:image" content="${baseUrl}$1"`);
      }

      res.setHeader('Content-Type', 'text/html; charset=UTF-8');
      res.send(html);
    } catch (_) {
      res.sendFile(indexPath);
    }
  });
}

const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0';
app.listen(PORT, HOST, () => {
  console.log(`METRROMA api on http://${HOST}:${PORT}`);
  // Start automated background courier status sync (initial run after 10s, then every 5 mins)
  setTimeout(() => {
    runBackgroundCourierSync().catch(() => {});
    setInterval(runBackgroundCourierSync, 5 * 60 * 1000);
  }, 10 * 1000);
});


export function formatStaffDailyReport(monitoringData) {
  const staffList = monitoringData.staff || [];
  const dateStr = monitoringData.date;
  
  let msg = `📊 *[METRROMA] স্টাফ দৈনিক পারফরম্যান্স রিপোর্ট*\n`;
  msg += `📅 তারিখ: ${dateStr}\n`;
  msg += `⏰ সময়: রাত ১১:০০ টা\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;

  let totalConfirmedAll = 0;
  let totalBookedAll = 0;
  let topStaff = null;
  let maxOrders = -1;

  for (const s of staffList) {
    if (s.role === 'owner' && s.activeSeconds === 0 && (s.ordersHandled?.total || 0) === 0) {
      continue;
    }
    const activeHrs = Math.floor(s.activeSeconds / 3600);
    const activeMins = Math.floor((s.activeSeconds % 3600) / 60);
    const idleHrs = Math.floor(s.idleSeconds / 3600);
    const idleMins = Math.floor((s.idleSeconds % 3600) / 60);

    const activeStr = activeHrs > 0 ? `${activeHrs} ঘণ্টা ${activeMins} মি.` : `${activeMins} মিনিট`;
    const idleStr = idleHrs > 0 ? `${idleHrs} ঘণ্টা ${idleMins} মি.` : `${idleMins} মিনিট`;

    const statusEmoji = s.status === 'active' ? '🟢 Active (অনলাইন)' : s.status === 'idle' ? '🟡 Away (আইডল)' : '⚪ Offline (অফলাইন)';

    const confirmed = s.ordersHandled?.confirmed || 0;
    const cancelled = s.ordersHandled?.cancelled || 0;
    const booked = s.couriersBooked || 0;
    const rev = s.totalRevenueProcessed || 0;

    totalConfirmedAll += confirmed;
    totalBookedAll += booked;

    if (confirmed > maxOrders && s.role !== 'owner') {
      maxOrders = confirmed;
      topStaff = s.name;
    }

    const firstLoginTime = s.firstLogin ? new Date(s.firstLogin).toLocaleTimeString('bn-BD', { timeZone: 'Asia/Dhaka', hour: '2-digit', minute: '2-digit' }) : 'N/A';
    const lastActiveTime = s.lastActive ? new Date(s.lastActive).toLocaleTimeString('bn-BD', { timeZone: 'Asia/Dhaka', hour: '2-digit', minute: '2-digit' }) : 'N/A';

    msg += `👤 *${s.name}* (${s.role.toUpperCase()})\n`;
    msg += `  • স্ট্যাটাস: ${statusEmoji}\n`;
    msg += `  • ⏱️ কাজের সময়: ${activeStr} (সক্রিয়) | আইডল: ${idleStr}\n`;
    msg += `  • 🚪 প্রথম লগইন: ${firstLoginTime} | শেষ অ্যাক্টিভ: ${lastActiveTime}\n`;
    msg += `  • 📦 প্রসেস করা অর্ডার: ${confirmed + cancelled} টি (কনফার্মড: ${confirmed}, বাতিল: ${cancelled})\n`;
    msg += `  • 🚚 কুরিয়ার বুকিং: ${booked} টি\n`;
    if (rev > 0) msg += `  • 💰 মোট প্রসেসড সেলস: ৳ ${rev.toLocaleString()}\n`;
    msg += `\n`;
  }

  msg += `━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `📦 *মোট কনফার্মড পার্সেল:* ${totalConfirmedAll} টি\n`;
  msg += `🚚 *মোট কুরিয়ারে বুকিং:* ${totalBookedAll} টি\n`;
  if (topStaff) msg += `🏆 *আজকের সেরা পারফর্মার:* ${topStaff}\n`;
  msg += `🔗 *লাইভ ড্যাশবোর্ড:* https://metrroma.com/wp-admin\n`;

  return msg;
}


// ---- Staff Heartbeat & Presence ----
app.post('/api/admin/heartbeat', adminAuth, (req, res) => {
  const { active, currentPath } = req.body || {};
  const ip = getClientIp(req);
  const device = req.headers['user-agent'] || '';
  updateStaffPresence(req.admin, {
    active: active !== false,
    currentPath: String(currentPath || '').slice(0, 100),
    ip,
    device
  });
  res.json({ ok: true, timestamp: Date.now() });
});

// ---- Staff Monitoring & Live KPI ----
app.get('/api/admin/staff-monitoring', adminAuth, requireRole('owner', 'manager'), (_req, res) => {
  res.json(getStaffMonitoringData());
});

// ---- Audit Logs ----
app.get('/api/admin/audit-logs', adminAuth, requireRole('owner', 'manager'), (req, res) => {
  const { staff, action, limit = 200 } = req.query || {};
  let logs = getAuditLogs();
  if (staff) {
    const s = String(staff).toLowerCase();
    logs = logs.filter(l => l.staff?.username?.toLowerCase() === s || l.staff?.name?.toLowerCase().includes(s));
  }
  if (action) {
    const a = String(action).toUpperCase();
    logs = logs.filter(l => l.action === a);
  }
  res.json(logs.slice(0, Math.min(500, parseInt(limit, 10) || 200)));
});

// ---- Send Daily Staff Performance Report to WhatsApp ----
app.post('/api/admin/staff/send-daily-report', adminAuth, requireRole('owner'), async (req, res) => {
  try {
    const settings = getSettings();
    const recipient = req.body?.phone || settings.whatsapp || settings.phone || '8801878374762';
    const cleanPhone = String(recipient).replace(/\D/g, '');
    if (!cleanPhone) {
      return res.status(400).json({ error: 'No recipient phone number configured for Super Admin WhatsApp' });
    }

    const data = getStaffMonitoringData();
    const reportText = formatStaffDailyReport(data);

    // Send via Baileys WhatsApp
    const r = await sendBaileysMessage(cleanPhone, reportText, null, 'staff_daily_report');
    res.json({ ok: true, recipient: cleanPhone, sent: r?.sent !== false, message: reportText });
  } catch (err) {
    res.status(500).json({ error: String(err?.message || err) });
  }
});

// ---- Automated Nightly Staff Performance WhatsApp Cron (23:00 / 11:00 PM BD Time) ----
let lastNightlyReportDateSent = '';
setInterval(async () => {
  try {
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const bdTime = new Date(utc + (3600000 * 6)); // UTC+6
    const hr = bdTime.getHours();
    const min = bdTime.getMinutes();
    const today = bdTime.toISOString().slice(0, 10);

    // Trigger daily at 23:00 (11:00 PM BD time)
    if (hr === 23 && min === 0 && lastNightlyReportDateSent !== today) {
      lastNightlyReportDateSent = today;
      const settings = getSettings();
      const recipient = settings.whatsapp || settings.phone || '8801878374762';
      const cleanPhone = String(recipient).replace(/\D/g, '');
      if (cleanPhone) {
        console.log(`[StaffMonitor] Auto-dispatching nightly report to ${cleanPhone}...`);
        const data = getStaffMonitoringData();
        const text = formatStaffDailyReport(data);
        await sendBaileysMessage(cleanPhone, text, null, 'staff_daily_report_auto');
        console.log('[StaffMonitor] Nightly report dispatched successfully via WhatsApp.');
      }
    }
  } catch (e) {
    console.error('[StaffMonitor] Nightly report error:', e.message);
  }
}, 60000);
