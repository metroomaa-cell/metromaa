import { useEffect, useState, useMemo, useRef } from 'react';
import { getSettings } from './api';
import { go } from './cart';
import { ecPurchase, initFB, initTikTok, initGTM, initGA4, setAllowedLandingPixels } from './analytics';

type OrderItem = {
  id?: string;
  name?: string;
  title?: string;
  price?: number;
  qty?: number;
  color?: string;
  variantTitle?: string;
  image?: string;
};

type OrderData = {
  id: string;
  total: number;
  subtotal?: number;
  shippingCost?: number;
  name?: string;
  phone?: string;
  address?: string;
  items?: OrderItem[];
  landingSlug?: string;
  headline?: string;
};

export function LandingThankYou({ slug }: { slug: string }) {
  const [order, setOrder] = useState<OrderData | null>(null);
  const [toastMsg, setToastMsg] = useState('');
  const [toastShow, setToastShow] = useState(false);
  const [copied, setCopied] = useState(false);
  const [storeWa, setStoreWa] = useState('');
  const [storePhone, setStorePhone] = useState('');
  const [storeBrand, setStoreBrand] = useState('Store');
  const [landingTitle, setLandingTitle] = useState('');
  const [landingImage, setLandingImage] = useState('');
  const [landingPrice, setLandingPrice] = useState(690);

  const cleanSlug = useMemo(() => {
    return String(slug || '')
      .replace(/\/thankyou\/?$/i, '')
      .replace(/^\/+|\/+$/g, '')
      .trim();
  }, [slug]);

  // Read URL query parameters
  const queryParams = useMemo(() => {
    if (typeof window === 'undefined') return new URLSearchParams();
    return new URLSearchParams(window.location.search);
  }, []);

  const orderIdFromUrl = queryParams.get('id') || queryParams.get('orderId') || '';

  // 1. Load order info from sessionStorage or API
  useEffect(() => {
    let foundOrder: OrderData | null = null;
    try {
      const raw = sessionStorage.getItem('last_landing_order');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (!orderIdFromUrl || parsed.id === orderIdFromUrl || parsed.id?.includes(orderIdFromUrl)) {
          foundOrder = parsed;
        }
      }
    } catch (_) {}

    if (foundOrder) {
      setOrder(foundOrder);
    } else if (orderIdFromUrl) {
      // Fetch public order details from server
      fetch(`/api/orders/public/${encodeURIComponent(orderIdFromUrl)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data && data.id) {
            setOrder(data);
          }
        })
        .catch(() => {});
    }
  }, [orderIdFromUrl]);

  const purchaseTrackedRef = useRef(false);

  // 2. Fetch landing page details, initialize isolated tracking & store settings
  useEffect(() => {
    if (cleanSlug) {
      fetch(`/api/landings/${encodeURIComponent(cleanSlug)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data) {
            if (data.whatsapp) setStoreWa(String(data.whatsapp).replace(/[^0-9]/g, ''));
            if (data.phone) setStorePhone(data.phone);
            setLandingTitle(data.headline || data.title || data.productTitle || '');
            setLandingImage(data.heroImage || data.mainImage || (data.packages && data.packages[0]?.image) || '');
            if (data.offerPrice) setLandingPrice(Number(data.offerPrice) || 690);

            // Auto Code Brain: Ensure landing page custom pixel is active on Thank You page
            if (data.fbPixelId) {
              const pid = String(data.fbPixelId).trim();
              if (data.pixelMode !== 'both') {
                setAllowedLandingPixels([pid]);
              }
              initFB(pid);
            }
            if (data.ttkPixelId) initTikTok(String(data.ttkPixelId).trim());
            if (data.gtmId) initGTM(String(data.gtmId).trim());
            if (data.gaId) initGA4(String(data.gaId).trim());
          }
        })
        .catch(() => {});
    }

    getSettings()
      .then((s) => {
        if (s.whatsapp) setStoreWa((prev) => prev || String(s.whatsapp).replace(/[^0-9]/g, ''));
        if (s.phone) setStorePhone((prev) => prev || s.phone);
        const host = typeof window !== 'undefined' ? window.location.hostname.toLowerCase() : '';
        if (host.includes('secrate')) setStoreBrand('Secrate');
        else if (host.includes('metrroma') || host.includes('metromaa')) setStoreBrand('Metrroma');
        else if (host.includes('timingboost')) setStoreBrand('TimeBoost');
        else if (s.storeName && s.storeName !== 'dot.' && s.storeName !== 'Dot Store') setStoreBrand(s.storeName);
      })
      .catch(() => {});
  }, [cleanSlug]);

  // Toast trigger
  const showToast = (msg: string) => {
    setToastMsg(msg);
    setToastShow(true);
    setTimeout(() => setToastShow(false), 2400);
  };

  const currentOrderId = order?.id || orderIdFromUrl || 'ORD-' + Math.floor(100000 + Math.random() * 900000);

  // Copy order id handler
  const handleCopy = () => {
    const textToCopy = currentOrderId.startsWith('#') ? currentOrderId : `#${currentOrderId}`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(textToCopy).then(() => {
        setCopied(true);
        showToast('Order number copied: ' + textToCopy);
        setTimeout(() => setCopied(false), 2000);
      }).catch(() => fallbackCopy(textToCopy));
    } else {
      fallbackCopy(textToCopy);
    }
  };

  const fallbackCopy = (text: string) => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      setCopied(true);
      showToast('Order number copied: ' + text);
      setTimeout(() => setCopied(false), 2000);
    } catch (_) {}
    document.body.removeChild(ta);
  };

  // Estimated delivery calculation (today + 2-3 days)
  const deliveryDates = useMemo(() => {
    const now = new Date();
    const d1 = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
    const d2 = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const options: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' };
    const str1 = d1.toLocaleDateString('en-GB', options);
    const str2 = d2.toLocaleDateString('en-GB', options);
    return `${str1} – ${str2}`;
  }, []);

  // Items to display
  const itemsList: OrderItem[] = useMemo(() => {
    if (order && Array.isArray(order.items) && order.items.length > 0) {
      return order.items;
    }
    return [
      {
        id: 'item-1',
        name: landingTitle || 'Winter Knitted Hooded Scarf & Cap',
        title: landingTitle || 'Winter Knitted Hooded Scarf & Cap',
        price: landingPrice,
        qty: 1,
        color: order?.color || 'Standard',
        image: landingImage,
      },
    ];
  }, [order, landingTitle, landingPrice, landingImage]);

  const subtotal = order?.subtotal != null ? order.subtotal : itemsList.reduce((acc, it) => acc + (Number(it.price) || 0) * (Number(it.qty) || 1), 0);
  const shippingCharge = order?.shippingCost != null ? order.shippingCost : (order?.total ? Math.max(0, order.total - subtotal) : 80);
  const totalAmount = order?.total != null ? order.total : (subtotal + shippingCharge);

  // 3. Auto Code Brain: Guaranteed Deduplicated Purchase Event on Thank You Page
  useEffect(() => {
    const activeOrderId = order?.id || orderIdFromUrl;
    if (!activeOrderId || purchaseTrackedRef.current) return;

    const storageKey = `ty_purchase_fired_${activeOrderId}`;
    try {
      if (sessionStorage.getItem(storageKey) === '1') {
        purchaseTrackedRef.current = true;
        return;
      }
      sessionStorage.setItem(storageKey, '1');
    } catch (_) {}

    purchaseTrackedRef.current = true;
    const mappedItems = itemsList.map((it, i) => ({
      id: String(it.id || cleanSlug || `item_${i + 1}`),
      name: String(it.name || it.title || landingTitle || 'Product'),
      price: Number(it.price) || landingPrice,
      qty: Number(it.qty) || 1,
    }));

    ecPurchase(
      activeOrderId,
      totalAmount,
      mappedItems,
      `landing_${cleanSlug}`,
      {
        name: order?.name,
        phone: order?.phone,
        address: order?.address,
      }
    );
  }, [order, orderIdFromUrl, totalAmount, itemsList, cleanSlug, landingTitle, landingPrice]);

  const cleanWaNumber = storeWa.replace(/[^0-9]/g, '') || '8801700000000';
  const displayPhone = storePhone || '+880 1700-000000';
  const telPhone = storePhone.replace(/[^0-9+]/g, '') || '+8801700000000';
  const whatsappUrl = `https://wa.me/${cleanWaNumber}?text=${encodeURIComponent(`আসসালামু আলাইকুম, আমি অর্ডার #${currentOrderId} সংক্রান্ত তথ্য জানতে চাচ্ছি।`)}`;

  return (
    <>
      <style>{`
        :root {
          --bg: #F7F5F2;
          --surface: #FFFFFF;
          --surface-2: #FBFAF8;
          --text: #161616;
          --muted: #6B6560;
          --faint: #9A948D;
          --line: #E9E3DB;
          --line-strong: #DDD5C8;
          --green: #0E4D2E;
          --green-bg: #EAF3ED;
          --green-dot: #177245;
          --gold: #B9975B;
          --gold-soft: #F3EAD8;
          --black: #111111;
          --black-text: #FFFFFF;
          --shadow: 0 20px 50px rgba(22,18,10,.07), 0 2px 10px rgba(22,18,10,.04);
          --radius: 22px;
        }
        @media (prefers-color-scheme: dark) {
          :root {
            --bg: #0F0F0F;
            --surface: #171717;
            --surface-2: #1C1C1C;
            --text: #F2EFEA;
            --muted: #A8A29A;
            --faint: #7A756E;
            --line: #2A2A2A;
            --line-strong: #33302B;
            --green: #8ED0A6;
            --green-bg: #16281E;
            --green-dot: #4CC07A;
            --gold: #D2B078;
            --gold-soft: #2A2418;
            --black: #F2EFEA;
            --black-text: #111111;
            --shadow: 0 20px 50px rgba(0,0,0,.35);
          }
        }
        .thankyou-wrapper {
          min-height: 100vh;
          background: var(--bg);
          color: var(--text);
          font-family: "Manrope", system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
          -webkit-font-smoothing: antialiased;
          line-height: 1.5;
        }
        .top-line { height: 3px; background: var(--gold); }
        .wrap { max-width: 720px; margin: 0 auto; padding: 28px 20px 40px; }
        @media (min-width: 640px) { .wrap { padding: 44px 24px 56px; } }
        
        .hero { text-align: center; padding: 10px 6px 8px; }
        .check-wrap {
          width: 78px; height: 78px; margin: 0 auto 20px; border-radius: 50%;
          background: var(--green-bg);
          display: grid; place-items: center;
          border: 1px solid var(--line);
          position: relative;
        }
        .check-wrap::after {
          content: ""; position: absolute; inset: -9px; border-radius: 50%;
          border: 1px solid var(--line);
        }
        .check-svg { width: 38px; height: 38px; }
        .check-circle {
          stroke: var(--green-dot); stroke-width: 2.2; fill: none;
          stroke-dasharray: 166; stroke-dashoffset: 166;
          animation: stroke 0.7s cubic-bezier(.65,0,.35,1) forwards;
        }
        .check-mark {
          stroke: var(--green-dot); stroke-width: 3; fill: none;
          stroke-linecap: round; stroke-linejoin: round;
          stroke-dasharray: 48; stroke-dashoffset: 48;
          animation: stroke 0.45s 0.55s cubic-bezier(.65,0,.35,1) forwards;
        }
        @keyframes stroke { to { stroke-dashoffset: 0; } }

        .eyebrow {
          font-size: 11px; letter-spacing: .18em; text-transform: uppercase;
          font-weight: 800; color: var(--gold); margin: 0 0 10px;
        }
        h1.thankyou-title {
          font-family: "DM Serif Display", Georgia, serif;
          font-weight: 400;
          font-size: clamp(36px, 7vw, 50px);
          line-height: .98; letter-spacing: -.02em; margin: 0;
        }
        h1.thankyou-title em { font-style: italic; color: var(--green); }
        .hero p.lead {
          margin: 14px auto 0; max-width: 520px;
          font-size: 16px; line-height: 1.6; color: var(--muted); font-weight: 500;
        }
        .hero p.bn {
          margin: 8px auto 0; font-size: 15px; color: var(--faint); font-weight: 500;
        }

        .order-pill {
          margin: 22px auto 0; display: inline-flex; align-items: center; gap: 10px; flex-wrap: wrap; justify-content: center;
          background: var(--surface); border: 1px solid var(--line); border-radius: 999px;
          padding: 8px 8px 8px 16px; box-shadow: var(--shadow);
        }
        .order-pill span.label { font-size: 12px; letter-spacing: .08em; text-transform: uppercase; font-weight: 800; color: var(--faint); }
        .order-pill strong { font-family: "JetBrains Mono", monospace; font-size: 14px; letter-spacing: .02em; }
        .copy-btn {
          min-height: 36px; padding: 0 14px; border-radius: 999px; border: 1px solid var(--line);
          background: var(--surface-2); font-weight: 700; font-size: 13px; color: var(--text);
          display: inline-flex; align-items: center; gap: 6px; cursor: pointer; transition: transform 0.1s;
        }
        .copy-btn:active { transform: scale(0.97); }

        .card {
          background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius);
          box-shadow: var(--shadow); margin-top: 22px; overflow: hidden; text-align: left;
        }
        .card-head {
          padding: 18px 20px 14px; display: flex; justify-content: space-between; align-items: center; gap: 16px;
          border-bottom: 1px solid var(--line);
        }
        @media(min-width:640px){ .card-head{padding:20px 24px 16px} .card-body{padding:6px 24px 20px !important} }
        .card-head h2 { font-size: 13px; letter-spacing: .12em; text-transform: uppercase; margin: 0; font-weight: 800; }
        .badge {
          font-size: 12px; font-weight: 800; padding: 6px 10px; border-radius: 999px;
          background: var(--green-bg); color: var(--green); white-space: nowrap;
          display: inline-flex; align-items: center; gap: 6px;
        }
        .badge i { width: 7px; height: 7px; border-radius: 50%; background: var(--green-dot); display: block; }
        .card-body { padding: 6px 20px 18px; }

        .item { display: flex; gap: 16px; padding: 18px 0 16px; border-bottom: 1px dashed var(--line-strong); align-items: center; }
        .thumb {
          width: 72px; height: 72px; flex: 0 0 72px; border-radius: 14px;
          background: linear-gradient(145deg,#1F1F1F,#3A3A3A);
          display: grid; place-items: center; position: relative; overflow: hidden;
        }
        .thumb img { width: 100%; height: 100%; object-fit: cover; }
        .thumb::after { content: ""; position: absolute; inset: auto -10px -18px -10px; height: 28px; background: rgba(255,255,255,.08); transform: rotate(-8deg); }
        .thumb span { font-family: "DM Serif Display", serif; color: #EADFC6; font-size: 26px; line-height: 1; }
        .item-info { flex: 1; min-width: 0; }
        .item-info h3 { margin: 0; font-size: 16px; line-height: 1.3; font-weight: 800; letter-spacing: -.01em; }
        .item-info p { margin: 5px 0 0; font-size: 13.5px; color: var(--muted); font-weight: 500; line-height: 1.5; }
        .item-price { text-align: right; }
        .item-price strong { font-size: 16px; font-weight: 800; }
        .item-price p { margin: 3px 0 0; font-size: 12.5px; color: var(--faint); font-weight: 600; }

        .totals { padding: 14px 0 2px; }
        .row { display: flex; justify-content: space-between; gap: 16px; padding: 7px 0; font-size: 14.5px; font-weight: 600; color: var(--muted); }
        .row span:last-child { color: var(--text); font-weight: 700; }
        .row.total { margin-top: 8px; padding-top: 14px; border-top: 1px solid var(--line); font-size: 15px; color: var(--text); }
        .row.total span:last-child { font-size: 20px; font-weight: 800; letter-spacing: -.02em; }
        .cod {
          margin-top: 14px; background: var(--gold-soft); border: 1px solid var(--line);
          border-radius: 12px; padding: 12px 14px; display: flex; gap: 10px; align-items: flex-start;
          font-size: 13.5px; line-height: 1.55; font-weight: 600;
        }
        .cod b { font-weight: 800; }

        .timeline {
          margin-top: 22px; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius);
          box-shadow: var(--shadow); padding: 20px 20px 18px; text-align: left;
        }
        @media(min-width:640px){ .timeline{padding:22px 24px 20px} }
        .timeline-head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; flex-wrap: wrap; }
        .timeline-head h2 { font-size: 13px; letter-spacing: .12em; text-transform: uppercase; margin: 0; font-weight: 800; }
        .timeline-head p { margin: 0; font-size: 13.5px; color: var(--muted); font-weight: 600; }
        .timeline-head p b { color: var(--text); }
        .steps { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 0; margin-top: 20px; position: relative; }
        .steps::before { content: ""; position: absolute; top: 15px; left: 12%; right: 12%; height: 2px; background: var(--line); }
        .steps::after { content: ""; position: absolute; top: 15px; left: 12%; width: 12%; height: 2px; background: var(--green-dot); }
        .step { text-align: center; position: relative; padding: 0 4px; }
        .step .dot {
          width: 32px; height: 32px; margin: 0 auto; border-radius: 50%; background: var(--surface);
          border: 2px solid var(--line-strong); display: grid; place-items: center; font-size: 13px; position: relative; z-index: 1;
        }
        .step.done .dot { background: var(--green-dot); border-color: var(--green-dot); color: #fff; }
        .step.current .dot { border-color: var(--green-dot); color: var(--green-dot); background: var(--green-bg); font-weight: 800; }
        .step p { margin: 8px 0 0; font-size: 12px; line-height: 1.35; font-weight: 700; color: var(--muted); }
        .step.done p, .step.current p { color: var(--text); }
        .step small { display: block; margin-top: 2px; font-size: 11px; color: var(--faint); font-weight: 600; }

        .next { display: grid; gap: 12px; margin-top: 22px; text-align: left; }
        @media(min-width:640px){ .next { grid-template-columns: 1fr 1fr 1fr; } }
        .next-item { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 16px; }
        .next-item .num {
          width: 28px; height: 28px; border-radius: 50%; background: var(--text); color: var(--bg);
          display: grid; place-items: center; font-size: 13px; font-weight: 800; margin-bottom: 10px;
        }
        @media (prefers-color-scheme: dark){ .next-item .num { background: var(--gold); color: #111; } }
        .next-item h3 { margin: 0; font-size: 14.5px; font-weight: 800; }
        .next-item p { margin: 6px 0 0; font-size: 13.5px; line-height: 1.55; color: var(--muted); font-weight: 500; }

        .actions { display: grid; gap: 10px; margin-top: 22px; }
        @media(min-width:560px){ .actions { grid-template-columns: 1.2fr .8fr; } }
        .btn {
          min-height: 52px; border-radius: 999px; padding: 0 20px;
          display: inline-flex; align-items: center; justify-content: center; gap: 8px;
          font-size: 15px; font-weight: 800; text-decoration: none; border: 1px solid transparent;
          transition: transform .15s ease, opacity .15s ease; cursor: pointer;
        }
        .btn:active { transform: scale(.985); }
        .btn-primary { background: var(--black); color: var(--black-text); }
        .btn-secondary { background: transparent; color: var(--text); border-color: var(--line-strong); }
        .btn svg { width: 18px; height: 18px; flex: 0 0 18px; }

        .help {
          margin-top: 22px; text-align: center; padding: 18px 16px; border: 1px dashed var(--line-strong); border-radius: 16px;
        }
        .help p { margin: 0; font-size: 14px; color: var(--muted); font-weight: 600; line-height: 1.6; }
        .help-links { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; margin-top: 12px; }
        .help-links a {
          min-height: 40px; padding: 0 16px; border-radius: 999px; border: 1px solid var(--line); background: var(--surface);
          display: inline-flex; align-items: center; font-size: 13.5px; font-weight: 700; text-decoration: none; color: var(--text);
        }

        footer.thankyou-footer { margin-top: 28px; text-align: center; padding-bottom: 20px; }
        footer.thankyou-footer p { margin: 0; font-size: 12.5px; color: var(--faint); font-weight: 600; letter-spacing: .02em; line-height: 1.7; }
        footer.thankyou-footer strong { color: var(--muted); letter-spacing: .14em; text-transform: uppercase; font-size: 11px; }

        .toast {
          position: fixed; left: 50%; bottom: 22px; transform: translate(-50%, 16px);
          background: #111; color: #fff; padding: 11px 16px; border-radius: 999px;
          font-size: 13.5px; font-weight: 700; opacity: 0; pointer-events: none; transition: .25s ease; z-index: 999;
          box-shadow: 0 10px 30px rgba(0,0,0,.25); white-space: nowrap;
        }
        @media (prefers-color-scheme: dark){ .toast { background: #F2EFEA; color: #111; } }
        .toast.show { opacity: 1; transform: translate(-50%, 0); }
      `}</style>

      <div key="ty-wrapper" translate="no" className="thankyou-wrapper notranslate">
        <div className="top-line"></div>

        <main className="wrap">
          {/* HERO */}
          <section className="hero" aria-label="Order confirmed">
            <div className="check-wrap" aria-hidden="true">
              <svg className="check-svg" viewBox="0 0 52 52" fill="none">
                <circle className="check-circle" cx="26" cy="26" r="24"></circle>
                <path className="check-mark" d="M14 27l8 8 16-16"></path>
              </svg>
            </div>

            <p className="eyebrow">Order Confirmed</p>
            <h1 className="thankyou-title">Thank you for<br /><em>your order.</em></h1>
            <p className="lead">Your order has been received and is being prepared with care. We’ll call to confirm shortly — please keep your phone nearby.</p>
            <p className="bn">আপনার অর্ডারটি সফলভাবে গৃহীত হয়েছে। ধন্যবাদ!</p>

            <div className="order-pill">
              <span className="label">Order</span>
              <strong>#{currentOrderId}</strong>
              <button className="copy-btn" onClick={handleCopy} type="button" aria-label="Copy order number">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                <span>{copied ? 'Copied ✓' : 'Copy'}</span>
              </button>
            </div>
          </section>

          {/* ORDER SUMMARY */}
          <section className="card" aria-label="Order summary">
            <div className="card-head">
              <h2>Order Summary</h2>
              <span className="badge"><i></i> Confirmed</span>
            </div>
            <div className="card-body">
              {itemsList.map((item, idx) => {
                const title = item.name || item.title || landingTitle || 'Product Package';
                const firstLetter = title.charAt(0).toUpperCase() || 'S';
                const price = Number(item.price) || 0;
                const qty = Number(item.qty) || 1;
                return (
                  <div className="item" key={item.id || idx}>
                    <div className="thumb" aria-hidden="true">
                      {item.image ? (
                        <img src={item.image} alt={title} />
                      ) : (
                        <span>{firstLetter}</span>
                      )}
                    </div>
                    <div className="item-info">
                      <h3>{title}</h3>
                      <p>
                        {item.color && (
                          <>
                            Colour: <b style={{ color: 'var(--text)' }}>{item.color}</b> &nbsp;·&nbsp;{' '}
                          </>
                        )}
                        Qty {qty} {item.variantTitle ? `· ${item.variantTitle}` : ''}
                      </p>
                    </div>
                    <div className="item-price">
                      <strong>৳{(price * qty).toLocaleString()}</strong>
                      <p>৳{price} each</p>
                    </div>
                  </div>
                );
              })}

              <div className="totals">
                <div className="row"><span>Subtotal</span><span>৳{subtotal.toLocaleString()}</span></div>
                <div className="row"><span>Delivery charge</span><span>৳{shippingCharge.toLocaleString()}</span></div>
                <div className="row total"><span>Total to pay</span><span>৳{totalAmount.toLocaleString()}</span></div>
              </div>

              <div className="cod">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flex: '0 0 18px', marginTop: 1 }}>
                  <rect x="2" y="6" width="20" height="12" rx="2" />
                  <circle cx="12" cy="12" r="2" />
                  <path d="M6 12h.01M18 12h.01" />
                </svg>
                <div><b>Cash on Delivery.</b> Pay <b>৳{totalAmount.toLocaleString()}</b> in cash when your parcel arrives. Please check the product in front of the delivery person.</div>
              </div>
            </div>
          </section>

          {/* DELIVERY TIMELINE */}
          <section className="timeline" id="tracking" aria-label="Delivery progress">
            <div className="timeline-head">
              <h2>Delivery Progress</h2>
              <p>Estimated delivery: <b>{deliveryDates}</b></p>
            </div>
            <div className="steps">
              <div className="step done">
                <div className="dot">✓</div>
                <p>Order placed<small>Today</small></p>
              </div>
              <div className="step current">
                <div className="dot">2</div>
                <p>Processing<small>Packing now</small></p>
              </div>
              <div className="step">
                <div className="dot">3</div>
                <p>Shipped<small>On the way</small></p>
              </div>
              <div className="step">
                <div className="dot">4</div>
                <p>Delivered<small>At your door</small></p>
              </div>
            </div>
          </section>

          {/* WHAT'S NEXT */}
          <section className="next" aria-label="What happens next">
            <article className="next-item">
              <div className="num">1</div>
              <h3>Confirmation call</h3>
              <p>Our team will call you within a few hours to confirm your address and delivery time.</p>
            </article>
            <article className="next-item">
              <div className="num">2</div>
              <h3>Packed &amp; shipped</h3>
              <p>Your parcel is quality-checked, carefully packed, and handed to the courier. You’ll get an SMS update.</p>
            </article>
            <article className="next-item">
              <div className="num">3</div>
              <h3>Pay at your door</h3>
              <p>Receive your parcel in 2–3 days and pay in cash. Easy exchange if there’s any issue.</p>
            </article>
          </section>

          {/* ACTIONS */}
          <div className="actions">
            <button
              className="btn btn-primary"
              onClick={() => {
                document.getElementById('tracking')?.scrollIntoView({ behavior: 'smooth' });
                showToast('Your order is being packed — step 2 of 4');
              }}
              type="button"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 8l-2 8H5L3 4H1" />
                <circle cx="9" cy="20" r="1" />
                <circle cx="17" cy="20" r="1" />
                <path d="M12 2v4M8 6h8" />
              </svg>
              Track My Order
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => {
                if (cleanSlug) go(`page/${cleanSlug}`);
                else go('');
              }}
              type="button"
            >
              Continue Shopping
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
          </div>

          {/* HELP */}
          <section className="help" aria-label="Need help">
            <p>Need to change your address or colour?<br />Message us — we’ll fix it before your order ships.</p>
            <div className="help-links">
              <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
                💬 WhatsApp Us
              </a>
              <a href={`tel:${telPhone}`}>
                📞 Call {displayPhone}
              </a>
            </div>
          </section>

          <footer className="thankyou-footer">
            <p><strong>{storeBrand}</strong><br />Thank you for shopping with us · A confirmation SMS has been sent to your phone</p>
          </footer>
        </main>

        <div className={`toast ${toastShow ? 'show' : ''}`} role="status" aria-live="polite">
          {toastMsg}
        </div>
      </div>
    </>
  );
}
