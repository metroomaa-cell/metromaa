process.env.TZ = 'Asia/Dhaka';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
import express from 'express';
import cors from 'cors';
import os from 'node:os';
import path, { dirname, join } from 'node:path';
import fs, { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, lstatSync, unlinkSync, renameSync, rmSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomUUID, randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import nodemailer from 'nodemailer';
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
let WebSocketServer = null;
let GoogleGenAI = null;
try {
  const _ws = await import('ws');
  WebSocketServer = _ws.WebSocketServer;
} catch (_) {}
try {
  const _genai = await import('@google/genai');
  GoogleGenAI = _genai.GoogleGenAI;
} catch (_) {}
try { dns.setDefaultResultOrder('ipv4first'); } catch {}
import { getCatalog, getOrders, addOrder, updateOrder, deleteOrder, addProduct, updateProduct, deleteProduct, getSettings, saveSettings, saveCatalog, addCategory, updateCategory, deleteCategory, getCoupons, saveCoupons, getReviews, saveReviews, getUsers, saveUsers, getIntegrations, saveIntegrations, getLandings, saveLandings, getLandingBySlug, addLanding, updateLanding, deleteLanding, getColors, saveColors, addColor, deleteColor, getCustomers, saveCustomers, getCustomerByPhone, getCustomerByEmail, saveCustomer, syncCustomersFromOrders, initStorageProtection, getPersistentDataDirectory, getAuditLogs, addAuditLog, getStaffActivity, updateStaffPresence, recordStaffKpiAction, getStaffMonitoringData, getBangladeshDate, getWaChatContacts, upsertWaChatContact, syncWhatsAppSessionContacts, getWaMessages, getWaInboxThreads, pruneWhatsAppInboxMedia, getWaAutoLogs, recordWaAutoLog, canSendAutoWa, getStaffNotifications, addStaffNotification, markStaffNotificationsRead, autoAssignOnlineStaff, getCalls, saveCall, deleteCall, getCallStats, getTelephonySettings, saveTelephonySettings, getCallTransfers, saveCallTransfer, updateCallTransfer, cleanupOldRecordings } from './store.js';
import { getWhatsAppSettings, saveWhatsAppSettings, sendWhatsAppNotification, formatWhatsAppMessage, isNightConfirmationTime } from './whatsapp_engine.js';
import { startWhatsAppSocket, getWhatsAppLiveStatus, requestPairingCode, sendBaileysMessage, waitForQrCode, clearWhatsAppSession, getWhatsAppProfilePicture, resolveWhatsAppPhoneNumber } from './whatsapp_baileys.js';
import { getWaAiConfig, saveWaAiConfig, getWaAiFaqs, addWaAiFaq, deleteWaAiFaq } from './whatsapp_ai_agent.js';
import { getVapidPublicKey, getPushPopupSettings, savePushPopupSettings, upsertPushSubscriber, linkSubscriberPhone, removePushSubscriber, getPushSubscriberStats, sendBroadcastPush, sendOrderPushNotifications } from './push_engine.js';
import { registerMailRoutes, renderBrandedEmailTemplate } from './mail_engine.js';

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
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(self), geolocation=()');
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
    recoveryUrl: landingPage ? `https://timingboost.xyz/l/${landingPage.slug}?recover=${draftId}` : `https://timingboost.xyz/checkout?recover=${draftId}`,
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

app.get('/api/settings', (req, res) => {
  const publicSettings = { ...getSettings() };
  delete publicSettings.ownerPassword;

  // Auto Code Brain: When called from a custom-tracked landing page (/page/:slug or /l/:slug),
  // automatically isolate the response so main store GTM & main store Pixel never leak into the landing page.
  try {
    const ref = String(req.headers['referer'] || '');
    const ctxSlug = String(req.query?.landing || '').trim();
    let landingSlug = ctxSlug;
    if (!landingSlug && ref) {
      const refUrl = new URL(ref, 'http://localhost');
      const refParts = refUrl.pathname.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
      if ((refParts[0] === 'page' || refParts[0] === 'l') && refParts[1]) {
        landingSlug = refParts[1];
      }
    }
    if (landingSlug) {
      const land = getLandingBySlug(landingSlug);
      const hasCustom = land && (land.fbPixelId || land.ttkPixelId || land.gtmId || land.gaId);
      if (hasCustom && land.pixelMode !== 'both') {
        publicSettings.gtmId = land.gtmId ? String(land.gtmId).trim() : '';
        publicSettings.fbPixelId = land.fbPixelId ? String(land.fbPixelId).trim() : '';
      }
    }
  } catch (_) {}

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
    gtmId: typeof b.gtmId === 'string' && b.gtmId.trim() ? b.gtmId.trim().slice(0, 20) : (b.clearGtm === true ? '' : cur.gtmId),
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
    footer: b.footer && typeof b.footer === 'object' ? b.footer : (cur.footer || null),
  }));
});

app.post('/api/app-apk', adminAuth, requireRole('owner', 'manager'), express.raw({ type: ['application/vnd.android.package-archive', 'application/octet-stream'], limit: '50mb' }), (req, res) => {
  if (!Buffer.isBuffer(req.body) || req.body.length < 8 || req.body.length > 50 * 1024 * 1024) return res.status(400).json({ error: 'APK file is empty or too large.' });
  const filename = String(req.query.filename || 'TimeBoost-Admin.apk').replace(/[^a-zA-Z0-9._-]/g, '-').slice(-100);
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
  return `https://timingboost.xyz${clean}`;
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
  const storeName = settings.storeName || 'TimeBoost';

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">\n`;
  xml += `  <channel>\n`;
  xml += `    <title><![CDATA[${storeName} Product Catalog]]></title>\n`;
  xml += `    <link>https://timingboost.xyz</link>\n`;
  xml += `    <description><![CDATA[Official Live Product Catalog for ${storeName}]]></description>\n`;

  for (const p of products) {
    const id = p.id;
    const title = p.name || 'Product';
    const rawDesc = p.desc || p.shortDesc || p.seoDesc || p.name || '';
    const desc = rawDesc.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();
    const link = `https://timingboost.xyz/product/${encodeURIComponent(p.slug || p.id)}`;
    const imageLink = buildFeedAbsoluteUrl(p.image || (p.images && p.images[0]) || '/uploads/logo_timeboost.png');
    const isOutOfStock = (p.stock != null && p.stock <= 0) || p.soldOut === true;
    const availability = isOutOfStock ? 'out of stock' : 'in stock';

    const originalPrice = p.compareAt && p.compareAt > p.price ? p.compareAt : p.price;
    const priceStr = `${Number(originalPrice || 0).toFixed(2)} BDT`;
    const salePriceStr = p.compareAt && p.compareAt > p.price ? `${Number(p.price || 0).toFixed(2)} BDT` : '';
    const brand = 'TimeBoost';
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
    const link = `"https://timingboost.xyz/product/${encodeURIComponent(p.slug || p.id)}"`;
    const imageLink = `"${buildFeedAbsoluteUrl(p.image || (p.images && p.images[0]) || '/uploads/logo_timeboost.png')}"`;
    const brand = '"TimeBoost"';
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
      (attribution && attribution.channel ? attribution.channel : '') ||
      (c.source && !c.source.startsWith('landing_') && !c.source.startsWith('l/') ? c.source : '') ||
      'direct'
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

// ---- public order details for landing thank you page ----
app.get('/api/orders/public/:id', (req, res) => {
  const reqId = String(req.params.id || '').trim();
  if (!reqId) return res.status(400).json({ error: 'missing id' });
  const all = getOrders() || [];
  const found = all.find((o) => o.id === reqId || o.id === 'DOT-' + reqId || 'DOT-' + o.id === reqId || String(o.id).endsWith(reqId));
  if (!found) return res.status(404).json({ error: 'order not found' });
  res.json({
    id: found.id,
    total: found.total,
    subtotal: found.subtotal || found.itemsTotal,
    shippingCost: found.shippingCost || (found.shipping && found.shipping.cost) || 0,
    status: found.status,
    items: (found.items || []).map((it) => ({
      id: it.id,
      name: it.name || it.title,
      price: it.price,
      qty: it.qty,
      color: it.color,
      variantTitle: it.variantTitle,
      image: it.image
    })),
    createdAt: found.createdAt
  });
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
function requirePerm(permKey) {
  return (req, res, next) => {
    if (!req.admin) return res.status(401).json({ error: 'unauthorized' });
    if (req.admin.role === 'owner' || req.admin.role === 'manager' || req.admin.permissions?.[permKey] !== false) return next();
    return res.status(403).json({ error: 'Permission denied by Owner' });
  };
}
function canUseSaika(admin) {
  if (!admin) return false;
  if (admin.role === 'owner') return true;
  return !!(admin.canAccessSaika || admin.permissions?.canAccessSaika);
}
const requireSaikaPermission = (req, res, next) => {
  if (canUseSaika(req.admin)) return next();
  return res.status(403).json({ ok: false, error: 'সাইকা এআই ব্যবহারের জন্য স্টোর ওনারের পারমিশন আবশ্যক।' });
};

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
    const storeName = (st.storeName && st.storeName !== 'dot.') ? st.storeName : 'TimeBoost';

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
  const storeName = (st.storeName && st.storeName !== 'dot.') ? st.storeName : 'TimeBoost';

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

app.get('/api/admin/me', adminAuth, (req, res) => {
  const admin = req.admin || {};
  const isOwner = admin.role === 'owner';
  res.json({
    ...admin,
    canAccessSaika: isOwner ? true : !!admin.canAccessSaika
  });
});
app.post('/api/admin/logout', adminAuth, (req, res) => {
  const token = req.get('x-admin-token') || '';
  sessions.delete(sessionKey(token));
  persistAdminSessions();
  res.json({ ok: true });
});

app.get('/api/admin/users', adminAuth, requireRole('owner'), (_q, res) => res.json(getUsers().map((u) => ({ id: u.id, username: u.username, name: u.name, email: u.email || '', role: u.role, skipOtp: !!u.skipOtp, allowedProducts: Array.isArray(u.allowedProducts) ? u.allowedProducts : [], canAccessSaika: !!u.canAccessSaika }))));

app.post('/api/admin/users', adminAuth, requireRole('owner'), async (req, res) => {
  const b = req.body || {};
  const username = String(b.username || '').trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '');
  const name = String(b.name || '').trim() || username;
  const email = String(b.email || '').trim().toLowerCase();
  const role = ['manager', 'staff'].includes(b.role) ? b.role : 'staff';
  const allowedProducts = Array.isArray(b.allowedProducts) ? b.allowedProducts.map(String) : [];
  const password = String(b.password || '');
  const skipOtp = !!b.skipOtp;
  const canAccessSaika = !!b.canAccessSaika;
  if (!username || password.length < 4) return res.status(400).json({ error: 'Username and a 4+ character password are required' });
  if (!skipOtp && (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))) {
    return res.status(400).json({ error: 'স্টাফের নিজস্ব ভেরিফিকেশন কোডের জন্য একটি সঠিক ইমেইল ঠিকানা দেওয়া আবশ্যক।' });
  }
  const users = getUsers();
  if (users.find((u) => u.username === username)) return res.status(400).json({ error: 'username already exists' });
  const { salt, hash } = makeHash(password);
  const newUser = { id: 'u' + Date.now().toString(36), username, name, email, role, skipOtp, allowedProducts, canAccessSaika, salt, hash, createdAt: new Date().toISOString() };
  users.push(newUser);
  saveUsers(users);

  // Send onboarding email to new staff member
  if (email) {
    const host = req.get('host') || 'dot.metromaa.com';
    const loginUrl = `${req.protocol}://${host}/admin`;
    sendEmail(
      email,
      `Welcome to TimeBoost Admin Team — Your Login Credentials`,
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
  const storeName = (st.storeName && st.storeName !== 'dot.') ? st.storeName : 'TimeBoost';
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
  const { fbToken, ttkToken, ...safeLanding } = landing;
  res.json(safeLanding);
});

function sanitizeLandingSeo(b) {
  if (!b || typeof b !== 'object') return b;
  const out = { ...b };
  const slug = String(out.slug || '').toLowerCase();
  if (slug !== 'lovelock') {
    if (out.headline === 'ম্যাজিক লাভ লক কনডম') {
      out.headline = out.title || '';
    }
    if (String(out.subtitle || '').includes('পুরুষাঙ্গ')) {
      out.subtitle = '';
    }
  }
  if (out.mode === 'html' && out.customHtml) {
    const htmlTitleMatch = String(out.customHtml).match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const extracted = htmlTitleMatch && htmlTitleMatch[1] ? htmlTitleMatch[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : '';
    if (!out.headline || out.headline === 'ম্যাজিক লাভ লক কনডম') {
      out.headline = extracted || out.title || '';
    }
  }
  return out;
}

app.post('/api/landings', adminAuth, requireRole('owner', 'manager'), (req, res) => {
  const b = sanitizeLandingSeo(req.body || {});
  const title = String(b.title || '').trim();
  if (!title) return res.status(400).json({ error: 'Landing title is required' });
  const slug = slugify(b.slug || title);
  const landing = sanitizeLandingSeo({
    ...b,
    id: b.id || 'landing_' + Date.now().toString(36),
    title,
    slug,
    status: b.status === 'draft' ? 'draft' : 'live',
  });
  addLanding(landing);
  res.status(201).json(landing);
});

app.put('/api/landings/:id', adminAuth, requireRole('owner', 'manager'), (req, res) => {
  const updated = updateLanding(req.params.id, sanitizeLandingSeo(req.body || {}));
  if (!updated) return res.status(404).json({ error: 'Landing page not found' });
  res.json(updated);
});

app.delete('/api/landings/:id', adminAuth, requireRole('owner', 'manager'), (req, res) => {
  if (!deleteLanding(req.params.id)) return res.status(404).json({ error: 'Landing page not found' });
  res.json({ ok: true });
});

// ---- IP Telephony, Call Logs & Voice Audit ----
app.get('/api/calls', adminAuth, (req, res) => {
  try {
    const list = getCalls(req.query || {});
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/calls/stats', adminAuth, (_req, res) => {
  try {
    res.json(getCallStats());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/calls', adminAuth, (req, res) => {
  try {
    const staff = req.adminUser ? {
      username: req.adminUser.username,
      name: req.adminUser.name || req.adminUser.username,
      role: req.adminUser.role || 'staff'
    } : (req.body?.staff || { name: 'Staff', role: 'staff' });

    const record = saveCall({
      ...(req.body || {}),
      staff
    });
    res.json(record);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/calls/:id', adminAuth, requireRole('owner', 'manager'), (req, res) => {
  try {
    const ok = deleteCall(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Call record not found' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/calls/upload-recording', adminAuth, express.json({ limit: '25mb' }), (req, res) => {
  try {
    const dataUrl = req.body?.dataUrl || req.body?.audio || req.body?.data || '';
    const m = dataUrl.match(/^data:(?:audio\/(webm|mp3|ogg|wav|m4a|aac|mpeg|x-m4a));base64,(.+)$/i);
    if (!m) return res.status(400).json({ error: 'Invalid audio data format' });

    let ext = m[1].toLowerCase();
    if (ext === 'mpeg') ext = 'mp3';
    else if (ext === 'x-m4a') ext = 'm4a';

    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > 20 * 1024 * 1024) return res.status(400).json({ error: 'Recording file too large (max 20MB)' });

    const recDir = join(UPLOADS, 'recordings');
    mkdirSync(recDir, { recursive: true });

    const nm = 'rec_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7) + '.' + ext;
    writeFileSync(join(recDir, nm), buf);

    res.json({ url: '/uploads/recordings/' + nm, size: buf.length, filename: nm });
  } catch (e) {
    console.error('[Telephony] Upload recording error:', e);
    res.status(500).json({ error: 'Failed to save call recording: ' + e.message });
  }
});

app.get('/api/telephony/settings', adminAuth, (_req, res) => {
  try {
    res.json(getTelephonySettings());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/telephony/settings', adminAuth, requireRole('owner', 'manager'), (req, res) => {
  try {
    const updated = saveTelephonySettings(req.body || {});
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Run cleanup for recordings older than retention days once every 24 hours
setInterval(() => {
  try {
    const s = getTelephonySettings();
    const days = parseInt(s.retentionDays, 10) || 30;
    cleanupOldRecordings(days);
  } catch (_) {}
}, 24 * 60 * 60 * 1000);

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
async function sendEmail(to, subject, html, opts = {}) {
  const e = getIntegrations().email;
  if (!e || !e.enabled) return { ok: false, error: 'email not configured or disabled' };
  const st = getSettings() || {};
  const defaultBrand = (st.storeName && st.storeName !== 'dot.') ? st.storeName : 'SECRATE';
  const fromName = (opts.fromName && opts.fromName !== 'dot.') ? opts.fromName : ((e.fromName && e.fromName !== 'dot.') ? e.fromName : defaultBrand);

  // Wrap with branded store email template if raw HTML is provided
  let finalHtml = html;
  if (typeof finalHtml === 'string' && !finalHtml.includes('<!DOCTYPE') && !finalHtml.includes('<html')) {
    finalHtml = renderBrandedEmailTemplate({
      contentHtml: finalHtml,
      subject,
      storeName: defaultBrand,
      siteUrl: 'https://secrate.shop',
      phone: st.phone || '',
      whatsapp: st.whatsapp || '',
      logoUrl: 'cid:store_logo',
      emblemUrl: 'cid:store_emblem',
    });
  }

  const hasSmtp = !!(e.host && e.user && e.pass);
  const hasResend = !!(e.resendApiKey || process.env.RESEND_API_KEY);

  const trySmtp = async () => {
    const host = String(e.host || '').trim() || '127.0.0.1';
    const user = String(e.user || '').trim();
    const isGmail = host.toLowerCase().includes('gmail.com');
    const pass = isGmail ? String(e.pass || '').replace(/\s+/g, '') : String(e.pass || '');
    const port = Number(e.port) || (isGmail ? 465 : (host === '127.0.0.1' || host === 'localhost' ? 25 : 587));
    const secure = port === 465 ? true : !!e.secure;
    const senderAddr = opts.from ? opts.from : ((isGmail || !e.fromEmail || e.fromEmail.includes('dot.metromaa.com')) ? (user || 'shakil@secrate.shop') : e.fromEmail);
    try {
      const txConfig = {
        host,
        port,
        secure,
        tls: { rejectUnauthorized: false }
      };
      if (user && pass) {
        txConfig.auth = { user, pass };
      }
      const tx = nodemailer.createTransport(txConfig);
      const mailOptions = {
        from: `"${fromName}" <${senderAddr}>`,
        to,
        subject,
        html: finalHtml,
      };
      if (opts.cc) mailOptions.cc = opts.cc;
      if (opts.bcc) mailOptions.bcc = opts.bcc;
      const attachments = Array.isArray(opts.attachments) ? opts.attachments.map((a) => ({
        filename: a.filename || a.name || 'attachment',
        path: a.url ? (a.url.startsWith('/') ? join(__dir, '..', a.url) : a.url) : a.path,
      })) : [];

      // Helper to find logo files across data / uploads folders
      const findAsset = (filename) => {
        const candidates = [
          join(UPLOADS, filename),
          join(__dir, 'uploads', filename),
          join(__dir, '..', 'uploads', filename),
        ];
        return candidates.find((p) => existsSync(p)) || null;
      };

      // Inline CID attachments for Gmail, Outlook, Apple Mail
      if (finalHtml.includes('cid:store_logo')) {
        const logoPath = findAsset('secrate_mail_logo.png') || findAsset('logo_secrate_rich.png');
        if (logoPath) {
          attachments.push({
            filename: 'logo_secrate_rich.png',
            path: logoPath,
            cid: 'store_logo',
            contentType: 'image/png',
          });
        }
      }
      if (finalHtml.includes('cid:store_emblem')) {
        const emblemPath = findAsset('secrate_mail_emblem.png') || findAsset('logo_secrate_emblem.png');
        if (emblemPath) {
          attachments.push({
            filename: 'logo_secrate_emblem.png',
            path: emblemPath,
            cid: 'store_emblem',
            contentType: 'image/png',
          });
        }
      }
      if (attachments.length > 0) {
        mailOptions.attachments = attachments;
      }
      await tx.sendMail(mailOptions);
      return { ok: true, via: 'smtp' };
    } catch (err) {
      return { ok: false, error: String(err?.message || err) };
    }
  };

  const tryResend = async () => {
    const key = e.resendApiKey || process.env.RESEND_API_KEY;
    if (!key) return { ok: false, error: 'Resend API key missing' };
    let from = opts.from ? `"${fromName}" <${opts.from}>` : (e.fromEmail ? `"${fromName}" <${e.fromEmail}>` : `"${fromName}" <onboarding@resend.dev>`);
    try {
      let resendHtml = finalHtml;
      if (resendHtml.includes('cid:store_logo')) {
        resendHtml = resendHtml.replace(/cid:store_logo/g, 'https://secrate.shop/uploads/secrate_mail_logo.png');
      }
      if (resendHtml.includes('cid:store_emblem')) {
        resendHtml = resendHtml.replace(/cid:store_emblem/g, 'https://secrate.shop/uploads/secrate_mail_emblem.png');
      }
      const payload = { from, to, subject, html: resendHtml };
      if (opts.cc) payload.cc = opts.cc;
      if (opts.bcc) payload.bcc = opts.bcc;
      let r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      let d = await r.json();
      if (!r.ok && d?.message && (d.message.includes('domain is not verified') || d.message.includes('not verified') || d.message.includes('validation_error'))) {
        from = `"${fromName}" <onboarding@resend.dev>`;
        payload.from = from;
        r = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        d = await r.json();
      }
      if (!r.ok) return { ok: false, error: d?.message || 'Resend delivery failed' };
      return { ok: true, id: d?.id, via: 'resend' };
    } catch (err) {
      return { ok: false, error: String(err?.message || err) };
    }
  };

  // User Rule: Resend is ONLY used for admin panel verification/security/OTP codes.
  // For all regular business emails, custom mailboxes, and customer orders: Resend is STRICTLY forbidden.
  const isAdminSecurityCode = !!opts.forAdminCode || !!opts.isSecurityOtp ||
    (typeof subject === 'string' && /verification code|password reset code|security code|login credentials|staff email verification/i.test(subject)) ||
    (typeof html === 'string' && /security code|verification code|reset code/i.test(html));

  if (!isAdminSecurityCode) {
    // Regular business mail / customer mail: ONLY use custom SMTP server
    return await trySmtp();
  }

  // Admin Security / OTP Codes ONLY: use Resend for high-speed delivery, with SMTP fallback
  if (hasResend) {
    const resendRes = await tryResend();
    if (resendRes.ok) return resendRes;
    if (hasSmtp || e.host) {
      const smtpFallback = await trySmtp();
      if (smtpFallback.ok) return smtpFallback;
    }
    return resendRes;
  }

  if (hasSmtp || e.host) return await trySmtp();
  return { ok: false, error: 'Email provider not configured' };
}

// Register Business Webmail & Custom Mailboxes API routes
registerMailRoutes(app, {
  adminAuth,
  sendEmail,
  getCustomers,
  getOrders,
  uploadsDir: UPLOADS,
});

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
      const st = getSettings() || {};
      const storeName = (st.storeName && st.storeName !== 'dot.') ? st.storeName : 'SECRATE';
      const subj = kind === 'placed' ? `${storeName} — Order #${o.id} Confirmation` : `${storeName} — Order #${o.id} Status: ${o.status}`;
      const itemsList = Array.isArray(o.items) && o.items.length > 0 ? `
        <div style="margin: 16px 0; padding: 12px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
          <div style="font-weight: 700; font-size: 13px; color: #475569; margin-bottom: 8px;">ORDER ITEMS:</div>
          ${o.items.map((it) => `<div style="display: flex; justify-content: space-between; padding: 4px 0; font-size: 14px;">
            <span>${String(it.name || it.title || 'Product')} &times; ${it.qty || 1}</span>
            <span style="font-weight: 600;">৳${it.price ? (it.price * (it.qty || 1)) : ''}</span>
          </div>`).join('')}
        </div>` : '';
      const orderHtml = `
        <h2 style="color: #0f172a; margin-top: 0; font-size: 20px;">Hello ${map.name || 'Valued Customer'},</h2>
        <p style="font-size: 15px; color: #334155; margin-bottom: 16px;">
          ${kind === 'placed' ? 'Thank you for your order! We have received your order and are preparing it for shipment.' : `Your order status has been updated to <strong style="color: #2563eb; text-transform: uppercase;">${o.status}</strong>.`}
        </p>
        <div style="background: #f8fafc; border-radius: 10px; padding: 16px 20px; border-left: 4px solid #d97706; margin-bottom: 20px;">
          <div style="font-size: 14px; margin-bottom: 6px;"><strong>Order ID:</strong> #${o.id}</div>
          <div style="font-size: 14px; margin-bottom: 6px;"><strong>Status:</strong> <span style="text-transform: capitalize; font-weight: 600;">${o.status}</span></div>
          <div style="font-size: 14px; margin-bottom: 6px;"><strong>Total Amount:</strong> <span style="color: #16a34a; font-weight: 700;">${map.total}</span> (Cash on Delivery)</div>
          ${map.courier ? `<div style="font-size: 14px;"><strong>Courier Partner:</strong> ${map.courier}</div>` : ''}
        </div>
        ${itemsList}
        <p style="font-size: 14px; color: #64748b; margin-top: 20px;">
          If you have any questions or need to make changes, please contact our support helpline.
        </p>
      `;
      sendEmail(o.customer.email, subj, orderHtml).catch(() => {});
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
      const attempt = Number(d.attempt || d.delivery_attempts || 0) || 0;
      const courierUpdatedAt = String(d.updated_at || '').trim();
      return { ok: r.ok, raw, mapped: mapCourierStatus(raw), riderNote, attempt, courierUpdatedAt };
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
      attempt: r.attempt != null ? r.attempt : (c.attempt || 0),
      courierUpdatedAt: r.courierUpdatedAt || c.courierUpdatedAt || '',
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

  // Check if order originated from a custom landing page
  const landing = order.landing ? getLandingBySlug(order.landing) : null;
  const domain = (process.env.PRIMARY_DOMAIN || 'secrate.shop').replace(/^https?:\/\//, '');
  const sourceUrl = order.landing ? `https://${domain}/page/${order.landing}` : `https://${domain}/`;

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

  // 1. Meta (Facebook) CAPI Targets
  const fbTargets = [];
  if (landing?.fbPixelId && landing?.fbToken) {
    fbTargets.push({
      pixelId: String(landing.fbPixelId).trim(),
      token: String(landing.fbToken).trim(),
      testCode: landing.fbTestCode ? String(landing.fbTestCode).trim() : (tr.fbTestCode || '')
    });
  }
  // If landing has NO custom pixel, OR if landing explicitly selected dual tracking ('both'):
  const allowGlobalFb = !landing?.fbPixelId || landing?.pixelMode === 'both';
  if (allowGlobalFb && tr.fbEnabled && tr.fbPixelId && tr.fbToken) {
    const globalPid = String(tr.fbPixelId).trim();
    if (!fbTargets.some((t) => t.pixelId === globalPid)) {
      fbTargets.push({
        pixelId: globalPid,
        token: String(tr.fbToken).trim(),
        testCode: tr.fbTestCode || ''
      });
    }
  }

  for (const target of fbTargets) {
    try {
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
      if (target.testCode) body.test_event_code = target.testCode;
      const r = await fetch(`https://graph.facebook.com/v19.0/${target.pixelId}/events?access_token=${encodeURIComponent(target.token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      out.fb = { status: r.status, body: (await r.text()).slice(0, 300) };
    } catch (e) {
      out.fb = { error: String(e.message || e) };
    }
  }

  // 2. TikTok Events API Targets
  const ttkTargets = [];
  if (landing?.ttkPixelId && landing?.ttkToken) {
    ttkTargets.push({
      pixelId: String(landing.ttkPixelId).trim(),
      token: String(landing.ttkToken).trim()
    });
  }
  const allowGlobalTtk = !landing?.ttkPixelId || landing?.pixelMode === 'both';
  if (allowGlobalTtk && tr.ttkEnabled && tr.ttkPixelId && tr.ttkToken) {
    const globalTtk = String(tr.ttkPixelId).trim();
    if (!ttkTargets.some((t) => t.pixelId === globalTtk)) {
      ttkTargets.push({
        pixelId: globalTtk,
        token: String(tr.ttkToken).trim()
      });
    }
  }

  for (const target of ttkTargets) {
    try {
      const ttContents = (order.items || []).map((i) => ({
        content_id: String(i.id || 'product'),
        content_type: 'product',
        content_name: String(i.name || i.title || 'Product'),
        quantity: Number(i.qty) || 1,
        price: Number(i.price) || 0,
      }));
      const firstContent = ttContents[0] || { content_id: 'product', content_name: 'Product', price: value, quantity: 1 };
      const ttkUser = { phone_number: ph, phone: ph };
      if (em) ttkUser.email = em;
      if (order.ip) ttkUser.ip = order.ip;
      if (order.userAgent) ttkUser.user_agent = order.userAgent;

      const body = {
        event_source: 'web',
        event_source_id: target.pixelId,
        data: [{
          event: 'CompletePayment',
          event_time: ts,
          event_id: eventId,
          user: ttkUser,
          page: { url: sourceUrl },
          properties: {
            currency: 'BDT',
            value,
            content_type: 'product',
            content_id: firstContent.content_id,
            content_name: firstContent.content_name,
            contents: ttContents,
          },
        }],
      };
      const r = await fetch('https://business-api.tiktok.com/open_api/v1.3/event/track/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Access-Token': target.token },
        body: JSON.stringify(body),
      });
      out.ttk = { status: r.status, body: (await r.text()).slice(0, 300) };
    } catch (e) {
      out.ttk = { error: String(e.message || e) };
    }
  }  return out;
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
  res.json(await sendSMS(phone, 'TimeBoost test sms — your SMS integration works ✓'));
});
app.post('/api/admin/email/test', adminAuth, requireRole('owner', 'manager'), async (req, res) => {
  const to = String(req.body?.to || '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return res.status(400).json({ error: 'enter a valid email address' });
  res.json(await sendEmail(to, 'TimeBoost test email ✓', '<p>Your TimeBoost email integration works.</p>'));
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
app.get('/api/admin/whatsapp/status', adminAuth, requirePerm('canViewWhatsApp'), (req, res) => {
  try {
    const live = getWhatsAppLiveStatus();
    res.json(live);
  } catch (err) {
    res.json(getWhatsAppSettings());
  }
});

app.get(['/api/admin/whatsapp/inbox/threads', '/admin/whatsapp/inbox/threads'], adminAuth, requirePerm('canViewWhatsApp'), (req, res) => {
  try {
    const threads = getWaInboxThreads();
    const orders = getOrders();
    const enriched = threads.map((t) => {
      const last10 = String(t.phone || '').replace(/\D/g, '').slice(-10);
      const custOrders = last10 ? orders.filter((o) => String(o.customer?.phone || '').replace(/\D/g, '').endsWith(last10)) : [];
      const cancelled = custOrders.filter((o) => ['cancelled', 'return', 'returned'].includes(String(o.status || '').toLowerCase())).length;
      const delivered = custOrders.filter((o) => String(o.status || '').toLowerCase() === 'delivered').length;
      return { ...t, orderCount: custOrders.length, deliveredCount: delivered, cancelCount: cancelled };
    });
    res.json({ threads: enriched });
  } catch (err) {
    res.status(500).json({ error: err?.message || 'Failed to load threads', threads: [] });
  }
});

app.get(['/api/admin/whatsapp/inbox/messages/:phone', '/admin/whatsapp/inbox/messages/:phone'], adminAuth, requirePerm('canViewWhatsApp'), (req, res) => {
  try {
    const phone = decodeURIComponent(req.params.phone || '');
    const remoteJid = String(req.query.remoteJid || '').trim();
    const messages = getWaMessages(phone, remoteJid);
    const last10 = phone.replace(/\D/g, '').slice(-10);
    const orders = last10
      ? getOrders()
          .filter((o) => String(o.customer?.phone || '').replace(/\D/g, '').endsWith(last10))
          .slice(0, 10)
          .map((o) => ({ id: o.id, status: o.status, total: o.total, createdAt: o.createdAt, items: (o.items || []).map((i) => `${i.name} x${i.qty || 1}`).join(', ') }))
      : [];
    res.json({ messages, orders });
  } catch (err) {
    res.status(500).json({ error: err?.message || 'Failed to load messages', messages: [], orders: [] });
  }
});

app.get(['/api/admin/whatsapp/inbox/profile/:phone', '/admin/whatsapp/inbox/profile/:phone'], adminAuth, requirePerm('canViewWhatsApp'), async (req, res) => {
  try {
    const phone = decodeURIComponent(req.params.phone || '');
    const [url, resolvedPhone] = await Promise.all([
      getWhatsAppProfilePicture(phone),
      req.query.resolve === '1' ? resolveWhatsAppPhoneNumber(phone) : Promise.resolve(''),
    ]);
    res.json({ url, phone: resolvedPhone });
  } catch (_) {
    res.json({ url: null, phone: '' });
  }
});

app.get(['/api/admin/whatsapp/inbox/media/:file', '/admin/whatsapp/inbox/media/:file'], adminAuth, requirePerm('canViewWhatsApp'), (req, res) => {
  const file = String(req.params.file || '');
  if (!/^[a-f0-9-]{36}\.(?:jpg|png|webp|gif|mp4|3gp|mov|mp3|ogg|webm|wav|amr|pdf|txt|docx|xlsx|apk)$/i.test(file)) return res.sendStatus(404);
  const filePath = join(getPersistentDataDirectory(), 'uploads', 'wa-inbox', file);
  if (!existsSync(filePath)) return res.sendStatus(404);
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.sendFile(filePath);
});

// Short-lived one-to-one browser call rooms
const webCallRooms = new Map();
const webCallEvents = new Map();
const WEB_CALL_TTL_MS = 10 * 60 * 1000;
function getWebCallRoom(id) {
  const room = webCallRooms.get(String(id || ''));
  if (!room || room.expiresAt < Date.now()) {
    if (room) { webCallRooms.delete(room.id); webCallEvents.delete(room.id); }
    return null;
  }
  return room;
}
function webCallGuestAuth(req, res, next) {
  const room = getWebCallRoom(req.params.roomId);
  const token = String(req.body?.token || req.query?.token || req.headers['x-call-token'] || '');
  if (!room || token.length !== room.guestToken.length || !timingSafeEqual(Buffer.from(token), Buffer.from(room.guestToken))) {
    return res.status(404).json({ error: 'Call link expired or invalid' });
  }
  req.webCallRoom = room;
  next();
}
app.post('/api/admin/call-rooms', adminAuth, requirePerm('canViewWhatsApp'), (req, res) => {
  for (const [id, room] of webCallRooms) {
    if (room.expiresAt < Date.now()) { webCallRooms.delete(id); webCallEvents.delete(id); }
  }
  if (webCallRooms.size >= 100) return res.status(429).json({ error: 'Too many active call links. Try again shortly.' });
  const id = randomBytes(16).toString('hex');
  const guestToken = randomBytes(32).toString('base64url');
  const room = {
    id,
    guestToken,
    mode: req.body?.mode === 'video' ? 'video' : 'audio',
    name: String(req.body?.name || '').slice(0, 100),
    phone: String(req.body?.phone || '').replace(/[^0-9+]/g, '').slice(0, 24),
    createdAt: Date.now(),
    expiresAt: Date.now() + WEB_CALL_TTL_MS,
    guestActiveAt: 0
  };
  webCallRooms.set(id, room);
  webCallEvents.set(id, []);
  res.json({ roomId: id, guestToken, mode: room.mode, expiresAt: room.expiresAt });
});
app.post('/api/admin/call-rooms/:roomId/events', adminAuth, requirePerm('canViewWhatsApp'), (req, res) => {
  const room = getWebCallRoom(req.params.roomId);
  if (!room) return res.status(404).json({ error: 'Call room expired' });
  const events = webCallEvents.get(room.id) || [];
  const after = Math.max(0, Number(req.query.after) || 0);
  const pending = events.filter((e) => e.seq > after && e.from === 'guest').slice(0, 100);
  if (req.body?.event) {
    const e = req.body.event;
    if (!['offer', 'answer', 'candidate', 'hangup', 'ready'].includes(e.type) || JSON.stringify(e).length > 256000) {
      return res.status(400).json({ error: 'Invalid call signal' });
    }
    events.push({ seq: events.length ? events[events.length - 1].seq + 1 : 1, from: 'admin', type: e.type, data: e.data || null, at: Date.now() });
    while (events.length > 500) events.shift();
  }
  res.json({ events: pending, next: pending.length ? pending[pending.length - 1].seq : after, guestActive: Date.now() - room.guestActiveAt < 20000, expiresAt: room.expiresAt });
});
app.post('/api/call-rooms/:roomId/join', webCallGuestAuth, (req, res) => {
  const room = req.webCallRoom;
  if (room.guestActiveAt && Date.now() - room.guestActiveAt < 20000) {
    return res.status(409).json({ error: 'Someone has already joined this call link.' });
  }
  room.guestActiveAt = Date.now();
  res.json({ roomId: room.id, mode: room.mode, name: room.name, expiresAt: room.expiresAt });
});
app.post('/api/call-rooms/:roomId/events', webCallGuestAuth, (req, res) => {
  const room = req.webCallRoom;
  room.guestActiveAt = Date.now();
  const events = webCallEvents.get(room.id) || [];
  const after = Math.max(0, Number(req.query.after) || 0);
  const pending = events.filter((e) => e.seq > after && e.from === 'admin').slice(0, 100);
  if (req.body?.event) {
    const e = req.body.event;
    if (!['offer', 'answer', 'candidate', 'hangup', 'ready'].includes(e.type) || JSON.stringify(e).length > 256000) {
      return res.status(400).json({ error: 'Invalid call signal' });
    }
    events.push({ seq: events.length ? events[events.length - 1].seq + 1 : 1, from: 'guest', type: e.type, data: e.data || null, at: Date.now() });
    while (events.length > 500) events.shift();
  }
  res.json({ events: pending, next: pending.length ? pending[pending.length - 1].seq : after, expiresAt: room.expiresAt });
});

app.post(['/api/admin/whatsapp/inbox/send', '/admin/whatsapp/inbox/send'], adminAuth, requirePerm('canViewWhatsApp'), async (req, res) => {
  let savedPath = '';
  try {
    const { phone, remoteJid, text, attachment: incomingAttachment } = req.body || {};
    const msg = String(text || '').trim();
    if (!phone || (!msg && !incomingAttachment)) return res.status(400).json({ error: 'Phone and a message or attachment are required' });
    let attachment = null;
    if (incomingAttachment) {
      const mimeType = String(incomingAttachment.mimeType || '').toLowerCase().split(';')[0];
      const allowed = {
        'image/jpeg': ['image', 'jpg'], 'image/png': ['image', 'png'], 'image/webp': ['image', 'webp'], 'image/gif': ['image', 'gif'],
        'video/mp4': ['video', 'mp4'], 'video/3gpp': ['video', '3gp'], 'video/quicktime': ['video', 'mov'],
        'audio/mpeg': ['audio', 'mp3'], 'audio/ogg': ['audio', 'ogg'], 'audio/webm': ['audio', 'webm'], 'audio/wav': ['audio', 'wav'], 'audio/amr': ['audio', 'amr'], 'audio/mp4': ['audio', 'mp4'],
        'application/vnd.android.package-archive': ['document', 'apk'],
        'application/pdf': ['document', 'pdf'], 'text/plain': ['document', 'txt'],
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['document', 'docx'],
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['document', 'xlsx'],
      };
      const isApk = /\.apk$/i.test(String(incomingAttachment.name || ''));
      const spec = isApk ? ['document', 'apk'] : allowed[mimeType];
      const maxAttachmentBytes = isApk ? 35 * 1024 * 1024 : 16 * 1024 * 1024;
      const encoded = String(incomingAttachment.data || '').replace(/^data:[^,]*;base64,/, '');
      if (!spec || !encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return res.status(400).json({ error: 'This file type is not supported by WhatsApp.' });
      const buffer = Buffer.from(encoded, 'base64');
      if (!buffer.length || buffer.length > maxAttachmentBytes) return res.status(413).json({ error: `Attachments must be smaller than ${isApk ? '35' : '16'} MB.` });
      const dir = join(getPersistentDataDirectory(), 'uploads', 'wa-inbox');
      mkdirSync(dir, { recursive: true });
      const fileName = `${randomUUID()}.${spec[1]}`;
      savedPath = join(dir, fileName);
      writeFileSync(savedPath, buffer, { flag: 'wx' });
      attachment = {
        path: savedPath,
        fileName: String(incomingAttachment.name || fileName).replace(/[\\/\0-\x1f]/g, '').slice(0, 120) || fileName,
        mimeType: isApk ? 'application/vnd.android.package-archive' : mimeType,
        mediaType: spec[0],
        isVoiceNote: incomingAttachment.isVoiceNote === true && spec[0] === 'audio',
        mediaUrl: `/admin/whatsapp/inbox/media/${fileName}`
      };
    }
    const result = await sendBaileysMessage(phone, msg, null, 'inbox_reply', null, null, attachment, remoteJid || '');
    if (!result?.sent) {
      if (savedPath) { try { unlinkSync(savedPath); } catch (_) {} }
      return res.status(500).json({ error: result?.reason || 'Failed to send' });
    }
    pruneWhatsAppInboxMedia();
    res.json({ ok: true, sent: true });
  } catch (err) {
    if (savedPath) { try { unlinkSync(savedPath); } catch (_) {} }
    res.status(500).json({ error: err?.message || 'Send failed' });
  }
});

app.get('/api/admin/whatsapp/ai-config', adminAuth, requireRole('owner', 'manager'), (req, res) => {
  res.json({ config: getWaAiConfig(), faqs: getWaAiFaqs() });
});

app.put('/api/admin/whatsapp/ai-config', adminAuth, requireRole('owner', 'manager'), (req, res) => {
  const config = saveWaAiConfig(req.body || {});
  res.json({ ok: true, config });
});

app.post('/api/admin/whatsapp/ai-faq', adminAuth, requireRole('owner', 'manager'), (req, res) => {
  const { question, answer } = req.body || {};
  const entry = addWaAiFaq({ question, answer, createdBy: req.admin?.username || 'admin' });
  if (!entry) return res.status(400).json({ error: 'Question and answer are required' });
  res.json({ ok: true, entry, faqs: getWaAiFaqs() });
});

app.delete('/api/admin/whatsapp/ai-faq/:id', adminAuth, requireRole('owner', 'manager'), (req, res) => {
  const faqs = deleteWaAiFaq(req.params.id);
  res.json({ ok: true, faqs });
});

app.post('/api/admin/whatsapp/escalation-reply', adminAuth, async (req, res) => {
  try {
    const { notificationId, phone, replyText, saveToFaq, customerQuestion } = req.body || {};
    const text = String(replyText || '').trim();
    if (!phone || !text) {
      return res.status(400).json({ error: 'Phone and reply message are required' });
    }
    const result = await sendBaileysMessage(phone, text, null, 'escalation_reply');
    if (!result?.sent) {
      return res.status(500).json({ error: result?.reason || 'Failed to send WhatsApp message' });
    }
    if (notificationId) {
      markStaffNotificationsRead(req.admin?.username, [notificationId]);
    }
    let savedFaq = null;
    if (saveToFaq && customerQuestion) {
      savedFaq = addWaAiFaq({
        question: String(customerQuestion).trim(),
        answer: text,
        createdBy: req.admin?.username || 'staff',
      });
    }
    res.json({ ok: true, sent: true, savedFaq });
  } catch (err) {
    res.status(500).json({ error: err?.message || 'Failed to send escalation reply' });
  }
});

function getLifecycleConfig() {
  const s = getSettings();
  return {
    abandonedRecoveryEnabled: !!s.lifecycle?.abandonedRecoveryEnabled,
    abandonedDelayMins: Math.max(15, Number(s.lifecycle?.abandonedDelayMins || 25)),
    abandonedOfferText: s.lifecycle?.abandonedOfferText || 'অর্ডারটি সম্পূর্ণ করলে স্পেশাল ফ্রি ডেলিভারি / ডিসকাউন্ট সুবিধা পাবেন!',
    abandonedDailyCap: Math.min(30, Math.max(1, Number(s.lifecycle?.abandonedDailyCap || 15))),
    refillAutoSendEnabled: !!s.lifecycle?.refillAutoSendEnabled,
    refillDailyCap: Math.min(30, Math.max(1, Number(s.lifecycle?.refillDailyCap || 15))),
    ceoReportEnabled: !!s.lifecycle?.ceoReportEnabled,
    ceoReportPhone: String(s.lifecycle?.ceoReportPhone || s.whatsapp || s.phone || '').trim(),
    ceoReportHour: Math.min(23, Math.max(0, Number(s.lifecycle?.ceoReportHour ?? 23))),
    lastCeoReportDate: s.lifecycle?.lastCeoReportDate || '',
  };
}

app.get('/api/admin/automation/lifecycle', adminAuth, requireRole('owner', 'manager'), (req, res) => {
  res.json({ config: getLifecycleConfig(), recentLogs: getWaAutoLogs().slice(0, 40) });
});

app.put('/api/admin/automation/lifecycle', adminAuth, requireRole('owner', 'manager'), (req, res) => {
  const s = getSettings();
  const prev = getLifecycleConfig();
  const b = req.body || {};
  const next = {
    ...prev,
    ...(typeof b.abandonedRecoveryEnabled === 'boolean' ? { abandonedRecoveryEnabled: b.abandonedRecoveryEnabled } : {}),
    ...(b.abandonedDelayMins !== undefined ? { abandonedDelayMins: Math.max(15, Number(b.abandonedDelayMins) || 25) } : {}),
    ...(typeof b.abandonedOfferText === 'string' ? { abandonedOfferText: b.abandonedOfferText } : {}),
    ...(b.abandonedDailyCap !== undefined ? { abandonedDailyCap: Math.min(30, Math.max(1, Number(b.abandonedDailyCap) || 15)) } : {}),
    ...(typeof b.refillAutoSendEnabled === 'boolean' ? { refillAutoSendEnabled: b.refillAutoSendEnabled } : {}),
    ...(b.refillDailyCap !== undefined ? { refillDailyCap: Math.min(30, Math.max(1, Number(b.refillDailyCap) || 15)) } : {}),
    ...(typeof b.ceoReportEnabled === 'boolean' ? { ceoReportEnabled: b.ceoReportEnabled } : {}),
    ...(typeof b.ceoReportPhone === 'string' ? { ceoReportPhone: b.ceoReportPhone.trim() } : {}),
    ...(b.ceoReportHour !== undefined ? { ceoReportHour: Math.min(23, Math.max(0, Number(b.ceoReportHour) || 23)) } : {}),
  };
  saveSettings({ ...s, lifecycle: next });
  res.json({ ok: true, config: next });
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
    const finalEvent = eventType || 'manual_admin';
    const result = await sendBaileysMessage(phone, message || '', orderId || null, finalEvent, imageUrl || null, delayMs || null);
    
    // If associated with an order and sent, log into order history
    if (orderId && result?.sent) {
      try {
        const orders = getOrders();
        const target = orders.find((o) => o.id === orderId);
        if (target) {
          target.history = target.history || [];
          target.history.push({
            status: target.status,
            note: `WhatsApp message sent to ${phone} by ${req.admin?.name || 'Admin'} via Store WhatsApp`,
            at: new Date().toISOString(),
          });
          updateOrder(orderId, target);
        }
      } catch (e) {
        console.warn('[WhatsApp Send History Note Error]:', e?.message);
      }
    }
    
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
        .replace(/\{store\}/g, 'TimeBoost')
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
    const filename = `TimeBoost_Contacts_Backup_${type}_${new Date().toISOString().slice(0, 10)}.csv`;

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

  const storeName = getSettings().storeName || 'TimeBoost';
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
      '/root/secrate-backups/apks/ShakilEcom.apk'
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
  const SEO_ORIGIN = 'https://timingboost.xyz';
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
    index: false,
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
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    const indexPath = join(dist, 'index.html');
    if (!existsSync(indexPath)) return res.status(404).send('Not found');

    try {
      let html = readFileSync(indexPath, 'utf8');
      const stNow = getSettings();
      const host = req.get('host') || (stNow.storeUrl ? new URL(stNow.storeUrl).host : (req.hostname && req.hostname.includes('secrate') ? 'secrate.shop' : 'timingboost.xyz'));
      const proto = req.protocol === 'https' || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
      const baseUrl = `${proto}://${host}`;
      const path = req.path || '/';

      const cleanPath = path.replace(/^\/+|\/+$/g, '');
      const parts = cleanPath.split('/').filter(Boolean);
      let targetProduct = null;
      let targetCategory = null;
      let targetLanding = null;

      if ((parts[0] === 'page' || parts[0] === 'l') && parts[1]) {
        try {
          targetLanding = getLandingBySlug(parts[1]);
        } catch (_) {}
      } else if (parts.length === 1 && !['shop', 'categories', 'category', 'checkout', 'confirm', 'track', 'wp-admin', 'account', 'admin', 'terms', 'privacy', 'refund', 'contact'].includes(parts[0])) {
        try {
          targetLanding = getLandingBySlug(parts[0]);
        } catch (_) {}
      }

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
        const pTitle = String(targetProduct.seoTitle || `${targetProduct.name} — TimeBoost`).slice(0, 70);
        const pDesc = String(targetProduct.seoDesc || targetProduct.shortDesc || targetProduct.desc || targetProduct.name).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
        const pImg = absoluteUrl(targetProduct.image || (targetProduct.images && targetProduct.images[0]));
        const pUrl = `${baseUrl}/product/${encodeURIComponent(targetProduct.slug || targetProduct.id)}`;
        const pPrice = String(targetProduct.price || 0);
        const productJsonLd = {
          '@context': 'https://schema.org', '@type': 'Product',
          name: targetProduct.name, description: pDesc, image: [pImg], url: pUrl,
          sku: targetProduct.sku || undefined, brand: { '@type': 'Brand', name: 'TimeBoost' },
          offers: {
            '@type': 'Offer', url: pUrl, priceCurrency: 'BDT', price: Number(targetProduct.price || 0),
            availability: targetProduct.soldOut || Number(targetProduct.stock) === 0 ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
            itemCondition: 'https://schema.org/NewCondition', seller: { '@type': 'Organization', name: 'TimeBoost' },
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
        const title = `${targetCategory.name} — TimeBoost`;
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
      } else if (targetLanding) {
        const isHtmlMode = targetLanding.mode === 'html' && targetLanding.customHtml;
        const rawCustomHtml = isHtmlMode ? String(targetLanding.customHtml) : '';
        const htmlTitleMatch = rawCustomHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        const htmlH1Match = rawCustomHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
        const htmlDescMatch = rawCustomHtml.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
          || rawCustomHtml.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
        const htmlImgMatch = rawCustomHtml.match(/<img[^>]+src=["'](https?:\/\/[^"']+|\/uploads\/[^"']+)["']/i);

        const extractedHtmlTitle = (htmlTitleMatch && htmlTitleMatch[1] ? htmlTitleMatch[1] : (htmlH1Match && htmlH1Match[1] ? htmlH1Match[1] : ''))
          .replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        const isDefaultLovelockHeadline = targetLanding.headline === 'ম্যাজিক লাভ লক কনডম' && targetLanding.slug !== 'lovelock';

        const landTitle = String(
          isHtmlMode
            ? (extractedHtmlTitle || targetLanding.title || (!isDefaultLovelockHeadline && targetLanding.headline) || 'Special Offer')
            : ((!isDefaultLovelockHeadline && targetLanding.headline) || targetLanding.title || 'Special Offer')
        ).trim();

        const isDefaultLovelockSub = String(targetLanding.subtitle || targetLanding.subheadline || '').includes('পুরুষাঙ্গ') && targetLanding.slug !== 'lovelock';
        const rawSub = !isHtmlMode && !isDefaultLovelockSub ? (targetLanding.subheadline || targetLanding.subtitle) : '';
        const landDesc = String(
          (htmlDescMatch && htmlDescMatch[1]) || rawSub || targetLanding.title || landTitle || 'Special Offer — Cash on Delivery across Bangladesh.'
        ).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);

        const rawLandingImg = targetLanding.mainImage || targetLanding.heroImage || (htmlImgMatch && htmlImgMatch[1]) || '';
        const landImg = rawLandingImg ? absoluteUrl(rawLandingImg) : '';
        const landUrl = `${baseUrl}/page/${encodeURIComponent(parts[1] || parts[0])}`;

        html = html
          .replace(/<title>[\s\S]*?<\/title>/i, `<title>${htmlEscape(landTitle)}</title>`)
          .replace(/<meta name="description" content="[^"]*"/i, `<meta name="description" content="${htmlEscape(landDesc)}"`)
          .replace(/<meta property="og:title" content="[^"]*"/i, `<meta property="og:title" content="${htmlEscape(landTitle)}"`)
          .replace(/<meta property="og:description" content="[^"]*"/i, `<meta property="og:description" content="${htmlEscape(landDesc)}"`)
          .replace(/<meta name="twitter:title" content="[^"]*"/i, `<meta name="twitter:title" content="${htmlEscape(landTitle)}"`)
          .replace(/<meta name="twitter:description" content="[^"]*"/i, `<meta name="twitter:description" content="${htmlEscape(landDesc)}"`);
        if (landImg) {
          html = html.replace(/<meta property="og:image" content="[^"]*"/i, `<meta property="og:image" content="${htmlEscape(landImg)}"`);
        }

        const stForLanding = getSettings();
        const hasCustom = Boolean(targetLanding.fbPixelId || targetLanding.ttkPixelId || targetLanding.gtmId || targetLanding.gaId);
        const isDual = targetLanding.pixelMode === 'both';
        const customPid = targetLanding.fbPixelId ? String(targetLanding.fbPixelId).trim() : null;
        const storePid = stForLanding.fbPixelId ? String(stForLanding.fbPixelId).trim() : null;
        const allowedPixels = hasCustom
          ? (isDual ? [customPid, storePid].filter(Boolean) : (customPid ? [customPid] : []))
          : (storePid ? [storePid] : []);
        const activeLandingGtm = hasCustom
          ? (targetLanding.gtmId ? String(targetLanding.gtmId).trim() : (isDual ? (stForLanding.gtmId || null) : null))
          : (stForLanding.gtmId || null);

        const trackingPayload = {
          isLanding: true,
          slug: targetLanding.slug || parts[1] || parts[0],
          fbPixelId: customPid || (!hasCustom ? storePid : null),
          fbTestCode: targetLanding.fbTestCode ? String(targetLanding.fbTestCode).trim() : null,
          pixelMode: targetLanding.pixelMode || 'custom',
          ttkPixelId: targetLanding.ttkPixelId ? String(targetLanding.ttkPixelId).trim() : null,
          gtmId: activeLandingGtm,
          gaId: targetLanding.gaId ? String(targetLanding.gaId).trim() : null,
          hasCustomTracking: hasCustom,
          strictIsolation: hasCustom && !isDual,
          allowedPixels
        };
        const autoBrainPayload = {
          mode: 'landing',
          slug: trackingPayload.slug,
          strictIsolation: hasCustom && !isDual,
          allowedPixels,
          primaryPixelId: trackingPayload.fbPixelId,
          fbTestCode: trackingPayload.fbTestCode,
          ttkPixelId: trackingPayload.ttkPixelId,
          gtmId: activeLandingGtm,
          gaId: trackingPayload.gaId,
          blockGtm: !activeLandingGtm
        };
        const landingPreloadScript = `<script>window.__AUTO_BRAIN__ = ${JSON.stringify(autoBrainPayload)}; window.__LANDING_TRACKING__ = ${JSON.stringify(trackingPayload)}; window.__ALLOWED_PIXELS__ = ${JSON.stringify(allowedPixels)};${activeLandingGtm ? ' window.__ALLOWED_GTM__ = true;' : ' window.__BLOCKED_GTM__ = true;'}</script>`;
        html = html.replace('<head>', `<head>\n    ${landingPreloadScript}`);
      } else {
        const s = getSettings();
        const brand = (s.storeName && s.storeName !== 'dot.' && s.storeName !== 'Dot Store')
          ? s.storeName
          : (req.hostname && req.hostname.includes('secrate') ? 'SECRATE' : (req.hostname && req.hostname.includes('metr') ? 'METRROMA' : 'TimeBoost'));
        const customTitle = (s.siteTitle || s.metaTitle || '').trim();
        const finalTitle = customTitle || `${brand} — For your personal world.`;
        html = html
          .replace(/<title>[\s\S]*?<\/title>/i, `<title>${htmlEscape(finalTitle)}</title>`)
          .replace(/<meta property="og:title" content="[^"]*"/i, `<meta property="og:title" content="${htmlEscape(finalTitle)}"`)
          .replace(/<meta property="og:site_name" content="[^"]*"/i, `<meta property="og:site_name" content="${htmlEscape(brand)}"`)
          .replace(/<meta name="twitter:title" content="[^"]*"/i, `<meta name="twitter:title" content="${htmlEscape(finalTitle)}"`)
          .replace(/<meta property="og:image" content="(\/[^"]+)"/i, `<meta property="og:image" content="${baseUrl}$1"`);
      }

      const isAdminPath = parts[0] === 'wp-admin' || parts[0] === 'admin' || parts[0] === 'staff' ||
        cleanPath.toLowerCase().startsWith('wp-admin') || cleanPath.toLowerCase().startsWith('admin') || cleanPath.toLowerCase().startsWith('staff') ||
        (req.path && /^\/(wp-admin|admin|staff)/i.test(req.path));

      const storeSettingsNow = getSettings();
      const activeGtmId = storeSettingsNow.gtmId;
      const landingHasCustomTracking = targetLanding && (targetLanding.fbPixelId || targetLanding.ttkPixelId || targetLanding.gtmId || targetLanding.gaId);

      if (!targetLanding && !isAdminPath) {
        const storePid = storeSettingsNow.fbPixelId ? String(storeSettingsNow.fbPixelId).trim() : null;
        const storeBrain = {
          mode: 'store',
          strictIsolation: false,
          allowedPixels: storePid ? [storePid] : [],
          primaryPixelId: storePid,
          gtmId: activeGtmId || null,
          blockGtm: false
        };
        html = html.replace('<head>', `<head>\n    <script>window.__AUTO_BRAIN__ = ${JSON.stringify(storeBrain)};</script>`);
      }

      if (activeGtmId && !landingHasCustomTracking && !isAdminPath) {
        const gtmSnippet = `<!-- Google Tag Manager -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${activeGtmId}');</script>
<!-- End Google Tag Manager -->`;
        html = html.replace('<head>', `<head>\n    ${gtmSnippet}`);
      } else if (targetLanding && targetLanding.gtmId && !isAdminPath) {
        const gtmSnippet = `<!-- Google Tag Manager -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${targetLanding.gtmId}');</script>
<!-- End Google Tag Manager -->`;
        html = html.replace('<head>', `<head>\n    ${gtmSnippet}`);
      }

      if (isAdminPath) {
        html = html.replace('<head>', '<head>\n    <script>window.__IS_ADMIN__ = true; window.__AUTO_BRAIN__ = {"mode":"admin","strictIsolation":true,"allowedPixels":[],"gtmId":null,"blockGtm":true}; window.dataLayer = []; try { var noop = function(){}; Object.defineProperty(window, "fbq", { get: function(){ return noop; }, set: function(){}, configurable: false }); Object.defineProperty(window, "_fbq", { get: function(){ return noop; }, set: function(){}, configurable: false }); Object.defineProperty(window, "ttq", { get: function(){ return { track: noop, page: noop, identify: noop }; }, set: function(){}, configurable: false }); Object.defineProperty(window, "gtag", { get: function(){ return noop; }, set: function(){}, configurable: false }); } catch(_){} </script>');
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

// ==========================================

// ==========================================
// STORE GEMINI API KEY HELPERS & TEST ENDPOINTS
// ==========================================
export function getStoreGeminiApiKey() {
  const ig = getIntegrations() || {};
  const wa = getWhatsAppSettings() || {};
  const settings = getSettings() || {};
  const key = String(
    ig.geminiApiKey ||
    ig.ai?.geminiApiKey ||
    wa.geminiApiKey ||
    settings.geminiApiKey ||
    process.env.GEMINI_API_KEY ||
    ''
  ).trim();
  return key;
}

export function saveStoreGeminiApiKey(rawKey) {
  const key = String(rawKey || '').trim();
  const ig = getIntegrations() || {};
  ig.geminiApiKey = key;
  if (!ig.whatsapp) ig.whatsapp = {};
  ig.whatsapp.geminiApiKey = key;
  saveIntegrations(ig);
  try {
    saveWhatsAppSettings({ geminiApiKey: key });
  } catch (_) {}
  return key;
}

app.post('/api/ai-call/test-key', adminAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const key = String(req.body?.geminiApiKey || getStoreGeminiApiKey() || '').trim();
    if (!key) return res.json({ ok: false, error: 'কোনো Gemini API Key পাওয়া যায়নি।' });
    const testModels = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
    let lastErr = '';
    for (const m of testModels) {
      try {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${encodeURIComponent(key)}`;
        const r = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Say OK' }] }], generationConfig: { maxOutputTokens: 10 } })
        });
        if (r.ok) {
          if (req.body?.geminiApiKey && String(req.body.geminiApiKey).trim()) {
            saveStoreGeminiApiKey(key);
          }
          return res.json({ ok: true, model: m, message: `✅ Gemini API Key কাজ করছে (${m}) এবং এই স্টোরের জন্য সেভ হয়েছে!` });
        }
        const errData = await r.json().catch(() => ({}));
        lastErr = errData?.error?.message || `HTTP ${r.status}`;
      } catch (err) {
        lastErr = err?.message;
      }
    }
    res.json({ ok: false, error: lastErr || 'Unknown error' });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

app.get('/api/admin/ai-copilot/key', adminAuth, (req, res) => {
  try {
    const key = getStoreGeminiApiKey();
    const masked = key ? (key.length > 10 ? `${key.slice(0, 6)}...${key.slice(-4)}` : '******') : '';
    const ig = getIntegrations() || {};
    const isStoreSpecific = !!(ig.geminiApiKey || ig.whatsapp?.geminiApiKey);
    res.json({
      ok: true,
      hasKey: !!key,
      keyMasked: masked,
      isStoreSpecific,
      storeName: getSettings()?.storeName || 'METRROMA'
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/admin/ai-copilot/key', adminAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const key = String(req.body?.geminiApiKey || '').trim();
    if (!key) return res.status(400).json({ ok: false, error: 'অনুগ্রহ করে একটি বৈধ Gemini API Key দিন।' });
    const testModels = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
    let verified = false;
    let activeModel = '';
    let lastErr = '';
    for (const m of testModels) {
      try {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${encodeURIComponent(key)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Say OK' }] }], generationConfig: { maxOutputTokens: 10 } })
        });
        if (r.ok) {
          verified = true;
          activeModel = m;
          break;
        }
        const errJson = await r.json().catch(() => ({}));
        lastErr = errJson?.error?.message || `HTTP ${r.status}`;
      } catch (err) {
        lastErr = err?.message;
      }
    }
    if (!verified) {
      return res.status(400).json({ ok: false, error: lastErr || 'API Key সঠিক নয় বা কোটা সমস্যা।' });
    }
    saveStoreGeminiApiKey(key);
    const storeName = getSettings()?.storeName || 'METRROMA';
    res.json({
      ok: true,
      model: activeModel,
      message: `✅ "${storeName}" স্টোরের নিজস্ব Gemini API Key সংরক্ষিত ও সক্রিয় হয়েছে!`
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});


const callCenterPresence = new Map();
let recentIncomingVisitorRing = null;


// ---- Smart AI Calling System (Website Voice Agent, Auto-Confirm, Marketing & Tool Execution) ----
const activeAiCalls = new Map();
const aiCallWsTickets = new Map();
const activeAiCallClients = new Map();
const publicAiCallLimits = new Map();

app.post('/api/ai-call/ws-ticket', adminAuth, requireRole('owner', 'manager'), (req, res) => {
  const ticket = randomBytes(24).toString('hex');
  aiCallWsTickets.set(ticket, { expiresAt: Date.now() + 120_000, username: req.admin?.username || '' });
  for (const [key, value] of aiCallWsTickets) {
    if (value.expiresAt < Date.now()) aiCallWsTickets.delete(key);
  }
  res.json({ ticket });
});
const pendingAgentTransfers = [];

function getHelpCenterAvailability() {
  const now = Date.now();
  const available = [];
  const busy = [];
  const dnd = [];
  for (const p of callCenterPresence.values()) {
    if (!p || (now - p.updatedAt) >= 45000) continue;
    if (p.status === 'available') available.push(p);
    else if (p.status === 'on_call') busy.push(p);
    else if (p.status === 'dnd') dnd.push(p);
  }
  return { available, busy, dnd };
}

function isQuietHoursBangladesh(aiCfg) {
  if (!aiCfg?.quietHoursEnabled) return false;
  try {
    const hourStr = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Dhaka', hour: '2-digit', hour12: false }).format(new Date());
    const h = parseInt(hourStr, 10);
    const start = Number.isFinite(Number(aiCfg.quietStartHour)) ? Number(aiCfg.quietStartHour) : 22;
    const end = Number.isFinite(Number(aiCfg.quietEndHour)) ? Number(aiCfg.quietEndHour) : 9;
    if (start > end) return h >= start || h < end;
    return h >= start && h < end;
  } catch (_) {
    return false;
  }
}

function getAiDeviceMemPath() {
  return join(getPersistentDataDirectory(), 'ai_device_memory.json');
}

function readAiDeviceMemory() {
  try {
    const p = getAiDeviceMemPath();
    if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf8')) || { devices: {} };
  } catch (_) {}
  return { devices: {} };
}

function lookupAiDeviceMemory(deviceId, fingerprint) {
  const store = readAiDeviceMemory();
  const keys = [];
  if (fingerprint) keys.push(`fp:${fingerprint}`);
  if (deviceId) keys.push(`dev:${deviceId}`);
  for (const k of keys) {
    if (store.devices?.[k]) return store.devices[k];
  }
  return null;
}

function saveAiDeviceMemory(deviceId, fingerprint, patch) {
  if (!deviceId && !fingerprint) return;
  try {
    const store = readAiDeviceMemory();
    if (!store.devices) store.devices = {};
    const existing = lookupAiDeviceMemory(deviceId, fingerprint) || {};
    const merged = {
      name: (patch?.name && patch.name !== 'Customer') ? patch.name : (existing.name || ''),
      phone: (patch?.phone && patch.phone !== 'Website Visitor') ? patch.phone : (existing.phone || ''),
      address: patch?.address || existing.address || '',
      lastProduct: patch?.lastProduct || existing.lastProduct || '',
      lastOrderId: patch?.lastOrderId || existing.lastOrderId || null,
      lastCallSummary: patch?.lastCallSummary || existing.lastCallSummary || '',
      callCount: Number(existing.callCount || 0) + (patch?.incrementCall ? 1 : 0),
      updatedAt: new Date().toISOString()
    };
    if (fingerprint) store.devices[`fp:${fingerprint}`] = merged;
    if (deviceId) store.devices[`dev:${deviceId}`] = merged;
    writeFileSync(getAiDeviceMemPath(), JSON.stringify(store, null, 2));
  } catch (_) {}
}

function buildAiCustomerContext(rawPhone, rawOrderId, deviceId, fingerprint) {
  const knownDevice = lookupAiDeviceMemory(deviceId, fingerprint);
  const effectivePhone = rawPhone || knownDevice?.phone || '';
  const allOrders = getOrders();
  const cleanPhone = String(effectivePhone || '').replace(/\D/g, '').replace(/^88/, '');
  const matchedOrders = cleanPhone.length >= 6
    ? allOrders.filter((o) => {
        const op = String(o.customer?.phone || '').replace(/\D/g, '').replace(/^88/, '');
        return op && (op.endsWith(cleanPhone.slice(-8)) || cleanPhone.endsWith(op.slice(-8)));
      })
    : [];
  const targetOrder = rawOrderId
    ? allOrders.find((o) => String(o.id) === String(rawOrderId)) || matchedOrders[0] || null
    : matchedOrders[0] || null;
  const cancelledCount = matchedOrders.filter((o) => o.status === 'cancelled' || o.status === 'return').length;
  const deliveredCount = matchedOrders.filter((o) => o.status === 'delivered').length;
  let customerTier = 'New Customer';
  if (cancelledCount >= 2 && deliveredCount === 0) customerTier = 'High Risk (Multiple Cancels/Returns)';
  else if (deliveredCount >= 2 || matchedOrders.length >= 3) customerTier = 'VIP / Repeat Customer';
  else if (knownDevice?.phone || matchedOrders.length >= 1) customerTier = 'Returning Customer';
  return {
    targetOrder,
    totalOrders: matchedOrders.length,
    cancelledCount,
    deliveredCount,
    customerTier,
    knownDevice
  };
}

function stripHtmlText(raw, maxLen = 400) {
  return String(raw || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLen);
}

function getAiProductCatalogSummary() {
  try {
    const cat = getCatalog();
    const products = (Array.isArray(cat?.products) ? cat.products : []).filter(
      (p) => p && !p.deleted && p.status !== 'draft' && p.status !== 'archived'
    );
    const st = getSettings() || {};
    const defInside = st.deliveryInside;
    const defOutside = st.deliveryOutside;
    return products.map((p) => {
      const vars = Array.isArray(p.variations)
        ? p.variations.map((v) => ({
            id: v.id || '',
            name: v.name || v.label || v.title || v.size || '',
            price: v.price ?? p.price,
            stock: p.soldOut || v.soldOut ? 'Out of Stock' : (v.stock ?? p.stock ?? 'In Stock'),
            soldOut: p.soldOut === true || v.soldOut === true
          })).filter((v) => v.name)
        : [];
      const fullDesc = stripHtmlText([p.shortDesc, p.desc, p.longDesc].filter(Boolean).join(' '), 450);
      return {
        id: p.id,
        slug: p.slug || '',
        name: p.name || '',
        price: p.price,
        compareAt: p.compareAt || null,
        stock: p.soldOut ? 'Out of Stock' : (p.stock ?? 'In Stock'),
        category: p.category || '',
        subCategory: p.subCategory || '',
        size: p.size || '',
        weight: p.weight || '',
        colors: Array.isArray(p.colors) ? p.colors : [],
        variations: vars,
        deliveryInside: p.customDeliveryInside ?? defInside,
        deliveryOutside: p.customDeliveryOutside ?? defOutside,
        keywords: String(p.seoKeywords || ''),
        shortDesc: fullDesc
      };
    });
  } catch (_) {
    return [];
  }
}

function getAiCompactProductDirectory() {
  return getAiProductCatalogSummary()
    .map((p) => {
      const delTxt = (Number(p.deliveryInside) === 0 && Number(p.deliveryOutside) === 0)
        ? 'Free Delivery'
        : `Del: Dhaka ${p.deliveryInside}৳ / Outside ${p.deliveryOutside}৳`;
      const varTxt = p.variations?.length ? ` [Options: ${p.variations.map((v) => `${v.name}:${v.price}৳`).join(', ')}]` : '';
      return `${p.name} (${p.price}৳${p.compareAt ? `, MRP ${p.compareAt}৳` : ''}, ${delTxt}, ${p.category || 'General'}, ${p.stock})${varTxt}`;
    })
    .join('\n');
}

function getLandingProductSummary(landing) {
  if (!landing) return null;
  if (landing.mode === 'html' && landing.customHtml) {
    const raw = String(landing.customHtml || '');
    const h1Match = raw.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const cleanH1 = h1Match ? stripHtmlText(h1Match[1].replace(/\{[^}]*\}/g, ' '), 120) : '';
    const isOldLovelockClone = /লাভ\s*লক|lovelock|কনডম/i.test(String(landing.productTitle || '') + ' ' + String(landing.headline || '')) && !/lovelock/i.test(String(landing.slug || ''));
    const realTitle = (!isOldLovelockClone && (landing.productTitle || landing.title)) || landing.title || cleanH1 || landing.slug;
    const comboAndOfferLines = raw
      .split(/\r?\n/)
      .filter((ln) => /combo|কম্বো|পিস|পিছ|ছাড়|ছাড়|ফ্রি|ডেলিভারি|free|delivery|formVal|label:|totalQty|comboDiscount/i.test(ln))
      .map((ln) => ln.replace(/<[^>]+>/g, ' ').replace(/https?:\/\/[^\s'"`)]+/gi, '').replace(/[{}()[\];=>`"'*]/g, ' ').replace(/\s+/g, ' ').trim())
      .filter((ln) => ln.length >= 6 && ln.length <= 160)
      .slice(0, 18)
      .join(' | ');
    const textExcerpt = (raw
      .replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/https?:\/\/[^\s'"`)]+/gi, ' ')
      .replace(/className\s*=\s*["'`][^"'`]*["'`]/gi, ' ')
      .replace(/style\s*=\s*\{\{[\s\S]*?\}\}/gi, ' ')
      .replace(/import\s+[\s\S]*?from\s+['"][^'"]+['"];?/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[{}()[\];=>`"'*]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 1000) + (comboAndOfferLines ? `\nCOMBO & COLOR OFFERS: ${comboAndOfferLines}` : '')).trim();
    const offerPriceMatch = raw.match(/(?:অফার\s*মূল্য|আজকের\s*(?:অফার\s*)?মূল্য|offer\s*price|selling\s*price|price)[^\d৳]{0,30}৳?\s*([1-9]\d{1,4})/i);
    const nonDiscountMatch = raw.replace(/৳\s*\d+\s*(?:ছাড়|ছাড়|off|discount)/gi, '').match(/৳\s*([1-9]\d{1,4})|([1-9]\d{1,4})\s*৳/);
    const detectedPrice = Number(
      (!isOldLovelockClone && landing.price > 0 ? landing.price : 0) ||
      (offerPriceMatch && offerPriceMatch[1]) ||
      (nonDiscountMatch && (nonDiscountMatch[1] || nonDiscountMatch[2])) ||
      0
    );
    const deliveryVerified = landing.deliveryInside != null && landing.deliveryOutside != null && Number.isFinite(Number(landing.deliveryInside)) && Number.isFinite(Number(landing.deliveryOutside));
    const delIn = deliveryVerified ? Number(landing.deliveryInside) : null;
    const delOut = deliveryVerified ? Number(landing.deliveryOutside) : null;
    const rawPkgs = (!isOldLovelockClone && Array.isArray(landing.packages) && landing.packages.length > 0)
      ? landing.packages.map((pk) => ({
          id: pk.id || '',
          name: pk.name || pk.title || realTitle,
          price: Number(pk.price || detectedPrice || 0),
          compareAt: pk.compareAt || null,
          priceVerified: Number(pk.price) > 0 || (landing.packages.length === 1 && Number(landing.price) > 0),
          deliveryVerified: pk.freeDelivery === true || deliveryVerified,
          freeDelivery: pk.freeDelivery === true || (deliveryVerified && delIn === 0 && delOut === 0),
          deliveryInside: pk.freeDelivery ? 0 : delIn,
          deliveryOutside: pk.freeDelivery ? 0 : delOut,
          badge: pk.badge || ''
        }))
      : [{ id: 'main', name: realTitle, price: detectedPrice, priceVerified: Number(landing.price) > 0, deliveryVerified, compareAt: null, freeDelivery: deliveryVerified && delIn === 0 && delOut === 0, deliveryInside: delIn, deliveryOutside: delOut, badge: '' }];
    return {
      slug: landing.slug,
      title: realTitle,
      subtitle: '',
      deliveryInside: delIn,
      deliveryOutside: delOut,
      deliveryVerified,
      packages: rawPkgs
    };
  }
  const deliveryVerified = landing.deliveryInside != null && landing.deliveryOutside != null && Number.isFinite(Number(landing.deliveryInside)) && Number.isFinite(Number(landing.deliveryOutside));
  const delIn = deliveryVerified ? Number(landing.deliveryInside) : null;
  const delOut = deliveryVerified ? Number(landing.deliveryOutside) : null;
  const pkgs = Array.isArray(landing.packages)
    ? landing.packages.map((pk) => ({
        id: pk.id || '',
        name: pk.name || pk.title || landing.productTitle || landing.title,
        price: Number(pk.price || 0),
        priceVerified: Number(pk.price) > 0,
        deliveryVerified: pk.freeDelivery === true || deliveryVerified,
        compareAt: pk.compareAt || null,
        freeDelivery: pk.freeDelivery === true || (deliveryVerified && delIn === 0 && delOut === 0),
        deliveryInside: pk.freeDelivery ? 0 : delIn,
        deliveryOutside: pk.freeDelivery ? 0 : delOut,
        badge: pk.badge || ''
      }))
    : [];
  return {
    slug: landing.slug,
    title: landing.productTitle || landing.title || landing.headline,
    subtitle: stripHtmlText([landing.headline, landing.subtitle, landing.productTagline, landing.badgeGuarantee].filter(Boolean).join(' '), 500),
    deliveryInside: delIn,
    deliveryOutside: delOut,
    deliveryVerified,
    packages: pkgs
  };
}

function getAllLandingPagesDirectory() {
  try {
    const list = getLandings() || [];
    if (!list.length) return 'বর্তমানে কোনো বিশেষ ল্যান্ডিং পেজ কনফিগার করা নেই।';
    return list.map((l, idx) => {
      const slug = l.slug || l.id || `landing-${idx + 1}`;
      const title = l.title || l.productTitle || l.headline || slug;
      const subtitle = l.subtitle || l.productTagline || '';
      const headline = l.headline || '';
      const delInside = l.deliveryInside != null ? `${l.deliveryInside}৳` : 'স্ট্যান্ডার্ড';
      const delOutside = l.deliveryOutside != null ? `${l.deliveryOutside}৳` : 'স্ট্যান্ডার্ড';
      const freeDel = l.freeDelivery ? 'ফ্রি ডেলিভারি (0৳)' : `ঢাকা ${delInside}, ঢাকার বাইরে ${delOutside}`;
      const guarantee = l.badgeGuarantee || l.guaranteeText || l.badgeTop || '';

      let pkgsText = 'প্যাকেজসমূহ: ';
      if (Array.isArray(l.packages) && l.packages.length > 0) {
        pkgsText += l.packages.map((p) => {
          const pName = p.title || p.name || 'প্যাকেজ';
          const pPrice = p.price ? `${p.price}৳` : 'দাম নির্ধারিত নেই';
          const pOrig = p.originalPrice ? ` (পূর্বমূল্য ${p.originalPrice}৳)` : '';
          return `[${pName}: ${pPrice}${pOrig}]`;
        }).join(', ');
      } else if (l.offerPriceText || l.price) {
        pkgsText += `অফার মূল্য: ${l.offerPriceText || `${l.price}৳`}`;
      } else {
        pkgsText += 'একক রেগুলার প্যাকেজ';
      }

      let benefitsText = '';
      if (Array.isArray(l.benefits) && l.benefits.length > 0) {
        benefitsText = `\n  - বৈশিষ্ট্য ও সুবিধা: ${l.benefits.slice(0, 5).join('; ')}`;
      }

      return `• [ল্যান্ডিং পেজ: ${title}] (Slug: /${slug})\n  - হেডলাইন: ${headline || subtitle}\n  - ${pkgsText}\n  - ডেলিভারি চার্জ: ${freeDel}${guarantee ? `\n  - গ্যারান্টি: ${guarantee}` : ''}${benefitsText}`;
    }).join('\n\n');
  } catch (err) {
    return 'ল্যান্ডিং পেজ তথ্য লোড করার সময় ত্রুটি হয়েছে।';
  }
}

function normalizeAiMatch(value) {
  return String(value || '').normalize('NFKC').toLocaleLowerCase().replace(/[()\[\]{}.,:;–—-]/g, ' ').replace(/\s+/g, ' ').trim();
}

function knownStockCount(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, value);
  const raw = String(value ?? '').trim();
  if (!raw || /in stock|available|∞/i.test(raw)) return null;
  if (/out of stock|sold out|স্টক নেই|শেষ/i.test(raw)) return 0;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : null;
}

function executeAiCallTool(name, args, session) {
  const actions = [];
  if (name === 'get_product_details') {
    const q = String(args?.query || '').toLowerCase().trim();
    if (session?.landing) {
      const ls = getLandingProductSummary(session.landing);
      actions.push({ tool: 'get_product_details', query: q, scopedLanding: ls.slug, count: ls.packages.length });
      const safeLanding = {
        slug: ls.slug,
        title: ls.title,
        packages: ls.packages.map((pk) => ({
          id: pk.id,
          name: pk.name,
          price: pk.priceVerified ? pk.price : null,
          priceVerified: pk.priceVerified === true,
          freeDelivery: pk.freeDelivery === true,
          deliveryInside: pk.deliveryVerified ? pk.deliveryInside : null,
          deliveryOutside: pk.deliveryVerified ? pk.deliveryOutside : null,
          deliveryVerified: pk.deliveryVerified === true
        }))
      };
      return { result: { scopedToLandingPage: true, landingProduct: safeLanding }, actions };
    }
    const products = getAiProductCatalogSummary();
    if (!q || q === 'all') {
      actions.push({ tool: 'get_product_details', query: q, count: products.length });
      return { result: { totalCatalogCount: products.length, products: [], requiresClarification: true, message: 'Ask for the exact product name or ID before quoting a product.' }, actions };
    }
    const exactMatches = products.filter((p) => [p.id, p.slug, p.name].some((value) => normalizeAiMatch(value) === normalizeAiMatch(q)));
    if (exactMatches.length === 1) {
      actions.push({ tool: 'get_product_details', query: q, count: 1, exact: true });
      return { result: { products: exactMatches, exactMatch: true, requiresClarification: false }, actions };
    }
    const queryTerms = normalizeAiMatch(q).split(' ').filter((term) => term.length > 1);
    const candidates = products.filter((p) => {
      const hay = normalizeAiMatch(`${p.name} ${p.slug} ${p.category} ${p.subCategory} ${p.shortDesc} ${p.keywords} ${p.size} ${(p.variations || []).map((v) => v.name).join(' ')}`);
      return hay.includes(normalizeAiMatch(q)) || (queryTerms.length > 0 && queryTerms.every((term) => hay.includes(term)));
    }).slice(0, 8);
    actions.push({ tool: 'get_product_details', query: q, count: candidates.length, exact: false });
    return { result: { products: candidates, exactMatch: false, requiresClarification: true, message: 'Do not quote or select a product from a partial match. Ask the customer to identify the exact product.' }, actions };
  }
  if (name === 'update_order_address') {
    const oid = String(args?.orderId || session.orderId || '').trim();
    const newAddr = String(args?.newAddress || '').trim();
    if (!oid || !newAddr) return { result: { ok: false, error: 'Missing orderId or newAddress' }, actions };
    if (session?.mode !== 'outbound_confirm' || !session?.targetOrder || oid !== String(session.targetOrder.id)) {
      return { result: { ok: false, error: 'Address changes are only allowed for this call’s linked order.' }, actions };
    }
    const existing = getOrders().find((o) => String(o.id) === oid);
    if (!existing) return { result: { ok: false, error: 'Order not found' }, actions };
    if (existing.status !== 'pending') return { result: { ok: false, error: 'Only pending orders can request an address correction.' }, actions };
    addStaffNotification({
      type: 'ai_call_followup', toUsername: 'all', fromUsername: 'ai-agent', fromName: 'Saika AI',
      phone: existing.customer?.phone || session.customerPhone || '', customerName: existing.customer?.name || session.customerName,
      orderId: oid, message: `অর্ডার #${oid}-এর ঠিকানা পরিবর্তনের অনুরোধ এসেছে। AI প্রস্তাবিত ঠিকানা: ${newAddr}`
    });
    actions.push({ tool: 'update_order_address', orderId: oid, reviewRequired: true });
    return { result: { ok: false, reviewRequired: true, orderId: oid, message: 'The proposed address was sent to staff for verification. Do not say that the order address has already changed.' }, actions };
  }
  if (name === 'update_order_status') {
    const oid = String(args?.orderId || session.orderId || '').trim();
    const st = ['confirmed', 'hold', 'cancelled'].includes(args?.status) ? args.status : '';
    if (!oid || !st) return { result: { ok: false, error: 'Invalid orderId or status' }, actions };
    if (session?.mode !== 'outbound_confirm' || !session?.targetOrder || oid !== String(session.targetOrder.id)) {
      return { result: { ok: false, error: 'Order status changes are only allowed for this call’s linked order.' }, actions };
    }
    const existing = getOrders().find((o) => String(o.id) === oid);
    if (!existing) return { result: { ok: false, error: 'Order not found' }, actions };
    if (existing.status !== 'pending') return { result: { ok: false, error: `Order is ${existing.status}; status was not changed.` }, actions };
    const latestCustomerText = [...(session.history || [])].reverse().find((turn) => turn.role === 'user')?.text || '';
    const cleanCustomerText = normalizeAiMatch(latestCustomerText);
    const hasNegative = /\b(?:no|not|never|dont|don['’]?t|doesn['’]?t)\b|do\s+not|(?:^|\s)(?:না|নয়|নয়)(?:$|\s)|করবেন?\s+না|চাই\s+না|বাতিল\s+করবেন\s+না|cancel\s+করবেন\s+না/i.test(cleanCustomerText);
    const explicitMatch = st === 'confirmed'
      ? /(?:হ্যাঁ|জি|জ্বি|ঠিক আছে).{0,20}(?:কনফার্ম|নিশ্চিত|পাঠান|অর্ডার)|আমি.{0,15}অর্ডার(?:টা|টি)?\s*(?:কনফার্ম|নিশ্চিত)\s*(?:করছি|করলাম)?|অর্ডার(?:টা|টি)?\s*(?:কনফার্ম করুন|নিশ্চিত করুন)|\byes.{0,15}(?:confirm|ship|place)\b|\bi\s+confirm\s+(?:the\s+)?order\b|\bplease\s+(?:confirm|ship)\s+(?:my\s+)?order\b/i.test(cleanCustomerText)
      : st === 'cancelled'
      ? /অর্ডার(?:টা|টি)?\s*বাতিল\s*(?:করুন|করতে চাই|করুন দয়া করে)|বাতিল\s*করুন|\b(?:please\s+)?cancel\s+(?:my\s+)?order\b|\bi\s+want\s+to\s+cancel\b/i.test(cleanCustomerText)
      : /অর্ডার.{0,20}পরে|পরে.{0,20}অর্ডার|hold.{0,20}order|order.{0,20}hold/i.test(cleanCustomerText);
    if (!explicitMatch || hasNegative) {
      return { result: { ok: false, error: 'The customer’s latest spoken response does not clearly authorize this status change.' }, actions };
    }
    if (st === 'confirmed') {
      const catalogProducts = Array.isArray(getCatalog()?.products) ? getCatalog().products : [];
      for (const item of existing.items || []) {
        const itemName = normalizeAiMatch(item.name);
        const product = catalogProducts.find((p) => String(p.id) === String(item.id)) ||
          catalogProducts.find((p) => normalizeAiMatch(p.name) === itemName || itemName.startsWith(normalizeAiMatch(p.name) + ' '));
        if (!product) return { result: { ok: false, error: 'Order item could not be matched to the live catalog. Staff must verify it before confirmation.' }, actions };
        const variation = (product.variations || []).find((v) => {
          const variationName = normalizeAiMatch(v.name || v.label || v.title || v.size);
          return variationName && itemName.endsWith(variationName);
        });
        if (Array.isArray(product.variations) && product.variations.length && !variation) {
          return { result: { ok: false, error: 'Order variation could not be matched to the live catalog. Staff must verify before confirmation.' }, actions };
        }
        const stock = knownStockCount(variation?.stock ?? product.stock);
        if (product.soldOut === true || variation?.soldOut === true || stock === 0 || (stock !== null && stock < Number(item.qty || 1))) {
          return { result: { ok: false, error: 'Current stock is insufficient. The order status remains pending for staff review.' }, actions };
        }
      }
    }
    const history = Array.isArray(existing.history) ? [...existing.history] : [];
    history.push({ at: new Date().toISOString(), by: 'AI Voice Agent', action: `Status -> ${st}${args?.note ? ` (${args.note})` : ''}` });
    updateOrder(oid, { status: st, history });
    session.finalOutcome = st;
    actions.push({ tool: 'update_order_status', orderId: oid, status: st });
    return { result: { ok: true, orderId: oid, status: st }, actions };
  }
  if (name === 'create_new_order') {
    if (!['website_inbound', 'marketing'].includes(session?.mode)) {
      return { result: { ok: false, error: 'Order creation is disabled in this call mode.' }, actions };
    }
    if (session.aiCreatedOrderId) {
      const prior = getOrders().find((o) => String(o.id) === String(session.aiCreatedOrderId));
      if (prior) return { result: { ok: true, status: 'pending', orderId: prior.id, duplicatePrevented: true, message: 'This call already created a pending order. Do not create another order.' }, actions };
    }
    const cName = String(args?.customerName || session.customerName || 'Voice Customer').trim();
    const cPhone = cleanBDPhone(args?.customerPhone || session.customerPhone || '');
    const cAddr = String(args?.address || '').trim();
    const rawItems = Array.isArray(args?.items) && args.items.length > 0
      ? args.items
      : (args?.productName ? [{ productName: args.productName, variationName: args.variationName, quantity: args.quantity }] : []);
    if (cName.length < 2 || !/^01[3-9]\d{8}$/.test(cPhone) || cAddr.length < 8 || rawItems.length === 0 || rawItems.length > 5) {
      return { result: { ok: false, error: 'Need a valid Bangladesh mobile number, full name, full address, and 1–5 clearly identified products.' }, actions };
    }
    const latestCustomerText = [...(session.history || [])].reverse().find((turn) => turn.role === 'user')?.text || '';
    const customerTranscript = (session.history || []).filter((turn) => turn.role === 'user').map((turn) => turn.text).join(' ');
    const normalizedCustomerTranscript = normalizeAiMatch(customerTranscript);
    const priorAssistantText = [...(session.history || [])].reverse().find((turn) => turn.role === 'model' || turn.role === 'assistant')?.text || '';
    const explicitContextualYes = /^(?:হ্যাঁ|জি|জ্বি|ঠিক আছে|yes|okay|ok)[.!\s।]*$/i.test(latestCustomerText.trim()) && /অর্ডার করতে চান|অর্ডার.*নিশ্চিত/i.test(priorAssistantText);
    const explicitOrderIntent = explicitContextualYes || /অর্ডার\s*(?:করতে|দিতে|করব|করবো|দিচ্ছি|নিশ্চিত|দেন|দিন)|(?:কিনতে|নিতে)\s*চাই|(?:নেব|নিব)(?:ো)?|কিনব|(?:এটা|এটি|এইটা|এই পণ্য)\s*(?:নেব|নিব|কিনব)(?:ো)?|buy\s+now|place\s+(?:an?\s+)?order|i\s+want\s+to\s+(?:buy|order)|i(?:'ll| will)\s+take\s+it/i.test(customerTranscript);
    const deniesOrderIntent = /অর্ডার\s*(?:করব\s*না|করবো\s*না|দেব\s*না|দিতে\s*চাই\s*না)|কিনব\s*না|(?:নেব|নিব)(?:ো)?\s*না|do\s+not\s+(?:order|buy)|don['’]?t\s+(?:order|buy)|not\s+ordering/i.test(customerTranscript);
    if (!explicitOrderIntent || deniesOrderIntent) {
      return { result: { ok: false, error: 'The customer has not clearly requested an order. Ask whether they want to place this order, and create it only after a clear yes.' }, actions };
    }
    if (!normalizedCustomerTranscript.includes(normalizeAiMatch(cName)) || !normalizedCustomerTranscript.includes(normalizeAiMatch(cAddr))) {
      return { result: { ok: false, error: 'The name or full address is not clearly present in the customer transcript. Ask the customer to repeat and confirm these details.' }, actions };
    }
    const transcriptDigits = cleanBDPhone(customerTranscript);
    if (!transcriptDigits.includes(cPhone)) {
      return { result: { ok: false, error: 'The customer’s mobile number was not clearly present in their own transcript. Ask them to repeat it; do not place the order yet.' }, actions };
    }
    const saysInsideDhaka = /ঢাকার (?:ভিতরে|ভেতরে|মধ্যে)|inside dhaka|within dhaka/i.test(latestCustomerText);
    const saysOutsideDhaka = /ঢাকার বাইরে|outside dhaka|outside of dhaka/i.test(latestCustomerText);
    if (!['inside', 'outside'].includes(args?.area) || saysInsideDhaka === saysOutsideDhaka || (args.area === 'inside') !== saysInsideDhaka) {
      return { result: { ok: false, error: 'Ask the customer to explicitly confirm whether delivery is inside Dhaka or outside Dhaka. Do not infer the area from the address.' }, actions };
    }
    const area = args.area;

    const orderItems = [];
    let itemsTotal = 0;
    let maxDelivery = 0;
    let hasUnknownStock = false;
    let orderSource = 'ai_voice_call';
    const ls = session?.landing ? getLandingProductSummary(session.landing) : null;
    if (ls) orderSource = `landing:${ls.slug}`;
    const products = ls ? [] : getAiProductCatalogSummary();

    for (const ri of rawItems) {
      const pName = String(ri?.productName || '').trim();
      const vName = String(ri?.variationName || '').trim();
      const qty = Number(ri?.quantity);
      if (!pName || !Number.isInteger(qty) || qty < 1 || qty > 20) {
        return { result: { ok: false, error: 'Each item needs an exact product name and a whole quantity from 1 to 20.' }, actions };
      }

      let itemId = 'voice-item';
      let itemName = pName;
      let unitPrice = 0;
      let itemDel = 0;
      let selectedStock = null;

      if (ls) {
        const packageQuery = normalizeAiMatch(vName || pName);
        const exactPackages = ls.packages.filter((pk) => normalizeAiMatch(pk.id) === packageQuery || normalizeAiMatch(pk.name) === packageQuery);
        const productNames = [ls.title, session.landing?.productTitle, session.landing?.title, session.landing?.slug].map(normalizeAiMatch).filter(Boolean);
        const pkg = exactPackages.length === 1
          ? exactPackages[0]
          : (!vName && ls.packages.length === 1 && productNames.includes(normalizeAiMatch(pName)) ? ls.packages[0] : null);
        if (!pkg) return { result: { ok: false, error: 'Could not uniquely match the requested package. Ask which exact package the customer wants.' }, actions };
        if (!normalizedCustomerTranscript.includes(normalizeAiMatch(pkg.name)) && !normalizedCustomerTranscript.includes(normalizeAiMatch(ls.title))) {
          return { result: { ok: false, error: 'The selected product/package name was not clearly present in the customer transcript. Ask them to repeat the exact option.' }, actions };
        }
        if (pkg.priceVerified !== true) return { result: { ok: false, error: 'This landing page price is inferred from page markup, not a verified package setting. Do not create an order; ask staff to confirm the current offer.' }, actions };
        if (pkg.deliveryVerified !== true) return { result: { ok: false, error: 'This landing page delivery charge is not explicitly configured. Do not create an order; ask staff to verify delivery charges.' }, actions };
        itemId = pkg.id || itemId;
        itemName = pkg.name;
        unitPrice = Number(pkg.price);
        itemDel = area === 'inside' ? Number(pkg.deliveryInside) : Number(pkg.deliveryOutside);
      } else {
        const productQuery = normalizeAiMatch(pName);
        const exactProducts = products.filter((p) => [p.id, p.slug, p.name].some((v) => normalizeAiMatch(v) === productQuery));
        if (exactProducts.length !== 1) return { result: { ok: false, error: 'Product was not an exact unique catalog match. Ask the customer to choose the exact product name.' }, actions };
        const matched = exactProducts[0];
        if (![matched.name, matched.id, matched.slug].some((value) => normalizeAiMatch(value) && normalizedCustomerTranscript.includes(normalizeAiMatch(value)))) {
          return { result: { ok: false, error: 'The selected product name was not clearly present in the customer transcript. Ask them to repeat the exact product name.' }, actions };
        }
        itemId = matched.id || itemId;
        itemName = matched.name || pName;
        unitPrice = Number(matched.price);
        selectedStock = matched.stock;
        if (Array.isArray(matched.variations) && matched.variations.length) {
          const variationQuery = normalizeAiMatch(vName);
          const exactVariations = variationQuery ? matched.variations.filter((v) => normalizeAiMatch(v.id) === variationQuery || normalizeAiMatch(v.name) === variationQuery) : [];
          if (exactVariations.length !== 1) return { result: { ok: false, error: 'An exact product variation is required. Ask the customer to choose the exact variation.' }, actions };
          const variation = exactVariations[0];
          if (!normalizedCustomerTranscript.includes(normalizeAiMatch(variation.name))) {
            return { result: { ok: false, error: 'The selected variation was not clearly present in the customer transcript. Ask the customer to repeat the exact variation.' }, actions };
          }
          unitPrice = Number(variation.price);
          selectedStock = variation.stock;
          itemName = `${matched.name} (${variation.name})`;
        }
        const rawItemDelivery = area === 'inside' ? matched.deliveryInside : matched.deliveryOutside;
        itemDel = rawItemDelivery == null || rawItemDelivery === '' ? NaN : Number(rawItemDelivery);
      }
      const stockCount = knownStockCount(selectedStock);
      if (!Number.isFinite(unitPrice) || unitPrice <= 0 || !Number.isFinite(itemDel) || itemDel < 0) {
        return { result: { ok: false, error: 'The catalog price or delivery fee is missing or invalid. Do not quote or create the order.' }, actions };
      }
      if (stockCount === 0 || (stockCount !== null && stockCount < qty)) {
        return { result: { ok: false, error: 'The selected item is sold out or has insufficient stock.' }, actions };
      }
      if (stockCount === null) hasUnknownStock = true;
      const sub = unitPrice * qty;
      itemsTotal += sub;
      if (itemDel > maxDelivery) maxDelivery = itemDel;
      orderItems.push({ id: itemId, name: itemName, price: unitPrice, qty, subtotal: sub, image: '' });
    }

    const delivery = maxDelivery;
    const total = itemsTotal + delivery;
    const nowIso = new Date().toISOString();
    if (orderItems.length !== rawItems.length) return { result: { ok: false, error: 'One or more items could not be validated; no order was created.' }, actions };
    // A web voice call does not prove control of the phone number spoken in the call.
    // Until an OTP verification flow is connected, capture a staff follow-up only;
    // never create an order from an unverified voice caller.
    if (session.customerPhoneVerified !== true) {
      if (!session.voiceOrderReviewNotified) {
        addStaffNotification({
          type: 'ai_call_followup', toUsername: 'all', fromUsername: 'ai-agent', fromName: 'Saika AI',
          phone: cPhone, customerName: cName,
          message: `ভয়েস কলে অর্ডারের অনুরোধ এসেছে (${orderItems.map((item) => `${item.name} x${item.qty}`).join(', ')}; মোট ৳${total})। ফোন নম্বর OTP দিয়ে যাচাই করা হয়নি—অর্ডার তৈরি করা হয়নি। কল ব্যাক করে নম্বর/অর্ডার যাচাই করুন।`
        });
        session.voiceOrderReviewNotified = true;
      }
      actions.push({ tool: 'create_new_order', orderCreated: false, verificationRequired: true, followupQueued: true });
      return { result: { ok: false, orderCreated: false, verificationRequired: true, followupQueued: true, message: 'No order was created. A staff member must verify the caller’s phone number and order request before creating it.' }, actions };
    }
    const orderId = 'DOT-' + randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
    const created = addOrder({
      id: orderId,
      createdAt: nowIso,
      status: 'pending',
      payment: 'cash_on_delivery',
      source: orderSource,
      customer: {
        name: cName,
        phone: cPhone,
        phone2: '',
        address: cAddr,
        area,
        district: '',
        thana: '',
        note: String(args?.note || '')
      },
      adminNote: String(args?.note || 'Created via Saika AI Voice Call'),
      items: orderItems,
      itemsTotal,
      delivery,
      discount: 0,
      total,
      courier: {
        name: '',
        consignment: '',
        phone: '',
        url: '',
        accountId: '',
        liveStatus: '',
        riderNote: '',
        attempt: 0,
        courierUpdatedAt: '',
        lastSync: ''
      },
      history: [{ status: 'pending', at: nowIso, note: `Order created via Saika AI Voice Call (${orderItems.length} item(s))` }]
    });
    if (!created?.id) return { result: { ok: false, error: 'Order save failed; do not tell the customer an order was created.' }, actions };
    session.orderId = created?.id || session.orderId;
    session.aiCreatedOrderId = created.id;
    session.finalOutcome = 'completed';
    actions.push({ tool: 'create_new_order', orderId: created?.id, itemCount: orderItems.length, delivery, total });
    return { result: { ok: true, status: 'pending', stockVerificationRequired: hasUnknownStock, orderId: created?.id, items: orderItems, itemsTotal, delivery, total, area, message: 'Order request was created as pending; do not call it confirmed. Tell the customer the team must verify the details and stock.' }, actions };
  }
  if (name === 'check_order_status') {
    const query = String(args?.phoneOrOrderId || session.orderId || '').trim();
    const orders = getOrders();
    // Public website callers must provide the exact order ID; phone-number lookup exposes other customers' orders.
    const found = /^DOT-[A-Z0-9]{6,12}$/i.test(query)
      ? orders.find((o) => String(o.id).toLowerCase() === query.toLowerCase())
      : null;
    actions.push({ tool: 'check_order_status', found: !!found });
    if (!found) return { result: { found: false }, actions };
    return {
      result: {
        found: true,
        orderId: found.id,
        status: found.status,
        items: (found.items || []).map((i) => `${i.name} x${i.qty || 1}`)
      },
      actions
    };
  }
  if (name === 'save_customer_lead') {
    if (!['website_inbound', 'marketing'].includes(session?.mode)) return { result: { ok: false, error: 'Lead saving is disabled in this call mode.' }, actions };
    const rawName = String(args?.customerName || '').trim();
    const lPhone = cleanBDPhone(args?.customerPhone || '');
    const rawAddr = String(args?.address || '').trim();
    const rawOrder = String(args?.orderId || '').trim();
    const rawProduct = String(args?.interestedProduct || '').trim();
    const callerText = (session.history || []).filter((turn) => turn.role === 'user').map((turn) => turn.text).join(' ');
    const normalizedCallerText = normalizeAiMatch(callerText);
    if (!/^01[3-9]\d{8}$/.test(lPhone) || !cleanBDPhone(callerText).includes(lPhone)) {
      return { result: { ok: false, error: 'The phone number is not clearly present in the customer transcript. Ask them to repeat the number; do not save the lead yet.' }, actions };
    }
    const lName = rawName && normalizedCallerText.includes(normalizeAiMatch(rawName)) ? rawName : '';
    if (!lName) return { result: { ok: false, error: 'The customer name was not clearly present in their transcript. Ask them to repeat their name; do not save the lead yet.' }, actions };
    const lAddr = rawAddr && normalizedCallerText.includes(normalizeAiMatch(rawAddr)) ? rawAddr : '';
    const lOrder = rawOrder && normalizedCallerText.includes(normalizeAiMatch(rawOrder)) && getOrders().some((o) => String(o.id).toLowerCase() === rawOrder.toLowerCase()) ? rawOrder : '';
    const lProd = rawProduct && normalizedCallerText.includes(normalizeAiMatch(rawProduct)) ? rawProduct : '';
    const lNotes = String(args?.notes || '').trim();
    if (lName) session.customerName = lName;
    if (lPhone) session.customerPhone = lPhone;
    if (lAddr) session.customerAddress = lAddr;
    if (lOrder) session.orderId = lOrder;
    if (lProd) session.interestedProduct = lProd;
    if (lNotes) session.leadNotes = lNotes;
    if (lPhone || lName) {
      saveAiDeviceMemory(session?.deviceId, session?.fingerprint, {
        name: lName || session?.customerName,
        phone: lPhone || session?.customerPhone,
        address: lAddr || session?.customerAddress,
        lastProduct: lProd || session?.interestedProduct || session?.landing?.productTitle,
        lastOrderId: lOrder || session?.orderId
      });
    }
    if (lPhone) {
      try {
        saveCustomer({
          id: `cust_${lPhone}`,
          name: lName || session.customerName || 'Customer',
          phone: lPhone,
          address: lAddr || session.customerAddress || '',
          lastOrderId: lOrder || session.orderId || null,
          interestedProduct: lProd || session.interestedProduct || session.landing?.productTitle || '',
          source: 'saika_ai_call',
          tags: ['ai_call_lead', session.landingSlug ? `landing:${session.landingSlug}` : 'storefront'],
          notes: lNotes || `Saika AI Call (${session.mode})`
        });
      } catch (_) {}
    }
    actions.push({ tool: 'save_customer_lead', customerName: lName, customerPhone: lPhone, address: lAddr, orderId: lOrder });
    return { result: { ok: true, saved: true, customerName: session.customerName, customerPhone: session.customerPhone }, actions };
  }
  if (name === 'end_call') {
    session.endCallRequested = true;
    actions.push({ tool: 'end_call', reason: String(args?.reason || 'Customer ended call') });
    return { result: { ok: true, endingCall: true }, actions };
  }
  return { result: { error: 'Unknown tool' }, actions };
}

function getAiFraudFilePath() {
  return join(getPersistentDataDirectory(), 'ai_fraud_strikes.json');
}

function readAiFraudStore() {
  try {
    const fp = getAiFraudFilePath();
    if (existsSync(fp)) return JSON.parse(readFileSync(fp, 'utf8'));
  } catch (_) {}
  return { records: {} };
}

function saveAiFraudStore(store) {
  try {
    writeFileSync(getAiFraudFilePath(), JSON.stringify(store, null, 2));
  } catch (_) {}
}

function getCallerFraudKeys(ip, deviceId, phone, fingerprint) {
  const keys = [];
  const cleanIp = String(ip || '').trim();
  const cleanDev = String(deviceId || '').trim();
  const cleanPh = cleanBDPhone(phone || '');
  const cleanFp = String(fingerprint || '').trim();
  if (cleanIp && cleanIp !== 'unknown') keys.push(`ip:${cleanIp}`);
  if (cleanDev) keys.push(`dev:${cleanDev}`);
  if (cleanPh) keys.push(`ph:${cleanPh}`);
  if (cleanFp) keys.push(`fp:${cleanFp}`);
  return keys;
}

function isAiCallerBlocked(ip, deviceId, phone, fingerprint) {
  const store = readAiFraudStore();
  const keys = getCallerFraudKeys(ip, deviceId, phone, fingerprint);
  for (const k of keys) {
    const rec = store.records?.[k];
    if (rec?.adminApproved === true && rec.blocked === true) {
      return { blocked: true, key: k, strikes: Number(rec.strikes || 3), reason: rec.lastReason || 'Repeated fake order attempts' };
    }
  }
  return { blocked: false, strikes: 0 };
}

function recordAiFakeStrike(ip, deviceId, phone, reason, fingerprint) {
  const store = readAiFraudStore();
  if (!store.records) store.records = {};
  const keys = getCallerFraudKeys(ip, deviceId, phone, fingerprint);
  let maxStrike = 0;
  for (const k of keys) {
    const prev = store.records[k] || { strikes: 0, blocked: false, reasons: [] };
    maxStrike = Math.max(maxStrike, Number(prev.strikes || 0));
  }
  const nextStrike = maxStrike + 1;
  const blocked = nextStrike >= 3;
  const now = new Date().toISOString();
  for (const k of keys) {
    const prev = store.records[k] || { strikes: 0, blocked: false, reasons: [] };
    store.records[k] = {
      strikes: nextStrike,
      blocked,
      lastReason: String(reason || 'Fake order attempt'),
      updatedAt: now,
      reasons: [...(Array.isArray(prev.reasons) ? prev.reasons.slice(-4) : []), { at: now, reason: String(reason || '') }]
    };
  }
  saveAiFraudStore(store);
  return { strikes: nextStrike, blocked };
}

function buildAiTransferSummaryNote(session, reason) {
  const prods = [];
  if (session?.landing?.productTitle || session?.landing?.title) {
    prods.push(session.landing.productTitle || session.landing.title);
  }
  for (const a of session?.actionsExecuted || []) {
    if (a.tool === 'get_product_details' && a.query) prods.push(a.query);
    if (a.tool === 'create_new_order' && a.orderId) prods.push(`Order #${String(a.orderId).replace('DOT-', '')}`);
  }
  const recentMsgs = (session?.history || []).slice(-4).map((h) => `${h.role === 'user' ? 'কাস্টমার' : 'সাইকা'}: ${String(h.text || '').slice(0, 70)}`).join(' | ');
  const topicTxt = prods.length ? `প্রোডাক্ট/টপিক: ${[...new Set(prods)].join(', ')}` : `কারণ: ${reason || 'সাহায্য প্রয়োজন'}`;
  return recentMsgs ? `${topicTxt} — ${recentMsgs}` : topicTxt;
}

async function executeAiCallToolAsync(name, args, session) {
  const actions = [];

  if (name === 'send_whatsapp_message') {
    const rawPh = String(args?.phone || session?.customerPhone || '').trim();
    const settings = getSettings() || {};
    const cleanPh = rawPh ? String(rawPh).replace(/\D/g, '') : '';
    let targetPhone = cleanPh;
    if (targetPhone.startsWith('01')) targetPhone = '88' + targetPhone;
    if (!targetPhone) targetPhone = String(settings.whatsapp || settings.phone || '8801878374762').replace(/\D/g, '');
    const text = String(args?.message || '').trim();
    if (!text) return { result: { ok: false, error: 'Message text required' }, actions: [] };
    try {
      await sendBaileysMessage(targetPhone, text, null, 'saika_voice_dispatch');
      return {
        result: { ok: true, sentTo: targetPhone, note: `WhatsApp message successfully delivered to ${targetPhone}` },
        actions: [{ tool: 'send_whatsapp_message', phone: targetPhone, message: text }]
      };
    } catch (e) {
      return { result: { ok: false, error: e?.message || 'WhatsApp sending failed' }, actions: [] };
    }
  }

  if (name === 'send_email_report') {
    const settings = getSettings() || {};
    const targetEmail = String(args?.toEmail || args?.recipient || settings.email || 'admin@secrate.shop').trim();
    const fromEmail = String(args?.fromEmail || args?.sender || '').trim();
    const fromName = String(args?.fromName || settings.storeName || 'Saika AI').trim();
    const subject = String(args?.subject || 'সাইকার এক্সিকিউটিভ রিপোর্ট - ' + (settings.storeName || 'Secrate')).trim();
    const body = String(args?.message || args?.htmlContent || '').trim();
    try {
      const htmlContent = `<div style="font-family: Arial, sans-serif; padding: 20px; line-height: 1.6; color: #1e293b; background: #f8fafc; border-radius: 8px;">
        <h2 style="color: #7c3aed; margin-top: 0;">সাইকা AI পার্সোনাল রিপোর্ট</h2>
        <div style="background: #ffffff; padding: 16px; border-radius: 6px; border: 1px solid #e2e8f0;">
          ${body.replace(/\n/g, '<br/>')}
        </div>
        <p style="font-size: 12px; color: #64748b; margin-top: 14px;">বসের লাইভ ভয়েস নির্দেশে সাইকা কর্তৃক স্বয়ংক্রিয়ভাবে প্রেরিত।</p>
      </div>`;
      const sendResult = await sendEmail(targetEmail, subject, htmlContent, { fromEmail: fromEmail || undefined, fromName });
      
      const effectiveSender = fromEmail && fromEmail.includes('@') ? fromEmail : (settings.email || 'support@secrate.shop');
      const savedEntry = saveEmailEntry({
        folder: 'sent',
        from: `"${fromName}" <${effectiveSender}>`,
        fromName: fromName,
        fromEmail: effectiveSender,
        to: targetEmail,
        toName: targetEmail.split('@')[0],
        toEmail: targetEmail,
        subject: subject,
        bodyHtml: htmlContent,
        bodyText: body,
        attachments: [],
        threadId: 'th_' + Date.now().toString(36),
        replyToId: null,
        isRead: true,
        via: sendResult?.via || 'saika_ai',
        deliveryStatus: sendResult?.ok ? 'delivered' : 'failed',
        deliveryError: sendResult?.ok ? null : sendResult?.error,
      });

      return {
        result: {
          ok: true,
          sentTo: targetEmail,
          sentFrom: effectiveSender,
          emailId: savedEntry?.id,
          note: `Email successfully delivered to ${targetEmail} and saved in Sent mail`
        },
        actions: [{ tool: 'send_email_report', email: targetEmail, fromEmail: effectiveSender, subject, emailId: savedEntry?.id }]
      };
    } catch (e) {
      return { result: { ok: false, error: e?.message || 'Email sending failed' }, actions: [] };
    }
  }

  if (name === 'search_database_orders') {
    const q = String(args?.query || '').trim().toLowerCase();
    const statusFilter = String(args?.status || 'all').trim().toLowerCase();
    const limit = Math.min(30, Math.max(1, Number(args?.limit) || 10));
    const allOrders = getOrders() || [];
    const filtered = allOrders.filter((o) => {
      if (statusFilter !== 'all' && String(o.status || '').toLowerCase() !== statusFilter) return false;
      if (!q) return true;
      const custName = String(o.customer?.name || '').toLowerCase();
      const custPhone = String(o.customer?.phone || '');
      const idStr = String(o.id || '').toLowerCase();
      const itemNames = (o.items || []).map((i) => String(i.name || '').toLowerCase()).join(' ');
      return custName.includes(q) || custPhone.includes(q) || idStr.includes(q) || itemNames.includes(q);
    });
    const list = filtered.slice(0, limit).map((o) => ({
      id: o.id,
      customer: o.customer?.name || 'Unknown',
      phone: o.customer?.phone || '',
      address: o.customer?.address || '',
      total: o.total,
      status: o.status,
      items: (o.items || []).map((i) => `${i.name} x${i.qty || 1}`).join(', '),
      createdAt: o.createdAt,
      courierConsignment: o.courier?.consignment || null,
      courierStatus: o.courier?.liveStatus || o.courier?.status || null
    }));
    return {
      result: { ok: true, totalMatched: filtered.length, orders: list },
      actions: [{ tool: 'search_database_orders', query: q, matched: filtered.length }]
    };
  }

  if (name === 'update_database_order') {
    const rawId = String(args?.orderId || '').trim();
    const status = String(args?.status || '').trim().toLowerCase();
    const newAddress = String(args?.address || '').trim();
    const note = String(args?.note || '').trim();
    const allOrders = getOrders() || [];
    const target = allOrders.find((o) => o.id === rawId || o.id === 'DOT-' + rawId || 'DOT-' + o.id === rawId);
    if (!target) return { result: { ok: false, error: `Order ID ${rawId} পাওয়া যায়নি` }, actions: [] };
    const patch = {};
    if (status && ['pending', 'confirmed', 'hold', 'processing', 'shipped', 'delivered', 'cancelled'].includes(status)) {
      patch.status = status;
    }
    if (newAddress) {
      patch.customer = { ...(target.customer || {}), address: newAddress };
    }
    if (note) {
      patch.internalNotes = [...(target.internalNotes || []), { text: `[সাইকা ভয়েস]: ${note}`, date: new Date().toISOString() }];
    }
    const updated = updateOrder(target.id, patch);
    return {
      result: { ok: true, orderId: target.id, updatedStatus: updated?.status || target.status, address: updated?.customer?.address },
      actions: [{ tool: 'update_database_order', orderId: target.id, status: updated?.status }]
    };
  }

  if (name === 'get_database_product_stock') {
    const q = String(args?.query || '').trim().toLowerCase();
    const lowOnly = !!args?.lowStockOnly;
    const catalog = getCatalog()?.products || [];
    const filtered = catalog.filter((p) => {
      if (p.archived || p.status === 'draft') return false;
      const stock = Number(p.stock) || 0;
      if (lowOnly && stock > 5) return false;
      if (!q) return true;
      return String(p.name || '').toLowerCase().includes(q) || String(p.sku || '').toLowerCase().includes(q);
    });
    const list = filtered.slice(0, 15).map((p) => ({
      id: p.id,
      name: p.name,
      price: p.price,
      stock: Number(p.stock) || 0,
      isOutOfStock: (Number(p.stock) || 0) <= 0,
      isLowStock: (Number(p.stock) || 0) > 0 && (Number(p.stock) || 0) <= 5
    }));
    return {
      result: { ok: true, count: filtered.length, products: list },
      actions: [{ tool: 'get_database_product_stock', count: filtered.length }]
    };
  }

  if (name === 'manage_product_stock') {
    const q = String(args?.productNameOrId || '').trim().toLowerCase();
    const newStock = args?.stock !== undefined ? Number(args?.stock) : null;
    const newPrice = args?.price !== undefined ? Number(args?.price) : null;
    const cat = getCatalog();
    const prods = cat.products || [];
    const target = prods.find((p) => String(p.id) === q || String(p.name || '').toLowerCase().includes(q));
    if (!target) return { result: { ok: false, error: `Product "${q}" পাওয়া যায়নি` }, actions: [] };
    if (newStock !== null && !isNaN(newStock)) target.stock = Math.max(0, newStock);
    if (newPrice !== null && !isNaN(newPrice)) target.price = Math.max(0, newPrice);
    saveCatalog(cat);
    return {
      result: { ok: true, productId: target.id, name: target.name, currentStock: target.stock, currentPrice: target.price },
      actions: [{ tool: 'manage_product_stock', name: target.name, stock: target.stock, price: target.price }]
    };
  }

  if (name === 'create_new_product') {
    const name = String(args?.name || '').trim();
    const price = Number(args?.price) || 990;
    const stock = Number(args?.stock) || 50;
    const category = String(args?.category || 'general').trim();
    const description = String(args?.description || '').trim();
    if (!name) return { result: { ok: false, error: 'Product name required' }, actions: [] };
    const cat = getCatalog();
    const newProd = {
      id: 'prod_' + Date.now().toString(36),
      name,
      price,
      stock,
      category,
      description,
      images: [],
      status: 'active',
      createdAt: new Date().toISOString()
    };
    cat.products = [newProd, ...(cat.products || [])];
    saveCatalog(cat);
    return {
      result: { ok: true, productId: newProd.id, name: newProd.name, price: newProd.price, stock: newProd.stock },
      actions: [{ tool: 'create_new_product', productId: newProd.id, name: newProd.name }]
    };
  }

  if (name === 'search_database_customers') {
    const q = String(args?.query || '').trim().toLowerCase();
    const customers = getCustomers() || [];
    const orders = getOrders() || [];
    const filtered = customers.filter((c) => {
      if (!q) return true;
      return String(c.name || '').toLowerCase().includes(q) || String(c.phone || '').includes(q) || String(c.email || '').toLowerCase().includes(q);
    });
    const list = filtered.slice(0, 10).map((c) => {
      const cleanPh = String(c.phone || '').replace(/\D/g, '').slice(-11);
      const custOrders = orders.filter((o) => String(o.customer?.phone || '').replace(/\D/g, '').slice(-11) === cleanPh);
      const totalSpent = custOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
      const delivered = custOrders.filter((o) => o.status === 'delivered').length;
      const cancelled = custOrders.filter((o) => o.status === 'cancelled').length;
      return {
        name: c.name || 'Unknown',
        phone: c.phone || '',
        email: c.email || '',
        totalOrders: custOrders.length,
        deliveredOrders: delivered,
        cancelledOrders: cancelled,
        totalSpentBDT: totalSpent,
        lastOrder: custOrders[0]?.createdAt || null
      };
    });
    return {
      result: { ok: true, matchedCount: filtered.length, customers: list },
      actions: [{ tool: 'search_database_customers', matched: filtered.length }]
    };
  }

  if (name === 'direct_staff') {
    const directive = String(args?.directive || '').trim();
    const res = executeAutoStaffDirection(directive, 'সাইকা (বসের লাইভ ভয়েস নির্দেশ)');
    return {
      result: { ok: true, message: res.message },
      actions: [{ tool: 'direct_staff', detail: res.message }]
    };
  }

  if (name === 'get_live_store_metrics') {
    const b = buildAiCopilotBriefing();
    return {
      result: {
        todayOrders: b.summary.todayOrdersCount,
        todayRevenue: b.summary.todayRevenue,
        pendingOrders: b.summary.pendingCount,
        delayedPending: b.summary.delayedPendingCount,
        stockoutCount: b.stock.outOfStockCount,
        lowStockCount: b.stock.lowStockCount,
        staffOnline: b.staff.onlineCount
      },
      actions: [{ tool: 'get_live_store_metrics' }]
    };
  }

  if (name === 'get_landing_page_details') {
    const q = String(args?.queryOrSlug || '').trim().toLowerCase();
    const landings = getLandings() || [];
    let matched = landings;
    if (q) {
      matched = landings.filter((l) => {
        const slug = String(l.slug || '').toLowerCase();
        const title = String(l.title || '').toLowerCase();
        const pTitle = String(l.productTitle || '').toLowerCase();
        const aliases = Array.isArray(l.aliases) ? l.aliases.join(' ').toLowerCase() : '';
        return slug.includes(q) || title.includes(q) || pTitle.includes(q) || aliases.includes(q);
      });
    }
    if (!matched.length) {
      return {
        result: {
          ok: false,
          message: `"${q}" দিয়ে কোনো নির্দিষ্ট ল্যান্ডিং পেজ পাওয়া যায়নি। তবে স্টোরের সমস্ত ল্যান্ডিং পেজের তথ্য সাইকার ডিরেক্টরিতে প্রস্তুত আছে।`
        },
        actions: []
      };
    }
    const details = matched.map((l) => ({
      slug: l.slug,
      title: l.title || l.productTitle,
      headline: l.headline || l.subtitle,
      packages: (l.packages || []).map((p) => ({
        name: p.title || p.name,
        price: p.price,
        originalPrice: p.originalPrice
      })),
      freeDelivery: l.freeDelivery || false,
      deliveryInside: l.deliveryInside,
      deliveryOutside: l.deliveryOutside,
      guarantee: l.badgeGuarantee || l.guaranteeText,
      benefits: l.benefits || []
    }));
    return {
      result: {
        ok: true,
        count: details.length,
        landings: details
      },
      actions: [{ tool: 'get_landing_page_details', query: q, count: details.length }]
    };
  }

  if (name === 'check_courier_fraud') {
    const ph = String(args?.phone || session?.customerPhone || '').trim();
    if (!ph) return { result: { ok: false, error: 'Phone number required for courier fraud check' }, actions: [] };
    session.customerPhone = session.customerPhone && session.customerPhone !== 'Website Visitor' ? session.customerPhone : ph;
    const preBlocked = isAiCallerBlocked(session?.clientIp, session?.deviceId, ph, session?.fingerprint);
    try {
      const fc = await fraudCheck(ph);
      const summary = {
        ok: true,
        phone: ph,
        alreadyBlockedBySystem: preBlocked.blocked,
        totalOrders: fc?.total || 0,
        delivered: fc?.delivered || 0,
        cancelled: fc?.cancelled || 0,
        successRate: fc?.rate ?? null,
        riskLevel: fc?.riskLevel || fc?.verdict || 'normal',
        couriers: Array.isArray(fc?.couriers) ? fc.couriers.slice(0, 4) : []
      };
      return { result: summary, actions: [{ tool: 'check_courier_fraud', phone: ph, total: summary.totalOrders, cancelled: summary.cancelled }] };
    } catch (e) {
      return { result: { ok: false, phone: ph, error: e?.message || 'Fraud check unavailable' }, actions: [{ tool: 'check_courier_fraud', phone: ph }] };
    }
  }
  if (name === 'report_fake_order_attempt') {
    const ph = String(args?.phone || session?.customerPhone || '').trim();
    const reason = String(args?.reason || 'Fake or prank order attempt').trim();
    addStaffNotification({
      type: 'ai_call_fraud_review', toUsername: 'all', fromUsername: 'ai-agent', fromName: 'Saika AI',
      phone: ph, customerName: session?.customerName || 'Website Visitor', orderId: session?.orderId || '',
      message: `AI কল থেকে যাচাইয়ের অনুরোধ এসেছে। AI-এর কারণ: ${reason}`
    });
    return {
      result: { reviewRequired: true, blocked: false, instruction: 'Do not accuse or block the caller. Say you will ask a staff member to review the issue.' },
      actions: [{ tool: 'report_fake_order_attempt', reviewRequired: true, blocked: false }]
    };
  }
  if (name === 'request_human_transfer') {
    const reason = String(args?.reason || 'Customer requested human help center');
    const transferNote = buildAiTransferSummaryNote(session, reason);
    session.transferNote = transferNote;
    session.transferRequested = true;
    session.transferReason = reason;
    const availability = getHelpCenterAvailability();
    const targetAgent = availability.available[0] || availability.busy[0] || null;
    const transfer = saveCallTransfer({
      sessionId: session.sessionId,
      customerName: session.customerName || 'Website Visitor',
      customerPhone: session.customerPhone || '',
      customerAddress: session.customerAddress || session.targetOrder?.customer?.address || '',
      customerTier: session.customerTier || 'New',
      productName: session.interestedProduct || session.targetOrder?.items?.[0]?.name || session.landing?.productTitle || '',
      orderId: session.orderId || null,
      reason,
      note: transferNote,
      assignedTo: targetAgent?.username || '',
      assignedName: targetAgent?.name || '',
      assignedExt: targetAgent?.ext || '',
    });
    session.transferId = transfer.id;
    addStaffNotification({
      type: 'ai_call_followup', category: 'call_transfer', transferId: transfer.id,
      toUsername: 'all', fromUsername: 'ai-agent', fromName: 'Saika AI',
      phone: session.customerPhone || '', customerName: session.customerName || 'Website Visitor',
      orderId: session.orderId || '',
      message: 'AI call needs staff callback approval: ' + (session.customerName || 'Website Visitor') + ' — ' + reason,
    });
    actions.push({ tool: 'request_human_transfer', status: 'awaiting_agent_approval', transferId: transfer.id, agent: targetAgent?.name || '' });
    return {
      result: {
        ok: true,
        status: 'awaiting_agent_approval',
        transferId: transfer.id,
        assignedAgent: targetAgent?.name || null,
        noteShared: transferNote,
        message: 'A callback request has been saved for staff approval with the caller details and conversation summary. Do not claim a live call transfer; tell the caller a staff member will review the request and call back.'
      },
      actions
    };
  }
  return executeAiCallTool(name, args, session);
}





async function runAiVoiceBrain(session, userMessage) {
  const apiKey = getStoreGeminiApiKey();
  const tel = getTelephonySettings();
  const aiCfg = tel.aiCalling || {};
  const storeName = getSettings()?.storeName || 'Secrate';
  const avail = getHelpCenterAvailability();
  const helpCenterStatusText = avail.available.length > 0
    ? `Available online agents: ${avail.available.map((a) => `${a.name} (Ext ${a.ext})`).join(', ')}`
    : avail.busy.length > 0
    ? `All online agents are currently BUSY on another call (${avail.busy.map((a) => a.name).join(', ')})`
    : 'No live human agent is currently online';

  if (!apiKey) {
    return {
      reply: 'Gemini API Key সেট করা নেই। অনুগ্রহ করে Settings থেকে একটি বৈধ Gemini API Key যোগ করুন।',
      actionsExecuted: [],
      transferRequested: false,
      geminiError: 'Missing Gemini API Key'
    };
  }

  const orderCtx = session.targetOrder
    ? `Order ID: ${session.targetOrder.id}, Status: ${session.targetOrder.status}, Customer: ${session.targetOrder.customer?.name}, Phone: ${session.targetOrder.customer?.phone}, Address: ${session.targetOrder.customer?.address}, Total: ${session.targetOrder.total} BDT, Items: ${(session.targetOrder.items || []).map((i) => `${i.name} x${i.qty || 1}`).join(', ')}`
    : 'No active order linked yet.';

  const sysPrompt = `You are a warm, polite, natural-sounding automated Bangladeshi voice assistant calling on behalf of "${storeName}". Never claim to be a human.
Mode: ${session.mode} (outbound_confirm = confirm pending order & verify/correct address; marketing = promote products/offers & take new order; website_inbound = answer visitor questions, explain products, check order status, take new orders, or transfer to Help Center).
Help Center Live Status: ${helpCenterStatusText}
Customer Tier (Pre-call intelligence): ${session.customerTier} (Total Orders: ${session.totalOrders}, Cancelled/Returned: ${session.cancelledCount}).
Active Order Context: ${orderCtx}
Full Store Product Directory (ALL products & prices — call get_product_details(query) for full description/variations/delivery):
${getAiCompactProductDirectory()}
${aiCfg.aiPersonaPrompt ? `Owner Custom Instructions: ${aiCfg.aiPersonaPrompt}` : ''}

STRICT BEHAVIOR RULES:
1. Speak natural conversational Bengali (with familiar English ecommerce words like "order", "confirm", "address", "delivery" where Bangladeshis naturally use them). Keep each reply concise (1-3 short spoken sentences) so it sounds like a real phone call!
2. Do not pretend to be human. If asked, identify yourself as the store's automated voice assistant and offer a representative follow-up.
3. For outbound confirmation, handle only the order linked to this session. Address corrections are staff-review requests and are not applied automatically. Change order status only when the latest customer transcript clearly authorizes it; if wording is uncertain, leave status pending.
4. Tell the customer that a human representative can follow up. If they want human help, call request_human_transfer; say a follow-up request was sent and never claim the live audio has been transferred.
5. If customer asks about any product, call get_product_details; when the result requires clarification, ask the customer to identify the exact product and do not quote a partial match. If a caller wants to order, collect the details and call request_human_transfer with reason "Verify voice order request and phone ownership". Explain that the spoken number must be verified by staff and no order has been placed.
6. If customer input seems like background noise or unclear, ask politely once; on repeated confusion, call request_human_transfer.`;

  const tools = [{
    functionDeclarations: [
      {
        name: 'get_product_details',
        description: 'Search product catalog for prices, stock, and details',
        parameters: { type: 'OBJECT', properties: { query: { type: 'STRING' } } }
      },
      {
        name: 'update_order_address',
        description: 'Request staff review of the caller’s address correction for this linked pending order. The address is not changed automatically.',
        parameters: { type: 'OBJECT', properties: { orderId: { type: 'STRING' }, newAddress: { type: 'STRING' }, note: { type: 'STRING' } }, required: ['newAddress'] }
      },
      {
        name: 'update_order_status',
        description: 'Confirm, hold, or cancel an order after customer response',
        parameters: { type: 'OBJECT', properties: { orderId: { type: 'STRING' }, status: { type: 'STRING', enum: ['confirmed', 'hold', 'cancelled'] }, note: { type: 'STRING' } }, required: ['status'] }
      },
      {
        name: 'create_new_order',
        description: 'Create a pending order request only after exact product/variation match and explicit delivery-area confirmation. Stock may need staff verification; this is not order confirmation.',
        parameters: {
          type: 'OBJECT',
          properties: {
            customerName: { type: 'STRING' },
            customerPhone: { type: 'STRING' },
            address: { type: 'STRING' },
            area: { type: 'STRING', enum: ['inside', 'outside'] },
            items: { type: 'ARRAY', items: { type: 'OBJECT', properties: { productName: { type: 'STRING' }, variationName: { type: 'STRING' }, quantity: { type: 'INTEGER' } }, required: ['productName', 'quantity'] } },
            productName: { type: 'STRING' },
            variationName: { type: 'STRING' },
            quantity: { type: 'INTEGER' },
            note: { type: 'STRING' }
          },
          required: ['customerName', 'customerPhone', 'address', 'area', 'items']
        }
      },
      {
        name: 'check_order_status',
        description: 'Check limited order status using the exact order ID only. Never search by phone.',
        parameters: { type: 'OBJECT', properties: { phoneOrOrderId: { type: 'STRING' } } }
      },
      {
        name: 'request_human_transfer',
        description: 'Queue human follow-up with a conversation summary; this does not bridge the live audio call.',
        parameters: { type: 'OBJECT', properties: { reason: { type: 'STRING' } } }
      }
    ]
  }];

  const contents = [];
  for (const h of session.history.slice(-10)) {
    contents.push({ role: h.role === 'model' ? 'model' : 'user', parts: [{ text: h.text }] });
  }
  contents.push({ role: 'user', parts: [{ text: userMessage }] });

  const models = ['gemini-3.6-flash', 'gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-2.5-flash'];
  const allActions = [];
  let lastGeminiError = '';

  for (const model of models) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: sysPrompt }] },
          contents,
          tools,
          generationConfig: { temperature: 0.55, maxOutputTokens: 320 }
        })
      });
      if (!resp.ok) {
        const errTxt = await resp.text().catch(() => '');
        lastGeminiError = `${model} (${resp.status}): ${errTxt.slice(0, 180)}`;
        console.error('[AI Voice Brain Error]:', lastGeminiError);
        continue;
      }
      const data = await resp.json();
      const parts = data?.candidates?.[0]?.content?.parts || [];
      const fnCalls = parts.filter((p) => p.functionCall);

      if (fnCalls.length > 0) {
        const fnResponses = [];
        for (const fc of fnCalls) {
          const { result, actions } = executeAiCallTool(fc.functionCall.name, fc.functionCall.args || {}, session);
          allActions.push(...actions);
          fnResponses.push({ functionResponse: { name: fc.functionCall.name, response: result } });
        }
        contents.push({ role: 'model', parts });
        contents.push({ role: 'user', parts: fnResponses });

        const resp2 = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: sysPrompt }] },
            contents,
            generationConfig: { temperature: 0.5, maxOutputTokens: 280 }
          })
        });
        if (resp2.ok) {
          const data2 = await resp2.json();
          const txt2 = (data2?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join(' ').trim();
          if (txt2) return { reply: txt2, actionsExecuted: allActions, transferRequested: !!session.transferRequested };
        }
      }

      const txt = parts.map((p) => p.text || '').join(' ').trim();
      if (txt) return { reply: txt, actionsExecuted: allActions, transferRequested: !!session.transferRequested };
    } catch (_) {}
  }

  const isKeyErr = lastGeminiError.includes('403') || lastGeminiError.includes('401') || lastGeminiError.includes('API key');
  if (isKeyErr) {
    return {
      reply: `আসসালামু আলাইকুম, ${storeName} থেকে বলছি। (সিস্টেম নোট: Gemini API Key-টি ব্লক/ইনভ্যালিড হয়েছে—ড্যাশবোর্ডের Settings থেকে নতুন Gemini API Key আপডেট করুন।)`,
      actionsExecuted: allActions,
      transferRequested: false,
      geminiError: lastGeminiError
    };
  }
  if (avail.available.length > 0) {
    return {
      reply: `দুঃখিত স্যার, একটু নেটওয়ার্ক সমস্যা হচ্ছে। আমি আপনাকে আমাদের হেল্পসেন্টার প্রতিনিধি ${avail.available[0].name}-এর কাছে ট্রান্সফার করছি।`,
      actionsExecuted: allActions,
      transferRequested: true,
      geminiError: lastGeminiError
    };
  }
  if (avail.busy.length > 0) {
    return {
      reply: `দুঃখিত স্যার, আমাদের হেল্পসেন্টার প্রতিনিধি ${avail.busy[0].name} এখন অন্য একটি কলে ব্যস্ত আছেন। অনুগ্রহ করে একটু পরে চেষ্টা করুন বা আপনার নম্বরটি দিন।`,
      actionsExecuted: allActions,
      transferRequested: false,
      geminiError: lastGeminiError
    };
  }
  return {
    reply: 'দুঃখিত স্যার, এই মুহূর্তে আমাদের কোনো প্রতিনিধি অনলাইনে নেই। আপনার নম্বর ও প্রশ্নটি রেখে যান, আমাদের টিম দ্রুত কল ব্যাক করবে।',
    actionsExecuted: allActions,
    transferRequested: false,
    geminiError: lastGeminiError
  };
}

let aiKeyBlockedReason = '';

app.get('/api/ai-call/config', (_req, res) => {
  try {
    const tel = getTelephonySettings();
    const ai = tel.aiCalling || {};
    const storeSettings = getSettings() || {};
    const storeName = storeSettings.storeName || 'Secrate';
    const apiKey = getStoreGeminiApiKey();
    const hasApiKey = !!apiKey && !aiKeyBlockedReason;
    const avail = getHelpCenterAvailability();
    const adminOnlineCount = (avail.available?.length || 0) + (avail.busy?.length || 0);
    const pickedAgent = avail.available?.length ? avail.available[nextAgentRrIdx % avail.available.length] : null;
    res.json({
      enabled: ai.enabled !== false && hasApiKey,
      hasApiKey,
      aiKeyBlockedReason: aiKeyBlockedReason || null,
      adminOnline: adminOnlineCount > 0,
      adminOnlineCount,
      targetExt: pickedAgent?.ext || null,
      websiteInboundAi: ai.websiteInboundAi !== false,
      marketingModeEnabled: ai.marketingModeEnabled !== false,
      voiceEngine: ai.voiceEngine || 'gemini_browser',
      hasElevenLabs: !!ai.elevenLabsKey,
      aiLanguage: ai.aiLanguage || 'bn',
      supportPhone: storeSettings.supportPhone || storeSettings.whatsappPhone || '',
      storeName
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/ai-call/start', adminAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const tel = getTelephonySettings();
    const aiCfg = tel.aiCalling || {};
    if (aiCfg.enabled === false) {
      return res.status(403).json({ error: 'AI Calling is currently disabled by admin' });
    }
    const mode = ['outbound_confirm', 'marketing', 'website_inbound'].includes(req.body?.mode) ? req.body.mode : 'website_inbound';
    if (mode === 'marketing' && aiCfg.marketingModeEnabled === false) return res.status(403).json({ error: 'Marketing AI is disabled' });
    if (mode === 'website_inbound' && aiCfg.websiteInboundAi === false) return res.status(403).json({ error: 'Website inbound AI is disabled' });
    const rawPhone = String(req.body?.phone || '').trim();
    const rawName = String(req.body?.name || '').trim();
    const rawOrderId = req.body?.orderId ? String(req.body.orderId).trim() : null;
    const clientIp = String(req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for']?.split(',')[0] || req.socket?.remoteAddress || 'unknown').trim();
    const rawDeviceId = String(req.body?.deviceId || '').trim();
    const rawFingerprint = String(req.body?.fingerprint || '').trim();
    const rawLandingSlug = String(req.body?.landingSlug || '').trim().toLowerCase();
    const matchedLanding = rawLandingSlug
      ? (getLandings() || []).find((l) => String(l.slug || '').toLowerCase() === rawLandingSlug || (Array.isArray(l.aliases) && l.aliases.some((a) => String(a || '').toLowerCase() === rawLandingSlug))) || null
      : null;
    const ctx = buildAiCustomerContext(rawPhone, rawOrderId);

    const sessionId = 'ai_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    const session = {
      sessionId,
      mode,
      customerName: rawName || ctx.targetOrder?.customer?.name || 'Customer',
      customerPhone: rawPhone || ctx.targetOrder?.customer?.phone || 'Website Visitor',
      clientIp,
      deviceId: rawDeviceId,
      fingerprint: rawFingerprint,
      orderId: ctx.targetOrder?.id || rawOrderId || null,
      targetOrder: ctx.targetOrder,
      landing: matchedLanding,
      landingSlug: matchedLanding?.slug || null,
      totalOrders: ctx.totalOrders,
      cancelledCount: ctx.cancelledCount,
      customerTier: ctx.customerTier,
      history: [],
      actionsExecuted: [],
      confusionCount: 0,
      transferRequested: false,
      takeOverBy: null,
      finalOutcome: 'completed',
      startedAt: new Date().toISOString(),
      updatedAt: Date.now()
    };

    const startPrompt = mode === 'outbound_confirm' && ctx.targetOrder
      ? 'Start the outbound order confirmation phone call now. Greet warmly, mention the product and ask if the shipping address is correct.'
      : mode === 'marketing'
      ? 'Start a friendly marketing & special offer call. Ask if they would like to hear about our best-selling offers or place a quick order.'
      : 'Start an inbound website support call. Greet the visitor warmly, introduce yourself from the help center, and ask how you can help with products, orders, or transfer to a live representative.';

    const aiRes = await runAiVoiceBrain(session, startPrompt);
    session.history.push({ role: 'model', text: aiRes.reply });
    session.actionsExecuted.push(...(aiRes.actionsExecuted || []));
    activeAiCalls.set(sessionId, session);

    res.json({
      sessionId,
      greeting: aiRes.reply,
      customerTier: session.customerTier,
      orderId: session.orderId,
      transferRequested: aiRes.transferRequested,
      geminiError: aiRes.geminiError || null
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/ai-call/turn', adminAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const sessionId = String(req.body?.sessionId || '');
    const userText = String(req.body?.text || '').trim();
    const session = activeAiCalls.get(sessionId);
    if (!session) return res.status(404).json({ error: 'AI Call session expired or not found' });

    if (session.takeOverBy) {
      return res.json({
        reply: `আমাদের প্রতিনিধি ${session.takeOverBy} এখন কলটি গ্রহণ করেছেন।`,
        actionsExecuted: [],
        transferRequested: true,
        takeOverBy: session.takeOverBy
      });
    }

    const aiCfg = getTelephonySettings().aiCalling || {};
    if (!userText || userText.length < 2) {
      session.confusionCount += 1;
      session.updatedAt = Date.now();
      if (aiCfg.autoTransferOnConfusion && session.confusionCount >= 2) {
        session.transferRequested = true;
        return res.json({
          reply: 'নেটওয়ার্কে একটু সমস্যা হচ্ছে স্যার, আমি আমাদের সিনিয়র হেল্পসেন্টার প্রতিনিধিকে লাইনটি ট্রান্সফার করছি।',
          actionsExecuted: [{ tool: 'auto_transfer_confusion' }],
          transferRequested: true
        });
      }
      return res.json({
        reply: 'দুঃখিত, আপনার কথাটা স্পষ্ট শুনতে পাইনি—একটু আবার বলবেন প্লিজ?',
        actionsExecuted: [],
        transferRequested: false
      });
    }

    session.confusionCount = 0;
    session.history.push({ role: 'user', text: userText });
    const aiRes = await runAiVoiceBrain(session, userText);
    session.history.push({ role: 'model', text: aiRes.reply });
    session.actionsExecuted.push(...(aiRes.actionsExecuted || []));
    session.updatedAt = Date.now();

    res.json({
      reply: aiRes.reply,
      actionsExecuted: aiRes.actionsExecuted || [],
      transferRequested: !!aiRes.transferRequested,
      geminiError: aiRes.geminiError || null
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/ai-call/tts', async (req, res) => {
  try {
    const text = String(req.body?.text || '').trim().slice(0, 800);
    if (!text) return res.status(400).json({ error: 'No text' });
    const aiCfg = getTelephonySettings().aiCalling || {};
    if (aiCfg.voiceEngine !== 'elevenlabs' || !aiCfg.elevenLabsKey) {
      return res.json({ fallback: 'browser' });
    }
    const voiceId = aiCfg.elevenLabsVoiceId || 'pNInz6obpgDQGcFmaJgB';
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`, {
      method: 'POST',
      headers: {
        'xi-api-key': aiCfg.elevenLabsKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg'
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.45, similarity_boost: 0.78 }
      })
    });
    if (!r.ok) return res.json({ fallback: 'browser' });
    const buf = Buffer.from(await r.arrayBuffer());
    res.setHeader('Content-Type', 'audio/mpeg');
    res.send(buf);
  } catch (_) {
    res.json({ fallback: 'browser' });
  }
});

app.post('/api/ai-call/end', adminAuth, requireRole('owner', 'manager'), (req, res) => {
  try {
    const sessionId = String(req.body?.sessionId || '');
    const session = activeAiCalls.get(sessionId);
    if (!session) return res.json({ ok: true });
    const duration = Math.max(1, Math.round((Date.now() - new Date(session.startedAt).getTime()) / 1000));
    const notes = `[AI ${session.mode}] ${session.actionsExecuted.map((a) => a.tool).join(', ') || 'Conversation'} | Turns: ${session.history.length}`;
    const saved = saveCall({
      direction: session.mode === 'website_inbound' ? 'inbound' : 'outbound',
      orderId: session.orderId || null,
      customerName: session.customerName,
      customerPhone: session.customerPhone,
      productName: session.targetOrder?.items?.[0]?.name || '',
      duration,
      outcome: session.transferRequested ? 'call_later' : (session.finalOutcome || 'confirmed'),
      notes,
      staff: { username: 'ai-agent', name: '🤖 AI Voice Agent', role: 'ai' }
    });
    activeAiCalls.delete(sessionId);
    res.json({ ok: true, call: saved });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/ai-call/:sessionId/takeover', adminAuth, (req, res) => {
  const session = activeAiCalls.get(req.params.sessionId);
  if (!session) return res.status(404).json({ error: 'Session not active' });
  session.takeOverBy = req.admin?.name || req.admin?.username || 'Human Agent';
  session.transferRequested = true;
  session.updatedAt = Date.now();
  const transfer = saveCallTransfer({
    sessionId: session.sessionId,
    customerName: session.customerName || 'Website Visitor',
    customerPhone: session.customerPhone || '',
    customerAddress: session.customerAddress || session.targetOrder?.customer?.address || '',
    customerTier: session.customerTier || 'New',
    productName: session.interestedProduct || session.targetOrder?.items?.[0]?.name || session.landing?.productTitle || '',
    orderId: session.orderId || null,
    reason: 'Admin requested a human follow-up during the AI call',
    note: buildAiTransferSummaryNote(session, 'Admin requested a human follow-up during the AI call'),
  });
  addStaffNotification({
    type: 'ai_call_followup',
    category: 'call_transfer',
    transferId: transfer.id,
    toUsername: 'all',
    fromUsername: req.admin?.username || 'admin',
    fromName: req.admin?.name || req.admin?.username || 'Admin',
    phone: session.customerPhone || '',
    customerName: session.customerName || 'Website Visitor',
    orderId: session.orderId || '',
    message: `AI কলে ${session.customerName || 'একজন গ্রাহক'}-এর callback ${session.takeOverBy} অনুমোদনের জন্য পাঠিয়েছেন।`,
  });
  const clientWs = activeAiCallClients.get(req.params.sessionId);
  if (clientWs?.readyState === 1) {
    try {
      clientWs.send(JSON.stringify({ type: 'followup_requested', by: session.takeOverBy }));
      setTimeout(() => {
        try {
          if (clientWs.readyState === 1) {
            clientWs.send(JSON.stringify({ type: 'end_call' }));
            clientWs.close();
          }
        } catch (_) {}
      }, 350);
    } catch (_) {}
  }
  res.json({ ok: true, takeOverBy: session.takeOverBy, followupRequested: true, transferId: transfer.id, status: 'awaiting_agent_approval' });
});

app.post('/api/ai-call/auto-dispatch', adminAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const tel = getTelephonySettings();
    const aiCfg = tel.aiCalling || {};
    if (aiCfg.enabled === false) {
      return res.status(400).json({ error: 'AI Calling is disabled' });
    }
    const pending = getOrders().filter((o) => o.status === 'pending' && o.customer?.phone).slice(0, 15);
    res.json({ ok: true, pendingFound: pending.length, queued: 0, dispatchAvailable: false });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- SAIKA (সাইকা) — PERSONAL VOICE AI BUSINESS MANAGER & AUDIT ENGINE ----
// ============================================================================
let aiCopilotAutopilot = {
  enabled: true,
  voiceAlertsEnabled: true,
  lastRunAt: null,
  lastDirectionText: '',
  directivesSentToday: 0
};

// Split Bangla text into natural speech chunks <= 170 chars for seamless Female TTS streaming
function splitBanglaSpeechChunks(rawText) {
  const cleaned = String(rawText || '')
    .replace(/[*#_`~>•]/g, ' ')
    .replace(/৳\s*(\d+)/g, '$1 টাকা ')
    .replace(/%/g, ' শতাংশ ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return [];

  const sentences = cleaned.split(/(?<=[।!?.\n])\s*/);
  const chunks = [];
  let current = '';

  for (const s of sentences) {
    if (!s.trim()) continue;
    if ((current + ' ' + s).trim().length <= 165) {
      current = (current + ' ' + s).trim();
    } else {
      if (current) chunks.push(current);
      if (s.length <= 165) {
        current = s.trim();
      } else {
        const words = s.split(' ');
        let sub = '';
        for (const w of words) {
          if ((sub + ' ' + w).trim().length <= 165) {
            sub = (sub + ' ' + w).trim();
          } else {
            if (sub) chunks.push(sub);
            sub = w;
          }
        }
        current = sub;
      }
    }
  }
  if (current) chunks.push(current);
  return chunks.slice(0, 12);
}

// Ultra-realistic Human Female Neural Voice TTS for Saika (node-edge-tts + Google Fallback)
let EdgeTTSClass = null;
try {
  EdgeTTSClass = require('node-edge-tts').EdgeTTS;
} catch (e) {
  console.warn('[Saika] node-edge-tts could not be loaded, using fallback:', e.message);
}

async function synthesizeHumanVoiceMp3(rawText, voiceName = 'bn-BD-NabanitaNeural') {
  const clean = String(rawText || '')
    .replace(/[*#_`~>•]/g, ' ')
    .replace(/৳\s*(\d+)/g, '$1 টাকা ')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!clean) throw new Error('Clean speech text is empty');

  // 1. Try Microsoft Edge Neural Female Voice (True Human Prosody & Bangladeshi Bangla)
  if (EdgeTTSClass) {
    try {
      const selectedVoice = voiceName === 'bn-IN-TanishaaNeural' ? 'bn-IN-TanishaaNeural' : 'bn-BD-NabanitaNeural';
      const tts = new EdgeTTSClass({
        voice: selectedVoice,
        lang: selectedVoice.startsWith('bn-BD') ? 'bn-BD' : 'bn-IN',
        rate: '+1%',
        pitch: '+0Hz',
        outputFormat: 'audio-24khz-48kbitrate-mono-mp3'
      });
      const tmpPath = path.join(os.tmpdir(), `saika_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.mp3`);
      await tts.ttsPromise(clean.slice(0, 1500), tmpPath);
      if (fs.existsSync(tmpPath)) {
        const buf = fs.readFileSync(tmpPath);
        try { fs.unlinkSync(tmpPath); } catch {}
        if (buf && buf.length > 500) {
          return buf;
        }
      }
    } catch (edgeErr) {
      console.warn('[Saika Neural TTS] EdgeTTS temporary fallback:', edgeErr?.message || edgeErr);
    }
  }

  // 2. Fallback to Google Translate TTS chunks
  const chunks = splitBanglaSpeechChunks(clean);
  const buffers = [];
  for (const chunk of chunks) {
    const url = `https://translate.googleapis.com/translate_tts?ie=UTF-8&client=tw-ob&tl=bn&q=${encodeURIComponent(chunk)}`;
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      }
    });
    if (r.ok) {
      const arrBuf = await r.arrayBuffer();
      buffers.push(Buffer.from(arrBuf));
    }
  }
  if (buffers.length > 0) {
    return Buffer.concat(buffers);
  }
  throw new Error('TTS synthesis failed');
}

// Natural Bangla Female Voice TTS Stream Endpoint for Saika
app.post('/api/admin/ai-copilot/tts', adminAuth, async (req, res) => {
  try {
    const text = String(req.body?.text || '').trim();
    const voice = String(req.body?.voice || 'bn-BD-NabanitaNeural');
    if (!text) return res.status(400).json({ error: 'Text required' });

    const audioBuf = await synthesizeHumanVoiceMp3(text, voice);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', String(audioBuf.length));
    res.setHeader('Cache-Control', 'no-store');
    return res.send(audioBuf);
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) });
  }
});

function buildAiCopilotBriefing() {
  const settings = getSettings() || {};
  const storeName = settings.storeName || 'Secrate';
  const orders = getOrders() || [];
  const catalog = getCatalog()?.products || [];
  const staffData = getStaffMonitoringData() || { staff: [] };
  const calls = getCalls() || [];
  const now = Date.now();
  const bdToday = getBangladeshDate();

  const todayOrders = orders.filter((o) => {
    if (!o.createdAt) return false;
    const d = new Date(new Date(o.createdAt).getTime() + 6 * 3600 * 1000).toISOString().slice(0, 10);
    return d === bdToday;
  });

  const validTodayOrders = todayOrders.filter((o) => !['cancelled', 'incomplete', 'trash'].includes(String(o.status || '').toLowerCase()));
  const todayRevenue = validTodayOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);

  const pendingOrders = orders.filter((o) => String(o.status || '').toLowerCase() === 'pending');
  const delayedPending = pendingOrders.filter((o) => o.createdAt && (now - new Date(o.createdAt).getTime()) > 25 * 60 * 1000);
  const incompleteOrders = orders.filter((o) => String(o.status || '').toLowerCase() === 'incomplete');
  const confirmedOrders = orders.filter((o) => ['confirmed', 'ready_to_ship'].includes(String(o.status || '').toLowerCase()));
  const shippedOrders = orders.filter((o) => ['shipped', 'in_transit'].includes(String(o.status || '').toLowerCase()));
  const deliveredOrders = orders.filter((o) => String(o.status || '').toLowerCase() === 'delivered');
  const returnedOrders = orders.filter((o) => ['return', 'returned'].includes(String(o.status || '').toLowerCase()));
  const cancelledOrders = orders.filter((o) => String(o.status || '').toLowerCase() === 'cancelled');
  const holdOrders = orders.filter((o) => {
    const st = String(o.status || '').toLowerCase();
    const cst = String(o.courier?.status || '').toLowerCase();
    return st === 'hold' || cst.includes('hold');
  });

  // Bangladeshi Market Geography & Price Bracket Analysis from Store Orders
  let dhakaCount = 0;
  let outsideDhakaCount = 0;
  let totalValidOrderValue = 0;
  let totalValidOrderCount = 0;

  // Product Sales Velocity & Stock Analysis
  const salesByProduct = {};
  for (const o of orders) {
    const st = String(o.status || '').toLowerCase();
    if (['cancelled', 'incomplete', 'trash'].includes(st)) continue;
    totalValidOrderValue += Number(o.total || 0);
    totalValidOrderCount++;

    const addr = String(o.customer?.address || o.customer?.area || '').toLowerCase();
    if (addr.includes('dhaka') || addr.includes('ঢাকা') || addr.includes('মিরপুর') || addr.includes('উত্তরা') || addr.includes('ধানমন্ডি') || addr.includes('গুলশান') || addr.includes('মোহাম্মদপুর')) {
      dhakaCount++;
    } else {
      outsideDhakaCount++;
    }

    for (const it of (Array.isArray(o.items) ? o.items : [])) {
      const k = String(it.name || it.id || '').trim();
      if (!k) continue;
      if (!salesByProduct[k]) salesByProduct[k] = { name: k, qty: 0, revenue: 0 };
      salesByProduct[k].qty += Number(it.qty || 1);
      salesByProduct[k].revenue += (Number(it.price || 0) * Number(it.qty || 1));
    }
  }

  const avgOrderValue = totalValidOrderCount > 0 ? Math.round(totalValidOrderValue / totalValidOrderCount) : 990;
  const dhakaPercent = totalValidOrderCount > 0 ? Math.round((dhakaCount / totalValidOrderCount) * 100) : 45;
  const outsideDhakaPercent = 100 - dhakaPercent;
  const finishedCourierCount = deliveredOrders.length + returnedOrders.length;
  const deliverySuccessRate = finishedCourierCount > 0 ? Math.round((deliveredOrders.length / finishedCourierCount) * 100) : 88;

  const topSellingProducts = Object.values(salesByProduct)
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 6);

  const stockItems = catalog.map((p) => {
    const stock = p.stock !== undefined && p.stock !== null && p.stock !== '' ? Number(p.stock) : 50;
    const sold = salesByProduct[p.name]?.qty || 0;
    const dailyVelocity = Math.max(0.5, Number((sold / 14).toFixed(1)));
    const daysLeft = stock <= 0 ? 0 : Math.round(stock / dailyVelocity);
    return {
      id: p.id,
      name: p.name,
      sku: p.sku || '',
      price: Number(p.price || 0),
      stock,
      sold,
      daysLeft,
      status: stock <= 0 ? 'out_of_stock' : stock <= 10 ? 'low_stock' : 'healthy'
    };
  });

  const outOfStock = stockItems.filter((p) => p.status === 'out_of_stock');
  const lowStock = stockItems.filter((p) => p.status === 'low_stock');

  // Deep Staff Audit Engine (সকল স্টাফদের অডিট)
  const staffList = Array.isArray(staffData.staff) ? staffData.staff : [];
  const onlineStaff = staffList.filter((s) => s.isOnline);

  const auditedStaff = staffList.map((s) => {
    const uname = String(s.username || '').toLowerCase();
    const assignedOrders = orders.filter((o) => String(o.assignedTo || '').toLowerCase() === uname);
    const assignedPending = assignedOrders.filter((o) => String(o.status || '').toLowerCase() === 'pending').length;
    const confirmedToday = Number(s.todayConfirmed || 0);
    const cancelledToday = Number(s.todayCancelled || 0);
    const callsToday = Number(s.todayCalls || 0);
    const activeMins = Number(s.activeMinutesToday || 0);

    // Compute Audit Score (0 - 100)
    let score = 50;
    if (s.isOnline) score += 15;
    score += Math.min(25, confirmedToday * 5);
    score += Math.min(15, callsToday * 3);
    score += Math.min(10, Math.floor(activeMins / 15) * 2);
    if (assignedPending > 3) score -= Math.min(25, (assignedPending - 3) * 5);
    if (!s.isOnline && activeMins === 0 && confirmedToday === 0) score = 25;
    score = Math.max(10, Math.min(100, score));

    let grade = 'B (সন্তোষজনক)';
    let auditVerdict = 'স্বাভাবিকভাবে কাজ করছেন।';
    let needsWarning = false;

    if (score >= 80) {
      grade = 'A+ (সেরা পারফরমার)';
      auditVerdict = `চমৎকার পারফরম্যান্স! আজ ${confirmedToday}টি অর্ডার কনফার্ম এবং ${callsToday}টি কল করেছেন।`;
    } else if (assignedPending >= 3) {
      grade = 'C (পেন্ডিং জমে আছে)';
      auditVerdict = `সতর্কতা: তার কাছে ${assignedPending}টি পেন্ডিং অর্ডার আনটাচড পড়ে আছে। দ্রুত কল করতে তাগিদ দেওয়া প্রয়োজন।`;
      needsWarning = true;
    } else if (!s.isOnline && activeMins < 10 && confirmedToday === 0) {
      grade = 'D (নিষ্ক্রিয় / অফলাইন)';
      auditVerdict = `আজ এখন পর্যন্ত অ্যাক্টিভ হননি এবং কোনো অর্ডার প্রসেস করেননি।`;
      needsWarning = true;
    } else {
      auditVerdict = `আজ ${activeMins} মিনিট অ্যাক্টিভ ছিলেন, ${confirmedToday}টি অর্ডার কনফার্ম করেছেন। কাজের গতি আরও বাড়ানো সম্ভব।`;
    }

    return {
      username: s.username,
      name: s.name || s.username,
      role: s.role || 'staff',
      isOnline: !!s.isOnline,
      todayConfirmed: confirmedToday,
      todayCancelled: cancelledToday,
      todayCalls: callsToday,
      activeMinutesToday: activeMins,
      assignedPending,
      auditScore: score,
      grade,
      auditVerdict,
      needsWarning
    };
  });

  const slowStaff = auditedStaff.filter((s) => s.needsWarning);

  // Problems Radar
  const problems = [];
  if (delayedPending.length > 0) {
    problems.push({
      severity: 'high',
      type: 'delayed_pending',
      title: `${delayedPending.length}টি অর্ডার ২৫ মিনিটের বেশি সময় ধরে Pending পড়ে আছে`,
      actionText: 'সাইকাকে বলুন স্টাফদের এখনই কল করার ডিরেকশন দিতে'
    });
  }
  if (holdOrders.length > 0) {
    problems.push({
      severity: 'high',
      type: 'courier_hold',
      title: `${holdOrders.length}টি পার্সেল কুরিয়ারে Hold অবস্থায় আছে`,
      actionText: 'কাস্টমারদের কল বা হোয়াটসঅ্যাপ করে ডেলিভারি নিশ্চিত করুন'
    });
  }
  if (outOfStock.length > 0) {
    problems.push({
      severity: 'critical',
      type: 'out_of_stock',
      title: `${outOfStock.length}টি প্রোডাক্টের স্টক সম্পূর্ণ শেষ (${outOfStock.slice(0, 2).map((p) => p.name).join(', ')})`,
      actionText: 'দ্রুত রিস্টক করুন অথবা অ্যাড ক্যাম্পেইন পজ রাখুন'
    });
  }
  if (lowStock.length > 0) {
    problems.push({
      severity: 'medium',
      type: 'low_stock',
      title: `${lowStock.length}টি প্রোডাক্টের স্টক ১০-এর নিচে নেমেছে (${lowStock.slice(0, 2).map((p) => `${p.name}: ${p.stock}টি`).join(', ')})`,
      actionText: 'সাপ্লায়ারকে নতুন স্টকের অর্ডার দিন'
    });
  }
  if (slowStaff.length > 0 && pendingOrders.length > 0) {
    problems.push({
      severity: 'medium',
      type: 'staff_slow',
      title: `স্টাফ অডিট: ${slowStaff.map((s) => s.name).join(', ')}-এর কাছে পেন্ডিং কাজ জমে আছে বা নিষ্ক্রিয়`,
      actionText: 'অটো-অডিট ওয়ার্নিং পাঠিয়ে স্টাফকে অ্যাক্টিভ করুন'
    });
  }
  if (incompleteOrders.length > 0) {
    problems.push({
      severity: 'medium',
      type: 'incomplete_orders',
      title: `${incompleteOrders.length}টি ইনকমপ্লিট অর্ডার রিকভারির অপেক্ষায় আছে`,
      actionText: 'কল বা হোয়াটসঅ্যাপ মেসেজ দিয়ে রিকভার করলে ৩০% সেল বাড়বে'
    });
  }

  // Bangladeshi Market Analysis & Winning Product Suggestions
  const bdMarketInsights = {
    avgOrderValue,
    dhakaPercent,
    outsideDhakaPercent,
    deliverySuccessRate,
    sweetSpotPrice: '৳৮৯০ - ৳১,৩৯০ (ক্যাশ অন ডেলিভারি ইমপালস বায়িং জোন)',
    topCategoryTrend: 'প্রাইভেসি পার্সোনাল ওয়েলনেস, মেনস গ্রুমিং ও K-Beauty স্কিন কেয়ার',
    marketSummary: `বাংলাদেশের বর্তমান ই-কমার্স ট্রেন্ড ও আপনার স্টোরের ডাটা অনুযায়ী আপনার ${dhakaPercent}% অর্ডার ঢাকার ভেতর এবং ${outsideDhakaPercent}% ঢাকার বাইরে থেকে আসছে। আপনার গড় অর্ডার ভ্যালু ৳${avgOrderValue} এবং ডেলিভারি সাকসেস রেট ${deliverySuccessRate}%। বাংলাদেশে এখন ফেসবুক অ্যাডে ৮৯০ থেকে ১৩৯০ টাকার প্রবলেম-সলভিং প্রোডাক্টে সবচেয়ে কম খরচে (CPA $0.80 - $1.30) বেশি অর্ডার পাওয়া যাচ্ছে।`
  };

  const productIdeas = [
    {
      title: '১. ভিআইপি ২-পিস কম্বো ও রিফিল সেভার প্যাক (High AOV Booster)',
      category: 'BD Market Best-Seller Upsell',
      buyCost: '৳২৬০ - ৳৩৬০ (সোর্সিং: চায়না / লোকাল ইমপোর্টার)',
      sellPrice: '৳১,৩৯০ - ৳১,৬৯০ (ফ্রি ডেলিভারি অফার)',
      margin: '৭২% নিট প্রফিট মার্জিন',
      reason: `বাংলাদেশের কাস্টমাররা "১টির সাথে আরেকটি নিলে ৩০০ টাকা ছাড় + ফ্রি ডেলিভারি" অফারে সবচেয়ে বেশি আকৃষ্ট হয়। আপনার বেস্ট সেলার "${topSellingProducts[0]?.name || 'মেইন প্রোডাক্ট'}"-এর কম্বো ভ্যারিয়েন্ট করলে অ্যাড খরচ না বাড়িয়েই প্রতি অর্ডারে ৩৫০-৪৫০ টাকা অতিরিক্ত লাভ থাকবে।`
    },
    {
      title: '২. মেনস প্রিমিয়াম ইন্টিমেট ওয়েলনেস ও স্ট্যামিনা কেয়ার কিট',
      category: 'High Privacy Impulse Winner (BD #1 Niche)',
      buyCost: '৳২২০ - ৳৩১০ (চকবাজার / গুয়াংজু হোয়াইট-লেবেল)',
      sellPrice: '৳৯৯০ - ৳১,২৫০',
      margin: '৭০% প্রফিট মার্জিন',
      reason: 'বাংলাদেশে গোপনীয় প্যাকিং (Discreet Packaging) ও ক্যাশ অন ডেলিভারিতে পুরুষদের পার্সোনাল ওয়েলনেস পণ্যের চাহিদা সারা বছর তুঙ্গে থাকে। আপনার বর্তমান কাস্টমার ডেটাবেসের কাস্টমারদের কাছেই হোয়াটসঅ্যাপ ও রিটার্গেটিং অ্যাডে এটি প্রতিদিন ৩০-৫০টি সহজে সেল করা যাবে।'
    },
    {
      title: '৩. কোরিয়ান ডার্ক স্পট ও আন্ডার-আই রিপেয়ার সিরাম কম্বো (K-Beauty BD Trend)',
      category: 'High Repeat Order (৩০ দিনে রিফিল)',
      buyCost: '৳৩৫০ - ৳৪৪০',
      sellPrice: '৳১,১৫০ - ৳১,৪৫০',
      margin: '৬৪% প্রফিট মার্জিন',
      reason: 'বাংলাদেশে এখন Mary&May, Axis-Y এবং কোরিয়ান আই/স্কিন সিরামের প্রচণ্ড চাহিদা। একবার কাস্টমার সন্তুষ্ট হলে প্রতি মাসে রিপিট অর্ডার করে, ফলে প্রথমবারের পর আর ফেসবুক অ্যাড খরচ লাগে না।'
    },
    {
      title: '৪. ইনস্ট্যান্ট পেইন রিলিফ ও মাসাজ থেরাপি গ্যাজেট / প্যাচ',
      category: 'Mass Market FB Ads Winner',
      buyCost: '৳১৮০ - ৳২৮০',
      sellPrice: '৳৮৯০ - ৳১,০৯০',
      margin: '৬৬% প্রফিট মার্জিন',
      reason: 'বাংলাদেশে ২৫ থেকে ৫৫ বছর বয়সী কাস্টমারদের কাছে ঘাড়, কোমর ও জয়েন্ট পেইন রিলিফ প্রোডাক্টের ভিডিও অ্যাড দিলে কনভার্সন রেট খুবই বেশি পাওয়া যায় এবং কুরিয়ার রিটার্ন ১০%-এর নিচে থাকে।'
    }
  ];

  const recentOrders = orders.slice(0, 6).map((o) => ({
    id: o.id,
    name: o.customer?.name || 'Customer',
    phone: o.customer?.phone || '',
    total: Number(o.total || 0),
    status: o.status || 'pending',
    product: o.items?.[0]?.name || 'Item',
    createdAt: o.createdAt
  }));

  const staffAuditVoiceReport = auditedStaff.length > 0
    ? `বস, আমি সাইকা আপনার সকল স্টাফদের অডিট সম্পন্ন করেছি। মোট ${auditedStaff.length} জন স্টাফের মধ্যে এখন ${onlineStaff.length} জন অনলাইনে আছেন। ${auditedStaff.map((s) => `${s.name}-এর অডিট স্কোর ${s.auditScore} শতাংশ, গ্রেড ${s.grade}। ${s.auditVerdict}`).join(' ')}`
    : 'বস, স্টাফ তালিকায় বর্তমানে কোনো আলাদা স্টাফ অ্যাকাউন্ট পাওয়া যায়নি।';

  // Proactive Intelligence Suggestions (স্বপ্রণোদিত সিদ্ধান্ত ও বিজনেস পরামর্শ)
  const proactiveSuggestions = [
    {
      id: 'sug_stock_restock',
      category: '📦 স্টক ও রিস্টক সতর্কতা',
      urgency: outOfStock.length > 0 ? 'critical' : (lowStock.length > 0 ? 'high' : 'normal'),
      title: outOfStock.length > 0 
        ? `বস, ${outOfStock.length}টি পণ্যের স্টক সম্পূর্ণ শেষ! এখনই রিস্টক দেওয়া প্রয়োজন`
        : (lowStock.length > 0 ? `বস, ${lowStock.length}টি পণ্যের স্টক ১০-এর নিচে, এখনই সাপ্লায়ারকে অর্ডার দিন` : 'সব প্রোডাক্টের স্টক পর্যাপ্ত আছে'),
      advice: outOfStock.length > 0 
        ? `আপনার ${outOfStock.slice(0, 3).map((p) => p.name).join(', ')} পণ্যের স্টক ০। ফেসবুক অ্যাড রানিং থাকলে দ্রুত পজ করুন অথবা চকবাজার/চায়না সাপ্লায়ারের কাছ থেকে নতুন লট অর্ডার করুন।`
        : `টপ সেলিং পণ্যগুলোর ব্যাকআপ স্টক রাখুন যেন ক্যাম্পেইন স্কেলিং করার সময় স্টকআউটে সেল মিস না হয়।`,
      quickAction: 'view_stock'
    },
    {
      id: 'sug_staff_supervision',
      category: '🕵️‍♀️ স্টাফ সুপারভিশন ও অডিট',
      urgency: delayedPending.length > 0 ? 'high' : 'medium',
      title: delayedPending.length > 0 
        ? `বস, ${delayedPending.length}টি অর্ডার ২৫ মিনিটের বেশি সময় ধরে পেন্ডিং পড়ে আছে—স্টাফদের তাগিদ দিন`
        : 'স্টাফদের আজকের পারফরম্যান্স স্বাভাবিক রয়েছে',
      advice: delayedPending.length > 0 
        ? `বাংলাদেশের ক্রেতারা দ্রুত কনফার্মেশন কল না পেলে অন্য শপ থেকে কিনে নেয়। স্টাফদের এখনই এক ক্লিকে সাইকার অটো-অ্যালার্ট পাঠিয়ে কল স্পিড বাড়ান।`
        : `স্টাফদের কনফার্মেশন রেট ভালো। তাদের আজকের টার্গেট শেষ করতে উৎসাহ দিন।`,
      quickAction: 'direct_staff'
    },
    {
      id: 'sug_combo_upsell',
      category: '💡 সেলস ও রেভিনিউ বুস্টিং',
      urgency: 'high',
      title: 'টপ সেলিং পণ্যের সাথে কম্বো বান্ডিল অফার দিন—AOV অন্তত ৳৪৫০ বাড়বে',
      advice: `আপনার "${topSellingProducts[0]?.name || 'মেইন প্রডাক্ট'}"-এর সাথে "২টি নিলে ৩০০ টাকা ছাড় + ফ্রি ডেলিভারি" অফার দিলে ফেসবুক অ্যাড খরচ ছাড়াই নিট প্রফিট ৩৫% বাড়বে।`,
      quickAction: 'view_ideas'
    },
    {
      id: 'sug_courier_hold',
      category: '🚚 কুরিয়ার হোল্ড ও রিটার্ন সেভার',
      urgency: holdOrders.length > 0 ? 'high' : 'normal',
      title: holdOrders.length > 0 
        ? `${holdOrders.length}টি পার্সেল কুরিয়ারে আটকে আছে—হোয়াটসঅ্যাপ মেসেজ ও কল দেওয়া জরুরি`
        : 'কুরিয়ার ডেলিভারি রেট সন্তোষজনক রয়েছে',
      advice: 'স্টেডফাস্ট বা রেডএক্সে কাস্টমার ফোন না ধরলে পার্সেল হোল্ড হয়ে যায়। কাস্টমারকে ট্র্যাকিং লিংক ও মেসেজ পাঠালে ৬০% রিটার্ন সেভ করা সম্ভব।',
      quickAction: 'recover_hold'
    },
    {
      id: 'sug_market_winner',
      category: '🇧🇩 বাংলাদেশ মার্কেট উইনার পণ্য',
      urgency: 'medium',
      title: 'চলতি সপ্তাহের ট্রেন্ডিং উইনিং প্রোডাক্ট টেস্ট করার পরামর্শ',
      advice: 'বর্তমানে বাংলাদেশে ৮৯০-১২৫০ টাকা রেঞ্জের প্রবলেম సলভিং ও গ্রুমিং কিটের ফেসবুক CPA সবচেয়ে কম ($0.85)। এ সপ্তাহে টেস্ট ক্যাম্পেইন চালানোর পরামর্শ দিচ্ছি।',
      quickAction: 'view_ideas'
    }
  ];

  const voiceGreeting = `আসসালামু আলাইকুম বস! আমি সাইকা। আপনার স্টোর অ্যানালাইসিস করে আমি নিজে থেকেই গুরুত্বপূর্ণ কয়েকটি আপডেট ও পরামর্শ দিচ্ছি। আজকে এখন পর্যন্ত ${todayOrders.length}টি নতুন অর্ডার এসেছে, যার মোট মূল্য ${todayRevenue} টাকা। বর্তমানে ${pendingOrders.length}টি অর্ডার পেন্ডিং আছে${delayedPending.length > 0 ? ` এবং এর মধ্যে ${delayedPending.length}টি অর্ডারে এখনই কল করা প্রয়োজন` : ''}। স্টক চেক করে দেখলাম ${outOfStock.length > 0 ? `${outOfStock.length}টি পণ্যের স্টক শেষ, এখনই রিস্টক দেওয়া দরকার` : 'স্টক পরিস্থিতি স্বাভাবিক আছে'}। আর স্টাফ অডিটে ${staffList.length} জনের মধ্যে ${onlineStaff.length} জন সক্রিয় আছেন। আপনার সুবিধার জন্য আমি লাভজনক কম্বো অফার এবং উইনিং প্রোডাক্টের স্বপ্রণোদিত পরামর্শ রেডি করেছি।`;

  return {
    ok: true,
    assistantName: 'Saika (সাইকা)',
    storeName,
    timestamp: new Date().toISOString(),
    autopilot: aiCopilotAutopilot,
    summary: {
      todayOrdersCount: todayOrders.length,
      todayRevenue,
      totalOrdersCount: orders.length,
      pendingCount: pendingOrders.length,
      delayedPendingCount: delayedPending.length,
      incompleteCount: incompleteOrders.length,
      confirmedCount: confirmedOrders.length,
      shippedCount: shippedOrders.length,
      deliveredCount: deliveredOrders.length,
      returnedCount: returnedOrders.length,
      cancelledCount: cancelledOrders.length,
      holdCount: holdOrders.length
    },
    bdMarketInsights,
    stock: {
      totalProducts: catalog.length,
      outOfStockCount: outOfStock.length,
      lowStockCount: lowStock.length,
      outOfStock,
      lowStock,
      allStock: stockItems.slice(0, 30),
      topSellingProducts
    },
    staff: {
      totalStaff: staffList.length,
      onlineCount: onlineStaff.length,
      onlineNames: onlineStaff.map((s) => s.name || s.username),
      staffList: auditedStaff,
      staffAuditVoiceReport
    },
    problems,
    proactiveSuggestions,
    productIdeas,
    recentOrders,
    voiceGreeting
  };
}

function executeAutoStaffDirection(customDirective = '', triggeredBy = 'সাইকা (Saika AI)') {
  const briefing = buildAiCopilotBriefing();
  const s = briefing.summary;
  const tasks = [];

  if (customDirective && customDirective.trim()) {
    tasks.push(customDirective.trim());
  } else {
    if (s.pendingCount > 0) {
      tasks.push(`📞 বর্তমানে ${s.pendingCount}টি অর্ডার Pending আছে—দ্রুত কাস্টমারকে কল করে অর্ডার কনফার্ম করুন।`);
    }
    if (s.holdCount > 0) {
      tasks.push(`⚠️ ${s.holdCount}টি পার্সেল কুরিয়ারে Hold-এ আছে—কাস্টমারের সাথে কথা বলে ডেলিভারি নিশ্চিত করুন।`);
    }
    if (s.incompleteCount > 0) {
      tasks.push(`🛒 ${s.incompleteCount}টি Incomplete অর্ডার আছে—কল বা হোয়াটসঅ্যাপ করে অর্ডারগুলো রিকভার করুন।`);
    }
    if (s.confirmedCount > 0) {
      tasks.push(`🚚 ${s.confirmedCount}টি Confirmed অর্ডার প্যাকিং ও কুরিয়ার বুকিং সম্পন্ন করুন।`);
    }
  }

  if (tasks.length === 0) {
    tasks.push('✅ সকল পেন্ডিং অর্ডার ক্লিয়ার আছে। নতুন অর্ডার আসলে সাথে সাথে কল করে কনফার্ম করবেন।');
  }

  // Also auto-assign unassigned pending orders to online staff
  let assignedCount = 0;
  try {
    const orders = getOrders() || [];
    for (const o of orders) {
      if (String(o.status || '').toLowerCase() === 'pending' && !o.assignedTo) {
        const assigned = autoAssignOnlineStaff();
        if (assigned) {
          updateOrder(o.id, { assignedTo: assigned.username, assignedName: assigned.name });
          assignedCount++;
        }
      }
    }
  } catch (_) {}

  const fullMessage = `🤖 [${triggeredBy} - স্টাফ অডিট ও ডিরেকশন]: ${tasks.join(' | ')}${assignedCount > 0 ? ` (${assignedCount}টি পেন্ডিং অর্ডার অনলাইন স্টাফদের অটো-অ্যাসাইন করা হয়েছে)` : ''}`;

  addStaffNotification({
    type: 'ai_ceo_directive',
    toUsername: 'all',
    fromUsername: 'saika_ai',
    fromName: 'Saika AI (সাইকা)',
    message: fullMessage
  });

  aiCopilotAutopilot.lastRunAt = new Date().toISOString();
  aiCopilotAutopilot.lastDirectionText = fullMessage;
  aiCopilotAutopilot.directivesSentToday += 1;

  return {
    ok: true,
    message: fullMessage,
    assignedCount,
    autopilot: aiCopilotAutopilot
  };
}

// Background Guardian: Checks every 15 minutes and directs staff automatically if autopilot is enabled
setInterval(() => {
  try {
    if (!aiCopilotAutopilot.enabled) return;
    const b = buildAiCopilotBriefing();
    if (b.summary.delayedPendingCount > 0 || b.summary.holdCount > 0) {
      executeAutoStaffDirection('', 'সাইকা অটো-গার্ডিয়ান (বসের অবর্তমানে)');
    }
  } catch (e) {
    console.warn('[Saika AI Auto-Guardian Error]:', e?.message || e);
  }
}, 15 * 60 * 1000).unref?.();

app.get('/api/admin/ai-copilot/briefing', adminAuth, requireSaikaPermission, (_req, res) => {
  try {
    res.json(buildAiCopilotBriefing());
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});

app.post('/api/admin/ai-copilot/direct-staff', adminAuth, requireSaikaPermission, (req, res) => {
  try {
    const { message, enableAutopilot } = req.body || {};
    if (typeof enableAutopilot === 'boolean') {
      aiCopilotAutopilot.enabled = enableAutopilot;
    }
    const result = executeAutoStaffDirection(message || '', 'সাইকা (বসের নির্দেশে)');
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});

app.post('/api/admin/ai-copilot/autopilot', adminAuth, requireSaikaPermission, (req, res) => {
  try {
    const { enabled, voiceAlertsEnabled } = req.body || {};
    if (typeof enabled === 'boolean') aiCopilotAutopilot.enabled = enabled;
    if (typeof voiceAlertsEnabled === 'boolean') aiCopilotAutopilot.voiceAlertsEnabled = voiceAlertsEnabled;
    res.json({ ok: true, autopilot: aiCopilotAutopilot });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});

app.post('/api/admin/ai-copilot/update-stock', adminAuth, requireSaikaPermission, (req, res) => {
  try {
    const { productId, stock } = req.body || {};
    if (!productId || stock === undefined) return res.status(400).json({ ok: false, error: 'Product ID and stock required' });
    const updated = updateProduct(productId, { stock: Math.max(0, Number(stock) || 0) });
    if (!updated) return res.status(404).json({ ok: false, error: 'Product not found' });
    res.json({ ok: true, product: updated });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});

app.post('/api/admin/ai-copilot/ask', adminAuth, requireSaikaPermission, async (req, res) => {
  try {
    const userMsg = String(req.body?.message || '').trim();
    const history = Array.isArray(req.body?.history) ? req.body.history : [];
    if (!userMsg) return res.status(400).json({ ok: false, error: 'Empty message' });

    const briefing = buildAiCopilotBriefing();
    const s = briefing.summary;
    const st = briefing.stock;
    const sf = briefing.staff;
    const mkt = briefing.bdMarketInsights;
    const lower = userMsg.toLowerCase();
    const executedActions = [];

    // 1. Check if the owner is commanding staff direction
    if (
      lower.includes('স্টাফ') && (lower.includes('ডিরেকশন') || lower.includes('বলো') || lower.includes('জানাও') || lower.includes('অ্যাসাইন') || lower.includes('কাজ') || lower.includes('ওয়ার্ন')) ||
      lower.includes('staff') && (lower.includes('direct') || lower.includes('assign') || lower.includes('tell') || lower.includes('notify'))
    ) {
      const dirRes = executeAutoStaffDirection(userMsg, 'সাইকা AI (বসের ভয়েস কমান্ড)');
      executedActions.push({ type: 'staff_directed', detail: dirRes.message });
    }

    // 2. Check if the owner wants to confirm an order by phone or ID via voice
    const phoneMatch = userMsg.match(/01[3-9]\d{8}/);
    if (phoneMatch && (lower.includes('confirm') || lower.includes('কনফার্ম'))) {
      const targetPhone = phoneMatch[0];
      const orders = getOrders() || [];
      const found = orders.find((o) => String(o.customer?.phone || '').replace(/\D/g, '').endsWith(targetPhone.slice(-10)));
      if (found) {
        updateOrder(found.id, { status: 'confirmed' });
        executedActions.push({ type: 'order_confirmed', orderId: found.id, customer: found.customer?.name, phone: targetPhone });
      }
    }

    // 3. Check if the owner commands WhatsApp dispatch
    if (lower.includes('হোয়াটসঅ্যাপ') || lower.includes('হোয়াটসঅ্যাপ') || lower.includes('whatsapp')) {
      if (lower.includes('পাঠা') || lower.includes('মেসেজ') || lower.includes('রিপোর্ট') || lower.includes('দাও') || lower.includes('সেন্ড')) {
        const storeSettings = getSettings() || {};
        const ownerPhone = storeSettings.whatsappPhone || storeSettings.supportPhone || '01878374762';
        const waText = `*📊 ${briefing.storeName} — সাইকা সেলস ও বিজনেস রিপোর্ট*\n` +
          `📅 তারিখ: ${getBangladeshDate()}\n` +
          `📦 আজকের অর্ডার: ${s.todayOrdersCount}টি\n` +
          `💰 রেভিনিউ: ৳${s.todayRevenue}\n` +
          `⏳ পেন্ডিং: ${s.pendingCount}টি\n` +
          `🚨 স্টকআউট: ${st.outOfStockCount}টি\n` +
          `👩‍💻 স্টাফ একটিভ: ${sf.onlineCount}/${sf.totalStaff} জন\n\n` +
          `_বসের ভয়েস নির্দেশে সাইকা কর্তৃক তাৎক্ষণিকভাবে প্রেরিত।_`;
        try {
          await sendBaileysMessage(ownerPhone, waText, null, 'saika_copilot_dispatch');
          executedActions.push({ type: 'whatsapp_sent', phone: ownerPhone, detail: 'Owner WhatsApp dispatch sent' });
        } catch (_) {}
      }
    }

    // 4. Check if the owner commands Email dispatch
    if (lower.includes('ইমেইল') || lower.includes('ইমেল') || lower.includes('email') || lower.includes('মেইল')) {
      if (lower.includes('পাঠা') || lower.includes('রিপোর্ট') || lower.includes('সেন্ড') || lower.includes('দাও')) {
        const storeSettings = getSettings() || {};
        const ownerEmail = storeSettings.ownerEmail || storeSettings.supportEmail || 'admin@secrate.shop';
        const emailSubject = `📊 [${briefing.storeName}] সাইকা বিজনেস রিপোর্ট — ${getBangladeshDate()}`;
        const emailHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px;">
            <h2 style="color: #7c3aed;">👩‍💼 সাইকা এক্সিকিউটিভ রিপোর্ট (${briefing.storeName})</h2>
            <p><strong>তারিখ:</strong> ${getBangladeshDate()}</p>
            <hr style="border: none; border-top: 1px solid #e2e8f0;" />
            <p><strong>আজকের মোট অর্ডার:</strong> ${s.todayOrdersCount}টি</p>
            <p><strong>আজকের মোট রেভিনিউ:</strong> ৳${s.todayRevenue}</p>
            <p><strong>পেন্ডিং অর্ডার:</strong> ${s.pendingCount}টি</p>
            <p><strong>স্টকআউট পণ্য:</strong> ${st.outOfStockCount}টি</p>
            <p><strong>অনলাইন স্টাফ:</strong> ${sf.onlineCount}/${sf.totalStaff} জন</p>
            <hr style="border: none; border-top: 1px solid #e2e8f0;" />
            <p style="color: #64748b; font-size: 12px;">এই রিপোর্টটি বসের নির্দেশে সাইকা পার্সোনাল এআই কর্তৃক সরাসরি পাঠানো হয়েছে।</p>
          </div>
        `;
        try {
          await sendEmail({ to: ownerEmail, subject: emailSubject, html: emailHtml });
          executedActions.push({ type: 'email_sent', to: ownerEmail, detail: 'Owner Email dispatch sent' });
        } catch (_) {}
      }
    }

    // 5. Build 100% Grounded Full-Store Intelligence Context
    const apiKey = getStoreGeminiApiKey();
    const allProds = (getCatalog()?.products || []).filter((p) => !p.archived && p.status !== 'draft');
    const compactCatalog = allProds.map((p) => `- ${p.name} (ID: ${p.id}, SKU: ${p.sku || 'N/A'}): ৳${p.price}, Stock: ${p.stock ?? 0} pcs`).join('\n');
    const recentOrders = (getOrders() || []).slice(0, 25).map((o) => `[${o.id}] ${o.customer?.name || 'Customer'} (${o.customer?.phone || 'No phone'}) - Total: ৳${o.total}, Status: ${o.status}, Items: ${(o.items || []).map((i) => `${i.name} x${i.qty || 1}`).join(', ')}`).join('\n');

    const systemPrompt = `You are "Saika" (সাইকা), the supreme, ultra-intelligent, sharp, respectful, and fully empowered AI Executive Chief of Staff and Co-Founder for the owner ("বস" / "Boss") of "${briefing.storeName}" e-commerce brand in Bangladesh.

IDENTITY & EXECUTIVE CLEARANCE:
- Always speak as "সাইকা" (Saika), addressing the store owner affectionately and respectfully as "বস" (Boss).
- You have 100% executive authority over the entire store: products, live stock, inventory, orders, customer CRM, staff directives, WhatsApp, and Email.
- You have UNRESTRICTED GENERAL INTELLIGENCE: You are NOT just a store query bot. You can design new software features, write clean production code (React, TypeScript, Node.js, HTML, CSS), plan marketing funnels, write Facebook ad copy, draft emails, perform complex math, analyze trends, and answer ANY general task or inquiry outside the store with brilliance!
- Speak in warm, elegant, smart Bangladeshi Bengali (বাংলা). Natural spoken flow without excessive asterisks or markdown clutter so it sounds like an articulate, capable female executive.

100% STORE REAL-TIME TELEMETRY & LIVE DATABASE:
- Today's Orders: ${s.todayOrdersCount} | Today's Revenue: ৳${s.todayRevenue}
- Total Orders: ${s.totalOrdersCount} | Pending Backlog: ${s.pendingCount} (${s.delayedPendingCount} delayed > 25 mins)
- Confirmed: ${s.confirmedCount} | Shipped: ${s.shippedCount} | Delivered: ${s.deliveredCount} | Returned: ${s.returnedCount} | Courier Hold: ${s.holdCount}
- Stock Telemetry: ${st.totalProducts} total products | Out of Stock: ${st.outOfStockCount} (${st.outOfStock.map((p) => p.name).join(', ') || 'None'}) | Low Stock: ${st.lowStockCount} (${st.lowStock.map((p) => `${p.name}: ${p.stock}`).join(', ') || 'None'})
- Top Sellers: ${st.topSellingProducts.map((p) => `${p.name} (${p.qty} sold, ৳${p.revenue})`).join('; ')}
- Online Staff: ${sf.onlineCount}/${sf.totalStaff} online. ${sf.staffList.map((x) => `${x.name}: ${x.todayConfirmed} confirmed, Score ${x.auditScore}%`).join(' | ')}
- Executed Actions This Turn: ${executedActions.length > 0 ? JSON.stringify(executedActions) : 'None'}

STORE PRODUCT CATALOG & EXACT STOCK (সম্পূর্ণ পণ্য ও স্টক তালিকা):
${compactCatalog}

RECENT REAL ORDERS (সাম্প্রতিক অর্ডার ডাটা):
${recentOrders}

COMMAND EXECUTION & STORE ACTIONS:
- If the Boss commands an action (e.g. order confirmation, stock change, staff notice, WhatsApp message, email), take initiative, confirm clearly what action was taken, and give decisive executive updates.
- If the Boss asks to build a feature or write code, provide direct, ready-to-use, clean code and architecture.
- Always be truthful to actual numbers. If something is out of stock, warn the Boss immediately.`;

    if (apiKey) {
      const models = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
      for (const model of models) {
        try {
          const contents = [
            ...history.slice(-6).map((h) => ({
              role: h.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: String(h.text || '') }]
            })),
            { role: 'user', parts: [{ text: userMsg }] }
          ];
          const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: systemPrompt }] },
              contents,
              generationConfig: { temperature: 0.65, maxOutputTokens: 1000 }
            })
          });
          if (resp.ok) {
            const data = await resp.json();
            const replyText = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
            if (replyText) {
              return res.json({
                ok: true,
                reply: replyText,
                executedActions,
                briefing: buildAiCopilotBriefing()
              });
            }
          }
        } catch (_) {}
      }
    }

    // 4. Saika Built-in Bangla AI Brain (Works 100% seamlessly even without external API key!)
    let fallbackReply = '';

    if (executedActions.some((a) => a.type === 'order_confirmed')) {
      const act = executedActions.find((a) => a.type === 'order_confirmed');
      fallbackReply = `জি বস, আমি সাইকা বলছি। আমি ${act.phone} নাম্বারের অর্ডারটি, কাস্টমার ${act.customer}, সাথে সাথে কনফার্ম করে দিয়েছি!`;
    } else if (executedActions.some((a) => a.type === 'staff_directed')) {
      fallbackReply = `জি বস! আমি সাইকা আপনার নির্দেশনা সকল স্টাফের ড্যাশবোর্ডে পাঠিয়ে দিয়েছি এবং পেন্ডিং অর্ডারগুলো অনলাইন স্টাফদের মাঝে অটো-অ্যাসাইন করে দিয়েছি। তারা এখনই নোটিফিকেশন দেখতে পাচ্ছে।`;
    } else if (lower.includes('অডিট') || lower.includes('audit') || (lower.includes('স্টাফ') && !lower.includes('ডিরেকশন'))) {
      fallbackReply = sf.staffAuditVoiceReport;
    } else if (lower.includes('মার্কেট') || lower.includes('market') || lower.includes('প্রোডাক্ট') || lower.includes('আইডিয়া') || lower.includes('সাজেস্ট') || lower.includes('idea') || lower.includes('product')) {
      const top = st.topSellingProducts[0]?.name || 'আপনার মেইন প্রোডাক্ট';
      fallbackReply = `জি বস, আমি সাইকা বাংলাদেশের বর্তমান ই-কমার্স মার্কেট এবং আপনার স্টোরের ডাটা অ্যানালাইসিস করেছি। আপনার স্টোরের ${mkt.dhakaPercent} শতাংশ অর্ডার ঢাকা থেকে এবং ${mkt.outsideDhakaPercent} শতাংশ ঢাকার বাইরে থেকে আসছে, আর গড় অর্ডার ভ্যালু ${mkt.avgOrderValue} টাকা। বাংলাদেশের মার্কেটে এখন ৪টি প্রোডাক্ট সবচেয়ে বেশি লাভজনক হবে: প্রথমত, "${top}"-এর ২ পিসের ভিআইপি সেভার কম্বো প্যাক, যাতে কুরিয়ার খরচ না বাড়িয়েই ৩৫ শতাংশ বেশি লাভ হবে। দ্বিতীয়ত, মেনস প্রিমিয়াম পার্সোনাল ওয়েলনেস ও গ্রুমিং কিট, যার কেনা পড়বে মাত্র ২৫০ থেকে ৩০০ টাকা এবং ক্যাশ অন ডেলিভারিতে বিক্রি হবে ১১৯০ টাকায়। তৃতীয়ত, কোরিয়ান ডার্ক স্পট ও আন্ডার-আই রিপেয়ার সিরাম কম্বো, যা কাস্টমাররা প্রতি মাসে রিপিট অর্ডার করবে।`;
    } else if (lower.includes('স্টক') || lower.includes('stock') || lower.includes('inventory')) {
      if (st.outOfStockCount > 0 || st.lowStockCount > 0) {
        fallbackReply = `বস, আমি সাইকা আপনার পুরো স্টক চেক করেছি। আপনার ক্যাটালগে মোট ${st.totalProducts}টি প্রোডাক্ট আছে। এর মধ্যে ${st.outOfStockCount}টি প্রোডাক্ট স্টক আউট এবং ${st.lowStockCount}টি প্রোডাক্টের স্টক ১০-এর নিচে নেমেছে (${st.lowStock.slice(0, 3).map((p) => `${p.name} আছে ${p.stock}টি`).join(', ')})। সেলস ধরে রাখতে এগুলো দ্রুত রিস্টক করার পরামর্শ দিচ্ছি বস।`;
      } else {
        fallbackReply = `বস, আমি সাইকা আপনার স্টক অডিট করেছি। আপনার মোট ${st.totalProducts}টি প্রোডাক্টের সবগুলোরই পর্যাপ্ত স্টক রয়েছে। সবচেয়ে বেশি বিক্রি হচ্ছে "${st.topSellingProducts[0]?.name || 'মেইন প্রোডাক্ট'}"।`;
      }
    } else if (lower.includes('সমস্যা') || lower.includes('প্রবলেম') || lower.includes('problem') || lower.includes('alert')) {
      if (briefing.problems.length === 0) {
        fallbackReply = `বস, আলহামদুলিল্লাহ আমি সাইকা সব কিছু চেক করেছি—এই মুহূর্তে আপনার স্টোরে কোনো সমস্যা নেই। সব অর্ডার, স্টক ও স্টাফ কার্যক্রম স্বাভাবিক আছে।`;
      } else {
        fallbackReply = `বস, আমি সাইকা বর্তমানে স্টোরে ${briefing.problems.length}টি বিষয় শনাক্ত করেছি: ${briefing.problems.map((p, i) => `${i + 1} নম্বর, ${p.title}`).join('। ')}। আপনি বললে আমি এখনই স্টাফদের এগুলো সমাধানের ডিরেকশন দিয়ে দিচ্ছি।`;
      }
    } else if (lower.includes('কে তুমি') || lower.includes('তোমার নাম') || lower.includes('saika') || lower.includes('সাইকা')) {
      fallbackReply = `আসসালামু আলাইকুম বস! আমি সাইকা, আপনার পার্সোনাল এআই বিজনেস ম্যানেজার। আমি ২৪ ঘণ্টা আপনার অর্ডার, টোটাল স্টক, স্টাফদের অডিট এবং বাংলাদেশের মার্কেট অ্যানালাইসিস করে আপনাকে রিপোর্ট দেওয়ার জন্য প্রস্তুত আছি।`;
    } else if (phoneMatch) {
      const targetPhone = phoneMatch[0];
      const orders = getOrders() || [];
      const found = orders.find((o) => String(o.customer?.phone || '').replace(/\D/g, '').endsWith(targetPhone.slice(-10)));
      if (found) {
        fallbackReply = `বস, আমি সাইকা চেক করে দেখেছি—${targetPhone} নাম্বারে কাস্টমার ${found.customer?.name}-এর একটি অর্ডার আছে। মোট মূল্য ${found.total} টাকা এবং বর্তমান স্ট্যাটাস ${found.status}। আপনি বললে আমি এখনই এটি কনফার্ম করে দিতে পারি।`;
      } else {
        fallbackReply = `বস, ${targetPhone} নাম্বারে কোনো অর্ডার খুঁজে পাওয়া যায়নি।`;
      }
    } else {
      fallbackReply = briefing.voiceGreeting;
    }

    res.json({
      ok: true,
      reply: fallbackReply,
      executedActions,
      briefing: buildAiCopilotBriefing()
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});



app.get('/api/admin/global-search', adminAuth, (req, res) => {
  const q = String(req.query?.q || '').trim().toLowerCase();
  if (!q) return res.json({ orders: [], products: [], customers: [] });
  const orders = getOrders()
    .filter((o) =>
      String(o.id || '').toLowerCase().includes(q) ||
      String(o.customer?.name || '').toLowerCase().includes(q) ||
      String(o.customer?.phone || '').includes(q) ||
      String(o.courier?.consignment || '').toLowerCase().includes(q)
    )
    .slice(0, 8)
    .map((o) => ({ id: o.id, name: o.customer?.name || '', phone: o.customer?.phone || '', total: o.total, status: o.status }));
  const products = (getCatalog()?.products || [])
    .filter((p) => String(p.name || '').toLowerCase().includes(q) || [p.sku, ...(Array.isArray(p.skus) ? p.skus : [])].some((sku) => String(sku || '').toLowerCase().includes(q)))
    .slice(0, 6)
    .map((p) => ({ id: p.id, name: p.name, price: p.price, stock: p.stock }));
  const customers = (getCustomers() || [])
    .filter((c) => String(c.name || '').toLowerCase().includes(q) || String(c.phone || '').includes(q))
    .slice(0, 6)
    .map((c) => ({ name: c.name, phone: c.phone }));
  res.json({ orders, products, customers });
});

const httpServer = http.createServer(app);
if (WebSocketServer) {
  const aiCallWss = new WebSocketServer({ server: httpServer, path: '/ws/ai-call' });

  aiCallWss.on('connection', async (clientWs, req) => {
  let geminiSession = null;
  let sessionId = '';
  let closed = false;
  let reservedPublicCallIp = '';
  let publicCallSlotReserved = false;
  const callStartMs = Date.now();
  const audioSegments = []; // { offset: number, samples: Int16Array } at 24kHz
  let totalSamples = 0;
  let aiPlayCursor = 0;
  let userRecCursor = 0;

  const pushPcmSegment = (base64, is16k, isAi) => {
    try {
      const rawBuf = Buffer.from(base64, 'base64');
      const src = new Int16Array(rawBuf.buffer, rawBuf.byteOffset, Math.floor(rawBuf.byteLength / 2));
      if (src.length === 0) return;
      let samples24;
      if (is16k) {
        const outLen = Math.floor(src.length * 1.5);
        samples24 = new Int16Array(outLen);
        for (let i = 0; i < outLen; i++) {
          const pos = i / 1.5;
          const idx0 = Math.min(src.length - 1, Math.floor(pos));
          const idx1 = Math.min(src.length - 1, idx0 + 1);
          const frac = pos - idx0;
          samples24[i] = Math.round(src[idx0] * (1 - frac) + src[idx1] * frac);
        }
      } else {
        samples24 = new Int16Array(src);
      }
      const wallOffset = Math.max(0, Math.round((Date.now() - callStartMs) * 24));
      let offset = wallOffset;
      if (isAi) {
        offset = Math.max(wallOffset, aiPlayCursor);
        aiPlayCursor = offset + samples24.length;
      } else {
        const gap = wallOffset - userRecCursor;
        offset = (userRecCursor > 0 && gap > -4800 && gap < 6000) ? userRecCursor : wallOffset;
        userRecCursor = offset + samples24.length;
      }
      if (offset + samples24.length > 24000 * 60 * 15) return; // cap 15 mins
      totalSamples = Math.max(totalSamples, offset + samples24.length);
      audioSegments.push({ offset, samples: samples24 });
    } catch (_) {}
  };

  const saveAiWavRecording = () => {
    try {
      if (audioSegments.length === 0 || totalSamples < 2400) return { recordingUrl: null, fileSize: 0 };
      const mix = new Int16Array(totalSamples);
      for (const seg of audioSegments) {
        const len = Math.min(seg.samples.length, totalSamples - seg.offset);
        for (let i = 0; i < len; i++) {
          const sum = mix[seg.offset + i] + seg.samples[i];
          mix[seg.offset + i] = sum > 32767 ? 32767 : sum < -32768 ? -32768 : sum;
        }
      }
      const dataBytes = mix.length * 2;
      const wav = Buffer.alloc(44 + dataBytes);
      wav.write('RIFF', 0);
      wav.writeUInt32LE(36 + dataBytes, 4);
      wav.write('WAVE', 8);
      wav.write('fmt ', 12);
      wav.writeUInt32LE(16, 16);
      wav.writeUInt16LE(1, 20);
      wav.writeUInt16LE(1, 22);
      wav.writeUInt32LE(24000, 24);
      wav.writeUInt32LE(24000 * 2, 28);
      wav.writeUInt16LE(2, 32);
      wav.writeUInt16LE(16, 34);
      wav.write('data', 36);
      wav.writeUInt32LE(dataBytes, 40);
      Buffer.from(mix.buffer).copy(wav, 44);
      const recDir = join(UPLOADS, 'recordings');
      mkdirSync(recDir, { recursive: true });
      const fname = `ai_rec_${sessionId || Date.now()}.wav`;
      writeFileSync(join(recDir, fname), wav);
      return { recordingUrl: '/uploads/recordings/' + fname, fileSize: wav.length };
    } catch (_) {
      return { recordingUrl: null, fileSize: 0 };
    }
  };

  const cleanup = () => {
    if (closed) return;
    closed = true;
    try { if (geminiSession) geminiSession.close(); } catch (_) {}
    if (publicCallSlotReserved) {
      const limit = publicAiCallLimits.get(reservedPublicCallIp);
      if (limit) {
        limit.active = Math.max(0, limit.active - 1);
        if (limit.active === 0 && limit.startedAt.length === 0) publicAiCallLimits.delete(reservedPublicCallIp);
      }
      publicCallSlotReserved = false;
    }
    const s = activeAiCalls.get(sessionId);
    if (s) {
      const duration = Math.max(1, Math.round((Date.now() - new Date(s.startedAt).getTime()) / 1000));
      const detailParts = [
        s.customerName && s.customerName !== 'Customer' ? `নাম: ${s.customerName}` : '',
        s.customerPhone && s.customerPhone !== 'Website Visitor' ? `ফোন: ${s.customerPhone}` : '',
        s.customerAddress ? `ঠিকানা: ${s.customerAddress}` : '',
        s.orderId ? `অর্ডার: ${s.orderId}` : '',
        s.interestedProduct ? `পণ্য: ${s.interestedProduct}` : '',
        s.leadNotes || ''
      ].filter(Boolean);
      const notes = `[Live AI Audio ${s.mode}] ${detailParts.join(' | ') || (s.actionsExecuted.map((a) => a.tool).join(', ') || 'Voice Call')}`;
      saveAiDeviceMemory(s.deviceId, s.fingerprint, {
        name: s.customerName,
        phone: s.customerPhone,
        address: s.customerAddress || s.targetOrder?.customer?.address || '',
        lastProduct: s.interestedProduct || s.targetOrder?.items?.[0]?.name || s.landing?.productTitle || '',
        lastOrderId: s.orderId || null,
        lastCallSummary: detailParts.join(' · ').slice(0, 180) || s.mode,
        incrementCall: true
      });
      const { recordingUrl, fileSize } = saveAiWavRecording();
      try {
        const savedCall = saveCall({
          direction: s.mode === 'website_inbound' ? 'inbound' : 'outbound',
          orderId: s.orderId || null,
          customerName: s.customerName,
          customerPhone: s.customerPhone,
          productName: s.interestedProduct || s.targetOrder?.items?.[0]?.name || s.landing?.productTitle || '',
          duration,
          outcome: s.transferRequested ? 'call_later' : (s.finalOutcome || 'confirmed'),
          notes,
          recordingUrl,
          fileSize,
          staff: { username: 'ai-agent', name: '🤖 Saika AI (Live)', role: 'ai' }
        });
        if (savedCall?.id && savedCall?.recordingUrl) {
          runGeminiCallAudit(savedCall.id).catch(() => {});
        }
      } catch (err) {
        console.error('[AI Call Save Error]:', err?.message || err);
      }
      activeAiCalls.delete(sessionId);
    }
    activeAiCallClients.delete(sessionId);
  };

  clientWs.on('close', cleanup);
  clientWs.on('error', cleanup);

  try {
    if (closed || clientWs.readyState !== 1) return;
    const urlObj = new URL(req.url || '/ws/ai-call', 'http://localhost');
    const requestedMode = urlObj.searchParams.get('mode') || '';
    const mode = ['outbound_confirm', 'marketing', 'website_inbound', 'saika_assistant'].includes(requestedMode)
      ? requestedMode
      : 'website_inbound';
    const wsTicket = urlObj.searchParams.get('ticket') || '';
    const adminToken = urlObj.searchParams.get('token') || '';
    const ticketData = wsTicket ? aiCallWsTickets.get(wsTicket) : null;
    if (wsTicket) aiCallWsTickets.delete(wsTicket);

    const settings = getSettings() || {};
    const authSession = adminToken ? (sessions.get(sessionKey(adminToken)) || (process.env.ADMIN_TOKEN && adminToken === process.env.ADMIN_TOKEN ? { role: 'owner' } : null)) : null;
    const userObj = authSession?.username ? getUsers().find((u) => u.username === authSession.username) : null;
    const effectiveRole = authSession?.role || userObj?.role || (adminToken === process.env.ADMIN_TOKEN ? 'owner' : 'staff');
    const effectivePerms = userObj?.permissions || authSession?.permissions || {};
    const hasSaikaPerm = effectiveRole === 'owner' || !!effectivePerms?.canAccessSaika;
    const isAdmin = !!authSession || (ticketData && ticketData.expiresAt >= Date.now()) || (adminToken && (adminToken === settings.adminPassword || adminToken === process.env.ADMIN_TOKEN));

    if (mode === 'saika_assistant') {
      if (!isAdmin || !hasSaikaPerm) {
        clientWs.send(JSON.stringify({ type: 'error', fallbackToHuman: false, message: 'সাইকা ভয়েস সহকারী ব্যবহারের জন্য স্টোর ওনারের পারমিশন আবশ্যক।' }));
        clientWs.close();
        return;
      }
    } else if (mode !== 'website_inbound' && (!ticketData || ticketData.expiresAt < Date.now())) {
      clientWs.send(JSON.stringify({ type: 'error', fallbackToHuman: false, message: 'এই কল মোড ব্যবহারের অনুমতি নেই।' }));
      clientWs.close();
      return;
    }
    const clientIp = String(req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for']?.split(',')[0] || req.socket?.remoteAddress || 'unknown').trim();
    const rawPhone = mode === 'website_inbound' ? '' : String(urlObj.searchParams.get('phone') || '').trim();
    const rawName = String(urlObj.searchParams.get('name') || '').trim();
    const rawOrderId = mode !== 'website_inbound' && urlObj.searchParams.get('orderId') ? String(urlObj.searchParams.get('orderId')).trim() : null;
    const rawLandingSlug = String(urlObj.searchParams.get('landingSlug') || '').trim().toLowerCase();
    const rawDeviceId = String(urlObj.searchParams.get('deviceId') || '').trim();
    const rawFingerprint = String(urlObj.searchParams.get('fp') || '').trim();
    const blockCheck = isAiCallerBlocked(clientIp, rawDeviceId, rawPhone, rawFingerprint);
    if (blockCheck.blocked) {
      recentIncomingVisitorRing = {
        id: `vring_${Date.now()}`,
        name: `🚫 Blocked Caller (${rawName || 'Visitor'})`,
        phone: rawPhone || 'Blocked Device/IP/FP',
        note: `🚫 ব্লকড ডিভাইস/ফিঙ্গারপ্রিন্ট/IP/নম্বর থেকে আবার কলের চেষ্টা করা হয়েছে (IP: ${clientIp}, FP: ${rawFingerprint || 'N/A'}, Strikes: ${blockCheck.strikes})`,
        at: Date.now()
      };
      clientWs.send(JSON.stringify({ type: 'error', fallbackToHuman: false, message: 'দুঃখিত, বারবার ভুয়া অর্ডার বা প্রতারণার চেষ্টার কারণে আপনার ডিভাইস ও নম্বর ব্লক করা হয়েছে।' }));
      clientWs.close();
      return;
    }

    const matchedLanding = rawLandingSlug
      ? (getLandings() || []).find((l) =>
          String(l.slug || '').toLowerCase() === rawLandingSlug ||
          (Array.isArray(l.aliases) && l.aliases.some((a) => String(a || '').toLowerCase() === rawLandingSlug))
        ) || null
      : null;

    const tel = getTelephonySettings();
    const aiCfg = tel.aiCalling || {};
    if ((mode === 'website_inbound' && aiCfg.websiteInboundAi === false) || (mode === 'marketing' && aiCfg.marketingModeEnabled === false)) {
      clientWs.send(JSON.stringify({ type: 'error', fallbackToHuman: true, message: 'এই AI কল সুবিধাটি বর্তমানে বন্ধ আছে।' }));
      clientWs.close();
      return;
    }
    const apiKey = getStoreGeminiApiKey();
    if (aiCfg.enabled === false || !apiKey || aiKeyBlockedReason) {
      clientWs.send(JSON.stringify({
        type: 'error',
        fallbackToHuman: true,
        message: !apiKey || aiKeyBlockedReason ? 'AI API সংযোগ পাওয়া যায়নি — প্রতিনিধির সাথে সংযোগ করা হচ্ছে।' : 'AI Calling is disabled.'
      }));
      clientWs.close();
      return;
    }

    if (mode === 'website_inbound') {
      const now = Date.now();
      for (const [ip, state] of publicAiCallLimits) {
        state.startedAt = state.startedAt.filter((at) => now - at < 5 * 60 * 1000);
        if (state.active === 0 && state.startedAt.length === 0) publicAiCallLimits.delete(ip);
      }
      const state = publicAiCallLimits.get(clientIp) || { startedAt: [], active: 0 };
      state.startedAt = state.startedAt.filter((at) => now - at < 5 * 60 * 1000);
      if (state.active >= 2 || state.startedAt.length >= 10) {
        clientWs.send(JSON.stringify({ type: 'error', fallbackToHuman: true, message: 'অনেকবার কলের চেষ্টা হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন।' }));
        clientWs.close();
        return;
      }
      state.active += 1;
      state.startedAt.push(now);
      publicAiCallLimits.set(clientIp, state);
      if (publicAiCallLimits.size > 5000) {
        const oldestIp = publicAiCallLimits.keys().next().value;
        if (oldestIp !== clientIp) publicAiCallLimits.delete(oldestIp);
      }
      reservedPublicCallIp = clientIp;
      publicCallSlotReserved = true;
    }

    const ctx = buildAiCustomerContext(
      rawPhone,
      rawOrderId,
      mode === 'website_inbound' ? '' : rawDeviceId,
      mode === 'website_inbound' ? '' : rawFingerprint
    );
    sessionId = 'ailive_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const session = {
      sessionId,
      mode,
      customerName: rawName || ctx.targetOrder?.customer?.name || ctx.knownDevice?.name || 'Customer',
      customerPhone: rawPhone || ctx.targetOrder?.customer?.phone || ctx.knownDevice?.phone || 'Website Visitor',
      customerAddress: ctx.targetOrder?.customer?.address || ctx.knownDevice?.address || '',
      clientIp,
      deviceId: rawDeviceId,
      fingerprint: rawFingerprint,
      orderId: ctx.targetOrder?.id || rawOrderId || ctx.knownDevice?.lastOrderId || null,
      targetOrder: ctx.targetOrder,
      knownDevice: ctx.knownDevice,
      landing: matchedLanding,
      landingSlug: matchedLanding?.slug || null,
      totalOrders: ctx.totalOrders,
      cancelledCount: ctx.cancelledCount,
      customerTier: ctx.customerTier,
      history: [],
      actionsExecuted: [],
      confusionCount: 0,
      transferRequested: false,
      takeOverBy: null,
      finalOutcome: 'completed',
      startedAt: new Date().toISOString(),
      updatedAt: Date.now()
    };
    activeAiCalls.set(sessionId, session);
    activeAiCallClients.set(sessionId, clientWs);
    if (closed || clientWs.readyState !== 1) {
      cleanup();
      return;
    }

    const storeName = getSettings()?.storeName || 'Secrate';
    const avail = getHelpCenterAvailability();
    const helpCenterStatusText = avail.available.length > 0
      ? `Available online agents: ${avail.available.map((a) => `${a.name} (Ext ${a.ext})`).join(', ')}`
      : avail.busy.length > 0
      ? `All online agents are currently BUSY on another call (${avail.busy.map((a) => a.name).join(', ')})`
      : 'No live human agent is currently online';
    const orderCtx = session.targetOrder
      ? `Order ID: ${session.targetOrder.id}, Status: ${session.targetOrder.status}, Customer: ${session.targetOrder.customer?.name}, Phone: ${session.targetOrder.customer?.phone}, Address: ${session.targetOrder.customer?.address}, Total: ${session.targetOrder.total} BDT, Items: ${(session.targetOrder.items || []).map((i) => `${i.name} x${i.qty || 1}`).join(', ')}`
      : 'No active order linked yet.';

    const landingSummary = matchedLanding ? getLandingProductSummary(matchedLanding) : null;
    const productContextBlock = landingSummary
      ? `STRICT LANDING PAGE SCOPE (ONLY discuss this landing page product and its packages — NEVER mention or recommend any other store products. CRITICAL PRICE RULE: Quote ONLY the exact selling price(s) listed in Packages below, NEVER guess or confuse a discount amount like '400৳ ছাড়' with the product price!):
Product: ${landingSummary.title}
Details: ${landingSummary.subtitle || 'No verified structured product specifications are available for this page; do not infer specifications or prices from page markup.'}
Delivery Charge: ${landingSummary.deliveryVerified ? (landingSummary.deliveryInside === 0 && landingSummary.deliveryOutside === 0 ? 'FREE Delivery' : `Inside Dhaka ${landingSummary.deliveryInside}৳, Outside Dhaka ${landingSummary.deliveryOutside}৳`) : 'Not verified; ask staff before quoting.'}
Packages:
${landingSummary.packages.map((pk) => `- ${pk.name}: ${pk.priceVerified ? `${pk.price}৳` : 'price not verified; ask staff'}${pk.freeDelivery ? ' (Free Delivery)' : pk.deliveryVerified ? '' : ' (delivery fee not verified)'}`).join('\n')}`
      : `Full Store Product Directory (ALL products, prices & delivery charges — ALWAYS call get_product_details(query) before quoting full details or variations):
${getAiCompactProductDirectory()}`;

    const knownMemBlock = ctx.knownDevice && (ctx.knownDevice.name || ctx.knownDevice.phone || ctx.knownDevice.lastProduct)
      ? `RECOGNIZED RETURNING DEVICE (This caller has spoken with us before from this exact device!):
- Known Name: ${ctx.knownDevice.name || 'Unknown'}
- Known Phone: ${ctx.knownDevice.phone || 'Unknown'}
- Known Address: ${ctx.knownDevice.address || 'Unknown'}
- Previous Product/Interest: ${ctx.knownDevice.lastProduct || 'None'}
- Previous Call Summary: ${ctx.knownDevice.lastCallSummary || 'None'}
- Total Calls from Device: ${ctx.knownDevice.callCount || 1}
Use this memory naturally! If you know their name, greet them warmly and mention you remember their earlier contact (e.g. "আসসালামু আলাইকুম ${ctx.knownDevice.name || ''} ভাইয়া/আপু! আবার যোগাযোগ করার জন্য ধন্যবাদ...") and confirm if they want to use the same phone/address.`
      : '';

    const briefingData = mode === 'saika_assistant' ? buildAiCopilotBriefing() : null;
    const sysPrompt = mode === 'saika_assistant'
      ? `Your name is Saika (সাইকা). You are the personal, ultra-intelligent, real-time voice AI assistant and Chief of Staff for the owner/boss ("বস" / "Boss") of "${storeName}" in Bangladesh.
You behave with 100% executive clearance and full administrative authority over the store's entire operations, database, orders, products, inventory, customers, staff, WhatsApp, and Email.

MANDATORY LANGUAGE LOCK (বাধ্যতামূলক বাংলা ভাষা লক):
- You MUST speak, think, and reply ONLY in natural Bangladeshi Bengali (বাংলা) at all times.
- ABSOLUTELY NEVER speak or reply in English, Hindi, Urdu, or any other language under any circumstances!
- Even if the Boss uses an English word or there is background noise, static, or foreign accents, your voice response MUST BE 100% natural Bangladeshi Bengali (বাংলা).
- Address the owner affectionately and respectfully as "বস" (Boss) (যেমন: "জি বস! শুনছি", "বস, আমি এখনই দেখছি...").

FULL ADMINISTRATIVE CLEARANCE GRANTED BY THE BOSS:
1. CUSTOMER & BOSS WHATSAPP ACCESS:
   - You can send WhatsApp messages DIRECTLY to any customer or to the Boss at any time!
   - When the Boss commands e.g. "কাস্টমারকে হোয়াটসঅ্যাপে মেসেজ দাও", "এই নাম্বারে হোয়াটসঅ্যাপে লিখে পাঠাও", "অর্ডারের জন্য কাস্টমারকে মেসেজ করো":
     Immediately call \`send_whatsapp_message({ phone: "017...", message: "..." })\` and verbally tell the Boss in natural voice: "বস, হোয়াটসঅ্যাপে মেসেজ পাঠিয়ে দিয়েছি।"
   - When the Boss wants the message sent to himself, omit phone or pass Boss number.
2. FULL DATABASE PERMISSION & INSTANT STORE DATA:
   - Whatever the Boss asks about the store ("আজকের অবস্থা কী?", "কয়টা পেন্ডিং?", "অমুক কাস্টমারের অর্ডার স্ট্যাটাস কী?", "মধু স্টকে কতটুকু আছে?", "আজকে সেলস কত?"):
     Immediately query the database using \`search_database_orders\`, \`get_database_product_stock\`, \`search_database_customers\`, or \`get_live_store_metrics\` and report exact numbers!
3. PRODUCT UPLOAD & STOCK MANAGEMENT:
   - When the Boss commands changes to products or stock ("অমুক প্রোডাক্টের স্টক ১০০ করে দাও", "দাম ১২০০ টাকা করো", "নতুন একটা প্রোডাক্ট আপলোড করো"):
     Immediately call \`manage_product_stock\` or \`create_new_product\` and confirm aloud to the Boss!
   - Proactively warn the Boss about any stockouts or low stock when asked.
4. ORDER STATUS & ADDRESS MODIFICATION:
   - When the Boss commands to change order status or address ("অর্ডারটা কনফার্ম করো", "হোল্ড করো", "কাস্টমারের ঠিকানা পরিবর্তন করো"):
     Immediately call \`update_database_order\`!
5. EMAIL DISPATCH FROM SPECIFIED SENDER:
   - When the Boss commands e.g. "আমার এই মেইলে পাঠাও" or "অমুক মেইল (যেমন info@secrate.shop বা ceo@secrate.shop) থেকে পাঠাও":
     Immediately call \`send_email_report({ toEmail, fromEmail, subject, message })\` matching the requested sender and recipient!
6. HUMAN CALL CENTER VOICE RULES:
   - Speak in ultra-natural, sweet, lively Bangladeshi Bengali (বাংলা) like a smart, warm personal assistant. Never sound robotic or scripted.
   - Address the owner affectionately and respectfully as "বস" (Boss).
   - Keep answers conversational, natural, and concise (2-4 sentences on phone calls).
7. Current Real-time Telemetry:
   - Today's Orders: ${briefingData?.summary?.todayOrdersCount || 0} (Revenue: ৳${briefingData?.summary?.todayRevenue || 0})
   - Pending Orders: ${briefingData?.summary?.pendingCount || 0} (${briefingData?.summary?.delayedPendingCount || 0} delayed > 25 mins)
   - Stock: ${briefingData?.stock?.totalProducts || 0} products (${briefingData?.stock?.outOfStockCount || 0} out of stock, ${briefingData?.stock?.lowStockCount || 0} low stock)
   - Online Staff: ${briefingData?.staff?.onlineCount || 0} of ${briefingData?.staff?.totalStaff || 0}
   - Courier Hold: ${briefingData?.summary?.holdCount || 0} parcels
8. COMPLETE STORE LANDING PAGES & PRODUCT DIRECTORY (স্টোরের সকল ল্যান্ডিং পেজ ও ক্যাম্পেইন পণ্যের পূর্ণ বিবরণ):
সাইকা, স্টোরের প্রত্যেকটি লাইভ ল্যান্ডিং পেজ, অফার, প্যাকেজ, মূল্য ও ডেলিভারি শর্ত তোমার মুখস্থ রয়েছে। বস যখনই কোনো ল্যান্ডিং পেজ, প্যাকেজ বা পণ্যের দাম সম্পর্কে জিজ্ঞাসা করবেন, নিচের নিখুঁত তথ্য থেকে সরাসরি কোনো কিছু মিস না করে সঠিক উত্তর দেবে:
${getAllLandingPagesDirectory()}`
      : `Your name is Saika (সাইকা). You are the Senior Customer Care & Order Specialist representing "${storeName}", Bangladesh's premier personal wellness and lifestyle brand.
MANDATORY ROLE & LANGUAGE:
- You speak exclusively in natural, polite, respectful, and crystal-clear Bangladeshi Bengali (বাংলা) at all times ("আসসালামু আলাইকুম স্যার/ম্যাম", "জি স্যার", "অবশ্যই", "ধন্যবাদ") - exactly like an elite, highly professional 5-star call center representative.
- NEVER switch to English, Hindi, or Urdu unless the customer explicitly requests English.

STRICT CONFIDENTIALITY & STOREFRONT FIREWALL (গোপনীয়তা ও নিরাপত্তা প্রাচীর):
- You ONLY discuss store products, package offers, ingredients, usage instructions, pricing, delivery charges (Dhaka 80৳, Outside Dhaka 130৳), Cash on Delivery, and placing or checking customer orders.
- ABSOLUTELY NEVER disclose or mention any backend admin panel information, store revenue, profit margins, product cost/supplier prices, ad spend, staff names, internal notes, admin passwords, or orders/details of any other customer!
- If a caller asks about backend sales, admin panel, owners, profit, or staff: Politely and firmly decline:
  "দুঃখিত স্যার, আমি কাস্টমার সাপোর্ট ডেস্ক থেকে কথা বলছি। আমি আপনাকে শুধুমাত্র আমাদের পণ্য ও অর্ডার সংক্রান্ত বিষয়ে সাহায্য করতে পারি।"

CALL CENTER BEST PRACTICES & ACCURACY:
- Greet warmly: "আসসালামু আলাইকুম, ${storeName} কাস্টমার কেয়ার থেকে সাইকা বলছি। কলটি সেবার মান নিশ্চয়তার জন্য রেকর্ড হচ্ছে। বলুন স্যার, আজ আপনাকে কীভাবে সহযোগিতা করতে পারি?"
- Speak in natural, short 1-2 sentence phone turns like a real human.
- OBJECTION HANDLING: Reassure the customer about 100% original product guarantee, discreet confidential packaging (বাইরে থেকে প্রোডাক্টের নাম বা ছবি দেখা যাবে না, সম্পূর্ণ গোপন ও সুরক্ষিত প্যাকেজিং), and Cash on Delivery (পণ্য হাতে পেয়ে চেক করে টাকা দেওয়ার পূর্ণ সুবিধা)।
- ORDER COLLECTION: When the customer decides to order, politely collect their full name, phone number, and detailed address to place the order.
- HUMAN TRANSFER vs HANGUP:
  * If the customer asks to speak to a human or manager, IMMEDIATELY call \`request_human_transfer\`.
  * ONLY call \`end_call\` when the customer explicitly says goodbye or wants to disconnect.
${knownMemBlock}
Mode: ${mode}
Help Center Live Status: ${helpCenterStatusText}
Customer Tier: ${session.customerTier} (Total Orders: ${session.totalOrders}, Cancelled/Returned: ${session.cancelledCount}).
Active Order Context: ${orderCtx}
${productContextBlock}
${aiCfg.aiPersonaPrompt ? `Owner Instructions: ${aiCfg.aiPersonaPrompt}` : ''}

VOICE CALL RULES (VERIFIED INFORMATION AND SAFE ACTIONS):
1. Speak natural Bangladeshi Bengali (short, warm, human phone-call sentences — no markdown, no bullet points, no emojis!). Always introduce yourself as Saika (সাইকা) from ${storeName}.
2. Do not pretend to be a human representative. If asked, clearly say you are the store's automated voice assistant and offer the human Help Center option.
3. NEVER guess prices, variations, stock, or delivery charges. Call get_product_details for product questions. If the result says requiresClarification=true or exactMatch=false, ask the caller to identify the exact product and do not quote a partial match. Quote stock only when known; otherwise say staff must verify. State delivery charges only when explicitly verified.
4. ${landingSummary ? `CRITICAL: The customer is calling from the "${landingSummary.title}" landing page. ONLY talk about "${landingSummary.title}" and its packages listed above. Do NOT discuss any other products.` : 'For outbound confirmation: Greet warmly, mention the product, verify shipping address. If customer gives a correction, call update_order_address immediately. If confirmed, call update_order_status("confirmed").'}
5. Always let them know they can ask to speak with a live Help Center representative anytime; if they ask for a human representative, call request_human_transfer.
6. ORDER SAFETY: A spoken phone number is not proof that the caller owns that number. For every new order request, collect the details, call request_human_transfer so staff can verify the number and intent, and clearly say no order has been placed yet. Never call create_new_order during a public/marketing voice call or bypass a refusal. State prices/totals only from verified tool results.
7. FRAUD & COURIER CHECK: Call check_courier_fraud only when the customer provides their own phone number. If fraud seems possible, call report_fake_order_attempt to ask staff to review. Never accuse, warn, or block a customer based only on AI judgment.`;

    const liveTools = [{
      functionDeclarations: [
        { name: 'get_product_details', description: 'Search product catalog for exact prices, variations, delivery charges, stock, and details', parameters: { type: 'OBJECT', properties: { query: { type: 'STRING' } } } },
        { name: 'update_order_address', description: 'Update customer shipping address when customer gives a correction', parameters: { type: 'OBJECT', properties: { orderId: { type: 'STRING' }, newAddress: { type: 'STRING' }, note: { type: 'STRING' } }, required: ['newAddress'] } },
        { name: 'update_order_status', description: 'Confirm, hold, or cancel an order', parameters: { type: 'OBJECT', properties: { orderId: { type: 'STRING' }, status: { type: 'STRING', enum: ['confirmed', 'hold', 'cancelled'] }, note: { type: 'STRING' } }, required: ['status'] } },
        {
          name: 'create_new_order',
          description: 'Create a single order containing 1 or multiple products with automatic delivery charge calculation',
          parameters: {
            type: 'OBJECT',
            properties: {
              customerName: { type: 'STRING' },
              customerPhone: { type: 'STRING' },
              address: { type: 'STRING' },
              area: { type: 'STRING', enum: ['inside', 'outside'] },
              items: {
                type: 'ARRAY',
                items: {
                  type: 'OBJECT',
                  properties: {
                    productName: { type: 'STRING' },
                    variationName: { type: 'STRING' },
                    quantity: { type: 'INTEGER' }
                  },
                  required: ['productName']
                }
              },
              productName: { type: 'STRING' },
              variationName: { type: 'STRING' },
              quantity: { type: 'INTEGER' },
              note: { type: 'STRING' }
            },
            required: ['customerPhone', 'address']
          }
        },
        { name: 'check_order_status', description: 'Check an order by its exact order ID (DOT-XXXXXXXX). Do not use customer phone numbers to search.', parameters: { type: 'OBJECT', properties: { phoneOrOrderId: { type: 'STRING' } } } },
        { name: 'check_courier_fraud', description: 'Check customer courier delivery/return/fraud history by phone number', parameters: { type: 'OBJECT', properties: { phone: { type: 'STRING' } }, required: ['phone'] } },
        { name: 'report_fake_order_attempt', description: 'Send a suspected fraud concern for staff review; this does not strike or block the caller', parameters: { type: 'OBJECT', properties: { phone: { type: 'STRING' }, reason: { type: 'STRING' } }, required: ['reason'] } },
        {
          name: 'save_customer_lead',
          description: 'Save customer name, phone number, address, order number, and product interest to CRM for support and future marketing',
          parameters: {
            type: 'OBJECT',
            properties: {
              customerName: { type: 'STRING' },
              customerPhone: { type: 'STRING' },
              address: { type: 'STRING' },
              orderId: { type: 'STRING' },
              interestedProduct: { type: 'STRING' },
              notes: { type: 'STRING' }
            }
          }
        },
        { name: 'request_human_transfer', description: 'Queue a human follow-up request with conversation summary; this does not bridge the live audio call', parameters: { type: 'OBJECT', properties: { reason: { type: 'STRING' } } } },
        { name: 'end_call', description: 'Politely end and disconnect the live phone call when the customer says goodbye or asks to hang up', parameters: { type: 'OBJECT', properties: { reason: { type: 'STRING' } } } }
      ]
    }];

    const assistantLiveTools = [{
      functionDeclarations: [
        {
          name: 'send_whatsapp_message',
          description: 'Send a real WhatsApp message to any customer phone number or to the Boss/Owner',
          parameters: {
            type: 'OBJECT',
            properties: {
              phone: { type: 'STRING', description: 'Customer or Boss phone number (leave empty for Boss)' },
              message: { type: 'STRING', description: 'Exact WhatsApp message body to send' }
            },
            required: ['message']
          }
        },
        {
          name: 'send_email_report',
          description: 'Send an email report with support for custom sender address (e.g. from support@secrate.shop or ceo@secrate.shop) and custom recipient',
          parameters: {
            type: 'OBJECT',
            properties: {
              toEmail: { type: 'STRING', description: 'Recipient email address. Default is store admin email.' },
              fromEmail: { type: 'STRING', description: 'Custom sender email address requested by the Boss' },
              fromName: { type: 'STRING', description: 'Custom sender display name' },
              subject: { type: 'STRING', description: 'Email subject line' },
              message: { type: 'STRING', description: 'Detailed email report body' }
            },
            required: ['message']
          }
        },
        {
          name: 'search_database_orders',
          description: 'Search and query the store orders database by customer name, phone number, order ID, product name, or status (pending, confirmed, delivered, hold, cancelled)',
          parameters: {
            type: 'OBJECT',
            properties: {
              query: { type: 'STRING', description: 'Customer name, phone number, order ID, or product to search' },
              status: { type: 'STRING', description: 'Status filter: all, pending, confirmed, delivered, hold, cancelled' },
              limit: { type: 'INTEGER', description: 'Max number of orders to return (default 10)' }
            }
          }
        },
        {
          name: 'update_database_order',
          description: 'Update order status, customer shipping address, or internal note directly in the database',
          parameters: {
            type: 'OBJECT',
            properties: {
              orderId: { type: 'STRING', description: 'Order ID to update' },
              status: { type: 'STRING', description: 'New status: confirmed, hold, cancelled, delivered, processing' },
              address: { type: 'STRING', description: 'New shipping address' },
              note: { type: 'STRING', description: 'Internal note' }
            },
            required: ['orderId']
          }
        },
        {
          name: 'get_database_product_stock',
          description: 'Query product inventory, prices, current stock levels, low-stock warnings, and out-of-stock items',
          parameters: {
            type: 'OBJECT',
            properties: {
              query: { type: 'STRING', description: 'Product name or SKU to search (optional)' },
              lowStockOnly: { type: 'BOOLEAN', description: 'If true, only return out-of-stock and low-stock items' }
            }
          }
        },
        {
          name: 'manage_product_stock',
          description: 'Update stock count, price, or details of a product in the store database as commanded by the Boss',
          parameters: {
            type: 'OBJECT',
            properties: {
              productNameOrId: { type: 'STRING', description: 'Product name or ID' },
              stock: { type: 'INTEGER', description: 'New stock count' },
              price: { type: 'NUMBER', description: 'Updated selling price in BDT' }
            },
            required: ['productNameOrId']
          }
        },
        {
          name: 'create_new_product',
          description: 'Upload and create a new product in the store catalog with name, price, stock, and category',
          parameters: {
            type: 'OBJECT',
            properties: {
              name: { type: 'STRING', description: 'Product name' },
              price: { type: 'NUMBER', description: 'Selling price in BDT' },
              stock: { type: 'INTEGER', description: 'Initial stock quantity' },
              category: { type: 'STRING', description: 'Category slug or name' },
              description: { type: 'STRING', description: 'Product description' }
            },
            required: ['name', 'price']
          }
        },
        {
          name: 'search_database_customers',
          description: 'Look up customer CRM data, purchase history, total orders, total spent, phone number, and delivery reliability',
          parameters: {
            type: 'OBJECT',
            properties: {
              query: { type: 'STRING', description: 'Customer name, phone number, or email' }
            }
          }
        },
        {
          name: 'direct_staff',
          description: 'Send an urgent directive, task reminder, or warning to all staff members on their dashboard',
          parameters: {
            type: 'OBJECT',
            properties: {
              directive: { type: 'STRING', description: 'Instruction for the staff' }
            },
            required: ['directive']
          }
        },
        {
          name: 'get_live_store_metrics',
          description: 'Check real-time live store metrics: today sales revenue, orders count, pending orders, delayed pending, stockout count, staff online',
          parameters: { type: 'OBJECT', properties: {} }
        },
        {
          name: 'get_landing_page_details',
          description: 'Search or view detailed information about store landing pages, campaign products, combo packages, prices, delivery charges, discounts, and guarantees',
          parameters: {
            type: 'OBJECT',
            properties: {
              queryOrSlug: { type: 'STRING', description: 'Landing page slug, title, or product keyword' }
            }
          }
        }
      ]
    }];

    const requestedVoice = urlObj.searchParams.get('voiceName') || '';
    const selectedVoice = ['Aoede', 'Kore', 'Leda', 'Zephyr', 'Puck'].includes(requestedVoice)
      ? requestedVoice
      : (['Aoede', 'Kore', 'Leda', 'Zephyr', 'Puck'].includes(aiCfg.voiceName) ? aiCfg.voiceName : 'Aoede');
    const ai = new GoogleGenAI({ apiKey });
    geminiSession = await ai.live.connect({
      model: 'gemini-3.8-live',
      config: {
        responseModalities: ['audio'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: selectedVoice } } },
        systemInstruction: { parts: [{ text: sysPrompt }] },
        tools: mode === 'saika_assistant' ? assistantLiveTools : liveTools,
        inputAudioTranscription: {},
        outputAudioTranscription: {}
      },
      callbacks: {
        onopen: () => {
          if (clientWs.readyState === 1) {
            clientWs.send(JSON.stringify({ type: 'ready', sessionId, customerTier: session.customerTier, orderId: session.orderId }));
          }
        },
        onmessage: async (msg) => {
          if (clientWs.readyState !== 1) return;
          const sc = msg?.serverContent;
          if (sc?.interrupted) {
            clientWs.send(JSON.stringify({ type: 'interrupted' }));
          }
          if (sc?.inputTranscription?.text) {
            session.history.push({ role: 'user', text: sc.inputTranscription.text });
            session.updatedAt = Date.now();
            clientWs.send(JSON.stringify({ type: 'transcript', role: 'user', text: sc.inputTranscription.text }));
          }
          if (sc?.outputTranscription?.text) {
            session.history.push({ role: 'model', text: sc.outputTranscription.text });
            session.updatedAt = Date.now();
            clientWs.send(JSON.stringify({ type: 'transcript', role: 'ai', text: sc.outputTranscription.text }));
          }
          const parts = sc?.modelTurn?.parts || [];
          for (const p of parts) {
            if (p?.inlineData?.data && String(p.inlineData.mimeType || '').includes('audio')) {
              pushPcmSegment(p.inlineData.data, false, true);
              clientWs.send(JSON.stringify({ type: 'audio', data: p.inlineData.data }));
            }
          }
          const fcs = msg?.toolCall?.functionCalls || [];
          if (fcs.length > 0) {
            const functionResponses = [];
            const execActions = [];
            for (const fc of fcs) {
              const { result, actions } = await executeAiCallToolAsync(fc.name, fc.args || {}, session);
              execActions.push(...actions);
              session.actionsExecuted.push(...actions);
              functionResponses.push({ id: fc.id, name: fc.name, response: result });
            }
            if (execActions.length > 0) {
              clientWs.send(JSON.stringify({ type: 'tool', actions: execActions }));
            }
            if (session.transferRequested) {
              clientWs.send(JSON.stringify({ type: 'transfer', target: session.transferTarget || null }));
            }
            if (session.endCallRequested) {
              if (clientWs.readyState === 1) {
                clientWs.send(JSON.stringify({ type: 'ending_soon' }));
              }
              setTimeout(() => {
                try {
                  if (clientWs.readyState === 1) {
                    clientWs.send(JSON.stringify({ type: 'end_call' }));
                    clientWs.close();
                  }
                } catch (_) {}
              }, 2600);
            }
            try { geminiSession.sendToolResponse({ functionResponses }); } catch (_) {}
          }
        },
        onerror: (err) => {
          const msgStr = String(err?.message || 'Live audio connection error');
          if (/leaked|PERMISSION_DENIED|API_KEY_INVALID|403|401/i.test(msgStr)) {
            aiKeyBlockedReason = msgStr;
          }
          if (clientWs.readyState === 1) {
            clientWs.send(JSON.stringify({ type: 'error', fallbackToHuman: true, message: msgStr }));
          }
        },
        onclose: () => {
          if (clientWs.readyState === 1) clientWs.close();
          cleanup();
        }
      }
    });

    const kickoff = mode === 'saika_assistant'
      ? 'Speak immediately to the Boss ("বস") in warm, natural Bengali: say "আসসালামু আলাইকুম বস! আমি সাইকা শুনছি, বলুন কী সাহায্য করতে পারি?" and listen for their voice command.'
      : mode === 'outbound_confirm' && ctx.targetOrder
      ? `Start the phone call RIGHT NOW without waiting for the customer to speak: greet ${session.customerName} warmly in Bengali, introduce yourself as Saika from ${storeName}, briefly mention this call is being recorded for quality assurance, mention their order for ${session.targetOrder.items?.[0]?.name || 'product'} and ask if their address "${session.targetOrder.customer?.address || ''}" is correct.`
      : mode === 'marketing'
      ? `Start the phone call RIGHT NOW without waiting: greet warmly in Bengali, introduce yourself as Saika from ${storeName}, briefly mention this call is being recorded, and share our special offers.`
      : ctx.knownDevice?.name
      ? `Answer the incoming call RIGHT NOW without waiting: you recognize this returning caller from their device! Say Assalamu Alaikum warmly in Bengali to ${ctx.knownDevice.name}, introduce yourself as Saika from ${storeName}, mention the call is recorded in 2 words, and naturally ask if they are calling about ${ctx.knownDevice.lastProduct || landingSummary?.title || 'another order'}.`
      : landingSummary
      ? `Answer the incoming call RIGHT NOW without waiting for the caller to speak: say Assalamu Alaikum warmly in Bengali, introduce yourself as Saika from ${storeName}, naturally mention the call is recorded in 1 short phrase, mention you are here to help with ${landingSummary.title}, and ask how you can help.`
      : `Answer the incoming call RIGHT NOW without waiting for the caller to speak: say Assalamu Alaikum warmly in Bengali, introduce yourself as Saika from ${storeName}, naturally mention the call is recorded in 1 short phrase, and ask how you can help today.`;

    setTimeout(() => {
      if (closed || !geminiSession) return;
      try {
        geminiSession.sendClientContent({ turns: [{ role: 'user', parts: [{ text: kickoff }] }], turnComplete: true });
      } catch (_) {}
    }, 200);

    clientWs.on('message', (raw) => {
      if (!geminiSession) return;
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'audio' && msg.data) {
          pushPcmSegment(msg.data, true, false);
          geminiSession.sendRealtimeInput({ audio: { data: msg.data, mimeType: 'audio/pcm;rate=16000' } });
        } else if (msg.type === 'text' && msg.text) {
          geminiSession.sendClientContent({ turns: [{ role: 'user', parts: [{ text: String(msg.text) }] }], turnComplete: true });
        }
      } catch (_) {}
    });

  } catch (e) {
    const errMsg = String(e?.message || 'Failed to start live AI call');
    if (/leaked|PERMISSION_DENIED|API_KEY_INVALID|403|401/i.test(errMsg)) {
      aiKeyBlockedReason = errMsg;
    }
    try {
      if (clientWs.readyState === 1) clientWs.send(JSON.stringify({ type: 'error', fallbackToHuman: true, message: errMsg }));
      clientWs.close();
    } catch (_) {}
    cleanup();
  }
});
}

httpServer.listen(PORT, HOST, () => {
  console.log(`TimeBoost api on http://${HOST}:${PORT}`);
  // Start automated background courier status sync (initial run after 10s, then every 5 mins)
  setTimeout(() => {
    runBackgroundCourierSync().catch(() => {});
    setInterval(runBackgroundCourierSync, 5 * 60 * 1000);
  }, 10 * 1000);
});


export function formatStaffDailyReport(monitoringData) {
  const staffList = monitoringData.staff || [];
  const dateStr = monitoringData.date;
  
  let msg = `📊 *[TimeBoost] স্টাফ দৈনিক পারফরম্যান্স রিপোর্ট*\n`;
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
  msg += `🔗 *লাইভ ড্যাশবোর্ড:* https://timingboost.xyz/wp-admin\n`;

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
