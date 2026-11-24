import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import {
  addOrder,
  addStaffNotification,
  autoAssignOnlineStaff,
  getIntegrations,
  getOrders,
  getSettings,
  saveIntegrations,
} from './store.js';
import { getWhatsAppSettings } from './whatsapp_engine.js';
import { getActiveVisionCatalog } from './whatsapp_vision_bot.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dir, 'data');
const PERSISTENT_DIR = process.env.PERSISTENT_DATA_DIR || join(DATA_DIR, 'persistent');
const AI_FAQ_FILE = join(PERSISTENT_DIR, 'wa_ai_faq.json');
const AI_PAUSED_FILE = join(PERSISTENT_DIR, 'wa_ai_paused_chats.json');

// Per-chat conversation memory: key -> { turns: [{ role, text, at }], lastAiReplies: [string], updatedAt }
const chatMemory = new Map();
// AI pause state per chat (manual staff reply or escalation): key -> { pausedAt, pauseMs, reason }
const aiPausedChats = new Map();
// Prevent concurrent AI calls for the exact same customer message burst
const inFlightChats = new Set();

const DEFAULT_AI_CONFIG = {
  enabled: true,
  voiceNoteEnabled: true,
  chatToOrderEnabled: true,
  orderTrackEnabled: true,
  antiRepeatEnabled: true,
  escalationEnabled: true,
  pauseMinutes: 45,
  tone: 'friendly_bengali',
  storeInfo: '',
};

const ESCALATION_FALLBACK_REPLIES = [
  'আপনার প্রশ্নটি আমি আমাদের টিমের কাছে পাঠিয়ে দিয়েছি। একটু অপেক্ষা করুন, আমাদের একজন প্রতিনিধি এখনই দেখে আপনাকে সঠিক উত্তর জানাবেন। 🌸',
  'এই বিষয়টি নিয়ে আমাদের টিম চেক করছে। খুব শীঘ্রই আমাদের একজন সাপোর্ট প্রতিনিধি আপনাকে সরাসরি মেসেজ দেবেন। ধন্যবাদ! 💖',
  'ধন্যবাদ আপনার মেসেজের জন্য! বিষয়টি নিশ্চিত হয়ে আমাদের প্রতিনিধি একটু পরই আপনাকে বিস্তারিত জানাচ্ছেন। ✨',
];

function ensurePersistentDir() {
  if (!existsSync(PERSISTENT_DIR)) {
    mkdirSync(PERSISTENT_DIR, { recursive: true });
  }
}

function persistPausedChats() {
  try {
    ensurePersistentDir();
    const now = Date.now();
    for (const [key, value] of aiPausedChats) {
      if (!value || now - Number(value.pausedAt || 0) >= Number(value.pauseMs || 0)) aiPausedChats.delete(key);
    }
    writeFileSync(AI_PAUSED_FILE, JSON.stringify(Object.fromEntries(aiPausedChats)), 'utf8');
  } catch (err) {
    console.error('[Smart WA AI] Failed to persist human handoff state:', err?.message || err);
  }
}

function restorePausedChats() {
  try {
    if (!existsSync(AI_PAUSED_FILE)) return;
    const saved = JSON.parse(readFileSync(AI_PAUSED_FILE, 'utf8'));
    const now = Date.now();
    for (const [key, value] of Object.entries(saved || {})) {
      const pausedAt = Number(value?.pausedAt);
      const pauseMs = Number(value?.pauseMs);
      if (key && Number.isFinite(pausedAt) && Number.isFinite(pauseMs) && pauseMs > 0 && now - pausedAt < pauseMs) {
        aiPausedChats.set(key, { pausedAt, pauseMs, reason: String(value?.reason || 'human_takeover') });
      }
    }
    persistPausedChats();
  } catch (err) {
    console.error('[Smart WA AI] Could not restore human handoff state:', err?.message || err);
  }
}

restorePausedChats();

export function getWaAiConfig() {
  const ig = getIntegrations();
  const saved = ig?.whatsapp?.aiConfig || {};
  return {
    ...DEFAULT_AI_CONFIG,
    ...saved,
    pauseMinutes: Math.max(5, Math.min(240, Number(saved.pauseMinutes ?? DEFAULT_AI_CONFIG.pauseMinutes) || 45)),
  };
}

export function saveWaAiConfig(patch = {}) {
  const ig = getIntegrations();
  if (!ig.whatsapp) ig.whatsapp = {};
  const current = getWaAiConfig();
  ig.whatsapp.aiConfig = {
    ...current,
    ...(typeof patch.enabled === 'boolean' ? { enabled: patch.enabled } : {}),
    ...(typeof patch.voiceNoteEnabled === 'boolean' ? { voiceNoteEnabled: patch.voiceNoteEnabled } : {}),
    ...(typeof patch.chatToOrderEnabled === 'boolean' ? { chatToOrderEnabled: patch.chatToOrderEnabled } : {}),
    ...(typeof patch.orderTrackEnabled === 'boolean' ? { orderTrackEnabled: patch.orderTrackEnabled } : {}),
    ...(typeof patch.antiRepeatEnabled === 'boolean' ? { antiRepeatEnabled: patch.antiRepeatEnabled } : {}),
    ...(typeof patch.escalationEnabled === 'boolean' ? { escalationEnabled: patch.escalationEnabled } : {}),
    ...(patch.pauseMinutes !== undefined ? { pauseMinutes: Math.max(5, Math.min(240, Number(patch.pauseMinutes) || 45)) } : {}),
    ...(typeof patch.tone === 'string' && patch.tone.trim() ? { tone: patch.tone.trim() } : {}),
    ...(typeof patch.storeInfo === 'string' ? { storeInfo: patch.storeInfo } : {}),
  };
  saveIntegrations(ig);
  return ig.whatsapp.aiConfig;
}

export function getWaAiFaqs() {
  try {
    if (existsSync(AI_FAQ_FILE)) {
      const parsed = JSON.parse(readFileSync(AI_FAQ_FILE, 'utf8'));
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch (_) {}
  return [];
}

export function saveWaAiFaqs(faqs = []) {
  ensurePersistentDir();
  const clean = (Array.isArray(faqs) ? faqs : [])
    .filter((f) => f && String(f.question || '').trim() && String(f.answer || '').trim())
    .slice(0, 200)
    .map((f) => ({
      id: f.id || 'faq_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      question: String(f.question).trim(),
      answer: String(f.answer).trim(),
      createdAt: f.createdAt || new Date().toISOString(),
      createdBy: f.createdBy || 'admin',
    }));
  writeFileSync(AI_FAQ_FILE, JSON.stringify(clean, null, 2));
  return clean;
}

export function addWaAiFaq({ question, answer, createdBy = 'admin' }) {
  const q = String(question || '').trim();
  const a = String(answer || '').trim();
  if (!q || !a) return null;
  const list = getWaAiFaqs();
  const existingIdx = list.findIndex((f) => f.question.toLowerCase() === q.toLowerCase());
  const entry = {
    id: existingIdx >= 0 ? list[existingIdx].id : 'faq_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    question: q,
    answer: a,
    createdAt: new Date().toISOString(),
    createdBy,
  };
  if (existingIdx >= 0) {
    list[existingIdx] = entry;
  } else {
    list.unshift(entry);
  }
  saveWaAiFaqs(list);
  return entry;
}

export function deleteWaAiFaq(id) {
  const list = getWaAiFaqs().filter((f) => f.id !== id);
  saveWaAiFaqs(list);
  return list;
}

function getChatKeys(remoteJid, phone) {
  const keys = [];
  if (remoteJid) keys.push(String(remoteJid));
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length >= 10) keys.push(digits.slice(-10));
  return keys;
}

export function pauseAiForChat(remoteJid, phone, reason = 'manual_reply', minutes = null) {
  const cfg = getWaAiConfig();
  const pauseMs = Math.max(1, Number(minutes ?? cfg.pauseMinutes ?? 45)) * 60 * 1000;
  const payload = { pausedAt: Date.now(), pauseMs, reason };
  for (const k of getChatKeys(remoteJid, phone)) {
    aiPausedChats.set(k, payload);
  }
  persistPausedChats();
}

export function resumeAiForChat(remoteJid, phone) {
  let changed = false;
  for (const k of getChatKeys(remoteJid, phone)) {
    changed = aiPausedChats.delete(k) || changed;
  }
  if (changed) persistPausedChats();
}

export function isAiPausedForChat(remoteJid, phone) {
  const now = Date.now();
  let expired = false;
  for (const k of getChatKeys(remoteJid, phone)) {
    const info = aiPausedChats.get(k);
    if (!info) continue;
    if (now - info.pausedAt < info.pauseMs) {
      return info;
    }
    expired = aiPausedChats.delete(k) || expired;
  }
  if (expired) persistPausedChats();
  return null;
}

export function isWhatsAppAudioMessage(m) {
  if (!m?.message) return false;
  const msg = m.message.ephemeralMessage?.message || m.message.viewOnceMessage?.message || m.message.viewOnceMessageV2?.message || m.message;
  return Boolean(msg?.audioMessage);
}

function getAudioMeta(m) {
  const msg = m?.message?.ephemeralMessage?.message || m?.message?.viewOnceMessage?.message || m?.message?.viewOnceMessageV2?.message || m?.message;
  return msg?.audioMessage || null;
}

function recordTurn(chatKey, role, text) {
  const clean = String(text || '').trim();
  if (!clean) return;
  const now = Date.now();
  const entry = chatMemory.get(chatKey) || { turns: [], lastAiReplies: [], updatedAt: now };
  if (now - entry.updatedAt > 12 * 60 * 60 * 1000) {
    entry.turns = [];
    entry.lastAiReplies = [];
  }
  entry.turns.push({ role, text: clean.slice(0, 400), at: now });
  if (entry.turns.length > 10) entry.turns = entry.turns.slice(-10);
  if (role === 'assistant') {
    entry.lastAiReplies.push(clean.slice(0, 280));
    if (entry.lastAiReplies.length > 4) entry.lastAiReplies = entry.lastAiReplies.slice(-4);
  }
  entry.updatedAt = now;
  chatMemory.set(chatKey, entry);

  // Periodic cleanup
  if (chatMemory.size > 500) {
    for (const [k, v] of chatMemory.entries()) {
      if (now - v.updatedAt > 12 * 60 * 60 * 1000) chatMemory.delete(k);
    }
  }
}

function findCustomerOrdersContext(phone, text) {
  const orders = getOrders();
  const matched = [];
  const seenIds = new Set();

  // Check explicit Order ID in message (e.g. DOT-1A2B3C)
  const idMatches = String(text || '').match(/(?:#?DOT-)[A-Za-z0-9]+/gi) || [];
  for (const rawId of idMatches) {
    const norm = rawId.replace(/^#/, '').toUpperCase();
    const found = orders.find((o) => String(o.id || '').toUpperCase() === norm);
    if (found && !seenIds.has(found.id)) {
      seenIds.add(found.id);
      matched.push(found);
    }
  }

  // Check by phone number (last 10 digits)
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length >= 10) {
    const last10 = digits.slice(-10);
    const byPhone = orders
      .filter((o) => String(o.customer?.phone || '').replace(/\D/g, '').endsWith(last10))
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    for (const o of byPhone.slice(0, 3)) {
      if (!seenIds.has(o.id)) {
        seenIds.add(o.id);
        matched.push(o);
      }
    }
  }

  // Also check any phone number written inside message
  const msgPhones = String(text || '').match(/01\d{9}/g) || [];
  for (const mp of msgPhones) {
    const last10 = mp.slice(-10);
    const byMsgPhone = orders
      .filter((o) => String(o.customer?.phone || '').replace(/\D/g, '').endsWith(last10))
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    for (const o of byMsgPhone.slice(0, 2)) {
      if (!seenIds.has(o.id)) {
        seenIds.add(o.id);
        matched.push(o);
      }
    }
  }

  return matched.slice(0, 3).map((o) => ({
    id: o.id,
    status: o.status,
    total: o.total,
    items: (o.items || []).map((i) => `${i.name} x${i.qty || 1}`).join(', '),
    courier: o.courier?.provider || '',
    consignmentCode: o.courier?.consignmentCode || o.courier?.trackingCode || '',
    trackingUrl: o.courier?.trackingUrl || '',
    createdAt: o.createdAt,
  }));
}

async function callGeminiSmartAgent({ apiKey, systemPrompt, parts }) {
  const models = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'];
  let lastError = null;

  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts }],
          generationConfig: {
            temperature: 0.75,
            responseMimeType: 'application/json',
          },
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        lastError = `${model} (${res.status}): ${errText.slice(0, 180)}`;
        continue;
      }

      const data = await res.json();
      const rawOut = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (!rawOut) {
        lastError = `${model}: empty response`;
        continue;
      }

      const cleaned = rawOut.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
      return JSON.parse(cleaned);
    } catch (e) {
      lastError = `${model}: ${e?.message || e}`;
    }
  }

  throw new Error(lastError || 'All Gemini models failed');
}

function normalizePhoneBD(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  if (d.startsWith('8801') && d.length === 13) return '0' + d.slice(2);
  if (d.startsWith('01') && d.length === 11) return d;
  if (d.length === 10 && d.startsWith('1')) return '0' + d;
  return '';
}

export async function handleSmartWhatsAppAI({
  sock,
  m,
  rawText,
  remoteJid,
  senderPhone,
  pushName = '',
  isAudio = false,
  simulateHumanTypingAndSend,
}) {
  const waSettings = getWhatsAppSettings();
  const aiConfig = getWaAiConfig();
  if (!waSettings.enabled || !aiConfig.enabled) return false;

  const apiKey = waSettings.geminiApiKey;
  if (!apiKey) return false;

  if (isAudio && !aiConfig.voiceNoteEnabled) return false;

  // Check if AI is paused for this customer (staff took over or already escalated)
  const paused = isAiPausedForChat(remoteJid, senderPhone);
  if (paused) {
    console.log(`[Smart WA AI] Paused for ${remoteJid} (${paused.reason}). Skipping.`);
    return false;
  }

  const chatKey = remoteJid || senderPhone;
  if (!chatKey || inFlightChats.has(chatKey)) return false;

  const trimmedText = String(rawText || '').trim();
  if (!trimmedText && !isAudio) return false;

  // Ignore simple single-digit confirmation codes (1/2) handled by order confirmation bot
  if (/^[12]$/.test(trimmedText)) return false;

  inFlightChats.add(chatKey);
  try {
    let audioPart = null;
    let effectiveUserText = trimmedText;

    if (isAudio) {
      const audioMeta = getAudioMeta(m);
      try {
        const buffer = await downloadMediaMessage(m, 'buffer', {}, { logger: undefined, reuploadRequest: sock.updateMediaMessage });
        if (buffer && buffer.length > 0 && buffer.length < 10 * 1024 * 1024) {
          audioPart = {
            inlineData: {
              mimeType: (audioMeta?.mimetype || 'audio/ogg').split(';')[0].trim(),
              data: buffer.toString('base64'),
            },
          };
          if (!effectiveUserText) effectiveUserText = '[Customer sent a Voice Note audio message]';
        }
      } catch (dlErr) {
        console.warn('[Smart WA AI] Voice note download failed:', dlErr?.message || dlErr);
      }
      if (!audioPart && !trimmedText) return false;
    }

    const settings = getSettings();
    const storeName = settings.storeName || 'Secrate';
    const deliveryInside = Number(settings.deliveryInsideDhaka ?? 60);
    const deliveryOutside = Number(settings.deliveryOutsideDhaka ?? 120);

    const catalog = getActiveVisionCatalog()
      .slice(0, 60)
      .map((p) => ({
        id: p.id,
        name: p.name,
        price: Number(p.price || 0),
        stock: p.stock ?? null,
        soldOut: p.soldOut === true,
        variations: Array.isArray(p.variations) ? p.variations.map((v) => ({ name: v.name || v.label || v.title || v.size || '', price: Number(v.price ?? p.price ?? 0), stock: v.stock ?? p.stock ?? null, soldOut: p.soldOut === true || v.soldOut === true })) : [],
        deliveryInside: Number(p.customDeliveryInside ?? deliveryInside),
        deliveryOutside: Number(p.customDeliveryOutside ?? deliveryOutside),
        category: p.category || '',
      }));

    const faqs = getWaAiFaqs().map((f) => ({ q: f.question, a: f.answer }));
    const ordersCtx = aiConfig.orderTrackEnabled ? findCustomerOrdersContext(senderPhone, trimmedText) : [];
    const memory = chatMemory.get(chatKey) || { turns: [], lastAiReplies: [] };

    const toneGuide =
      aiConfig.tone === 'professional'
        ? 'Polite, respectful, formal Bengali (আপনি/আপনার).'
        : aiConfig.tone === 'casual_banglish'
        ? 'Warm, natural Banglish or easy Bengali matching the customer language.'
        : 'Warm, natural, helpful Bengali (আপনি/আপনার) with friendly emojis — sound like a real Bangladeshi e-commerce human assistant, never robotic.';

    const systemPrompt = `You are the Smart WhatsApp Sales & Support AI Assistant for "${storeName}" (an online store in Bangladesh).
Tone: ${toneGuide}

LIVE STORE INFO:
- Store Name: ${storeName}
- Delivery Charge: Inside Dhaka ৳${deliveryInside}, Outside Dhaka ৳${deliveryOutside} (Cash on Delivery available)
- Extra Store Policy / Info: ${aiConfig.storeInfo || 'Discreet & secure packaging across Bangladesh. 24-48h inside Dhaka, 2-4 days outside Dhaka.'}

LIVE PRODUCT CATALOG (${catalog.length} items):
${JSON.stringify(catalog)}

VERIFIED FAQ KNOWLEDGE BASE (${faqs.length} entries):
${JSON.stringify(faqs)}

THIS CUSTOMER'S RECENT ORDERS:
${JSON.stringify(ordersCtx)}

RECENT CONVERSATION HISTORY (oldest to newest):
${JSON.stringify(memory.turns)}

${aiConfig.antiRepeatEnabled && memory.lastAiReplies.length > 0 ? `STRICT ANTI-REPETITION RULE:
Your recent replies to this customer were:
${JSON.stringify(memory.lastAiReplies)}
NEVER repeat the same opening, phrasing, or canned sentence twice! Vary your wording naturally every single time.` : ''}

CAPABILITIES & RULES:
1. Answer product questions (price, availability, recommendations, delivery fee) using ONLY the LIVE PRODUCT CATALOG & FAQ KNOWLEDGE BASE above. Never invent products, fake prices, or fake policies. If stock is null/unknown, say stock needs confirmation; do not claim it is available.
2. If the customer asks about their order or courier tracking, use THIS CUSTOMER'S RECENT ORDERS above. If no order is found for their number, politely ask for their Order ID (e.g. DOT-XXXX) or the phone number used when ordering.
3. CHAT-TO-ORDER (${aiConfig.chatToOrderEnabled ? 'ENABLED' : 'DISABLED'}):
   If the customer clearly wants to place a new order AND has provided all required details:
   (a) Full Name, (b) customer’s WhatsApp number, (c) Full Delivery Address, (d) Exact Product/variation from Catalog, (e) explicit inside/outside Dhaka confirmation,
   set intent="create_order" and fill orderDraft. An inquiry, product question, or sharing contact/address details is NOT consent to order. Never substitute a different phone number. If order intent or ANY detail is missing or unclear, DO NOT create the order — set intent="collect_order_info" and ask only for confirmation or missing information. Do not infer delivery area from address.
4. VOICE NOTES: If an audio message is attached, transcribe what the customer said in "transcript" and reply directly to what they asked in the audio.
5. UNKNOWN / LOW CONFIDENCE / COMPLAINT / REFUND / CUSTOM REQUESTS:
   If you are NOT 100% sure of the answer from the Catalog, FAQ, or Order data (for example: customer asks for wholesale/reseller rates, custom discount, parcel damaged/wrong item complaint, urgent courier issue, or a question not covered in the catalog/FAQ), DO NOT guess or make up an answer!
   Set confidence="unknown" and intent="escalate", write a brief "escalateReason" in English/Bengali, and put ONE polite holding message in "replyText" saying a human team member is checking and will reply shortly.

Return STRICT JSON ONLY:
{
  "confidence": "high" | "unknown",
  "intent": "faq" | "product_info" | "order_track" | "collect_order_info" | "create_order" | "escalate",
  "transcript": "<if audio was sent, short transcript of customer voice note, else empty string>",
  "replyText": "<your natural, varied Bengali/Banglish reply to send on WhatsApp>",
  "escalateReason": "<short reason if confidence is unknown, else empty>",
  "orderDraft": {
    "name": "",
    "phone": "",
    "address": "",
    "productId": "",
    "productName": "",
    "variationName": "",
    "quantity": 1,
    "deliveryArea": "inside_dhaka" | "outside_dhaka"
  }
}`;

    const parts = [];
    if (audioPart) parts.push(audioPart);
    parts.push({
      text: `Customer Name: ${pushName || 'Unknown'}\nCustomer Phone: ${senderPhone || 'Unknown'}\nMessage: ${effectiveUserText}`,
    });

    const aiRes = await callGeminiSmartAgent({ apiKey, systemPrompt, parts });
    const userDisplayText = aiRes.transcript ? `[Voice: ${aiRes.transcript}]` : effectiveUserText;
    recordTurn(chatKey, 'customer', userDisplayText);

    // Handle Unknown / Escalation -> Notify Dashboard + Pause AI for this chat
    if (aiRes.confidence === 'unknown' || aiRes.intent === 'escalate') {
      const holdReply =
        (aiRes.replyText && aiRes.replyText.trim()) ||
        ESCALATION_FALLBACK_REPLIES[Math.floor(Math.random() * ESCALATION_FALLBACK_REPLIES.length)];

      if (aiConfig.escalationEnabled) {
        pauseAiForChat(remoteJid, senderPhone, 'ai_unknown_escalation');
        try {
          addStaffNotification({
            type: 'wa_escalation',
            toUsername: 'all',
            fromUsername: 'whatsapp_ai',
            fromName: 'WhatsApp Smart AI',
            phone: senderPhone || remoteJid.split('@')[0],
            remoteJid,
            customerName: pushName || senderPhone || 'Customer',
            customerQuestion: userDisplayText,
            escalateReason: aiRes.escalateReason || 'AI could not answer confidently',
            message: `🤖 WhatsApp AI উত্তর দিতে পারেনি: "${userDisplayText.slice(0, 120)}"`,
          });
        } catch (notifErr) {
          console.error('[Smart WA AI] Failed to add escalation notification:', notifErr?.message || notifErr);
        }
      }

      await simulateHumanTypingAndSend(remoteJid, holdReply);
      recordTurn(chatKey, 'assistant', holdReply);
      return true;
    }

    // Handle Chat-to-Order Creation
    if (aiRes.intent === 'create_order' && aiConfig.chatToOrderEnabled && aiRes.orderDraft) {
      const d = aiRes.orderDraft;
      const validPhone = normalizePhoneBD(senderPhone);
      const normalizedProductName = String(d.productName || '').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
      const matchedById = catalog.find((p) => d.productId && String(p.id) === String(d.productId)) || null;
      const matchedByName = normalizedProductName
        ? catalog.find((p) => String(p.name || '').trim().toLocaleLowerCase().replace(/\s+/g, ' ') === normalizedProductName) || null
        : null;
      const matchedProduct = matchedById && matchedByName && matchedById.id !== matchedByName.id
        ? null
        : matchedById || matchedByName;

      if (!matchedProduct) {
        const clarification = 'দুঃখিত, কোন পণ্যটি অর্ডার করতে চান তা নিশ্চিত হতে পারিনি। পণ্যের সঠিক নামটি আবার লিখবেন?';
        await simulateHumanTypingAndSend(remoteJid, clarification);
        recordTurn(chatKey, 'assistant', clarification);
        return true;
      }

      if (!validPhone || !String(d.name || '').trim() || !String(d.address || '').trim()) {
        const missing = [];
        if (!String(d.name || '').trim()) missing.push('আপনার নাম');
        if (!validPhone) missing.push('যোগাযোগের ফোন নম্বর');
        if (!String(d.address || '').trim()) missing.push('সম্পূর্ণ ডেলিভারি ঠিকানা');
        const detailsReply = `অর্ডারটি তৈরি করতে ${missing.join(', ')} প্রয়োজন। ${missing.length === 1 ? 'তথ্যটি' : 'তথ্যগুলো'} পাঠালে আমি অর্ডারের অনুরোধটি নথিভুক্ত করতে পারব।`;
        await simulateHumanTypingAndSend(remoteJid, detailsReply);
        recordTurn(chatKey, 'assistant', detailsReply);
        return true;
      }

      const customerMessages = [...(memory.turns || []).filter((turn) => turn.role === 'customer').map((turn) => turn.text), userDisplayText].join(' ');
      const normalizeDraftText = (value) => String(value || '').normalize('NFKC').toLocaleLowerCase().replace(/[.,;:#-]/g, ' ').replace(/\s+/g, ' ').trim();
      const normalizedCustomerMessages = normalizeDraftText(customerMessages);
      const priorAssistantText = [...(memory.turns || [])].reverse().find((turn) => turn.role === 'assistant')?.text || '';
      const explicitContextualYes = /^(?:হ্যাঁ|জি|জ্বি|ঠিক আছে|yes|okay|ok)[.!\s।]*$/i.test(userDisplayText.trim()) && /অর্ডার করতে চান|অর্ডার.*নিশ্চিত/i.test(priorAssistantText);
      const explicitOrderIntent = explicitContextualYes || /অর্ডার\s*(?:করতে|দিতে|করব|করবো|দিচ্ছি|নিশ্চিত|দেন|দিন)|(?:কিনতে|নিতে)\s*চাই|(?:নেব|নিব)(?:ো)?|কিনব|(?:এটা|এটি|এইটা|এই পণ্য)\s*(?:নেব|নিব|কিনব)(?:ো)?|buy\s+now|place\s+(?:an?\s+)?order|i\s+want\s+to\s+(?:buy|order)|i(?:'ll| will)\s+take\s+it/i.test(customerMessages);
      const deniesOrderIntent = /অর্ডার\s*(?:করব\s*না|করবো\s*না|দেব\s*না|দিতে\s*চাই\s*না)|কিনব\s*না|(?:নেব|নিব)(?:ো)?\s*না|do\s+not\s+(?:order|buy)|don['’]?t\s+(?:order|buy)|not\s+ordering/i.test(customerMessages);
      if (!explicitOrderIntent || deniesOrderIntent) {
        const confirmIntent = 'আপনি কি এই পণ্যটি অর্ডার করতে চান? নিশ্চিত করলে অর্ডারের অনুরোধটি তৈরি করব।';
        await simulateHumanTypingAndSend(remoteJid, confirmIntent);
        recordTurn(chatKey, 'assistant', confirmIntent);
        return true;
      }
      const normalizedDraftName = normalizeDraftText(d.name);
      const normalizedDraftAddress = normalizeDraftText(d.address);
      if (!normalizedDraftName || !normalizedCustomerMessages.includes(normalizedDraftName)) {
        const confirmName = 'আমি আপনার নাম "' + String(d.name || '').trim() + '" লিখেছি—ঠিক আছে?';
        await simulateHumanTypingAndSend(remoteJid, confirmName);
        recordTurn(chatKey, 'assistant', confirmName);
        return true;
      }
      if (!normalizedDraftAddress || !normalizedCustomerMessages.includes(normalizedDraftAddress)) {
        const confirmAddress = 'ঠিকানাটি পুরোটা আবার লিখে পাঠাবেন? আমি যেন ভুল না করি।';
        await simulateHumanTypingAndSend(remoteJid, confirmAddress);
        recordTurn(chatKey, 'assistant', confirmAddress);
        return true;
      }
      const areaSignals = [...userDisplayText.matchAll(/ঢাকার\s*(ভিতরে|ভেতরে|মধ্যে|বাইরে)|\b(inside|within|outside)\s+dhaka\b/gi)];
      const lastAreaSignal = areaSignals[areaSignals.length - 1]?.[0] || '';
      const explicitArea = lastAreaSignal && (/বাইরে|outside/i.test(lastAreaSignal) ? 'outside_dhaka' : 'inside_dhaka');
      if (!explicitArea || d.deliveryArea !== explicitArea) {
        const areaReply = 'ডেলিভারি চার্জ ঠিক রাখতে নিশ্চিত করবেন—আপনার ঠিকানাটি ঢাকার ভেতরে, নাকি ঢাকার বাইরে?';
        await simulateHumanTypingAndSend(remoteJid, areaReply);
        recordTurn(chatKey, 'assistant', areaReply);
        return true;
      }

      const normalizedCatalogName = normalizeDraftText(matchedProduct.name);
      if (!normalizedCatalogName || !normalizedCustomerMessages.includes(normalizedCatalogName)) {
        const repeatProduct = 'পণ্যের সঠিক নামটি নিশ্চিত করবেন? আমি "' + matchedProduct.name + '" বুঝেছি—এটাই কি নিতে চান?';
        await simulateHumanTypingAndSend(remoteJid, repeatProduct);
        recordTurn(chatKey, 'assistant', repeatProduct);
        return true;
      }

      {
        const requestedQty = Number(d.quantity ?? 1);
        if (!Number.isInteger(requestedQty) || requestedQty < 1 || requestedQty > 20) {
          const qtyReply = 'দুঃখিত, এক অর্ডারে ১ থেকে ২০টি পর্যন্ত নেওয়া যাচ্ছে। কতটি নিতে চান জানাবেন?';
          await simulateHumanTypingAndSend(remoteJid, qtyReply);
          recordTurn(chatKey, 'assistant', qtyReply);
          return true;
        }
        const qty = requestedQty;
        const variations = Array.isArray(matchedProduct.variations) ? matchedProduct.variations : [];
        const variationName = String(d.variationName || '').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
        const matchingVariations = variationName
          ? variations.filter((v) => String(v.name || '').trim().toLocaleLowerCase().replace(/\s+/g, ' ') === variationName)
          : [];
        if (variations.length > 0 && matchingVariations.length !== 1) {
          const choices = variations.map((v) => v.name).filter(Boolean).join(', ');
          const optionReply = `কোন অপশনটি চান নিশ্চিত করবেন? পাওয়া যাচ্ছে: ${choices || 'বিভিন্ন অপশন'}।`;
          await simulateHumanTypingAndSend(remoteJid, optionReply);
          recordTurn(chatKey, 'assistant', optionReply);
          return true;
        }
        const selectedVariation = matchingVariations[0] || null;
        if (selectedVariation) {
          const variationText = normalizeDraftText(selectedVariation.name);
          if (!variationText || !normalizedCustomerMessages.includes(variationText)) {
            const repeatVariation = 'আপনি "' + selectedVariation.name + '" অপশনটি বুঝিয়েছেন—ঠিক তো? নিশ্চিত করবেন?';
            await simulateHumanTypingAndSend(remoteJid, repeatVariation);
            recordTurn(chatKey, 'assistant', repeatVariation);
            return true;
          }
        }
        const stockValue = selectedVariation?.stock ?? matchedProduct.stock;
        const stockText = String(stockValue ?? '').trim();
        const parsedStock = typeof stockValue === 'number' ? stockValue : (/^\d+$/.test(stockText) ? Number(stockText) : null);
        const stock = Number.isFinite(parsedStock) && parsedStock >= 0 ? parsedStock : null;
        if (matchedProduct.soldOut === true || selectedVariation?.soldOut === true || /out of stock|sold out|স্টক নেই|শেষ/i.test(String(stockValue || '')) || (Number.isFinite(stock) && stock < qty)) {
          const unavailable = 'দুঃখিত, এই মুহূর্তে পণ্যটির পর্যাপ্ত স্টক নেই। চাইলে আমাদের টিমের সঙ্গে যোগাযোগ করে স্টকের আপডেট জেনে নিতে পারেন।';
          await simulateHumanTypingAndSend(remoteJid, unavailable);
          recordTurn(chatKey, 'assistant', unavailable);
          return true;
        }
        const unitPrice = Number(selectedVariation?.price ?? matchedProduct.price);
        if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
          const invalidPrice = 'দুঃখিত, পণ্যের বর্তমান মূল্য নিশ্চিত করা যাচ্ছে না। অর্ডারটি তৈরি করিনি; আমাদের টিম যাচাই করে জানাবে।';
          await simulateHumanTypingAndSend(remoteJid, invalidPrice);
          recordTurn(chatKey, 'assistant', invalidPrice);
          return true;
        }
        const isDhaka = explicitArea === 'inside_dhaka';
        const rawDeliveryFee = isDhaka
          ? (matchedProduct.deliveryInside ?? deliveryInside)
          : (matchedProduct.deliveryOutside ?? deliveryOutside);
        const deliveryFee = rawDeliveryFee == null || rawDeliveryFee === '' ? NaN : Number(rawDeliveryFee);
        if (!Number.isFinite(deliveryFee) || deliveryFee < 0) {
          const invalidDelivery = 'দুঃখিত, ডেলিভারি চার্জ নিশ্চিত করা যাচ্ছে না। অর্ডারটি তৈরি করিনি; আমাদের টিম যাচাই করে জানাবে।';
          await simulateHumanTypingAndSend(remoteJid, invalidDelivery);
          recordTurn(chatKey, 'assistant', invalidDelivery);
          return true;
        }
        const subtotal = unitPrice * qty;
        const total = subtotal + deliveryFee;

        const assignedStaff = autoAssignOnlineStaff('whatsapp_ai');
        const created = addOrder({
          customer: {
            name: String(d.name).trim(),
            phone: validPhone,
            address: String(d.address).trim(),
            note: 'Created via WhatsApp Smart AI',
          },
          items: [
            {
              id: matchedProduct.id,
              name: selectedVariation ? `${matchedProduct.name} (${selectedVariation.name})` : matchedProduct.name,
              price: unitPrice,
              qty,
            },
          ],
          subtotal,
          deliveryFee,
          total,
          status: 'pending',
          source: 'whatsapp_ai',
          assignedTo: assignedStaff?.username || '',
        });

        const displayProduct = selectedVariation ? `${matchedProduct.name} (${selectedVariation.name})` : matchedProduct.name;
        const stockNote = stock === null ? 'স্টক আমাদের টিম নিশ্চিত করবে।' : '';
        const orderConfirmReply = `ধন্যবাদ ${d.name}! আপনার অর্ডারের অনুরোধটি গ্রহণ করা হয়েছে।\n\n🆔 অর্ডার আইডি: #${created.id}\n📦 পণ্য: ${displayProduct} x${qty}\n💰 মোট বিল: ৳${total} (ক্যাশ অন ডেলিভারি)\n📍 ঠিকানা: ${d.address}\n\nঅর্ডারটি এখনো Pending আছে। ${stockNote} আমাদের টিম তথ্য যাচাই করে ফোনে নিশ্চিত করবে।`;
        await simulateHumanTypingAndSend(remoteJid, orderConfirmReply);
        recordTurn(chatKey, 'assistant', orderConfirmReply);
        return true;
      }
    }

    // Normal smart AI reply
    const replyText = String(aiRes.replyText || '').trim();
    if (!replyText) return false;

    await simulateHumanTypingAndSend(remoteJid, replyText);
    recordTurn(chatKey, 'assistant', replyText);
    return true;
  } catch (err) {
    console.error('[Smart WA AI Error]:', err?.message || err);
    return false;
  } finally {
    inFlightChats.delete(chatKey);
  }
}
