import { useEffect, useState, useMemo, useRef } from 'react';
import { getProducts, getCategories, getProduct, placeOrder, getSettings, validateCoupon, fetchReviews, postReview, getSource, taka, getDeviceId, isSkincareSite, type Product, type Category, type Settings, type Review, getCachedSettings, getCachedCategories, getCachedProducts, getCachedProduct } from './api';
import { useCart, go, useAge } from './cart';
import { useCustomer } from './CustomerAccount';
import { BD_GEO } from './bd-geo';
import { ecView, ecBeginCheckout, ecPurchase, dl } from './analytics';
import { WhatsAppIcon } from './icons';
import { tr, useStoreLanguage } from './language';

export function formatProductDescription(raw?: string): string {
  if (!raw || typeof raw !== 'string') return '';
  // Drop only a legacy mojibake word rather than rendering replacement glyphs in product copy.
  const trimmed = raw.replace(/[^\s<>]*\uFFFD+[^\s<>]*/g, '').replace(/[ \t]{2,}/g, ' ').trim();
  if (!trimmed) return '';

  const hasBlockHtml = /<\/?(p|div|ul|ol|li|h[1-6]|table|blockquote)\b/i.test(trimmed);
  if (!hasBlockHtml) {
    const paras = trimmed.split(/\n{2,}/);
    return paras
      .map((para) => {
        const clean = para.trim();
        if (!clean) return '';
        const lines = clean
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.length > 0)
          .join('<br />');
        return `<p style="margin: 0 0 16px 0; line-height: 1.85;">${lines}</p>`;
      })
      .filter(Boolean)
      .join('\n');
  }

  return trimmed.replace(/([^>])\n([^<])/g, '$1<br />$2');
}

function SearchSelect({ value, onChange, options, placeholder, disabled }: { value: string; onChange: (v: string) => void; options: string[]; placeholder: string; disabled?: boolean }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setQ('');
      }
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return options;
    return options.filter((o) => o.toLowerCase().includes(term));
  }, [options, q]);

  return (
    <div className={'ssel' + (disabled ? ' off' : '') + (open ? ' open' : '')} ref={ref}>
      <div className="ssel-wrap">
        <input
          className="field ssel-input"
          readOnly={disabled}
          disabled={disabled}
          value={open ? q : (value || '')}
          placeholder={placeholder}
          onFocus={() => {
            if (!disabled) {
              setOpen(true);
              setQ('');
            }
          }}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
        />
        <div
          className="ssel-arrow"
          onClick={(e) => {
            e.stopPropagation();
            if (!disabled) {
              setOpen((prev) => !prev);
              setQ('');
            }
          }}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </div>
      {open && !disabled && (
        <div className="ssel-list">
          {shown.length === 0 ? (
            <div className="ssel-empty">No matching location found</div>
          ) : (
            shown.slice(0, 100).map((o) => (
              <div
                className={'ssel-opt' + (o === value ? ' on' : '')}
                key={o}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(o);
                  setOpen(false);
                  setQ('');
                }}
              >
                <span>{o}</span>
                {o === value && <span className="ssel-check">✓</span>}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function flyToBag(img: HTMLImageElement | null) {
  if (!img) return;
  try { if (matchMedia('(prefers-reduced-motion: reduce)').matches) return; } catch {}
  const target = document.querySelector('.cartfab') || document.querySelector('.tabbar .tabcart') || document.querySelector('.tabbar .tab:nth-child(3)');
  if (!target) return;
  const s = img.getBoundingClientRect();
  const t = (target as HTMLElement).getBoundingClientRect();
  const clone = img.cloneNode(true) as HTMLElement;
  clone.style.cssText = `position:fixed;left:${s.left}px;top:${s.top}px;width:${s.width}px;height:${s.height}px;border-radius:12px;object-fit:cover;z-index:200;pointer-events:none;box-shadow:0 20px 50px rgba(0,0,0,.4);transition:transform .8s cubic-bezier(.5,-.1,.3,1),opacity .8s ease;will-change:transform,opacity`;
  document.body.appendChild(clone);
  requestAnimationFrame(() => {
    const dx = (t.left + t.width / 2) - (s.left + s.width / 2);
    const dy = (t.top + t.height / 2) - (s.top + s.height / 2);
    clone.style.transform = `translate(${dx}px, ${dy}px) scale(.12) rotate(10deg)`;
    clone.style.opacity = '0.2';
  });
  setTimeout(() => clone.remove(), 850);
  (target as HTMLElement).classList.add('cart-bump');
  setTimeout(() => (target as HTMLElement).classList.remove('cart-bump'), 550);
}

function AnimTk({ v }: { v: number }) {
  const [n, setN] = useState(v);
  const prev = useRef(v);
  useEffect(() => {
    try { if (matchMedia('(prefers-reduced-motion:reduce)').matches) { setN(v); prev.current = v; return; } } catch {}
    const from = prev.current, to = v, start = performance.now(), ms = 450; let raf = 0;
    const tick = (t: number) => { const p = Math.min(1, (t - start) / ms); setN(Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3)))); if (p < 1) raf = requestAnimationFrame(tick); else prev.current = to; };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [v]);
  return <>{taka(n)}</>;
}

export function getColorHex(name: string): string {
  const n = (name || '').toLowerCase();
  if (n.includes('black') || n.includes('noir') || n.includes('charcoal')) return '#171717';
  if (n.includes('maroon') || n.includes('burgundy') || n.includes('wine')) return '#58111A';
  if (n.includes('emerald') || n.includes('forest') || n.includes('bottle green')) return '#1B4D3E';
  if (n.includes('navy') || n.includes('royal blue') || n.includes('midnight blue')) return '#1A2B4C';
  if (n.includes('olive') || n.includes('army')) return '#556B2F';
  if (n.includes('dusty rose') || n.includes('blush') || n.includes('pink')) return '#DCAE96';
  if (n.includes('beige') || n.includes('nude') || n.includes('sand') || n.includes('biscuit')) return '#D9CBB7';
  if (n.includes('white') || n.includes('pearl') || n.includes('ivory')) return '#F8F9FA';
  if (n.includes('grey') || n.includes('gray') || n.includes('ash') || n.includes('silver')) return '#6C757D';
  if (n.includes('brown') || n.includes('mocha') || n.includes('coffee') || n.includes('chocolate')) return '#4A2E1B';
  if (n.includes('teal')) return '#008080';
  if (n.includes('lavender') || n.includes('lilac') || n.includes('purple')) return '#967BB6';
  if (n.includes('mustard') || n.includes('gold')) return '#C59B27';
  return '#8c7d6b';
}

export function getProductColors(p: Product): { name: string; hex?: string; image?: string }[] {
  if (p.colors && p.colors.length > 0) {
    return p.colors.map((c) => {
      const base = typeof c === 'string'
        ? { name: c, hex: getColorHex(c), image: '' }
        : { ...c, hex: c.hex || getColorHex(c.name), image: c.image || '' };
      if (!base.image && p.variations) {
        const vImg = p.variations.find((v) => v.color?.toLowerCase() === base.name.toLowerCase() && v.image)?.image;
        if (vImg) base.image = vImg;
      }
      return base;
    });
  }
  if (p.variations && p.variations.length > 0) {
    const map = new Map<string, { name: string; hex?: string; image?: string }>();
    p.variations.forEach((v) => {
      if (v.color && !map.has(v.color)) {
        map.set(v.color, {
          name: v.color,
          hex: v.colorHex || getColorHex(v.color),
          image: v.image
        });
      }
    });
    if (map.size > 0) return Array.from(map.values());
  }
  return [];
}

export function getProductSizes(p: Product): string[] {
  if (p.sizes && p.sizes.length > 0) return p.sizes;
  if (p.variations && p.variations.length > 0) {
    const list = Array.from(new Set(p.variations.map((v) => v.size).filter(Boolean))) as string[];
    if (list.length > 0) return list;
  }
  if (p.size && (p.size.includes('/') || p.size.includes(','))) {
    return p.size.split(/[\/,]+/).map((s) => s.trim()).filter(Boolean);
  }
  if (p.size && p.size.trim()) {
    return [p.size.trim()];
  }
  return [];
}

export function isVolumeSize(s: string): boolean {
  return /\b\d+\s*(ml|g|gm|oz|kg|l|ltr|pcs|pack|vials)\b/i.test(s) || /^\d+\s*(ml|g)$/i.test(s.trim());
}

export function isUndergarmentOrApparel(p: Product): boolean {
  const cat = (p.category || '').toLowerCase();
  const slug = (p.slug || '').toLowerCase();
  const name = (p.name || '').toLowerCase();
  if (cat === 'cloth' || cat.includes('cloth') || cat.includes('apparel') || cat.includes('fashion')) return true;
  if (cat.includes('wellness') || cat.includes('intim') || cat.includes('garment') || cat.includes('wear') || cat.includes('bra') || cat.includes('panty') || cat.includes('lingerie') || cat.includes('under') || cat.includes('panjabi') || cat.includes('abaya')) return true;
  if (slug.includes('bra') || slug.includes('panty') || slug.includes('pant') || slug.includes('lingerie') || slug.includes('boxer') || slug.includes('garment') || slug.includes('undergarment') || slug.includes('shaper')) return true;
  if (name.includes('bra') || name.includes('panty') || name.includes('lingerie') || name.includes('boxer') || name.includes('undergarment') || name.includes('shaper')) return true;
  const sizes = getProductSizes(p);
  if (sizes.some((s) => /^(s|m|l|xl|xxl|2xl|3xl|free size|28|30|32|34|36|38|40|42|44|[2-4][0-9][a-e])$/i.test(s.trim()))) return true;
  return false;
}

export function ProductCard({ p }: { p: Product }) {
  const language = useStoreLanguage();
  const { add } = useCart();
  const [added, setAdded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const onSale = !!p.compareAt && p.compareAt > p.price;
  const salePercent = onSale ? Math.round((1 - p.price / p.compareAt!) * 100) : 0;

  const colors = useMemo(() => getProductColors(p), [p]);
  const [selColor, setSelColor] = useState<string>(colors[0]?.name || '');

  const sizes = useMemo(() => getProductSizes(p), [p]);
  const [selSize, setSelSize] = useState<string>(sizes[0] || '');

  const selectedVar = useMemo(() => {
    if (p.variations && p.variations.length > 0) {
      return p.variations.find((v: any) =>
        (!selColor || v.color === selColor) && (!selSize || v.size === selSize)
      ) || p.variations[0];
    }
    return null;
  }, [p, selSize, selColor]);

  const activePrice = selectedVar ? selectedVar.price : p.price;
  const activeCompareAt = selectedVar?.compareAt || p.compareAt;

  const currentCardImage = useMemo(() => {
    if (selColor && colors.length > 0) {
      const col = colors.find((c) => c.name.toLowerCase() === selColor.toLowerCase());
      if (col && (col as any).image) return (col as any).image;
    }
    return selectedVar?.image || p.image;
  }, [selColor, colors, selectedVar, p.image]);

  const handleAddToCart = (e: any) => {
    e.stopPropagation();
    const variantDesc = [selColor ? `Color: ${selColor}` : '', selSize ? `Size: ${selSize}` : ''].filter(Boolean).join(' · ');
    const itemToAdd = {
      ...p,
      price: activePrice,
      size: selSize,
      color: selColor,
      name: variantDesc ? `${p.name} (${variantDesc})` : p.name,
      variantId: selectedVar?.id,
    };
    add(itemToAdd as any);
    flyToBag(imgRef.current);
    setAdded(true);
    setTimeout(() => setAdded(false), 1400);
  };

const secondaryImage = Array.isArray(p.images) && p.images.length > 1 ? p.images[1] : (p.images && p.images[0] && p.images[0] !== p.image ? p.images[0] : null);

  return (
    <article className="product-card" onClick={() => go('product/' + p.slug)}>
      {/* Tabaya Gold Corner Accents */}
      <div className="pc-corner-tr" />
      <div className="pc-corner-bl" />

      {/* Sale state stays in a reserved strip, outside the product photo. */}
      {(p.soldOut || onSale) && <div className="pc-badges-col">
        {p.soldOut ? (
          <span className="pc-badge-save out">SOLD OUT</span>
        ) : onSale ? (
          <span className="pc-badge-save">{language === 'bn' ? `${salePercent}% ছাড়` : `-${salePercent}% OFF`}</span>
        ) : null}
      </div>}

      {/* Image with Secondary Flip on Hover & Quick View Pill */}
      <div className="pc-image-wrap">
        <img ref={imgRef} className="pc-image pc-image-primary" src={currentCardImage} alt={p.name} loading="lazy" decoding="async" onError={(e: any) => { e.currentTarget.style.display = 'none'; e.currentTarget.parentElement?.classList.add('image-unavailable'); }} style={p.soldOut ? { opacity: 0.55 } : undefined} />
        {secondaryImage && secondaryImage !== currentCardImage && (
          <img className="pc-image pc-image-secondary" src={secondaryImage} alt={p.name} loading="lazy" decoding="async" onError={(e: any) => { e.currentTarget.style.display = 'none'; }} />
        )}
        <button
          type="button"
          className="pc-quick-view-btn"
          title={language === 'bn' ? 'দ্রুত দেখুন' : 'Quick View'}
          onClick={(e) => {
            e.stopPropagation();
            if ((window as any).__openQuickView) (window as any).__openQuickView(p);
          }}
        >
          <span>👁</span>
          <span>{language === 'bn' ? 'কুইক ভিউ' : 'Quick View'}</span>
        </button>
      </div>

      {/* Card Content */}
      <div className="pc-content">
        <div className="pc-divider" />
        <div className="pc-eyebrow">{p.category ? tr(p.category.replace(/-/g, ' '), language) : tr('EXCLUSIVE COLLECTION', language)}</div>
        <a className="pc-title">{p.name}</a>
        {(p.tag || p.isDigital) && <span className="pc-product-note">{p.isDigital ? '⚡ DIGITAL · ৳0 DELIVERY' : p.tag}</span>}

        {/* Colors Preview Chips */}
        {colors.length > 0 && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6, marginBottom: 2, flexWrap: 'wrap' }} onClick={(e) => e.stopPropagation()}>
            {colors.slice(0, 5).map((c) => {
              const hex = (c as any).hex || '#111';
              const isSel = (selColor || colors[0]?.name).toLowerCase() === c.name.toLowerCase();
              return (
                <span
                  key={c.name}
                  onClick={() => setSelColor(c.name)}
                  title={c.name}
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    background: hex,
                    border: isSel ? '2px solid #b48e4c' : '1px solid rgba(0,0,0,0.25)',
                    cursor: 'pointer',
                    boxShadow: isSel ? '0 0 0 1px #fff' : 'none',
                    display: 'inline-block',
                    transition: 'all 0.15s ease',
                    transform: isSel ? 'scale(1.2)' : 'scale(1)',
                  }}
                />
              );
            })}
            {colors.length > 5 && (
              <span style={{ fontSize: 10, color: '#8c7d6b', fontWeight: 600 }}>+{colors.length - 5}</span>
            )}
          </div>
        )}

        <div className="pc-price-row">
          <span className="pc-price">
            {activeCompareAt && activeCompareAt > activePrice && (
              <span className="pc-price-old">{taka(activeCompareAt)}</span>
            )}
            {taka(activePrice)}
          </span>
        </div>

        {/* Sizes Selection Chips right on Card - ONLY IF SIZES EXIST */}
        {sizes.length > 0 && (
          <>
            <div className="pc-sizes" onClick={(e) => e.stopPropagation()}>
              {sizes.map((sz: string) => (
                <button
                  key={sz}
                  type="button"
                  className={'pc-size' + (selSize === sz ? ' selected' : '')}
                  onClick={() => setSelSize(sz)}
                >
                  {sz}
                </button>
              ))}
            </div>
            <div className="pc-size-hint">
              {selSize ? `${tr('Size:', language)} ${selSize}` : tr('Select size', language)}
            </div>
          </>
        )}

        {/* Cut-Corner CTA Button */}
        <button
          type="button"
          className="pc-cta"
          disabled={p.soldOut}
          onClick={handleAddToCart}
        >
          <span>{p.soldOut ? tr('SOLD OUT', language) : added ? tr('ADDED TO BAG ✓', language) : tr('ADD TO CART', language)}</span>
        </button>
      </div>
    </article>
  );
}

export function FlashSaleCountdown() {
  const language = useStoreLanguage();
  const [timeLeft, setTimeLeft] = useState({ hours: 12, minutes: 45, seconds: 20 });

  useEffect(() => {
    const calculateTime = () => {
      const now = new Date();
      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);
      const diff = Math.max(0, endOfDay.getTime() - now.getTime());
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      return { hours, minutes, seconds };
    };

    setTimeLeft(calculateTime());
    const interval = setInterval(() => {
      setTimeLeft(calculateTime());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <div className="metro-flash-timer">
      <span className="metro-flash-ending">{language === 'bn' ? 'অফার শেষ হতে বাকি' : 'Ending Offer'}</span>
      <span className="metro-flash-clock">⏰</span>
      <span className="metro-flash-box">{pad(timeLeft.hours)}</span>
      <span className="metro-flash-colon">:</span>
      <span className="metro-flash-box">{pad(timeLeft.minutes)}</span>
      <span className="metro-flash-colon">:</span>
      <span className="metro-flash-box">{pad(timeLeft.seconds)}</span>
    </div>
  );
}



export function QuickViewModal({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const language = useStoreLanguage();
  const { add } = useCart();
  const [activeImg, setActiveImg] = useState<string>('');
  const [selColor, setSelColor] = useState<string>('');
  const [selSize, setSelSize] = useState<string>('');
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    if (product) {
      setActiveImg(product.image || (product.images && product.images[0]) || '');
      const colors = getProductColors(product);
      setSelColor(colors[0]?.name || '');
      const sizes = getProductSizes(product);
      setSelSize(sizes[0] || '');
      setQty(1);
      setAdded(false);
    }
  }, [product]);

  if (!product) return null;

  const colors = getProductColors(product);
  const sizes = getProductSizes(product);

  const selectedVar = product.variations && product.variations.length > 0
    ? product.variations.find((v: any) => (!selColor || v.color === selColor) && (!selSize || v.size === selSize)) || product.variations[0]
    : null;

  const price = selectedVar ? selectedVar.price : product.price;
  const compareAt = selectedVar?.compareAt || product.compareAt;
  const onSale = !!compareAt && compareAt > price;
  const salePercent = onSale ? Math.round((1 - price / compareAt!) * 100) : 0;
  const allImages = Array.isArray(product.images) && product.images.length > 0 ? product.images : [product.image].filter(Boolean);

  const handleAdd = () => {
    const variantDesc = [selColor ? `Color: ${selColor}` : '', selSize ? `Size: ${selSize}` : ''].filter(Boolean).join(' · ');
    const itemToAdd = {
      ...product,
      price,
      size: selSize,
      color: selColor,
      name: variantDesc ? `${product.name} (${variantDesc})` : product.name,
      variantId: selectedVar?.id,
    };
    for (let i = 0; i < qty; i++) {
      add(itemToAdd as any);
    }
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  };

  const handleOrderNow = () => {
    handleAdd();
    onClose();
    go('checkout');
  };

  return (
    <div className="qv-modal-overlay" onClick={onClose}>
      <div className="qv-modal-box" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="qv-close-btn" onClick={onClose}>×</button>

        {/* Left: Images */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ width: '100%', aspectRatio: '4/4.5', borderRadius: 12, overflow: 'hidden', background: '#fff', border: '1px solid rgba(0,0,0,0.08)' }}>
            <img src={activeImg || product.image} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          {allImages.length > 1 && (
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
              {allImages.map((img, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setActiveImg(img)}
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 8,
                    overflow: 'hidden',
                    border: (activeImg === img || (!activeImg && i === 0)) ? '2px solid #b48e4c' : '1px solid rgba(0,0,0,0.12)',
                    padding: 0,
                    cursor: 'pointer',
                    background: '#fff',
                    flexShrink: 0,
                  }}
                >
                  <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right: Info & Purchase */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#b48e4c', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            {product.category || 'EXCLUSIVE COLLECTION'}
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1f3147', margin: 0, fontFamily: "var(--font-serif, 'Playfair Display', Georgia, serif)" }}>
            {product.name}
          </h2>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '4px 0' }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: '#1f3147' }}>{taka(price)}</span>
            {onSale && (
              <>
                <span style={{ fontSize: 15, textDecoration: 'line-through', color: '#94a3b8' }}>{taka(compareAt)}</span>
                <span style={{ background: '#8b1e1e', color: '#fff', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4 }}>
                  -{salePercent}% OFF
                </span>
              </>
            )}
          </div>

          {/* Color Picker */}
          {colors.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#4b5563', marginBottom: 6 }}>
                {tr('Color', language)}: <b style={{ color: '#1f3147' }}>{selColor}</b>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {colors.map((c) => {
                  const isSel = selColor.toLowerCase() === c.name.toLowerCase();
                  return (
                    <button
                      key={c.name}
                      type="button"
                      onClick={() => {
                        setSelColor(c.name);
                        if ((c as any).image) setActiveImg((c as any).image);
                      }}
                      style={{
                        padding: '5px 12px',
                        borderRadius: 20,
                        border: isSel ? '2px solid #b48e4c' : '1px solid #d1d5db',
                        background: isSel ? '#faf5ec' : '#fff',
                        fontWeight: isSel ? 700 : 500,
                        fontSize: 12,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <span style={{ width: 12, height: 12, borderRadius: '50%', background: (c as any).hex || '#111', display: 'inline-block' }} />
                      <span>{c.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Size Picker */}
          {sizes.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#4b5563', marginBottom: 6 }}>
                {tr('Size', language)}: <b style={{ color: '#1f3147' }}>{selSize}</b>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {sizes.map((s) => {
                  const isSel = selSize === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSelSize(s)}
                      style={{
                        minWidth: 42,
                        padding: '6px 12px',
                        borderRadius: 6,
                        border: isSel ? '2px solid #1f3147' : '1px solid #d1d5db',
                        background: isSel ? '#1f3147' : '#fff',
                        color: isSel ? '#fff' : '#1f3147',
                        fontWeight: 700,
                        fontSize: 12,
                        cursor: 'pointer',
                      }}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quantity Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#4b5563' }}>{tr('Quantity', language)}:</span>
            <div style={{ display: 'inline-flex', alignItems: 'center', border: '1px solid #d1d5db', borderRadius: 6, overflow: 'hidden' }}>
              <button
                type="button"
                onClick={() => setQty(Math.max(1, qty - 1))}
                style={{ width: 32, height: 32, background: '#f8fafc', border: 'none', cursor: 'pointer', fontWeight: 700 }}
              >
                -
              </button>
              <span style={{ width: 36, textAlign: 'center', fontSize: 13, fontWeight: 700 }}>{qty}</span>
              <button
                type="button"
                onClick={() => setQty(qty + 1)}
                style={{ width: 32, height: 32, background: '#f8fafc', border: 'none', cursor: 'pointer', fontWeight: 700 }}
              >
                +
              </button>
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
            <button
              type="button"
              onClick={handleAdd}
              disabled={product.soldOut}
              className="tabaya-btn secondary"
              style={{ padding: '12px 16px', fontSize: 12, letterSpacing: '1px', fontWeight: 700 }}
            >
              {added ? tr('ADDED ✓', language) : tr('ADD TO BAG', language)}
            </button>
            <button
              type="button"
              onClick={handleOrderNow}
              disabled={product.soldOut}
              className="tabaya-btn primary"
              style={{ padding: '12px 16px', fontSize: 12, letterSpacing: '1px', fontWeight: 700 }}
            >
              ⚡ {tr('ORDER NOW', language)}
            </button>
          </div>

          <div style={{ textAlign: 'center', marginTop: 4 }}>
            <a
              onClick={(e) => { e.preventDefault(); onClose(); go('product/' + product.slug); }}
              style={{ fontSize: 12, color: '#b48e4c', textDecoration: 'underline', cursor: 'pointer', fontWeight: 600 }}
            >
              {language === 'bn' ? 'সম্পূর্ণ বিবরণ দেখুন →' : 'View Full Product Details →'}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="pcard skcard">
      <div className="skel skimg" />
      <div className="skel skline" />
      <div className="skel skline sh" />
    </div>
  );
}

export function AgeGate({ onConfirm }: { onConfirm: () => void }) {
  return (
    <div className="agewrap">
      <div className="agebox">
        <div className="eye" style={{ justifyContent: 'center' }}>18+ only</div>
        <h2>are you over 18?</h2>
        <p>this section holds intimate wellness products made for adults. please confirm your age to continue.</p>
        <div className="btns">
          <button className="btn full" onClick={onConfirm}>yes, i am 18 or older</button>
          <button className="btn ghost full" onClick={() => go('home')}>take me back</button>
        </div>
      </div>
    </div>
  );
}
function Stars({ n }: { n: number }) {
  const full = Math.round(n);
  return <span className="stars2">{'★★★★★'.split('').map((s, i) => <span key={i} className={i < full ? '' : 'dim'}>★</span>)}</span>;
}

function Reviews({ productId }: { productId: string }) {
  const language = useStoreLanguage();
  const [data, setData] = useState<{ count: number; avg: number; reviews: Review[] }>({ count: 0, avg: 0, reviews: [] });
  const [form, setForm] = useState({ name: '', rating: 5, text: '' });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const load = () => fetchReviews(productId).then(setData).catch(() => {});
  useEffect(() => { load(); }, [productId]);
  const submit = async () => {
    if (!form.name.trim()) { setError('Please enter your name.'); return; }
    setError('');
    setBusy(true);
    try { await postReview({ productId, name: form.name.trim(), rating: form.rating, text: form.text.trim() }); setForm({ name: '', rating: 5, text: '' }); setDone(true); setTimeout(() => setDone(false), 3500); } catch (e: any) { setError(e.message || 'Could not submit your review. Please try again.'); }
    finally { setBusy(false); }
  };
  return (
    <section className="revs">
      <div className="shd"><h2>{tr('Reviews', language)}{data.count ? ` · ${data.avg} ★ (${data.count})` : ''}</h2></div>
      <div className="revgrid">
        <div className="revlist">
          {data.reviews.length === 0 && <p className="dim">{tr('no reviews yet — be the first.', language)}</p>}
          {data.reviews.map((r) => (
            <div className="rev" key={r.id}>
              <div className="revh"><Stars n={r.rating} /><span className="dim">{r.name}</span></div>
              {r.text && <p>{r.text}</p>}
              {r.adminReply && <div className="revreply"><strong>Store reply</strong><p>{r.adminReply}</p></div>}
            </div>
          ))}
        </div>
        <div className="revform">
          <h4>{tr('leave a review', language)}</h4>
          <div className="ratepick">{[1, 2, 3, 4, 5].map((n) => <button key={n} className={n <= form.rating ? 'on' : ''} onClick={() => setForm((s) => ({ ...s, rating: n }))}>★</button>)}</div>
          <input className="field" placeholder={tr('your name', language)} value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} />
          <textarea className="field" placeholder={tr('your thoughts (optional)', language)} value={form.text} onChange={(e) => setForm((s) => ({ ...s, text: e.target.value }))} />
          {error && <p className="rev-error" role="alert">{error}</p>}
          <button className="btn full" disabled={busy} onClick={submit}>{busy ? tr('posting…', language) : done ? tr('submitted for approval ✓', language) : tr('post review', language)}</button>
        </div>
      </div>
    </section>
  );
}

function Related({ product }: { product: Product }) {
  const language = useStoreLanguage();
  const [items, setItems] = useState<Product[]>([]);
  useEffect(() => { getProducts(product.category).then((all) => setItems(all.filter((p) => p.id !== product.id).slice(0, 4))).catch(() => {}); }, [product.id]);
  if (items.length === 0) return null;
  return (
    <section>
      <div className="shd"><h2>{tr('you may also like', language)}</h2></div>
      <div className="grid">{items.map((p) => <ProductCard key={p.id} p={p} />)}</div>
    </section>
  );
}

const INFO: Record<string, { title: string; body: string[] }> = {
  shipping: { title: 'shipping & delivery', body: ['We deliver nationwide across Bangladesh through trusted express couriers. Inside Dhaka usually arrives in 24–48 hours, outside Dhaka in 2–3 business days.', 'You pay cash on delivery when your order reaches your doorstep. You can inspect the parcel before acceptance.'] },
  returns: { title: 'returns & exchanges', body: ['We offer a 7-day hassle-free exchange policy. If the size, color, or fit is not ideal, message our support team with your order ID.', 'We will immediately arrange a replacement sent to your doorstep.'] },
  contact: { title: 'contact customer support', body: ['Questions about an order or a product? Our customer care team is here to assist you 7 days a week, 10:00 AM – 10:00 PM.', 'Call our helpline or message us directly on WhatsApp using the button below.'] },
  about: { title: 'about SECRATE', body: ['SECRATE offers skincare, beauty, and personal care products from a range of brands.', 'Product and ingredient details are provided on individual listings and packaging. Orders are delivered across Bangladesh with cash on delivery.'] },
  privacy: { title: 'privacy policy', body: ['Your details are used strictly to process and deliver your order. We never sell or share your personal information with third parties.'] },
  terms: { title: 'terms of service', body: ['By placing an order you confirm that your shipping details and contact number are accurate.', 'All prices are in BDT and payable via Cash on Delivery upon receiving your package.'] },
  journal: { title: 'the journal', body: ['Style guides, fabric care notes & lifestyle stories — coming soon.'] },
};
export function InfoPage({ slug }: { slug: string }) {
  const language = useStoreLanguage();
  const [settings, setSettings] = useState<Settings | null>(null);
  const defaultInfo = INFO[slug] || { title: 'page', body: ['coming soon.'] };
  const customInfo = settings?.siteContent?.infoPages?.[slug]?.[language];
  const info = {
    title: customInfo?.title?.trim() || tr(defaultInfo.title, language),
    body: defaultInfo.body.map((paragraph, index) => customInfo?.body?.[index]?.trim() || tr(paragraph, language)),
  };
  const [wa, setWa] = useState('');
  useEffect(() => {
    getSettings().then((s) => { setSettings(s); if (s.whatsapp) setWa(s.whatsapp); }).catch(() => {});
  }, []);
  return (
    <div className="page"><div className="wrap" style={{ maxWidth: 760 }}>
      <span className="back" onClick={() => (history.length > 1 ? history.back() : go('home'))}>← {tr('back', language)}</span>
      <div className="phead"><h1>{info.title}</h1></div>
      {info.body.map((p, i) => <p key={i} style={{ color: 'var(--dim)', marginBottom: 14, maxWidth: '62ch', fontSize: 16 }}>{p}</p>)}
      {slug === 'contact' && wa && (
        <div style={{ marginTop: 24 }}>
          <a
            href={`https://wa.me/${wa}?text=${encodeURIComponent('Hello! I have an inquiry about my order / product.')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              background: '#25D366',
              color: '#ffffff',
              borderColor: '#25D366',
              fontWeight: 600,
              fontSize: 15,
            }}
          >
            <WhatsAppIcon size={20} variant="official" />
            <span>{tr('Chat on WhatsApp', language)}</span>
          </a>
        </div>
      )}
    </div></div>
  );
}

function videoEmbed(url: string): { type: 'youtube' | 'facebook' | 'direct'; src: string; rawUrl: string; id?: string } | null {
  const u = (url || '').trim();
  if (!u) return null;
  const yt = u.match(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{6,})/);
  if (yt) {
    const id = yt[1];
    const origin = typeof window !== 'undefined' && window.location.origin ? window.location.origin : '';
    const originParam = origin ? `&origin=${encodeURIComponent(origin)}` : '';
    return {
      type: 'youtube',
      id,
      src: `https://www.youtube.com/embed/${id}?rel=0&enablejsapi=1&playsinline=1${originParam}`,
      rawUrl: `https://www.youtube.com/watch?v=${id}`,
    };
  }
  if (/facebook\.com|fb\.watch/.test(u)) {
    return {
      type: 'facebook',
      src: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(u)}&show_text=false&width=560`,
      rawUrl: u,
    };
  }
  if (/\.(mp4|webm|ogg)($|\?)/i.test(u) || u.startsWith('/uploads/')) {
    return {
      type: 'direct',
      src: u,
      rawUrl: u,
    };
  }
  return null;
}

function HomeHeroSlider({ slides }: { slides: any[] }) {
  const language = useStoreLanguage();
  const activeSlides = useMemo(() => slides.filter((s) => s.active !== false && s.image), [slides]);
  const [cur, setCur] = useState(0);
  const [touchStart, setTouchStart] = useState<number | null>(null);

  useEffect(() => {
    if (activeSlides.length <= 1) return;
    const t = setInterval(() => {
      setCur((c) => (c + 1) % activeSlides.length);
    }, 5500);
    return () => clearInterval(t);
  }, [activeSlides.length]);

  if (activeSlides.length === 0) {
    const isSkin = isSkincareSite();
    return (
      <section className="tabaya-hero" style={isSkin ? { background: 'radial-gradient(ellipse at 78% 35%, rgba(104,126,78,.38), transparent 44%), radial-gradient(ellipse at 12% 100%, rgba(174,142,80,.18), transparent 42%), linear-gradient(120deg,#101b16 0%,#1d2b20 54%,#111914 100%)' } : undefined}>
        <div className="tabaya-hero-bg">
          <picture>
            {isSkin && <source media="(max-width: 768px)" srcSet="/uploads/banner_secrate_mobile.webp" />}
            <img
              src={isSkin
                ? '/uploads/banner_secrate_desktop.webp'
                : '/uploads/img_mvdpqsl1t81m6.webp'}
              alt={isSkin ? 'Skincare & Self-Care Products' : 'METRROMA Lifestyle & Gifts'}
              loading="eager"
              fetchPriority="high"
              decoding="async"
              onError={(e: any) => {
                if (isSkin) {
                  e.currentTarget.src = 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?auto=format&fit=crop&w=1920&q=85';
                } else {
                  e.currentTarget.style.display = 'none';
                }
              }}
            />
          </picture>
        </div>
        <div className="tabaya-hero-overlay" style={isSkin ? { background: 'linear-gradient(90deg,rgba(12,23,17,.90) 0%,rgba(12,23,17,.58) 60%,rgba(12,23,17,.24) 100%)' } : undefined} />
        <div className="wrap tabaya-hero-wrap">
          <div className="tabaya-hero-card">
            <span className="tabaya-hero-badge">
              {tr(isSkin ? '🌿 SKINCARE & SELF-CARE · CAREFULLY CURATED' : '✨ EXCLUSIVE 2026 COLLECTION · PREMIUM LIFESTYLE', language)}
            </span>
            <h1 className="tabaya-hero-title serif">
              {isSkin ? (
                <>
                {tr('Skincare & Self-Care', language)}<br />
                  <span className="it" style={{ color: '#d4af37' }}>{tr('Elevated Everyday Skincare', language)}</span>
                </>
              ) : (
                <>
                  {tr('Curated Modern Lifestyle', language)}<br />
                  <span className="it" style={{ color: '#b48e4c' }}>{tr('Watches, Sunglasses & Gifts', language)}</span>
                </>
              )}
            </h1>
            <p className="tabaya-hero-desc">
              {tr(isSkin
                ? 'Explore skincare, beauty, and personal care products from a range of brands. Check each listing for ingredients and directions. Cash on delivery nationwide.'
                : 'Explore watches, sunglasses, and gift boxes selected for everyday style. Cash on delivery nationwide.', language)}
            </p>
            <div className="tabaya-hero-btns">
              <button className="tabaya-btn primary" onClick={() => go(isSkin ? 'shop/skincare' : 'shop')}>
                {tr(isSkin ? 'EXPLORE SKINCARE →' : 'EXPLORE COLLECTIONS →', language)}
              </button>
              <button className="tabaya-btn outline" onClick={() => go('shop')}>
                {tr('ALL PRODUCTS', language)}
              </button>
            </div>
            <div className="tabaya-hero-micro">
              <span>🚚 {tr('Cash on Delivery Nationwide', language)}</span>
              <span>{isSkin ? `🌿 ${tr('Product Details & Ingredient Information', language)}` : `📦 ${tr('Courier Inspection Policy Applies', language)}`}</span>
            </div>
          </div>
        </div>
      </section>
    );
  }

  const s = activeSlides[cur] || activeSlides[0];
  const isSkin = isSkincareSite();
  const heroTitle = s.title || (isSkin ? 'Skincare & self-care for everyday routines' : 'Curated Modern Lifestyle');
  const heroSubtitle = s.subtitle || (s.title ? '' : (isSkin ? 'Skincare, beauty & personal care' : 'Watches, Sunglasses & Gifts'));
  const heroDescription = s.description || (isSkin
    ? 'Discover considered skincare and self-care essentials made to bring a little more intention to your everyday routine.'
    : 'Explore signature accessories and timeless pieces, thoughtfully selected for the way you live.');

  return (
    <section
      className="tabaya-hero"
      style={{ position: 'relative', overflow: 'hidden', ...(isSkincareSite() ? { background: 'radial-gradient(ellipse at 78% 35%, rgba(104,126,78,.38), transparent 44%), radial-gradient(ellipse at 12% 100%, rgba(174,142,80,.18), transparent 42%), linear-gradient(120deg,#101b16 0%,#1d2b20 54%,#111914 100%)' } : {}) }}
      onTouchStart={(e) => setTouchStart(e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchStart === null) return;
        const diff = touchStart - e.changedTouches[0].clientX;
        if (diff > 45) setCur((c) => (c + 1) % activeSlides.length);
        else if (diff < -45) setCur((c) => (c - 1 + activeSlides.length) % activeSlides.length);
        setTouchStart(null);
      }}
    >
      <div className="tabaya-hero-bg">
        <picture>
          {s.mobileImage && <source media="(max-width: 768px)" srcSet={s.mobileImage} />}
          <img
            key={s.image}
            src={s.image}
            alt={s.title || 'Hero Banner'}
            loading="eager"
            fetchPriority={cur === 0 ? 'high' : 'auto'}
            decoding="async"
            style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'opacity 0.6s ease-in-out' }}
            onError={(e: any) => {
              const fallback = isSkincareSite()
                ? 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?auto=format&fit=crop&w=1920&q=85'
                : '/uploads/img_mvdpqsl1t81m6.webp';
              if (e.currentTarget.src.endsWith(fallback)) return;
              e.currentTarget.src = fallback;
            }}
          />
        </picture>
      </div>
      <div className="tabaya-hero-overlay" style={isSkincareSite() ? { background: 'linear-gradient(90deg,rgba(12,23,17,.90) 0%,rgba(12,23,17,.58) 60%,rgba(12,23,17,.24) 100%)' } : undefined} />

      {/* Navigation Arrows */}
      {activeSlides.length > 1 && (
        <>
          <button
            type="button"
            onClick={() => setCur((c) => (c - 1 + activeSlides.length) % activeSlides.length)}
            aria-label="Previous Slide"
            style={{
              position: 'absolute',
              left: 20,
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 10,
              width: 44,
              height: 44,
              borderRadius: '50%',
              background: 'rgba(0,0,0,0.45)',
              border: '1px solid rgba(255,255,255,0.25)',
              color: '#fff',
              fontSize: 22,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backdropFilter: 'blur(6px)',
            }}
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => setCur((c) => (c + 1) % activeSlides.length)}
            aria-label="Next Slide"
            style={{
              position: 'absolute',
              right: 20,
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 10,
              width: 44,
              height: 44,
              borderRadius: '50%',
              background: 'rgba(0,0,0,0.45)',
              border: '1px solid rgba(255,255,255,0.25)',
              color: '#fff',
              fontSize: 22,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backdropFilter: 'blur(6px)',
            }}
          >
            ›
          </button>
        </>
      )}

      {/* Slide Content Card */}
      <div className="wrap tabaya-hero-wrap">
        <div className="tabaya-hero-card" key={s.id || cur} style={{ animation: 'fadeIn 0.5s ease' }}>
          {s.badge && <span className="tabaya-hero-badge">{tr(s.badge, language)}</span>}
          <h1 className="tabaya-hero-title serif">
            {tr(heroTitle, language)}
            {heroSubtitle && (
              <>
                <br />
                <span className="it" style={{ color: '#b48e4c' }}>{tr(heroSubtitle, language)}</span>
              </>
            )}
          </h1>
          <p className="tabaya-hero-desc">{tr(heroDescription, language)}</p>
          <div className="tabaya-hero-btns">
            <button
              className="tabaya-btn primary"
              onClick={() => go(s.btnLink || 'shop')}
            >
              {tr(s.btnText || 'SHOP NOW →', language)}
            </button>
            <button className="tabaya-btn outline" onClick={() => go('shop')}>
              {tr('ALL COLLECTIONS', language)}
            </button>
          </div>
          <div className="tabaya-hero-micro">
            <span>🚚 {tr('Cash on Delivery Nationwide', language)}</span>
            <span>🔒 {tr('Courier Inspection Policy Applies', language)}</span>
          </div>
        </div>
      </div>

      {/* Pagination Dots */}
      {activeSlides.length > 1 && (
        <div
          style={{
            position: 'absolute',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10,
            display: 'flex',
            gap: 8,
            alignItems: 'center',
          }}
        >
          {activeSlides.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setCur(i)}
              aria-label={`Go to slide ${i + 1}`}
              style={{
                width: cur === i ? 28 : 8,
                height: 8,
                borderRadius: 4,
                background: cur === i ? '#b48e4c' : 'rgba(255,255,255,0.4)',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                padding: 0,
              }}
            />
          ))}
        </div>
      )}
    </section>
  );
}

const DEFAULT_SLIDERS = [
  {
    id: 'slide_mvdpqkvg',
    image: '/uploads/img_mvdpqsl1t81m6.webp',
    mobileImage: '',
    badge: '',
    title: '',
    subtitle: '',
    btnText: 'Best Gift Ever ',
    btnLink: 'shop',
    active: true,
  },
];

const DEFAULT_HOMEPAGE_SECTIONS = [
  { id: 'sec-watch', title: 'Watch', category: 'watch', count: 10, active: true, isFlashSale: false, buttonText: 'View More' },
  { id: 'sec-gift', title: 'Gift', category: 'gift', count: 10, active: true, isFlashSale: false, buttonText: 'View More' },
  { id: 'sec-sunglass', title: 'Sunglass', category: 'sunglass', count: 10, active: true, isFlashSale: false, buttonText: 'View More' },
];

export function Home() {
  const language = useStoreLanguage();
  const { openAuth } = useCustomer();
  const [products, setProducts] = useState<Product[]>(() => getCachedProducts());
  const [loaded, setLoaded] = useState(() => (getCachedProducts()?.length ?? 0) > 0);
  const [cats, setCats] = useState<Category[]>(() => getCachedCategories());
  const [settings, setSettings] = useState<Settings | null>(() => {
    const cached = getCachedSettings();
    if (cached) return cached;
    return {
      storeName: 'METRROMA',
      announce: '✨ FREE SHIPPING ON ORDERS OVER Tk 3,000 · 100% AUTHENTIC LIFESTYLE & GIFTS · CASH ON DELIVERY NATIONWIDE',
      deliveryInside: 80,
      deliveryOutside: 130,
      freeShipThreshold: 3000,
      lowStockAt: 5,
      whatsapp: '8801633617136',
      phone: '8801633617136',
      gtmId: 'GTM-WM964FQV',
      fbPixelId: '',
      logo: '/uploads/img_mvkr0y8i1irod.webp',
      favicon: '/uploads/img_mvddqn154or1h.webp',
      sliders: DEFAULT_SLIDERS,
      homepageSections: DEFAULT_HOMEPAGE_SECTIONS,
    } as Settings;
  });
  const [sliders, setSliders] = useState<any[]>(() => {
    const cached = getCachedSettings();
    return (cached?.sliders && cached.sliders.length > 0) ? cached.sliders : DEFAULT_SLIDERS;
  });
  const [subEmail, setSubEmail] = useState('');
  const [subbed, setSubbed] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null);
  useEffect(() => { (window as any).__openQuickView = setQuickViewProduct; return () => { delete (window as any).__openQuickView; }; }, []);

  useEffect(() => {
    getProducts().then((d) => { setProducts(d); setLoaded(true); }).catch(() => setLoaded(true));
    getCategories().then(setCats).catch(() => {});
    getSettings().then((s) => {
      setSettings(s);
      if (Array.isArray(s.sliders)) setSliders(s.sliders);
    }).catch(() => {});
  }, []);

  const isSkin = isSkincareSite();
  const customHomeCopy = settings?.homeContent?.[language] || {};
  const visibleSections = settings?.siteContent?.sections || {};
  const homeText = (key: string, fallback: string) => customHomeCopy[key]?.trim() || tr(fallback, language);

  const best = useMemo(() => {
    if (!products.length) return [];
    if (isSkin) {
      return [...products]
        .filter((p) => !p.adult)
        .sort((a, b) => {
          const aSkin = (a.category === 'beauty-care' || a.category === 'hair-care' || a.category === 'skincare') ? 1 : 0;
          const bSkin = (b.category === 'beauty-care' || b.category === 'hair-care' || b.category === 'skincare') ? 1 : 0;
          if (bSkin !== aSkin) return bSkin - aSkin;
          return (b.tag === 'bestseller' ? 1 : 0) - (a.tag === 'bestseller' ? 1 : 0);
        });
    }
    return products.filter((p) => !p.adult)
      .sort((a, b) => (b.tag === 'bestseller' ? 1 : 0) - (a.tag === 'bestseller' ? 1 : 0));
  }, [products, isSkin]);

  const shelfSections = useMemo(() => {
    const configured = (settings?.homepageSections || []).filter((s: any) => s.active !== false);
    if (configured.length > 0) return configured;
    if (!loaded && !settings) return [];

    const defaults: any[] = [];
    cats.forEach((c) => {
      defaults.push({
        id: `sec-${c.slug}`,
        title: c.name,
        category: c.slug,
        count: 8,
        isFlashSale: false,
        active: true,
        buttonText: 'View More',
      });
    });
    return defaults;
  }, [settings?.homepageSections, cats, loaded, settings]);

  const [activeTabCat, setActiveTabCat] = useState('all');

  const filteredBest = useMemo(() => {
    if (activeTabCat === 'all') return best;
    return best.filter((p) => {
      const cat = (p.category || '').toLowerCase();
      if (activeTabCat === 'digital') return p.isDigital || cat === 'digital';
      return cat === activeTabCat;
    });
  }, [best, activeTabCat]);

  const deliveryInside = Number(settings?.deliveryInside ?? 80);
  const deliveryOutside = Number(settings?.deliveryOutside ?? 130);
  const freeShipThreshold = Number(settings?.freeShipThreshold ?? (isSkin ? 2500 : 3000));
  const formatFaqFee = (amount: number) => language === 'bn'
    ? `৳${amount.toLocaleString('bn-BD')}`
    : taka(amount);
  const deliveryFaqAnswer = language === 'bn'
    ? `ঢাকার ভেতরে সাধারণত ২৪–৪৮ ঘণ্টায় ডেলিভারি হয় (${formatFaqFee(deliveryInside)})। ঢাকার বাইরে ২–৪ কর্মদিবস লাগে (${formatFaqFee(deliveryOutside)})। ${formatFaqFee(freeShipThreshold)}-এর বেশি অর্ডারে সারা দেশে ডেলিভারি ফ্রি।`
    : `Delivery inside Dhaka is typically 24–48 hours (${formatFaqFee(deliveryInside)}). Delivery outside Dhaka takes 2–4 business days (${formatFaqFee(deliveryOutside)}). Orders above ${formatFaqFee(freeShipThreshold)} qualify for free nationwide delivery.`;

  const defaultFaqs = isSkin
    ? [
        {
          q: 'How do I choose the right skincare routine for my skin type?',
          a: 'Start with products suited to your skin and follow each product label. Introduce one new product at a time and patch test before regular use. For persistent or concerning skin issues, consult a qualified dermatologist.',
        },
        {
          q: 'Can I open and inspect the parcel before paying?',
          a: 'Inspection depends on the courier’s rules. If inspection is available, check the outer packaging and product seals in front of the delivery agent before paying.',
        },
        {
          q: 'What are the delivery charges and delivery times?',
          a: deliveryFaqAnswer,
        },
        {
          q: 'Are these products safe for sensitive and acne-prone skin?',
          a: 'Product suitability varies by person. Review each product’s ingredient list and directions, patch test before first use, and stop using it if irritation occurs. Consult a qualified dermatologist about persistent skin concerns.',
        },
        {
          q: 'How should I store serums and botanical oils for freshness?',
          a: 'Store in a cool, dry place away from direct sunlight and heat. Always ensure the cap or dropper bottle is sealed tightly after each use to keep active ingredients potent.',
        },
      ]
    : [
        {
          q: 'How do I place an order with Cash on Delivery?',
          a: 'Choose a product and any available options, then click "ADD TO CART" or proceed to Checkout. Enter your name, delivery address, and phone number. No advance payment is needed — you pay when your parcel is handed to you.',
        },
        {
          q: 'Can I open and inspect the parcel before paying?',
          a: 'Yes. You may inspect the parcel contents and item condition in front of the courier delivery agent before paying, subject to the courier’s inspection rules.',
        },
        {
          q: 'What are the delivery charges and delivery times?',
          a: deliveryFaqAnswer,
        },
        {
          q: 'What if I have an issue with my order?',
          a: 'Contact customer support using the phone or WhatsApp links on this site and include your order number so the team can help.',
        },
        {
          q: 'How can I contact customer support?',
          a: 'Use the phone or WhatsApp links in the Customer Support section. Please include your order number when asking about an existing order.',
        },
      ];
  const customFaqs = customHomeCopy.faqs;
  const faqs = defaultFaqs.map((faq, index) => ({
    q: customFaqs?.[index]?.q?.trim() || faq.q,
    a: customFaqs?.[index]?.a?.trim() || faq.a,
  }));


  return (
    <div className="tabaya-home">
      {/* 1. HERO BANNER / SLIDER */}
      {visibleSections.hero !== false && <HomeHeroSlider slides={sliders} />}

      
      {/* 2. SHOP BY COLLECTION / CATEGORY (ara-section) */}
      {visibleSections.collections !== false && cats.length > 0 && (
        <section className="ara-section">
          <div className="wrap">
            <div className="ara-header">
              <p className="ara-eyebrow">{homeText('collectionEyebrow', isSkin ? 'CURATED REGIMEN' : 'CURATED LINEUP')}</p>
              <h2 className="ara-title">{homeText('collectionTitle', isSkin ? 'Shop by Category' : 'Shop by Collection')}</h2>
              <p className="ara-subtitle">
                {homeText('collectionDescription', isSkin
                  ? 'Browse skincare and personal care by category. Product details are listed on individual product pages.'
                  : 'Browse watches, sunglasses, and gift boxes selected for everyday style.')}
              </p>
            </div>

            <div className="ara-grid">
              {cats.map((c) => {
                const categoryKey = String(c.slug || c.name).toLowerCase().replace(/-/g, ' ').trim();
                const categoryProduct = products.find((product) => String(product.category || '').toLowerCase().replace(/-/g, ' ').trim() === categoryKey && product.image);
                const categoryFallback = categoryProduct?.image || '';
                const categorySource = c.image || categoryFallback || (isSkin
                  ? 'https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=800&q=80'
                  : 'https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?auto=format&fit=crop&w=800&q=80');
                return (
                  <div className="ara-card" key={c.slug} onClick={() => go('shop/' + c.slug)}>
                    <div className="ara-card-visual">
                      <img
                        className="ara-card-img"
                        src={categorySource}
                        alt={tr(c.name, language)}
                        loading="lazy"
                        decoding="async"
                        onError={(e: any) => {
                          const fallbackUrl = categoryFallback ? new URL(categoryFallback, window.location.href).href : '';
                          if (fallbackUrl && e.currentTarget.src !== fallbackUrl) e.currentTarget.src = categoryFallback;
                          else {
                            e.currentTarget.style.display = 'none';
                            e.currentTarget.parentElement?.classList.add('image-unavailable');
                          }
                        }}
                      />
                      <div className="ara-card-overlay" />
                      <div className="ara-card-frame" />
                      <div className="ara-card-corners" />
                      <div className="ara-card-content">
                        <span className="ara-card-kicker">{tr(isSkin ? 'SKINCARE & BEAUTY' : 'COLLECTION', language)}</span>
                        <h3 className="ara-card-label">{tr(c.name, language)}</h3>
                        <span className="ara-card-cta">{tr('EXPLORE →', language)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}
      

      {/* 3. FRAMED INTRO BOX */}
      {false && <section className="tabaya-intro">
        <div className="tabaya-intro__frame">
          <h2 className="tabaya-intro__title">
            {homeText('introTitle', isSkin ? 'Skincare & Self-Care, Carefully Curated' : 'Lifestyle Watches, Sunglasses & Gifts')}
          </h2>
          <p className="tabaya-intro__desc">
            {homeText('introDescription', isSkin
              ? 'Explore skincare, beauty, and self-care products from a range of brands. Review each product listing and package for ingredients and directions. Cash on delivery across Bangladesh.'
              : 'Browse watches, sunglasses, and gift boxes selected for everyday use and gifting. Check each product listing for available details. Cash on delivery across Bangladesh.')}
          </p>
        </div>
      </section>}
      

      {/* 4. HOMEPAGE CATEGORY SHELVES & FLASH SALE */}
      {shelfSections.length > 0 ? (
        <>
          {shelfSections.map((section: any, idx: number) => {
            let shelfProducts: Product[] = [];
            if (Array.isArray(section.productIds) && section.productIds.length > 0) {
              shelfProducts = products.filter(p => !p.adult && section.productIds.includes(String(p.id)));
            } else if (section.isFlashSale) {
              const saleList = products.filter(p => !p.adult && ((p.compareAt && p.compareAt > p.price) || p.tag === 'sale' || (section.category && section.category !== 'all' && section.category !== 'flash-sale' && p.category === section.category)));
              shelfProducts = saleList.length > 0 ? saleList : products.filter(p => !p.adult);
            } else if (section.category === 'all') {
              shelfProducts = products.filter(p => !p.adult);
            } else {
              const catTarget = String(section.category || '').toLowerCase().replace(/-/g, ' ').trim();
              const matched = products.filter(p => !p.adult && String(p.category || '').toLowerCase().replace(/-/g, ' ').trim() === catTarget);
              shelfProducts = matched;
            }

            const limit = Math.max(1, Number(section.count) || 8);
            const displayProducts = shelfProducts.slice(0, limit);

            if ((loaded || products.length > 0) && displayProducts.length === 0) return null;
            if (!loaded && products.length === 0 && idx > 1) return null;

            return (
              <section className="metro-shelf-section" key={section.id || `shelf-${section.category}-${idx}`}>
                <div className="wrap">
                  <div className="metro-shelf-top">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                      <h2 className="metro-shelf-title">{tr(section.title, language)}</h2>
                      {section.isFlashSale && <FlashSaleCountdown />}
                    </div>
                    <button
                      type="button"
                      className="metro-shelf-btn-more"
                      onClick={() => go(section.category && section.category !== 'all' && section.category !== 'flash-sale' ? 'shop/' + section.category : 'shop')}
                    >
                      {tr(section.buttonText || 'View More', language)} →
                    </button>
                  </div>
                  <div className="pc-grid">
                    {!loaded
                      ? [0, 1, 2, 3].map((i) => <SkeletonCard key={i} />)
                      : displayProducts.map((p) => <ProductCard key={p.id} p={p} />)}
                  </div>
                </div>
              </section>
            );
          })}

          {products.length > 0 && (
            <div style={{ textAlign: 'center', marginTop: 32, marginBottom: 20 }}>
              <button
                className="tabaya-btn primary"
                style={{ padding: '14px 34px', fontSize: 12, letterSpacing: '2.5px' }}
                onClick={() => go('shop')}
              >
                {language === 'bn' ? `সব পণ্য দেখুন (${products.length}) →` : `VIEW ALL PRODUCTS (${products.length}) →`}
              </button>
            </div>
          )}
        </>
      ) : (
        visibleSections.featured !== false && (
          <section className="pc-stage">
            <div className="wrap">
              <div className="pc-section-header">
                <p className="pc-section-kicker">
                  {homeText('featuredEyebrow', isSkin ? 'CURATED SKINCARE & BEAUTY' : 'CURATED LIFESTYLE & GIFTS')}
                </p>
                <h2 className="pc-section-title">
                  {homeText('featuredTitle', isSkin ? 'Skincare & Beauty Picks' : 'Trending & Best Sellers')}
                </h2>
                <p className="pc-section-subtitle">
                  {homeText('featuredDescription', isSkin
                    ? 'Explore skincare, beauty, and personal care products from a range of brands.'
                    : 'Explore watches, sunglasses, gift boxes, and lifestyle essentials with nationwide doorstep delivery.')}
                </p>
              </div>
              <div className="pc-grid">
                {!loaded
                  ? [0, 1, 2, 3, 4, 5, 6, 7].map((i) => <SkeletonCard key={i} />)
                  : filteredBest.slice(0, 24).map((p) => <ProductCard key={p.id} p={p} />)}
              </div>
            </div>
          </section>
        )
      )}
      

      {/* 5. BRAND PILLARS (feature-section) */}
      {visibleSections.benefits !== false && <section className="feature-section">
        <div className="wrap">
          <div className="feature-grid">
            <div className="feature-item">
              <div className="feature-icon">🚚</div>
              <h3>{tr('Cash on Delivery Nationwide', language)}</h3>
              <p>{tr('Parcel inspection depends on the courier’s policy. Contact us before ordering if inspection is important to you.', language)}</p>
            </div>
            <div className="feature-item">
              <div className="feature-icon">{isSkin ? '🌿' : '🛡️'}</div>
              <h3>{tr(isSkin ? 'Ingredients & Product Information' : 'Curated Lifestyle Essentials', language)}</h3>
              <p>
                {tr(isSkin
                  ? 'Review ingredients and directions on each product page. Patch test before first use.'
                  : 'Carefully selected watches, sunglasses, and gifts for everyday style.', language)}
              </p>
            </div>
            <div className="feature-item">
              <div className="feature-icon">📦</div>
              <h3>{tr('Discreet & Secure Packaging', language)}</h3>
              <p>{tr('Every order is wrapped with utmost care to ensure pristine arrival.', language)}</p>
            </div>
            <div className="feature-item">
              <div className="feature-icon">💬</div>
              <h3>{tr('Product Help & Customer Support', language)}</h3>
              <p>
                {tr('Questions about a product listing or order? Contact our customer support on WhatsApp.', language)}
              </p>
            </div>
          </div>
        </div>
      </section>}

      {/* 6. FAQ SECTION (faq-section) */}
      {visibleSections.faq !== false && <section className="faq-section">
        <div className="faq-wrapper">
          {/* Left Column: Rotated Vertical Text + Editorial Photo */}
          <div className="faq-left">
            <div className="faq-vertical-title">
              {tr('FREQUENTLY ASKED QUESTIONS', language)}
            </div>
            <div className="faq-image-box">
              <img
                src={isSkin
                  ? 'https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=800&q=80'
                  : 'https://images.unsplash.com/photo-1515372039744-b8f02a3ae446?auto=format&fit=crop&w=800&q=80'}
                alt={isSkin ? 'Skincare FAQs' : 'Lifestyle & Gift FAQs'}
              />
            </div>
          </div>

          {/* Right Column: Interactive Accordion */}
          <div className="faq-right">
            {faqs.map((f, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div className="faq-item" key={idx}>
                  <button
                    className="faq-question"
                    onClick={() => setOpenFaq(isOpen ? null : idx)}
                    aria-expanded={isOpen}
                  >
                    <span>{tr(f.q, language)}</span>
                    <span className="faq-icon">{isOpen ? '−' : '+'}</span>
                  </button>
                  {isOpen && (
                    <div className="faq-answer">
                      {tr(f.a, language)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>}
      

      {/* 7. VIP NEWSLETTER */}
      {visibleSections.newsletter !== false && <section className="tabaya-sec-newsletter">
        <div className="wrap">
          <div className="tabaya-news-card">
            <span className="tabaya-sec-subtitle" style={{ color: '#b48e4c' }}>
              {homeText('newsletterEyebrow', isSkin ? 'EXCLUSIVE OFFERS & SKINCARE LAUNCHES' : 'EXCLUSIVE OFFERS & NEW ARRIVALS')}
            </span>
            <h2 className="serif" style={{ fontSize: 'clamp(24px, 3.2vw, 36px)', margin: '10px 0' }}>
              {homeText('newsletterTitle', isSkin ? 'Be the First to Experience New Skincare Drops' : 'Be the First to Experience New Collections')}
            </h2>
            <p style={{ color: '#9ca3af', maxWidth: 480, margin: '0 auto 20px', fontSize: 14 }}>
              {homeText('newsletterDescription', isSkin
                ? 'Join our VIP circle for store updates, new arrivals, and special member discounts.'
                : 'Join our exclusive VIP circle to receive private sale previews, early access to new arrivals, and special member discounts.')}
            </p>
            {subbed ? (
              <div style={{ color: '#10b981', fontWeight: 700, fontSize: 16 }}>
                {isSkin ? '✓ Thank you! You have been subscribed to SECRATE VIP Club.' : '✓ Thank you! You have been subscribed to the METRROMA VIP Club.'}
              </div>
            ) : (
              <form
                className="tabaya-news-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const val = subEmail.trim();
                  const cleanPhone = val.replace(/\D/g, '').slice(-11);
                  if (/^01[3-9]\d{8}$/.test(cleanPhone)) {
                    openAuth();
                    return;
                  }
                  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(val)) {
                    try { localStorage.setItem('tabaya_sub', val); } catch {}
                    try { dl({ event: 'generate_lead', lead_type: 'newsletter' }); } catch {}
                    setSubbed(true);
                  }
                }}
              >
                <input
                  type="text"
                  required
                  placeholder={tr('Enter your mobile number or email', language)}
                  value={subEmail}
                  onChange={(e) => setSubEmail(e.target.value)}
                />
                <button type="submit">{tr('Join Now →', language)}</button>
              </form>
            )}
          </div>
        </div>
      </section>}
      
      <QuickViewModal product={quickViewProduct} onClose={() => setQuickViewProduct(null)} />
    </div>
  );
}
export function Shop({ category }: { category: string }) {
  const language = useStoreLanguage();
  const { ok, confirm } = useAge();
  const [cats, setCats] = useState<Category[]>(() => getCachedCategories());
  const [products, setProducts] = useState<Product[]>(() => {
    const all = getCachedProducts();
    if (!category) return all;
    return all.filter((p) => p.category === category);
  });
  const [loaded, setLoaded] = useState(() => (getCachedProducts()?.length ?? 0) > 0);
  const isSkin = isSkincareSite();

  useEffect(() => { getCategories().then(setCats).catch(() => {}); }, []);
  useEffect(() => {
    setLoaded(false);
    getProducts(category || undefined).then((d) => { setProducts(d); setLoaded(true); }).catch(() => setLoaded(true));
  }, [category]);

  const activeCat = cats.find((c) => c.slug === category);
  if (activeCat?.adult && !ok) return <div className="page"><AgeGate onConfirm={confirm} /></div>;
  const visible = products.filter((p) => ok || !p.adult);

  return (
    <div className="page" style={{ background: '#f3f0ec', minHeight: '100vh', paddingTop: '30px', paddingBottom: '60px' }}>
      <div className="wrap" style={{ maxWidth: 1300 }}>
        <div className="phead" style={{ textAlign: 'center', padding: '30px 0 20px' }}>
          <p className="pc-section-kicker">
            {tr(isSkin ? 'SKINCARE & SELF-CARE PICKS' : 'METRROMA CURATED LINEUP', language)}
          </p>
          <h1 className="pc-section-title">
            {activeCat ? tr(activeCat.name, language) : tr(isSkin ? 'All Skincare & Essentials' : 'All Collections', language)}
          </h1>
          <p className="pc-section-subtitle">
            {activeCat ? activeCat.blurb : tr(isSkin
              ? 'Browse skincare and personal care products by category. Check product pages for ingredients and usage directions.'
              : 'Explore watches, sunglasses, and gift boxes selected for modern everyday life.', language)}
          </p>
        </div>

        {/* Filter chips */}
        <div className="pfilter tabaya-pfilter">
          <span
            className={'chip' + (!category ? ' on' : '')}
            onClick={() => go('shop')}
            style={{
              padding: '9px 20px',
              border: !category ? '1px solid #1f3147' : '1px solid rgba(180, 150, 100, 0.45)',
              background: !category ? '#1f3147' : '#FAF8F5',
              color: !category ? '#FAF8F5' : '#1f3147',
              fontFamily: "'Inter', sans-serif",
              fontWeight: 500,
              fontSize: 12,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              transition: 'all 0.25s',
            }}
          >
            {tr('All Products', language)} ({products.length})
          </span>
          {cats.map((c) => (
            <span
              key={c.slug}
              className={'chip' + (category === c.slug ? ' on' : '')}
              onClick={() => go('shop/' + c.slug)}
              style={{
                padding: '9px 20px',
                border: category === c.slug ? '1px solid #1f3147' : '1px solid rgba(180, 150, 100, 0.45)',
                background: category === c.slug ? '#1f3147' : '#FAF8F5',
                color: category === c.slug ? '#FAF8F5' : '#1f3147',
                fontFamily: "'Inter', sans-serif",
                fontWeight: 500,
                fontSize: 12,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                transition: 'all 0.25s',
              }}
            >
              {tr(c.name, language)}
            </span>
          ))}
        </div>

        {!loaded ? (
          <div className="pc-grid">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <SkeletonCard key={i} />)}
          </div>
        ) : (
          <>
            <div className="pc-grid">
              {visible.map((p) => <ProductCard key={p.id} p={p} />)}
            </div>
            {visible.length === 0 && (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: '#6b645c' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📦</div>
                <h3 style={{ fontSize: 20, color: '#1f3147', fontFamily: "'Playfair Display', Georgia, serif" }}>{tr('No products found in this collection', language)}</h3>
                <p style={{ fontSize: 14, marginTop: 4 }}>{tr('New pieces will be added shortly.', language)}</p>
                <button className="tabaya-btn primary" style={{ marginTop: 16 }} onClick={() => go('shop')}>{tr('View All Collections', language)}</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function ProductPage({ slug }: { slug: string }) {
  const language = useStoreLanguage();
  const { ok, confirm } = useAge();
  const { add, setOpen } = useCart();
  const [p, setP] = useState<Product | null>(() => getCachedProduct(slug));
  const [err, setErr] = useState(false);
  const [gi, setGi] = useState(0);
  const [qty, setQty] = useState(1);
  const [showBar, setShowBar] = useState(false);
  const [selVar, setSelVar] = useState<any>(null);
  const [selectedColor, setSelectedColor] = useState<string>('');
  const [selectedSize, setSelectedSize] = useState<string>('');
  const [activeAcc, setActiveAcc] = useState<string>('');
  const [pdpTab, setPdpTab] = useState<'desc' | 'specs' | 'size' | 'delivery' | 'care'>('desc');
  const [waNum, setWaNum] = useState('');
  const [settings, setSettings] = useState<Settings | null>(null);
  const [revData, setRevData] = useState<{ count: number; avg: number; reviews: Review[] }>({ count: 0, avg: 0, reviews: [] });
  const detailsSectionRef = useRef<HTMLDivElement>(null);
  const pimgRef = useRef<HTMLImageElement>(null);
  const isSkin = isSkincareSite();

  useEffect(() => {
    getSettings().then((s) => {
      setSettings(s);
      if (s.whatsapp || s.phone) setWaNum(s.whatsapp || s.phone);
    }).catch(() => {});
  }, []);

  const scrollToTab = (tab: 'desc' | 'specs' | 'size' | 'delivery' | 'care') => {
    setPdpTab(tab);
    if (detailsSectionRef.current) {
      detailsSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const isApparel = useMemo(() => (p ? isUndergarmentOrApparel(p) : false), [p]);
  const isIntimate = useMemo(() => {
    if (!p) return false;
    const str = `${p.category || ''} ${p.slug || ''} ${p.name || ''}`.toLowerCase();
    return /intim|bra|panty|lingerie|undergarment|shaper|wellness|boxer/i.test(str);
  }, [p]);
  const productColors = useMemo(() => (p ? getProductColors(p) : []), [p]);
  const productSizes = useMemo(() => (p ? getProductSizes(p) : []), [p]);
  const gallery = useMemo(() => {
    const list: string[] = [];
    if (p?.images && p.images.length) {
      p.images.forEach((img) => { if (img && !list.includes(img)) list.push(img); });
    } else if (p?.image) {
      list.push(p.image);
    }
    // Include all color images
    if (p?.colors && Array.isArray(p.colors)) {
      p.colors.forEach((c: any) => {
        if (c && typeof c === 'object' && c.image && !list.includes(c.image)) list.push(c.image);
      });
    }
    // Include all variation images
    if (p?.variations && Array.isArray(p.variations)) {
      p.variations.forEach((v: any) => {
        if (v && v.image && !list.includes(v.image)) list.push(v.image);
      });
    }
    return list;
  }, [p]);

  useEffect(() => {
    setP(null); setErr(false); setGi(0); setQty(1); setSelVar(null);
    setSelectedColor(''); setSelectedSize('');
    setRevData({ count: 0, avg: 0, reviews: [] });
    getProduct(slug).then((pr) => {
      setP(pr);
      fetchReviews(pr.id).then(setRevData).catch(() => {});
      const cols = getProductColors(pr);
      const initCol = cols[0]?.name || pr.variations?.find((v: any) => v.color)?.color || '';
      setSelectedColor(initCol);

      const szs = getProductSizes(pr);
      const initSz = szs[0] || pr.variations?.find((v: any) => v.size)?.size || '';
      setSelectedSize(initSz);

      if (pr.variations && pr.variations.length > 0) {
        const found = pr.variations.find((v: any) =>
          (!initCol || v.color === initCol) && (!initSz || v.size === initSz)
        ) || pr.variations[0];
        setSelVar(found);
      }
      const pTitle = `${pr.name} — ${isSkin ? 'SECRATE' : 'METRROMA'}`;
      document.title = pTitle;
      if (!import.meta.env.DEV) {
        const q = new URLSearchParams(location.search);
        dl({
          event: 'page_view',
          page_location: location.href,
          page_path: location.pathname + location.search,
          page_title: pTitle,
          campaign_source: q.get('utm_source') || (q.get('fbclid') ? 'facebook' : undefined),
          campaign_medium: q.get('utm_medium') || (q.get('fbclid') ? 'paid' : undefined),
          campaign_name: q.get('utm_campaign') || undefined,
        });
        ecView({ id: pr.id, name: pr.name, price: pr.price });
      }
    }).catch(() => setErr(true));
  }, [slug]);

  // Dynamic Photo Switching: Switches the gallery photo according to selected color & size
  useEffect(() => {
    if (!p) return;

    // 1. Try matching variation's specific photo
    if (p.variations && p.variations.length > 0) {
      const match = p.variations.find((v: any) =>
        (!selectedColor || v.color?.toLowerCase() === selectedColor.toLowerCase()) &&
        (!selectedSize || v.size === selectedSize)
      );
      if (match) {
        setSelVar(match);
        if (match.image && gallery.length > 0) {
          const idx = gallery.findIndex((g) => g === match.image);
          if (idx >= 0) { setGi(idx); return; }
        }
      }
    }

    // 2. Fallback to color's specific photo
    if (selectedColor && productColors.length > 0) {
      const colObj = productColors.find((c) => c.name.toLowerCase() === selectedColor.toLowerCase());
      const colImg = colObj?.image || p.variations?.find((v: any) => v.color?.toLowerCase() === selectedColor.toLowerCase() && v.image)?.image;
      if (colImg && gallery.length > 0) {
        const idx = gallery.findIndex((g) => g === colImg);
        if (idx >= 0) { setGi(idx); return; }
      }
    }
  }, [selectedColor, selectedSize, p, productColors, gallery]);

  useEffect(() => {
    const h = () => setShowBar(scrollY > 480);
    addEventListener('scroll', h, { passive: true });
    h();
    return () => removeEventListener('scroll', h);
  }, [slug]);

  if (err) return <div className="page"><div className="wrap"><p className="empty">Product not found.</p></div></div>;
  if (!p) return (
    <div className="page">
      <div className="wrap pd-loading-grid" role="status" aria-live="polite" aria-label="Loading product details">
        <div className="skel pd-loading-image" />
        <div className="pd-loading-copy">
          <div className="skel skline" />
          <div className="skel skline pd-loading-title" />
          <div className="skel skline" />
          <div className="skel skline sh" />
          <div className="skel pd-loading-buy" />
          <span>Preparing product details…</span>
        </div>
      </div>
    </div>
  );
  if (p.adult && !ok) return <div className="page"><AgeGate onConfirm={confirm} /></div>;

  const currentPrice = selVar?.price ?? p.price;
  const currentCompareAt = selVar?.compareAt ?? p.compareAt;
  const onSale = !!currentCompareAt && currentCompareAt > currentPrice;
  const salePercent = onSale ? Math.round((1 - currentPrice / currentCompareAt!) * 100) : 0;

  const handleAddToCart = () => {
    const variantDesc = [selectedColor ? `Color: ${selectedColor}` : '', selectedSize ? `Size: ${selectedSize}` : ''].filter(Boolean).join(' · ');
    const itemToAdd = {
      ...p,
      price: currentPrice,
      size: selectedSize,
      color: selectedColor,
      name: variantDesc ? `${p.name} (${variantDesc})` : (selVar ? `${p.name} (${selVar.title})` : p.name),
      variantId: selVar?.id,
    };
    add(itemToAdd as any, qty);
    flyToBag(pimgRef.current);
  };

  const handleDirectBuy = () => {
    const variantDesc = [selectedColor ? `Color: ${selectedColor}` : '', selectedSize ? `Size: ${selectedSize}` : ''].filter(Boolean).join(' · ');
    const itemToAdd = {
      ...p,
      price: currentPrice,
      size: selectedSize,
      color: selectedColor,
      name: variantDesc ? `${p.name} (${variantDesc})` : (selVar ? `${p.name} (${selVar.title})` : p.name),
      variantId: selVar?.id,
    };
    add(itemToAdd as any, qty);
    setOpen(false);
    go('checkout');
  };

  return (
    <div className="page tabaya-pdp-wrap" style={{ background: '#f3f0ec', minHeight: '100vh', paddingTop: '30px', paddingBottom: '60px' }}>
      <div className="wrap" style={{ maxWidth: 1200 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#8c7d6b', marginBottom: 20, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          <span style={{ cursor: 'pointer' }} onClick={() => go('home')}>Home</span>
          <span>/</span>
          <span style={{ cursor: 'pointer' }} onClick={() => go('shop')}>Collections</span>
          <span>/</span>
          <span style={{ color: '#1f3147', fontWeight: 600 }}>{p.name}</span>
        </div>

        <div className="pd" style={{ background: '#FAF8F5', borderRadius: 0, padding: '36px 30px', border: '1px solid rgba(180, 150, 100, 0.35)', position: 'relative' }}>
          {/* Decorative Corner Marks */}
          <div className="pc-corner-tr" />
          <div className="pc-corner-bl" />

          {/* Left: Gallery */}
          <div>
            <div className="pimg" style={{ overflow: 'hidden', border: '1px solid rgba(180, 150, 100, 0.25)', background: '#EDE9E3', position: 'relative' }}>
              <img ref={pimgRef} key={gi} className="pdimg-fade" src={gallery[gi] || p.image} alt={p.name} onError={(e: any) => { e.currentTarget.style.display = 'none'; e.currentTarget.parentElement?.classList.add('image-unavailable'); }} />
            </div>

            {gallery.length > 1 && (
              <div className="thumbs" style={{ marginTop: 14, display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 6 }}>
                {gallery.map((im, i) => (
                  <button
                    key={i}
                    className={'thumb' + (i === gi ? ' on' : '')}
                    onClick={() => setGi(i)}
                    style={{ width: 72, height: 90, overflow: 'hidden', border: i === gi ? '2px solid #b48e4c' : '1px solid rgba(180, 150, 100, 0.3)', background: '#FAF8F5', cursor: 'pointer', padding: 0 }}
                  >
                    <img src={im} alt={`${p.name} view ${i + 1}`} onError={(e: any) => { e.currentTarget.closest('button')?.remove(); }} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right: Info & Actions */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="pc-eyebrow">
                {p.category ? p.category.replace(/-/g, ' ').toUpperCase() : 'SKINCARE & SELF-CARE'}
              </span>
              {p.sku && <span style={{ fontSize: 11, color: '#9a7030', letterSpacing: '1px' }}>SKU: {p.sku}</span>}
            </div>

            <h1 className="serif" style={{ fontSize: 'clamp(26px, 3.2vw, 38px)', fontWeight: 500, color: '#1f3147', margin: '8px 0 12px', lineHeight: 1.2 }}>
              {p.name}
            </h1>
            {(onSale || p.tag || p.isDigital) && <div className="pdp-product-flags">
              {onSale && <span className="pdp-sale-flag">{language === 'bn' ? `${salePercent}% ছাড়` : `-${salePercent}% OFF`}</span>}
              {p.isDigital ? <span className="pdp-note-flag">⚡ Digital · ৳0 delivery</span> : p.tag ? <span className="pdp-note-flag">{p.tag}</span> : null}
            </div>}

            {/* Real Reviews & Stock Status */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
              {revData.count > 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: '#b48e4c', fontSize: 14 }}>
                    {'★'.repeat(Math.min(5, Math.max(1, Math.round(revData.avg))))}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#1f3147' }}>
                    {revData.avg.toFixed(1)}
                  </span>
                  <span style={{ fontSize: 12.5, color: '#6b645c' }}>
                    ({revData.count} {tr(revData.count === 1 ? 'Customer Review' : 'Customer Reviews', language)})
                  </span>
                </div>
              ) : (
                <span style={{ fontSize: 12.5, fontWeight: 500, color: '#6b645c' }}>
                  {tr('Product Details Available', language)}
                </span>
              )}
              <span style={{ color: p.soldOut ? '#dc2626' : '#15803d', fontSize: 11, fontWeight: 600, background: p.soldOut ? 'rgba(220,38,38,0.08)' : 'rgba(21,128,61,0.08)', padding: '2px 8px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                {tr(p.soldOut ? 'Sold Out' : 'In Stock', language)}
              </span>
            </div>

            {p.isDigital && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 6, marginBottom: 14 }}>
                <span style={{ fontSize: 16 }}>⚡</span>
                <div style={{ fontSize: 12.5, color: '#065f46', fontWeight: 600 }}>
                  {tr('Digital product · Delivery details in listing', language)}
                </div>
              </div>
            )}

            {/* Price block */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, padding: '16px 20px', background: '#f3f0ec', border: '1px solid rgba(180, 150, 100, 0.25)', marginBottom: 22 }}>
              <span style={{ fontSize: 28, fontWeight: 700, color: '#1f3147', fontFamily: "'Inter', sans-serif", letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>{taka(currentPrice)}</span>
              {onSale && (
                <>
                  <s style={{ fontSize: 16, color: '#8c7d6b', fontWeight: 400, fontFamily: "'Inter', sans-serif", fontVariantNumeric: 'tabular-nums' }}>{taka(currentCompareAt!)}</s>
                  <span className="pc-badge-save" style={{ position: 'static' }}>
                    {tr('Save', language)} {taka(currentCompareAt! - currentPrice)}
                  </span>
                </>
              )}
            </div>

            {/* Product Overview Summary & Jump to Full Description */}
            <div style={{ marginBottom: 22, padding: '14px 18px', background: '#f8f6f2', borderLeft: '3px solid #b48e4c', borderRight: '1px solid rgba(180, 150, 100, 0.25)', borderTop: '1px solid rgba(180, 150, 100, 0.25)', borderBottom: '1px solid rgba(180, 150, 100, 0.25)', borderRadius: 6 }}>
              <div
                className="product-rich-desc"
                style={{ fontSize: 13.5, color: '#4b5563', lineHeight: 1.65, margin: '0 0 10px' }}
                dangerouslySetInnerHTML={{ __html: formatProductDescription(p.shortDesc || p.desc) }}
              />
              <button
                type="button"
                onClick={() => scrollToTab('desc')}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#8B1E1E',
                  cursor: 'pointer',
                  letterSpacing: '0.04em',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  textDecoration: 'underline',
                  textUnderlineOffset: 3
                }}
              >
                <span>📖 {tr(isSkin ? 'Read Full Description & Specifications ↓' : 'Read Full Description & Details ↓', language)}</span>
              </button>
            </div>

            {/* Color Swatch Selector */}
            {productColors.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 10 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#1f3147', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                    Color:
                  </label>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#8B1E1E' }}>
                    {selectedColor || productColors[0].name}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  {productColors.map((c) => {
                    const isSelected = (selectedColor || productColors[0].name) === c.name;
                    return (
                      <button
                        key={c.name}
                        type="button"
                        onClick={() => {
                          setSelectedColor(c.name);
                          if (c.image && gallery.length > 0) {
                            const idx = gallery.findIndex((g) => g === c.image);
                            if (idx >= 0) setGi(idx);
                          }
                        }}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '7px 14px',
                          borderRadius: 24,
                          border: isSelected ? '1.5px solid #8B1E1E' : '1px solid rgba(180, 150, 100, 0.35)',
                          background: isSelected ? '#FAF5F5' : '#FAF8F5',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                          boxShadow: isSelected ? '0 1px 4px rgba(139, 30, 30, 0.15)' : 'none'
                        }}
                      >
                        <span
                          style={{
                            width: 16,
                            height: 16,
                            borderRadius: '50%',
                            background: c.hex || getColorHex(c.name),
                            border: '1px solid rgba(0,0,0,0.18)',
                            display: 'inline-block',
                            flexShrink: 0
                          }}
                        />
                        <span style={{ fontSize: 12, fontWeight: isSelected ? 700 : 500, color: isSelected ? '#8B1E1E' : '#1f3147', letterSpacing: '0.04em' }}>
                          {c.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Size Selector */}
            {productSizes.length > 0 && (
              <div style={{ marginBottom: 22 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#1f3147', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                      {isApparel ? 'Select Size & Fit:' : 'Select Volume / Net Wt:'}
                    </label>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#1f3147' }}>
                      {selectedSize || productSizes[0]}
                    </span>
                  </div>
                  {isApparel && (
                    <button
                      type="button"
                      onClick={() => scrollToTab('size')}
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        fontSize: 11.5,
                        color: '#9a7030',
                        cursor: 'pointer',
                        fontWeight: 600,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        textDecoration: 'underline',
                        textUnderlineOffset: 3
                      }}
                    >
                      📏 Size Chart & Fit Guide
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {productSizes.map((sz) => {
                    const isSelected = (selectedSize || productSizes[0]) === sz;
                    return (
                      <button
                        key={sz}
                        type="button"
                        onClick={() => setSelectedSize(sz)}
                        style={{
                          padding: isVolumeSize(sz) ? '8px 16px' : '10px 20px',
                          minWidth: 54,
                          textAlign: 'center',
                          border: isSelected ? '1px solid #1f3147' : '1px solid rgba(180, 150, 100, 0.45)',
                          background: isSelected ? '#1f3147' : '#FAF8F5',
                          color: isSelected ? '#FAF8F5' : '#1f3147',
                          fontWeight: 600,
                          fontSize: 12,
                          letterSpacing: '0.06em',
                          cursor: 'pointer',
                          transition: 'all 0.25s',
                        }}
                      >
                        {sz}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Quantity & CTA */}
            {p.soldOut ? (
              <div style={{ marginTop: 24 }}>
                <button className="pc-checkout-btn" disabled style={{ width: '100%', opacity: 0.6 }}>{tr('SOLD OUT (RESTOCKING SOON)', language)}</button>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#1f3147', letterSpacing: '0.12em', textTransform: 'uppercase' }}>{tr('Quantity:', language)}</span>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <button className="pc-qty-btn" onClick={() => setQty((q) => Math.max(1, q - 1))}>−</button>
                    <span className="pc-qty-num" style={{ width: 40 }}>{qty}</span>
                    <button className="pc-qty-btn" onClick={() => setQty((q) => Math.min(20, q + 1))}>+</button>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <button
                    className="pc-cta"
                    onClick={handleDirectBuy}
                    style={{ width: '100%', padding: '16px 24px', fontSize: 12, letterSpacing: '0.22em' }}
                  >
                    <span>{tr('ORDER NOW', language)}</span>
                  </button>
                  <button
                    className="tabaya-btn outline"
                    onClick={handleAddToCart}
                    style={{
                      border: '1px solid #1f3147',
                      color: '#1f3147',
                      background: 'transparent',
                      padding: '14px 24px',
                      fontSize: 12,
                      letterSpacing: '0.18em',
                      textTransform: 'uppercase',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {tr('+ ADD TO SHOPPING BAG', language)}
                  </button>
                  {waNum && (
                    <a
                      href={`https://wa.me/${waNum}?text=${encodeURIComponent(`Hello! I want to order "${p.name}" (Price: ${taka(currentPrice)}).`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        background: '#25D366',
                        color: '#fff',
                        padding: '13px 20px',
                        fontSize: 12,
                        letterSpacing: '0.14em',
                        textTransform: 'uppercase',
                        fontWeight: 700,
                        textDecoration: 'none',
                        cursor: 'pointer',
                        borderRadius: 2,
                        boxShadow: '0 2px 8px rgba(37,211,102,0.25)',
                      }}
                    >
                      <WhatsAppIcon size={18} variant="official" />
                      <span>{tr('ORDER VIA WHATSAPP', language)}</span>
                    </a>
                  )}
                </div>
              </>
            )}

            {/* Trust Badges */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 26, padding: '18px', background: '#f3f0ec', border: '1px solid rgba(180, 150, 100, 0.25)', fontSize: 12, color: '#6b645c' }}>
              <div>{tr('🚚 Express Delivery Nationwide', language)}</div>
              <div>{tr('💵 Cash on Delivery at Doorstep', language)}</div>
              <div>{tr('Product Details Available', language)}</div>
              <div>{tr('🔄 7-Day Easy Exchange Policy', language)}</div>
            </div>

            {/* Tabaya Style Accordions */}
            <div style={{ marginTop: 24, borderTop: '1px solid #ede8e3' }}>
              {/* Accordion 1: Details */}
              <div style={{ borderBottom: '1px solid #ede8e3' }}>
                <div
                  onClick={() => setActiveAcc(activeAcc === 'desc' ? '' : 'desc')}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', cursor: 'pointer', fontWeight: 700, fontSize: 14, color: '#111827' }}
                >
                  <span>{isSkin ? '📋 Skincare Details & Formulation' : (isApparel ? '📋 Product Details & Fabric' : '📋 Product Details & Specifications')}</span>
                  <span>{activeAcc === 'desc' ? '−' : '+'}</span>
                </div>
                {activeAcc === 'desc' && (
                  <div style={{ paddingBottom: 16, fontSize: 14, color: '#4b5563', lineHeight: 1.75 }} className="product-rich-desc">
                    <div dangerouslySetInnerHTML={{ __html: formatProductDescription(p.longDesc || p.desc) }} />
                    <ul style={{ paddingLeft: 20, marginTop: 14 }}>
                      {isSkin ? (
                        <>
                          <li>Review the product listing and package for ingredients</li>
                          <li>Follow the usage directions provided by the product brand</li>
                          <li>Individual skin suitability can vary</li>
                        </>
                      ) : isApparel ? (
                        <>
                          <li>Premium breathable, luxuriously soft fabric</li>
                          <li>Resistant to color fading and wrinkling</li>
                          <li>Perfect for both everyday elegance and special occasions</li>
                        </>
                      ) : (
                        <>
                          <li>Product information is shown on each item page</li>
                          <li>Fast nationwide home delivery with cash on delivery</li>
                          <li>Check parcel upon delivery before making payment</li>
                        </>
                      )}
                    </ul>
                    <button
                      type="button"
                      onClick={() => scrollToTab('desc')}
                      style={{
                        marginTop: 14,
                        background: '#1f3147',
                        color: '#FAF8F5',
                        border: 'none',
                        padding: '9px 18px',
                        fontSize: 11,
                        letterSpacing: '1px',
                        textTransform: 'uppercase',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6
                      }}
                    >
                      <span>{isSkin ? 'View Complete Information Below ↓' : 'View Complete Specifications Below ↓'}</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Accordion 2: Delivery & Return */}
              <div style={{ borderBottom: '1px solid #ede8e3' }}>
                <div
                  onClick={() => setActiveAcc(activeAcc === 'del' ? '' : 'del')}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', cursor: 'pointer', fontWeight: 700, fontSize: 14, color: '#111827' }}
                >
                  <span>🚚 Delivery & Return Policy</span>
                  <span>{activeAcc === 'del' ? '−' : '+'}</span>
                </div>
                {activeAcc === 'del' && (
                  <div style={{ paddingBottom: 16, fontSize: 13.5, color: '#4b5563', lineHeight: 1.6 }}>
                    <p><b>Inside Dhaka:</b> Delivered in 1–2 business days. Delivery fee {settings ? taka(settings.deliveryInside) : '৳80'}.</p>
                    <p style={{ marginTop: 4 }}><b>Outside Dhaka:</b> Delivered in 2–3 business days. Delivery fee {settings ? taka(settings.deliveryOutside) : '৳130'}.</p>
                    <p style={{ marginTop: 6 }}>{tr('Parcel inspection follows the courier policy. Report transit damage to customer support promptly; requests are handled under the published returns policy.', language)}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Full Product Details & Information Section (Tabaya Style) */}
        <div
          id="product-details-tabs"
          ref={detailsSectionRef}
          style={{
            marginTop: 40,
            background: '#FAF8F5',
            border: '1px solid rgba(180, 150, 100, 0.35)',
            position: 'relative',
            boxShadow: '0 4px 24px rgba(0,0,0,0.03)',
          }}
        >
          {/* Decorative Corner Marks */}
          <div className="pc-corner-tr" />
          <div className="pc-corner-bl" />

          {/* Section Heading */}
          <div style={{ textAlign: 'center', padding: '36px 20px 22px', borderBottom: '1px solid #EAE5DC' }}>
            <span className="pc-eyebrow" style={{ display: 'block', marginBottom: 8, letterSpacing: '3px' }}>
              {p.category ? p.category.toUpperCase().replace('-', ' ') : (isSkin ? 'SECRATE SKINCARE & SELF-CARE' : 'METRROMA LIFESTYLE & GIFTS')} • PRODUCT DETAILS
            </span>
            <h2 className="serif" style={{ fontSize: 'clamp(22px, 2.5vw, 32px)', color: '#1f3147', margin: 0, fontWeight: 500 }}>
              {isSkin ? 'Product Information & Details' : 'Product Information & Specifications'}
            </h2>
          </div>

          {/* Navigation Tabs */}
          <div className="tabaya-tab-bar">
            <button
              type="button"
              className={'tabaya-tab-btn' + (pdpTab === 'desc' ? ' active' : '')}
              onClick={() => setPdpTab('desc')}
            >
              Description
            </button>
            <button
              type="button"
              className={'tabaya-tab-btn' + (pdpTab === 'specs' ? ' active' : '')}
              onClick={() => setPdpTab('specs')}
            >
              Specifications
            </button>
            {isApparel && productSizes.length > 0 && (
              <button
                type="button"
                className={'tabaya-tab-btn' + (pdpTab === 'size' ? ' active' : '')}
                onClick={() => setPdpTab('size')}
              >
                Size Guide
              </button>
            )}
            <button
              type="button"
              className={'tabaya-tab-btn' + (pdpTab === 'delivery' ? ' active' : '')}
              onClick={() => setPdpTab('delivery')}
            >
              Shipping & Returns
            </button>
            <button
              type="button"
              className={'tabaya-tab-btn' + (pdpTab === 'care' ? ' active' : '')}
              onClick={() => setPdpTab('care')}
            >
              {p.isDigital ? 'Access & License' : p.category === 'watch' ? 'Watch Maintenance' : p.category === 'sunglass' ? 'Care & Handling' : isApparel ? 'Care & Washing' : 'How to Use & Store'}
            </button>
          </div>

          {/* Tab Content Body */}
          <div style={{ padding: '36px 30px' }}>
            {/* TAB 1: FULL DESCRIPTION */}
            {pdpTab === 'desc' && (
              <div>
                <div style={{ maxWidth: 840, margin: '0 auto' }}>
                  <h3 className="serif" style={{ fontSize: 24, color: '#1f3147', marginBottom: 18, fontWeight: 500 }}>
                    {p.name}
                  </h3>
                  <div
                    className="product-rich-desc"
                    style={{ fontSize: 15, color: '#374151', lineHeight: 1.85, marginBottom: 28 }}
                    dangerouslySetInnerHTML={{ __html: formatProductDescription(p.longDesc || p.desc) }}
                  />

                  {/* 4 Feature Highlights Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginTop: 24 }}>
                    {isApparel ? (
                      <>
                        <div className="tabaya-feature-card">
                          <span className="icon">💎</span>
                          <div>
                            <h4>Product & Fit Details</h4>
                            <p>Check the product listing for materials, sizing, and fit information.</p>
                          </div>
                        </div>
                        <div className="tabaya-feature-card">
                          <span className="icon">🛡️</span>
                          <div>
                            <h4>Discreet & Hygienic Packaging</h4>
                            <p>Check the product listing or contact customer support for packaging information.</p>
                          </div>
                        </div>
                        <div className="tabaya-feature-card">
                          <span className="icon">✨</span>
                          <div>
                            <h4>Care Information</h4>
                            <p>Follow the care instructions provided with the item.</p>
                          </div>
                        </div>
                        <div className="tabaya-feature-card">
                          <span className="icon">🚚</span>
                          <div>
                            <h4>Doorstep Cash on Delivery</h4>
                            <p>Pay cash when your parcel arrives, subject to the courier's delivery process.</p>
                          </div>
                        </div>
                      </>
                    ) : isSkin ? (
                      <>
                        <div className="tabaya-feature-card">
                          <span className="icon">🌿</span>
                          <div>
                            <h4>Ingredient Details on Product Pages</h4>
                            <p>Review ingredients and directions on each product page. Patch test before first use.</p>
                          </div>
                        </div>
                        <div className="tabaya-feature-card">
                          <span className="icon">✨</span>
                          <div>
                            <h4>Product Information</h4>
                            <p>Check the product page and package for ingredients, size, and usage directions.</p>
                          </div>
                        </div>
                        <div className="tabaya-feature-card">
                          <span className="icon">🛡️</span>
                          <div>
                            <h4>Packaging Details</h4>
                            <p>Refer to the product listing and package for packaging and storage information.</p>
                          </div>
                        </div>
                        <div className="tabaya-feature-card">
                          <span className="icon">🚚</span>
                          <div>
                            <h4>Doorstep Cash on Delivery</h4>
                            <p>Pay cash when your parcel arrives, subject to the courier's delivery process.</p>
                          </div>
                        </div>
                      </>
                    ) : p.category === 'sunglass' ? (
                      <>
                        <div className="tabaya-feature-card">
                          <span className="icon">🕶️</span>
                          <div>
                            <h4>Lens Information</h4>
                            <p>Check the product listing for lens type and UV protection details.</p>
                          </div>
                        </div>
                        <div className="tabaya-feature-card">
                          <span className="icon">💎</span>
                          <div>
                            <h4>Classic Everyday Style</h4>
                            <p>Review the listing for frame style and product details.</p>
                          </div>
                        </div>
                        <div className="tabaya-feature-card">
                          <span className="icon">🛡️</span>
                          <div>
                            <h4>Package Contents</h4>
                            <p>Check the product listing for included accessories.</p>
                          </div>
                        </div>
                        <div className="tabaya-feature-card">
                          <span className="icon">🚚</span>
                          <div>
                            <h4>Doorstep Cash on Delivery</h4>
                            <p>Pay cash when your parcel arrives, subject to the courier's delivery process.</p>
                          </div>
                        </div>
                      </>
                    ) : p.category === 'gift' ? (
                      <>
                        <div className="tabaya-feature-card">
                          <span className="icon">🎁</span>
                          <div>
                            <h4>Gift Set Details</h4>
                            <p>Check the product listing for included items and packaging.</p>
                          </div>
                        </div>
                        <div className="tabaya-feature-card">
                          <span className="icon">🌹</span>
                          <div>
                            <h4>Product Details</h4>
                            <p>Review the listing for materials and care information.</p>
                          </div>
                        </div>
                        <div className="tabaya-feature-card">
                          <span className="icon">💌</span>
                          <div>
                            <h4>Gift Options</h4>
                            <p>Check the product listing for available gift options.</p>
                          </div>
                        </div>
                        <div className="tabaya-feature-card">
                          <span className="icon">🚚</span>
                          <div>
                            <h4>Doorstep Cash on Delivery</h4>
                            <p>Pay cash when your parcel arrives, subject to the courier's delivery process.</p>
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="tabaya-feature-card">
                          <span className="icon">💎</span>
                          <div>
                            <h4>Product Details Available</h4>
                            <p>Refer to the product listing for item-specific details. Contact customer support if you have a question.</p>
                          </div>
                        </div>
                        <div className="tabaya-feature-card">
                          <span className="icon">🛡️</span>
                          <div>
                            <h4>Packaging Information</h4>
                            <p>Contact customer support if you need information about packaging.</p>
                          </div>
                        </div>
                        <div className="tabaya-feature-card">
                          <span className="icon">🔄</span>
                          <div>
                            <h4>Easy 7-Day Exchange Policy</h4>
                            <p>Dedicated customer support to assist with easy exchanges and hassle-free assistance.</p>
                          </div>
                        </div>
                        <div className="tabaya-feature-card">
                          <span className="icon">🚚</span>
                          <div>
                            <h4>Doorstep Cash on Delivery</h4>
                            <p>Pay cash when your parcel arrives, subject to the courier's delivery process.</p>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: SPECIFICATIONS */}
            {pdpTab === 'specs' && (
              <div style={{ maxWidth: 840, margin: '0 auto' }}>
                <div className="tabaya-table-wrap">
                  <table className="tabaya-spec-table">
                    <tbody>
                      <tr>
                        <th>Product Title</th>
                        <td>{p.name}</td>
                      </tr>
                      <tr>
                        <th>SKU Code</th>
                        <td>{p.sku || 'N/A'}</td>
                      </tr>
                      <tr>
                        <th>Collection / Category</th>
                        <td style={{ textTransform: 'capitalize' }}>{p.category ? p.category.replace(/-/g, ' ') : (isSkin ? 'Skincare & Self-Care' : 'Lifestyle & Gifts')}</td>
                      </tr>
                      {p.isDigital ? (
                        <>
                          <tr>
                            <th>Fulfillment Method</th>
                            <td>See the product listing for delivery and access details</td>
                          </tr>
                          <tr>
                            <th>License & Access</th>
                            <td>See the product listing for license and update details</td>
                          </tr>
                          <tr>
                            <th>Compatibility</th>
                            <td>See the product listing for compatibility information</td>
                          </tr>
                          <tr>
                            <th>Support & Setup</th>
                            <td>See the product listing for support and setup information</td>
                          </tr>
                        </>
                      ) : p.category === 'watch' ? (
                        <>
                          {productColors.length > 0 && (
                            <tr>
                              <th>Finishes & Bands</th>
                              <td>{productColors.map((c) => c.name).join(' • ')}</td>
                            </tr>
                          )}
                          <tr>
                            <th>Movement Type</th>
                            <td>Check the product listing for movement details</td>
                          </tr>
                          <tr>
                            <th>Dial & Crystal</th>
                            <td>Check the product listing for dial and crystal details</td>
                          </tr>
                          <tr>
                            <th>Band & Clasp</th>
                            <td>Check the product listing for band and clasp materials</td>
                          </tr>
                          <tr>
                            <th>Water Resistance</th>
                            <td>Check the product listing for water-resistance information</td>
                          </tr>
                          <tr>
                            <th>Package Includes</th>
                            <td>Check the product listing for package contents and warranty details</td>
                          </tr>
                        </>
                      ) : p.category === 'sunglass' ? (
                        <>
                          {productColors.length > 0 && (
                            <tr>
                              <th>Frame & Lens Finishes</th>
                              <td>{productColors.map((c) => c.name).join(' • ')}</td>
                            </tr>
                          )}
                          <tr>
                            <th>UV Optical Protection</th>
                            <td>Check the product listing for UV protection information</td>
                          </tr>
                          <tr>
                            <th>Lens Technology</th>
                            <td>Check the product listing for lens details</td>
                          </tr>
                          <tr>
                            <th>Frame Construction</th>
                            <td>Check the product listing for frame material and construction</td>
                          </tr>
                          <tr>
                            <th>Package Includes</th>
                            <td>Check the product listing for package contents</td>
                          </tr>
                        </>
                      ) : p.category === 'gift' ? (
                        <>
                          <tr>
                            <th>Gift Set Nature</th>
                            <td>Check the product listing for gift-set contents</td>
                          </tr>
                          <tr>
                            <th>Complimentary Note</th>
                            <td>Check the product listing for included card or gift options</td>
                          </tr>
                          <tr>
                            <th>Presentation Standard</th>
                            <td>Check the product listing for packaging details</td>
                          </tr>
                          <tr>
                            <th>Suitable Occasions</th>
                            <td>See the product listing for suggested occasions</td>
                          </tr>
                        </>
                      ) : p.category === 'accessories' ? (
                        <>
                          {productColors.length > 0 && (
                            <tr>
                              <th>Available Finishes</th>
                              <td>{productColors.map((c) => c.name).join(' • ')}</td>
                            </tr>
                          )}
                          <tr>
                            <th>Material</th>
                            <td>Check the product listing for material details</td>
                          </tr>
                          <tr>
                            <th>Interior Features</th>
                            <td>Check the product listing for features and compartments</td>
                          </tr>
                          <tr>
                            <th>Package Includes</th>
                            <td>Check the product listing for package contents</td>
                          </tr>
                        </>
                      ) : isApparel || p.category === 'cloth' ? (
                        <>
                          {productSizes.length > 0 && (
                            <tr>
                              <th>Available Sizes</th>
                              <td>{productSizes.join(' • ')}</td>
                            </tr>
                          )}
                          {productColors.length > 0 && (
                            <tr>
                              <th>Available Colors</th>
                              <td>{productColors.map((c) => c.name).join(' • ')}</td>
                            </tr>
                          )}
                          <tr>
                            <th>Fabric & Weave</th>
                            <td>Check the product listing for fabric and material details</td>
                          </tr>
                          <tr>
                            <th>Fit Standard</th>
                            <td>Check the product listing for fit and construction details</td>
                          </tr>
                          <tr>
                            <th>Package Includes</th>
                            <td>Check the product listing for package contents</td>
                          </tr>
                        </>
                      ) : (
                        <>
                          {(p.size || productSizes.length > 0) && (
                            <tr>
                              <th>Net Volume / Weight</th>
                              <td>{p.size || productSizes.join(', ')}</td>
                            </tr>
                          )}
                          <tr>
                            <th>Skin Compatibility</th>
                            <td>Review the product label; suitability varies by person</td>
                          </tr>
                          <tr>
                            <th>Formulation Standard</th>
                            <td>See product listing or package for ingredient and usage details</td>
                          </tr>
                          <tr>
                            <th>Package Includes</th>
                            <td>See the product listing for package contents</td>
                          </tr>
                        </>
                      )}
                      <tr>
                        <th>Payment & Inspection</th>
                        <td>Cash on Delivery with Doorstep Inspection Supported</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB 3: SIZE & FIT CHART - ONLY IF APPAREL / UNDERGARMENTS */}
            {isApparel && productSizes.length > 0 && pdpTab === 'size' && (
              <div style={{ maxWidth: 840, margin: '0 auto' }}>
                <div style={{ marginBottom: 18, textAlign: 'center' }}>
                  <h4 className="serif" style={{ fontSize: 20, color: '#1f3147', margin: '0 0 6px' }}>
                    {isIntimate ? 'Intimate Wear & Undergarment Size Guide' : 'Apparel & Lifestyle Clothing Size Guide'}
                  </h4>
                  <p style={{ fontSize: 13, color: '#6b645c', margin: 0 }}>
                    {isIntimate
                      ? 'All dimensions are provided in inches. Please select based on your body measurements for the most supportive and comfortable fit.'
                      : 'All dimensions are in inches. Regular tailored fit designed for effortless style and everyday movement.'}
                  </p>
                </div>

                <div className="tabaya-table-wrap">
                  <table className="tabaya-size-table">
                    <thead>
                      {isIntimate ? (
                        <tr>
                          <th>Size Tag</th>
                          <th>Band / Underbust</th>
                          <th>Bust / Chest</th>
                          <th>Waist (Inches)</th>
                          <th>Recommended Fit</th>
                        </tr>
                      ) : (
                        <tr>
                          <th>Size Tag</th>
                          <th>Chest (Inches)</th>
                          <th>Length (Inches)</th>
                          <th>Shoulder (Inches)</th>
                          <th>Recommended Fit</th>
                        </tr>
                      )}
                    </thead>
                    <tbody>
                      {isIntimate ? (
                        <>
                          <tr>
                            <td><b>S (Small)</b></td>
                            <td>28" – 30"</td>
                            <td>30" – 32"</td>
                            <td>24" – 26"</td>
                            <td>Standard Comfort Fit</td>
                          </tr>
                          <tr>
                            <td><b>M (Medium)</b></td>
                            <td>30" – 32"</td>
                            <td>32" – 34"</td>
                            <td>26" – 29"</td>
                            <td>Standard Comfort Fit</td>
                          </tr>
                          <tr>
                            <td><b>L (Large)</b></td>
                            <td>32" – 34"</td>
                            <td>34" – 36"</td>
                            <td>29" – 32"</td>
                            <td>Comfort & Support</td>
                          </tr>
                          <tr>
                            <td><b>XL (Extra Large)</b></td>
                            <td>34" – 36"</td>
                            <td>36" – 38"</td>
                            <td>32" – 35"</td>
                            <td>Full Support Fit</td>
                          </tr>
                          <tr>
                            <td><b>XXL / Free Size</b></td>
                            <td>36" – 38"</td>
                            <td>38" – 42"</td>
                            <td>35" – 39"</td>
                            <td>Relaxed Stretch Fit</td>
                          </tr>
                        </>
                      ) : (
                        <>
                          <tr>
                            <td><b>S (Small)</b></td>
                            <td>38"</td>
                            <td>27"</td>
                            <td>16.5"</td>
                            <td>Slim / Standard Fit</td>
                          </tr>
                          <tr>
                            <td><b>M (Medium)</b></td>
                            <td>40"</td>
                            <td>28"</td>
                            <td>17.5"</td>
                            <td>Regular Comfort Fit</td>
                          </tr>
                          <tr>
                            <td><b>L (Large)</b></td>
                            <td>42"</td>
                            <td>29"</td>
                            <td>18.5"</td>
                            <td>Standard Relaxed Fit</td>
                          </tr>
                          <tr>
                            <td><b>XL (Extra Large)</b></td>
                            <td>44"</td>
                            <td>30"</td>
                            <td>19.5"</td>
                            <td>Relaxed Fit</td>
                          </tr>
                          <tr>
                            <td><b>XXL (2X-Large)</b></td>
                            <td>46"</td>
                            <td>31"</td>
                            <td>20.5"</td>
                            <td>Roomy Comfort Fit</td>
                          </tr>
                        </>
                      )}
                    </tbody>
                  </table>
                </div>

                <div style={{ marginTop: 24, padding: 18, background: '#f8f6f2', border: '1px solid rgba(180, 150, 100, 0.25)', fontSize: 13, color: '#4b5563', lineHeight: 1.6 }}>
                  <b style={{ color: '#1f3147', display: 'block', marginBottom: 4 }}>💡 Measurement & Fit Guidance:</b>
                  {isIntimate ? (
                    <>
                      <div>• <b>Underbust:</b> Measure directly under your bust with a snug, level tape.</div>
                      <div>• <b>Bust:</b> Measure around the fullest point of your chest while breathing naturally.</div>
                      <div>• <b>Waist:</b> Measure around the narrowest part of your natural waistline.</div>
                      <div>• <b>Discreet Delivery:</b> All intimate orders are shipped in unmarked, opaque packaging for 100% privacy.</div>
                    </>
                  ) : (
                    <>
                      <div>• <b>Chest:</b> Measure around the fullest part of your chest, keeping the tape level under the arms.</div>
                      <div>• <b>Length:</b> Measure from highest shoulder point down to desired hemline.</div>
                      <div>• <b>Shoulder:</b> Measure across the back from the tip of one shoulder to the other.</div>
                      <div>• <b>Hassle-Free Exchange:</b> If the size doesn't fit you perfectly, we offer a 7-day doorstep size exchange.</div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* TAB 4: DELIVERY & RETURNS */}
            {pdpTab === 'delivery' && (
              <div style={{ maxWidth: 840, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="tabaya-feature-card">
                  <span className="icon">🚚</span>
                  <div>
                    <h4>Fast Nationwide Delivery</h4>
                    <p><b>Inside Dhaka:</b> Delivered within 24 to 48 business hours ({settings ? taka(settings.deliveryInside) : '৳80'} delivery charge).<br />
                    <b>Outside Dhaka:</b> Delivered within 48 to 72 business hours across all 64 districts ({settings ? taka(settings.deliveryOutside) : '৳130'} delivery charge).</p>
                  </div>
                </div>
                <div className="tabaya-feature-card">
                  <span className="icon">💵</span>
                  <div>
                    <h4>Cash on Delivery at Your Doorstep</h4>
                    <p>{tr('Pay cash to the delivery courier when your parcel arrives. Parcel opening before payment depends on the courier’s policy.', language)}</p>
                  </div>
                </div>
                <div className="tabaya-feature-card">
                  <span className="icon">🔄</span>
                  <div>
                    <h4>Easy Replacement Policy</h4>
                    <p>If you received a damaged item or incorrect size, contact our customer support team or WhatsApp within 7 days for an immediate exchange.</p>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 5: CARE INSTRUCTIONS OR HOW TO USE */}
            {pdpTab === 'care' && (
              <div style={{ maxWidth: 840, margin: '0 auto' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
                  {p.isDigital ? (
                    <>
                      <div className="tabaya-feature-card">
                        <span className="icon">⚡</span>
                        <div>
                          <h4>Instant Delivery & Access</h4>
                          <p>Download link and access credentials appear instantly on your order confirmation screen and are sent via WhatsApp/Email.</p>
                        </div>
                      </div>
                      <div className="tabaya-feature-card">
                        <span className="icon">📱</span>
                        <div>
                          <h4>Multi-Device Compatible</h4>
                          <p>Compatible across Windows, Mac, iOS, Android, and tablets. Access files wherever and whenever you need them.</p>
                        </div>
                      </div>
                      <div className="tabaya-feature-card">
                        <span className="icon">🔑</span>
                        <div>
                          <h4>Lifetime License & Updates</h4>
                          <p>Enjoy perpetual access with all future updates and patches included free of additional charge.</p>
                        </div>
                      </div>
                      <div className="tabaya-feature-card">
                        <span className="icon">💬</span>
                        <div>
                          <h4>Dedicated Tech Support</h4>
                          <p>Need setup guidance? Our technical support team is available 7 days a week via WhatsApp to assist you.</p>
                        </div>
                      </div>
                    </>
                  ) : p.category === 'watch' ? (
                    <>
                      <div className="tabaya-feature-card">
                        <span className="icon">💧</span>
                        <div>
                          <h4>Water Resistance Precautions</h4>
                          <p>Avoid exposing to hot water, saunas, and steam showers as temperature shifts can compromise seal gaskets.</p>
                        </div>
                      </div>
                      <div className="tabaya-feature-card">
                        <span className="icon">🧲</span>
                        <div>
                          <h4>Magnetic Field Shielding</h4>
                          <p>Keep your timepiece away from powerful magnetic fields such as large speakers, magnetic clasps, and laptops.</p>
                        </div>
                      </div>
                      <div className="tabaya-feature-card">
                        <span className="icon">✨</span>
                        <div>
                          <h4>Microfiber Polish</h4>
                          <p>Wipe case and mineral crystal with the included lint-free microfiber cloth to remove oils, dust, and fingerprints.</p>
                        </div>
                      </div>
                      <div className="tabaya-feature-card">
                        <span className="icon">📦</span>
                        <div>
                          <h4>Padded Box Storage</h4>
                          <p>When not on your wrist, store your watch securely inside its plush presentation box to prevent accidental scratches.</p>
                        </div>
                      </div>
                    </>
                  ) : p.category === 'sunglass' ? (
                    <>
                      <div className="tabaya-feature-card">
                        <span className="icon">👓</span>
                        <div>
                          <h4>Optical Lens Cleaning</h4>
                          <p>Rinse lenses with lukewarm water before wiping with microfiber cloth to prevent micro-scratches from dust particles.</p>
                        </div>
                      </div>
                      <div className="tabaya-feature-card">
                        <span className="icon">🚫</span>
                        <div>
                          <h4>Avoid Coarse Fabrics</h4>
                          <p>Never use t-shirt hems, rough paper napkins, or coarse clothing to wipe lenses as they degrade the UV filter coating.</p>
                        </div>
                      </div>
                      <div className="tabaya-feature-card">
                        <span className="icon">☀️</span>
                        <div>
                          <h4>Avoid Car Dashboard Heat</h4>
                          <p>Do not leave sunglasses exposed to direct sun on vehicle dashboards, as excessive heat can deform frames.</p>
                        </div>
                      </div>
                      <div className="tabaya-feature-card">
                        <span className="icon">🔒</span>
                        <div>
                          <h4>Hard Protective Case</h4>
                          <p>Always rest glasses in their provided hard shell case when traveling or not in active wear.</p>
                        </div>
                      </div>
                    </>
                  ) : isApparel ? (
                    <>
                      <div className="tabaya-feature-card">
                        <span className="icon">💧</span>
                        <div>
                          <h4>Gentle Hand Wash</h4>
                          <p>Wash in cold water with mild detergent to preserve fabric elasticity, color vitality, and soft texture.</p>
                        </div>
                      </div>
                      <div className="tabaya-feature-card">
                        <span className="icon">🚫</span>
                        <div>
                          <h4>No Bleach or Harsh Chemicals</h4>
                          <p>Never use chlorine bleach or strong optical brighteners to prevent fiber damage and discoloration.</p>
                        </div>
                      </div>
                      <div className="tabaya-feature-card">
                        <span className="icon">🌤️</span>
                        <div>
                          <h4>Air Dry in Shade</h4>
                          <p>Lay flat or line dry away from direct heat and strong sunlight to maintain elastic recovery.</p>
                        </div>
                      </div>
                      <div className="tabaya-feature-card">
                        <span className="icon">🔒</span>
                        <div>
                          <h4>Hygienic Storage</h4>
                          <p>Store in a clean, ventilated wardrobe organizer or drawer to keep garments pristine and fresh.</p>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="tabaya-feature-card">
                        <span className="icon">💧</span>
                        <div>
                          <h4>Cleanse Before Application</h4>
                          <p>Apply to gently cleansed, towel-dried skin. Gently pat or massage until fully absorbed.</p>
                        </div>
                      </div>
                      <div className="tabaya-feature-card">
                        <span className="icon">☀️</span>
                        <div>
                          <h4>Store in Cool Shade</h4>
                          <p>Store in a cool, dry place away from direct heat and direct sunlight to preserve active freshness.</p>
                        </div>
                      </div>
                      <div className="tabaya-feature-card">
                        <span className="icon">🧪</span>
                        <div>
                          <h4>24-Hour Patch Test</h4>
                          <p>Recommended to apply a small amount behind ear or forearm 24 hours prior to regular use.</p>
                        </div>
                      </div>
                      <div className="tabaya-feature-card">
                        <span className="icon">🔒</span>
                        <div>
                          <h4>Keep Cap Tightened</h4>
                          <p>Always close container cap securely after each application to prevent contamination and oxidation.</p>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Reviews */}
        <div style={{ marginTop: 40 }}>
          <Reviews productId={p.id} />
        </div>

        {/* Related */}
        <div style={{ marginTop: 40 }}>
          <Related product={p} />
        </div>
      </div>

      {/* Sticky Bottom Bar on Mobile */}
      {!p.soldOut && (
        <div
          className={'pdpbar' + (showBar ? ' show' : '')}
          style={{
            background: '#ffffff',
            borderTop: '1px solid #EAE5DC',
            boxShadow: '0 -6px 20px rgba(0,0,0,0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '10px 16px',
            zIndex: 60
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
            <img
              src={p.image}
              alt=""
              style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 4, border: '1px solid #EAE5DC', flexShrink: 0 }}
            />
            <div className="pb-info" style={{ minWidth: 0, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <b style={{ color: '#1f3147', fontSize: 17, fontWeight: 700 }}>{taka(currentPrice)}</b>
                {onSale && currentCompareAt && (
                  <s style={{ color: '#8c7d6b', fontSize: 12 }}>{taka(currentCompareAt)}</s>
                )}
              </div>
              <span style={{ color: '#4b5563', fontSize: 11.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>
                {p.name}
              </span>
            </div>
          </div>
          <button
            className="sticky-buy-btn"
            onClick={handleDirectBuy}
          >
            <span>ORDER NOW</span>
          </button>
        </div>
      )}
    </div>
  );
}
export function Checkout() {
  const language = useStoreLanguage();
  const { lines, total: subtotal, clear } = useCart();
  const { customer, openAuth } = useCustomer();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [area, setArea] = useState<'inside' | 'outside'>('inside');
  const [f, setF] = useState({ name: '', phone: '', address: '', note: '', email: '' });
  const [district, setDistrict] = useState('');
  const [thana, setThana] = useState('');
  const [coupon, setCoupon] = useState('');
  const [applied, setApplied] = useState<{ code: string; discount: number } | null>(null);
  const [cerr, setCerr] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const isSkin = isSkincareSite();

  useEffect(() => { getSettings().then(setSettings).catch(() => {}); }, []);
  useEffect(() => { if (lines.length) ecBeginCheckout(subtotal, lines.map((l) => ({ id: l.id, name: l.name, price: l.price, qty: l.qty }))); }, []); // eslint-disable-line

  // Auto-fill customer details if logged in
  useEffect(() => {
    if (customer) {
      setF((s) => ({
        ...s,
        name: s.name || customer.name || '',
        phone: s.phone || customer.phone || '',
        email: s.email || customer.email || '',
        address: s.address || customer.savedAddress?.address || '',
      }));
      if (customer.savedAddress?.district) {
        setDistrict(customer.savedAddress.district);
        setArea(customer.savedAddress.district === 'Dhaka' ? 'inside' : 'outside');
      }
      if (customer.savedAddress?.thana) {
        setThana(customer.savedAddress.thana);
      }
    }
  }, [customer]);

  // ping server for incomplete order capture
  useEffect(() => {
    const cleanPhone = f.phone.trim().replace(/[-+ ]/g, '');
    if (!/^01[3-9]\d{8}$/.test(cleanPhone) || lines.length === 0) return;
    const t = setTimeout(() => {
      fetch('/api/checkout/ping', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-device-id': getDeviceId(),
        },
        body: JSON.stringify({
          items: lines.map((l) => ({
            id: l.id,
            productId: l.id.includes('-') ? l.id.split('-')[0] + (l.id.startsWith('mm-') ? '-' + l.id.split('-')[1] : '') : l.id,
            name: l.name,
            price: l.price,
            qty: l.qty,
            image: l.image,
            color: l.color,
            size: l.size,
            variantId: l.variantId,
            variantTitle: (l as any).variantTitle || (l.color && l.size ? `${l.color} · ${l.size}` : l.color || l.size || ''),
          })),
          customer: {
            ...f,
            name: f.name.trim() || 'Customer',
            phone: cleanPhone,
            address: [f.address.trim(), thana, district].filter(Boolean).join(', '),
            area,
            district,
            thana,
            coupon: applied?.code,
            source: getSource(),
          },
        }),
      }).catch(() => {});
    }, 1000);
    return () => clearTimeout(t);
  }, [f, area, applied, lines, district, thana]);

  const set = (k: keyof typeof f) => (e: any) => setF((s) => ({ ...s, [k]: e.target.value }));
  const isAllDigital = lines.length > 0 && lines.every((l) => (l as any).isDigital);
  const districts = Object.keys(BD_GEO).sort();
  const thanas = district ? (BD_GEO[district] || []) : [];
  const pickDistrict = (d: string) => { setDistrict(d); setThana(''); if (d) setArea(d === 'Dhaka' ? 'inside' : 'outside'); };
  const fullAddress = [f.address.trim(), thana, district].filter(Boolean).join(', ');
  const freeShip = isAllDigital || (settings ? subtotal >= settings.freeShipThreshold : false);
  const delivery = isAllDigital || !settings || freeShip ? 0 : area === 'outside' ? settings.deliveryOutside : settings.deliveryInside;
  const discount = applied ? Math.min(applied.discount, subtotal) : 0;
  const grand = Math.max(0, subtotal + delivery - discount);

  const apply = async (codeOverride?: string) => {
    const codeToTest = (codeOverride || coupon).trim();
    setCerr('');
    try {
      const r = await validateCoupon(codeToTest, subtotal, f.phone);
      setApplied(r);
      setCoupon(codeToTest);
    } catch (e: any) {
      setApplied(null);
      setCerr(e.message || 'invalid code');
    }
  };

  const showCheckoutIssue = (message: string, selector: string) => {
    setErr(message);
    window.setTimeout(() => {
      const target = document.querySelector(selector) as HTMLElement | null;
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 60);
  };

  const submit = async () => {
    setErr('');
    if (!/^01[3-9]\d{8}$/.test(f.phone)) { showCheckoutIssue('Please enter a valid 11-digit Bangladeshi mobile number (01XXXXXXXXX)', '.checkout-phone-input'); return; }
    if (!isAllDigital) {
      if (!district || !thana) { showCheckoutIssue('Please select your District and Thana', !district ? '.checkout-district-field' : '.checkout-thana-field'); return; }
      if (!f.address.trim()) { showCheckoutIssue('Please enter your street address / delivery location', '.checkout-address-field'); return; }
    }
    setBusy(true);
    try {
      const res = await placeOrder({
        items: lines.map((l) => ({
          id: l.id.startsWith('mm-') ? l.id.split('-').slice(0, 2).join('-') : (l.id.includes('-') ? l.id.split('-')[0] : l.id),
          productId: l.id.startsWith('mm-') ? l.id.split('-').slice(0, 2).join('-') : (l.id.includes('-') ? l.id.split('-')[0] : l.id),
          qty: l.qty,
          size: l.size,
          color: l.color,
          variantId: l.variantId,
          name: l.name,
          price: l.price,
          image: l.image,
          isDigital: (l as any).isDigital,
        })),
        customer: {
          ...f,
          address: isAllDigital ? (f.email ? `Digital Access / Email: ${f.email}` : 'Instant Digital Access via WhatsApp') : fullAddress,
          area: isAllDigital ? 'inside' : area,
          district: isAllDigital ? 'Digital' : district,
          thana: isAllDigital ? 'Instant' : thana,
          coupon: applied?.code,
          source: getSource(),
        }
      });
      ecPurchase(res.id, res.total ?? grand, lines.map((l) => ({ id: l.id, name: l.name, price: l.price, qty: l.qty })), getSource());
      clear();
      go('confirm/' + res.id);
    } catch (e: any) { setErr(e.message || 'could not place order'); } finally { setBusy(false); }
  };

  if (lines.length === 0)
    return (
      <div className="page" style={{ background: '#f3f0ec', minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="wrap" style={{ maxWidth: 520, textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ background: '#FAF8F5', border: '1px solid rgba(180, 150, 100, 0.45)', padding: '48px 30px', position: 'relative', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
            <div className="pc-corner-tr" />
            <div className="pc-corner-bl" />
            <div style={{ fontSize: 44, marginBottom: 12 }}>🛍️</div>
            <h2 className="serif" style={{ fontSize: 26, color: '#1f3147', margin: '0 0 10px', fontWeight: 500 }}>Your Bag is Empty</h2>
            <p style={{ color: '#6b645c', fontSize: 14, margin: '0 0 24px', lineHeight: 1.6 }}>
              {isSkin
                ? 'Explore skincare, beauty, and self-care products from a range of brands.'
                : 'Explore our watches, sunglasses, and gift collections.'}
            </p>
            <button
              className="pc-cta"
              onClick={() => go('shop')}
              style={{ width: '100%', padding: '15px 24px', fontSize: 12, letterSpacing: '0.2em' }}
            >
              <span>CONTINUE SHOPPING →</span>
            </button>
          </div>
        </div>
      </div>
    );

  return (
    <div className="page checkout-page" style={{ background: '#f3f0ec', minHeight: '100vh', paddingTop: '28px', paddingBottom: '70px' }}>
      <div className="wrap" style={{ maxWidth: 1120 }}>
        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#8c7d6b', marginBottom: 20, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          <span style={{ cursor: 'pointer' }} onClick={() => go('home')}>Home</span>
          <span>/</span>
          <span style={{ cursor: 'pointer' }} onClick={() => go('shop')}>Collections</span>
          <span>/</span>
          <span style={{ color: '#1f3147', fontWeight: 600 }}>{tr('Checkout', language)}</span>
        </div>

        {/* Header */}
        <div className="phead" style={{ textAlign: 'center', padding: '6px 0 28px' }}>
          <p className="pc-section-kicker">
            {isSkin ? 'SECRATE • SECURE ORDER CHECKOUT' : 'METRROMA • SECURE ORDER CHECKOUT'}
          </p>
          <h1 className="serif" style={{ fontSize: 'clamp(28px, 3.4vw, 40px)', fontWeight: 500, color: '#1f3147', margin: '6px 0 10px' }}>
            {tr('Finalize Your Order', language)}
          </h1>
          <p style={{ color: '#6b645c', fontSize: 14, maxWidth: 520, margin: '0 auto' }}>
            {tr('Cash on delivery is available. Parcel inspection depends on the courier’s policy; contact us before ordering if inspection is important to you.', language)}
          </p>
        </div>

        <div className="co">
          {/* Left: Input Form */}
          <div className="form">
            {!customer && (
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: 6,
                  padding: '12px 18px',
                  marginBottom: 16,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <div style={{ fontSize: 13, color: '#334155' }}>
                  {tr('Have a VIP account or want 5% off your first order?', language)}
                </div>
                <button
                  type="button"
                  onClick={openAuth}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#0f172a',
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: 'pointer',
                    textDecoration: 'underline',
                    padding: 0,
                  }}
                >
                  {tr('Sign In / Register', language)}
                </button>
              </div>
            )}

            {/* Box 1: Contact Details */}
            <div className="cobox">
              <div className="pc-corner-tr" />
              <div className="pc-corner-bl" />
              <div className="cobox-h">
                <span className="cobox-n">1</span>
                <span>{tr('Contact & Personal Details', language)}</span>
              </div>
              <div className="cobox-b">
                <div>
                  <label>{tr('Full Name *', language)}</label>
                  <input className="field" value={f.name} onChange={set('name')} placeholder={tr('Enter your full name', language)} />
                </div>
                <div>
                  <label>{tr('Mobile Number *', language)}</label>
                  <input
                    className="field checkout-phone-input"
                    value={f.phone}
                    onChange={(e) => setF((s) => ({ ...s, phone: e.target.value.replace(/\D/g, '').slice(0, 11) }))}
                    placeholder="01XXXXXXXXX"
                    inputMode="tel"
                    maxLength={11}
                  />
                  {f.phone.length > 0 && !/^01[3-9]\d{8}$/.test(f.phone) && (
                    <div className="fieldhint">{tr('Please enter a valid 11-digit mobile number (e.g. 017XXXXXXXX)', language)}</div>
                  )}
                </div>
              </div>
            </div>

            {/* Box 2: Delivery Address / Digital Delivery */}
            <div className="cobox">
              <div className="pc-corner-tr" />
              <div className="pc-corner-bl" />
              <div className="cobox-h">
                <span className="cobox-n">2</span>
                <span>{tr(isAllDigital ? 'Instant Digital Fulfillment' : 'Shipping & Doorstep Delivery Address', language)}</span>
              </div>
              {isAllDigital ? (
                <div className="cobox-b">
                  <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '14px 16px', marginBottom: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#166534', fontWeight: 700, fontSize: 13.5 }}>
                      <span>{tr('⚡ Instant Digital Access', language)}</span>
                      <span style={{ fontSize: 10.5, background: '#16a34a', color: '#fff', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>
                        {tr('FREE ৳0 DELIVERY', language)}
                      </span>
                    </div>
                    <p style={{ margin: '6px 0 0', fontSize: 12.5, color: '#4b5563', lineHeight: 1.5 }}>
                      No physical courier delivery needed. Your digital download link and activation instructions will be provided instantly upon order confirmation.
                    </p>
                  </div>
                  <div>
                    <label>{tr('Email Address (for download delivery & invoice) *', language)}</label>
                    <input className="field" type="email" value={f.email || ''} onChange={set('email')} placeholder="yourname@gmail.com" />
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <label>{tr('Order Note (Optional)', language)}</label>
                    <input className="field" value={f.note} onChange={set('note')} placeholder="WhatsApp instructions or special notes" />
                  </div>
                </div>
              ) : (
                <div className="cobox-b">
                  <div className="corow">
                    <div className="checkout-district-field">
                      <label>{tr('District (Zilla) *', language)}</label>
                      <SearchSelect value={district} onChange={pickDistrict} options={districts} placeholder={tr('Search district…', language)} />
                    </div>
                    <div className="checkout-thana-field">
                      <label>{tr('Thana / Upazila *', language)}</label>
                      <SearchSelect value={thana} onChange={setThana} options={thanas} placeholder={district ? tr('Search thana…', language) : tr('Select district first', language)} disabled={!district} />
                    </div>
                  </div>

                  <div className="checkout-address-field">
                    <label>{tr('Detailed Street Address *', language)}</label>
                    <textarea className="field" value={f.address} onChange={set('address')} placeholder="House / Flat / Road, Village, Landmark or Area description" />
                  </div>

                  <div>
                    <label>{tr('Delivery Zone', language)}</label>
                    <div className="area">
                      <button type="button" className={'areaopt' + (area === 'inside' ? ' on' : '')} onClick={() => setArea('inside')}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                          <b style={{ fontSize: 13, color: area === 'inside' ? '#FAF8F5' : '#1f3147' }}>{tr('Inside Dhaka', language)}</b>
                          <span style={{ fontSize: 13, fontWeight: 700, color: area === 'inside' ? '#d4af37' : '#1f3147' }}>
                            {settings ? (freeShip ? 'FREE' : taka(settings.deliveryInside)) : '৳80'}
                          </span>
                        </div>
                        <span style={{ fontSize: 11.5, color: area === 'inside' ? 'rgba(250,248,245,0.75)' : '#8c7d6b' }}>
                          {tr('Delivered in 24–48 Hours', language)}
                        </span>
                      </button>
                      <button type="button" className={'areaopt' + (area === 'outside' ? ' on' : '')} onClick={() => setArea('outside')}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                          <b style={{ fontSize: 13, color: area === 'outside' ? '#FAF8F5' : '#1f3147' }}>{tr('Outside Dhaka', language)}</b>
                          <span style={{ fontSize: 13, fontWeight: 700, color: area === 'outside' ? '#d4af37' : '#1f3147' }}>
                            {settings ? (freeShip ? 'FREE' : taka(settings.deliveryOutside)) : '৳130'}
                          </span>
                        </div>
                        <span style={{ fontSize: 11.5, color: area === 'outside' ? 'rgba(250,248,245,0.75)' : '#8c7d6b' }}>
                          {tr('Delivered across 64 Districts', language)}
                        </span>
                      </button>
                    </div>
                  </div>

                  <div>
                    <label>{tr('Order Note (Optional)', language)}</label>
                    <input className="field" value={f.note} onChange={set('note')} placeholder="Special delivery instructions, timing or landmarks" />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right: Summary Box */}
          <div className="summ">
            <div className="pc-corner-tr" />
            <div className="pc-corner-bl" />
            <h3>{tr('Order Summary', language)} ({lines.reduce((s, l) => s + l.qty, 0)} {tr('Items', language)})</h3>

            <div className="summ-items">
              {lines.map((l) => (
                <div className="summ-item" key={l.id}>
                  <span className="summ-thumb">
                    {l.image ? <img src={l.image} alt={l.name} /> : null}
                    <i className="summ-q">{l.qty}</i>
                  </span>
                  <span className="summ-nm">
                    {l.name}
                    {(l.size || l.color) ? (
                      <span style={{ display: 'block', fontSize: 11.5, color: '#8c7d6b', marginTop: 2 }}>
                        {[l.color ? `Color: ${l.color}` : null, l.size ? `Size: ${l.size}` : null].filter(Boolean).join(' · ')}
                      </span>
                    ) : null}
                  </span>
                  <span className="summ-pr">{taka(l.price * l.qty)}</span>
                </div>
              ))}
            </div>

            {/* Promo Code Input */}
            {customer?.firstOrderDiscountAvailable && !applied && (
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px dashed #cbd5e1',
                  borderRadius: 6,
                  padding: '10px 14px',
                  marginBottom: 12,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <div style={{ fontSize: 12.5, color: '#1e293b' }}>
                  <strong>5% VIP First Order Discount:</strong> Code <span style={{ fontWeight: 700, color: '#0f172a' }}>WELCOME5</span>
                </div>
                <button
                  type="button"
                  onClick={() => apply('WELCOME5')}
                  style={{
                    background: '#0f172a',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 4,
                    padding: '5px 12px',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Apply
                </button>
              </div>
            )}

            <div className="couponbox">
              <input
                className="field"
                placeholder="Discount / Promo code"
                value={coupon}
                onChange={(e) => setCoupon(e.target.value)}
              />
              <button type="button" className="btn" onClick={() => apply()}>
                APPLY
              </button>
            </div>
            {cerr && <div className="fieldhint" style={{ marginBottom: 10 }}>{cerr}</div>}

            <div className="sl">
              <span>Subtotal</span>
              <span>{taka(subtotal)}</span>
            </div>
            <div className="sl">
              <span>Delivery Charge {isAllDigital ? '(Instant Digital Delivery)' : freeShip ? '(Free)' : `(${area === 'inside' ? 'Inside Dhaka' : 'Outside Dhaka'})`}</span>
              <span>{delivery === 0 ? 'FREE' : taka(delivery)}</span>
            </div>
            {discount > 0 && (
              <div className="sl" style={{ color: '#10b981' }}>
                <span>Discount Voucher ({applied?.code})</span>
                <span>−{taka(discount)}</span>
              </div>
            )}
            <div className="tot">
              <span>Total Payable</span>
              <b><AnimTk v={grand} /></b>
            </div>

            <div className="summ-cod">
              💵 Cash on Delivery · Inspect Parcel Before Paying
            </div>

            {err && (
              <div className="checkout-error" style={{ background: '#fee2e2', border: '1px solid #f87171', color: '#b91c1c', padding: '10px 14px', borderRadius: 2, fontSize: 13, marginTop: 14 }}>
                ⚠️ {err}
              </div>
            )}

            <button
              className="checkout-submit-btn"
              disabled={busy}
              onClick={submit}
              style={{ marginTop: 18 }}
            >
              <span>{busy ? tr('PROCESSING ORDER…', language) : `${tr('PLACE ORDER', language)} · ${taka(grand)}`}</span>
            </button>

            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: '#6b645c', textAlign: 'center' }}>
              <div>🔒 Secure Checkout · No Advance Payment Required</div>
              <div>📦 {tr('Courier inspection policy applies', language)}</div>
            </div>
          </div>
        </div>
        <div className="checkout-mobile-action" aria-label="Quick order action">
          {err && <div className="checkout-mobile-error" role="alert">⚠️ {err}</div>}
          <div className="checkout-mobile-action-row">
            <div className="checkout-mobile-total"><span>Total payable</span><strong>{taka(grand)}</strong></div>
            <button className="checkout-submit-btn" disabled={busy} onClick={submit}>
              <span>{busy ? tr('PROCESSING…', language) : tr('PLACE ORDER', language)}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Confirm({ id }: { id: string }) {
  const language = useStoreLanguage();
  const [copied, setCopied] = useState(false);
  const [wa, setWa] = useState('');
  const isSkin = isSkincareSite();

  useEffect(() => {
    getSettings().then((s) => { if (s.whatsapp) setWa(s.whatsapp); }).catch(() => {});
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(id);
    } catch {
      const t = document.createElement('textarea');
      t.value = id; document.body.appendChild(t); t.select();
      try { document.execCommand('copy'); } catch {}
      t.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="page" style={{ background: '#f3f0ec', minHeight: '85vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 16px' }}>
      <div className="wrap" style={{ maxWidth: 640, width: '100%' }}>
        <div style={{ background: '#FAF8F5', border: '1px solid rgba(180, 150, 100, 0.45)', padding: '48px 32px', textAlign: 'center', position: 'relative', boxShadow: '0 4px 24px rgba(0,0,0,0.04)' }}>
          <div className="pc-corner-tr" />
          <div className="pc-corner-bl" />
          <div className="okcheck"><svg viewBox="0 0 24 24"><path d="M4 12.5l5 5L20 6.5" /></svg></div>
          <p className="pc-section-kicker">{isSkin ? 'SECRATE • ORDER RECEIVED' : 'METRROMA • ORDER RECEIVED'}</p>
          <h1 className="serif" style={{ fontSize: 'clamp(26px, 3.2vw, 36px)', color: '#1f3147', fontWeight: 500, margin: '8px 0 12px' }}>
            Order Placed Successfully!
          </h1>
          <p style={{ color: '#4b5563', fontSize: 15, maxWidth: 460, margin: '0 auto 24px', lineHeight: 1.6 }}>
            Thank you for shopping with us! Our customer care representative will call you shortly to confirm your delivery details.
          </p>
          <div style={{ padding: '16px 20px', background: '#f7f4ee', border: '1px dashed rgba(180, 150, 100, 0.45)', display: 'inline-block', marginBottom: 28 }}>
            <span style={{ fontSize: 11.5, color: '#8c7d6b', textTransform: 'uppercase', letterSpacing: '0.12em', display: 'block', marginBottom: 4, fontWeight: 600 }}>Your Order Tracking ID</span>
            <div className="oidrow" style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center' }}>
              <span className="oid" style={{ fontSize: 18, fontWeight: 700, color: '#1f3147', letterSpacing: '1px' }}>{id}</span>
              <button
                type="button"
                className={'copybtn' + (copied ? ' done' : '')}
                onClick={copy}
                style={{
                  background: copied ? '#10b981' : '#1f3147',
                  color: '#FAF8F5',
                  border: 'none',
                  padding: '7px 14px',
                  borderRadius: 2,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '1px',
                  textTransform: 'uppercase',
                  cursor: 'pointer'
                }}
              >
                {copied ? 'COPIED ✓' : 'COPY'}
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              className="pc-cta"
              onClick={() => go('shop')}
              style={{ padding: '14px 28px', fontSize: 11.5, letterSpacing: '0.18em' }}
            >
              <span>CONTINUE SHOPPING →</span>
            </button>
            {wa && (
              <a
                href={`https://wa.me/${wa}?text=${encodeURIComponent(`Hello! I just placed order #${id}.`)}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  background: '#25D366',
                  color: '#ffffff',
                  padding: '13px 22px',
                  borderRadius: 2,
                  fontWeight: 700,
                  fontSize: 11.5,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  textDecoration: 'none',
                  boxShadow: '0 2px 10px rgba(37,211,102,0.25)'
                }}
              >
                <WhatsAppIcon size={17} variant="official" />
                <span>WhatsApp Support</span>
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const TRACK_STEPS = [
  { key: 'placed', label: 'Order Placed', labelBn: 'অর্ডার প্লেসড', icon: '📝' },
  { key: 'confirmed', label: 'Order Confirmed', labelBn: 'অর্ডার কনফার্মড', icon: '✓' },
  { key: 'shipped', label: 'In Transit', labelBn: 'কুরিয়ারে শিপমেন্ট', icon: '🚚' },
  { key: 'delivered', label: 'Delivered', labelBn: 'ডেলিভারি সম্পন্ন', icon: '🎉' },
];

function getTrackStepIndex(status: string): number {
  const s = String(status || '').toLowerCase().trim();
  if (['cancelled', 'canceled', 'return', 'returned', 'failed'].includes(s)) return -1;
  if (['delivered', 'completed', 'paid'].includes(s)) return 3;
  if (['shipped', 'in_transit', 'courier_sent', 'out_for_delivery', 'pickup_requested', 'pickup requested'].includes(s)) return 2;
  if (['approved', 'confirmed', 'processing', 'packaging', 'ready_to_ship'].includes(s)) return 1;
  return 0; // pending, placed, hold
}

const COURIERS: Record<string, (c: string) => string> = {
  steadfast: (c) => `https://steadfast.com.bd/t/${encodeURIComponent(c)}`,
  carrybee: (c) => `https://carrybee.com/tracking?consignment_id=${encodeURIComponent(c)}`,
  pathao: (c) => `https://merchant.pathao.com/tracking?consignment_id=${encodeURIComponent(c)}`,
  redx: (c) => `https://redx.com.bd/track-global-parcel/?trackingId=${encodeURIComponent(c)}`,
  paperfly: (c) => `https://go.paperfly.com.bd/track/?trackingId=${encodeURIComponent(c)}`,
};
function courierLink(cour: any): string {
  if (!cour) return '';
  if (cour.url) return cour.url;
  const key = String(cour.name || '').toLowerCase().replace(/[^a-z]/g, '');
  for (const [k, fn] of Object.entries(COURIERS)) {
    if (key.includes(k) && cour.consignment) return fn(cour.consignment);
  }
  return '';
}

function CopyMini({ text, language = 'en' }: { text: string; language?: 'en' | 'bn' }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); } catch {}
    setDone(true); setTimeout(() => setDone(false), 1500);
  };
  return (
    <button
      className="copymini"
      onClick={copy}
      style={{
        background: done ? '#10b981' : '#ffffff',
        color: done ? '#ffffff' : '#1f3147',
        border: done ? '1px solid #10b981' : '1px solid #cbd5e1',
        borderRadius: 4,
        padding: '3px 9px',
        fontSize: 11,
        fontWeight: 700,
        cursor: 'pointer',
        transition: 'all .2s ease',
      }}
    >
      {done ? (language === 'bn' ? '✓ কপি হয়েছে' : '✓ Copied') : (language === 'bn' ? 'কপি' : 'Copy')}
    </button>
  );
}

export function Track({ id: initialId }: { id?: string }) {
  const language = useStoreLanguage();
  const [id, setId] = useState(initialId || '');
  const [phone, setPhone] = useState('');
  const [res, setRes] = useState<any>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const copy = language === 'bn' ? {
    eyebrow: 'রিয়েল-টাইম কুরিয়ার ট্র্যাকিং', title: 'আপনার অর্ডার ট্র্যাক করুন',
    intro: 'অর্ডার আইডি অথবা ফোন নম্বর দিয়ে অর্ডারের সর্বশেষ অবস্থা ও কুরিয়ার ট্র্যাকিং দেখুন।',
    orderId: 'অর্ডার আইডি', phone: 'ফোন নম্বর', orderPlaceholder: 'যেমন: DOT-83BE276D',
    phonePlaceholder: 'যেমন: 018XXXXXXXX', search: 'অর্ডার ট্র্যাক করুন', searching: 'অর্ডার খোঁজা হচ্ছে…',
    needInput: 'অর্ডার আইডি অথবা ফোন নম্বর লিখুন',
  } : {
    eyebrow: 'Real-Time Courier Tracking', title: 'Track Your Order',
    intro: 'Enter your order ID or phone number to view the latest order status and courier tracking details.',
    orderId: 'Order ID', phone: 'Phone Number', orderPlaceholder: 'e.g. DOT-83BE276D',
    phonePlaceholder: 'e.g. 018XXXXXXXX', search: 'Track My Order', searching: 'Searching orders…',
    needInput: 'Please enter your Order ID or Phone number',
  };

  const lookup = async (targetId?: string, targetPhone?: string, quiet?: boolean) => {
    const searchId = targetId !== undefined ? targetId : id;
    const searchPhone = targetPhone !== undefined ? targetPhone : phone;
    if (!searchId.trim() && !searchPhone.trim()) {
      if (!quiet) setErr(copy.needInput);
      return;
    }
    try {
      const q = new URLSearchParams();
      if (searchId.trim()) q.set('id', searchId.trim());
      if (searchPhone.trim()) q.set('phone', searchPhone.trim());
      const r = await fetch(`/api/track?${q.toString()}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Order not found');
      setRes(d);
      setErr('');
    } catch (e: any) {
      if (!quiet) {
        setErr(e.message || 'Order not found');
        setRes(null);
      }
    }
  };

  const submit = async () => {
    setErr('');
    setBusy(true);
    await lookup();
    setBusy(false);
  };

  // Auto-fill from URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlId = params.get('id') || params.get('order') || initialId || '';
    const urlPhone = params.get('phone') || '';
    if (urlId) setId(urlId);
    if (urlPhone) setPhone(urlPhone);
    if (urlId || urlPhone) {
      setBusy(true);
      lookup(urlId, urlPhone, true).finally(() => setBusy(false));
    }
  }, [initialId]);

  // Once an order is shown, re-check every 25s for live courier status
  useEffect(() => {
    if (!res) return;
    const t = setInterval(() => lookup(id, phone, true), 25000);
    return () => clearInterval(t);
  }, [res?.id, id, phone]);

  return (
    <div className="page" style={{ minHeight: '80vh', paddingBottom: 70, background: '#FAF8F5' }}>
      <div className="wrap" style={{ maxWidth: 780, margin: '0 auto', padding: '0 20px' }}>
        <div className="phead tracking-heading" style={{ padding: '24px 0 20px', textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#b49664', marginBottom: 8 }}>
            <span>📦</span> {copy.eyebrow}
          </div>
          <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontSize: 'clamp(28px, 4vw, 38px)', color: '#1f3147', letterSpacing: '-0.02em', margin: 0 }}>
            {copy.title}
          </h1>
          <p style={{ color: '#6b645c', marginTop: 10, fontSize: 14.5, maxWidth: 460, margin: '10px auto 0' }}>
            {copy.intro}
          </p>
        </div>

        <div
          className="tracking-card"
          style={{
            background: '#ffffff',
            borderRadius: 12,
            padding: 24,
            border: '1px solid #EAE5DC',
            boxShadow: '0 4px 20px rgba(31, 49, 71, 0.05)',
          }}
        >
          <div className="track-form">
            <div style={{ flex: 1, minWidth: 200 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#1f3147', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {copy.orderId}
              </label>
              <input
                className="field"
                placeholder={copy.orderPlaceholder}
                value={id}
                onChange={(e) => setId(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                style={{ width: '100%', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#1f3147', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {copy.phone}
              </label>
              <input
                className="field"
                placeholder={copy.phonePlaceholder}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                style={{ width: '100%', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', width: '100%' }}>
              <button
                className="btn"
                disabled={busy}
                onClick={submit}
                style={{
                  width: '100%',
                  background: '#1f3147',
                  color: '#FAF8F5',
                  padding: '14px',
                  borderRadius: 6,
                  fontWeight: 700,
                  fontSize: 13,
                  letterSpacing: '1px',
                  textTransform: 'uppercase',
                  border: 'none',
                  cursor: busy ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: 8,
                  boxShadow: '0 4px 14px rgba(31,49,71,0.2)',
                }}
              >
                <span>{busy ? copy.searching : copy.search}</span>
              </button>
            </div>
          </div>

          {err && (
            <div
              style={{
                marginTop: 16,
                padding: '12px 16px',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: 8,
                color: '#991b1b',
                fontSize: 13.5,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span>⚠️</span>
              <span>{err}</span>
            </div>
          )}
        </div>

        {res && <TrackResult o={res} language={language} />}
      </div>
    </div>
  );
}

function TrackResult({ o, language }: { o: any; language: 'en' | 'bn' }) {
  const bn = language === 'bn';
  const cancelled = ['cancelled', 'canceled', 'return', 'returned', 'failed'].includes(String(o.status || '').toLowerCase());
  const returned = String(o.status || '').toLowerCase() === 'return' || String(o.status || '').toLowerCase() === 'returned';
  const special = cancelled || returned;
  const idx = getTrackStepIndex(o.status);
  const rawStatus = String(o.status || 'pending').toLowerCase();
  const statusText: Record<string, string> = bn
    ? { delivered: 'ডেলিভারি সম্পন্ন', shipped: 'কুরিয়ারে পাঠানো', approved: 'নিশ্চিত', confirmed: 'নিশ্চিত', hold: 'স্থগিত', cancelled: 'বাতিল', canceled: 'বাতিল', return: 'ফেরত', returned: 'ফেরত', pending: 'অপেক্ষমাণ', placed: 'গ্রহণ করা হয়েছে' }
    : { delivered: 'DELIVERED', shipped: 'SHIPPED', approved: 'APPROVED', confirmed: 'CONFIRMED', hold: 'ON HOLD', cancelled: 'CANCELLED', canceled: 'CANCELLED', return: 'RETURNED', returned: 'RETURNED', pending: 'PENDING', placed: 'PLACED' };
  const date = new Date(o.createdAt).toLocaleDateString(bn ? 'bn-BD' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  // Status Badge Configuration
  const getBadge = () => {
    const s = String(o.status || '').toLowerCase();
    if (s === 'delivered') return { label: bn ? 'ডেলিভারি সম্পন্ন' : 'Delivered', bg: '#dcfce7', color: '#15803d', border: '#bbf7d0', icon: '🎉' };
    if (s === 'shipped') return { label: bn ? 'কুরিয়ারে পাঠানো হয়েছে' : 'In Transit / Shipped', bg: '#dbeafe', color: '#1e40af', border: '#bfdbfe', icon: '🚚' };
    if (s === 'approved' || s === 'confirmed') return { label: bn ? 'অর্ডার নিশ্চিত হয়েছে' : 'Order Approved & Confirmed', bg: '#d1fae5', color: '#065f46', border: '#a7f3d0', icon: '✓' };
    if (s === 'hold') return { label: bn ? 'অর্ডার স্থগিত' : 'Order on Hold', bg: '#fef3c7', color: '#92400e', border: '#fde68a', icon: '⏸️' };
    if (cancelled) return { label: bn ? 'অর্ডার বাতিল' : 'Order Cancelled', bg: '#fee2e2', color: '#991b1b', border: '#fecaca', icon: '✕' };
    return { label: bn ? 'অর্ডার গ্রহণ করা হয়েছে' : 'Order Placed', bg: '#fef3c7', color: '#854d0e', border: '#fde68a', icon: '⏳' };
  };
  const badge = getBadge();

  return (
    <div
      style={{
        marginTop: 28,
        border: '1.5px solid rgba(180, 150, 100, 0.45)',
        borderRadius: 12,
        padding: '32px 28px',
        background: '#ffffff',
        boxShadow: '0 8px 30px rgba(31, 49, 71, 0.08)',
        color: '#1f3147',
      }}
    >
      {/* Top Order Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 14, borderBottom: '1px solid #EAE5DC', paddingBottom: 20 }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#8c7d6b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{bn ? 'অর্ডার আইডি:' : 'Order ID:'}</span>
            <code style={{ fontSize: 15, fontWeight: 800, color: '#1f3147', background: '#FAF8F5', padding: '2px 8px', borderRadius: 4, border: '1px solid #EAE5DC' }}>
              {o.id}
            </code>
            <CopyMini text={o.id} language={language} />
          </div>
          <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontSize: 24, margin: '8px 0 4px', color: '#1f3147' }}>
            {badge.label}
          </h2>
          <p style={{ color: '#6b645c', fontSize: 13.5, margin: 0 }}>
            {bn ? 'অর্ডারের তারিখ:' : 'Order placed:'} <b>{date}</b> • {bn ? 'ক্যাশ অন ডেলিভারি' : 'Cash on Delivery'}
          </p>
        </div>

        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: badge.bg, color: badge.color, border: `1.5px solid ${badge.border}`, borderRadius: 100, fontSize: 13, fontWeight: 700 }}>
          <span>{badge.icon}</span>
          <span>{statusText[rawStatus] || (bn ? o.status : String(o.status || 'pending').toUpperCase())}</span>
        </div>
      </div>

      {/* Visual Stepper */}
      {!special ? (
        <div style={{ margin: '36px 0 32px' }}>
          <div style={{ display: 'flex', position: 'relative' }}>
            {TRACK_STEPS.map((s, i) => {
              const isPassed = i <= idx;
              const isCurrent = i === idx;
              return (
                <div key={s.key} style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  {/* Connecting Line */}
                  {i > 0 && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 14,
                        left: '-50%',
                        width: '100%',
                        height: 3,
                        background: isPassed ? '#1f3147' : '#EAE5DC',
                        transition: 'background .3s ease',
                        zIndex: 1,
                      }}
                    />
                  )}

                  {/* Dot / Icon */}
                  <div
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: '50%',
                      background: isPassed ? '#1f3147' : '#ffffff',
                      border: isPassed ? '2px solid #1f3147' : '2px solid #cbd5e1',
                      color: isPassed ? '#ffffff' : '#94a3b8',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: isPassed ? 13 : 12,
                      fontWeight: 700,
                      position: 'relative',
                      zIndex: 2,
                      boxShadow: isCurrent ? '0 0 0 4px rgba(31,49,71,0.18)' : 'none',
                      transition: 'all .25s ease',
                    }}
                  >
                    {isPassed ? (i === idx && i !== 3 ? '✓' : s.icon) : (i + 1)}
                  </div>

                  {/* Label */}
                  <div style={{ textAlign: 'center', marginTop: 10 }}>
                    <div style={{ fontSize: 12.5, fontWeight: isPassed ? 700 : 500, color: isPassed ? '#1f3147' : '#94a3b8' }}>
                      {bn ? ['অর্ডার গ্রহণ', 'অর্ডার নিশ্চিত', 'কুরিয়ারে পাঠানো', 'ডেলিভারি সম্পন্ন'][i] : s.label}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div style={{ margin: '24px 0', padding: 18, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#991b1b', textAlign: 'center', fontWeight: 600 }}>
          {cancelled
            ? (bn ? 'এই অর্ডারটি বাতিল করা হয়েছে। ভুলবশত হয়ে থাকলে আমাদের সাপোর্ট টিমের সঙ্গে যোগাযোগ করুন।' : 'This order has been cancelled. If you think this is a mistake, please contact our support team.')
            : (bn ? 'এই পার্সেলটি ফেরত পাঠানো হচ্ছে। আরও তথ্যের জন্য আমাদের সঙ্গে যোগাযোগ করুন।' : 'This parcel is being returned. Please contact us if you need more information.')}
        </div>
      )}

      {/* Courier Details Card */}
      {o.courier && o.courier.name && (
        <div
          style={{
            marginTop: 24,
            padding: '22px 24px',
            background: '#f8fafc',
            borderRadius: 10,
            border: '1.5px solid #cbd5e1',
            boxShadow: '0 2px 10px rgba(0,0,0,0.02)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18 }}>🚚</span>
              <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#1f3147' }}>
                {bn ? 'ডেলিভারি কুরিয়ার পার্টনার' : 'Delivery Courier Partner'}
              </span>
            </div>
            {o.courier.liveStatus && (
              <span style={{ background: '#dbeafe', color: '#1e40af', border: '1px solid #bfdbfe', padding: '4px 12px', borderRadius: 100, fontSize: 12, fontWeight: 700 }}>
                {o.courier.liveStatus}
              </span>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, fontSize: 13.5 }}>
            <div>
              <span style={{ color: '#64748b', fontSize: 12 }}>{bn ? 'কুরিয়ার কোম্পানি:' : 'Courier Company:'}</span>
              <div style={{ fontWeight: 700, color: '#1f3147', fontSize: 15, marginTop: 2 }}>{o.courier.name}</div>
            </div>

            {o.courier.consignment && (
              <div>
                <span style={{ color: '#64748b', fontSize: 12 }}>{bn ? 'ট্র্যাকিং / কনসাইনমেন্ট আইডি:' : 'Tracking / Consignment ID:'}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                  <code style={{ fontWeight: 700, color: '#0f172a', background: '#ffffff', padding: '3px 8px', borderRadius: 4, border: '1px solid #cbd5e1', fontSize: 14 }}>
                    {o.courier.consignment}
                  </code>
                  <CopyMini text={o.courier.consignment} language={language} />
                </div>
              </div>
            )}

            {o.courier.phone && (
              <div>
                <span style={{ color: '#64748b', fontSize: 12 }}>{bn ? 'কুরিয়ার হেল্পলাইন:' : 'Courier Helpline:'}</span>
                <div style={{ marginTop: 2 }}>
                  <a href={'tel:' + o.courier.phone} style={{ color: '#2563eb', fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
                    📞 {o.courier.phone}
                  </a>
                </div>
              </div>
            )}
          </div>

          {o.courier.riderNote && (
            <div style={{ marginTop: 14, padding: '10px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, fontSize: 13, color: '#92400e' }}>
              <b>🛵 {bn ? 'রাইডারের নোট:' : 'Rider Note:'}</b> {o.courier.riderNote}
            </div>
          )}

          {courierLink(o.courier) && (
            <a
              href={courierLink(o.courier)}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                marginTop: 16,
                padding: '11px 20px',
                background: '#1f3147',
                color: '#ffffff',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 700,
                textDecoration: 'none',
                boxShadow: '0 2px 8px rgba(31,49,71,0.2)',
              }}
            >
              <span>{bn ? `${o.courier.name} এর অফিসিয়াল ওয়েবসাইটে লাইভ ট্র্যাক করুন` : `Track Live on ${o.courier.name} Official Website`}</span>
              <span>→</span>
            </a>
          )}
        </div>
      )}

      {/* Order Activity & Timeline */}
      {Array.isArray(o.history) && o.history.length > 0 && (
        <div style={{ marginTop: 24, padding: '20px 22px', background: '#ffffff', borderRadius: 10, border: '1px solid #EAE5DC', boxShadow: '0 2px 10px rgba(0,0,0,0.02)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#1f3147', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>📜</span> {bn ? 'অর্ডারের কার্যক্রম ও সময়রেখা' : 'Order Activity &amp; Timeline'}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {o.history.map((h: any, i: number) => {
              const isLatest = i === o.history.length - 1;
              return (
                <div key={i} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                  <div
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: '50%',
                      background: isLatest ? '#10b981' : '#1f3147',
                      marginTop: 4,
                      flexShrink: 0,
                      boxShadow: isLatest ? '0 0 0 4px rgba(16,185,129,0.2)' : 'none',
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 6 }}>
                      <span style={{ textTransform: 'capitalize', fontWeight: 700, color: '#1f3147', fontSize: 13.5 }}>
                        {h.status === 'approved' ? (bn ? 'অর্ডার নিশ্চিত' : 'Order Confirmed') : h.status === 'pending' ? (bn ? 'অর্ডার গ্রহণ' : 'Order Placed') : h.status === 'shipped' ? (bn ? 'কুরিয়ারে হস্তান্তর' : 'Handed over to Courier') : h.status}
                      </span>
                      <span style={{ fontSize: 11.5, color: '#64748b', fontWeight: 500 }}>
                        {new Date(h.at).toLocaleDateString(bn ? 'bn-BD' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} • {new Date(h.at).toLocaleTimeString(bn ? 'bn-BD' : 'en-US', { hour: 'numeric', minute: '2-digit' })}
                      </span>
                    </div>
                    {h.note && (
                      <div style={{ fontSize: 12.5, color: '#475569', marginTop: 4, background: '#f8fafc', padding: '6px 12px', borderRadius: 6, border: '1px solid #e2e8f0', display: 'inline-block' }}>
                        {h.note}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Customer Delivery Details & Support */}
      {o.customer && (
        <div style={{ marginTop: 22, padding: '18px 22px', background: '#FAF8F5', borderRadius: 10, border: '1px solid #EAE5DC', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8c7d6b' }}>
              {bn ? 'ডেলিভারির ঠিকানা' : 'Delivery Destination'}
            </div>
            <div style={{ fontWeight: 700, color: '#1f3147', fontSize: 14, marginTop: 4 }}>
              {o.customer.name} {o.customer.phone && `(${o.customer.phone})`}
            </div>
            <div style={{ color: '#475569', fontSize: 13, marginTop: 2 }}>
              {[o.customer.address, o.customer.district].filter(Boolean).join(', ')}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <a
              href={`https://wa.me/8801633617136?text=${encodeURIComponent(`Hi METRROMA, I am inquiring about my order ${o.id}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background: '#25D366',
                color: '#ffffff',
                padding: '9px 16px',
                borderRadius: 6,
                fontSize: 12.5,
                fontWeight: 700,
                textDecoration: 'none',
                boxShadow: '0 2px 8px rgba(37,211,102,0.25)',
              }}
            >
              <WhatsAppIcon size={16} variant="official" />
              <span>{bn ? 'হোয়াটসঅ্যাপ সাপোর্ট' : 'WhatsApp Support'}</span>
            </a>
            <a
              href="tel:01633617136"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background: '#ffffff',
                color: '#1f3147',
                border: '1px solid #cbd5e1',
                padding: '9px 16px',
                borderRadius: 6,
                fontSize: 12.5,
                fontWeight: 700,
                textDecoration: 'none',
              }}
            >
              <span>📞 {bn ? 'হটলাইনে কল করুন' : 'Call Hotline'}</span>
            </a>
          </div>
        </div>
      )}

      {/* Items Summary & Total */}
      <div className="trk-items" style={{ marginTop: 24, borderTop: '1px solid #EAE5DC', paddingTop: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8c7d6b', marginBottom: 12 }}>
          {bn ? 'অর্ডারের পণ্যের বিবরণ' : 'Order Items Summary'}
        </div>
        {o.items.map((it: any) => (
          <div className="sl" key={it.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px dashed rgba(180, 150, 100, 0.25)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {it.image && (
                <img src={it.image} alt={it.name} style={{ width: 48, height: 48, borderRadius: 6, objectFit: 'cover', border: '1px solid #EAE5DC' }} />
              )}
              <div>
                <span style={{ fontWeight: 700, color: '#1f3147', fontSize: 14 }}>{it.name}</span>
                <div style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>{bn ? 'পরিমাণ:' : 'Quantity:'} {it.qty}</div>
              </div>
            </div>
            <span style={{ fontWeight: 700, color: '#1f3147', fontSize: 15 }}>{taka(it.subtotal || it.price * it.qty)}</span>
          </div>
        ))}

        {o.delivery != null && (
          <div className="sl" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, color: '#64748b', padding: '10px 0' }}>
            <span>{bn ? `হোম ডেলিভারি চার্জ (${o.customer?.area === 'inside' ? 'ঢাকার ভিতরে' : 'ঢাকার বাইরে'})` : `Home Delivery Charge (${o.customer?.area === 'inside' ? 'Inside Dhaka' : 'Outside Dhaka'})`}</span>
            <span style={{ fontWeight: 600, color: '#1f3147' }}>{taka(o.delivery)}</span>
          </div>
        )}

        <div className="tot" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderTop: '2px solid #1f3147', marginTop: 14, paddingTop: 16 }}>
          <div>
            <span style={{ fontSize: 16, fontWeight: 800, color: '#1f3147', display: 'block' }}>{bn ? 'সর্বমোট পরিশোধযোগ্য' : 'Total Payable Amount'}</span>
            <span style={{ fontSize: 12, color: '#64748b' }}>{bn ? 'পণ্য হাতে পেয়ে মূল্য পরিশোধ করুন।' : 'Pay when your order is delivered.'}</span>
          </div>
          <b style={{ fontFamily: "'Inter', sans-serif", fontWeight: 800, fontSize: 26, color: '#1f3147' }}>{taka(o.total)}</b>
        </div>
      </div>
    </div>
  );
}

const SYN: Record<string, string[]> = {
  lube: ['oil', 'warming'], oil: ['warming'], sex: ['intimates', 'warming'], intimate: ['intimates'],
  face: ['serum', 'moisturiser', 'cleanser'], wash: ['cleanser', 'body'], cream: ['moisturiser', 'balm'],
  moisturizer: ['moisturiser'], lotion: ['balm', 'moisturiser'], glow: ['serum', 'moisturiser'],
};
function smartSearch(items: Product[], q: string): Product[] {
  const query = q.trim().toLowerCase();
  if (!query) return [];
  const cleanHex = query.replace(/#/g, '');
  const terms = query.split(/\s+/);
  const scored: { p: Product; score: number }[] = [];

  for (const p of items) {
    const name = p.name.toLowerCase();
    const colorNames = (p.colors || []).map((c) => (typeof c === 'string' ? c : c.name)).join(' ').toLowerCase();
    const colorHexes = (p.colors || []).map((c) => (typeof c === 'object' && c.hex ? c.hex : '')).join(' ').toLowerCase();
    const cleanColorHexes = colorHexes.replace(/#/g, '');
    const varColors = (p.variations || []).map((v) => `${v.color || ''} ${v.colorHex || ''}`).join(' ').toLowerCase();
    const varSizes = (p.variations || []).map((v) => v.size || '').join(' ').toLowerCase();
    const sizes = (p.sizes || []).join(' ').toLowerCase();

    const hay = `${p.name} ${p.desc} ${p.shortDesc || ''} ${p.category} ${p.tag || ''} ${p.sku || ''} ${p.size || ''} ${colorNames} ${colorHexes} ${cleanColorHexes} ${varColors} ${varSizes} ${sizes}`.toLowerCase();

    const hexMatch = (cleanHex.length >= 3 && cleanColorHexes.includes(cleanHex)) || (colorHexes.includes(query));
    const match = hexMatch || terms.every((t) => hay.includes(t) || (SYN[t] || []).some((s) => hay.includes(s)));
    if (!match) continue;

    let score = 0;
    if (name.startsWith(query)) score += 100;
    else if (name.includes(query)) score += 60;
    if (terms.every((t) => name.includes(t))) score += 30;
    if (colorNames.includes(query) || varColors.includes(query)) score += 50; // High relevance for color search
    if (hexMatch) score += 70; // High relevance for color hex search
    if (varSizes.includes(query) || sizes.includes(query)) score += 40; // High relevance for size search
    if (p.tag === 'bestseller') score += 3;
    scored.push({ p, score });
  }
  return scored.sort((a, b) => b.score - a.score).map((s) => s.p).slice(0, 8);
}
export function SearchOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [all, setAll] = useState<Product[]>([]);
  const [q, setQ] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) { getProducts().then(setAll).catch(() => {}); setTimeout(() => inputRef.current?.focus(), 60); }
    else setQ('');
  }, [open]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (open) addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [open, onClose]);
  const results = useMemo(() => smartSearch(all, q), [all, q]);
  if (!open) return null;
  const open2 = (slug: string) => { onClose(); go('product/' + slug); };
  return (
    <div className="searchwrap" onClick={onClose}>
      <div className="searchbox" onClick={(e) => e.stopPropagation()}>
        <div className="searchfield">
          <svg viewBox="0 0 24 24" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.4-3.4" /></svg>
          <input ref={inputRef} placeholder="search products…" value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && results[0]) open2(results[0].slug); }} />
          <button className="sclose" onClick={onClose}>esc</button>
        </div>
        <div className="sresults">
          {q.trim() === '' && <div className="shint">try &ldquo;serum&rdquo;, &ldquo;cleanser&rdquo;, &ldquo;sunscreen&rdquo;, &ldquo;moisturizer&rdquo;, &ldquo;niacinamide&rdquo;…</div>}
          {q.trim() !== '' && results.length === 0 && <div className="shint">no matches for &ldquo;{q}&rdquo;.</div>}
          {results.map((p) => (
            <a className="sresult" key={p.id} onClick={() => open2(p.slug)}>
              <img src={p.image} alt="" />
              <div className="si">
                <div className="sn">{p.name}{p.adult && <span className="s18">18+</span>}</div>
                <div className="sd">{p.category} — {p.desc}</div>
              </div>
              <div className="sp">{taka(p.price)}</div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
