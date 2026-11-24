import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { getWhatsAppSettings, saveWhatsAppSettings, formatWhatsAppMessage, registerBaileysSender, isPhoneOptedOut, markPhoneOptedOut } from './whatsapp_engine.js';
import { handleWhatsAppAutoOrderFlow } from './whatsapp_order_bot.js';
import { handleWhatsAppVisionOrInquiryFlow, isWhatsAppImageMessage, recentCustomerPhotos, recentProductInquiries } from './whatsapp_vision_bot.js';
import { getWaAiConfig, handleSmartWhatsAppAI, isWhatsAppAudioMessage, isAiPausedForChat, pauseAiForChat } from './whatsapp_ai_agent.js';
import { getPersistentDataDirectory, getOrders, saveOrders, updateOrder, upsertWaChatContact, getWaChatContacts, getWaMessages, pruneWhatsAppInboxMedia, syncWhatsAppSessionContacts, appendWaMessage, appendWaMessages, updateWaMessageDeliveryStatus, updateWaMessageMedia, normalizeWhatsAppInboxLidAliases } from './store.js';

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
const processedIncomingMessageIds = new Map(); // message id -> processed timestamp
const profilePictureCache = new Map();
const profilePictureInflight = new Map();
async function mappedPnJidForLid(lidJid) {
  const lid = String(lidJid || '').split('@')[0].split(':')[0];
  const reversePath = join(AUTH_DIR, `lid-mapping-${lid}_reverse.json`);
  if (existsSync(reversePath)) {
    try {
      const stored = JSON.parse(readFileSync(reversePath, 'utf8'));
      if (typeof stored === 'string' && stored) return stored.includes('@') ? stored : `${stored.replace(/\D/g, '')}@s.whatsapp.net`;
    } catch (_) {}
  }
  try { return await sock?.signalRepository?.lidMapping?.getPNForLID(lidJid).catch(() => null) || null; }
  catch (_) { return null; }
}
const msgRetryCounterCache = new Map();
let reconnectTimer = null;
const botSentMessageIds = new Set();
const recentAutomatedReplies = new Map(); // recipient + exact reply -> send timestamp
const recentAutomatedReplyEvents = new Map(); // recipient + event -> cooldown timestamp
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
let downloadMediaMessage = null;
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
    downloadMediaMessage = baileys.downloadMediaMessage;
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

function unwrapWhatsAppMessage(message) {
  let current = message?.message || message || {};
  for (let depth = 0; depth < 8; depth++) {
    const wrapped = current.ephemeralMessage?.message || current.viewOnceMessage?.message || current.viewOnceMessageV2?.message || current.viewOnceMessageV2Extension?.message || current.documentWithCaptionMessage?.message || current.deviceSentMessage?.message;
    if (!wrapped) break;
    current = wrapped;
  }
  return current;
}

function describeWhatsAppMedia(message, mediaType) {
  const body = unwrapWhatsAppMessage(message);
  const node = mediaType === 'image' ? body.imageMessage
    : mediaType === 'audio' ? body.audioMessage
      : mediaType === 'video' ? body.videoMessage
        : body.documentMessage || body.stickerMessage;
  if (!node) return null;
  const mimeType = String(node.mimetype || (mediaType === 'image' ? 'image/jpeg' : mediaType === 'audio' ? 'audio/ogg' : mediaType === 'video' ? 'video/mp4' : 'application/octet-stream')).toLowerCase().split(';')[0];
  const extensionByMime = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
    'video/mp4': 'mp4', 'video/3gpp': '3gp', 'video/quicktime': 'mov',
    'audio/ogg': 'ogg', 'audio/opus': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'mp4', 'audio/webm': 'webm', 'audio/wav': 'wav', 'audio/amr': 'amr',
    'application/pdf': 'pdf', 'text/plain': 'txt',
    'application/vnd.android.package-archive': 'apk',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  };
  const ext = extensionByMime[mimeType];
  if (!ext) return null;
  const suppliedName = String(node.fileName || node.fileNameHint || '').replace(/[\\/\0-\x1f]/g, '').slice(0, 120);
  return { mimeType, fileName: suppliedName || `whatsapp-${mediaType}-${Date.now()}.${ext}`, ext };
}

async function persistWhatsAppInboxMedia(message, mediaType) {
  if (!downloadMediaMessage || !sock || !['image', 'audio', 'video', 'document'].includes(mediaType)) return {};
  const media = describeWhatsAppMedia(message, mediaType);
  if (!media) return {};
  try {
    const buffer = await downloadMediaMessage(message, 'buffer', {}, {
      logger: pino ? pino({ level: 'silent' }) : console,
      reuploadRequest: sock.updateMediaMessage,
    });
    if (!Buffer.isBuffer(buffer) || buffer.length === 0 || buffer.length > 16 * 1024 * 1024) {
      console.warn(`[WhatsApp Inbox] Skipped ${mediaType}: file is empty or exceeds 16 MB.`);
      return {};
    }
    const directory = join(getPersistentDataDirectory(), 'uploads', 'wa-inbox');
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const fileName = `${randomUUID()}.${media.ext}`;
    writeFileSync(join(directory, fileName), buffer, { flag: 'wx', mode: 0o600 });
    pruneWhatsAppInboxMedia();
    return { mediaUrl: `/admin/whatsapp/inbox/media/${fileName}`, fileName: media.fileName, mimeType: media.mimeType };
  } catch (error) {
    console.warn(`[WhatsApp Inbox] Could not download ${mediaType}:`, error?.message || error);
    return {};
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
        // 428 is a normal connection-closed signal in Baileys; don't erase a valid linked session for it.
        const isCorruptSession = statusCode === 401 || statusCode === 403 || statusCode === 411 || statusCode === 405;

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

        try {
          const normalized = normalizeWhatsAppInboxLidAliases();
          if (normalized.contacts || normalized.messages) console.log(`[WhatsApp Inbox] Merged ${normalized.contacts} duplicate contact alias(es) and normalized ${normalized.messages} message(s).`);
        } catch (error) {
          console.warn('[WhatsApp Inbox] Contact alias normalization skipped:', error?.message || error);
        }

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
        // Save sync/append messages into the Inbox, but only notify events may run customer automation.
        const shouldRunAutomation = upsert?.type === 'notify';
        console.log('[Baileys raw msg]:', JSON.stringify({ fromMe: m?.key?.fromMe, jid: m?.key?.remoteJid, keys: m?.message ? Object.keys(m.message) : [], stub: m?.messageStubType }));
        if (m?.key?.id && m.message) {
          recentMessageMap.set(m.key.id, m.message);
          if (recentMessageMap.size > 500) {
            const first = recentMessageMap.keys().next().value;
            recentMessageMap.delete(first);
          }
        }
        if (shouldRunAutomation && !m?.key?.fromMe && m?.key?.id) {
          const now = Date.now();
          for (const [id, at] of processedIncomingMessageIds) {
            if (now - at > 10 * 60 * 1000) processedIncomingMessageIds.delete(id);
          }
          if (processedIncomingMessageIds.has(m.key.id)) continue;
          processedIncomingMessageIds.set(m.key.id, now);
          if (processedIncomingMessageIds.size > 2000) {
            processedIncomingMessageIds.delete(processedIncomingMessageIds.keys().next().value);
          }
        }
        try {
          await handleIncomingWhatsAppBotMessage(m, { shouldRunAutomation });
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
        }
        if (u?.key?.id && Number.isFinite(Number(u?.update?.status))) {
          const statusCode = Number(u.update.status);
          if (statusCode >= 4) updateWaMessageDeliveryStatus(u.key.id, 'read');
          else if (statusCode >= 3) updateWaMessageDeliveryStatus(u.key.id, 'delivered');
        }
      }
    });

    // Capture & Sync All Historical Chats and Contacts from WhatsApp Multi-Device
    sock.ev.on('messaging-history.set', async ({ chats, contacts, messages }) => {
      console.log(`[Baileys History Sync] Syncing historical contacts: ${chats?.length || 0} chats, ${contacts?.length || 0} contacts, ${messages?.length || 0} messages`);
      try {
        if (Array.isArray(contacts)) {
          for (const c of contacts) {
            if (c.id && c.id.endsWith('@s.whatsapp.net')) {
              const raw = c.id.split('@')[0];
              const name = c.name || c.notify || c.verifiedName || '';
              upsertWaChatContact({ phone: raw, remoteJid: c.id, name, isIncoming: true });
            }
          }
        }
        if (Array.isArray(chats)) {
          for (const ch of chats) {
            if (ch.id && ch.id.endsWith('@s.whatsapp.net')) {
              const raw = ch.id.split('@')[0];
              const name = ch.name || '';
              upsertWaChatContact({ phone: raw, remoteJid: ch.id, name, isIncoming: true });
            }
          }
        }
        if (Array.isArray(messages)) {
          const inboxMessages = [];
          let recoveredMediaCount = 0;
          const storedMediaById = new Map(getWaMessages().filter((item) => item.waMessageId && item.mediaUrl).map((item) => [item.waMessageId, item]));
          for (const m of messages) {
            const jid = m.key?.remoteJid || '';
            if (jid && !jid.includes('@g.us') && !jid.includes('status@broadcast')) {
              const raw = resolvePhoneFromJid(jid) || jid.split('@')[0].split(':')[0];
              const pushName = m.pushName || '';
              const txt = extractMessageText(m.message || {});
              upsertWaChatContact({ phone: raw, remoteJid: jid, name: pushName, lastMessage: txt, isIncoming: !m.key?.fromMe });
              const body = m.message?.ephemeralMessage?.message || m.message?.viewOnceMessage?.message || m.message?.viewOnceMessageV2?.message || m.message?.documentWithCaptionMessage?.message || m.message || {};
              const mediaType = isWhatsAppImageMessage(m) ? 'image'
                : isWhatsAppAudioMessage(m) ? 'audio'
                  : body.videoMessage ? 'video'
                    : body.documentMessage || body.stickerMessage ? 'document'
                      : 'text';
              if (txt || mediaType !== 'text') {
                let media = {};
                const storedMessage = m.key?.id ? storedMediaById.get(m.key.id) : null;
                if (mediaType !== 'text' && storedMessage) {
                  media = { mediaUrl: storedMessage.mediaUrl, fileName: storedMessage.fileName, mimeType: storedMessage.mimeType };
                } else if (mediaType !== 'text' && recoveredMediaCount < 20) {
                  recoveredMediaCount += 1;
                  media = await persistWhatsAppInboxMedia(m, mediaType);
                }
                const stamp = typeof m.messageTimestamp?.toNumber === 'function' ? m.messageTimestamp.toNumber() : Number(m.messageTimestamp || 0);
                inboxMessages.push({
                  phone: raw,
                  remoteJid: jid,
                  direction: m.key?.fromMe ? 'out' : 'in',
                  text: txt || (mediaType === 'image' ? '[Photo]' : mediaType === 'video' ? '[Video]' : mediaType === 'audio' ? '[Voice Note]' : '[Attachment]'),
                  mediaType,
                  ...media,
                  senderName: pushName,
                  waMessageId: m.key?.id || '',
                  deliveryStatus: m.key?.fromMe ? 'sent' : 'received',
                  timestamp: stamp > 0 ? new Date(stamp * 1000).toISOString() : new Date().toISOString(),
                });
              }
            }
          }
          const imported = appendWaMessages(inboxMessages);
          if (imported.added) console.log(`[Baileys History Sync] Imported ${imported.added} conversation message(s) into Inbox.`);
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
          upsertWaChatContact({ phone: raw, remoteJid: c.id, name, isIncoming: true });
        }
      }
    });

    sock.ev.on('chats.upsert', (chats) => {
      if (!Array.isArray(chats)) return;
      for (const ch of chats) {
        if (ch.id && ch.id.endsWith('@s.whatsapp.net')) {
          const raw = ch.id.split('@')[0];
          const name = ch.name || '';
          upsertWaChatContact({ phone: raw, remoteJid: ch.id, name, isIncoming: true });
        }
      }
    });

    // Keep incoming WhatsApp calls ringing on the user's linked WhatsApp Web/desktop devices.
    sock.ev.on('call', async (calls) => {
      if (!Array.isArray(calls)) return;
      console.log(`[Baileys Call Event] Received ${calls.length} call signal(s)`);
      for (const call of calls) {
        try {
          console.log(`[Baileys Call] id=${call.id}, from=${call.from}, status=${call.status}, isVideo=${call.isVideo}`);
          // 'offer' indicates an incoming ringing call
          if (call.status === 'offer') {
            const callerJid = call.from;
            if (!callerJid || callerJid.includes('@g.us')) continue; // Ignore group calls
            const rawDigits = resolvePhoneFromJid(callerJid) || (callerJid.split('@')[0] || '').replace(/\D/g, '');
            const callKind = call.isVideo ? 'video' : 'voice';
            upsertWaChatContact({ phone: rawDigits, remoteJid: callerJid, name: '', lastMessage: `Incoming ${callKind} call`, isIncoming: true });
            appendWaMessage({
              phone: rawDigits,
              remoteJid: callerJid,
              direction: 'in',
              text: call.isVideo
                ? '📹 Incoming WhatsApp video call · Answer from WhatsApp Web on your PC'
                : '📞 Incoming WhatsApp voice call · Answer from WhatsApp Web on your PC',
              mediaType: 'call',
              byStaff: 'customer_call',
              waMessageId: call.id ? `call_${call.id}` : '',
            });
            console.log(`[Baileys Call] Leaving ${callKind} call from ${callerJid} ringing on linked WhatsApp devices.`);
          }
        } catch (callErr) {
          console.error('[Baileys Call Processing Error]:', callErr?.message || callErr);
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

  return text;
}

function classifyCustomerReply(rawText) {
  const text = String(rawText || '').toLowerCase().trim();
  if (!text) return null;
  // This flow explicitly asks customers to reply 1 or 2. Free-form yes/no or
  // text containing a number must never change an order's status.
  if (/^(?:1|১)(?:[.!।)\]|️⃣])?(?:\s+(?:#?DOT-[A-F0-9]+|#[A-F0-9]{6,}))?$/i.test(text)) return 'CONFIRM';
  if (/^(?:2|২)(?:[.!।)\]|️⃣])?(?:\s+(?:#?DOT-[A-F0-9]+|#[A-F0-9]{6,}))?$/i.test(text)) return 'CANCEL';
  return null;
}

async function handleIncomingWhatsAppBotMessage(m, { shouldRunAutomation = true } = {}) {
  if (!m || !m.key) return;
  const remoteJid = m.key.remoteJid || '';
  if (!remoteJid || remoteJid.includes('@g.us') || remoteJid.includes('status@broadcast')) return;

  // Automatically capture everyone who ever chats or messages
  try {
    const raw = resolvePhoneFromJid(remoteJid) || remoteJid.split('@')[0];
    const pushName = m.pushName || '';
    const txt = extractMessageText(m.message || {});
    upsertWaChatContact({
      phone: raw,
      remoteJid,
      name: pushName,
      lastMessage: txt,
      isIncoming: !m.key?.fromMe,
    });
    const body = unwrapWhatsAppMessage(m);
    const mediaType = isWhatsAppImageMessage(m) ? 'image'
      : isWhatsAppAudioMessage(m) ? 'audio'
        : body.videoMessage ? 'video'
          : body.documentMessage || body.stickerMessage ? 'document'
            : 'text';
    if (txt || mediaType !== 'text') {
      const storedMessage = m.key?.id ? getWaMessages().find((item) => item.waMessageId === m.key.id && item.mediaUrl) : null;
      const media = storedMessage
        ? { mediaUrl: storedMessage.mediaUrl, fileName: storedMessage.fileName, mimeType: storedMessage.mimeType }
        : await persistWhatsAppInboxMedia(m, mediaType);
      const savedMessage = appendWaMessage({
        phone: raw,
        remoteJid,
        direction: m.key?.fromMe ? 'out' : 'in',
        text: txt || (mediaType === 'image' ? '[Photo]' : mediaType === 'video' ? '[Video]' : mediaType === 'audio' ? '[Voice Note]' : '[Attachment]'),
        mediaType,
        ...media,
        senderName: pushName,
        waMessageId: m.key?.id || '',
        deliveryStatus: m.key?.fromMe ? 'sent' : 'received',
      });
      if (savedMessage?.waMessageId && media.mediaUrl) updateWaMessageMedia(savedMessage.waMessageId, media);
      if (savedMessage) console.log(`[WhatsApp Inbox] Captured ${m.key?.fromMe ? 'outgoing' : 'incoming'} ${mediaType} message.`);
    }
  } catch (captureError) {
    console.error('[WhatsApp Inbox capture error]:', captureError?.message || captureError);
  }

  if (!shouldRunAutomation) return;

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
      pauseAiForChat(remoteJid, p, 'human_whatsapp_reply');
      console.log(`[Representative Active] Human staff spoke with ${remoteJid} (${p || 'no-phone'}). Automation paused for ${getWaAiConfig().pauseMinutes} minutes.`);
      return;
    }
  }

  let phone = resolvePhoneFromJid(remoteJid);
  if (!phone && m.key.participant) {
    phone = resolvePhoneFromJid(m.key.participant);
  }

  const rawText = extractMessageText(m);
  // Opt-out always takes precedence over staff takeover or any automation pause.
  const cleanReplyText = (rawText || '').trim().toLowerCase();
  if (['stop', 'unsubscribe', 'থামুন', 'বন্ধ', 'মেসেজ দিয়েন না', 'আর মেসেজ দিয়েন না', 'বন্ধ করুন'].includes(cleanReplyText)) {
    markPhoneOptedOut(phone || remoteJid.split('@')[0]);
    await simulateHumanTypingAndSend(remoteJid, 'আপনার অনুরোধ অনুযায়ী Secrate থেকে স্বয়ংক্রিয় আপডেট পাঠানো বন্ধ করা হয়েছে। যেকোনো প্রয়োজনে আমাদের জানাতে পারেন। ধন্যবাদ! 🌸');
    return;
  }

  // Honor persisted human takeover and escalation pauses before any bot workflow runs.
  const automationPause = isAiPausedForChat(remoteJid, phone);
  if (automationPause) {
    console.log(`[Bot Silenced] Automation paused for ${remoteJid} (${automationPause.reason}) until the handoff window expires.`);
    return;
  }

  // If human representative has spoken in this chat within the last 2 hours, STAY COMPLETELY SILENT!
  const lastStaffTime = humanRepresentativeActiveChats.get(remoteJid) || (phone ? humanRepresentativeActiveChats.get(phone) : 0);
  const handoffPauseMs = Math.max(5, Math.min(240, Number(getWaAiConfig().pauseMinutes) || 45)) * 60 * 1000;
  if (lastStaffTime && (Date.now() - lastStaffTime < handoffPauseMs)) {
    const elapsedMins = Math.round((Date.now() - lastStaffTime) / 60000);
    console.log(`[Bot Silenced] Human representative is actively talking with ${remoteJid} (${elapsedMins}m ago). Automated bot will NOT interfere.`);
    return;
  }

  // If the customer message is quoting a message from the store representative, also pause bot!
  const quotedParticipant = m.message?.extendedTextMessage?.contextInfo?.participant || '';
  if (quotedParticipant && (quotedParticipant.includes(myJidNum) || quotedParticipant.includes('8801916691768'))) {
    humanRepresentativeActiveChats.set(remoteJid, Date.now());
    if (phone) humanRepresentativeActiveChats.set(phone, Date.now());
    pauseAiForChat(remoteJid, phone, 'customer_replied_to_staff');
    console.log(`[Bot Silenced] Customer in ${remoteJid} is replying to representative's quoted message. Bot will NOT interfere.`);
    return;
  }

  const isImage = isWhatsAppImageMessage(m);
  const isAudio = isWhatsAppAudioMessage(m);
  console.log(`[Baileys Bot Message] From JID: ${remoteJid}, isImage: ${isImage}, isAudio: ${isAudio}, Text: "${rawText}"`);
  if (!rawText && !isImage && !isAudio) return;

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

  // 3. Smart Gemini AI Sales & Support Agent (FAQ, Order Tracking, Chat-to-Order, Voice Notes, Escalation)
  if (!intent || isAudio) {
    try {
      const handledBySmartAi = await handleSmartWhatsAppAI({
        sock,
        m,
        rawText,
        remoteJid,
        senderPhone: phone,
        pushName: m.pushName || '',
        isAudio,
        simulateHumanTypingAndSend,
      });
      if (handledBySmartAi) return;
    } catch (err) {
      console.error('[Smart WA AI Bot Error]:', err?.message || err);
    }
  }

  if (!intent) return; // Do not auto-respond to free-form chat to avoid interfering with manual staff chats

  console.log(`[Baileys Bot Message] Detected Intent: ${intent}, Resolved Phone: ${phone || 'NONE'}`);

  const waSettings = getWhatsAppSettings();
  if (!waSettings.enabled) return;
  const nightTrigger = waSettings.triggers?.night_confirmation || {};

  const orders = getOrders();
  let targetOrder = null;

  const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  const quotedText = quoted ? extractMessageText({ message: quoted }) : '';
  const eligibleOrders = phone && phone.length >= 10
    ? orders.filter((o) => {
        if (!o.customer?.phone || String(o.status || '').toLowerCase() !== 'pending' || !o.nightConfirmationSent) return false;
        const orderPhone = String(o.customer.phone).replace(/\D/g, '');
        if (!orderPhone.endsWith(phone.slice(-10))) return false;
        const sentAt = new Date(o.nightConfirmationSentAt || 0).getTime();
        return Number.isFinite(sentAt) && Date.now() - sentAt >= 0 && Date.now() - sentAt <= 12 * 60 * 60 * 1000;
      })
    : [];

  const confirmationText = `${rawText}\n${quotedText}`;
  const explicitOrder = eligibleOrders.find((o) => {
    const id = String(o.id || '').trim();
    if (!id) return false;
    const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|[^A-Za-z0-9])#?${escapedId}(?:$|[^A-Za-z0-9])`, 'i').test(confirmationText);
  });
  if (explicitOrder) {
    targetOrder = explicitOrder;
  } else if (eligibleOrders.length === 1) {
    targetOrder = eligibleOrders[0];
  } else if (eligibleOrders.length > 1) {
    const clarification = `আপনার নম্বরে একাধিক pending order আছে। কোন orderটি বোঝাচ্ছেন তা নিশ্চিত করতে order ID লিখুন: ${eligibleOrders.slice(0, 5).map((o) => `#${o.id}`).join(', ')}। আপাতত কোনো order status বদলাইনি।`;
    await simulateHumanTypingAndSend(remoteJid, clarification, phone, null, 'night_confirmation_ambiguous');
    return;
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
      if (targetOrder.waWinbackSentAt) {
        // Customer accepted the Win-back Free Delivery offer!
        targetOrder.status = 'approved';
        targetOrder.delivery = 0; // Free delivery
        targetOrder.total = Math.max(0, (targetOrder.itemsTotal || targetOrder.total) - (targetOrder.discount || 0));
        targetOrder.approvedAt = new Date().toISOString();
        targetOrder.winbackAcceptedAt = new Date().toISOString();
        targetOrder.confirmedBy = 'whatsapp_winback_bot';
        targetOrder.history = targetOrder.history || [];
        targetOrder.history.push({
          status: 'approved',
          note: `Auto-reactivated via WhatsApp Free Delivery Win-Back offer (customer replied: "${rawText}")`,
          at: new Date().toISOString(),
        });
        saveOrders(orders);
        const winbackReply = `ধন্যবাদ ${customerName}! 🎉 আপনার #${orderId} নম্বর অর্ডারটি সম্পূর্ণ ফ্রি ডেলিভারিতে (০৳ ডেলিভারি চার্জ) রি-অ্যাক্টিভেট করা হয়েছে। মোট বিল: ৳${targetOrder.total} (ক্যাশ অন ডেলিভারি)। দ্রুত পার্সেল পাঠানো হবে! 💖`;
        await simulateHumanTypingAndSend(remoteJid, winbackReply, phone, orderId, 'winback_reactivated');
        console.log(`[WhatsApp Bot] Order #${orderId} reactivated via Win-Back Free Delivery!`);
        return;
      }
      const cancelledNotice = `প্রিয় ${customerName}, আপনার #${orderId} নম্বর অর্ডারটি বাতিল করা আছে। আপনি চাইলে আমাদের ওয়েবসাইটে নতুন করে অর্ডার করতে পারেন: https://secrate.shop`;
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
async function simulateHumanTypingAndSend(targetJid, text, fallbackDigits = null, orderId = null, eventType = 'night_auto_reply', imageUrl = null) {
  if (!sock) return false;
  const normalizedReply = String(text || '').normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
  const dedupeKey = `${targetJid}\0${normalizedReply}`;
  const eventCooldowns = {
    wa_welcome_greeting: 30 * 60 * 1000,
    wa_womens_care_guide: 30 * 60 * 1000,
    wa_mens_care_guide: 30 * 60 * 1000,
    wa_ask_photo_or_name: 6 * 60 * 60 * 1000,
    wa_vision_unclear: 10 * 60 * 1000,
    wa_photo_ack: 10 * 60 * 1000,
  };
  const eventCooldown = eventCooldowns[eventType] || 0;
  const eventKey = `${targetJid}\0${eventType}`;
  const now = Date.now();
  for (const [key, at] of recentAutomatedReplies) if (now - at > 2 * 60 * 1000) recentAutomatedReplies.delete(key);
  for (const [key, at] of recentAutomatedReplyEvents) if (now - at > 6 * 60 * 60 * 1000) recentAutomatedReplyEvents.delete(key);
  if (eventCooldown && recentAutomatedReplyEvents.has(eventKey) && now - recentAutomatedReplyEvents.get(eventKey) < eventCooldown) {
    console.log(`[WhatsApp Auto Reply] Suppressed repeated ${eventType} for ${targetJid}.`);
    return true;
  }
  if (recentAutomatedReplies.has(dedupeKey)) {
    console.log(`[WhatsApp Auto Reply] Suppressed duplicate reply for ${targetJid}.`);
    return true;
  }
  recentAutomatedReplies.set(dedupeKey, now);
  if (eventCooldown) recentAutomatedReplyEvents.set(eventKey, now);
  if (recentAutomatedReplies.size > 5000) recentAutomatedReplies.delete(recentAutomatedReplies.keys().next().value);
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

    // 4. Send a catalog product image with its verified details when available.
    let content = { text };
    if (typeof imageUrl === 'string' && imageUrl.trim()) {
      const trimmedImage = imageUrl.trim();
      try {
        if (/^https?:\/\//i.test(trimmedImage)) {
          content = { image: { url: trimmedImage }, caption: text };
        } else if (trimmedImage.startsWith('/uploads/')) {
          const fileName = trimmedImage.replace(/^\/uploads\//, '');
          const candidates = [
            join(getPersistentDataDirectory(), 'uploads', fileName),
            join('/var/www/dot/uploads', fileName),
            join(__dir, 'uploads', fileName),
            join(__dir, '..', 'uploads', fileName),
            join('/var/www/secrate_persistent_data/uploads', fileName),
          ];
          const localImage = candidates.find((path) => existsSync(path));
          if (localImage) content = { image: readFileSync(localImage), caption: text };
        } else if (existsSync(trimmedImage)) {
          content = { image: readFileSync(trimmedImage), caption: text };
        }
      } catch (imageError) {
        console.warn('[WhatsApp Product Image] Could not attach product image:', imageError?.message || imageError);
      }
    }
    await safeSendMessage(targetJid, content);

    // 5. Reset presence
    try {
      await sock.sendPresenceUpdate('paused', targetJid);
    } catch (_) {}

    lastMessageSentTimestamp = Date.now();
    appendWaMessage({
      phone: fallbackDigits || targetJid.split('@')[0],
      remoteJid: targetJid,
      direction: 'out',
      text,
      mediaType: content.image ? 'image' : 'text',
      byStaff: eventType || 'ai_bot',
    });
    return true;
  } catch (err) {
    recentAutomatedReplies.delete(dedupeKey);
    recentAutomatedReplyEvents.delete(eventKey);
    console.warn(`[WhatsApp Direct Send Error to ${targetJid}]:`, err?.message || err);
    if (fallbackDigits) {
      await sendBaileysMessage(fallbackDigits, text, orderId, eventType, imageUrl);
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

export async function getWhatsAppProfilePicture(phone) {
  const input = String(phone || '').trim();
  if (!input || !isConnected || !sock?.profilePictureUrl) return null;
  const cacheKey = input;
  const cached = profilePictureCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.url;
  if (profilePictureInflight.has(cacheKey)) return profilePictureInflight.get(cacheKey);
  const digits = input.replace(/\D/g, '');
  let jid = '';
  if (/@(?:s\.whatsapp\.net|lid|hosted\.lid)$/.test(input)) jid = input;
  else if (digits.startsWith('8801') && digits.length === 13) jid = `${digits}@s.whatsapp.net`;
  else if (digits.startsWith('01') && digits.length === 11) jid = `88${digits.slice(1)}@s.whatsapp.net`;
  else if (digits.length >= 14 && digits.length <= 15 && !digits.startsWith('880')) jid = `${digits}@lid`;
  else if (digits.length >= 10 && digits.length <= 13) jid = `${digits}@s.whatsapp.net`;
  if (!jid) return null;
  const pending = (async () => {
  try {
    let url = await sock.profilePictureUrl(jid, 'image', 8000).catch(() => null);
    if (!url && /@(?:lid|hosted\.lid)$/.test(jid)) {
      const pnJid = await mappedPnJidForLid(jid);
      if (pnJid) url = await sock.profilePictureUrl(pnJid, 'image', 8000).catch(() => null);
    }
    profilePictureCache.set(cacheKey, { url: url || null, expiresAt: Date.now() + 15 * 60 * 1000 });
    while (profilePictureCache.size > 500) profilePictureCache.delete(profilePictureCache.keys().next().value);
    return url || null;
  } catch (_) {
    profilePictureCache.set(cacheKey, { url: null, expiresAt: Date.now() + 2 * 60 * 1000 });
    return null;
  } finally { profilePictureInflight.delete(cacheKey); }
  })();
  profilePictureInflight.set(cacheKey, pending);
  return pending;
}

export async function resolveWhatsAppPhoneNumber(value) {
  const input = String(value || '').trim();
  if (!input) return '';
  if (input.endsWith('@s.whatsapp.net') || input.endsWith('@hosted')) return input.split('@')[0].split(':')[0].replace(/\D/g, '');
  if (input.endsWith('@lid') || input.endsWith('@hosted.lid')) {
    try {
      const pnJid = await mappedPnJidForLid(input);
      return pnJid ? pnJid.split('@')[0].split(':')[0].replace(/\D/g, '') : '';
    } catch (_) { return ''; }
  }
  const digits = input.replace(/\D/g, '');
  if (digits.length >= 14 && digits.length <= 15 && !digits.startsWith('880')) {
    const pnJid = await mappedPnJidForLid(`${digits}@lid`);
    return pnJid ? pnJid.split('@')[0].split(':')[0].replace(/\D/g, '') : '';
  }
  return digits;
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

      // Anti-Ban: Jittered randomized gap (Marketing offers safe human 28-36s pacing, manual admin 2-3s, triggers paced by MIN_GAP_MS)
      const isMarketing = item.eventType === 'marketing_offer' || item.eventType === 'test_ping';
      const isManualAdmin = item.eventType === 'manual_admin' || item.eventType === 'admin_quick_msg' || item.eventType === 'escalation_reply' || item.eventType === 'inbox_reply';
      const configuredGap = isMarketing ? Math.max(28000, Number(item.delayMs) || 0) : isManualAdmin ? 2000 : (item.delayMs ? Math.max(10000, item.delayMs) : MIN_GAP_MS);
      const randomGapMs = configuredGap + (isManualAdmin ? Math.floor(Math.random() * 1000) : Math.floor(Math.random() * 8000));
      const elapsed = Date.now() - lastMessageSentTimestamp;
      if (lastMessageSentTimestamp > 0 && elapsed < randomGapMs) {
        const waitMs = randomGapMs - elapsed;
        console.log(`[WhatsApp Queue] Anti-Ban human gap: waiting ${(waitMs / 1000).toFixed(1)}s before next message to ${item.phone}...`);
        await new Promise((r) => setTimeout(r, waitMs));
      }

      const jid = item.remoteJid || `${item.phone}@s.whatsapp.net`;
      let success = false;
      let errorMsg = null;

      try {
        // Anti-Ban: Show realistic human typing presence before releasing message
        try {
          await sock.sendPresenceUpdate('composing', jid);
          const typingTime = isManualAdmin ? (1200 + Math.floor(Math.random() * 800)) : (2200 + Math.floor(Math.random() * 2000));
          await new Promise((r) => setTimeout(r, typingTime));
        } catch (_) {}

        let messageContent = { text: item.text || '' };

        if (item.attachment?.path && existsSync(item.attachment.path)) {
          const attachment = item.attachment;
          const fileBuffer = readFileSync(attachment.path);
          const caption = item.text || '';
          if (attachment.mediaType === 'image') messageContent = { image: fileBuffer, caption };
          else if (attachment.mediaType === 'video') messageContent = { video: fileBuffer, caption, mimetype: attachment.mimeType };
          else if (attachment.mediaType === 'audio') messageContent = { audio: fileBuffer, mimetype: attachment.mimeType, ptt: attachment.isVoiceNote === true };
          else messageContent = { document: fileBuffer, mimetype: attachment.mimeType || 'application/octet-stream', fileName: attachment.fileName || 'attachment', caption };
        }

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

        const waMessage = await safeSendMessage(jid, messageContent);
        try { await sock.sendPresenceUpdate('paused', jid); } catch (_) {}
        lastMessageSentTimestamp = Date.now();
        success = true;
        appendWaMessage({
          phone: item.phone,
          remoteJid: jid,
          direction: 'out',
          text: item.text || '',
          mediaType: item.attachment?.mediaType || (item.imageUrl ? 'image' : 'text'),
          mediaUrl: item.attachment?.mediaUrl || '',
          fileName: item.attachment?.fileName || '',
          mimeType: item.attachment?.mimeType || '',
          byStaff: item.eventType || 'bot',
          waMessageId: waMessage?.key?.id || '',
          deliveryStatus: 'sent',
        });
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

export async function sendBaileysMessage(phone, text, orderId = null, eventType = 'manual_broadcast', imageUrl = null, delayMs = null, attachment = null, remoteJidOverride = '') {
  cleanupRecentEvents();

  if (!isConnected || !sock) {
    return { sent: false, connected: false, reason: 'Store WhatsApp is not connected on server. Please scan QR in WhatsApp Automation tab.' };
  }

  const cleanPhone = String(phone || '').replace(/\D/g, '');
  if (!cleanPhone || cleanPhone.length < 10) {
    return { sent: false, reason: 'Invalid phone number' };
  }
  const directJid = /^(?:\d{5,20}@(s\.whatsapp\.net|lid|hosted\.lid))$/.test(String(remoteJidOverride || '')) ? String(remoteJidOverride) : '';
  const digits = directJid.endsWith('@lid') || directJid.endsWith('@hosted.lid')
    ? cleanPhone
    : cleanPhone.startsWith('88') ? cleanPhone : '88' + cleanPhone.slice(-11);

  // Anti-Ban: Verify customer hasn't opted out via STOP
  if (isPhoneOptedOut(cleanPhone) || isPhoneOptedOut(digits)) {
    console.log(`[WhatsApp Queue] Skipping message to ${digits}: customer opted out with STOP.`);
    return { sent: false, reason: 'Customer opted out with STOP' };
  }

  // Deduplication for automated order triggers (prevent double sending within 15 mins; manual admin actions bypass dedupe)
  const isManualAdmin = eventType === 'manual_admin' || eventType === 'admin_quick_msg' || eventType === 'escalation_reply' || eventType === 'inbox_reply';
  if (isManualAdmin) {
    pauseAiForChat(null, digits, 'admin_manual_reply');
  }
  const dedupeKey = (!isManualAdmin && orderId && eventType && eventType !== 'marketing_offer') ? `${orderId}_${eventType}` : null;
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
      remoteJid: directJid,
      text,
      orderId,
      eventType,
      imageUrl,
      attachment,
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
