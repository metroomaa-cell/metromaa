import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { getWhatsAppSettings, saveWhatsAppSettings, formatWhatsAppMessage, registerBaileysSender } from './whatsapp_engine.js';
import { getPersistentDataDirectory } from './store.js';

const __dir = dirname(fileURLToPath(import.meta.url));

// Persistent Auth storage sits in safe persistent folder
let AUTH_DIR = join(getPersistentDataDirectory(), 'wa_auth_info');
if (!AUTH_DIR || !existsSync(dirname(AUTH_DIR))) {
  if (existsSync('/var/www/secrate_persistent_data')) {
    AUTH_DIR = '/var/www/secrate_persistent_data/wa_auth_info';
  } else {
    AUTH_DIR = join(__dir, 'data', 'wa_auth_info');
  }
}
if (!existsSync(AUTH_DIR)) {
  try { mkdirSync(AUTH_DIR, { recursive: true }); } catch (_) {}
}

let sock = null;
let currentQrDataUrl = null;
let currentRawQr = null;
let qrGeneratedAt = 0;
let isConnected = false;
let isConnecting = false;
let connectedPhone = '';
let connectionError = null;
let consecutiveFailures = 0;
let reconnectTimer = null;

let makeWASocket = null;
let DisconnectReason = null;
let useMultiFileAuthState = null;
let fetchLatestBaileysVersion = null;
let Browsers = null;
let pino = null;
let QRCode = null;
let baileysLoaded = false;

async function loadBaileysModules() {
  if (baileysLoaded && makeWASocket) return true;
  try {
    const baileys = await import('@whiskeysockets/baileys');
    makeWASocket = baileys.default || baileys.makeWASocket;
    DisconnectReason = baileys.DisconnectReason;
    useMultiFileAuthState = baileys.useMultiFileAuthState;
    fetchLatestBaileysVersion = baileys.fetchLatestBaileysVersion;
    Browsers = baileys.Browsers;

    const pinoPkg = await import('pino');
    pino = pinoPkg.default || pinoPkg;

    const qrPkg = await import('qrcode');
    QRCode = qrPkg.default || qrPkg;

    baileysLoaded = true;
    return true;
  } catch (err) {
    connectionError = 'Baileys not installed: ' + err.message;
    console.warn('[Baileys load warning]:', err.message);
    return false;
  }
}

export function clearWhatsAppSession() {
  try {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (sock) {
      try {
        sock.ev.removeAllListeners('connection.update');
        sock.ev.removeAllListeners('creds.update');
        sock.end(new Error('Resetting session'));
      } catch (_) {}
      sock = null;
    }
    isConnected = false;
    isConnecting = false;
    connectedPhone = '';
    currentQrDataUrl = null;
    currentRawQr = null;
    qrGeneratedAt = 0;
    connectionError = null;
    consecutiveFailures = 0;

    if (existsSync(AUTH_DIR)) {
      try {
        rmSync(AUTH_DIR, { recursive: true, force: true });
        mkdirSync(AUTH_DIR, { recursive: true });
      } catch (e) {
        console.warn('[Baileys] Warning clearing AUTH_DIR:', e.message);
      }
    }
    saveWhatsAppSettings({
      connected: false,
      phone: '',
      device: 'Disconnected',
      pairingCode: '',
    });
    console.log('[Baileys] WhatsApp auth session cleared and reset.');
    return true;
  } catch (err) {
    console.error('[Baileys] Error in clearWhatsAppSession:', err);
    return false;
  }
}

export async function waitForQrCode(timeoutMs = 4500) {
  if (currentQrDataUrl) return currentQrDataUrl;
  return new Promise((resolve) => {
    const start = Date.now();
    const interval = setInterval(() => {
      if (currentQrDataUrl || isConnected || Date.now() - start >= timeoutMs) {
        clearInterval(interval);
        resolve(currentQrDataUrl);
      }
    }, 200);
  });
}

export async function startWhatsAppSocket(forceNew = false) {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (sock && isConnected && !forceNew) {
    return { connected: true, phone: connectedPhone };
  }

  const ok = await loadBaileysModules();
  if (!ok) {
    return { ok: false, error: connectionError || 'Baileys dependencies not available' };
  }

  if (forceNew) {
    clearWhatsAppSession();
  }

  isConnecting = true;
  connectionError = null;

  try {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    let version = [2, 3000, 1015901307];
    try {
      const v = await fetchLatestBaileysVersion();
      if (v?.version) version = v.version;
    } catch (_) {}

    sock = makeWASocket({
      version,
      logger: pino({ level: 'silent' }),
      auth: state,
      browser: Browsers ? Browsers.windows('Chrome') : ['Windows', 'Chrome', '10.0.22631'],
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      keepAliveIntervalMs: 15000,
      generateHighQualityLinkPreview: true,
      syncFullHistory: false,
      markOnlineOnConnect: true,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr && QRCode) {
        currentRawQr = qr;
        qrGeneratedAt = Date.now();
        try {
          currentQrDataUrl = await QRCode.toDataURL(qr, { margin: 2, scale: 7 });
          console.log('[Baileys] New official WhatsApp QR generated successfully.');
        } catch (e) {
          console.error('[Baileys] Error generating QR image:', e);
        }
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error)?.output?.statusCode;
        const reason = lastDisconnect?.error?.message || 'closed';
        console.log(`[Baileys] Connection closed. Reason: ${reason} (code: ${statusCode})`);

        isConnected = false;
        isConnecting = false;
        currentQrDataUrl = null;
        currentRawQr = null;
        consecutiveFailures++;

        const isLoggedOut = DisconnectReason && statusCode === DisconnectReason.loggedOut;
        const isCorruptSession = statusCode === 428 || statusCode === 401 || statusCode === 403 || statusCode === 411 || statusCode === 405;

        if (isLoggedOut || (isCorruptSession && consecutiveFailures >= 2)) {
          console.warn(`[Baileys] Session invalidated by WhatsApp (code: ${statusCode}). Resetting session storage to allow fresh scan.`);
          clearWhatsAppSession();
        } else {
          // Reconnect with backoff
          const delay = Math.min(10000, 3000 * Math.max(1, consecutiveFailures));
          reconnectTimer = setTimeout(() => {
            if (!isConnected) {
              startWhatsAppSocket(false).catch(() => {});
            }
          }, delay);
        }
      } else if (connection === 'open') {
        isConnected = true;
        isConnecting = false;
        consecutiveFailures = 0;
        currentQrDataUrl = null;
        currentRawQr = null;

        const id = sock?.user?.id || '';
        const phone = id.split(':')[0] || id.split('@')[0] || '';
        connectedPhone = phone;

        saveWhatsAppSettings({
          connected: true,
          phone,
          device: `WhatsApp Web (${sock?.user?.name || 'Linked Device'})`,
        });

        console.log(`[Baileys] WhatsApp Web connection OPEN! Authenticated phone: ${phone}`);
      }
    });

    return { ok: true };
  } catch (err) {
    isConnecting = false;
    connectionError = err.message;
    console.error('[Baileys] Initialization error:', err);
    return { ok: false, error: err.message };
  }
}

export function getWhatsAppLiveStatus() {
  const settings = getWhatsAppSettings();
  return {
    enabled: settings.enabled,
    connected: isConnected || (settings.connected && !connectionError),
    phone: connectedPhone || settings.phone,
    device: settings.device || 'WhatsApp Web',
    qrDataUrl: currentQrDataUrl,
    hasQr: !!currentQrDataUrl,
    qrAgeMs: qrGeneratedAt ? Date.now() - qrGeneratedAt : null,
    isConnecting,
    error: connectionError,
    triggers: settings.triggers,
    logs: settings.logs || [],
  };
}

export async function requestPairingCode(phone) {
  const cleanPhone = String(phone).replace(/\D/g, '');
  if (!cleanPhone || cleanPhone.length < 10) throw new Error('Invalid phone number');
  const fullPhone = cleanPhone.startsWith('88') ? cleanPhone : '88' + cleanPhone.slice(-11);

  // If already connected or socket not in pre-auth mode, start clean
  if (!sock || !sock.requestPairingCode || isConnected) {
    await startWhatsAppSocket(true);
    await new Promise((r) => setTimeout(r, 1200));
  }

  if (!sock || !sock.requestPairingCode) {
    throw new Error('WhatsApp pairing service initializing. Please retry in 3 seconds.');
  }

  const code = await sock.requestPairingCode(fullPhone);
  return code;
}

export async function sendBaileysMessage(phone, text, orderId = null, eventType = 'manual_broadcast') {
  if (!isConnected || !sock) {
    return { sent: false, reason: 'WhatsApp not connected to phone' };
  }
  const cleanPhone = String(phone).replace(/\D/g, '');
  const digits = cleanPhone.startsWith('88') ? cleanPhone : '88' + cleanPhone.slice(-11);
  const jid = `${digits}@s.whatsapp.net`;

  await sock.sendMessage(jid, { text });

  const logEntry = {
    id: 'wa_' + Date.now().toString(36),
    at: new Date().toISOString(),
    phone: digits,
    orderId,
    eventType,
    message: text,
    status: 'delivered',
  };

  const current = getWhatsAppSettings();
  const logs = [logEntry, ...(current.logs || [])].slice(0, 100);
  saveWhatsAppSettings({ logs });

  return { sent: true, log: logEntry };
}

registerBaileysSender(sendBaileysMessage);

if (existsSync(join(AUTH_DIR, 'creds.json'))) {
  startWhatsAppSocket(false).catch((e) => console.warn('[Baileys auto-resume note]:', e?.message));
}
