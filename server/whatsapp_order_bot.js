import { recentProductInquiries, recentCustomerPhotos, getActiveVisionCatalog } from './whatsapp_vision_bot.js';
import { getCatalog, getSettings, addOrder, getOrders, saveOrders, getCustomerByPhone, saveCustomer } from './store.js';
import { randomUUID } from 'node:crypto';

// In-flight drafts for conversational orders: remoteJid -> Draft
export const inFlightOrderDrafts = new Map();

// Clean up expired drafts every 5 minutes (TTL: 30 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [jid, draft] of inFlightOrderDrafts.entries()) {
    if (draft.expiresAt && draft.expiresAt < now) {
      inFlightOrderDrafts.delete(jid);
    }
  }
}, 5 * 60 * 1000);

export function cleanBDPhone(phone) {
  if (!phone) return '';
  const banglaDigits = { '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4', '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9' };
  let p = String(phone).replace(/[০-৯]/g, (d) => banglaDigits[d] || d).replace(/[^0-9]/g, '');
  if (p.startsWith('880')) p = p.slice(2);
  else if (p.startsWith('88')) p = p.slice(2);
  if (!p.startsWith('0') && p.length === 10 && p.startsWith('1')) p = '0' + p;
  return p;
}

/**
 * Validates a Bangladeshi 11-digit mobile number and detects obvious fake strings
 */
export function isValidBDPhone(phone) {
  if (!phone) return false;
  const p = cleanBDPhone(phone);
  if (!/^01[3-9]\d{8}$/.test(p)) return false;
  // Reject repetitive / fake numbers like 01700000000, 01711111111, 01888888888, 01234567890
  if (/^01[3-9](\d)\1{7}$/.test(p)) return false;
  if (p === '01234567890') return false;
  return true;
}

export function matchProductFromText(text) {
  if (!text) return null;
  const catalog = getActiveVisionCatalog();
  if (catalog.length === 0) return null;

  // 1. Explicit Code Tag (100% exact match)
  const codeMatch = text.match(/\[(?:Code|SKU|PID|Slug|Item):\s*([a-zA-Z0-9_-]+)\]/i);
  if (codeMatch && codeMatch[1]) {
    const code = codeMatch[1].trim();
    const found = catalog.find((p) => p.slug === code || p.id === code || (p.sku && p.sku.toLowerCase() === code.toLowerCase()));
    if (found) return { product: found, confidence: 1.0, exact: true };
  }

  // 2. Direct Website URL matching
  const urlMatch = text.match(/(?:secrate\.shop|dot\.metromaa\.com)\/p(?:roduct)?\/([a-zA-Z0-9_-]+)/i);
  if (urlMatch && urlMatch[1]) {
    const slug = urlMatch[1].trim();
    const found = catalog.find((p) => p.slug === slug || p.id === slug);
    if (found) return { product: found, confidence: 1.0, exact: true };
  }

  // 3. Structured line matching: "প্রোডাক্ট:" or "পণ্য:" or "Product:"
  const lineMatch = text.match(/(?:🛍️\s*)?(?:প্রোডাক্ট|পণ্য|Product|Item)\s*[:：\-]\s*([^\n\r]+)/i);
  if (lineMatch && lineMatch[1]) {
    const target = lineMatch[1].trim().toLowerCase();
    const exact = catalog.find((p) => p.name.toLowerCase() === target || p.slug === target);
    if (exact) return { product: exact, confidence: 1.0, exact: true };

    const candidates = catalog.filter((p) => p.name.toLowerCase().includes(target) || target.includes(p.name.toLowerCase()));
    if (candidates.length === 1) return { product: candidates[0], confidence: 0.95, exact: false };
    if (candidates.length > 1) return { ambiguous: true, candidates: candidates.slice(0, 3) };
  }

  // 4. Fuzzy & keyword search across all active catalog products
  const normText = text.toLowerCase();
  const scored = [];

  for (const p of catalog) {
    if (p.soldOut || (p.stock != null && p.stock <= 0)) continue;
    const rawName = (p.name || '').toLowerCase();
    const cleanName = rawName.replace(/\([^)]*\)/g, '').trim(); // strip brackets
    const pSlug = (p.slug || '').toLowerCase();
    const pSku = (p.sku || '').toLowerCase();

    // Direct match with full or cleaned name
    if (normText.includes(rawName)) {
      scored.push({ product: p, score: rawName.length * 2 });
      continue;
    }
    if (cleanName.length > 5 && normText.includes(cleanName)) {
      scored.push({ product: p, score: cleanName.length * 1.8 });
      continue;
    }
    if (pSku && pSku.length >= 3 && normText.includes(pSku)) {
      scored.push({ product: p, score: pSku.length * 2.5 });
      continue;
    }

    // Specific aliases & product signals
    let aliasScore = 0;
    if ((pSku === 'll6.7' || cleanName.includes('৬.৭')) && (normText.includes('৬.৭') || normText.includes('6.7') || (normText.includes('৪') && normText.includes('৫.৫')))) {
      aliasScore = 80;
    } else if ((pSku === 'll8' || cleanName.includes('৮')) && (normText.includes('সাইজ ৮') || normText.includes('size 8') || normText.includes('৮ ইঞ্চি') || normText.includes('8 inch') || normText.includes('ll8'))) {
      aliasScore = 85;
    } else if ((pSku === 'll5.7' || cleanName.includes('৫.৭')) && (normText.includes('৫.৭') || normText.includes('5.7') || normText.includes('৩.৫'))) {
      aliasScore = 80;
    } else if ((cleanName.includes('belt') || pSku === 'bc') && (normText.includes('belt') || normText.includes('বেল্ট'))) {
      aliasScore = 90;
    } else if (cleanName.includes('pleasure cup') && (normText.includes('cup') || normText.includes('কাপ') || normText.includes('softcore'))) {
      aliasScore = 90;
    } else if (cleanName.includes('dildo') && (normText.includes('dildo') || normText.includes('ডিলডো') || normText.includes('koxten'))) {
      aliasScore = 90;
    } else if ((normText.includes('love lock') || normText.includes('lovelock') || normText.includes('লাভ লক') || normText.includes('ম্যাজিক কনডম')) && (pSku === 'll6.7' || cleanName.includes('৬.৭'))) {
      aliasScore = 75; // Default love lock variant
    }

    if (aliasScore > 0) {
      scored.push({ product: p, score: aliasScore });
    }
  }

  if (scored.length > 0) {
    scored.sort((a, b) => b.score - a.score);
    return { product: scored[0].product, confidence: 0.9, exact: false };
  }

  return null;
}

/**
 * Extracts order fields and handles dual phone numbers:
 * 1st number = WhatsApp number (from sender JID)
 * 2nd number = Different alternate number if provided by customer in text
 */
export function extractOrderFields(text, senderPhone = '') {
  let name = '';
  let address = '';
  let qty = 1;

  // Name extraction
  const nameMatch = text.match(/(?:নাম|Name|Customer)\s*[:：\-]\s*([^\n\r,]+)/i);
  if (nameMatch && nameMatch[1]) name = nameMatch[1].trim();

  // Phone extraction
  const cleanSender = senderPhone ? cleanBDPhone(senderPhone) : '';
  let providedPhone = '';

  const phoneMatch = text.match(/(?:ফোন|মোবাইল|Phone|Mobile|Contact|বিকল্প\s*নম্বর|Alt\s*Phone)\s*[:：\-]\s*([0-9+০-৯\s-]+)/i);
  if (phoneMatch && phoneMatch[1]) {
    providedPhone = cleanBDPhone(phoneMatch[1]);
  }
  if (!providedPhone) {
    const rawNumber = text.match(/01[3-9]\d{8}/);
    if (rawNumber) providedPhone = rawNumber[0];
  }

  // Primary vs Secondary (1st number = WhatsApp, 2nd number = Different alternate call number)
  let phone = cleanSender || providedPhone;
  let secondaryPhone = '';

  if (cleanSender && providedPhone && cleanSender !== providedPhone) {
    phone = cleanSender;
    secondaryPhone = providedPhone;
  } else if (!cleanSender && providedPhone) {
    phone = providedPhone;
  }

  // Address extraction
  const addressMatch = text.match(/(?:ঠিকানা|Address|Location|লোকেশন)\s*[:：\-]\s*([\s\S]+?)(?=\n\s*(?:ফোন|মোবাইল|Phone|Name|নাম|Note|নোট|$))/i);
  if (addressMatch && addressMatch[1]) {
    address = addressMatch[1].trim().replace(/\n+/g, ', ');
  }

  // Fallback address keywords if label wasn't explicit
  if (!address) {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    for (const l of lines) {
      if (
        (l.includes('রোড') || l.includes('রোড#') || l.includes('বাসা') || l.includes('বাড়ি') || l.includes('গ্রাম') || l.includes('থানা') || l.includes('জেলা') || l.includes('উপজেলা') || l.includes('ঢাকা') || l.includes('চট্টগ্রাম') || l.includes('সিলেট') || l.includes('রাজশাহী') || l.includes('খুলনা') || l.includes('বরিশাল') || l.includes('রংপুর') || l.includes('ময়মনসিংহ') || l.includes('Road') || l.includes('House') || l.includes('Sector') || l.includes('Block') || l.includes('Floor') || l.includes('Dhaka')) &&
        !l.includes('Code:') && !l.includes('প্রোডাক্ট:')
      ) {
        address = l;
        break;
      }
    }
  }

  // Quantity extraction
  const qtyMatch = text.match(/(?:পরিমাণ|Qty|Quantity|সংখ্যা)\s*[:：\-]\s*([0-9০-৯]+)/i);
  if (qtyMatch && qtyMatch[1]) {
    const rawQty = parseInt(qtyMatch[1], 10);
    if (rawQty > 0 && rawQty <= 10) qty = rawQty;
  } else {
    const bengaliQty = text.match(/([১-৯1-9])\s*টি/);
    if (bengaliQty && bengaliQty[1]) {
      const q = parseInt(bengaliQty[1].replace('১','1').replace('২','2').replace('৩','3').replace('৪','4').replace('৫','5'), 10);
      if (q > 0) qty = q;
    }
  }

  return { name, phone, secondaryPhone, address, qty };
}

export function isDhakaAddress(addr = '') {
  const norm = String(addr).toLowerCase();
  return (
    norm.includes('dhaka') ||
    norm.includes('ঢাকা') ||
    norm.includes('uttara') || norm.includes('উত্তরা') ||
    norm.includes('mirpur') || norm.includes('মিরপুর') ||
    norm.includes('gulshan') || norm.includes('গুলশান') ||
    norm.includes('banani') || norm.includes('বনানী') ||
    norm.includes('dhanmondi') || norm.includes('ধানমন্ডি') ||
    norm.includes('mohammadpur') || norm.includes('মোহাম্মদপুর') ||
    norm.includes('badda') || norm.includes('বাড্ডা') ||
    norm.includes('motijheel') || norm.includes('মতিঝিল')
  );
}

export async function handleWhatsAppAutoOrderFlow({ m, rawText, remoteJid, senderPhone, intent, simulateHumanTypingAndSend }) {
  if (!rawText || !remoteJid) return false;

  const settings = getSettings();
  const storeName = settings.storeName || 'METRROMA';
  const delInside = Number(settings.deliveryInside ?? 60);
  const delOutside = Number(settings.deliveryOutside ?? 120);

  // -------------------------------------------------------------
  // Step A: Check if this user already has an active pending draft
  // -------------------------------------------------------------
  const existingDraft = inFlightOrderDrafts.get(remoteJid);

  if (existingDraft) {
    // 1. Customer replied 1 (CONFIRM) -> CREATE ORDER IN DATABASE!
    if (intent === 'CONFIRM' && existingDraft.step === 'AWAITING_CONFIRMATION') {
      const orderId = 'DOT-' + randomUUID().slice(0, 8).toUpperCase();
      const p = existingDraft.product;
      const qty = existingDraft.qty || 1;
      const subtotal = p.price * qty;
      const delivery = existingDraft.deliveryFee;
      const total = subtotal + delivery;

      const noteText = existingDraft.secondaryPhone
        ? `Primary WhatsApp: ${existingDraft.phone} | Alternate Call Phone: ${existingDraft.secondaryPhone} (Double-confirmed via WhatsApp Bot)`
        : 'Direct WhatsApp Conversational Order (Double-confirmed by customer)';

      const newOrder = {
        id: orderId,
        createdAt: new Date().toISOString(),
        status: 'approved',
        payment: 'cash_on_delivery',
        source: 'whatsapp_bot',
        customer: {
          name: existingDraft.name || 'Sir/Mam',
          phone: existingDraft.phone,
          secondaryPhone: existingDraft.secondaryPhone || '',
          address: existingDraft.address,
          area: existingDraft.area,
          district: existingDraft.area === 'inside' ? 'ঢাকা' : '',
          note: noteText,
        },
        items: [
          {
            id: p.id,
            name: p.name,
            sku: p.sku || '',
            price: p.price,
            qty,
            subtotal,
            image: p.image || '',
          },
        ],
        itemsTotal: subtotal,
        delivery,
        discount: 0,
        total,
        history: [
          {
            status: 'approved',
            note: `Order automatically created & double-confirmed via customer WhatsApp chat (1 pressed).`,
            at: new Date().toISOString(),
          },
        ],
      };

      addOrder(newOrder);
      inFlightOrderDrafts.delete(remoteJid);

      // Link order to customer account if exists
      try {
        const cleanP = cleanBDPhone(existingDraft.phone);
        const existingCust = getCustomerByPhone(cleanP);
        if (existingCust) {
          saveCustomer({
            ...existingCust,
            ordersCount: (existingCust.ordersCount || 0) + 1,
            lastOrderAt: newOrder.createdAt,
          });
        }
      } catch (_) {}

      // Dual phone line for slips
      const phoneDisplay = existingDraft.secondaryPhone
        ? `📞 ১নং নম্বর (WhatsApp): ${existingDraft.phone}\n📱 ২নং বিকল্প নম্বর: ${existingDraft.secondaryPhone}`
        : `📞 মোবাইল নম্বর: ${existingDraft.phone}`;

      // Send Congratulations / Confirmation Slip
      const successMsg = `🎉 আসসালামু আলাইকুম সম্মানিত ${existingDraft.name}!
আপনার অর্ডারটি সফলভাবে কনফার্ম করা হয়েছে! 💖

📦 অর্ডার নম্বর: #${orderId}
🛍️ প্রোডাক্ট: ${p.name} (${qty}টি)
💰 সর্বমোট বিল: ৳${total} (ক্যাশ অন ডেলিভারি)
📍 ডেলিভারি ঠিকানা: ${existingDraft.address}
${phoneDisplay}

🚚 লাইভ ট্র্যাকিং লিংক: https://metrroma.com/track?id=${orderId}

আমাদের টিম দ্রুত পার্সেল প্রস্তুত করে সম্পূর্ণ গোপনীয় ও সুরক্ষিত প্যাকেজিংয়ে কুরিয়ারে হস্তান্তর করবে। ${storeName}-এর সাথে থাকার জন্য ধন্যবাদ! 🌸`;

      await simulateHumanTypingAndSend(remoteJid, successMsg, existingDraft.phone, orderId, 'wa_order_success');
      console.log(`[WhatsApp Auto-Order] Created & Confirmed Order #${orderId} for ${existingDraft.name} (${existingDraft.phone})!`);

      // Order completed: completely clear in-flight draft and any visual memories
      inFlightOrderDrafts.delete(remoteJid);
      recentCustomerPhotos.delete(remoteJid);
      recentProductInquiries.delete(remoteJid);
      return true;
    }

    // 2. Customer replied 2 (CANCEL)
    if (intent === 'CANCEL') {
      inFlightOrderDrafts.delete(remoteJid);
      recentCustomerPhotos.delete(remoteJid);
      recentProductInquiries.delete(remoteJid);
      const cancelMsg = `সম্মানিত Sir/Mam, আপনার অনুরোধ অনুযায়ী অর্ডারটি বাতিল করা হয়েছে। ভবিষ্যতে যেকোনো প্রয়োজনে আমাদের জানাতে পারেন। আপনার দিনটি শুভ হোক! 🌸\n— ${storeName}`;
      await simulateHumanTypingAndSend(remoteJid, cancelMsg, existingDraft.phone, null, 'wa_order_cancelled');
      console.log(`[WhatsApp Auto-Order] Draft cancelled by customer for JID ${remoteJid}`);
      return true;
    }

    // 3. Customer was in AWAITING_ADDRESS and sent their address text
    if (existingDraft.step === 'AWAITING_ADDRESS') {
      const candidateAddr = rawText.trim();
      if (candidateAddr.length >= 8) {
        existingDraft.address = candidateAddr;
        const inDhaka = isDhakaAddress(candidateAddr);
        existingDraft.area = inDhaka ? 'inside' : 'outside';
        existingDraft.deliveryFee = inDhaka ? delInside : delOutside;
        existingDraft.total = (existingDraft.product.price * (existingDraft.qty || 1)) + existingDraft.deliveryFee;
        existingDraft.step = 'AWAITING_CONFIRMATION';
        existingDraft.expiresAt = Date.now() + 30 * 60 * 1000;

        const phoneDisplay = existingDraft.secondaryPhone
          ? `📞 ১নং নম্বর (WhatsApp): ${existingDraft.phone}\n📱 ২নং বিকল্প নম্বর: ${existingDraft.secondaryPhone}`
          : `📞 মোবাইল নম্বর: ${existingDraft.phone}`;

        // Send Double-Confirmation Slip
        const slip = `আসসালামু আলাইকুম সম্মানিত ${existingDraft.name}! 🌸 আপনার অর্ডারের তথ্যগুলো মিলিয়ে নিন:

🛍️ প্রোডাক্ট: ${existingDraft.product.name} (${existingDraft.qty || 1}টি)
💰 পণ্যের মূল্য: ৳${existingDraft.product.price * (existingDraft.qty || 1)}
🚚 ডেলিভারি চার্জ: ৳${existingDraft.deliveryFee} (${inDhaka ? 'ঢাকা সিটি' : 'ঢাকার বাইরে'})
💵 সর্বমোট বিল: ৳${existingDraft.total} (ক্যাশ অন ডেলিভারি)
📍 ডেলিভারি ঠিকানা: ${existingDraft.address}
${phoneDisplay}

✅ অর্ডারটি কনফার্ম করতে: 1 লিখে পাঠান
❌ পরিবর্তন বা বাতিল করতে: 2 লিখে পাঠান
— ${storeName}`;

        await simulateHumanTypingAndSend(remoteJid, slip, existingDraft.phone, null, 'wa_order_confirm_slip');
        return true;
      }
    }
  }

  // -------------------------------------------------------------
  // Step B: Check if incoming message is a new Order Intent
  // -------------------------------------------------------------
  const isOrderIntent = (
    rawText.includes('অর্ডার করতে চাই') ||
    rawText.includes('order করতে চাই') ||
    rawText.includes('[Code:') ||
    rawText.includes('[SKU:') ||
    rawText.includes('ঠিকানা:') ||
    rawText.includes('Address:') ||
    rawText.includes('🛍️ প্রোডাক্ট:') ||
    rawText.includes('পণ্য:')
  );

  if (!isOrderIntent) return false;

  console.log(`[WhatsApp Auto-Order Parser] Inspecting incoming order request from ${remoteJid}...`);

  // Match Product (Exact tag / URL / Title / or re-used from recent visual/text inquiry)
  let prodMatch = matchProductFromText(rawText);
  if (!prodMatch && recentProductInquiries.has(remoteJid)) {
    const recent = recentProductInquiries.get(remoteJid);
    if (recent && (Date.now() - recent.at < 20 * 60 * 1000)) {
      prodMatch = { product: recent.product, confidence: 1.0, exact: true };
      console.log(`[WhatsApp Auto-Order] Re-used product "${recent.product.name}" from recent visual/text inquiry!`);
    }
  }

  if (!prodMatch) {
    const recentPhoto = recentCustomerPhotos.get(remoteJid);
    if (recentPhoto && (Date.now() - recentPhoto.at < 20 * 60 * 1000)) {
      const pendingPhotoOrderMsg = `সম্মানিত Sir/Mam! 🌸
আপনার পাঠানো প্রোডাক্টের ছবিটি আমাদের প্রতিনিধি এইমাত্র স্টক ও মূল্য মিলিয়ে দেখছেন। ভেরিফাই হওয়ার সাথে সাথেই আপনার অর্ডারের কনফার্মেশন স্লিপ পাঠিয়ে দেওয়া হচ্ছে! 💖

অনুগ্রহ করে একটু সময় দিন।
— ${storeName}`;
      await simulateHumanTypingAndSend(remoteJid, pendingPhotoOrderMsg, senderPhone, null, 'wa_order_photo_pending');
      return true;
    }

    const clarifyMsg = `আসসালামু আলাইকুম সম্মানিত Sir/Mam! 🌸\nআপনি কোন প্রোডাক্টটি অর্ডার করতে চাচ্ছেন, অনুগ্রহ করে প্রোডাক্টটির নাম বা একটি ছবি/স্ক্রিনশট এই চ্যাটে পাঠিয়ে দিন। আমি সাথে সাথে অর্ডার স্লিপ প্রস্তুত করে দিচ্ছি! 📸\n— ${storeName}`;
    await simulateHumanTypingAndSend(remoteJid, clarifyMsg, senderPhone, null, 'wa_order_clarify');
    return true;
  }

  if (prodMatch.ambiguous) {
    const list = prodMatch.candidates.map((c, i) => `${i + 1}. ${c.name} (৳${c.price})`).join('\n');
    const pickMsg = `আসসালামু আলাইকুম সম্মানিত Sir/Mam! 🌸 আমাদের স্টকে নিচের প্রোডাক্টগুলো রয়েছে, আপনি কোনটি নিতে চান?\n\n${list}\n\nদয়া করে সঠিক প্রোডাক্টটির নাম লিখে পাঠান। ধন্যবাদ! 🌸\n— ${storeName}`;
    await simulateHumanTypingAndSend(remoteJid, pickMsg, senderPhone, null, 'wa_order_ambiguous');
    return true;
  }

  const product = prodMatch.product;
  const fields = extractOrderFields(rawText, senderPhone);

  const customerName = fields.name || 'Sir/Mam';
  const customerPhone = fields.phone || senderPhone;
  const secondaryPhone = fields.secondaryPhone || '';
  const qty = fields.qty || 1;

  // Anti-Fraud Guard 1: Validate Phone Number
  if (!isValidBDPhone(customerPhone)) {
    const badPhoneMsg = `সম্মানিত Sir/Mam! 🌸\nআপনার প্রদানকৃত ফোন নম্বরটি (${customerPhone || 'অনুপস্থিত'}) সঠিক মনে হচ্ছে না।\n\nকুরিয়ার ডেলিভারি ও যোগাযোগের জন্য অনুগ্রহ করে সচল ১১ ডিজিটের মোবাইল নম্বরটি লিখে পাঠান।\n— ${storeName}`;
    await simulateHumanTypingAndSend(remoteJid, badPhoneMsg, null, null, 'wa_bad_phone');
    return true;
  }

  // Anti-Fraud Guard 2: Rate Limiting (Prevent Fake / Spam Orders: max 2 in 24 hours per phone)
  const existingOrders = getOrders() || [];
  const cleanTargetP = cleanBDPhone(customerPhone);
  const recentOrdersFromPhone = existingOrders.filter((o) => {
    const p1 = cleanBDPhone(o.customer?.phone || '');
    const p2 = cleanBDPhone(o.customer?.secondaryPhone || '');
    if (p1 !== cleanTargetP && p2 !== cleanTargetP) return false;
    const ageHours = (Date.now() - new Date(o.createdAt).getTime()) / (1000 * 60 * 60);
    return ageHours < 24 && o.status !== 'cancelled';
  });

  if (recentOrdersFromPhone.length >= 2) {
    const limitMsg = `সম্মানিত Sir/Mam! 🌸\nআপনার এই নম্বর থেকে গত ২৪ ঘণ্টায় ইতোমধ্যে ${recentOrdersFromPhone.length}টি অর্ডার প্রক্রিয়াধীন রয়েছে।\n\nভুয়া বা অনিচ্ছাকৃত ডুপ্লিকেট অর্ডার প্রতিরোধে একই নম্বর থেকে দিনে সর্বোচ্চ ২টি অর্ডার সীমাবদ্ধ রাখা হয়েছে।\nপূর্বের অর্ডার ট্র্যাক করতে: https://metrroma.com/track\nবিশেষ প্রয়োজনে আমাদের হটলাইনে যোগাযোগ করার অনুরোধ রইল। ধন্যবাদ! 💖\n— ${storeName}`;
    await simulateHumanTypingAndSend(remoteJid, limitMsg, customerPhone, null, 'wa_order_rate_limit');
    return true;
  }

  // Anti-Fraud Guard 3: Blacklist Check
  const custRecord = getCustomerByPhone(cleanTargetP);
  if (custRecord && custRecord.blacklisted) {
    const blMsg = `সম্মানিত Sir/Mam! 🌸\nআপনার ঠিকানায় পার্সেলটি প্রেরণের জন্য ডেলিভারি চার্জ অগ্রিম পরিশোধ করা আবশ্যক।\nবিস্তারিত জানতে আমাদের হটলাইনে যোগাযোগ করুন। ধন্যবাদ!\n— ${storeName}`;
    await simulateHumanTypingAndSend(remoteJid, blMsg, customerPhone, null, 'wa_blacklisted');
    return true;
  }

  // Anti-Fraud Guard 4: Address Verification (At least 8 chars)
  if (!fields.address || fields.address.length < 8) {
    inFlightOrderDrafts.set(remoteJid, {
      product,
      name: customerName,
      phone: customerPhone,
      secondaryPhone,
      qty,
      step: 'AWAITING_ADDRESS',
      createdAt: Date.now(),
      expiresAt: Date.now() + 30 * 60 * 1000,
    });

    const askAddrMsg = `ধন্যবাদ সম্মানিত ${customerName}! 🌸
আপনি "${product.name}" (${qty}টি - ৳${product.price * qty}) অর্ডার করতে চেয়েছেন।

অর্ডারটি সম্পন্ন করতে অনুগ্রহ করে আপনার **সম্পূর্ণ ডেলিভারি ঠিকানা (জেলা, থানা ও এলাকা সহ)** লিখে পাঠান।
— ${storeName}`;

    await simulateHumanTypingAndSend(remoteJid, askAddrMsg, customerPhone, null, 'wa_ask_address');
    return true;
  }

  // Address is available -> Create draft and send Double Confirmation Slip!
  const inDhaka = isDhakaAddress(fields.address);
  const deliveryFee = inDhaka ? delInside : delOutside;
  const total = (product.price * qty) + deliveryFee;

  inFlightOrderDrafts.set(remoteJid, {
    product,
    name: customerName,
    phone: customerPhone,
    secondaryPhone,
    address: fields.address,
    area: inDhaka ? 'inside' : 'outside',
    deliveryFee,
    qty,
    total,
    step: 'AWAITING_CONFIRMATION',
    createdAt: Date.now(),
    expiresAt: Date.now() + 30 * 60 * 1000,
  });

  const phoneDisplay = secondaryPhone
    ? `📞 ১নং নম্বর (WhatsApp): ${customerPhone}\n📱 ২নং বিকল্প নম্বর: ${secondaryPhone}`
    : `📞 মোবাইল নম্বর: ${customerPhone}`;

  const confirmSlip = `আসসালামু আলাইকুম সম্মানিত ${customerName}! 🌸 আপনার অর্ডারের তথ্যগুলো মিলিয়ে নিন:

🛍️ প্রোডাক্ট: ${product.name} (${qty}টি)
💰 পণ্যের মূল্য: ৳${product.price * qty}
🚚 ডেলিভারি চার্জ: ৳${deliveryFee} (${inDhaka ? 'ঢাকা সিটি' : 'ঢাকার বাইরে'})
💵 সর্বমোট বিল: ৳${total} (ক্যাশ অন ডেলিভারি)
📍 ডেলিভারি ঠিকানা: ${fields.address}
${phoneDisplay}

✅ অর্ডারটি কনফার্ম করতে: 1 লিখে পাঠান
❌ পরিবর্তন বা বাতিল করতে: 2 লিখে পাঠান
— ${storeName}`;

  await simulateHumanTypingAndSend(remoteJid, confirmSlip, customerPhone, null, 'wa_confirm_slip');
  return true;
}
