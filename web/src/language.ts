import { useEffect, useState } from 'react';

export type StoreLanguage = 'en' | 'bn';
const KEY = 'metrroma-track-language';
const EVENT = 'store-language-change';
const COPY_EVENT = 'store-copy-change';
let copyOverrides: Record<string, { en?: string; bn?: string }> = {};

export function setStoreCopyOverrides(overrides: Record<string, { en?: string; bn?: string }> | undefined) {
  copyOverrides = overrides && typeof overrides === 'object' ? overrides : {};
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(COPY_EVENT));
}

export function getStoreLanguage(): StoreLanguage {
  if (typeof window === 'undefined') return 'en';
  return window.localStorage.getItem(KEY) === 'bn' ? 'bn' : 'en';
}

export function setStoreLanguage(language: StoreLanguage) {
  window.localStorage.setItem(KEY, language);
  window.dispatchEvent(new CustomEvent(EVENT, { detail: language }));
  document.documentElement.lang = language === 'bn' ? 'bn' : 'en';
}

export function useStoreLanguage(): StoreLanguage {
  const [language, setLanguage] = useState<StoreLanguage>(getStoreLanguage);
  const [, setCopyRevision] = useState(0);
  useEffect(() => {
    document.documentElement.lang = language === 'bn' ? 'bn' : 'en';
  }, [language]);
  useEffect(() => {
    const update = (event?: Event) => {
      const next = event instanceof CustomEvent ? event.detail : getStoreLanguage();
      setLanguage(next === 'bn' ? 'bn' : 'en');
    };
    const updateCopy = () => setCopyRevision((revision) => revision + 1);
    window.addEventListener(EVENT, update);
    window.addEventListener(COPY_EVENT, updateCopy);
    window.addEventListener('storage', update);
    return () => {
      window.removeEventListener(EVENT, update);
      window.removeEventListener(COPY_EVENT, updateCopy);
      window.removeEventListener('storage', update);
    };
  }, []);
  return language;
}

const BN: Record<string, string> = {
  Home: 'হোম', Shop: 'শপ', 'All Skincare': 'সব স্কিনকেয়ার পণ্য', 'All Collections': 'সব কালেকশন',
  'More Categories': 'আরও ক্যাটাগরি', 'Track Order': 'অর্ডারের অবস্থা দেখুন', 'Search collections': 'পণ্য খুঁজুন',
  'Shopping Cart': 'শপিং ব্যাগ', Cart: 'ব্যাগ', Bag: 'ব্যাগ', Account: 'অ্যাকাউন্ট',
  'VIP Sign In / Register (5% OFF)': 'ভিআইপি লগইন / নিবন্ধন (প্রথম অর্ডারে ৫% ছাড়)',
  'Track Your Order': 'অর্ডারের অবস্থা দেখুন', 'Shipping & Delivery': 'শিপিং ও ডেলিভারি',
  'Returns & Exchanges': 'রিটার্ন ও পণ্য বদল', 'Contact Customer Support': 'কাস্টমার সাপোর্টে যোগাযোগ',
  Collections: 'কালেকশন', 'Customer Care': 'কাস্টমার কেয়ার', 'Hotline & Inquiries': 'হটলাইন ও যোগাযোগ',
  'Need assistance? Call or WhatsApp our helpline:': 'সহায়তা দরকার? আমাদের হটলাইনে কল বা WhatsApp করুন:',
  'WhatsApp Support': 'WhatsApp সাপোর্ট', 'Your Bag is Empty': 'আপনার ব্যাগ খালি',
  'EXPLORE SHOP': 'পণ্য দেখুন', Remove: 'সরান', 'Selected Option': 'নির্বাচিত অপশন',
  'Free Delivery Unlocked!': 'আপনি ফ্রি ডেলিভারি পেয়েছেন!', 'Free Delivery': 'ফ্রি ডেলিভারি',
  'Add': 'আরও যোগ করুন', 'Shopping Bag': 'শপিং ব্যাগ', SUBTOTAL: 'পণ্যের মোট',
  'PROCEED TO CHECKOUT →': 'চেকআউটে এগিয়ে যান →', 'Close menu': 'মেনু বন্ধ করুন',
  'Open Navigation Menu': 'নেভিগেশন মেনু খুলুন', 'Call Hotline': 'হটলাইনে কল করুন',
  'Cash on Delivery Nationwide': 'সারা দেশে ক্যাশ অন ডেলিভারি', '7-Day Easy Exchange Policy': '৭ দিনের সহজ এক্সচেঞ্জ নীতি',
  '100% Authentic Quality Guaranteed': '১০০% অরিজিনাল পণ্যের নিশ্চয়তা',
  'Fashion & Apparel': 'ফ্যাশন ও পোশাক', 'Timepieces & Watches': 'ঘড়ি ও হাতঘড়ি',
  Apparel: 'পোশাক', 'Gift Sets': 'উপহারের সেট', Digital: 'ডিজিটাল',
  'Designer Sunglasses': 'ডিজাইনার সানগ্লাস', 'Curated Gift Sets': 'বাছাই করা উপহারের সেট', 'Digital Products': 'ডিজিটাল পণ্য',
  'Leather & Accessories': 'চামড়ার পণ্য ও অনুষঙ্গ', 'CURATED REGIMEN': 'বাছাই করা স্কিনকেয়ার', 'CURATED LINEUP': 'বাছাই করা কালেকশন',
  'Shop by Category': 'ক্যাটাগরি অনুযায়ী পণ্য দেখুন', 'Shop by Collection': 'কালেকশন অনুযায়ী পণ্য দেখুন',
  'BOTANICAL CARE': 'বোটানিক্যাল কেয়ার', COLLECTION: 'কালেকশন', 'EXPLORE →': 'দেখুন →',
  'Frequently Asked Questions': 'সাধারণ জিজ্ঞাসা', 'Best Sellers': 'বেস্টসেলার', 'Featured Products': 'বিশেষ পণ্য',
  'Add to Cart': 'ব্যাগে যোগ করুন', 'ADD TO CART': 'ব্যাগে যোগ করুন', 'Buy Now': 'এখনই কিনুন',
  'Order Summary': 'অর্ডারের সারাংশ', 'Place Order': 'অর্ডার নিশ্চিত করুন', 'PLACE ORDER': 'অর্ডার নিশ্চিত করুন',
  'Delivery Information': 'ডেলিভারি তথ্য', 'Payment Method': 'পেমেন্ট পদ্ধতি', 'Cash on Delivery': 'ক্যাশ অন ডেলিভারি',
  'Apply Coupon': 'কুপন প্রয়োগ করুন', 'Continue Shopping': 'কেনাকাটা চালিয়ে যান',
  'Product Details & Specifications': 'পণ্যের বিবরণ ও বৈশিষ্ট্য', Reviews: 'ক্রেতাদের মতামত',
  back: 'ফিরে যান', 'Chat on WhatsApp': 'WhatsApp-এ কথা বলুন',
  'All Products': 'সব পণ্য', 'No products found in this collection': 'এই কালেকশনে কোনো পণ্য পাওয়া যায়নি',
  'New pieces will be added shortly.': 'শিগগিরই নতুন পণ্য যোগ করা হবে।', 'View All Collections': 'সব কালেকশন দেখুন',
  'PURE BOTANICAL FORMULATIONS': 'বিশুদ্ধ বোটানিক্যাল ফর্মুলা', 'METRROMA CURATED LINEUP': 'METRROMA বাছাইকৃত কালেকশন',
  'All Skincare & Essentials': 'সব স্কিনকেয়ার ও প্রয়োজনীয় পণ্য',
  'Discover nutrient-dense botanical formulations crafted to nourish, balance, and restore your skin naturally.': 'ত্বকের পুষ্টি, ভারসাম্য ও স্বাভাবিক উজ্জ্বলতার জন্য তৈরি বোটানিক্যাল ফর্মুলা দেখুন।',
  'Discover premium sunglasses, authentic timepieces, and curated gift boxes crafted for modern lifestyle.': 'আধুনিক জীবনযাপনের জন্য উন্নত মানের সানগ্লাস, আসল ঘড়ি ও বাছাই করা উপহারের বাক্স দেখুন।',
  'Finalize Your Order': 'আপনার অর্ডার সম্পন্ন করুন',
  'Pay with Cash on Delivery at your doorstep. Inspect your parcel before completing payment.': 'পণ্য হাতে পেয়ে ক্যাশ অন ডেলিভারিতে মূল্য পরিশোধ করুন। পেমেন্টের আগে পার্সেল পরীক্ষা করে নিন।',
  'Have a VIP account or want 5% off your first order?': 'VIP অ্যাকাউন্ট আছে, অথবা প্রথম অর্ডারে ৫% ছাড় চান?', 'Sign In / Register': 'লগইন / রেজিস্টার',
  'Contact & Personal Details': 'যোগাযোগ ও ব্যক্তিগত তথ্য', 'Full Name *': 'আপনার নাম *', 'Enter your full name': 'আপনার পুরো নাম লিখুন',
  'Mobile Number *': 'মোবাইল নম্বর *', 'Please enter a valid 11-digit mobile number (e.g. 017XXXXXXXX)': 'সঠিক ১১ সংখ্যার মোবাইল নম্বর লিখুন (যেমন: 017XXXXXXXX)',
  'Instant Digital Fulfillment': 'ডিজিটাল পণ্য সরবরাহ', 'Shipping & Doorstep Delivery Address': 'শিপিং ও বাসায় পৌঁছে দেওয়ার ঠিকানা',
  '⚡ Instant Digital Access': '⚡ ডিজিটাল পণ্য সঙ্গে সঙ্গে পান', 'FREE ৳0 DELIVERY': 'ডেলিভারি চার্জ ৳০',
  'Email Address (for download delivery & invoice) *': 'ডাউনলোড ও ইনভয়েসের জন্য ইমেইল *', 'Order Note (Optional)': 'অর্ডার সম্পর্কে নোট (ঐচ্ছিক)',
  'District (Zilla) *': 'জেলা *', 'Thana / Upazila *': 'থানা / উপজেলা *', 'Search district…': 'জেলা খুঁজুন…',
  'Search thana…': 'থানা খুঁজুন…', 'Select district first': 'আগে জেলা নির্বাচন করুন', 'Detailed Street Address *': 'বিস্তারিত ঠিকানা *',
  'Delivery Zone': 'ডেলিভারির এলাকা', 'Inside Dhaka': 'ঢাকার ভেতরে', 'Outside Dhaka': 'ঢাকার বাইরে',
  'Delivered in 24–48 Hours': '২৪–৪৮ ঘণ্টার মধ্যে পৌঁছে যাবে', 'Delivered across 64 Districts': 'দেশের ৬৪ জেলায় ডেলিভারি',
  'Items': 'টি পণ্য',
  Gift: 'উপহার', Gifts: 'উপহার', Sunglass: 'সানগ্লাস', Sunglasses: 'সানগ্লাস',
  Watch: 'ঘড়ি', Watches: 'ঘড়ি', 'Beauty Care': 'বিউটি কেয়ার', 'Skin Care': 'স্কিনকেয়ার',
  'Hair Care': 'হেয়ার কেয়ার', 'Wellness Corner': 'ওয়েলনেস কর্নার', Accessories: 'অ্যাকসেসরিজ',
  'Formulated with clean, nutrient-rich botanicals to balance, hydrate, and protect your skin everyday.': 'ত্বকের ভারসাম্য, আর্দ্রতা ও সুরক্ষার জন্য পুষ্টিসমৃদ্ধ বিশুদ্ধ বোটানিক্যাল উপাদানে তৈরি।',
  'Explore our handpicked curation of designer sunglasses, signature timepieces, and bespoke gift boxes.': 'আমাদের বাছাই করা ডিজাইনার সানগ্লাস, বিশেষ ঘড়ি ও উপহারের বাক্স দেখুন।',
  'Pure Botanicals Meet Clinical Care': 'বিশুদ্ধ বোটানিক্যাল উপাদানে ক্লিনিক্যাল যত্ন',
  'Premium Craftsmanship Meets Modern Luxury': 'নিখুঁত কারুকাজে আধুনিক আভিজাত্য',
  'Every product in our skincare and self-care collection is thoughtfully formulated with nutrient-dense botanical extracts to strengthen your skin barrier, balance hydration, and reveal a natural, healthy glow. Cash on delivery with doorstep inspection across Bangladesh.': 'আমাদের স্কিনকেয়ার ও সেলফ-কেয়ার পণ্য পুষ্টিসমৃদ্ধ বোটানিক্যাল উপাদানে তৈরি, যা ত্বকের সুরক্ষা, আর্দ্রতার ভারসাম্য ও স্বাভাবিক উজ্জ্বলতা বজায় রাখতে সহায়তা করে। সারা বাংলাদেশে ক্যাশ অন ডেলিভারি ও পার্সেল যাচাইয়ের সুবিধা রয়েছে।',
  'Every item in our collection is curated with an unwavering commitment to craftsmanship, authentic premium quality, and timeless modern style. From iconic timepieces and designer sunglasses to unforgettable gift boxes delivered with cash on delivery across Bangladesh.': 'আমাদের প্রতিটি পণ্য বাছাই করা হয়েছে নিখুঁত কারুকাজ, আসল পণ্যের নিশ্চয়তা ও চিরকালীন আধুনিক স্টাইলের কথা মাথায় রেখে। ঘড়ি, ডিজাইনার সানগ্লাস ও স্মরণীয় উপহারের বাক্স সারা বাংলাদেশে ক্যাশ অন ডেলিভারিতে পৌঁছে দিই।',
  'CLINICAL BOTANICAL FORMULATIONS': 'ক্লিনিক্যাল বোটানিক্যাল ফর্মুলা', 'CURATED LIFESTYLE & GIFTS': 'বাছাইকৃত লাইফস্টাইল ও গিফট',
  'Signature Skincare Essentials': 'সিগনেচার স্কিনকেয়ার এসেনশিয়াল', 'Trending & Best Sellers': 'জনপ্রিয় ও বেস্টসেলার',
  'Explore our most coveted cleansers, serums, and restorative moisture balms delivered with cash on delivery across Bangladesh.': 'আমাদের জনপ্রিয় ক্লেনজার, সিরাম ও ময়েশ্চার বাম সারা বাংলাদেশে ক্যাশ অন ডেলিভারিতে নিন।',
  'Explore premium watches, apparel, curated gift boxes, and lifestyle essentials with nationwide doorstep delivery.': 'প্রিমিয়াম ঘড়ি, পোশাক, বাছাইকৃত গিফট বক্স ও লাইফস্টাইল পণ্য সারা দেশে হোম ডেলিভারিতে নিন।',
  'No Products Found in this Category': 'এই ক্যাটাগরিতে কোনো পণ্য পাওয়া যায়নি',
  'We are adding exciting new arrivals to this section shortly!': 'শিগগিরই এই বিভাগে নতুন পণ্য যোগ করা হবে!',
  'VIEW ALL PRODUCTS': 'সব পণ্য দেখুন', 'VIEW ALL PRODUCTS ({products.length}) →': 'সব পণ্য দেখুন ({products.length}) →',
  'Inspect your parcel upon arrival before making payment at your doorstep.': 'পেমেন্টের আগে ডেলিভারির সময় পার্সেল পরীক্ষা করে নিন।',
  '100% Dermatologist-Safe & Authentic': '১০০% ডার্মাটোলজিস্ট-পরীক্ষিত ও অরিজিনাল', '100% Authentic Fabrics': '১০০% অরিজিনাল কাপড়',
  'Discreet & Secure Packaging': 'গোপনীয় ও নিরাপদ প্যাকেজিং', 'Skincare Consultation Helpline': 'স্কিনকেয়ার পরামর্শ হটলাইন', '7-Day Easy Exchange': '৭ দিনের সহজ এক্সচেঞ্জ',
  'FREQUENTLY ASKED QUESTIONS': 'সাধারণ জিজ্ঞাসা', 'EXCLUSIVE OFFERS & SKINCARE LAUNCHES': 'বিশেষ অফার ও নতুন স্কিনকেয়ার',
  'EXCLUSIVE OFFERS & NEW ARRIVALS': 'বিশেষ অফার ও নতুন পণ্য', 'Be the First to Experience New Skincare Drops': 'নতুন স্কিনকেয়ার সবার আগে দেখুন',
  'Be the First to Experience New Collections': 'নতুন কালেকশন সবার আগে দেখুন', 'Enter your mobile number or email': 'মোবাইল নম্বর বা ইমেইল লিখুন',
  'Join Now →': 'এখনই যুক্ত হোন →', 'Quantity:': 'পরিমাণ:',
  'EXCLUSIVE COLLECTION': 'বিশেষ কালেকশন', 'Size:': 'সাইজ:', 'Select size': 'সাইজ বাছাই করুন',
  'SOLD OUT': 'স্টক শেষ', 'ADDED TO BAG ✓': 'ব্যাগে যোগ হয়েছে ✓', 'ADD TO CART': 'ব্যাগে যোগ করুন',
  'Customer Review': 'ক্রেতার মতামত', 'Customer Reviews': 'ক্রেতাদের মতামত', '🌿 100% Authentic Botanical': '🌿 ১০০% খাঁটি বোটানিক্যাল উপাদান',
  '✨ Verified Authentic Item': '✨ অরিজিনাল পণ্য', 'Sold Out': 'স্টক শেষ', 'In Stock': 'স্টকে আছে',
  'Instant Digital Product · 100% Free Instant Delivery (৳0 Courier Fee)': 'তাৎক্ষণিক ডিজিটাল পণ্য · ফ্রি ডেলিভারি (কুরিয়ার চার্জ ৳০)',
  'Save': 'ছাড়', 'Read Full Description & Specifications ↓': 'সম্পূর্ণ বিবরণ ও বৈশিষ্ট্য পড়ুন ↓',
  'Read Full Description & Details ↓': 'সম্পূর্ণ বিবরণ পড়ুন ↓', 'SOLD OUT (RESTOCKING SOON)': 'স্টক শেষ (শিগগিরই আসছে)',
  'ORDER NOW': 'এখনই অর্ডার করুন', '+ ADD TO SHOPPING BAG': '+ শপিং ব্যাগে যোগ করুন', 'ORDER VIA WHATSAPP': 'WhatsApp-এ অর্ডার করুন',
  '🚚 Express Delivery Nationwide': '🚚 সারা দেশে এক্সপ্রেস ডেলিভারি', '💵 Cash on Delivery at Doorstep': '💵 বাসায় ক্যাশ অন ডেলিভারি',
  '🛡️ 100% Authentic Quality': '🛡️ ১০০% অরিজিনাল পণ্য', '🔄 7-Day Easy Exchange Policy': '🔄 ৭ দিনের সহজ এক্সচেঞ্জ',
  'no reviews yet — be the first.': 'এখনও কোনো মতামত নেই—আপনিই প্রথম লিখুন।', 'leave a review': 'আপনার মতামত লিখুন',
  'your name': 'আপনার নাম', 'your thoughts (optional)': 'আপনার মতামত (ঐচ্ছিক)', 'posting…': 'পোস্ট হচ্ছে…',
  'submitted for approval ✓': 'অনুমোদনের জন্য জমা হয়েছে ✓', 'post review': 'মতামত জমা দিন', 'you may also like': 'আপনার পছন্দ হতে পারে',
  'Clean botanical formulations gentle on sensitive skin. Zero harsh parabens.': 'সংবেদনশীল ত্বকের জন্য কোমল বোটানিক্যাল ফর্মুলা, ক্ষতিকর প্যারাবেনমুক্ত।',
  'Hand-picked breathable fabrics crafted with meticulous stitching and finishing.': 'নিখুঁত সেলাই ও ফিনিশিংয়ে তৈরি বাছাইকৃত আরামদায়ক কাপড়।',
  'Every order is wrapped with utmost care to ensure pristine arrival.': 'প্রতিটি অর্ডার যত্নসহকারে প্যাক করা হয়, যাতে নিরাপদে পৌঁছায়।',
  'Have questions about your skin? Message our skincare support on WhatsApp anytime.': 'ত্বক নিয়ে প্রশ্ন আছে? যেকোনো সময় WhatsApp-এ আমাদের স্কিনকেয়ার টিমকে লিখুন।',
  "Simple and hassle-free sizing exchange if the fit isn't absolutely perfect.": 'সাইজ ঠিক না হলে সহজেই এক্সচেঞ্জ করতে পারবেন।',
  'Join our exclusive VIP circle to receive personalized skincare guides, early access to new botanical drops, and special member discounts.': 'ব্যক্তিগত স্কিনকেয়ার গাইড, নতুন পণ্যের আগাম খবর ও বিশেষ ছাড় পেতে আমাদের VIP ক্লাবে যোগ দিন।',
  'Join our exclusive VIP circle to receive private sale previews, early access to new arrivals, and special member discounts.': 'বিশেষ সেলের আগাম খবর, নতুন পণ্যের আগাম সুযোগ ও সদস্যদের ছাড় পেতে আমাদের VIP ক্লাবে যোগ দিন।',
  'How do I choose the right skincare routine for my skin type?': 'আমার ত্বকের ধরন অনুযায়ী সঠিক স্কিনকেয়ার রুটিন কীভাবে বেছে নেব?',
  'Our Silk Cleansing Gel and Daily Moisturiser are gentle and universal for all skin types, including sensitive skin. For deep hydration and visible radiance, pair them with our Hydrating Serum in the morning and Glow Night Oil before bed.': 'আমাদের সিল্ক ক্লেনজিং জেল ও ডেইলি ময়েশ্চারাইজার সংবেদনশীলসহ সব ধরনের ত্বকের জন্য কোমল। গভীর আর্দ্রতা ও উজ্জ্বলতার জন্য সকালে হাইড্রেটিং সিরাম এবং রাতে গ্লো নাইট অয়েল ব্যবহার করুন।',
  'Can I open and inspect the parcel before paying?': 'পেমেন্টের আগে কি পার্সেল খুলে দেখে নিতে পারি?',
  'Yes, absolutely! We encourage all our valued customers to inspect the outer packaging and bottle seals in front of the courier delivery agent before making cash on delivery payment.': 'অবশ্যই! ক্যাশ অন ডেলিভারির পেমেন্টের আগে কুরিয়ার প্রতিনিধির সামনে বাইরের প্যাকেজ ও বোতলের সিল পরীক্ষা করে নিন।',
  'Are these products safe for sensitive and acne-prone skin?': 'এই পণ্যগুলো কি সংবেদনশীল ও ব্রণপ্রবণ ত্বকের জন্য নিরাপদ?',
  'Yes. Every formulation is crafted with gentle botanical extracts and non-comedogenic ingredients without harsh parabens or heavy synthetic fragrances. We recommend doing a patch test before regular use.': 'হ্যাঁ। প্রতিটি ফর্মুলায় কোমল বোটানিক্যাল উপাদান ব্যবহার করা হয়েছে; এতে ক্ষতিকর প্যারাবেন বা ভারী কৃত্রিম সুগন্ধি নেই। নিয়মিত ব্যবহারের আগে প্যাচ টেস্ট করুন।',
  'How should I store serums and botanical oils for freshness?': 'সিরাম ও বোটানিক্যাল অয়েল সতেজ রাখতে কীভাবে সংরক্ষণ করব?',
  'Store in a cool, dry place away from direct sunlight and heat. Always ensure the cap or dropper bottle is sealed tightly after each use to keep active ingredients potent.': 'সরাসরি রোদ ও তাপ থেকে দূরে ঠান্ডা, শুকনো স্থানে রাখুন। সক্রিয় উপাদান ভালো রাখতে প্রতিবার ব্যবহারের পর ঢাকনা বা ড্রপার ভালোভাবে বন্ধ করুন।',
  'Simply choose your desired items, select your size, and click "ADD TO CART" or proceed to Checkout. Enter your name, delivery address, and phone number. No advance payment is needed — you only pay when your parcel is handed to you.': 'পছন্দের পণ্য ও সাইজ বেছে “ব্যাগে যোগ করুন” চাপুন বা চেকআউটে যান। নাম, ঠিকানা ও ফোন নম্বর দিন। অগ্রিম পেমেন্ট লাগবে না—পার্সেল হাতে পেলে মূল্য দেবেন।',
  'Yes, absolutely! We encourage all our valued customers to check the parcel contents and fabric quality in front of the courier delivery agent before making payment.': 'অবশ্যই! পেমেন্টের আগে কুরিয়ার প্রতিনিধির সামনে পার্সেলের পণ্য ও কাপড়ের মান পরীক্ষা করে নিন।',
  'What if the size does not fit me properly?': 'সাইজ ঠিক না হলে কী করব?',
  'We offer a hassle-free 7-day exchange guarantee. Simply contact our support team via WhatsApp or call our helpline, and we will arrange an exchange for your correct size immediately.': 'আমরা ঝামেলাহীন ৭ দিনের এক্সচেঞ্জ সুবিধা দিই। সঠিক সাইজে বদলাতে WhatsApp-এ সাপোর্ট টিমকে লিখুন বা হটলাইনে কল করুন।',
  'How should I care for and wash delicate fabrics?': 'নরম কাপড়ের যত্ন ও ধোয়ার নিয়ম কী?',
  'For best results and longevity, we recommend dry cleaning or gentle hand-washing in cold water with mild detergent. Do not bleach or tumble dry in high heat. Steam iron on low setting.': 'দীর্ঘস্থায়ী ব্যবহারের জন্য ড্রাই ক্লিন করুন অথবা হালকা ডিটারজেন্ট দিয়ে ঠান্ডা পানিতে হাতে আলতো করে ধুয়ে নিন। ব্লিচ বা উচ্চ তাপে ড্রায়ার ব্যবহার করবেন না। কম তাপে স্টিম আয়রন করুন।',
  'What are the delivery charges and delivery times?': 'ডেলিভারি চার্জ কত এবং পণ্য পৌঁছাতে কত দিন লাগে?',
  'How do I place an order with Cash on Delivery?': 'ক্যাশ অন ডেলিভারিতে কীভাবে অর্ডার করব?',
  'Contemporary modest fashion & lifestyle brand. Ethically crafted timeless modest attire, abayas, panjabis & essentials delivered across Bangladesh with cash on delivery.': 'আধুনিক ও মার্জিত পোশাক এবং লাইফস্টাইল পণ্যের ব্র্যান্ড। যত্নে তৈরি আবায়া, পাঞ্জাবি ও দৈনন্দিন প্রয়োজনীয় পণ্য ক্যাশ অন ডেলিভারিতে সারা বাংলাদেশে পৌঁছে দিই।',
  'Dermatologically-inspired botanical skincare, intimate wellness & everyday self-care rituals. Clean, gentle formulations crafted with active botanicals, delivered across Bangladesh with cash on delivery.': 'ত্বকের যত্ন, ব্যক্তিগত সুস্থতা ও দৈনন্দিন সেলফ-কেয়ারের জন্য বোটানিক্যাল পণ্য। কোমল ও কার্যকর উপাদানে তৈরি পণ্য ক্যাশ অন ডেলিভারিতে সারা বাংলাদেশে পৌঁছে দিই।',
  'Everyday: 10:00 AM – 10:00 PM': 'প্রতিদিন: সকাল ১০টা – রাত ১০টা',
  'Cash on Delivery · Steadfast Courier · 100% Authentic Quality Guaranteed': 'ক্যাশ অন ডেলিভারি · স্টেডফাস্ট কুরিয়ার · অরিজিনাল পণ্যের নিশ্চয়তা',
  'Helpline: Available 24/7': 'হটলাইন: ২৪ ঘণ্টা, সপ্তাহে ৭ দিন', 'item': 'টি পণ্য', 'items': 'টি পণ্য',
  'Color:': 'রং:',
  '🔒 Cash on Delivery · Inspect Before Payment': '🔒 ক্যাশ অন ডেলিভারি · পেমেন্টের আগে পার্সেল যাচাই করুন',
  'Discover our botanical skincare & self-care essentials to find your daily favorites.': 'প্রতিদিনের যত্নের জন্য আমাদের বোটানিক্যাল স্কিনকেয়ার ও সেলফ-কেয়ার পণ্য দেখুন।',
  'Explore our curated gifts, accessories, and lifestyle essentials.': 'আমাদের বাছাই করা উপহার, অনুষঙ্গ ও লাইফস্টাইল পণ্য দেখুন।',
  '✨ FREE SHIPPING ON ORDERS OVER ৳2500 · 100% AUTHENTIC LIFESTYLE & GIFTS · CASH ON DELIVERY NATIONWIDE': '✨ ৳২৫০০-এর বেশি অর্ডারে ফ্রি ডেলিভারি · অরিজিনাল লাইফস্টাইল পণ্য ও উপহার · সারা দেশে ক্যাশ অন ডেলিভারি',
  '✨ Pure Botanical Skincare · Cash on Delivery Nationwide · Free Shipping Over ৳2,500': '✨ বিশুদ্ধ বোটানিক্যাল স্কিনকেয়ার · সারা দেশে ক্যাশ অন ডেলিভারি · ৳২,৫০০-এর বেশি অর্ডারে ফ্রি ডেলিভারি',
  '✨ Cash on Delivery Nationwide · 100% Authentic Watches, Sunglasses & Curated Gifts · Free Delivery Over ৳2,500': '✨ সারা দেশে ক্যাশ অন ডেলিভারি · অরিজিনাল ঘড়ি, সানগ্লাস ও বাছাই করা উপহার · ৳২,৫০০-এর বেশি অর্ডারে ফ্রি ডেলিভারি',
  'ALL COLLECTIONS': 'সব কালেকশন', 'ALL PRODUCTS': 'সব পণ্য', 'SHOP NOW →': 'এখনই শপ করুন →',
  '100% Satisfaction Guarantee': '১০০% সন্তুষ্টির নিশ্চয়তা',
  '🌿 DERMATOLOGICALLY CRAFTED · BOTANICAL CARE': '🌿 ত্বক বিশেষজ্ঞের পরামর্শে তৈরি · বোটানিক্যাল যত্ন',
  '✨ EXCLUSIVE 2026 COLLECTION · PREMIUM LIFESTYLE': '✨ ২০২৬-এর বিশেষ কালেকশন · প্রিমিয়াম লাইফস্টাইল',
  'Best Gift Ever': 'সেরা উপহার',
  'Pure Botanical Radiance': 'বোটানিক্যাল উপাদানে ত্বকের উজ্জ্বলতা', 'Elevated Everyday Skincare': 'প্রতিদিনের উন্নত স্কিনকেয়ার',
  'Curated Modern Lifestyle': 'আধুনিক জীবনযাপনের বাছাই করা অনুষঙ্গ', 'Watches, Sunglasses & Gifts': 'ঘড়ি, সানগ্লাস ও উপহার',
  'Nourish your skin barrier with clinically-inspired botanical cleansers, hydrating serums, and restorative moisture balms. Cash on delivery nationwide.': 'বোটানিক্যাল ক্লেনজার, হাইড্রেটিং সিরাম ও ময়েশ্চার বামে ত্বকের যত্ন নিন। সারা দেশে ক্যাশ অন ডেলিভারি।',
  'Discover signature sunglasses, authentic timepieces, and bespoke gift boxes crafted for timeless elegance. Cash on delivery nationwide.': 'চিরকালীন আভিজাত্যের জন্য বাছাই করা সানগ্লাস, অরিজিনাল ঘড়ি ও বিশেষ গিফট বক্স দেখুন। সারা দেশে ক্যাশ অন ডেলিভারি।',
  'EXPLORE SKINCARE →': 'স্কিনকেয়ার পণ্য দেখুন →', 'EXPLORE COLLECTIONS →': 'কালেকশন দেখুন →',
  'Delivery inside Dhaka is typically 24–48 hours (৳70). Delivery outside Dhaka takes 2–4 business days (৳130). Orders above ৳1,999 qualify for 100% Free Nationwide Delivery.': 'ঢাকার ভেতরে সাধারণত ২৪–৪৮ ঘণ্টায় (৳৭০) এবং ঢাকার বাইরে ২–৪ কর্মদিবসে (৳১৩০) পণ্য পৌঁছে যায়। ৳১,৯৯৯-এর বেশি অর্ডারে সারা দেশে ডেলিভারি ফ্রি।',
};

export const STORE_COPY_KEYS = Object.keys(BN).sort((a, b) => a.localeCompare(b));

export function tr(text: string, language: StoreLanguage): string {
  const override = copyOverrides[text]?.[language];
  if (typeof override === 'string' && override.length) return override;
  return language === 'bn' ? (BN[text] || text) : text;
}
