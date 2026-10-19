import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers,
  delay
} from '@whiskeysockets/baileys';
import pino from 'pino';
import QRCode from 'qrcode';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { getWhatsAppSettings, saveWhatsAppSettings, formatWhatsAppMessage, registerBaileysSender } from './whatsapp_engine.js';

const __dir = dirname(fileURLToPath(import.meta.url));

// Persistent Auth storage sits in safe persistent folder
let AUTH_DIR = process.env.PERSISTENT_DATA_DIR ? join(process.env.PERSISTENT_DATA_DIR, 'wa_auth_info') : null;
if (!AUTH_DIR) {
  if (existsSync('/var/www/secrate_persistent_data')) {
    AUTH_DIR = '/var/www/secrate_persistent_data/wa_auth_info';
  } else {
    AUTH_DIR = join(__dir, 'data', 'wa_auth_info');
  }
}
if (!existsSync(AUTH_DIR)) mkdirSync(AUTH_DIR, { recursive: true });

let sock = null;
let currentQrDataUrl = null;
let currentRawQr = null;
let qrGeneratedAt = 0;
let isConnected = false;
let isConnecting = false;
let connectedPhone = '';
let connectionError = null;

export async function startWhatsAppSocket(forceNew = false) {
  if (sock && isConnected && !forceNew) {
    return { connected: true, phone: connectedPhone };
  }
  if (forceNew) {
    try {
      if (sock) {
        sock.end(new Error('Resetting session'));
        sock = null;
      }
      if (existsSync(AUTH_DIR)) {
        rmSync(AUTH_DIR, { recursive: true, force: true });
        mkdirSync(AUTH_DIR, { recursive: true });
      }
    } catch (_) {}
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
      printQRInTerminal: false,
      auth: state,
      browser: Browsers.macOS('Desktop'),
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      keepAliveIntervalMs: 15000,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
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
        currentQrDataUrl = null;
        currentRawQr = null;

        const isLoggedOut = statusCode === DisconnectReason.loggedOut;
        if (isLoggedOut) {
          saveWhatsAppSettings({ connected: false, phone: '', device: 'Disconnected' });
          if (existsSync(AUTH_DIR)) {
            try { rmSync(AUTH_DIR, { recursive: true, force: true }); } catch (_) {}
          }
        } else {
          // Reconnect automatically if network blip
          setTimeout(() => {
            if (!isConnected) startWhatsAppSocket(false);
          }, 5000);
        }
      } else if (connection === 'open') {
        isConnected = true;
        isConnecting = false;
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
    connected: isConnected || settings.connected,
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
  if (!sock) await startWhatsAppSocket(false);
  const cleanPhone = String(phone).replace(/\D/g, '');
  if (!cleanPhone || cleanPhone.length < 10) throw new Error('Invalid phone number');

  const fullPhone = cleanPhone.startsWith('88') ? cleanPhone : '88' + cleanPhone.slice(-11);
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

// Wire real dispatcher to notification engine
registerBaileysSender(sendBaileysMessage);

// If already paired before, resume connection in background
if (existsSync(join(AUTH_DIR, 'creds.json'))) {
  console.log('[Baileys] Found existing credentials, auto-resuming WhatsApp session...');
  startWhatsAppSocket(false).catch((e) => console.warn('[Baileys auto-resume note]:', e?.message));
}

