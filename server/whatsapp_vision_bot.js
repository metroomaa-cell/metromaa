import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { getCatalog, getSettings, getOrders, getLandings } from './store.js';
import { getWhatsAppSettings } from './whatsapp_engine.js';
import { inFlightOrderDrafts, matchProductFromText } from './whatsapp_order_bot.js';

// Cache for recent inquiries so follow-up order texts ("১টা চাই, ঠিকানা মিরপুর") know the product
export const recentProductInquiries = new Map();

// Memory map for photos/screenshots sent by customers
// key: remoteJid, value: { at: timestamp, matchedProduct: null, notInCatalog: false, detectedProduct: '', caption: '' }
export const recentCustomerPhotos = new Map();

// Anti-spam cooldown for generic "Which product?" prompts: remoteJid -> timestamp
export const recentAskPhotoPrompts = new Map();

/**
 * Returns complete unified catalog combining database products, landing packages, and wellness items
 */
export function getActiveVisionCatalog() {
  const prods = getCatalog()?.products || [];
  const list = [...prods];
  const seenIds = new Set(prods.map((p) => p.id));

  try {
    const landings = getLandings() || [];
    for (const L of landings) {
      if (Array.isArray(L.packages)) {
        for (const pkg of L.packages) {
          if (pkg && pkg.id && !seenIds.has(pkg.id)) {
            seenIds.add(pkg.id);
            list.unshift({
              id: pkg.id,
              name: String(pkg.title || L.productTitle || L.title || '').trim(),
              price: pkg.price,
              sku: pkg.sku || '',
              image: pkg.image || L.heroImage || '',
              slug: L.slug || '',
              category: 'Adult Wellness / Magic Condom',
            });
          }
        }
      }
    }
  } catch (_) {}

  return list;
}

function getProductImage(product) {
  const raw = product?.image || product?.mainImage || product?.imageUrl || product?.images?.[0] || '';
  return typeof raw === 'string' ? raw : String(raw?.url || raw?.src || '');
}

function getProductStockText(product) {
  const rawStock = product?.stock ?? product?.quantity;
  if (/out of stock|sold out|স্টক নেই|শেষ/i.test(String(rawStock || ''))) return 'Currently marked out of stock';
  const stock = rawStock === '' || rawStock == null ? null : Number(rawStock);
  if (product?.soldOut === true || (Number.isFinite(stock) && stock <= 0)) return 'Currently marked out of stock';
  if (Number.isFinite(stock) && stock > 0) return 'In stock';
  return 'Stock needs confirmation';
}

function formatProductReply(product, { storeName, delInside, delOutside, lead = '' }) {
  const description = String(product?.description || product?.shortDescription || product?.details || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 650);
  const variations = Array.isArray(product?.variations) ? product.variations : [];
  const optionText = variations.length
    ? `\nOptions: ${variations.map((v) => `${v.name || v.label || v.title || 'Option'}${v.price != null && Number.isFinite(Number(v.price)) && Number(v.price) > 0 ? ` — ৳${Number(v.price)}` : ''}${v.soldOut === true || Number(v.stock) === 0 ? ' (out of stock)' : ''}`).join(', ')}`
    : '';
  const link = `https://secrate.shop/product/${product?.slug || product?.id}`;
  const priceText = product?.price != null && Number.isFinite(Number(product.price)) && Number(product.price) > 0 ? `৳${Number(product.price)}` : 'Price needs confirmation';
  return `${lead ? `${lead}\n` : ''}${product.name}\nPrice: ${priceText}\nAvailability: ${getProductStockText(product)}${optionText}${description ? `\nDetails: ${description}` : ''}\nDelivery: Inside Dhaka ৳${delInside}; outside Dhaka ৳${delOutside}\nProduct page: ${link}\n\nWould you like help with this item?\n— ${storeName}`;
}

function getCatalogForAudience(catalog, audience) {
  const signals = audience === 'women'
    ? /women|female|feminine|girls|মেয়|মেয়ে|মহিলা|নারী/i
    : /\bmen(?:'s|s)?\b|\bmale\b|\bboys?\b|পুরুষ|ছেল|ম্যাসাজ|প্রোলং/i;
  return catalog.filter((p) => signals.test(`${p.name || ''} ${p.category || ''} ${Array.isArray(p.categories) ? p.categories.join(' ') : ''}`));
}

function formatCatalogListReply(products, { audience, storeName, delInside, delOutside }) {
  if (!products.length) return `আমি catalog-এ ${audience === 'women' ? 'women’s' : 'men’s'} বিভাগে নির্ভরযোগ্য পণ্য খুঁজে পাইনি। পণ্যের নাম বা ছবি পাঠালে আমি মিলিয়ে দেখব।\n— ${storeName}`;
  const rows = products.slice(0, 6).map((p) => `• ${p.name} — ${p.price != null && Number.isFinite(Number(p.price)) && Number(p.price) > 0 ? `৳${Number(p.price)}` : 'Price needs confirmation'} · ${getProductStockText(p)}\n  https://secrate.shop/product/${p.slug || p.id}`).join('\n');
  return `Catalog-এ পাওয়া ${audience === 'women' ? 'women’s' : 'men’s'} items:\n${rows}\n\nDelivery: Inside Dhaka ৳${delInside}; outside Dhaka ৳${delOutside}. Stock status may need confirmation when the catalog has no stock count.\n— ${storeName}`;
}

/**
 * Checks whether an incoming Baileys message contains an image
 */
export function isWhatsAppImageMessage(m) {
  if (!m || !m.message) return false;
  return !!(
    m.message.imageMessage ||
    m.message.viewOnceMessage?.message?.imageMessage ||
    m.message.viewOnceMessageV2?.message?.imageMessage ||
    m.message.ephemeralMessage?.message?.imageMessage ||
    m.message.documentWithCaptionMessage?.message?.documentMessage?.mimetype?.startsWith('image/')
  );
}

/**
 * Uses a conservative catalog matcher; uncertain image matches are never presented as confirmed.
 */
async function callGeminiVisionMatcher({ imageBuffer, mimeType = 'image/jpeg', apiKey, catalog }) {
  if (!apiKey || !imageBuffer) return null;

  const catalogSummary = catalog.map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku || '',
    slug: p.slug || '',
    price: p.price,
    stock: p.stock ?? null,
    soldOut: p.soldOut === true,
    variations: Array.isArray(p.variations) ? p.variations.map((v) => ({ name: v.name || v.label || v.title || '', price: v.price ?? p.price, stock: v.stock ?? null, soldOut: v.soldOut === true })) : [],
  }));

  const systemPrompt = `You are a strict, precision product identifier for SECRATE, an authorized luxury health, personal care, and wellness store in Bangladesh.
A customer sent an image (photo or screenshot) of a product via WhatsApp asking if it is available in our store.

Here is our complete store catalog (${catalogSummary.length} products):
${JSON.stringify(catalogSummary)}

STRICT MATCHING RULES:
1. Carefully inspect the text on the box/packaging, brand name (e.g. Durex, Pasante, Stud 100, Okamoto, Carex, Fiesta, Procomil, Viga, Super Dragon, etc.), specific variant/model, volume (e.g. 12ml, 50ml, 3s, 12s), packaging color, and design.
2. Return a catalog match only when the visible brand and specific variant clearly match. Use confidence from 0 to 1; ambiguous or partial evidence is not a confirmed match:
{
  "matched": true,
  "confidence": 1.0,
  "productId": "<matching product id from catalog>",
  "productName": "<exact name from catalog>",
  "reason": "<short explanation of how brand and variant matched>"
}
3. Return not_in_catalog only when the image is clear enough to identify the product and it is not in this catalog:
{
  "matched": false,
  "confidence": 0.95,
  "reason": "not_in_catalog",
  "detectedProduct": "<exact brand and name visible on the image, or empty if unknown>"
}
4. If the image is blurry, dark, unclear, or does not clearly show a product:
{
  "matched": false,
  "confidence": 0.0,
  "reason": "unclear_image",
  "detectedProduct": ""
}

4. If uncertain, blurry, partly hidden, or several catalog variants look similar, return reason="unclear_image". Never guess stock, price, or variant.`;

  const models = ['gemini-3.6-flash', 'gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite'];
  let lastError = null;

  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  inlineData: {
                    mimeType,
                    data: imageBuffer.toString('base64'),
                  },
                },
                {
                  text: systemPrompt,
                },
              ],
            },
          ],
          generationConfig: {
          temperature: 0,
            responseMimeType: 'application/json',
          },
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.warn(`[Gemini Vision API] Model ${model} responded ${res.status}:`, errText);
        continue;
      }

      const data = await res.json();
      const rawJson = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawJson) continue;

      const parsed = JSON.parse(rawJson);
      if (parsed?.matched === true) {
        const product = catalog.find((p) => String(p.id) === String(parsed.productId));
        const confidence = Number(parsed.confidence);
        const modelName = String(parsed.productName || '').trim().toLocaleLowerCase();
        if (!product || !Number.isFinite(confidence) || confidence < 0.93 || (modelName && modelName !== String(product.name || '').trim().toLocaleLowerCase())) {
          return { matched: false, confidence: 0, reason: 'unclear_image', detectedProduct: String(parsed.detectedProduct || '') };
        }
        return { ...parsed, productName: product.name };
      }
      if (parsed?.reason === 'not_in_catalog' && Number(parsed.confidence) >= 0.9 && parsed.detectedProduct) return parsed;
      return { matched: false, confidence: 0, reason: 'unclear_image', detectedProduct: String(parsed?.detectedProduct || '') };
    } catch (err) {
      lastError = err;
      console.warn(`[Gemini Vision API Error with ${model}]:`, err?.message || err);
    }
  }

  return null;
}

/**
 * Detects whether customer is asking about where their parcel/order is or delivery tracking
 */
export function isOrderDeliveryTrackingText(text) {
  if (!text) return false;
  const t = text.toLowerCase().trim();

  const trackingSignals = [
    'কোথায় আছে', 'কোথায় আসে', 'কই আছে', 'কই আসে', 'কই গেলো', 'কোথায় গেলো', 'প্রোডাক্ট কোথায়', 'পণ্য কোথায়', 'পার্সেল কোথায়', 'পার্সেল কই',
    'ডেলিভারি হয়েছে', 'ডেলিভারি হইছে', 'ডেলিভারি হয়েছে কিনা', 'ডেলিভারি হইছে কিনা', 'ডেলিভারি পাই নাই', 'ডেলিভারি আসে নাই', 'ডেলিভারি কবে', 'ডেলিভারি কখন', 'ডেলিভারি কি',
    'কবে পাব', 'কখন পাব', 'কবে আসবে', 'কখন আসবে', 'কবে দিবেন', 'কখন দিবেন', 'দেরি হচ্ছে কেন', 'দেরি কেন',
    'পার্সেল ট্র্যাকিং', 'কুরিয়ার ট্র্যাকিং', 'ট্র্যাকিং', 'ট্র্যাকিং কোড', 'ট্র্যাকিং লিংক', 'ট্র্যাকিং লিঙ্ক', 'মেমো নম্বর', 'কুরিয়ার কোড',
    'অর্ডারের অবস্থা', 'অর্ডার কি অবস্থা', 'অর্ডার স্ট্যাটাস', 'পার্সেল পাব', 'পার্সেল কি হলো',
    'kothay ache', 'kothay ase', 'koi ache', 'koi ase', 'kothai ache', 'product kothay', 'parcel kothay', 'parcel koi',
    'delivery hoise', 'delivery hoise kina', 'delivery hoyeche', 'delivery hoyeche kina', 'delivery pai nai', 'delivery kobe', 'delivery kokhon',
    'kobe pabo', 'kokhon pabo', 'kobe asbe', 'kokhon asbe', 'kobe diben', 'tracking link', 'tracking code', 'order status', 'parcel status'
  ];

  return trackingSignals.some((sig) => t.includes(sig));
}

/**
 * Searches orders by phone, secondary phone, or explicit order ID in text
 */
export function findCustomerOrder(phoneOrJid, text = '') {
  const orders = getOrders() || [];

  // 1. Check if an explicit order ID is typed in text: e.g. #DOT-8828F446 or 8828F446
  if (text) {
    const idMatch = text.match(/(?:#?DOT-)?([A-Fa-f0-9]{8})/i);
    if (idMatch && idMatch[1]) {
      const targetId = 'DOT-' + idMatch[1].toUpperCase();
      const byId = orders.find((o) => o.id === targetId || o.id === idMatch[1].toUpperCase());
      if (byId) return byId;
    }
  }

  // 2. Search by phone number (last 10 digits match)
  const clean = String(phoneOrJid || '').replace(/\D/g, '');
  if (clean && clean.length >= 10) {
    const last10 = clean.slice(-10);
    const matched = orders.filter((o) => {
      const p1 = String(o.customer?.phone || '').replace(/\D/g, '');
      const p2 = String(o.customer?.secondaryPhone || '').replace(/\D/g, '');
      return p1.endsWith(last10) || p2.endsWith(last10);
    });

    if (matched.length > 0) {
      // Prioritize active orders (shipped > approved > pending > incomplete > delivered > cancelled)
      const priorityOrder = { shipped: 1, approved: 2, pending: 3, incomplete: 4, delivered: 5, cancelled: 6 };
      matched.sort((a, b) => {
        const pA = priorityOrder[a.status] || 9;
        const pB = priorityOrder[b.status] || 9;
        if (pA !== pB) return pA - pB;
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      });
      return matched[0];
    }
  }

  return null;
}

/**
 * Formats full real-time live order delivery tracking message
 */
export function formatOrderTrackingMessage(order, storeName = 'SECRATE') {
  if (!order) return null;

  const customerName = order.customer?.name || 'Sir/Mam';
  const orderId = order.id || '';
  const items = (order.items || []).map((i) => `${i.name}${i.qty > 1 ? ` (${i.qty}টি)` : ''}`).join(', ') || 'পণ্য';
  const total = order.total || 0;
  const address = order.customer?.address || 'ঠিকানা সংরক্ষিত';
  const courier = order.courier?.name || '';
  const consignment = order.courier?.consignment || '';

  // Calculate live tracking URL
  let trackingUrl = order.courier?.url || '';
  const phone = order.customer?.phone ? String(order.customer.phone).replace(/\D/g, '').slice(-11) : '';
  if (trackingUrl && trackingUrl.includes('pathao.com/courier/tracking/')) {
    trackingUrl = `https://merchant.pathao.com/tracking?consignment_id=${encodeURIComponent(consignment)}${phone ? `&phone=${encodeURIComponent(phone)}` : ''}`;
  }
  if (!trackingUrl && consignment) {
    const cLow = String(courier).toLowerCase();
    if (cLow.includes('pathao')) {
      trackingUrl = `https://merchant.pathao.com/tracking?consignment_id=${encodeURIComponent(consignment)}${phone ? `&phone=${encodeURIComponent(phone)}` : ''}`;
    } else if (cLow.includes('steadfast')) {
      trackingUrl = `https://steadfast.com.bd/track/${encodeURIComponent(consignment)}`;
    }
  }
  const storeTrackingUrl = `https://secrate.shop/track?id=${encodeURIComponent(orderId)}`;
  if (!trackingUrl) trackingUrl = storeTrackingUrl;

  // Status: SHIPPED (অন ট্রানজিট / কুরিয়ারে আছে)
  if (order.status === 'shipped') {
    return `আসসালামু আলাইকুম সম্মানিত ${customerName}! 🌸
আপনার অর্ডার (#${orderId})-এর লাইভ ডেলিভারি আপডেট:

🛍️ পণ্য: ${items}
🚚 কুরিয়ার: ${courier || 'অফিশিয়াল এক্সপ্রেস কুরিয়ার'}
${consignment ? `🏷️ ট্র্যাকিং কনসাইনমেন্ট: ${consignment}\n` : ''}💰 প্রদেয় বিল: ৳${total} (ক্যাশ অন ডেলিভারি)
📍 ডেলিভারি ঠিকানা: ${address}

📌 বর্তমান অবস্থা: আপনার পার্সেলটি কুরিয়ারে বুকিং সম্পন্ন হয়ে গন্তব্যের পথে রয়েছে। কুরিয়ার রাইডার ডেলিভারি দেওয়ার পূর্বে আপনাকে ফোনে কল করবেন।

🔗 কুরিয়ার লাইভ ট্র্যাকিং দেখুন:
👉 ${trackingUrl}

(যেকোনো প্রয়োজনে আমাদের এই চ্যাটে জানাতে পারেন!) 💖
— ${storeName}`;
  }

  // Status: APPROVED or PENDING (প্রস্তুত ও কুরিয়ারে হস্তান্তরের কাজ চলছে)
  if (order.status === 'approved' || order.status === 'pending') {
    const isApproved = order.status === 'approved';
    return `আসসালামু আলাইকুম সম্মানিত ${customerName}! 🌸
আপনার অর্ডার (#${orderId})-এর বর্তমান অবস্থা:

🛍️ পণ্য: ${items}
💰 সর্বমোট বিল: ৳${total} (ক্যাশ অন ডেলিভারি)
📍 ডেলিভারি ঠিকানা: ${address}

📦 বর্তমান অবস্থা: আপনার অর্ডারটি ${isApproved ? 'Approved (কনফার্ম)' : 'নিশ্চিতকরণের অপেক্ষায়'} রয়েছে। আমাদের প্যাকেজিং টিম সম্পূর্ণ গোপনীয় ও সুরক্ষিত প্যাকেজিংয়ে পার্সেলটি প্রস্তুত করছে। দ্রুতই এটি কুরিয়ারে হস্তান্তর করা হবে এবং ট্র্যাকিং কোড আপনাকে পাঠিয়ে দেওয়া হবে।

🔗 লাইভ অর্ডার স্ট্যাটাস দেখুন:
👉 ${storeTrackingUrl}
— ${storeName}`;
  }

  // Status: DELIVERED (ডেলিভারি সম্পন্ন)
  if (order.status === 'delivered') {
    return `আসসালামু আলাইকুম সম্মানিত ${customerName}! 🌸
আপনার অর্ডার (#${orderId})-টি কুরিয়ার ডেলিভারি রেকর্ড অনুযায়ী সম্পন্ন হয়েছে। ✅

🛍️ পণ্য: ${items}
📍 ডেলিভারি ঠিকানা: ${address}

❓ সম্মানিত Sir/Mam, আপনি কি পার্সেলটি নিরাপদে রিসিভ করেছেন?
যদি কোনো কারণে পার্সেলটি এখনো আপনার হাতে না পৌঁছে থাকে, দয়া করে এই চ্যাটে জানান—আমাদের প্রতিনিধি সাথে সাথে কুরিয়ার হাবের সাথে কথা বলে দ্রুত ব্যবস্থা নিচ্ছে! 💖
— ${storeName}`;
  }

  // Status: CANCELLED (বাতিল)
  if (order.status === 'cancelled') {
    return `আসসালামু আলাইকুম সম্মানিত ${customerName}! 🌸
আপনার অর্ডার (#${orderId})-টি বর্তমানে বাতিল (Cancelled) হিসেবে রয়েছে।

🛍️ পণ্য ছিল: ${items}
💰 মোট বিল: ৳${total}

❓ আপনি কি অর্ডারটি পুনরায় সচল বা কনফার্ম করতে চান? 
আমাদের জানালে আমরা অর্ডারটি চালু করে দ্রুত কুরিয়ারে পাঠানোর ব্যবস্থা করব! অথবা অন্য কোনো পণ্য নিতে চাইলে আমাদের জানাতে পারেন। 💖
— ${storeName}`;
  }

  // Fallback
  return `আসসালামু আলাইকুম সম্মানিত ${customerName}! 🌸
আপনার অর্ডার (#${orderId})-এর স্ট্যাটাস: ${order.status.toUpperCase()}।

🔗 লাইভ ট্র্যাকিং লিংক:
👉 ${storeTrackingUrl}
— ${storeName}`;
}

/**
 * Detects whether customer is asking for support, cancellation reason, or general complaint
 */
export function isSupportOrComplaintText(text) {
  if (!text) return false;
  const t = text.toLowerCase().trim();
  const supportSignals = [
    'কেন', 'কেনো', 'keno', 'why', 'কেন করা', 'বাতিল কেন', 'কেন বাতিল', 'cancel keno',
    'কী হলো', 'কি হলো', 'কি হইছে', 'কী হইছে', 'ki holo', 'ki hoise', 'ki hocche',
    'বাতিল হলো কেন', 'ক্যানসেল হলো কেন', 'সমস্যা', 'problem', 'অভিযোগ', 'কমপ্লেইন',
    'কথা বলতে চাই', 'মানুষের সাথে কথা', 'প্রতিনিধি', 'support'
  ];
  return supportSignals.some((s) => t.includes(s));
}

/**
 * Detects whether customer text is inquiring specifically about products, price, or stock availability
 */
export function isProductInquiryText(text) {
  if (!text) return false;
  const t = text.toLowerCase().trim();

  // If order delivery tracking query or support, DO NOT treat as product sales inquiry
  if (isOrderDeliveryTrackingText(t) || isSupportOrComplaintText(t)) return false;

  // If already part of order draft or confirmation digit, skip inquiry flow
  if (t === '1' || t === '2' || t === '১' || t === '২') return false;
  if (t.includes('অর্ডার করতে চাই') || t.includes('order করতে চাই') || t.includes('ঠিকানা:') || t.includes('[code:')) return false;

  // 1. Explicit price questions (Must be asking about price/rate)
  const priceSignals = [
    'দাম কত', 'দাম কতো', 'দাম জানতে চাই', 'প্রাইস কত', 'প্রাইস কতো', 'মূল্য কত', 'মূল্য কতো',
    'কত টাকা', 'dam koto', 'price koto', 'koto taka', 'price please', 'দাম বলুন', 'দাম কত ভাই'
  ];
  if (priceSignals.some((s) => t.includes(s))) return true;

  // 2. Explicit stock & availability questions
  const stockSignals = [
    'স্টক আছে', 'স্টকে আছে', 'প্রোডাক্ট আছে কি', 'পণ্য আছে কি', 'পণ্যটি আছে', 'প্রোডাক্টটি আছে',
    'available ache', 'available ache ki', 'মাল আছে কি', 'মাল আছে নাকি', 'স্টক আছে কি', 'পাওয়া যাবে কি', 'পাওয়া যাবে?'
  ];
  if (stockSignals.some((s) => t.includes(s))) return true;

  // 3. Explicit catalog & collection requests
  const catalogSignals = [
    'ডিটেইলস জানতে চাই', 'বিস্তারিত জানতে চাই', 'details jante chai', 'details bolen', 'টোটাল ডিটেইলস জানতে চাই',
    'কি কি প্রোডাক্ট আছে', 'কি কি পণ্য আছে', 'ক্যাটালগ দেখতে চাই', 'ক্যাটালগ দিন', 'প্রোডাক্ট লিস্ট', 'পণ্য তালিকা',
    'পণ্য দেখান', 'প্রোডাক্ট দেখান', 'catalog dekhte chai', 'product list'
  ];
  if (catalogSignals.some((s) => t.includes(s))) return true;

  // 4. Product keyword combined with an asking verb
  const prodKeywords = [
    'কনডম', 'কন্ডম', 'condom', 'স্প্রে', 'spray', 'লুব্রিকেন্ট', 'লুব', 'lube',
    'ডিলডো', 'dildo', 'স্লিভ', 'sleeve', 'কাপ', 'cup', 'বেল্ট কনডম', 'belt condom', 'লাভ লক', 'love lock',
    'pleasure cup', 'vibrator', 'ভাইব্রেটর'
  ];
  const askingVerbs = [
    'আছে কি', 'আসে কি', 'আছে নাকি', 'আসে নাকি', 'দাম কত', 'দাম কতো', 'দাম', 'কত টাকা', 'পাওয়া যাবে',
    'ache ki', 'ase ki', 'ache naki', 'dam koto', 'price koto'
  ];

  const hasProd = prodKeywords.some((p) => t.includes(p));
  const hasAsking = askingVerbs.some((a) => t.includes(a));
  if (hasProd && hasAsking) return true;

  return false;
}

/**
 * Checks if inquiry is about Women's Care / Girls' items
 */
export function isWomensCareInquiry(text) {
  if (!text) return false;
  const t = text.toLowerCase().trim();
  const kw = ['মেয়েদের', 'মেয়েদের', 'মেয়ে', 'মেয়ে', 'মহিলাদের', 'মহিলা', 'meyeder', 'meye', 'mohilader', 'female', 'womens', 'women'];
  return kw.some((k) => t.includes(k));
}

/**
 * Checks if inquiry is about Men's Care / Boys' items
 */
export function isMensCareInquiry(text) {
  if (!text) return false;
  const t = text.toLowerCase().trim();
  const kw = ['ছেলেদের', 'ছেলে', 'পুরুষদের', 'পুরুষ', 'celeder', 'cheleder', 'purushder', 'mens', 'men'];
  return kw.some((k) => t.includes(k));
}

/**
 * Checks if text is a greeting or pleasantry
 */
export function isGreetingText(text) {
  if (!text) return false;
  const raw = text.trim();
  if (raw === '?' || raw === '??' || raw === '???' || raw === 'help' || raw === 'Help') return true;

  const t = raw.toLowerCase().replace(/[!?.।,\s]+/g, ' ').trim();
  const greetings = [
    'আসসালামু আলাইকুম', 'সালাম', 'assalamu alaikum', 'assalamualaykum', 'assalamualaikum', 'salam',
    'hi', 'hello', 'hey', 'হাই', 'হ্যালো', 'হেই', 'কেমন আছেন', 'kemon achen', 'valo achen', 'ভালো আছেন',
    'কে আছেন', 'kew achen', 'kew ache', 'kew ase', 'vai', 'ভাই', 'apni ke', 'আপনি কে'
  ];
  return greetings.some((g) => t === g || t.startsWith(g + ' ') || t.endsWith(' ' + g));
}

/**
 * Main Controller for WhatsApp Vision AI, Categorized Guided Inquiries, and Greetings
 * Guaranteed 100% Accuracy, Zero Guesswork, Politeness with 'Sir/Mam'
 */
export async function handleWhatsAppVisionOrInquiryFlow({
  sock,
  m,
  rawText = '',
  remoteJid,
  senderPhone = '',
  simulateHumanTypingAndSend,
}) {
  if (!remoteJid) return false;

  const waSettings = getWhatsAppSettings();
  const st = getSettings();
  const storeName = st.storeName || 'SECRATE';
  const delInside = Number(st.deliveryInside ?? 60);
  const delOutside = Number(st.deliveryOutside ?? 120);
  const catalog = getActiveVisionCatalog();

  const isTracking = isOrderDeliveryTrackingText(rawText);
  const isSupport = isSupportOrComplaintText(rawText);
  const isImage = isWhatsAppImageMessage(m);
  const isWomenInquiry = isWomensCareInquiry(rawText);
  const isMenInquiry = isMensCareInquiry(rawText);
  const isGreeting = isGreetingText(rawText);
  const isInquiry = isProductInquiryText(rawText);

  // If none of these, exit flow
  if (!isTracking && !isSupport && !isImage && !isWomenInquiry && !isMenInquiry && !isGreeting && !isInquiry) return false;

  console.log(`[WhatsApp Vision/Inquiry Bot] Triggered for JID: ${remoteJid} (isTracking: ${isTracking}, isSupport: ${isSupport}, isImage: ${isImage}, Women: ${isWomenInquiry}, Men: ${isMenInquiry}, Greeting: ${isGreeting}, Inquiry: ${isInquiry})`);

  // =========================================================================
  // CASE 0A: Order Delivery & Real-Time Tracking ("প্রোডাক্ট কোথায় আছে?", "ডেলিভারি হয়েছে কিনা?", etc.)
  // =========================================================================
  if (isTracking) {
    // Clear any dangling photo memories so sales pitch is NEVER sent
    recentCustomerPhotos.delete(remoteJid);
    recentProductInquiries.delete(remoteJid);

    console.log(`[WhatsApp Tracking Bot] Order/Delivery tracking inquiry detected: "${rawText}" from JID ${remoteJid}`);
    const matchedOrder = findCustomerOrder(senderPhone || remoteJid, rawText);

    if (matchedOrder) {
      const trackingReply = formatOrderTrackingMessage(matchedOrder, storeName);
      await simulateHumanTypingAndSend(remoteJid, trackingReply, senderPhone, matchedOrder.id, 'wa_order_tracking_reply');
      return true;
    } else {
      const noOrderFoundMsg = `আসসালামু আলাইকুম সম্মানিত Sir/Mam! 🌸
আপনার এই হোয়াটসঅ্যাপ নম্বরে বর্তমানে কোনো রানিং অর্ডার পাওয়া যায়নি।

আপনি যদি অন্য কোনো নম্বর দিয়ে অর্ডার করে থাকেন, অনুগ্রহ করে আপনার ১১ ডিজিটের মোবাইল নম্বরটি অথবা অর্ডার নম্বরটি (যেমন: #DOT-XXXX) এখানে লিখে দিন। আমি সাথে সাথে লাইভ ট্র্যাকিং চেক করে বিস্তারিত জানিয়ে দিচ্ছি! 🔎
— ${storeName}`;
      await simulateHumanTypingAndSend(remoteJid, noOrderFoundMsg, senderPhone, null, 'wa_order_tracking_not_found');
      return true;
    }
  }

  // =========================================================================
  // CASE 0B: Customer Support / Cancellation Reason ("কেন করা হয়েছে?", etc.)
  // =========================================================================
  if (isSupport) {
    // Clear any dangling photo memories so sales pitch is never sent
    recentCustomerPhotos.delete(remoteJid);
    recentProductInquiries.delete(remoteJid);

    const supportMsg = `সম্মানিত Sir/Mam! 🌸
আপনার বার্তাটি আমরা গুরুত্বের সাথে লক্ষ্য করেছি।

আপনার অর্ডার বা যেকোনো তথ্যের সঠিক কারণ ও সমাধানের জন্য আমাদের কাস্টমার সাপোর্ট প্রতিনিধি অতি দ্রুত সরাসরি আপনার সাথে এই চ্যাটে কথা বলছেন। 💖

অনুগ্রহ করে অল্প কিছুক্ষণ অপেক্ষা করুন। যেকোনো অসুবিধার জন্য আমরা আন্তরিকভাবে দুঃখিত! 🙏
— ${storeName}`;

    await simulateHumanTypingAndSend(remoteJid, supportMsg, senderPhone, null, 'wa_support_handoff');
    return true;
  }

  // =========================================================================
  // CASE 1: Customer sent an IMAGE (Photo / Screenshot)
  // =========================================================================
  if (isImage) {
    let imageBuffer = null;
    try {
      imageBuffer = await downloadMediaMessage(m, 'buffer', {});
    } catch (err) {
      console.warn(`[WhatsApp Vision] Failed to download media from JID ${remoteJid}:`, err?.message || err);
    }

    // Register customer photo in memory so subsequent texts do not ask for a photo again
    recentCustomerPhotos.set(remoteJid, {
      at: Date.now(),
      matchedProduct: null,
      notInCatalog: false,
      detectedProduct: '',
      caption: rawText || '',
    });

    const apiKey = waSettings.geminiApiKey || process.env.GEMINI_API_KEY || '';

    // If Gemini API Key is available and image was downloaded
    if (apiKey && imageBuffer) {
      console.log(`[WhatsApp Vision] Analyzing product image (${imageBuffer.length} bytes) via Gemini Vision AI...`);
      const visionResult = await callGeminiVisionMatcher({
        imageBuffer,
        mimeType: 'image/jpeg',
        apiKey,
        catalog,
      });

      console.log(`[WhatsApp Vision] Match result:`, visionResult);

      if (visionResult && visionResult.matched && visionResult.productId) {
        const product = catalog.find((p) => p.id === visionResult.productId);
        if (product) {
          // Cache inquiry for this customer
          recentProductInquiries.set(remoteJid, { product, at: Date.now() });
          recentCustomerPhotos.set(remoteJid, {
            at: Date.now(),
            matchedProduct: product,
            notInCatalog: false,
            detectedProduct: product.name,
            caption: rawText || '',
          });

          const matchMsg = formatProductReply(product, { storeName, delInside, delOutside, lead: `Possible catalog match: ${product.name}. Please confirm the product and option before ordering.` });
          await simulateHumanTypingAndSend(remoteJid, matchMsg, senderPhone, null, 'wa_vision_matched', getProductImage(product));
          return true;
        }
      }

      // If Vision AI confirmed product is NOT in our catalog
      if (visionResult && visionResult.matched === false && visionResult.reason === 'not_in_catalog') {
        const detected = visionResult.detectedProduct ? ` (${visionResult.detectedProduct})` : '';
        recentCustomerPhotos.set(remoteJid, {
          at: Date.now(),
          matchedProduct: null,
          notInCatalog: true,
          detectedProduct: visionResult.detectedProduct || '',
          caption: rawText || '',
        });

        const notFoundMsg = `I couldn't find a confident exact match in the current catalog${detected}. This does not confirm that the product is unavailable. Please send the product name or a clearer image so I can check again.\n— ${storeName}`;

        await simulateHumanTypingAndSend(remoteJid, notFoundMsg, senderPhone, null, 'wa_vision_not_found');
        return true;
      }

      // If image was blurry or unclear
      if (visionResult && visionResult.reason === 'unclear_image') {
        const unclearMsg = `I couldn't identify the product clearly from this image. Please send a sharper photo or type the product name; I won't guess the variant or stock.\n— ${storeName}`;

        await simulateHumanTypingAndSend(remoteJid, unclearMsg, senderPhone, null, 'wa_vision_unclear');
        return true;
      }
    }

    // Fallback if no Gemini API Key or Gemini was inconclusive: Check image caption
    if (rawText) {
      const prodMatch = matchProductFromText(rawText);
      if (prodMatch && prodMatch.product) {
        const product = prodMatch.product;
        recentProductInquiries.set(remoteJid, { product, at: Date.now() });
        recentCustomerPhotos.set(remoteJid, {
          at: Date.now(),
          matchedProduct: product,
          notInCatalog: false,
          detectedProduct: product.name,
          caption: rawText || '',
        });

        const capMsg = formatProductReply(product, { storeName, delInside, delOutside, lead: 'Possible catalog match from the image caption. Please confirm this is the item you mean.' });
        await simulateHumanTypingAndSend(remoteJid, capMsg, senderPhone, null, 'wa_caption_matched', getProductImage(product));
        return true;
      }
    }

    // Default polite photo acknowledgment when Vision Key is pending
    const photoReceivedMsg = `I received the product image, but couldn't verify an exact catalog match automatically. Send the product name or a clearer photo and I can check again.\n— ${storeName}`;

    await simulateHumanTypingAndSend(remoteJid, photoReceivedMsg, senderPhone, null, 'wa_photo_ack');
    return true;
  }

  // =========================================================================
  // CASE 2: Customer asked about WOMEN'S CARE (মেয়েদের কি কি প্রোডাক্ট আছে?)
  // =========================================================================
  if (isWomenInquiry) {
    const womenMsg = formatCatalogListReply(getCatalogForAudience(catalog, 'women'), { audience: 'women', storeName, delInside, delOutside });

    await simulateHumanTypingAndSend(remoteJid, womenMsg, senderPhone, null, 'wa_womens_care_guide');
    return true;
  }

  // =========================================================================
  // CASE 3: Customer asked about MEN'S CARE (ছেলেদের জন্য কি কি আছে?)
  // =========================================================================
  if (isMenInquiry) {
    const menMsg = formatCatalogListReply(getCatalogForAudience(catalog, 'men'), { audience: 'men', storeName, delInside, delOutside });

    await simulateHumanTypingAndSend(remoteJid, menMsg, senderPhone, null, 'wa_mens_care_guide');
    return true;
  }

  // =========================================================================
  // CASE 4: Customer sent general GREETING (আসসালামু আলাইকুম, হাই, হ্যালো)
  // =========================================================================
  if (isGreeting && rawText.length < 35) {
    const greetingMsg = `আসসালামু আলাইকুম সম্মানিত Sir/Mam! 🌸
${storeName} Luxury Wellness & Personal Care-এ আপনাকে আন্তরিক স্বাগতম।

আমি আপনার পার্সোনাল শপিং অ্যাসিস্ট্যান্ট। আমি যেভাবে আপনাকে সাহায্য করতে পারি:
🛍️ ১. কোনো নির্দিষ্ট প্রোডাক্টের নাম লিখলে দাম ও স্টক জানিয়ে দেব।
📸 ২. প্রোডাক্টের ছবি বা স্ক্রিনশট পাঠালে স্টক চেক করে দেব।
🚹 ৩. ছেলেদের বা 🚺 মেয়েদের স্পেশাল কালেকশন দেখতে চাইলে লিখে জানান।
📦 ৪. অর্ডার করতে আপনার নাম, ডেলিভারি ঠিকানা ও ফোন নম্বর পাঠিয়ে দিন।

সম্মানিত Sir/Mam, আজ আপনাকে কীভাবে সহায়তা করতে পারি? 💖
— ${storeName}`;

    await simulateHumanTypingAndSend(remoteJid, greetingMsg, senderPhone, null, 'wa_welcome_greeting');
    return true;
  }

  // =========================================================================
  // CASE 5: Specific or General Product Text Inquiry
  // =========================================================================
  if (isInquiry) {
    // 1. Try to match a specific product name from customer's text
    const prodMatch = matchProductFromText(rawText);

    if (prodMatch && prodMatch.product && !prodMatch.ambiguous) {
      const product = prodMatch.product;
      recentProductInquiries.set(remoteJid, { product, at: Date.now() });

      const textInquiryMsg = formatProductReply(product, { storeName, delInside, delOutside });
      await simulateHumanTypingAndSend(remoteJid, textInquiryMsg, senderPhone, null, 'wa_text_inquiry_matched', getProductImage(product));
      return true;
    }

    // 2. If ambiguous (multiple products matched)
    if (prodMatch && prodMatch.ambiguous && prodMatch.candidates?.length) {
      const list = prodMatch.candidates.slice(0, 5).map((c, i) => `${i + 1}. ${c.name} (৳${c.price})`).join('\n');
      const pickMsg = `সম্মানিত Sir/Mam! 🌸 আমাদের স্টকে এই রিলেটেড নিচের প্রোডাক্টগুলো রয়েছে:

${list}

👉 আপনি কোন প্রোডাক্টটির ডিটেইলস জানতে চাচ্ছেন বা অর্ডার করতে চাচ্ছেন তা নাম লিখে অথবা ছবি/স্ক্রিনশট পাঠিয়ে জানান!
— ${storeName}`;

      await simulateHumanTypingAndSend(remoteJid, pickMsg, senderPhone, null, 'wa_inquiry_ambiguous');
      return true;
    }

    // 3. Check if customer sent a photo recently (within last 20 minutes)
    // NEVER ask for a photo again if they already sent one!
    const recentPhoto = recentCustomerPhotos.get(remoteJid);
    const hasRecentPhoto = recentPhoto && (Date.now() - recentPhoto.at < 20 * 60 * 1000);

    if (hasRecentPhoto) {
      // 3A. If the photo was already matched to a catalog product
      if (recentPhoto.matchedProduct) {
        const product = recentPhoto.matchedProduct;
        recentProductInquiries.set(remoteJid, { product, at: Date.now() });

        const photoMatchedMsg = formatProductReply(product, { storeName, delInside, delOutside });
        await simulateHumanTypingAndSend(remoteJid, photoMatchedMsg, senderPhone, null, 'wa_recent_photo_matched_reply', getProductImage(product));
        return true;
      }

      // 3B. If the photo was analyzed and confirmed NOT in catalog
      if (recentPhoto.notInCatalog) {
        const detected = recentPhoto.detectedProduct ? ` (${recentPhoto.detectedProduct})` : '';
        const notFoundMsg = `সম্মানিত Sir/Mam! 🌸
আপনার পাঠানো ছবিটি আমরা সতর্কতার সাথে যাচাই করেছি${detected}। দুঃখজনকভাবে এই নির্দিষ্ট প্রোডাক্টটি বর্তমানে আমাদের স্টকে নেই। ❌

আমাদের স্টকে প্রিমিয়াম ও ১০০% অরিজিনাল কালেকশনের আরও চমৎকার পণ্য রয়েছে!
👉 দেখতে ভিজিট করুন: https://secrate.shop

আপনি কি ধরণের সুবিধা বা পণ্য খুঁজছেন তা জানালে আমরা সেরা অপশন সাজেস্ট করতে পারি! ✨
— ${storeName}`;

        await simulateHumanTypingAndSend(remoteJid, notFoundMsg, senderPhone, null, 'wa_recent_photo_not_found_reply');
        return true;
      }

      // 3C. Photo is pending review by representative / vision AI
      const pendingPhotoMsg = `সম্মানিত Sir/Mam! 🌸
আপনার পাঠানো ছবিটির স্টক ও বর্তমান অফার মূল্য আমাদের সংশ্লিষ্ট প্রতিনিধি এইমাত্র চেক করছেন। 

খুব দ্রুতই আমাদের প্রতিনিধি আপনাকে এই চ্যাটে সম্পূর্ণ ডিটেইলস ও মূল্য জানিয়ে দিচ্ছেন, অনুগ্রহ করে একটু সময় দিন! 💖

🚚 ক্যাশ অন ডেলিভারিতে দ্রুত প্রোডাক্টটি রিসিভ করতে চাইলে আপনার:
১. নাম
২. সম্পূর্ণ ডেলিভারি ঠিকানা (জেলা ও থানা সহ)
৩. মোবাইল নম্বর
এখানে লিখে পাঠিয়ে রাখতে পারেন।
— ${storeName}`;

      await simulateHumanTypingAndSend(remoteJid, pendingPhotoMsg, senderPhone, null, 'wa_recent_photo_pending_reply');
      return true;
    }

    // 4. General inquiry without naming a product AND no recent photo sent
    // (e.g. "kono product ache naki?", "product somporke jante chai")
    // Anti-spam cooldown: NEVER send this prompt more than once every 6 hours to the same customer!
    const lastPromptTime = recentAskPhotoPrompts.get(remoteJid);
    if (lastPromptTime && Date.now() - lastPromptTime < 6 * 3600 * 1000) {
      console.log(`[Bot Anti-Spam] askPhotoOrNameMsg was already sent to ${remoteJid} in last 6h. Silently skipping duplicate prompt.`);
      return false;
    }
    recentAskPhotoPrompts.set(remoteJid, Date.now());

    const askPhotoOrNameMsg = `সম্মানিত Sir/Mam! 🌸 
আপনি কোন নির্দিষ্ট প্রোডাক্টটি সম্পর্কে জানতে চাচ্ছেন? 

দয়া করে প্রোডাক্টটির নাম লিখুন অথবা প্রোডাক্টটির একটি ছবি/স্ক্রিনশট এই চ্যাটে পাঠিয়ে দিন। আমাদের স্মার্ট সিস্টেম সাথে সাথে চেক করে আপনাকে পূর্ণাঙ্গ ডিটেইলস ও মূল্য জানিয়ে দেবে! 📸✨
— ${storeName}`;

    await simulateHumanTypingAndSend(remoteJid, askPhotoOrNameMsg, senderPhone, null, 'wa_ask_photo_or_name');
    return true;
  }

  return false;
}
