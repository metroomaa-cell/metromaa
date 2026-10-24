import React, { useState, useEffect, useRef } from 'react';
import { placeOrder, getSettings, taka, getDeviceId, isSkincareSite } from './api';
import { dl, ecView, ecAdd, ecBeginCheckout, ecPurchase } from './analytics';
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

function SolidCheckIcon({ color = 'var(--ll-primary, #CB202D)', size = 20 }: { color?: string; size?: number }) {
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

// Color manipulation helpers for dynamic theme variables
function hexToRgbTuple(hex: string, fallback = '203, 32, 45'): [number, number, number, string] {
  const clean = String(hex || '').trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{6}$/.test(clean)) {
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    return [r, g, b, `${r}, ${g}, ${b}`];
  }
  return [203, 32, 45, fallback];
}

function darkenHex(hex: string, factor = 0.78): string {
  const [r, g, b] = hexToRgbTuple(hex);
  const dr = Math.max(0, Math.min(255, Math.round(r * factor)));
  const dg = Math.max(0, Math.min(255, Math.round(g * factor)));
  const db = Math.max(0, Math.min(255, Math.round(b * factor)));
  return `#${dr.toString(16).padStart(2, '0')}${dg.toString(16).padStart(2, '0')}${db.toString(16).padStart(2, '0')}`;
}

// Universal Video URL Parser (YouTube, YouTube Shorts, Facebook Video, or Direct MP4/WebM)
function parseLandingVideo(rawUrl: string): {
  type: 'youtube' | 'youtube-shorts' | 'facebook' | 'mp4';
  embedUrl: string;
} {
  const url = String(rawUrl || '').trim();
  if (!url) return { type: 'mp4', embedUrl: '' };

  // 1. YouTube Shorts: youtube.com/shorts/VIDEO_ID
  const shortsMatch = url.match(/(?:youtube\.com|youtu\.be)\/shorts\/([a-zA-Z0-9_-]{11})/i);
  if (shortsMatch && shortsMatch[1]) {
    return {
      type: 'youtube-shorts',
      embedUrl: `https://www.youtube.com/embed/${shortsMatch[1]}?rel=0&modestbranding=1&playsinline=1`,
    };
  }

  // 2. Standard YouTube: youtube.com/watch?v=VIDEO_ID, youtu.be/VIDEO_ID, youtube.com/embed/VIDEO_ID
  const ytMatch = url.match(
    /(?:youtube\.com\/(?:watch\?.*v=|embed\/|v\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i
  );
  if (ytMatch && ytMatch[1]) {
    return {
      type: 'youtube',
      embedUrl: `https://www.youtube.com/embed/${ytMatch[1]}?rel=0&modestbranding=1&playsinline=1`,
    };
  }

  // 3. Facebook Video / Reel
  if (/facebook\.com\/.*(?:videos|reel|watch)|fb\.watch\//i.test(url)) {
    return {
      type: 'facebook',
      embedUrl: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&show_text=false&width=680`,
    };
  }

  // 4. Direct MP4 / WebM video file
  return {
    type: 'mp4',
    embedUrl: url.includes('#') ? url : `${url}#t=0.001`,
  };
}

export function LoveLockLanding({ slug = '' }: { slug?: string }) {
  const [cfg, setCfg] = useState<any>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [selectedProduct, setSelectedProduct] = useState('');
  const [selectedColor, setSelectedColor] = useState('');
  const [qty, setQty] = useState<Record<string, number>>({});
  const [shippingZone, setShippingZone] = useState<'inside' | 'outside'>('inside');

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reviewIdx, setReviewIdx] = useState(0);

  // Store-level defaults
  const [phoneNum, setPhoneNum] = useState('');
  const [waNum, setWaNum] = useState('');
  const [storeDelInside, setStoreDelInside] = useState(80);
  const [storeDelOutside, setStoreDelOutside] = useState(130);

  // Load landing config strictly by slug from server
  useEffect(() => {
    const fetchSlug = String(slug || '').trim();
    if (!fetchSlug) {
      setNotFound(true);
      setPageLoading(false);
      return;
    }
    setPageLoading(true);
    setNotFound(false);

    fetch(`/api/landings/${encodeURIComponent(fetchSlug)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data || data.status === 'draft') {
          setNotFound(true);
          setPageLoading(false);
          return;
        }
        setCfg(data);
        if (data.phone) setPhoneNum(data.phone);
        if (data.whatsapp) setWaNum(String(data.whatsapp).replace(/[^0-9]/g, ''));
        if (Array.isArray(data.packages) && data.packages.length > 0) {
          setSelectedProduct(data.packages[0].id);
        }
        if (Array.isArray(data.colors) && data.colors.length > 0) {
          const firstColor = typeof data.colors[0] === 'string' ? data.colors[0] : data.colors[0]?.name || '';
          setSelectedColor(firstColor);
        } else {
          setSelectedColor('');
        }
        setPageLoading(false);
      })
      .catch(() => {
        setNotFound(true);
        setPageLoading(false);
      });
  }, [slug]);

  // General settings fallback
  useEffect(() => {
    getSettings()
      .then((s) => {
        if (s.deliveryInside != null) setStoreDelInside(Number(s.deliveryInside) || 80);
        if (s.deliveryOutside != null) setStoreDelOutside(Number(s.deliveryOutside) || 130);
        if (s.phone) setPhoneNum((prev) => prev || s.phone);
        if (s.whatsapp) setWaNum((prev) => prev || String(s.whatsapp).replace(/[^0-9]/g, ''));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!cfg) return;
    const brand = isSkincareSite() ? 'SECRATE' : 'METRROMA';
    const lTitle = `${cfg.headline || cfg.title} — ${brand}`;
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
  }, [cfg]);

  // Auto scroll reviews carousel
  const reviewsList = Array.isArray(cfg?.reviews) ? cfg.reviews.filter(Boolean) : [];
  useEffect(() => {
    if (reviewsList.length <= 1) return;
    const timer = setInterval(() => {
      setReviewIdx((prev) => (prev + 1) % reviewsList.length);
    }, 4000);
    return () => clearInterval(timer);
  }, [reviewsList.length]);

  const packagesList =
    Array.isArray(cfg?.packages) && cfg.packages.length > 0
      ? cfg.packages
      : [
          {
            id: cfg?.id || 'pkg_default',
            title: cfg?.productTitle || cfg?.headline || cfg?.title || 'Product Package',
            price: Number(cfg?.offerPrice) || 999,
            originalPrice: 1500,
            image: cfg?.heroImage || '',
            popular: true,
          },
        ];

  const currentItem = packagesList.find((p: any) => p.id === selectedProduct) || packagesList[0];
  const currentQty = qty[currentItem.id] || 1;
  const subtotal = Number(currentItem.price || 0) * currentQty;

  // Dynamic Delivery Charge Calculation
  const isFreeDelivery = cfg ? cfg.freeDelivery !== false : true;
  const delInside = Number(cfg?.deliveryInside ?? cfg?.customDeliveryInside ?? storeDelInside ?? 80);
  const delOutside = Number(cfg?.deliveryOutside ?? cfg?.customDeliveryOutside ?? storeDelOutside ?? 130);
  const shippingCost = isFreeDelivery ? 0 : shippingZone === 'inside' ? delInside : delOutside;
  const total = subtotal + shippingCost;

  // Ref to ensure InitiateCheckout is fired smoothly
  const checkoutTrackedRef = useRef(false);

  // 1. Pixel: Track ViewContent on load and package change
  useEffect(() => {
    if (cfg && currentItem && currentItem.price) {
      ecView({
        id: currentItem.id,
        name: `${cfg.headline || cfg.title} - ${currentItem.title}`,
        price: currentItem.price,
      });
    }
  }, [cfg, selectedProduct, currentItem]);

  // 2. Pixel: Track InitiateCheckout when user scrolls or focuses on checkout
  const triggerInitiateCheckout = () => {
    if (checkoutTrackedRef.current || !currentItem) return;
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
    if (!cfg || !currentItem) return;
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
          items: [
            {
              id: currentItem.id,
              qty: currentQty,
              name: currentItem.title,
              price: currentItem.price,
              image: currentItem.image || cfg.heroImage,
              color: selectedColor || '',
              variantTitle: selectedColor ? `রং: ${selectedColor}` : currentItem.title,
            },
          ],
          customer: {
            name: name.trim() || 'Customer',
            phone: cleanPhone,
            address: address.trim(),
            area: shippingZone,
            landing: cfg.slug || slug,
            source: `landing_${cfg.slug || slug}`,
            freeDelivery: isFreeDelivery,
            shippingCost,
          },
          shipping: {
            cost: shippingCost,
            method: isFreeDelivery ? 'free' : shippingZone,
          },
        }),
      }).catch(() => {});
    }, 1000);
    return () => clearTimeout(t);
  }, [name, phone, address, currentItem, currentQty, slug, selectedColor, cfg, shippingZone, isFreeDelivery, shippingCost]);

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
            image: currentItem.image || cfg?.heroImage,
            color: selectedColor || '',
            variantTitle: selectedColor ? `রং: ${selectedColor}` : currentItem.title,
          },
        ],
        customer: {
          name: name.trim(),
          phone: cleanPhone,
          address: address.trim(),
          area: shippingZone,
          landing: cfg?.slug || slug,
          source: `landing_${cfg?.slug || slug}`,
          freeDelivery: isFreeDelivery,
          shippingCost,
        },
        shipping: {
          cost: shippingCost,
          method: isFreeDelivery ? 'free' : shippingZone,
        },
      });

      // 4. Pixel + CAPI Dual Deduplicated Purchase Tracking
      ecPurchase(
        res.id,
        res.total ?? total,
        [{ id: currentItem.id, name: currentItem.title, price: currentItem.price, qty: currentQty }],
        `landing_${cfg?.slug || slug}`
      );

      // Navigate to order confirmation
      go('confirm/' + res.id);
    } catch (err: any) {
      setError(err.message || 'অর্ডার সম্পন্ন হতে সমস্যা হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।');
      setLoading(false);
    }
  };

  if (pageLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FAF7F8', fontFamily: "'Hind Siliguri', sans-serif" }}>
        <div style={{ textAlign: 'center', padding: 32 }}>
          <div style={{ width: 42, height: 42, border: '3px solid #e5e7eb', borderTopColor: '#CB202D', borderRadius: '50%', margin: '0 auto 14px', animation: 'spin 0.8s linear infinite' }} />
          <div style={{ fontSize: 16, fontWeight: 600, color: '#374151' }}>পেজ লোড হচ্ছে...</div>
        </div>
      </div>
    );
  }

  if (notFound || !cfg) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FAF7F8', fontFamily: "'Hind Siliguri', sans-serif", padding: 20 }}>
        <div style={{ maxWidth: 440, width: '100%', background: '#fff', borderRadius: 20, padding: '36px 28px', textAlign: 'center', boxShadow: '0 16px 40px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9' }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>🔍</div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#111827', margin: '0 0 8px' }}>এই ল্যান্ডিং পেইজটি পাওয়া যায়নি</h1>
          <p style={{ fontSize: 15, color: '#6b7280', margin: '0 0 24px', lineHeight: 1.6 }}>
            আপনি যে লিংকটি ওপেন করেছেন তা পরিবর্তন হয়েছে অথবা বর্তমানে বন্ধ রয়েছে।
          </p>
          <button
            onClick={() => go('home')}
            style={{ background: '#111827', color: '#fff', border: 'none', padding: '12px 28px', borderRadius: 999, fontSize: 15, fontWeight: 700, cursor: 'pointer' }}
          >
            মেইন স্টোরে ফিরে যান →
          </button>
        </div>
      </div>
    );
  }

  const benefitsList = Array.isArray(cfg.benefits) ? cfg.benefits.filter(Boolean) : [];
  const usageStepsList = Array.isArray(cfg.usageSteps) ? cfg.usageSteps.filter(Boolean) : [];
  const colorOptions: string[] = Array.isArray(cfg.colors)
    ? cfg.colors.map((c: any) => (typeof c === 'string' ? c.trim() : String(c?.name || '').trim())).filter(Boolean)
    : [];

  // Dynamic Theme Colors
  const primaryHex = cfg.themeColor && /^#[0-9a-fA-F]{6}$/.test(cfg.themeColor.trim()) ? cfg.themeColor.trim() : '#CB202D';
  const primaryDarkHex = darkenHex(primaryHex, 0.78);
  const [, , , primaryRgb] = hexToRgbTuple(primaryHex);

  const btnHex = cfg.buttonColor && /^#[0-9a-fA-F]{6}$/.test(cfg.buttonColor.trim()) ? cfg.buttonColor.trim() : primaryHex;
  const btnDarkHex = darkenHex(btnHex, 0.8);
  const [, , , btnRgb] = hexToRgbTuple(btnHex);

  const pageBgHex = cfg.pageBgColor && /^#[0-9a-fA-F]{6}$/.test(cfg.pageBgColor.trim()) ? cfg.pageBgColor.trim() : '#FAF7F8';

  const themeVars = {
    '--ll-primary': primaryHex,
    '--ll-primary-dark': primaryDarkHex,
    '--ll-primary-rgb': primaryRgb,
    '--ll-btn': btnHex,
    '--ll-btn-dark': btnDarkHex,
    '--ll-btn-rgb': btnRgb,
    '--ll-page-bg': pageBgHex,
  } as React.CSSProperties;

  const parsedVideo = parseLandingVideo(cfg.videoUrl || '');
  const waMessage =
    cfg.whatsappText ||
    `আসসালামু আলাইকুম, আমি "${cfg.productTitle || cfg.headline || cfg.title}" অর্ডার করতে চাই।`;
  const deliveryBannerLabel =
    cfg.deliveryBannerText ||
    (isFreeDelivery
      ? '🚚 আজকের অর্ডারে সারা বাংলাদেশে ডেলিভারি সম্পূর্ণ ফ্রি!'
      : `🚚 সারা বাংলাদেশে দ্রুত ক্যাশ অন হোম ডেলিভারি! (ঢাকায় ৳${delInside}, ঢাকার বাইরে ৳${delOutside})`);

  return (
    <div className="lovelock-landing" style={themeVars}>
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
              <CheckCircleIcon color={primaryHex} size={16} />
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

          {cfg.videoUrl && parsedVideo.embedUrl && (
            <div className={`ll-video-wrap ${parsedVideo.type === 'youtube-shorts' ? 'll-video-shorts' : ''}`}>
              {parsedVideo.type === 'youtube' || parsedVideo.type === 'youtube-shorts' || parsedVideo.type === 'facebook' ? (
                <iframe
                  key={parsedVideo.embedUrl}
                  className={`ll-video-iframe ${parsedVideo.type === 'youtube-shorts' ? 'll-iframe-shorts' : ''}`}
                  src={parsedVideo.embedUrl}
                  title={cfg.headline || cfg.title || 'Product Video'}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              ) : (
                <video
                  key={parsedVideo.embedUrl}
                  className="ll-video"
                  src={parsedVideo.embedUrl}
                  poster={cfg.videoPoster || (cfg.videoUrl.includes('lovelock-video.mp4') ? '/landing/lovelock-poster.jpg' : undefined)}
                  controls
                  playsInline
                  preload="metadata"
                  controlsList="nodownload"
                />
              )}
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
                loading="lazy"
                decoding="async"
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

          {benefitsList.length > 0 && (
            <>
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
            </>
          )}

          {/* Usage Guide */}
          {(usageStepsList.length > 0 || cfg.usageImage) && (
            <>
              <div className="ll-pill-badge ll-pill-badge-subcrimson" style={{ marginTop: '35px' }}>
                <span>সহজ নির্দেশিকা</span>
              </div>

              <h2 className="ll-white-heading">{cfg.usageHeading}</h2>

              <div className="ll-usage-wrap">
                {usageStepsList.length > 0 && (
                  <div className="ll-usage-card">
                    {usageStepsList.map((step: string, i: number) => (
                      <div key={i} className="ll-usage-item">
                        <SolidCheckIcon color={primaryHex} size={22} />
                        <span>{step}</span>
                      </div>
                    ))}
                  </div>
                )}

                {cfg.usageImage && (
                  <div className="ll-usage-img-box">
                    <img
                      src={cfg.usageImage}
                      alt={cfg.usageHeading}
                      className="ll-usage-img"
                      loading="lazy"
                      decoding="async"
                    />
                    {cfg.usageCaption && <div className="ll-usage-caption">{cfg.usageCaption}</div>}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </section>

      {/* SECTION 5: CUSTOMER REVIEWS HEADER */}
      {reviewsList.length > 0 && (
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
      )}

      {/* SECTION 6: REVIEWS GALLERY & GUARANTEE */}
      <section className="ll-sec ll-sec-light" style={{ paddingTop: reviewsList.length > 0 ? '0px' : undefined }}>
        <div className="ll-inner">
          {reviewsList.length > 0 && (
            <>
              {cfg.reviewsBadge && (
                <div className="ll-pill-badge ll-pill-badge-pink">
                  <span>{cfg.reviewsBadge}</span>
                </div>
              )}

              {cfg.reviewsTitle && <h2 className="ll-reviews-sub-title">{cfg.reviewsTitle}</h2>}

              {/* Carousel */}
              <div className="ll-carousel-wrap">
                <div className="ll-carousel-track">
                  <div className="ll-carousel-slide">
                    <img
                      src={reviewsList[reviewIdx]}
                      alt={`কাস্টমার রিভিউ ${reviewIdx + 1}`}
                      className="ll-review-img"
                      loading="lazy"
                      decoding="async"
                    />
                  </div>
                  {reviewsList.length > 1 && (
                    <div className="ll-carousel-slide ll-carousel-desktop-second">
                      <img
                        src={reviewsList[(reviewIdx + 1) % reviewsList.length]}
                        alt={`কাস্টমার রিভিউ ${((reviewIdx + 1) % reviewsList.length) + 1}`}
                        className="ll-review-img"
                        loading="lazy"
                        decoding="async"
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
            </>
          )}

          {/* Guarantee Box */}
          {(cfg.guaranteeBadge || cfg.guaranteeText) && (
            <div className="ll-guarantee-box">
              {cfg.guaranteeBadge && (
                <div className="ll-pill-badge ll-pill-badge-green" style={{ display: 'inline-flex', marginBottom: '14px' }}>
                  <CheckCircleIcon color="#065F46" size={16} />
                  <span>{cfg.guaranteeBadge}</span>
                </div>
              )}

              {cfg.guaranteeText && <p className="ll-guarantee-text">{cfg.guaranteeText}</p>}
            </div>
          )}
        </div>
      </section>

      {/* SECTION 7: URGENCY & DIRECT CALL / WHATSAPP */}
      <section className="ll-sec ll-sec-pink-banner">
        <div className="ll-inner">
          <div className="ll-banner-buttons">
            <button onClick={scrollToOrder} className="ll-banner-btn ll-btn-delivery">
              {deliveryBannerLabel}
            </button>

            {phoneNum && (
              <a href={`tel:${phoneNum}`} className="ll-banner-btn ll-btn-phone">
                <PhoneIcon size={20} />
                <span>কল করুনঃ {phoneNum}</span>
              </a>
            )}

            {waNum && (
              <a
                href={`https://wa.me/${waNum}?text=${encodeURIComponent(waMessage)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="ll-banner-btn ll-btn-whatsapp"
              >
                <WhatsAppIcon size={24} variant="official" />
                <span>সরাসরি হোয়াটসঅ্যাপ</span>
              </a>
            )}
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
                                {prod.originalPrice && Number(prod.originalPrice) > Number(prod.price) && (
                                  <span style={{ textDecoration: 'line-through', color: '#9ca3af', fontSize: 13, marginRight: 8, fontWeight: 500 }}>
                                    {taka(Number(prod.originalPrice) * q)}
                                  </span>
                                )}
                                <span className="ll-price-num">{taka(prod.price * q)}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Optional Color / Variant Selector */}
                {colorOptions.length > 0 && (
                  <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid rgba(229,231,235,0.7)' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#1F2937', marginBottom: 10 }}>
                      পছন্দের কালার / ভ্যারিয়েন্ট নির্বাচন করুন:
                    </div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      {colorOptions.map((cName) => {
                        const active = selectedColor === cName;
                        return (
                          <button
                            key={cName}
                            type="button"
                            onClick={() => setSelectedColor(cName)}
                            style={{
                              padding: '8px 18px',
                              borderRadius: 999,
                              fontSize: 14,
                              fontWeight: 700,
                              cursor: 'pointer',
                              border: active ? `2px solid ${primaryHex}` : '1.5px solid #d1d5db',
                              background: active ? primaryHex : '#ffffff',
                              color: active ? '#ffffff' : '#374151',
                              boxShadow: active ? `0 4px 12px rgba(${primaryRgb}, 0.25)` : 'none',
                              transition: 'all 0.2s ease',
                            }}
                          >
                            {active ? `✓ ${cName}` : cName}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
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
                <h3 className="ll-checkout-heading">Shipping (ডেলিভারি এলাকা)</h3>
                {isFreeDelivery ? (
                  <div className="ll-shipping-option">
                    <input type="radio" checked readOnly id="free-ship" />
                    <label htmlFor="free-ship" style={{ fontWeight: 700, color: '#047857' }}>
                      সম্পূর্ণ ফ্রি ডেলিভারি (Free Shipping — ৳0)
                    </label>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <label
                      htmlFor="ship-inside"
                      onClick={() => setShippingZone('inside')}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 16px',
                        borderRadius: 12,
                        border: shippingZone === 'inside' ? `2px solid ${primaryHex}` : '1.5px solid #e5e7eb',
                        background: shippingZone === 'inside' ? `rgba(${primaryRgb}, 0.06)` : '#ffffff',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 700, color: '#111827', fontSize: 15 }}>
                        <input
                          type="radio"
                          id="ship-inside"
                          name="ll-shipping-zone"
                          checked={shippingZone === 'inside'}
                          onChange={() => setShippingZone('inside')}
                          style={{ accentColor: primaryHex, width: 18, height: 18 }}
                        />
                        <span>ঢাকার ভেতরে (Inside Dhaka)</span>
                      </span>
                      <strong style={{ fontSize: 16, color: primaryHex }}>{taka(delInside)}</strong>
                    </label>

                    <label
                      htmlFor="ship-outside"
                      onClick={() => setShippingZone('outside')}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 16px',
                        borderRadius: 12,
                        border: shippingZone === 'outside' ? `2px solid ${primaryHex}` : '1.5px solid #e5e7eb',
                        background: shippingZone === 'outside' ? `rgba(${primaryRgb}, 0.06)` : '#ffffff',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 700, color: '#111827', fontSize: 15 }}>
                        <input
                          type="radio"
                          id="ship-outside"
                          name="ll-shipping-zone"
                          checked={shippingZone === 'outside'}
                          onChange={() => setShippingZone('outside')}
                          style={{ accentColor: primaryHex, width: 18, height: 18 }}
                        />
                        <span>ঢাকার বাইরে (Outside Dhaka)</span>
                      </span>
                      <strong style={{ fontSize: 16, color: primaryHex }}>{taka(delOutside)}</strong>
                    </label>
                  </div>
                )}
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
                        {currentItem.title}
                        {selectedColor ? ` (${selectedColor})` : ''} <strong>&times; {currentQty}</strong>
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
                      <td style={{ textAlign: 'right' }}>
                        {isFreeDelivery
                          ? 'Free shipping (৳0)'
                          : `${shippingZone === 'inside' ? 'ঢাকার ভেতরে' : 'ঢাকার বাইরে'}: ${taka(shippingCost)}`}
                      </td>
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
                  <div className="ll-payment-desc">পন্য হাতে পেয়ে মূল্য পরিশোধ করুন।</div>
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
            {phoneNum && (
              <a href={`tel:${phoneNum}`} className="ll-footer-call-btn">
                <PhoneIcon size={18} />
                <span>কল করুনঃ {phoneNum}</span>
              </a>
            )}
            {waNum && (
              <a
                href={`https://wa.me/${waNum}?text=${encodeURIComponent(waMessage)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="ll-footer-call-btn"
                style={{ background: '#25D366', color: '#fff', border: '1px solid rgba(255,255,255,0.4)', gap: 8 }}
              >
                <WhatsAppIcon size={20} variant="official" />
                <span>হোয়াটসঅ্যাপে মেসেজ দিন</span>
              </a>
            )}
          </div>

          <div className="ll-footer-links">
            <a href="/info/privacy" onClick={(e) => { e.preventDefault(); go('info/privacy'); }}>Privacy policy</a>
            <span style={{ color: '#aaa' }}>|</span>
            <a href="/info/terms" onClick={(e) => { e.preventDefault(); go('info/terms'); }}>Terms & Conditions</a>
          </div>
        </div>
      </footer>

      {/* Sticky Bottom Order Bar for Mobile */}
      <div className="ll-mobile-sticky-bar">
        {phoneNum && (
          <a href={`tel:${phoneNum}`} className="ll-sticky-call" title="কল করুন">
            <PhoneIcon size={15} />
            <span>কল</span>
          </a>
        )}
        {waNum && (
          <a
            href={`https://wa.me/${waNum}?text=${encodeURIComponent(waMessage)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="ll-sticky-wa"
            title="হোয়াটসঅ্যাপে অর্ডার করুন"
          >
            <WhatsAppIcon size={16} variant="official" />
            <span>WhatsApp</span>
          </a>
        )}
        <button onClick={scrollToOrder} className="ll-sticky-order">
          <CartIcon size={17} />
          <span>অর্ডার করুন • {taka(total)}</span>
        </button>
      </div>

      {/* Floating WhatsApp Action Button */}
      {waNum && (
        <a
          className="ll-wafloat"
          href={`https://wa.me/${waNum}?text=${encodeURIComponent(waMessage)}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Chat with us on WhatsApp"
          title="WhatsApp Chat"
        >
          <WhatsAppIcon size={34} variant="official" />
        </a>
      )}
    </div>
  );
}
