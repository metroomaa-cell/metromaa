import React, { useState, useEffect, useRef } from 'react';
import { placeOrder, getSettings, taka, getDeviceId } from './api';
import { dl, ecView, ecAdd, ecBeginCheckout, ecPurchase, fbTrack } from './analytics';
import { go } from './cart';
import { WhatsAppIcon } from './icons';

// Icons
function CheckCircleIcon({ color = 'currentColor', size = 18 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" fill={color} style={{ flexShrink: 0 }}>
      <path d="M256 8C119.033 8 8 119.033 8 256s111.033 248 248 248 248-111.033 248-248S392.967 8 256 8zm0 48c110.532 0 200 89.451 200 200 0 110.532-89.451 200-200 200-110.532 0-200-89.451-200-200 0-110.532 89.451-200 200-200m140.204 130.267l-22.536-22.718c-4.667-4.705-12.265-4.736-16.97-.068L215.346 303.697l-59.792-60.277c-4.667-4.705-12.265-4.736-16.97-.069l-22.719 22.536c-4.705 4.667-4.736 12.265-.068 16.971l90.781 91.516c4.667 4.705 12.265 4.736 16.97.068l172.589-171.204c4.704-4.668 4.734-12.266.067-16.971z" />
    </svg>
  );
}

function SolidCheckIcon({ color = '#CB202D', size = 20 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" fill={color} style={{ flexShrink: 0 }}>
      <path d="M504 256c0 136.967-111.033 248-248 248S8 392.967 8 256 119.033 8 256 8s248 111.033 248 248zM227.314 387.314l184-184c6.248-6.248 6.248-16.379 0-22.627l-22.627-22.627c-6.248-6.249-16.379-6.249-22.628 0L216 308.118l-70.059-70.059c-6.248-6.248-16.379-6.248-22.628 0l-22.627 22.627c-6.248 6.248-6.248 16.379 0 22.627l104 104c6.249 6.249 16.379 6.249 22.628.001z" />
    </svg>
  );
}

function CartIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 576 512" fill="currentColor" style={{ flexShrink: 0 }}>
      <path d="M504.717 320H211.572l6.545 32h268.418c15.401 0 26.816 14.301 23.403 29.319l-5.517 24.276C523.112 414.668 536 433.828 536 456c0 31.202-25.519 56.444-56.824 55.994-29.823-.429-54.35-24.631-55.155-54.447-.44-16.287 6.085-31.049 16.803-41.548H231.176C241.553 426.165 248 440.326 248 456c0 31.813-26.528 57.431-58.67 55.938-28.54-1.325-51.751-24.385-53.251-52.917-1.158-22.034 10.436-41.455 28.051-51.586L93.883 64H24C10.745 64 0 53.255 0 40V24C0 10.745 10.745 0 24 0h102.529c11.401 0 21.228 8.021 23.513 19.19L159.208 64H551.99c15.401 0 26.816 14.301 23.403 29.319l-47.273 208C525.637 312.246 515.923 320 504.717 320zM403.029 192H360v-60c0-6.627-5.373-12-12-12h-24c-6.627 0-12 5.373-12 12v60h-43.029c-10.691 0-16.045 12.926-8.485 20.485l67.029 67.029c4.686 4.686 12.284 4.686 16.971 0l67.029-67.029c7.559-7.559 2.205-20.485-8.486-20.485z" />
    </svg>
  );
}

function PhoneIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" fill="currentColor" style={{ flexShrink: 0 }}>
      <path d="M497.39 361.8l-112-48a24 24 0 0 0-28 6.9l-49.6 60.6A370.66 370.66 0 0 1 130.6 204.11l60.6-49.6a23.94 23.94 0 0 0 6.9-28l-48-112A24.16 24.16 0 0 0 122.6.61l-104 24A24 24 0 0 0 0 48c0 256.5 207.9 464 464 464a24 24 0 0 0 23.4-18.6l24-104a24.29 24.29 0 0 0-14.01-27.6z" />
    </svg>
  );
}

// Default Fallback Configuration for METRROMA Luxury Gift Box
const DEFAULT_CONFIG = {
  title: '“LOVE FOREVER” লাক্সারি গিফট বক্স — প্রিয়জনের সেরা উপহার',
  badgeTop: '১০০% অরিজিনাল প্রিমিয়াম কোয়ালিটি নিশ্চিত',
  badgeGuarantee: 'একমাত্র আমরাই দিচ্ছি পণ্য দেখে মূল্য পরিশোধের সুবিধা',
  headline: '“LOVE FOREVER” লাক্সারি গিফট বক্স',
  subtitle: 'ভালোবাসার দিনে প্রিয়জনের মুখে হাসি ফোটান। ১২টি সুবাসিত লাল গোলাপ, প্রিমিয়াম নেকলেস ও গিফট ব্যাগ সহ আকর্ষণীয় প্যাকেজ।',
  videoUrl: '',
  videoBadge: '',
  productTitle: '“LOVE FOREVER” Gift Box',
  productTagline: '১২টি সুবাসিত রয়্যাল রেড সিল্ক রোজ + প্রিমিয়াম গলার হার + ফ্রি গিফট ক্যারিয়ার ব্যাগ + গ্রিটিংস কার্ড',
  heroImage: '/uploads/img_mvcvyjixc2dpi.webp',
  packageTitle: '“LOVE FOREVER” লাক্সারি গিফট বক্স কম্বো',
  offerPriceText: 'অফার মূল্য মাত্র ৫৯০ টাকা',
  freeDeliveryText: '(ক্যাশ অন ডেলিভারিতে সারা বাংলাদেশে দ্রুত হোম ডেলিভারি)',
  benefitsHeading: 'কেন এই গিফট বক্সটি সেরা উপহার?',
  benefits: [
    '🌹 ১২টি আকর্ষণীয় লাল গোলাপ: প্রিমিয়াম রয়্যাল রেড ফিনিশ ও দেখতে একদম তাজা গোলাপের মতো।',
    '💎 Premium Necklace: চকচকে প্রিমিয়াম ডিজাইনের গলার হার যা যেকোনো পোশাকে মানিয়ে যায়।',
    '🛍️ Free Gift Bag: আকর্ষণীয় গিফট ক্যারিয়ার ব্যাগ সহ পরিপাটি প্রেজেন্টেশন।',
    '💌 Greeting Card: মনের না-বলা ভালোবাসার অনুভূতি লিখে জানানোর স্পেশাল কার্ড।',
    '✨ সিক্রেট ড্রয়ার স্পেস: জুয়েলারি বা সারপ্রাইজ গিফট লুকিয়ে রাখার এক্সক্লুসিভ কম্পার্টমেন্ট।',
    '💰 নিশ্চিন্ত ক্যাশ অন ডেলিভারি: কোনো অগ্রিম টাকা ছাড়া ঘরে বসে পণ্য দেখে মূল্য পরিশোধ করুন।'
  ],
  usageHeading: 'উপহার দেয়ার উপযুক্ত উপলক্ষ্যসমূহ:',
  usageSteps: [
    'ওয়াইফ বা প্রিয়তমার জন্মদিনের শুভেচ্ছা জানাতে।',
    'বিবাহবার্ষিকী বা রিলেশনশিপ অ্যানিভার্সারিতে বিশেষ চমক দিতে।',
    'প্রপোজাল মুহূর্ত বা ভালোবাসার বিশেষ দিনকে স্মরণীয় করতে।',
    'প্রিয় মানুষকে অনাবিল আনন্দ ও সারপ্রাইজ উপহার দিতে।'
  ],
  usageImage: '/uploads/img_mvcvyqa8tgqa6.webp',
  usageCaption: 'ভালোবাসার শ্রেষ্ঠ উপহার — পরিপাটি রয়্যাল ফিনিশ',
  reviews: [
    '/uploads/img_mvcvyqj4ab8xt.webp',
    '/uploads/img_mvcvywji3jv5e.webp',
    '/uploads/img_mvcvyjixc2dpi.webp'
  ],
  reviewsBadge: 'ভেরিফায়েড ক্রেতার সন্তুষ্টি',
  reviewsTitle: 'বাস্তব কাস্টমার অভিজ্ঞতা ও ছবি',
  guaranteeBadge: '১০০% সন্তুষ্টি ও নিশ্চিন্ত ক্রয়ের অঙ্গীকার',
  guaranteeText: 'আমাদের প্রদর্শিত পণ্যের সাথে প্রাপ্ত পণ্যের মিল না থাকলে এক টাকাও দিতে হবে না, সরাসরি পার্সেল রিটার্ন করতে পারবেন। যেকোনো প্রশ্ন বা বিস্তারিত জানতে কল করুন।',
  phone: '01633617136',
  whatsapp: '8801633617136',
  packages: [
    {
      id: 'mm-29267',
      title: '“LOVE FOREVER” Gift Box (Black / Red)',
      price: 590,
      originalPrice: 1200,
      image: '/uploads/img_mvcvyjixc2dpi.webp',
      popular: true
    }
  ]
};

export function LoveLockLanding({ slug = 'lovelock' }: { slug?: string }) {
  const [cfg, setCfg] = useState<any>(DEFAULT_CONFIG);
  const [selectedProduct, setSelectedProduct] = useState(DEFAULT_CONFIG.packages[0].id);
  const [selectedColor, setSelectedColor] = useState('Black');
  const [qty, setQty] = useState<Record<string, number>>({});

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reviewIdx, setReviewIdx] = useState(0);

  // Phone and WhatsApp
  const [phoneNum, setPhoneNum] = useState(DEFAULT_CONFIG.phone);
  const [waNum, setWaNum] = useState(DEFAULT_CONFIG.whatsapp);

  // Load landing config from server
  useEffect(() => {
    const fetchSlug = slug || 'lovelock';
    fetch(`/api/landings/${fetchSlug}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setCfg((prev: any) => ({ ...prev, ...data }));
          if (data.phone) setPhoneNum(data.phone);
          if (data.whatsapp) setWaNum(data.whatsapp.replace(/[^0-9]/g, ''));
          if (Array.isArray(data.packages) && data.packages.length > 0) {
            setSelectedProduct(data.packages[0].id);
          }
        }
      })
      .catch(() => {});
  }, [slug]);

  // General settings fallback
  useEffect(() => {
    const lTitle = `${cfg.headline || cfg.title} — METRROMA`;
    document.title = lTitle;
    const q = new URLSearchParams(location.search);
    dl({
      event: 'page_view',
      page_location: location.href,
      page_path: location.pathname + location.search,
      page_title: lTitle,
      campaign_source: q.get('utm_source') || (q.get('fbclid') ? 'facebook' : undefined),
      campaign_medium: q.get('utm_medium') || (q.get('fbclid') ? 'paid' : undefined),
      campaign_name: q.get('utm_campaign') || undefined,
    });
    getSettings().then((s) => {
      if (!cfg.phone && s.phone) setPhoneNum(s.phone);
      if (!cfg.whatsapp && s.whatsapp) setWaNum(s.whatsapp.replace(/[^0-9]/g, ''));
    }).catch(() => {});
  }, [cfg.title, cfg.headline, cfg.phone, cfg.whatsapp]);

  // Auto scroll reviews carousel
  const reviewsList = Array.isArray(cfg.reviews) && cfg.reviews.length > 0 ? cfg.reviews : DEFAULT_CONFIG.reviews;
  useEffect(() => {
    if (reviewsList.length <= 1) return;
    const timer = setInterval(() => {
      setReviewIdx((prev) => (prev + 1) % reviewsList.length);
    }, 4000);
    return () => clearInterval(timer);
  }, [reviewsList.length]);

  const packagesList = Array.isArray(cfg.packages) && cfg.packages.length > 0 ? cfg.packages : DEFAULT_CONFIG.packages;
  const currentItem = packagesList.find((p: any) => p.id === selectedProduct) || packagesList[0];
  const currentQty = qty[currentItem.id] || 1;
  const subtotal = currentItem.price * currentQty;
  const total = subtotal; // Free shipping

  // Ref to ensure InitiateCheckout is fired smoothly
  const checkoutTrackedRef = useRef(false);

  // 1. Pixel: Track ViewContent on load and package change
  useEffect(() => {
    if (currentItem && currentItem.price) {
      ecView({
        id: currentItem.id,
        name: `${cfg.headline || cfg.title || 'LoveLock'} - ${currentItem.title}`,
        price: currentItem.price,
      });
    }
  }, [selectedProduct, cfg.title, cfg.headline]);

  // 2. Pixel: Track InitiateCheckout when user scrolls or focuses on checkout
  const triggerInitiateCheckout = () => {
    if (checkoutTrackedRef.current) return;
    checkoutTrackedRef.current = true;
    ecBeginCheckout(total, [
      { id: currentItem.id, name: currentItem.title, price: currentItem.price, qty: currentQty },
    ]);
  };

  const scrollToOrder = (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    triggerInitiateCheckout();
    const el = document.getElementById('order');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleSelectPackage = (prod: any) => {
    setSelectedProduct(prod.id);
    ecAdd({ id: prod.id, name: prod.title, price: prod.price }, qty[prod.id] || 1);
  };

  const handleQtyChange = (pid: string, delta: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const newQty = Math.max(1, (qty[pid] || 1) + delta);
    setQty((prev) => ({
      ...prev,
      [pid]: newQty,
    }));
    const targetProd = packagesList.find((p: any) => p.id === pid);
    if (targetProd) {
      ecAdd({ id: targetProd.id, name: targetProd.title, price: targetProd.price }, newQty);
    }
  };

  // 3. Draft Abandonment recovery: Ping incomplete checkout when 11-digit phone entered
  useEffect(() => {
    const cleanPhone = phone.trim().replace(/[-+ ]/g, '');
    if (!/^01[3-9]\d{8}$/.test(cleanPhone)) return;
    const t = setTimeout(() => {
      fetch('/api/checkout/ping', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-device-id': getDeviceId(),
        },
        body: JSON.stringify({
          items: [{
            id: currentItem.id,
            qty: currentQty,
            name: currentItem.title,
            price: currentItem.price,
            image: currentItem.image || cfg.heroImage,
            color: selectedColor,
            variantTitle: selectedColor ? `রং: ${selectedColor}` : currentItem.title,
          }],
          customer: {
            name: name.trim() || 'Customer',
            phone: cleanPhone,
            address: address.trim(),
            landing: slug || 'love-forever',
            source: `landing_${slug || 'love-forever'}`,
            freeDelivery: true,
            shippingCost: 0,
          },
        }),
      }).catch(() => {});
    }, 1000);
    return () => clearTimeout(t);
  }, [name, phone, address, currentItem, currentQty, slug, selectedColor, cfg.heroImage]);

  const handleOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('অনুগ্রহ করে আপনার নাম লিখুন');
      return;
    }
    if (!address.trim()) {
      setError('অনুগ্রহ করে আপনার সম্পূর্ণ ঠিকানা লিখুন');
      return;
    }
    const cleanPhone = phone.trim().replace(/[-+ ]/g, '');
    if (!cleanPhone || cleanPhone.length < 11) {
      setError('অনুগ্রহ করে সঠিক ১১ ডিজিটের মোবাইল নম্বর দিন');
      return;
    }

    setLoading(true);
    try {
      const res = await placeOrder({
        items: [
          {
            id: currentItem.id,
            name: currentItem.title,
            price: currentItem.price,
            qty: currentQty,
            image: currentItem.image,
          },
        ],
        customer: {
          name: name.trim(),
          phone: cleanPhone,
          address: address.trim(),
          landing: slug || 'lovelock',
          source: `landing_${slug || 'lovelock'}`,
          freeDelivery: true,
          shippingCost: 0,
        },
        shipping: {
          cost: 0,
          method: 'free',
        },
      });

      // 4. Pixel + CAPI Dual Deduplicated Purchase Tracking
      ecPurchase(
        res.id,
        res.total ?? total,
        [{ id: currentItem.id, name: currentItem.title, price: currentItem.price, qty: currentQty }],
        `landing_${slug || 'lovelock'}`
      );

      // Navigate to order confirmation
      go('confirm/' + res.id);
    } catch (err: any) {
      setError(err.message || 'অর্ডার সম্পন্ন হতে সমস্যা হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।');
      setLoading(false);
    }
  };

  const benefitsList = Array.isArray(cfg.benefits) && cfg.benefits.length > 0 ? cfg.benefits : DEFAULT_CONFIG.benefits;
  const usageStepsList = Array.isArray(cfg.usageSteps) && cfg.usageSteps.length > 0 ? cfg.usageSteps : DEFAULT_CONFIG.usageSteps;

  return (
    <div className="lovelock-landing">
      {/* iOS Ambient Glow Orbs for Glass Refraction */}
      <div className="ll-ambient-mesh" aria-hidden="true">
        <span className="ll-orb ll-orb-1" />
        <span className="ll-orb ll-orb-2" />
        <span className="ll-orb ll-orb-3" />
      </div>

      {/* SECTION 1: HERO */}
      <section className="ll-sec ll-sec-hero">
        <div className="ll-inner">
          {cfg.badgeTop && (
            <div className="ll-pill-badge ll-pill-badge-red">
              <CheckCircleIcon color="#CB202D" size={16} />
              <span>{cfg.badgeTop}</span>
            </div>
          )}

          <h1 className="ll-title-main">{cfg.headline || cfg.title}</h1>

          {cfg.subtitle && <p className="ll-subtitle">{cfg.subtitle}</p>}

          {cfg.badgeGuarantee && (
            <div className="ll-pill-badge ll-pill-badge-green">
              <CheckCircleIcon color="#065F46" size={16} />
              <span>{cfg.badgeGuarantee}</span>
            </div>
          )}
        </div>
      </section>

      {/* SECTION 2: VIDEO & CTA */}
      <section className="ll-sec ll-sec-crimson">
        <div className="ll-inner">
          <button onClick={scrollToOrder} className="ll-pulse-btn" id="pulse-button">
            <CartIcon size={24} />
            <span>অর্ডার করতে ক্লিক করুন</span>
          </button>

          {cfg.videoUrl && (
            <div className="ll-video-wrap">
              <video
                key={cfg.videoUrl}
                className="ll-video"
                src={cfg.videoUrl}
                controls
                playsInline
                preload="metadata"
                controlsList="nodownload"
              />
            </div>
          )}

          {cfg.videoBadge && (
            <div className="ll-pill-badge ll-pill-badge-subcrimson">
              <CheckCircleIcon color="#FAFAFA" size={16} />
              <span>{cfg.videoBadge}</span>
            </div>
          )}
        </div>
      </section>

      {/* SECTION 3: PRODUCT INTRO */}
      <section className="ll-sec ll-sec-product">
        <div className="ll-inner">
          <h2 className="ll-sec-title ll-text-crimson">{cfg.productTitle || cfg.headline || cfg.title}</h2>
          {cfg.productTagline && <p className="ll-sec-tagline ll-text-crimson">{cfg.productTagline}</p>}

          {cfg.heroImage && (
            <div className="ll-product-img-box">
              <img
                src={cfg.heroImage}
                alt={cfg.productTitle || cfg.title}
                className="ll-product-hero-img"
              />
            </div>
          )}

          <h2 className="ll-package-title">{cfg.packageTitle}</h2>

          <div className="ll-offer-price-box">
            <button onClick={scrollToOrder} className="ll-pulse-price" id="pulse-button">
              {cfg.offerPriceText}
            </button>
            {cfg.freeDeliveryText && <p className="ll-free-ship-note">{cfg.freeDeliveryText}</p>}
          </div>
        </div>
      </section>

      {/* SECTION 4: BENEFITS & USAGE GUIDE */}
      <section className="ll-sec ll-sec-crimson ll-benefits-sec">
        <div className="ll-inner">
          <button onClick={scrollToOrder} className="ll-pulse-btn" id="pulse-button">
            <CartIcon size={24} />
            <span>অর্ডার করতে ক্লিক করুন</span>
          </button>

          <div className="ll-pill-badge ll-pill-badge-subcrimson" style={{ marginTop: '20px' }}>
            <span>বিশেষ সুবিধা ও কার্যকারিতা</span>
          </div>

          <h2 className="ll-white-heading">{cfg.benefitsHeading}</h2>

          <div className="ll-cards-grid">
            {benefitsList.map((item: string, i: number) => (
              <div key={i} className="ll-benefit-card">
                <SolidCheckIcon color="#05D352" size={24} />
                <span>{item}</span>
              </div>
            ))}
          </div>

          {/* Usage Guide */}
          <div className="ll-pill-badge ll-pill-badge-subcrimson" style={{ marginTop: '35px' }}>
            <span>সহজ নির্দেশিকা</span>
          </div>

          <h2 className="ll-white-heading">{cfg.usageHeading}</h2>

          <div className="ll-usage-wrap">
            <div className="ll-usage-card">
              {usageStepsList.map((step: string, i: number) => (
                <div key={i} className="ll-usage-item">
                  <SolidCheckIcon color="#CB202D" size={22} />
                  <span>{step}</span>
                </div>
              ))}
            </div>

            {cfg.usageImage && (
              <div className="ll-usage-img-box">
                <img
                  src={cfg.usageImage}
                  alt={cfg.usageHeading}
                  className="ll-usage-img"
                />
                {cfg.usageCaption && (
                  <div className="ll-usage-caption">{cfg.usageCaption}</div>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* SECTION 5: CUSTOMER REVIEWS HEADER */}
      <section className="ll-sec ll-sec-light">
        <div className="ll-inner">
          <button onClick={scrollToOrder} className="ll-pulse-btn" id="pulse-button">
            <CartIcon size={24} />
            <span>অর্ডার করতে ক্লিক করুন</span>
          </button>

          <h2 className="ll-reviews-main-title">
            অর্ডার করার পূর্বে <span className="ll-red-underlined">কাস্টমারদের মতামত</span> দেখে নিন
          </h2>
        </div>
      </section>

      {/* SECTION 6: REVIEWS GALLERY & GUARANTEE */}
      <section className="ll-sec ll-sec-light" style={{ paddingTop: '0px' }}>
        <div className="ll-inner">
          <div className="ll-pill-badge ll-pill-badge-pink">
            <span>{cfg.reviewsBadge}</span>
          </div>

          <h2 className="ll-reviews-sub-title">{cfg.reviewsTitle}</h2>

          {/* Carousel */}
          {reviewsList.length > 0 && (
            <div className="ll-carousel-wrap">
              <div className="ll-carousel-track">
                <div className="ll-carousel-slide">
                  <img
                    src={reviewsList[reviewIdx]}
                    alt={`কাস্টমার রিভিউ ${reviewIdx + 1}`}
                    className="ll-review-img"
                  />
                </div>
                {reviewsList.length > 1 && (
                  <div className="ll-carousel-slide ll-carousel-desktop-second">
                    <img
                      src={reviewsList[(reviewIdx + 1) % reviewsList.length]}
                      alt={`কাস্টমার রিভিউ ${((reviewIdx + 1) % reviewsList.length) + 1}`}
                      className="ll-review-img"
                    />
                  </div>
                )}
              </div>

              {reviewsList.length > 1 && (
                <>
                  <button
                    className="ll-carousel-nav ll-nav-prev"
                    onClick={() => setReviewIdx((prev) => (prev - 1 + reviewsList.length) % reviewsList.length)}
                    aria-label="Previous review"
                  >
                    &#10094;
                  </button>
                  <button
                    className="ll-carousel-nav ll-nav-next"
                    onClick={() => setReviewIdx((prev) => (prev + 1) % reviewsList.length)}
                    aria-label="Next review"
                  >
                    &#10095;
                  </button>

                  <div className="ll-carousel-dots">
                    {reviewsList.map((_: any, i: number) => (
                      <span
                        key={i}
                        className={`ll-dot ${i === reviewIdx ? 'active' : ''}`}
                        onClick={() => setReviewIdx(i)}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Guarantee Box */}
          <div className="ll-guarantee-box">
            <div className="ll-pill-badge ll-pill-badge-green" style={{ display: 'inline-flex', marginBottom: '14px' }}>
              <CheckCircleIcon color="#065F46" size={16} />
              <span>{cfg.guaranteeBadge}</span>
            </div>

            <p className="ll-guarantee-text">{cfg.guaranteeText}</p>
          </div>
        </div>
      </section>

      {/* SECTION 7: URGENCY & DIRECT CALL / WHATSAPP */}
      <section className="ll-sec ll-sec-pink-banner">
        <div className="ll-inner">
          <div className="ll-banner-buttons">
            <button onClick={scrollToOrder} className="ll-banner-btn ll-btn-delivery">
              🚚 আজকের অর্ডারে সারা বাংলাদেশে ডেলিভারি সম্পূর্ণ ফ্রি!
            </button>

            <a href={`tel:${phoneNum}`} className="ll-banner-btn ll-btn-phone">
              <PhoneIcon size={20} />
              <span>কল করুনঃ {phoneNum}</span>
            </a>

            <a
              href={`https://wa.me/${waNum}?text=${encodeURIComponent('আসসালামু আলাইকুম, আমি লাভ লক ম্যাজিক কনডম অর্ডার করতে চাই।')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="ll-banner-btn ll-btn-whatsapp"
            >
              <WhatsAppIcon size={24} variant="official" />
              <span>সরাসরি হোয়াটসঅ্যাপ</span>
            </a>
          </div>
        </div>
      </section>

      {/* SECTION 8: CHECKOUT & PRODUCT SELECTION */}
      <section className="ll-sec ll-sec-light ll-sec-order" id="order">
        <div className="ll-inner">
          <h2 className="ll-order-form-title">অর্ডার করতে নিচের ফর্মটি পূরন করুন</h2>

          <div className="ll-checkout-container">
            <form onSubmit={handleOrder} className="ll-form">
              {/* Product Selection */}
              <div className="ll-card ll-product-options-wrap">
                <h3 className="ll-checkout-heading">Your Products</h3>

                <div className="ll-qty-options">
                  {packagesList.map((prod: any) => {
                    const isSelected = selectedProduct === prod.id;
                    const q = qty[prod.id] || 1;
                    return (
                      <div
                        key={prod.id}
                        className={`ll-product-card ${isSelected ? 'selected' : ''} ${prod.popular ? 'highlight' : ''}`}
                        onClick={() => handleSelectPackage(prod)}
                      >
                        {prod.popular && <span className="ll-highlight-badge">সর্বাধিক জনপ্রিয়</span>}

                        <div className="ll-product-card-body">
                          <div className="ll-radio-wrap">
                            <input
                              type="radio"
                              name="ll-product"
                              checked={isSelected}
                              onChange={() => handleSelectPackage(prod)}
                              id={`prod-${prod.id}`}
                            />
                            <label htmlFor={`prod-${prod.id}`}></label>
                          </div>

                          {prod.image && (
                            <div className="ll-card-thumb">
                              <img src={prod.image} alt={prod.title} />
                            </div>
                          )}

                          <div className="ll-card-content">
                            <div className="ll-card-title">{prod.title}</div>

                            <div className="ll-card-footer">
                              <div className="ll-stepper">
                                <button
                                  type="button"
                                  onClick={(e) => handleQtyChange(prod.id, -1, e)}
                                  className="ll-stepper-btn"
                                >
                                  −
                                </button>
                                <span className="ll-stepper-val">{q}</span>
                                <button
                                  type="button"
                                  onClick={(e) => handleQtyChange(prod.id, 1, e)}
                                  className="ll-stepper-btn"
                                >
                                  +
                                </button>
                              </div>

                              <div className="ll-card-price">
                                <span className="ll-price-num">{taka(prod.price * q)}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Billing Details */}
              <div className="ll-card ll-billing-details-wrap">
                <h3 className="ll-checkout-heading">Billing details</h3>

                <div className="ll-field-group">
                  <label className="ll-label">
                    আপনার নাম <span className="ll-req">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    className="ll-input"
                    placeholder="আপনার সম্পূর্ণ নাম লিখুন"
                    value={name}
                    onFocus={triggerInitiateCheckout}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>

                <div className="ll-field-group">
                  <label className="ll-label">
                    আপনার সম্পূর্ণ ঠিকানা <span className="ll-req">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    className="ll-input"
                    placeholder="জেলা, থানা, এলাকা ও বাসার ঠিকানা লিখুন"
                    value={address}
                    onFocus={triggerInitiateCheckout}
                    onChange={(e) => setAddress(e.target.value)}
                  />
                </div>

                <div className="ll-field-group">
                  <label className="ll-label">
                    আপনার ফোন নাম্বার <span className="ll-req">*</span>
                  </label>
                  <input
                    type="tel"
                    required
                    className="ll-input"
                    placeholder="১১ ডিজিটের মোবাইল নম্বর দিন"
                    value={phone}
                    onFocus={triggerInitiateCheckout}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
              </div>

              {/* Shipping */}
              <div className="ll-card ll-shipping-wrap">
                <h3 className="ll-checkout-heading">Shipping</h3>
                <div className="ll-shipping-option">
                  <input type="radio" checked readOnly id="free-ship" />
                  <label htmlFor="free-ship">Free shipping</label>
                </div>
              </div>

              {/* Order Review Table */}
              <div className="ll-card ll-order-review-wrap">
                <h3 className="ll-checkout-heading">Your order</h3>

                <table className="ll-order-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th style={{ textAlign: 'right' }}>Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>
                        {currentItem.title} <strong>&times; {currentQty}</strong>
                      </td>
                      <td style={{ textAlign: 'right' }}>{taka(subtotal)}</td>
                    </tr>
                  </tbody>
                  <tfoot>
                    <tr>
                      <th>Subtotal</th>
                      <td style={{ textAlign: 'right' }}>{taka(subtotal)}</td>
                    </tr>
                    <tr>
                      <th>Shipment</th>
                      <td style={{ textAlign: 'right' }}>Free shipping</td>
                    </tr>
                    <tr className="ll-total-row">
                      <th>Total</th>
                      <td style={{ textAlign: 'right' }}>
                        <strong>{taka(total)}</strong>
                      </td>
                    </tr>
                  </tfoot>
                </table>

                {/* Payment Method */}
                <div className="ll-payment-method">
                  <div className="ll-payment-title">
                    <input type="radio" checked readOnly id="pay-cod" />
                    <label htmlFor="pay-cod">ক্যাশ অন ডেলিভারি</label>
                  </div>
                  <div className="ll-payment-desc">
                    পন্য হাতে পেয়ে মূল্য পরিশোধ করুন।
                  </div>
                </div>

                {/* Privacy disclaimer */}
                <p className="ll-privacy-notice">
                  Your personal data will be used to process your order, support your experience throughout this website, and for other purposes described in our privacy policy.
                </p>

                {error && <div className="ll-form-error">{error}</div>}

                {/* Place Order CTA Button */}
                <button
                  type="submit"
                  disabled={loading}
                  className="ll-submit-order-btn"
                  id="place_order"
                >
                  {loading ? 'অর্ডার প্রসেস হচ্ছে...' : `Place Order  ${total}.00 ৳`}
                </button>
              </div>
            </form>
          </div>
        </div>
      </section>

      {/* SECTION 9: FOOTER */}
      <footer className="ll-sec ll-footer-sec">
        <div className="ll-inner ll-footer-inner">
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' }}>
            <a href={`tel:${phoneNum}`} className="ll-footer-call-btn">
              <PhoneIcon size={18} />
              <span>কল করুনঃ {phoneNum}</span>
            </a>
            <a
              href={`https://wa.me/${waNum}?text=${encodeURIComponent('আসসালামু আলাইকুম, আমি লাভ লক ম্যাজিক কনডম অর্ডার করতে চাই।')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="ll-footer-call-btn"
              style={{ background: '#25D366', color: '#fff', border: '1px solid rgba(255,255,255,0.4)', gap: 8 }}
            >
              <WhatsAppIcon size={20} variant="official" />
              <span>হোয়াটসঅ্যাপে মেসেজ দিন</span>
            </a>
          </div>

          <div className="ll-footer-links">
            <a href="/page/privacy" onClick={(e) => { e.preventDefault(); go('info/privacy'); }}>Privacy policy</a>
            <span style={{ color: '#aaa' }}>|</span>
            <a href="/page/terms" onClick={(e) => { e.preventDefault(); go('info/terms'); }}>Terms & Conditions</a>
          </div>
        </div>
      </footer>

      {/* Sticky Bottom Order Bar for Mobile */}
      <div className="ll-mobile-sticky-bar">
        <a href={`tel:${phoneNum}`} className="ll-sticky-call" title="কল করুন">
          <PhoneIcon size={15} />
          <span>কল</span>
        </a>
        <a
          href={`https://wa.me/${waNum}?text=${encodeURIComponent('আসসালামু আলাইকুম, আমি লাভ লক ম্যাজিক কনডম অর্ডার করতে চাই।')}`}
          target="_blank"
          rel="noopener noreferrer"
          className="ll-sticky-wa"
          title="হোয়াটসঅ্যাপে অর্ডার করুন"
        >
          <WhatsAppIcon size={16} variant="official" />
          <span>WhatsApp</span>
        </a>
        <button onClick={scrollToOrder} className="ll-sticky-order">
          <CartIcon size={17} />
          <span>অর্ডার করুন • {taka(total)}</span>
        </button>
      </div>

      {/* Floating WhatsApp Action Button */}
      <a
        className="ll-wafloat"
        href={`https://wa.me/${waNum}?text=${encodeURIComponent('আসসালামু আলাইকুম, আমি লাভ লক ম্যাজিক কনডম অর্ডার করতে চাই।')}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Chat with us on WhatsApp"
        title="WhatsApp Chat"
      >
        <WhatsAppIcon size={34} variant="official" />
      </a>
    </div>
  );
}
