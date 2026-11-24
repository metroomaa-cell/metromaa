import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { getWhatsAppSettings, saveWhatsAppSettings, formatWhatsAppMessage, registerBaileysSender } from './whatsapp_engine.js';
import { handleWhatsAppAutoOrderFlow } from './whatsapp_order_bot.js';
import { handleWhatsAppVisionOrInquiryFlow, isWhatsAppImageMessage, recentCustomerPhotos, recentProductInquiries } from './whatsapp_vision_bot.js';
import { getPersistentDataDirectory, getOrders, saveOrders, updateOrder, upsertWaChatContact, getWaChatContacts, syncWhatsAppSessionContacts } from './store.js';

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
const recentMessageMap = new Map(); // id -> message proto
const msgRetryCounterCache = new Map();
let reconnectTimer = null;
const botSentMessageIds = new Set();
// Active Human Representative Takeover Tracker: remoteJid/phone -> timestamp
export const humanRepresentativeActiveChats = new Map();
// Seed active chat from recent representative interaction so bot stays silent immediately
humanRepresentativeActiveChats.set('155027465314464@lid', Date.now());
humanRepresentativeActiveChats.set('8801604660939@s.whatsapp.net', Date.now());
humanRepresentativeActiveChats.set('01604660939', Date.now());
humanRepresentativeActiveChats.set('8801604660939', Date.now());

async function safeSendMessage(targetJid, content) {
  if (!sock) return null;
  const res = await sock.sendMessage(targetJid, content);
  if (res?.key?.id) {
    botSentMessageIds.add(res.key.id);
    if (botSentMessageIds.size > 1000) {
      const first = botSentMessageIds.values().next().value;
      botSentMessageIds.delete(first);
    }
  }
  return res;
}

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
      msgRetryCounterCache,
      getMessage: async (key) => {
        if (key?.id && recentMessageMap.has(key.id)) {
          return recentMessageMap.get(key.id);
        }
        return undefined;
      },
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
        // Asynchronously sync all historical session contacts to permanent storage
        try {
          syncWhatsAppSessionContacts(AUTH_DIR);
        } catch (_) {}
        // Resume queue processing if any pending messages
        processWaQueue().catch(() => {});
      }
    });

    sock.ev.on('messages.upsert', async (upsert) => {
      const messages = upsert?.messages || [];
      console.log(`[Baileys messages.upsert] Event received (type: ${upsert?.type}, count: ${messages.length})`);
      for (const m of messages) {
        console.log('[Baileys raw msg]:', JSON.stringify({ fromMe: m?.key?.fromMe, jid: m?.key?.remoteJid, keys: m?.message ? Object.keys(m.message) : [], stub: m?.messageStubType }));
        if (m?.key?.id && m.message) {
          recentMessageMap.set(m.key.id, m.message);
          if (recentMessageMap.size > 500) {
            const first = recentMessageMap.keys().next().value;
            recentMessageMap.delete(first);
          }
        }
        try {
          await handleIncomingWhatsAppBotMessage(m);
        } catch (err) {
          console.error('[Baileys incoming msg error]:', err?.message || err);
        }
      }
    });

    sock.ev.on('messages.update', async (updates) => {
      if (!Array.isArray(updates)) return;
      for (const u of updates) {
        if (u?.update?.message) {
          if (u.key?.id) recentMessageMap.set(u.key.id, u.update.message);
          try {
            await handleIncomingWhatsAppBotMessage({ key: u.key, message: u.update.message });
          } catch (err) {
            console.error('[Baileys msg update error]:', err?.message || err);
          }
        }
      }
    });

    // Capture & Sync All Historical Chats and Contacts from WhatsApp Multi-Device
    sock.ev.on('messaging-history.set', ({ chats, contacts, messages }) => {
      console.log(`[Baileys History Sync] Syncing historical contacts: ${chats?.length || 0} chats, ${contacts?.length || 0} contacts, ${messages?.length || 0} messages`);
      try {
        if (Array.isArray(contacts)) {
          for (const c of contacts) {
            if (c.id && c.id.endsWith('@s.whatsapp.net')) {
              const raw = c.id.split('@')[0];
              const name = c.name || c.notify || c.verifiedName || '';
              upsertWaChatContact({ phone: raw, name, isIncoming: true });
            }
          }
        }
        if (Array.isArray(chats)) {
          for (const ch of chats) {
            if (ch.id && ch.id.endsWith('@s.whatsapp.net')) {
              const raw = ch.id.split('@')[0];
              const name = ch.name || '';
              upsertWaChatContact({ phone: raw, name, isIncoming: true });
            }
          }
        }
        if (Array.isArray(messages)) {
          for (const m of messages) {
            const jid = m.key?.remoteJid || '';
            if (jid && jid.endsWith('@s.whatsapp.net')) {
              const raw = jid.split('@')[0];
              const pushName = m.pushName || '';
              const txt = extractTextMessage(m.message || {});
              upsertWaChatContact({ phone: raw, name: pushName, lastMessage: txt, isIncoming: !m.key?.fromMe });
            }
          }
        }
      } catch (e) {
        console.warn('[Baileys History Sync Note]:', e?.message || e);
      }
    });

    sock.ev.on('contacts.upsert', (contacts) => {
      if (!Array.isArray(contacts)) return;
      for (const c of contacts) {
        if (c.id && c.id.endsWith('@s.whatsapp.net')) {
          const raw = c.id.split('@')[0];
          const name = c.name || c.notify || c.verifiedName || '';
          upsertWaChatContact({ phone: raw, name, isIncoming: true });
        }
      }
    });

    sock.ev.on('chats.upsert', (chats) => {
      if (!Array.isArray(chats)) return;
      for (const ch of chats) {
        if (ch.id && ch.id.endsWith('@s.whatsapp.net')) {
          const raw = ch.id.split('@')[0];
          const name = ch.name || '';
          upsertWaChatContact({ phone: raw, name, isIncoming: true });
        }
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

// ---- Automatic Customer WhatsApp Reply Bot (Night Order 1 = Approved, 2 = Cancel) ----
function resolvePhoneFromJid(jid) {
  if (!jid) return '';
  const clean = jid.split(':')[0]; // strip multi-device suffix e.g. :1
  if (clean.endsWith('@s.whatsapp.net')) {
    return clean.split('@')[0].replace(/\D/g, '');
  }
  if (clean.endsWith('@lid')) {
    const lid = clean.split('@')[0];
    const revFile = join(AUTH_DIR, `lid-mapping-${lid}_reverse.json`);
    if (existsSync(revFile)) {
      try {
        const raw = readFileSync(revFile, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed) return String(parsed).replace(/\D/g, '');
      } catch (_) {}
    }
  }
  return '';
}

function extractMessageText(msg) {
  if (!msg) return '';
  let m = msg.message || msg;
  if (!m) return '';

  // Unwrap any nested message wrappers (ephemeral, viewOnce, deviceSent, etc.)
  for (let depth = 0; depth < 8; depth++) {
    if (!m || typeof m !== 'object') break;
    if (m.ephemeralMessage?.message) {
      m = m.ephemeralMessage.message;
    } else if (m.viewOnceMessage?.message) {
      m = m.viewOnceMessage.message;
    } else if (m.viewOnceMessageV2?.message) {
      m = m.viewOnceMessageV2.message;
    } else if (m.viewOnceMessageV2Extension?.message) {
      m = m.viewOnceMessageV2Extension.message;
    } else if (m.documentWithCaptionMessage?.message) {
      m = m.documentWithCaptionMessage.message;
    } else if (m.deviceSentMessage?.message) {
      m = m.deviceSentMessage.message;
    } else if (m.botInvokeMessage?.message) {
      m = m.botInvokeMessage.message;
    } else if (m.editedMessage?.message?.protocolMessage?.editedMessage) {
      m = m.editedMessage.message.protocolMessage.editedMessage;
    } else {
      break;
    }
  }

  let text = (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.buttonsResponseMessage?.selectedButtonId ||
    m.buttonsResponseMessage?.selectedDisplayText ||
    m.templateButtonReplyMessage?.selectedId ||
    m.templateButtonReplyMessage?.selectedDisplayText ||
    m.listResponseMessage?.singleSelectReply?.selectedRowId ||
    m.listResponseMessage?.title ||
    m.interactiveResponseMessage?.body?.text ||
    m.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    ''
  ).trim();

  if (!text && m.reactionMessage?.text) {
    const rx = m.reactionMessage.text;
    if (rx === '👍' || rx === '❤️' || rx === '🔥' || rx === '✅') {
      text = '1';
    } else if (rx === '👎' || rx === '❌') {
      text = '2';
    }
  }

  return text;
}

function classifyCustomerReply(rawText) {
  const text = String(rawText || '').toLowerCase().trim();
  if (!text) return null;

  // Single digit checks (English or Bengali)
  if (text === '1' || text === '১' || text === '1.' || text === '১.' || text === '1️⃣' || text === '১)' || text === '১|' || text === '1|') return 'CONFIRM';
  if (text === '2' || text === '২' || text === '2.' || text === '২.' || text === '2️⃣' || text === '২)' || text === '২|' || text === '2|') return 'CANCEL';

  // Direct prefix match: e.g. "1 confirm" or "2 cancel"
  if (/^1\b|^১\b/.test(text)) return 'CONFIRM';
  if (/^2\b|^২\b/.test(text)) return 'CANCEL';

  // Cancel keywords
  const cancelKeywords = [
    'cancel', 'cancle', 'cancelled', 'বাতিল', 'বাতিল করুন', 'ক্যানসেল',
    'অর্ডার বাতিল', 'লাগবে না', 'নেব না', 'নিব না'
  ];
  for (const kw of cancelKeywords) {
    if (text === kw || text.includes(kw)) return 'CANCEL';
  }

  // Confirm keywords
  const confirmKeywords = [
    'confirm', 'conferm', 'confirmed', 'approve', 'approved', 'yes', 'yep', 'yeah', 'okay', 'ok',
    'কনফার্ম', 'কনফার্ম করুন', 'অর্ডার কনফার্ম', 'হ্যাঁ', 'হাঁ', 'হুম',
    'পাঠিয়ে দিন', 'পাঠান', 'নিব', 'নেব', 'রাখব', 'ঠিক আছে'
  ];
  for (const kw of confirmKeywords) {
    if (text === kw || text.includes(kw)) return 'CONFIRM';
  }

  return null;
}

async function handleIncomingWhatsAppBotMessage(m) {
  if (!m || !m.key) return;
  const remoteJid = m.key.remoteJid || '';
  if (!remoteJid || remoteJid.includes('@g.us') || remoteJid.includes('status@broadcast')) return;

  // Automatically capture everyone who ever chats or messages
  try {
    const raw = remoteJid.split('@')[0];
    const pushName = m.pushName || '';
    const txt = extractTextMessage(m.message || {});
    upsertWaChatContact({
      phone: raw,
      name: pushName,
      lastMessage: txt,
      isIncoming: !m.key?.fromMe,
    });
  } catch (_) {}

  // Ignore messages sent by our own bot code
  if (m.key.id && botSentMessageIds.has(m.key.id)) {
    botSentMessageIds.delete(m.key.id);
    return;
  }

  // Handle fromMe: allow self-test chat ("Message yourself" on the connected phone)
  const myJidNum = sock?.user?.id ? sock.user.id.split(':')[0].replace(/\D/g, '') : '8801916691768';
  const isSelfTestChat = m.key.fromMe && (remoteJid.includes(myJidNum) || remoteJid.includes('8801916691768'));

  // Handle fromMe: when a human representative or staff member sends a message manually from WhatsApp Web / phone
  if (m.key.fromMe) {
    if (!isSelfTestChat) {
      // Human representative is actively chatting with this customer!
      humanRepresentativeActiveChats.set(remoteJid, Date.now());
      const p = resolvePhoneFromJid(remoteJid);
      if (p) humanRepresentativeActiveChats.set(p, Date.now());
      console.log(`[Representative Active] Human staff spoke with ${remoteJid} (${p || 'no-phone'}). Automated bot paused for 2 hours in this chat.`);
      return;
    }
  }

  let phone = resolvePhoneFromJid(remoteJid);
  if (!phone && m.key.participant) {
    phone = resolvePhoneFromJid(m.key.participant);
  }

  // If human representative has spoken in this chat within the last 2 hours, STAY COMPLETELY SILENT!
  const lastStaffTime = humanRepresentativeActiveChats.get(remoteJid) || (phone ? humanRepresentativeActiveChats.get(phone) : 0);
  if (lastStaffTime && (Date.now() - lastStaffTime < 2 * 60 * 60 * 1000)) {
    const elapsedMins = Math.round((Date.now() - lastStaffTime) / 60000);
    console.log(`[Bot Silenced] Human representative is actively talking with ${remoteJid} (${elapsedMins}m ago). Automated bot will NOT interfere.`);
    return;
  }

  // If the customer message is quoting a message from the store representative, also pause bot!
  const quotedParticipant = m.message?.extendedTextMessage?.contextInfo?.participant || '';
  if (quotedParticipant && (quotedParticipant.includes(myJidNum) || quotedParticipant.includes('8801916691768'))) {
    humanRepresentativeActiveChats.set(remoteJid, Date.now());
    if (phone) humanRepresentativeActiveChats.set(phone, Date.now());
    console.log(`[Bot Silenced] Customer in ${remoteJid} is replying to representative's quoted message. Bot will NOT interfere.`);
    return;
  }

  const rawText = extractMessageText(m);
  const isImage = isWhatsAppImageMessage(m);
  console.log(`[Baileys Bot Message] From JID: ${remoteJid}, isImage: ${isImage}, Text: "${rawText}"`);
  if (!rawText && !isImage) return;

  const intent = classifyCustomerReply(rawText);

  // 1. Check Conversational Auto-Order Flow (New WhatsApp orders + double-confirmation slips)
  try {
    const handledByOrderBot = await handleWhatsAppAutoOrderFlow({
      sock,
      m,
      rawText,
      remoteJid,
      senderPhone: phone,
      intent,
      simulateHumanTypingAndSend,
    });
    if (handledByOrderBot) return;
  } catch (err) {
    console.error('[WhatsApp Auto-Order Bot Error]:', err?.message || err);
  }

  // 2. Check Vision AI & Product Inquiries (Photos, Screenshots, "এই প্রোডাক্ট আছে কি?", etc.)
  try {
    const handledByVisionOrInquiry = await handleWhatsAppVisionOrInquiryFlow({
      sock,
      m,
      rawText,
      remoteJid,
      senderPhone: phone,
      simulateHumanTypingAndSend,
    });
    if (handledByVisionOrInquiry) return;
  } catch (err) {
    console.error('[WhatsApp Vision/Inquiry Bot Error]:', err?.message || err);
  }

  if (!intent) return; // Do not auto-respond to free-form chat to avoid interfering with manual staff chats

  console.log(`[Baileys Bot Message] Detected Intent: ${intent}, Resolved Phone: ${phone || 'NONE'}`);

  const waSettings = getWhatsAppSettings();
  if (!waSettings.enabled) return;
  const nightTrigger = waSettings.triggers?.night_confirmation || {};

  const orders = getOrders();
  let targetOrder = null;

  if (phone && phone.length >= 10) {
    const last10 = phone.slice(-10);
    const customerOrders = orders.filter((o) => {
      if (!o.customer?.phone) return false;
      const oPhone = String(o.customer.phone).replace(/\D/g, '');
      return oPhone.endsWith(last10);
    });
    customerOrders.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    targetOrder = customerOrders.find((o) => ['pending', 'hold'].includes(o.status)) || customerOrders[0];
  }

  // Fallback 1: Check quoted message context for Order ID
  if (!targetOrder) {
    const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (quoted) {
      const quotedText = extractMessageText({ message: quoted });
      const orderMatch = quotedText.match(/#DOT-([A-Fa-f0-9]+)/i);
      if (orderMatch) {
        const matchedOrderId = 'DOT-' + orderMatch[1].toUpperCase();
        targetOrder = orders.find((o) => o.id === matchedOrderId);
        if (targetOrder) {
          console.log(`[Baileys Bot] Matched order #${targetOrder.id} from quoted context!`);
        }
      }
    }
  }

  // Fallback 2: Check most recent orders where night confirmation was sent
  if (!targetOrder) {
    const recentNightOrders = orders.filter((o) => {
      if (!o.nightConfirmationSent) return false;
      const ageHours = (Date.now() - new Date(o.nightConfirmationSentAt || o.createdAt || 0).getTime()) / (1000 * 3600);
      return ageHours <= 12 && ['pending', 'hold'].includes(o.status);
    });
    recentNightOrders.sort((a, b) => new Date(b.nightConfirmationSentAt || b.createdAt || 0).getTime() - new Date(a.nightConfirmationSentAt || a.createdAt || 0).getTime());
    if (recentNightOrders.length > 0) {
      targetOrder = recentNightOrders[0];
      console.log(`[Baileys Bot] Matched latest recent night order #${targetOrder.id} (${targetOrder.customer?.phone}) via nightConfirmationSent fallback!`);
    }
  }

  // Auto-save LID reverse mapping when targetOrder is determined
  if (targetOrder && remoteJid.endsWith('@lid')) {
    const lid = remoteJid.split('@')[0];
    const customerPhone = String(targetOrder.customer?.phone || '').replace(/\D/g, '');
    if (customerPhone && lid) {
      try {
        writeFileSync(join(AUTH_DIR, `lid-mapping-${lid}_reverse.json`), JSON.stringify(customerPhone));
        console.log(`[Baileys Bot] Auto-linked LID ${lid} -> phone ${customerPhone}`);
      } catch (_) {}
    }
  }

  if (!targetOrder) {
    console.log(`[WhatsApp Bot] No matching active order found for reply "${rawText}" from JID ${remoteJid}`);
    return;
  }

  console.log(`[WhatsApp Bot] Processing customer reply '${rawText}' (Intent: ${intent}) for Order #${targetOrder.id} (${targetOrder.customer?.name}). Current status: ${targetOrder.status}`);

  const customerName = targetOrder.customer?.name || 'Sir/Mam';
  const orderId = targetOrder.id;
  const total = targetOrder.total || 0;

  if (intent === 'CONFIRM') {
    // User requested "approved" status on 1
    const targetStatus = 'approved';

    if (targetOrder.status === 'approved') {
      const alreadyMsg = `সম্মানিত ${customerName}! আপনার #${orderId} নম্বর অর্ডারটি ইতিমধ্যে Approved (কনফার্ম) করা রয়েছে। কাল সকালে কুরিয়ারে হস্তান্তর করা হবে।`;
      try { await safeSendMessage(remoteJid, { text: alreadyMsg }); } catch (_) {}
      return;
    }

    if (targetOrder.status === 'cancelled') {
      const cancelledNotice = `প্রিয় ${customerName}, আপনার #${orderId} নম্বর অর্ডারটি বাতিল করা আছে। আপনি চাইলে আমাদের ওয়েবসাইটে নতুন করে অর্ডার করতে পারেন: https://metrroma.com`;
      try { await safeSendMessage(remoteJid, { text: cancelledNotice }); } catch (_) {}
      return;
    }

    // Update to approved!
    targetOrder.status = targetStatus;
    targetOrder.approvedAt = new Date().toISOString();
    targetOrder.confirmedBy = 'customer_whatsapp_bot';
    targetOrder.history = targetOrder.history || [];
    targetOrder.history.push({
      status: targetStatus,
      note: `Auto-approved by customer via WhatsApp (customer replied: "${rawText}")`,
      at: new Date().toISOString(),
    });
    saveOrders(orders);
    recentCustomerPhotos.delete(remoteJid);
    recentProductInquiries.delete(remoteJid);

    const replyTemplate = nightTrigger.replyConfirmTemplate || `ধন্যবাদ {name}! আপনার #{order_id} নম্বর অর্ডারটি সফলভাবে Approved (নিশ্চিত) করা হয়েছে। মোট বিল: ৳{total} (COD)। দ্রুত আপনার পার্সেলটি কুরিয়ারে হস্তান্তর করা হবে। 💖`;
    let replyText = replyTemplate
      .replace(/{name}/g, customerName)
      .replace(/{order_id}/g, orderId)
      .replace(/{total}/g, String(total));

    const isNight = new Date().getUTCHours() + 6 >= 23 || new Date().getUTCHours() + 6 < 8;
    if (!isNight) {
      replyText = replyText.replace(/কাল সকালে/g, 'আজকে দ্রুত');
    }

    const customerDigits = String(targetOrder.customer?.phone || '').replace(/\D/g, '');
    await simulateHumanTypingAndSend(remoteJid, replyText, customerDigits, orderId, 'night_auto_reply');
    console.log(`[WhatsApp Bot] Order #${orderId} successfully set to APPROVED via customer WhatsApp reply!`);
  } else if (intent === 'CANCEL') {
    if (targetOrder.status === 'cancelled') {
      const alreadyMsg = `সম্মানিত ${customerName}, আপনার #${orderId} নম্বর অর্ডারটি ইতিমধ্যে বাতিল করা আছে।`;
      await simulateHumanTypingAndSend(remoteJid, alreadyMsg);
      return;
    }

    // Update to cancelled
    targetOrder.status = 'cancelled';
    targetOrder.cancelledAt = new Date().toISOString();
    targetOrder.cancelledBy = 'customer_whatsapp_bot';
    targetOrder.history = targetOrder.history || [];
    targetOrder.history.push({
      status: 'cancelled',
      note: `Auto-cancelled by customer via WhatsApp (customer replied: "${rawText}")`,
      at: new Date().toISOString(),
    });
    saveOrders(orders);
    recentCustomerPhotos.delete(remoteJid);
    recentProductInquiries.delete(remoteJid);

    const replyTemplate = nightTrigger.replyCancelTemplate || `আপনার অনুরোধ অনুযায়ী #{order_id} নম্বর অর্ডারটি বাতিল (Cancel) করা হয়েছে। ভবিষ্যতে আপনার সেবায় আবার সুযোগ পেলে আনন্দিত হব। ধন্যবাদ! 🌸`;
    const replyText = replyTemplate
      .replace(/{name}/g, customerName)
      .replace(/{order_id}/g, orderId)
      .replace(/{total}/g, String(total));

    const customerDigits = String(targetOrder.customer?.phone || '').replace(/\D/g, '');
    await simulateHumanTypingAndSend(remoteJid, replyText, customerDigits, orderId, 'night_auto_reply');
    console.log(`[WhatsApp Bot] Order #${orderId} automatically CANCELLED via customer WhatsApp reply!`);
  }
}

// ---- Anti-Ban Human Typing Simulator ----
async function simulateHumanTypingAndSend(targetJid, text, fallbackDigits = null, orderId = null, eventType = 'night_auto_reply') {
  if (!sock) return false;
  try {
    // 1. Natural read delay: 1.0s - 1.8s (simulates human reading the customer message)
    const readDelay = 1000 + Math.floor(Math.random() * 800);
    await new Promise((r) => setTimeout(r, readDelay));

    // 2. Mark composing presence (shows 'typing...' in customer's WhatsApp chat)
    try {
      await sock.sendPresenceUpdate('composing', targetJid);
    } catch (_) {}

    // 3. Human typing speed: 1.8s - 3.5s based on character length
    const charDelay = Math.min(3500, Math.max(1800, (text || '').length * 15));
    const jitter = Math.floor(Math.random() * 800);
    const typingDuration = charDelay + jitter;
    console.log(`[WhatsApp Anti-Ban] Simulating human typing for ${(typingDuration / 1000).toFixed(1)}s to ${targetJid}...`);
    await new Promise((r) => setTimeout(r, typingDuration));

    // 4. Send message directly to conversational thread
    await safeSendMessage(targetJid, { text });

    // 5. Reset presence
    try {
      await sock.sendPresenceUpdate('paused', targetJid);
    } catch (_) {}

    lastMessageSentTimestamp = Date.now();
    return true;
  } catch (err) {
    console.warn(`[WhatsApp Direct Send Error to ${targetJid}]:`, err?.message || err);
    if (fallbackDigits) {
      await sendBaileysMessage(fallbackDigits, text, orderId, eventType);
    }
    return false;
  }
}

// ---- WhatsApp Safe Sequential Dispatch Queue (Anti-Ban 30s Throttle) ----
const waQueue = [];
let isProcessingQueue = false;
let lastMessageSentTimestamp = 0;
const MIN_GAP_MS = 30000; // Minimum 30 seconds between outgoing messages
const recentSentEvents = new Map(); // dedupeKey -> timestamp (15 min cache)

function cleanupRecentEvents() {
  const now = Date.now();
  for (const [k, v] of recentSentEvents.entries()) {
    if (now - v > 15 * 60 * 1000) recentSentEvents.delete(k);
  }
}

export function getWhatsAppQueueStatus() {
  return {
    queueLength: waQueue.length,
    minGapSeconds: 30,
    lastSentAt: lastMessageSentTimestamp ? new Date(lastMessageSentTimestamp).toISOString() : null,
  };
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
    queueLength: waQueue.length,
    minGapSeconds: 30,
    geminiApiKey: settings.geminiApiKey || '',
    visionMatcherEnabled: settings.visionMatcherEnabled !== false,
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

async function processWaQueue() {
  if (isProcessingQueue) return;
  isProcessingQueue = true;

  try {
    while (waQueue.length > 0) {
      if (!isConnected || !sock) {
        console.warn(`[WhatsApp Queue] Paused: WhatsApp not connected. ${waQueue.length} message(s) waiting in queue.`);
        break;
      }

      const item = waQueue.shift();
      if (!item) continue;

      // Anti-Ban: Jittered randomized gap (Marketing offers paced by frontend loop, system triggers use MIN_GAP_MS)
      const isMarketing = item.eventType === 'marketing_offer' || item.eventType === 'test_ping';
      const configuredGap = isMarketing ? 800 : (item.delayMs ? Math.max(2000, item.delayMs) : MIN_GAP_MS);
      const randomGapMs = configuredGap + (isMarketing ? 400 : Math.floor(Math.random() * 2000));
      const elapsed = Date.now() - lastMessageSentTimestamp;
      if (lastMessageSentTimestamp > 0 && elapsed < randomGapMs) {
        const waitMs = randomGapMs - elapsed;
        console.log(`[WhatsApp Queue] Anti-Ban human gap: waiting ${(waitMs / 1000).toFixed(1)}s before next message to ${item.phone}...`);
        await new Promise((r) => setTimeout(r, waitMs));
      }

      const jid = `${item.phone}@s.whatsapp.net`;
      let success = false;
      let errorMsg = null;

      try {
        // Anti-Ban: Show realistic human typing presence before releasing message
        try {
          await sock.sendPresenceUpdate('composing', jid);
          const typingTime = isMarketing ? (800 + Math.floor(Math.random() * 700)) : (1800 + Math.floor(Math.random() * 1500));
          await new Promise((r) => setTimeout(r, typingTime));
        } catch (_) {}

        let messageContent = { text: item.text || '' };

        if (item.imageUrl && typeof item.imageUrl === 'string') {
          try {
            const trimmedImg = item.imageUrl.trim();
            let imageBuffer = null;

            if (trimmedImg.startsWith('/uploads/')) {
              const fileName = trimmedImg.replace(/^\/uploads\//, '');
              const candidatePaths = [
                join(getPersistentDataDirectory(), 'uploads', fileName),
                join('/var/www/dot/uploads', fileName),
                join(__dir, 'uploads', fileName),
                join(__dir, '..', 'uploads', fileName),
                join('/var/www/secrate_persistent_data/uploads', fileName),
              ];
              for (const p of candidatePaths) {
                if (existsSync(p)) {
                  imageBuffer = readFileSync(p);
                  break;
                }
              }
            } else if (trimmedImg.startsWith('http://') || trimmedImg.startsWith('https://')) {
              const r = await fetch(trimmedImg);
              if (r.ok) {
                const ab = await r.arrayBuffer();
                imageBuffer = Buffer.from(ab);
              }
            } else if (existsSync(trimmedImg)) {
              imageBuffer = readFileSync(trimmedImg);
            }

            if (imageBuffer) {
              messageContent = {
                image: imageBuffer,
                caption: item.text || '',
              };
            } else if (trimmedImg.startsWith('http')) {
              messageContent = {
                image: { url: trimmedImg },
                caption: item.text || '',
              };
            }
          } catch (imgErr) {
            console.warn('[WhatsApp Queue Image Resolve Error]:', imgErr?.message || imgErr);
          }
        }

        await safeSendMessage(jid, messageContent);
        try { await sock.sendPresenceUpdate('paused', jid); } catch (_) {}
        lastMessageSentTimestamp = Date.now();
        success = true;
        if (item.dedupeKey) {
          recentSentEvents.set(item.dedupeKey, Date.now());
        }
        console.log(`[WhatsApp Queue] Message sent to ${item.phone} (Order: #${item.orderId || 'N/A'}, Image: ${!!item.imageUrl}, Event: ${item.eventType}).`);
      } catch (err) {
        console.error(`[WhatsApp Queue] Send failed to ${item.phone}:`, err?.message || err);
        errorMsg = err?.message || 'Send error';
      }

      const logEntry = {
        id: item.id,
        at: new Date().toISOString(),
        phone: item.phone,
        orderId: item.orderId,
        eventType: item.eventType,
        message: item.text,
        status: success ? 'delivered' : 'failed',
        details: errorMsg || (success ? 'Delivered via 30s anti-ban queue' : null),
      };

      try {
        const current = getWhatsAppSettings();
        const logs = [logEntry, ...(current.logs || [])].slice(0, 100);
        saveWhatsAppSettings({ logs });
      } catch (_) {}

      if (typeof item.resolve === 'function') {
        item.resolve({ sent: success, log: logEntry, error: errorMsg });
      }
    }
  } catch (err) {
    console.error('[WhatsApp Queue] Processor error:', err);
  } finally {
    isProcessingQueue = false;
  }
}

export async function sendBaileysMessage(phone, text, orderId = null, eventType = 'manual_broadcast', imageUrl = null, delayMs = null) {
  cleanupRecentEvents();

  const cleanPhone = String(phone || '').replace(/\D/g, '');
  if (!cleanPhone || cleanPhone.length < 10) {
    return { sent: false, reason: 'Invalid phone number' };
  }
  const digits = cleanPhone.startsWith('88') ? cleanPhone : '88' + cleanPhone.slice(-11);

  // Deduplication for order triggers (prevent double sending within 15 mins)
  const dedupeKey = orderId && eventType && eventType !== 'marketing_offer' ? `${orderId}_${eventType}` : null;
  if (dedupeKey && recentSentEvents.has(dedupeKey)) {
    console.log(`[WhatsApp Queue] Skipping duplicate message for ${dedupeKey}`);
    return { sent: false, reason: 'Duplicate event already dispatched recently' };
  }
  if (dedupeKey && waQueue.some((q) => q.dedupeKey === dedupeKey)) {
    console.log(`[WhatsApp Queue] Duplicate message already queued for ${dedupeKey}`);
    return { sent: false, reason: 'Event already waiting in queue' };
  }

  // Create queue item
  return new Promise((resolve) => {
    const queueItem = {
      id: 'wa_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
      phone: digits,
      text,
      orderId,
      eventType,
      imageUrl,
      delayMs,
      dedupeKey,
      queuedAt: Date.now(),
      resolve,
    };

    waQueue.push(queueItem);
    console.log(`[WhatsApp Queue] Enqueued message for ${digits} (Event: ${eventType}, Image: ${!!imageUrl}, Queue size: ${waQueue.length})`);

    // Immediate queue processing attempt
    processWaQueue().catch(() => {});
  });
}

registerBaileysSender(sendBaileysMessage);

if (existsSync(join(AUTH_DIR, 'creds.json'))) {
  startWhatsAppSocket(false).catch((e) => console.warn('[Baileys auto-resume note]:', e?.message));
}
