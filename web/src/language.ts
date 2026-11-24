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
  Home: 'হোম', Shop: 'শপ', All: 'সব', 'All Products': 'সব পণ্য', 'All Skincare': 'সব স্কিনকেয়ার পণ্য', 'All Collections': 'সব কালেকশন',
  'More Categories': 'আরও ক্যাটাগরি', 'Track Order': 'অর্ডারের অবস্থা দেখুন', 'Search collections': 'পণ্য খুঁজুন',
  'Shopping Cart': 'শপিং ব্যাগ', Cart: 'ব্যাগ', Bag: 'ব্যাগ', Account: 'অ্যাকাউন্ট',
  'VIP Sign In / Register (5% OFF)': 'ভিআইপি লগইন / নিবন্ধন (প্রথম অর্ডারে ৫% ছাড়)',
  'Track Your Order': 'অর্ডারের অবস্থা দেখুন', 'Shipping & Delivery': 'শিপিং ও ডেলিভারি',
  'Returns & Exchanges': 'রিটার্ন ও পণ্য বদল', 'Contact Customer Support': 'কাস্টমার সাপোর্টে যোগাযোগ',
  'Download Android App': 'অ্যান্ড্রয়েড অ্যাপ ডাউনলোড',
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
  'Cash on delivery is available. Parcel inspection depends on the courier’s policy; contact us before ordering if inspection is important to you.': 'ক্যাশ অন ডেলিভারি সুবিধা রয়েছে। পার্সেল খোলার সুযোগ কুরিয়ারের নীতির ওপর নির্ভর করে; এটি গুরুত্বপূর্ণ হলে অর্ডারের আগে আমাদের সঙ্গে যোগাযোগ করুন।',
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
  'Parcel inspection depends on the courier’s policy. Contact us before ordering if inspection is important to you.': 'পার্সেল খোলার সুযোগ কুরিয়ারের নীতির ওপর নির্ভর করে। এটি গুরুত্বপূর্ণ হলে অর্ডারের আগে আমাদের সঙ্গে যোগাযোগ করুন।',
  'Ingredients & Product Information': 'উপাদান ও পণ্য-সংক্রান্ত তথ্য', 'Curated Lifestyle Essentials': 'বাছাইকৃত লাইফস্টাইল পণ্য',
  'Review ingredients and directions on each product page. Patch test before first use.': 'প্রতিটি পণ্যের উপাদান ও ব্যবহারের নির্দেশনা পড়ুন। প্রথমবার ব্যবহারের আগে প্যাচ টেস্ট করুন।',
  'Carefully selected watches, sunglasses, and gifts for everyday style.': 'দৈনন্দিন ব্যবহারের জন্য বাছাইকৃত ঘড়ি, সানগ্লাস ও উপহার।',
  'Product Details & Ingredient Information': 'পণ্যের বিবরণ ও উপাদান-সংক্রান্ত তথ্য', 'Customer Support Available': 'ক্রেতা সহায়তা পাওয়া যায়',
  'Skincare FAQs': 'স্কিনকেয়ার সম্পর্কিত প্রশ্ন', 'Lifestyle & Gift FAQs': 'লাইফস্টাইল ও উপহার সম্পর্কিত প্রশ্ন',
  'Product Details Available': 'পণ্যের বিবরণ দেখুন', 'Courier Inspection Policy Applies': 'পার্সেল পরীক্ষা কুরিয়ারের নীতির ওপর নির্ভরশীল',
  'Courier inspection policy applies': 'পার্সেল পরীক্ষা কুরিয়ারের নীতির ওপর নির্ভরশীল',
  'Parcel inspection follows the courier policy. Report transit damage to customer support promptly; requests are handled under the published returns policy.': 'পার্সেল পরীক্ষা কুরিয়ারের নীতির ওপর নির্ভরশীল। পরিবহনের সময় ক্ষতি হলে দ্রুত গ্রাহক সহায়তায় জানান; অনুরোধ প্রকাশিত রিটার্ন নীতি অনুযায়ী বিবেচনা করা হবে।',
  'Pay cash to the delivery courier when your parcel arrives. Parcel opening before payment depends on the courier’s policy.': 'পার্সেল পৌঁছালে ডেলিভারি প্রতিনিধিকে নগদ মূল্য দিন। পেমেন্টের আগে পার্সেল খোলার সুবিধা কুরিয়ারের নীতির ওপর নির্ভর করে।',
  'Ingredient Details on Product Pages': 'পণ্যের পাতায় উপাদানের বিবরণ',
  'Product information is shown on each item page': 'প্রতিটি পণ্যের পাতায় বিস্তারিত তথ্য দেওয়া আছে',
  'CURATED SKINCARE & BEAUTY': 'বাছাইকৃত স্কিনকেয়ার ও বিউটি পণ্য',
  'Skincare & Beauty Picks': 'স্কিনকেয়ার ও বিউটি পণ্য',
  'Explore skincare, beauty, and personal care products from a range of brands. Check each listing for product details, ingredients, and directions. Cash on delivery across Bangladesh.': 'বিভিন্ন ব্র্যান্ডের স্কিনকেয়ার, বিউটি ও ব্যক্তিগত যত্নের পণ্য দেখুন। পণ্যের বিবরণ, উপাদান ও ব্যবহারের নির্দেশনা প্রতিটি পাতায় দেখুন। সারা বাংলাদেশে ক্যাশ অন ডেলিভারি।',
  'Browse skincare and personal care products by category. Check product pages for ingredients and usage directions.': 'ক্যাটাগরি অনুযায়ী স্কিনকেয়ার ও ব্যক্তিগত যত্নের পণ্য দেখুন। উপাদান ও ব্যবহারের নির্দেশনা পণ্যের পাতায় দেখুন।',
  '🌿 SKINCARE & SELF-CARE · CAREFULLY CURATED': '🌿 স্কিনকেয়ার ও সেলফ-কেয়ার · বাছাইকৃত পণ্য',
  'Skincare & Self-Care': 'স্কিনকেয়ার ও সেলফ-কেয়ার',
  'Skincare & Self-Care, Carefully Curated': 'স্কিনকেয়ার ও সেলফ-কেয়ার, যত্নসহকারে বাছাই করা',
  'Product Help & Customer Support': 'পণ্য-সংক্রান্ত সহায়তা ও ক্রেতা সেবা',
  'Questions about a product listing or order? Contact our customer support on WhatsApp.': 'পণ্যের বিবরণ বা অর্ডার নিয়ে প্রশ্ন আছে? WhatsApp-এ ক্রেতা সহায়তার সঙ্গে যোগাযোগ করুন।',
  'Skincare, beauty, and personal care products from a range of brands. Check each listing for ingredients and directions. Cash on delivery nationwide.': 'বিভিন্ন ব্র্যান্ডের স্কিনকেয়ার, বিউটি ও ব্যক্তিগত যত্নের পণ্য দেখুন। উপাদান ও ব্যবহারের নির্দেশনা পণ্যের পাতায় দেখুন। সারা দেশে ক্যাশ অন ডেলিভারি।',
  'Browse skincare and personal care by category. Product details are listed on individual product pages.': 'ক্যাটাগরি অনুযায়ী স্কিনকেয়ার ও ব্যক্তিগত যত্নের পণ্য দেখুন। প্রতিটি পণ্যের বিবরণ তার নিজস্ব পাতায় আছে।',
  'Explore skincare, beauty, and self-care products from a range of brands. Review each product listing and package for ingredients and directions. Cash on delivery across Bangladesh.': 'বিভিন্ন ব্র্যান্ডের স্কিনকেয়ার, বিউটি ও সেলফ-কেয়ার পণ্য দেখুন। উপাদান ও ব্যবহারের নির্দেশনা পণ্যের পাতা বা প্যাকেটে যাচাই করুন। সারা বাংলাদেশে ক্যাশ অন ডেলিভারি।',
  'Skincare, beauty and self-care products from a range of brands, delivered across Bangladesh with cash on delivery. Check each listing for product and ingredient details.': 'বিভিন্ন ব্র্যান্ডের স্কিনকেয়ার, বিউটি ও সেলফ-কেয়ার পণ্য সারা বাংলাদেশে ক্যাশ অন ডেলিভারিতে পৌঁছে দেওয়া হয়। পণ্যের ও উপাদানের বিবরণ প্রতিটি পাতায় দেখুন।',
  'Explore skincare, beauty, and personal care products from a range of brands.': 'বিভিন্ন ব্র্যান্ডের স্কিনকেয়ার, বিউটি ও ব্যক্তিগত যত্নের পণ্য দেখুন।',
  'Check the product page and package for ingredients, size, and usage directions.': 'উপাদান, সাইজ ও ব্যবহারের নির্দেশনার জন্য পণ্যের পাতা ও প্যাকেট দেখুন।',
  'Review the product listing and package for ingredients': 'উপাদান দেখতে পণ্যের তালিকা ও প্যাকেট যাচাই করুন',
  'Follow the usage directions provided by the product brand': 'পণ্যের ব্র্যান্ডের দেওয়া ব্যবহারের নির্দেশনা অনুসরণ করুন',
  'Individual skin suitability can vary': 'পণ্য ব্যক্তিভেদে ভিন্নভাবে উপযোগী হতে পারে',
  'Product Information': 'পণ্যের তথ্য', 'Packaging Details': 'প্যাকেজিংয়ের বিবরণ',
  'Refer to the product listing and package for packaging and storage information.': 'প্যাকেজিং ও সংরক্ষণের তথ্য পণ্যের পাতা ও প্যাকেটে দেখুন।',
  'Review the product label; suitability varies by person': 'পণ্যের লেবেল দেখুন; উপযোগিতা ব্যক্তিভেদে ভিন্ন হতে পারে',
  'See product listing or package for ingredient and usage details': 'উপাদান ও ব্যবহারের বিবরণের জন্য পণ্যের পাতা বা প্যাকেট দেখুন',
  'See the product listing for package contents': 'প্যাকেটে কী আছে তা পণ্যের পাতায় দেখুন',
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
  'Save': 'সংরক্ষণ', 'Read Full Description & Specifications ↓': 'সম্পূর্ণ বিবরণ ও বৈশিষ্ট্য পড়ুন ↓',
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
  'Start with products suited to your skin and follow each product label. Introduce one new product at a time and patch test before regular use. For persistent or concerning skin issues, consult a qualified dermatologist.': 'আপনার ত্বকের উপযোগী পণ্য বেছে নিয়ে পণ্যের নির্দেশনা অনুসরণ করুন। একবারে একটি নতুন পণ্য ব্যবহার শুরু করুন এবং নিয়মিত ব্যবহারের আগে প্যাচ টেস্ট করুন। দীর্ঘস্থায়ী বা উদ্বেগজনক সমস্যায় যোগ্য চর্মরোগ বিশেষজ্ঞের পরামর্শ নিন।',
  'Product suitability varies by person. Review each product’s ingredient list and directions, patch test before first use, and stop using it if irritation occurs. Consult a qualified dermatologist about persistent skin concerns.': 'পণ্য সবার ত্বকে একইভাবে উপযোগী নাও হতে পারে। উপাদান ও নির্দেশনা দেখে নিন, প্রথম ব্যবহারের আগে প্যাচ টেস্ট করুন এবং জ্বালা হলে ব্যবহার বন্ধ করুন। দীর্ঘস্থায়ী সমস্যায় যোগ্য চর্মরোগ বিশেষজ্ঞের পরামর্শ নিন।',
  'Choose a product and any available options, then click "ADD TO CART" or proceed to Checkout. Enter your name, delivery address, and phone number. No advance payment is needed — you pay when your parcel is handed to you.': 'পণ্য ও প্রযোজ্য বিকল্প বেছে “ব্যাগে যোগ করুন” চাপুন বা চেকআউটে যান। নাম, ঠিকানা ও ফোন নম্বর দিন। অগ্রিম পেমেন্ট লাগবে না—পার্সেল হাতে পেলে মূল্য দেবেন।',
  'Yes. You may inspect the parcel contents and item condition in front of the courier delivery agent before paying, subject to the courier’s inspection rules.': 'কুরিয়ারের পরিদর্শন-নিয়ম সাপেক্ষে পেমেন্টের আগে ডেলিভারি প্রতিনিধির সামনে পার্সেলের পণ্য ও অবস্থা পরীক্ষা করতে পারেন।',
  'What if I have an issue with my order?': 'অর্ডারে সমস্যা হলে কী করব?',
  'Contact customer support using the phone or WhatsApp links on this site and include your order number so the team can help.': 'এই সাইটের ফোন বা WhatsApp লিংকে ক্রেতা সহায়তার সঙ্গে যোগাযোগ করুন। অর্ডার নম্বর দিলে টিম আপনাকে সহায়তা করতে পারবে।',
  'How can I contact customer support?': 'ক্রেতা সহায়তার সঙ্গে কীভাবে যোগাযোগ করব?',
  'Use the phone or WhatsApp links in the Customer Support section. Please include your order number when asking about an existing order.': 'Customer Support অংশের ফোন বা WhatsApp লিংক ব্যবহার করুন। আগের অর্ডার সম্পর্কে জানতে অর্ডার নম্বর দিন।',
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
  'Watches, sunglasses and gift collections for everyday style. Cash on delivery across Bangladesh.': 'দৈনন্দিন ব্যবহারের ঘড়ি, সানগ্লাস ও উপহারের কালেকশন। সারা বাংলাদেশে ক্যাশ অন ডেলিভারি।',
  'Dermatologically-inspired botanical skincare, intimate wellness & everyday self-care rituals. Clean, gentle formulations crafted with active botanicals, delivered across Bangladesh with cash on delivery.': 'ত্বকের যত্ন, ব্যক্তিগত সুস্থতা ও দৈনন্দিন সেলফ-কেয়ারের জন্য বোটানিক্যাল পণ্য। কোমল ও কার্যকর উপাদানে তৈরি পণ্য ক্যাশ অন ডেলিভারিতে সারা বাংলাদেশে পৌঁছে দিই।',
  'Everyday: 10:00 AM – 10:00 PM': 'প্রতিদিন: সকাল ১০টা – রাত ১০টা',
  'Cash on Delivery · Steadfast Courier · 100% Authentic Quality Guaranteed': 'ক্যাশ অন ডেলিভারি · স্টেডফাস্ট কুরিয়ার · অরিজিনাল পণ্যের নিশ্চয়তা',
  'Helpline: Available 24/7': 'হটলাইন: ২৪ ঘণ্টা, সপ্তাহে ৭ দিন', 'item': 'টি পণ্য', 'items': 'টি পণ্য',
  'Color:': 'রং:',
  '🔒 Cash on Delivery · Courier Inspection Policy Applies': '🔒 ক্যাশ অন ডেলিভারি · পার্সেল পরীক্ষা কুরিয়ারের নীতির ওপর নির্ভরশীল',
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
  'Express Nationwide Delivery': 'সারা দেশে এক্সপ্রেস ডেলিভারি',
  'Cash on Delivery Available': 'ক্যাশ অন ডেলিভারি সুবিধা',
  'Inspected & Carefully Packed': 'যাচাইকৃত ও যত্নসহকারে প্যাকেজিং',
  '7-Day Easy Exchange Guarantee': '৭ দিনের সহজ এক্সচেঞ্জ নিশ্চয়তা',
  'View Complete Specifications & Details': 'সম্পূর্ণ বিবরণ ও স্পেসিফিকেশন দেখুন',
  'Delivery inside Dhaka is typically 24–48 hours (৳70). Delivery outside Dhaka takes 2–4 business days (৳130). Orders above ৳1,999 qualify for 100% Free Nationwide Delivery.': 'ঢাকার ভেতরে সাধারণত ২৪–৪৮ ঘণ্টায় (৳৭০) এবং ঢাকার বাইরে ২–৪ কর্মদিবসে (৳১৩০) পণ্য পৌঁছে যায়। ৳১,৯৯৯-এর বেশি অর্ডারে সারা দেশে ডেলিভারি ফ্রি।',
  // Shared admin navigation and everyday controls
  'Dashboard': 'ড্যাশবোর্ড', 'Search': 'খুঁজুন', 'Quick Search': 'দ্রুত খোঁজ', 'Operations': 'কার্যক্রম',
  'Web Orders': 'ওয়েব অর্ডার', 'Store Orders': 'স্টোর অর্ডার', 'Landing Funnels': 'ল্যান্ডিং ফানেল',
  'Approved Orders': 'অনুমোদিত অর্ডার', 'Order List': 'অর্ডার তালিকা', 'Orders Dashboard': 'অর্ডার ড্যাশবোর্ড',
  'Preorders': 'প্রি-অর্ডার', 'Bulk Order Actions': 'একসঙ্গে অর্ডারের কাজ', 'Scan To Update': 'স্ক্যান করে আপডেট',
  'Courier Invoice Upload': 'কুরিয়ার ইনভয়েস আপলোড', 'Courier API Setup': 'কুরিয়ার API সেটআপ', 'Fraud & Risk Protection': 'জালিয়াতি ও ঝুঁকি সুরক্ষা',
  'Ads': 'বিজ্ঞাপন', 'Ads Dashboard': 'বিজ্ঞাপন ড্যাশবোর্ড', 'Meta Ads': 'মেটা বিজ্ঞাপন', 'Record Ad Spend': 'বিজ্ঞাপনের খরচ লিখুন',
  'Ad Profit Analysis': 'বিজ্ঞাপনের লাভ বিশ্লেষণ', 'TikTok Ads': 'টিকটক বিজ্ঞাপন', 'Google Ads': 'গুগল বিজ্ঞাপন',
  'Inventory': 'ইনভেন্টরি', 'Product List': 'পণ্যের তালিকা', 'Categories': 'ক্যাটাগরি', 'Color Palette': 'রঙের তালিকা', 'Landing Pages': 'ল্যান্ডিং পেজ', 'Media Library': 'মিডিয়া লাইব্রেরি',
  'Messages': 'মেসেজ', 'WhatsApp Automation': 'WhatsApp অটোমেশন', 'Message Marketing': 'মেসেজ মার্কেটিং', 'Business Webmail': 'ব্যবসায়িক ওয়েবমেইল', 'Push Notifications': 'পুশ নোটিফিকেশন', 'Customer Reviews': 'ক্রেতার রিভিউ',
  'Purchase': 'ক্রয়', 'Finance & Ledger': 'অর্থ ও লেজার', 'Finance Dashboard': 'ফাইন্যান্স ড্যাশবোর্ড', 'Accounts & Bank': 'অ্যাকাউন্ট ও ব্যাংক', 'Income & Expense': 'আয় ও ব্যয়', 'Courier Settlement': 'কুরিয়ার হিসাব', 'Cash Flow': 'নগদ প্রবাহ', 'Asset Management': 'সম্পদ ব্যবস্থাপনা', 'Payment Gateways': 'পেমেন্ট গেটওয়ে', 'Coupons & Discounts': 'কুপন ও ছাড়',
  'Profit & Loss': 'লাভ ও ক্ষতি', 'Order Report': 'অর্ডার রিপোর্ট', 'Courier Report': 'কুরিয়ার রিপোর্ট', 'Product Report': 'পণ্য রিপোর্ট', 'Employee Report': 'কর্মী রিপোর্ট', 'Call Center Report': 'কল সেন্টার রিপোর্ট', 'Customer Report': 'ক্রেতা রিপোর্ট', 'Business Reports': 'ব্যবসার রিপোর্ট',
  'Live reports from your saved orders, calls and finance records.': 'সংরক্ষিত অর্ডার, কল ও ফাইন্যান্স রেকর্ড থেকে লাইভ রিপোর্ট।', 'Period': 'সময়কাল', 'Last 7 days': 'গত ৭ দিন', 'Last 30 days': 'গত ৩০ দিন', 'Updated': 'আপডেট হয়েছে', 'Search this report...': 'এই রিপোর্টে খুঁজুন...', 'Some report data could not be loaded. Check your access and refresh.': 'কিছু রিপোর্টের তথ্য আনা যায়নি। অনুমতি দেখে আবার রিফ্রেশ করুন।', 'Profit is estimated: some delivered items do not have a recorded cost price.': 'লাভের হিসাব আনুমানিক: কিছু ডেলিভারি পণ্যের ক্রয়মূল্য সংরক্ষিত নেই।', 'Delivered revenue': 'ডেলিভারি থেকে আয়', 'Recorded product cost': 'সংরক্ষিত পণ্যমূল্য', 'Recorded expenses': 'সংরক্ষিত ব্যয়', 'Estimated net profit': 'আনুমানিক নিট লাভ', 'item(s) have no cost recorded': 'টি পণ্যের ক্রয়মূল্য নেই', 'Cost recorded for all delivered items': 'সব ডেলিভারি পণ্যের ক্রয়মূল্য আছে', 'delivered orders': 'টি ডেলিভারি অর্ডার', 'Revenue − product cost − expenses − saved courier fees': 'আয় − পণ্যমূল্য − ব্যয় − সংরক্ষিত কুরিয়ার ফি', 'Profit uses delivered order revenue and recorded product costs, expenses and courier fees. Missing cost or fee values make this an estimate.': 'লাভে ডেলিভারি অর্ডারের আয়, সংরক্ষিত পণ্যমূল্য, ব্যয় ও কুরিয়ার ফি ব্যবহার করা হয়েছে। কোনো তথ্য না থাকলে হিসাবটি আনুমানিক।', 'Order value': 'অর্ডারের মূল্য', 'Cancelled / returned': 'বাতিল / ফেরত', 'Couriers in report': 'রিপোর্টে কুরিয়ার', 'Delivery rate': 'ডেলিভারি হার', 'Products sold': 'বিক্রি হওয়া পণ্য', 'Units': 'ইউনিট', 'Sales value': 'বিক্রয়মূল্য', 'Customers': 'ক্রেতা', 'Repeat buyers': 'একাধিকবার কেনা ক্রেতা', 'Agents': 'এজেন্ট', 'Answered': 'উত্তর দেওয়া', 'No answer': 'উত্তর নেই', 'Talk time': 'কথার সময়', 'Team members': 'টিম সদস্য', 'Orders handled': 'পরিচালিত অর্ডার', 'Sales value': 'বিক্রয়মূল্য', 'rows': 'টি সারি', 'Showing': 'দেখানো হচ্ছে', 'Updating…': 'আপডেট হচ্ছে…', 'Loading report data…': 'রিপোর্টের তথ্য লোড হচ্ছে…', 'No records found for this period.': 'এই সময়ে কোনো রেকর্ড পাওয়া যায়নি।',
  'Task & Follow-up': 'কাজ ও ফলো-আপ', 'Customer CRM': 'ক্রেতা CRM', 'Customer Feedback': 'ক্রেতার মতামত',
  'Call Center': 'কল সেন্টার', 'IP Phone Calling': 'IP ফোন কল', 'Call Records & Audit': 'কল রেকর্ড ও নিরীক্ষা', 'My Phone Setup': 'আমার ফোন সেটআপ',
  'Work Inbox': 'কাজের ইনবক্স', 'Customers': 'ক্রেতা', 'HRM': 'মানবসম্পদ', 'Finance': 'অর্থ বিভাগ', 'Reports': 'রিপোর্ট',
  'Settings': 'সেটিংস', 'Store Settings': 'স্টোর সেটিংস', 'Backup & Restore': 'ব্যাকআপ ও পুনরুদ্ধার', 'Support': 'সহায়তা', 'Help Center': 'সহায়তা কেন্দ্র', 'Updates': 'আপডেট',
  'Light theme': 'লাইট থিম', 'Dark theme': 'ডার্ক থিম', 'View store': 'স্টোর দেখুন', 'Log out': 'লগ আউট', 'Pin': 'পিন করুন', 'Unpin': 'পিন সরান',
  'Create New Order (Phone / WhatsApp)': 'নতুন অর্ডার তৈরি (ফোন / WhatsApp)', 'Sync Couriers': 'কুরিয়ার সিঙ্ক করুন', 'Export CSV': 'CSV এক্সপোর্ট', 'Import Excel / CSV': 'Excel / CSV ইমপোর্ট',
  'Ready To Ship': 'পাঠানোর জন্য প্রস্তুত', 'Pending': 'অপেক্ষমাণ', 'Incomplete': 'অসম্পূর্ণ', 'Approved': 'অনুমোদিত', 'Hold': 'স্থগিত', 'Confirmed': 'নিশ্চিত', 'Shipped': 'পাঠানো হয়েছে', 'Courier Hold': 'কুরিয়ারে আটকে আছে', 'Delivered': 'ডেলিভারি হয়েছে', 'Cancelled': 'বাতিল', 'Return': 'ফেরত', 'Lost Parcel': 'পার্সেল হারিয়েছে', 'Exchange': 'এক্সচেঞ্জ',
  'Search ID, customer, phone, SKU...': 'আইডি, ক্রেতা, ফোন বা SKU খুঁজুন...', 'All SKUs / Products': 'সব SKU / পণ্য', 'All Campaigns': 'সব ক্যাম্পেইন', 'All couriers': 'সব কুরিয়ার', 'All time': 'সব সময়', 'Newest': 'নতুন আগে', 'Clear filters': 'ফিল্টার মুছুন',
  'ORDER & DATE': 'অর্ডার ও তারিখ', 'CUSTOMER': 'ক্রেতা', 'ITEM & OPTION': 'পণ্য ও বিকল্প', 'TOTAL': 'সর্বমোট', 'STATUS': 'অবস্থা', 'TRUST SCORE': 'বিশ্বাসযোগ্যতা', 'ACTIONS': 'কাজ', 'Actions': 'কাজ', 'Qty': 'পরিমাণ', 'Call': 'কল', 'Manual log': 'কলের নোট', 'No calls logged': 'কোনো কলের নোট নেই', 'Select courier...': 'কুরিয়ার বাছুন...', 'Choose status...': 'অবস্থা বাছুন...',
  'Language': 'ভাষা', 'English': 'ইংরেজি', 'Bangla': 'বাংলা', 'Delete': 'মুছুন', 'Edit': 'সম্পাদনা', 'Refresh data': 'তথ্য রিফ্রেশ করুন', 'Loading...': 'লোড হচ্ছে...', 'No results': 'কোনো ফলাফল নেই',
  'Orders': 'অর্ডার', 'Status': 'অবস্থা', 'Enabled': 'চালু', 'Action': 'কাজ', 'Customer': 'ক্রেতা', 'Products': 'পণ্য', 'Today': 'আজ', 'Yesterday': 'গতকাল', 'Order': 'অর্ডার', 'Total': 'মোট', 'Date': 'তারিখ', 'Category': 'ক্যাটাগরি', 'Note': 'নোট', 'Type': 'ধরন', 'Customer Name': 'ক্রেতার নাম', 'Clear': 'মুছুন', 'Clear selection': 'নির্বাচন মুছুন', 'Phone': 'ফোন', 'Method': 'পদ্ধতি', 'Select account': 'অ্যাকাউন্ট বাছুন', 'Amount': 'পরিমাণ', 'Reference': 'রেফারেন্স', 'Campaigns': 'ক্যাম্পেইন', 'Copy': 'কপি', 'Download': 'ডাউনলোড', 'Duplicates': 'একই রকম', 'Total:': 'মোট:', 'IP Calls': 'IP কল', 'Delivery Address': 'ডেলিভারির ঠিকানা', 'None': 'কিছুই নয়', 'Total Products': 'মোট পণ্য', 'Price (৳)': 'দাম (৳)', 'Size': 'সাইজ', 'Color': 'রং', 'Page title': 'পেজের শিরোনাম', 'Live': 'লাইভ', 'Sender ID': 'প্রেরকের আইডি', 'API key': 'API কী', 'Username': 'ব্যবহারকারীর নাম', 'Password': 'পাসওয়ার্ড', 'Client ID': 'ক্লায়েন্ট আইডি', 'Client Secret': 'ক্লায়েন্ট সিক্রেট', 'Store ID': 'স্টোর আইডি', 'Select store…': 'স্টোর বাছুন…', 'Environment': 'পরিবেশ', 'Production (Live)': 'প্রোডাকশন (লাইভ)', 'Sandbox (Testing)': 'স্যান্ডবক্স (পরীক্ষা)', 'Add account': 'অ্যাকাউন্ট যোগ করুন', 'Other': 'অন্যান্য', 'Opening balance': 'প্রারম্ভিক ব্যালেন্স', 'Title': 'শিরোনাম', 'Income': 'আয়', 'Purchase date': 'কেনার তারিখ', 'Purchase value': 'কেনার মূল্য', 'Current value': 'বর্তমান মূল্য', 'Net Profit': 'নিট লাভ', 'Net Receivable': 'নিট পাওনা', 'Showing': 'দেখানো হচ্ছে', 'Tap': 'ট্যাপ', 'Selected Image:': 'নির্বাচিত ছবি:', 'Order #': 'অর্ডার #', 'Mobile Number': 'মোবাইল নম্বর', 'District': 'জেলা', 'Unassigned': 'বরাদ্দ হয়নি', 'Delivered Orders': 'ডেলিভারি হওয়া অর্ডার', 'Orders (Delivered)': 'অর্ডার (ডেলিভারি হয়েছে)', 'Delivered Revenue': 'ডেলিভারি থেকে আয়', 'Ad Spend': 'বিজ্ঞাপনের খরচ', 'True Net Profit': 'প্রকৃত নিট লাভ', 'True Net Cash Profit': 'প্রকৃত নিট নগদ লাভ', 'Pending Courier Payout': 'কুরিয়ার থেকে বাকি পাওনা', 'Mark read': 'পড়া হয়েছে চিহ্নিত করুন', 'Close': 'বন্ধ করুন',
  'Executive Business Dashboard': 'ব্যবসার এক্সিকিউটিভ ড্যাশবোর্ড', 'Live Data': 'লাইভ তথ্য', 'Today’s Work Summary': 'আজকের কাজের সারাংশ', 'New orders today': 'আজকের নতুন অর্ডার', 'Pending confirmation': 'নিশ্চিতকরণের অপেক্ষায়', 'Ready to ship': 'পাঠানোর জন্য প্রস্তুত', 'Approved / confirmed · no booking': 'অনুমোদিত / নিশ্চিত · কুরিয়ার বুক হয়নি', 'Possible duplicate shipment': 'একই পার্সেল একাধিকবার পাঠানোর সম্ভাবনা', 'Same phone and product · review manually': 'একই ফোন ও পণ্য · হাতে যাচাই করুন', 'Shipment needs follow-up': 'শিপমেন্টে ফলো-আপ দরকার', 'This Month': 'এই মাস', 'All Time': 'সব সময়', 'Live · refreshed every 5s': 'লাইভ · প্রতি ৫ সেকেন্ডে আপডেট',
  'Sign in to manage your store.': 'আপনার স্টোর পরিচালনা করতে সাইন ইন করুন।', 'Forgot password?': 'পাসওয়ার্ড ভুলে গেছেন?', 'Reset Password': 'পাসওয়ার্ড রিসেট', 'Set New Password': 'নতুন পাসওয়ার্ড দিন', 'Enter Verification Code': 'ভেরিফিকেশন কোড লিখুন', 'Verify & Continue →': 'যাচাই করে এগিয়ে যান →', 'Resend code': 'কোড আবার পাঠান', 'Verified successfully': 'সফলভাবে যাচাই হয়েছে', 'Two-Step Verification': 'দুই ধাপের যাচাইকরণ', 'Live updates': 'লাইভ আপডেট', 'Review orders, follow fulfillment, and manage customer requests.': 'অর্ডার দেখুন, ডেলিভারির অগ্রগতি অনুসরণ করুন এবং ক্রেতার অনুরোধ সামলান।', 'Select visible': 'দেখানো সব নির্বাচন', 'Clear selection': 'নির্বাচন মুছুন', 'Selected total': 'নির্বাচিত অর্ডারের মোট', 'Book courier': 'কুরিয়ার বুক করুন', 'Close box': 'বক্স বন্ধ করুন', 'Update status': 'অবস্থা আপডেট', 'Assign courier': 'কুরিয়ার বরাদ্দ', 'Print slips': 'স্লিপ প্রিন্ট', 'Print invoices': 'ইনভয়েস প্রিন্ট', 'Courier': 'কুরিয়ার', 'Payment Method': 'পেমেন্ট পদ্ধতি', 'Collect on delivery': 'ডেলিভারির সময় সংগ্রহ', 'Search by name or phone': 'নাম বা ফোন দিয়ে খুঁজুন', 'Choose a real store product...': 'স্টোরের পণ্য বাছুন...', 'Write your campaign message...': 'ক্যাম্পেইনের মেসেজ লিখুন...', 'Start campaign': 'ক্যাম্পেইন শুরু করুন', 'Send test': 'টেস্ট পাঠান', 'SMS Marketing API': 'SMS মার্কেটিং API', 'Send URL template': 'পাঠানোর URL টেমপ্লেট', 'Request method': 'রিকোয়েস্ট পদ্ধতি', 'Test connection': 'কানেকশন পরীক্ষা', 'Send test SMS': 'টেস্ট SMS পাঠান', 'Connection only': 'শুধু কানেকশন সেটআপ', 'Save API settings': 'API সেটিংস সংরক্ষণ', 'Add movement': 'লেনদেন যোগ করুন', 'Record money movement': 'টাকার লেনদেন লিখুন', 'Movement type': 'লেনদেনের ধরন', 'From account': 'যে অ্যাকাউন্ট থেকে', 'To account': 'যে অ্যাকাউন্টে', 'Save movement': 'লেনদেন সংরক্ষণ', 'Combined balance': 'মোট ব্যালেন্স', 'Current Business Position': 'বর্তমান ব্যবসার অবস্থা', 'Period Summary': 'নির্বাচিত সময়ের সারাংশ', 'Sales Revenue': 'বিক্রির আয়', 'Other Income': 'অন্যান্য আয়', 'Total Expense': 'মোট খরচ', 'Net Cash Flow': 'নিট নগদ প্রবাহ', 'Estimated Net Profit': 'আনুমানিক নিট লাভ', 'Cash / Bank': 'নগদ / ব্যাংক', 'Supplier Due': 'সরবরাহকারীর বাকি', 'Courier Payable': 'কুরিয়ার পাওনা', 'COD Receivable': 'COD পাওনা', 'Inventory Value': 'পণ্যের মজুত মূল্য', 'Fixed Asset Value': 'স্থায়ী সম্পদের মূল্য', 'Accounts & Bank': 'অ্যাকাউন্ট ও ব্যাংক', 'Income & Expense': 'আয় ও ব্যয়', 'Courier Settlement': 'কুরিয়ার হিসাব', 'Cash Flow': 'নগদ প্রবাহ', 'Asset Management': 'সম্পদ ব্যবস্থাপনা',
};

export const STORE_COPY_KEYS = Object.keys(BN).sort((a, b) => a.localeCompare(b));

export function tr(text: string, language: StoreLanguage): string {
  const override = copyOverrides[text]?.[language];
  if (typeof override === 'string' && override.length) return override;
  return language === 'bn' ? (BN[text] || text) : text;
}
