import { useEffect, useState, useMemo, useRef } from 'react';
import { getProducts, getCategories, getProduct, placeOrder, getSettings, validateCoupon, fetchReviews, postReview, getSource, taka, getDeviceId, isSkincareSite, type Product, type Category, type Settings, type Review } from './api';
import { useCart, go, useAge } from './cart';
import { useCustomer } from './CustomerAccount';
import { BD_GEO } from './bd-geo';
import { ecView, ecBeginCheckout, ecPurchase, dl } from './analytics';
import { WhatsAppIcon } from './icons';

export function formatProductDescription(raw?: string): string {
  if (!raw || typeof raw !== 'string') return '';
  const trimmed = raw.trim();
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

  return (
    <article className="product-card" onClick={() => go('product/' + p.slug)}>
      {/* Tabaya Gold Corner Accents */}
      <div className="pc-corner-tr" />
      <div className="pc-corner-bl" />

      {/* Badges Stack (No overlap) */}
      <div className="pc-badges-col">
        {p.soldOut ? (
          <span className="pc-badge-save out">SOLD OUT</span>
        ) : onSale ? (
          <span className="pc-badge-save">-{salePercent}% OFF</span>
        ) : null}
        {p.isDigital ? (
          <span className="pc-badge-tag" style={{ background: '#10b981', color: '#fff', fontWeight: 700 }}>⚡ DIGITAL · ৳0 DELIVERY</span>
        ) : p.category === 'sunglass' ? (
          <span className="pc-badge-tag" style={{ background: '#1f2937', color: '#f9fafb' }}>🕶️ UV400 POLARIZED</span>
        ) : p.category === 'watch' ? (
          <span className="pc-badge-tag" style={{ background: '#b48e4c', color: '#fff' }}>⌚ TIMEPIECE</span>
        ) : p.category === 'gift' ? (
          <span className="pc-badge-tag" style={{ background: '#8B1E1E', color: '#fff' }}>🎁 GIFT SET</span>
        ) : p.category === 'cloth' ? (
          <span className="pc-badge-tag" style={{ background: '#2563eb', color: '#fff' }}>👔 APPAREL</span>
        ) : p.category === 'accessories' ? (
          <span className="pc-badge-tag" style={{ background: '#4b5563', color: '#fff' }}>👜 ACCESSORIES</span>
        ) : p.tag ? (
          <span className="pc-badge-tag">{p.tag}</span>
        ) : null}
      </div>

      {/* Image */}
      <div className="pc-image-wrap">
        <img ref={imgRef} className="pc-image" src={currentCardImage} alt={p.name} loading="lazy" style={p.soldOut ? { opacity: 0.55 } : undefined} />
      </div>

      {/* Card Content */}
      <div className="pc-content">
        <div className="pc-divider" />
        <div className="pc-eyebrow">{p.category ? p.category.replace(/-/g, ' ') : 'EXCLUSIVE COLLECTION'}</div>
        <a className="pc-title">{p.name}</a>

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
              {selSize ? `Size: ${selSize}` : 'Select size'}
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
          <span>{p.soldOut ? 'SOLD OUT' : added ? 'ADDED TO BAG ✓' : 'ADD TO CART'}</span>
        </button>
      </div>
    </article>
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
  const [data, setData] = useState<{ count: number; avg: number; reviews: Review[] }>({ count: 0, avg: 0, reviews: [] });
  const [form, setForm] = useState({ name: '', rating: 5, text: '' });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const load = () => fetchReviews(productId).then(setData).catch(() => {});
  useEffect(() => { load(); }, [productId]);
  const submit = async () => {
    if (!form.name.trim()) return;
    setBusy(true);
    try { await postReview({ productId, name: form.name.trim(), rating: form.rating, text: form.text.trim() }); setForm({ name: '', rating: 5, text: '' }); setDone(true); setTimeout(() => setDone(false), 2500); load(); } catch {}
    finally { setBusy(false); }
  };
  return (
    <section className="revs">
      <div className="shd"><h2>reviews{data.count ? ` · ${data.avg} ★ (${data.count})` : ''}</h2></div>
      <div className="revgrid">
        <div className="revlist">
          {data.reviews.length === 0 && <p className="dim">no reviews yet — be the first.</p>}
          {data.reviews.map((r) => (
            <div className="rev" key={r.id}>
              <div className="revh"><Stars n={r.rating} /><span className="dim">{r.name}</span></div>
              {r.text && <p>{r.text}</p>}
            </div>
          ))}
        </div>
        <div className="revform">
          <h4>leave a review</h4>
          <div className="ratepick">{[1, 2, 3, 4, 5].map((n) => <button key={n} className={n <= form.rating ? 'on' : ''} onClick={() => setForm((s) => ({ ...s, rating: n }))}>★</button>)}</div>
          <input className="field" placeholder="your name" value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} />
          <textarea className="field" placeholder="your thoughts (optional)" value={form.text} onChange={(e) => setForm((s) => ({ ...s, text: e.target.value }))} />
          <button className="btn full" disabled={busy} onClick={submit}>{busy ? 'posting…' : done ? 'thank you ✓' : 'post review'}</button>
        </div>
      </div>
    </section>
  );
}

function Related({ product }: { product: Product }) {
  const [items, setItems] = useState<Product[]>([]);
  useEffect(() => { getProducts(product.category).then((all) => setItems(all.filter((p) => p.id !== product.id).slice(0, 4))).catch(() => {}); }, [product.id]);
  if (items.length === 0) return null;
  return (
    <section>
      <div className="shd"><h2>you may also like</h2></div>
      <div className="grid">{items.map((p) => <ProductCard key={p.id} p={p} />)}</div>
    </section>
  );
}

const INFO: Record<string, { title: string; body: string[] }> = {
  shipping: { title: 'shipping & delivery', body: ['We deliver nationwide across Bangladesh through trusted express couriers. Inside Dhaka usually arrives in 24–48 hours, outside Dhaka in 2–3 business days.', 'You pay cash on delivery when your order reaches your doorstep. You can inspect the parcel before acceptance.'] },
  returns: { title: 'returns & exchanges', body: ['We offer a 7-day hassle-free exchange policy. If the size, color, or fit is not ideal, message our support team with your order ID.', 'We will immediately arrange a replacement sent to your doorstep.'] },
  contact: { title: 'contact customer support', body: ['Questions about an order or a product? Our customer care team is here to assist you 7 days a week, 10:00 AM – 10:00 PM.', 'Call our helpline or message us directly on WhatsApp using the button below.'] },
  about: { title: 'about SECRATE', body: ['SECRATE is a premium botanical skincare and personal wellness brand dedicated to pure, clinical-grade formulations.', 'From gentle hydrating cleansers and concentrated antioxidant serums to intimate wellness care and daily self-care essentials — we deliver authentic, dermatologically tested care across Bangladesh with doorstep cash on delivery.'] },
  privacy: { title: 'privacy policy', body: ['Your details are used strictly to process and deliver your order. We never sell or share your personal information with third parties.'] },
  terms: { title: 'terms of service', body: ['By placing an order you confirm that your shipping details and contact number are accurate.', 'All prices are in BDT and payable via Cash on Delivery upon receiving your package.'] },
  journal: { title: 'the journal', body: ['Style guides, fabric care notes & lifestyle stories — coming soon.'] },
};
export function InfoPage({ slug }: { slug: string }) {
  const info = INFO[slug] || { title: 'page', body: ['coming soon.'] };
  const [wa, setWa] = useState('');
  useEffect(() => {
    getSettings().then((s) => { if (s.whatsapp) setWa(s.whatsapp); }).catch(() => {});
  }, []);
  return (
    <div className="page"><div className="wrap" style={{ maxWidth: 760 }}>
      <span className="back" onClick={() => (history.length > 1 ? history.back() : go('home'))}>← back</span>
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
            <span>Chat on WhatsApp</span>
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
      <section className="tabaya-hero">
        <div className="tabaya-hero-bg">
          <picture>
            {isSkin && <source media="(max-width: 768px)" srcSet="/uploads/banner_secrate_mobile.webp" />}
            <img
              src={isSkin
                ? '/uploads/banner_secrate_desktop.webp'
                : 'https://tabaya.com/cdn/shop/files/Cover_01.png?v=1778416287&width=1920'}
              alt={isSkin ? 'Botanical Skincare & Essentials' : 'Contemporary Modest Living'}
              onError={(e: any) => {
                e.currentTarget.src = isSkin
                  ? 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?auto=format&fit=crop&w=1920&q=85'
                  : 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=1920&q=85';
              }}
            />
          </picture>
        </div>
        <div className="tabaya-hero-overlay" />
        <div className="wrap tabaya-hero-wrap">
          <div className="tabaya-hero-card">
            <span className="tabaya-hero-badge">
              {isSkin ? '🌿 DERMATOLOGICALLY CRAFTED · BOTANICAL CARE' : 'NEW ARRIVALS · 2026 COLLECTION'}
            </span>
            <h1 className="tabaya-hero-title serif">
              {isSkin ? (
                <>
                  Pure Botanical Radiance<br />
                  <span className="it" style={{ color: '#d4af37' }}>Elevated Everyday Skincare</span>
                </>
              ) : (
                <>
                  Timeless Elegance & Modesty<br />
                  <span className="it" style={{ color: '#b48e4c' }}>Contemporary Modest Living</span>
                </>
              )}
            </h1>
            <p className="tabaya-hero-desc">
              {isSkin
                ? 'Nourish your skin barrier with clinically-inspired botanical cleansers, hydrating serums, and restorative moisture balms. Cash on delivery nationwide.'
                : 'A bespoke blend of sheer comfort and refined fabrics. Designed to exude understated elegance, graceful silhouettes, and modern aesthetic.'}
            </p>
            <div className="tabaya-hero-btns">
              <button className="tabaya-btn primary" onClick={() => go(isSkin ? 'shop/skincare' : 'shop')}>
                {isSkin ? 'EXPLORE SKINCARE →' : 'EXPLORE COLLECTIONS →'}
              </button>
              <button className="tabaya-btn outline" onClick={() => go(isSkin ? 'shop' : 'shop/modest-wear')}>
                {isSkin ? 'ALL PRODUCTS' : 'MODEST ABAYAS'}
              </button>
            </div>
            <div className="tabaya-hero-micro">
              <span>🚚 Cash on Delivery Nationwide</span>
              <span>{isSkin ? '🌿 100% Authentic Quality Guaranteed' : '🔒 100% Satisfaction Guarantee'}</span>
            </div>
          </div>
        </div>
      </section>
    );
  }

  const s = activeSlides[cur] || activeSlides[0];

  return (
    <section
      className="tabaya-hero"
      style={{ position: 'relative', overflow: 'hidden' }}
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
            style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'opacity 0.6s ease-in-out' }}
          />
        </picture>
      </div>
      <div className="tabaya-hero-overlay" />

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
          {s.badge && <span className="tabaya-hero-badge">{s.badge}</span>}
          {s.title && (
            <h1 className="tabaya-hero-title serif">
              {s.title}
              {s.subtitle && (
                <>
                  <br />
                  <span className="it" style={{ color: '#b48e4c' }}>{s.subtitle}</span>
                </>
              )}
            </h1>
          )}
          {s.description && (
            <p className="tabaya-hero-desc">{s.description}</p>
          )}
          <div className="tabaya-hero-btns">
            <button
              className="tabaya-btn primary"
              onClick={() => go(s.btnLink || 'shop')}
            >
              {s.btnText || 'SHOP NOW →'}
            </button>
            <button className="tabaya-btn outline" onClick={() => go('shop')}>
              ALL COLLECTIONS
            </button>
          </div>
          <div className="tabaya-hero-micro">
            <span>🚚 Cash on Delivery Nationwide</span>
            <span>🔒 100% Satisfaction Guarantee</span>
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

export function Home() {
  const { openAuth } = useCustomer();
  const [products, setProducts] = useState<Product[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [cats, setCats] = useState<Category[]>([]);
  const [sliders, setSliders] = useState<any[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [subEmail, setSubEmail] = useState('');
  const [subbed, setSubbed] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  useEffect(() => {
    getProducts().then((d) => { setProducts(d); setLoaded(true); }).catch(() => setLoaded(true));
    getCategories().then(setCats).catch(() => {});
    getSettings().then((s) => {
      setSettings(s);
      if (Array.isArray(s.sliders)) setSliders(s.sliders);
    }).catch(() => {});
  }, []);

  const isSkin = isSkincareSite();

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

  const [activeTabCat, setActiveTabCat] = useState('all');

  const filteredBest = useMemo(() => {
    if (activeTabCat === 'all') return best;
    return best.filter((p) => {
      const cat = (p.category || '').toLowerCase();
      if (activeTabCat === 'digital') return p.isDigital || cat === 'digital';
      return cat === activeTabCat;
    });
  }, [best, activeTabCat]);

  const faqs = isSkin
    ? [
        {
          q: 'How do I choose the right skincare routine for my skin type?',
          a: 'Our Silk Cleansing Gel and Daily Moisturiser are gentle and universal for all skin types, including sensitive skin. For deep hydration and visible radiance, pair them with our Hydrating Serum in the morning and Glow Night Oil before bed.',
        },
        {
          q: 'Can I open and inspect the parcel before paying?',
          a: 'Yes, absolutely! We encourage all our valued customers to inspect the outer packaging and bottle seals in front of the courier delivery agent before making cash on delivery payment.',
        },
        {
          q: 'What are the delivery charges and delivery times?',
          a: `Delivery inside Dhaka is typically 24–48 hours (${settings ? taka(settings.deliveryInside) : '৳80'}). Delivery outside Dhaka takes 2–4 business days (${settings ? taka(settings.deliveryOutside) : '৳130'}). Orders above ${settings ? taka(settings.freeShipThreshold) : '৳2,500'} qualify for 100% Free Nationwide Delivery.`,
        },
        {
          q: 'Are these products safe for sensitive and acne-prone skin?',
          a: 'Yes. Every formulation is crafted with gentle botanical extracts and non-comedogenic ingredients without harsh parabens or heavy synthetic fragrances. We recommend doing a patch test before regular use.',
        },
        {
          q: 'How should I store serums and botanical oils for freshness?',
          a: 'Store in a cool, dry place away from direct sunlight and heat. Always ensure the cap or dropper bottle is sealed tightly after each use to keep active ingredients potent.',
        },
      ]
    : [
        {
          q: 'How do I place an order with Cash on Delivery?',
          a: 'Simply choose your desired items, select your size, and click "ADD TO CART" or proceed to Checkout. Enter your name, delivery address, and phone number. No advance payment is needed — you only pay when your parcel is handed to you.',
        },
        {
          q: 'Can I open and inspect the parcel before paying?',
          a: 'Yes, absolutely! We encourage all our valued customers to check the parcel contents and fabric quality in front of the courier delivery agent before making payment.',
        },
        {
          q: 'What are the delivery charges and delivery times?',
          a: 'Delivery inside Dhaka is typically 24–48 hours (৳70). Delivery outside Dhaka takes 2–4 business days (৳130). Orders above ৳1,999 qualify for 100% Free Nationwide Delivery.',
        },
        {
          q: 'What if the size does not fit me properly?',
          a: 'We offer a hassle-free 7-day exchange guarantee. Simply contact our support team via WhatsApp or call our helpline, and we will arrange an exchange for your correct size immediately.',
        },
        {
          q: 'How should I care for and wash delicate fabrics?',
          a: 'For best results and longevity, we recommend dry cleaning or gentle hand-washing in cold water with mild detergent. Do not bleach or tumble dry in high heat. Steam iron on low setting.',
        },
      ];

  return (
    <div className="tabaya-home">
      {/* 1. HERO BANNER / SLIDER */}
      <HomeHeroSlider slides={sliders} />

      {/* 1.5 QUICK CATEGORY PILLS BAR (Mobile-First / Curated Lifestyle Navigation) */}
      {!isSkin && (
        <section style={{ background: '#FAF7F2', borderBottom: '1px solid #ECE7DE', padding: '12px 0' }}>
          <div className="wrap" style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
            {[
              { id: 'all', label: 'All Collections', icon: '✨' },
              { id: 'cloth', label: 'Fashion & Apparel', icon: '👔' },
              { id: 'watch', label: 'Timepieces & Watches', icon: '⌚' },
              { id: 'sunglass', label: 'Designer Sunglasses', icon: '🕶️' },
              { id: 'gift', label: 'Curated Gift Sets', icon: '🎁' },
              { id: 'digital', label: 'Digital Products', icon: '⚡' },
              { id: 'accessories', label: 'Leather & Accessories', icon: '👜' },
            ].map((catItem) => {
              const isActive = activeTabCat === catItem.id;
              return (
                <button
                  key={catItem.id}
                  type="button"
                  onClick={() => setActiveTabCat(catItem.id)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 16px',
                    borderRadius: 30,
                    fontSize: 13,
                    fontWeight: isActive ? 600 : 500,
                    letterSpacing: '0.02em',
                    whiteSpace: 'nowrap',
                    cursor: 'pointer',
                    border: isActive ? '1px solid #1f3147' : '1px solid #d9d4cc',
                    background: isActive ? '#1f3147' : '#ffffff',
                    color: isActive ? '#ffffff' : '#3d4a57',
                    boxShadow: isActive ? '0 2px 6px rgba(31,49,71,0.18)' : '0 1px 3px rgba(0,0,0,0.03)',
                    transition: 'all 0.2s ease',
                    flexShrink: 0,
                  }}
                >
                  <span>{catItem.icon}</span>
                  <span>{catItem.label}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* 2. SHOP BY COLLECTION / CATEGORY (ara-section) */}
      {cats.length > 0 && (
        <section className="ara-section">
          <div className="wrap">
            <div className="ara-header">
              <p className="ara-eyebrow">{isSkin ? 'CURATED REGIMEN' : 'CURATED LINEUP'}</p>
              <h2 className="ara-title">{isSkin ? 'Shop by Category' : 'Shop by Collection'}</h2>
              <p className="ara-subtitle">
                {isSkin
                  ? 'Formulated with clean, nutrient-rich botanicals to balance, hydrate, and protect your skin everyday.'
                  : 'Discover timeless silhouettes tailored from premium breathable fabrics for effortless modesty.'}
              </p>
            </div>

            <div className="ara-grid">
              {cats.map((c) => (
                <div className="ara-card" key={c.slug} onClick={() => go('shop/' + c.slug)}>
                  <div className="ara-card-visual">
                    <img
                      className="ara-card-img"
                      src={c.image || (isSkin ? 'https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=800&q=80' : 'https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?auto=format&fit=crop&w=800&q=80')}
                      alt={c.name}
                    />
                    <div className="ara-card-overlay" />
                    <div className="ara-card-frame" />
                    <div className="ara-card-corners" />
                    <div className="ara-card-content">
                      <span className="ara-card-kicker">{isSkin ? 'BOTANICAL CARE' : 'COLLECTION'}</span>
                      <h3 className="ara-card-label">{c.name}</h3>
                      <span className="ara-card-cta">EXPLORE →</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 3. FRAMED INTRO BOX */}
      <section className="tabaya-intro">
        <div className="tabaya-intro__frame">
          <h2 className="tabaya-intro__title">
            {isSkin ? 'Pure Botanicals Meet Clinical Care' : 'Understated Elegance Meets Craftsmanship'}
          </h2>
          <p className="tabaya-intro__desc">
            {isSkin
              ? 'Every product in our skincare and self-care collection is thoughtfully formulated with nutrient-dense botanical extracts to strengthen your skin barrier, balance hydration, and reveal a natural, healthy glow. Cash on delivery with doorstep inspection across Bangladesh.'
              : 'Every piece in our collection is meticulously crafted with an unwavering commitment to modesty, breathability, and timeless luxury. We believe in clothing that honors tradition while embracing modern contemporary sophistication.'}
          </p>
        </div>
      </section>

      {/* 4. FEATURED PRODUCTS (pc-stage & pc-grid) */}
      <section className="pc-stage">
        <div className="wrap">
          <div className="pc-section-header">
            <p className="pc-section-kicker">
              {isSkin ? 'CLINICAL BOTANICAL FORMULATIONS' : 'CURATED LIFESTYLE & GIFTS'}
            </p>
            <h2 className="pc-section-title">
              {isSkin ? 'Signature Skincare Essentials' : 'Trending & Best Sellers'}
            </h2>
            <p className="pc-section-subtitle">
              {isSkin
                ? 'Explore our most coveted cleansers, serums, and restorative moisture balms delivered with cash on delivery across Bangladesh.'
                : 'Explore premium watches, apparel, curated gift boxes, and lifestyle essentials with nationwide doorstep delivery.'}
            </p>

            {!isSkin && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap', marginTop: 18 }}>
                {[
                  { id: 'all', label: 'All Products' },
                  { id: 'cloth', label: '👔 Apparel' },
                  { id: 'watch', label: '⌚ Watches' },
                  { id: 'sunglass', label: '🕶️ Sunglasses' },
                  { id: 'gift', label: '🎁 Gift Sets' },
                  { id: 'digital', label: '⚡ Digital' },
                  { id: 'accessories', label: '👜 Accessories' },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setActiveTabCat(f.id)}
                    style={{
                      padding: '7px 16px',
                      borderRadius: 20,
                      fontSize: 12,
                      fontWeight: activeTabCat === f.id ? 700 : 500,
                      border: activeTabCat === f.id ? '1px solid #1f3147' : '1px solid #dcd7ce',
                      background: activeTabCat === f.id ? '#1f3147' : '#ffffff',
                      color: activeTabCat === f.id ? '#ffffff' : '#4b5563',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      boxShadow: activeTabCat === f.id ? '0 2px 6px rgba(0,0,0,0.1)' : 'none',
                    }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="pc-grid">
            {!loaded
              ? [0, 1, 2, 3, 4, 5, 6, 7].map((i) => <SkeletonCard key={i} />)
              : filteredBest.length > 0
                ? filteredBest.slice(0, 24).map((p) => <ProductCard key={p.id} p={p} />)
                : (
                  <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '60px 20px', color: '#6b645c' }}>
                    <div style={{ fontSize: 40, marginBottom: 12 }}>📦</div>
                    <h3 style={{ fontSize: 20, color: '#1f3147', fontFamily: "'Playfair Display', Georgia, serif" }}>
                      No Products Found in this Category
                    </h3>
                    <p style={{ fontSize: 14, marginTop: 6, color: '#8c7d6b' }}>
                      We are adding exciting new arrivals to this section shortly!
                    </p>
                    <button
                      type="button"
                      onClick={() => setActiveTabCat('all')}
                      style={{
                        marginTop: 14,
                        padding: '8px 20px',
                        borderRadius: 20,
                        background: '#1f3147',
                        color: '#fff',
                        border: 'none',
                        fontSize: 12,
                        cursor: 'pointer',
                        fontWeight: 600,
                      }}
                    >
                      VIEW ALL PRODUCTS
                    </button>
                  </div>
                )}
          </div>

          {products.length > 0 && (
            <div style={{ textAlign: 'center', marginTop: 44 }}>
              <button
                className="tabaya-btn primary"
                style={{ padding: '14px 34px', fontSize: 12, letterSpacing: '2.5px' }}
                onClick={() => go('shop')}
              >
                VIEW ALL PRODUCTS ({products.length}) →
              </button>
            </div>
          )}
        </div>
      </section>

      {/* 5. BRAND PILLARS (feature-section) */}
      <section className="feature-section">
        <div className="wrap">
          <div className="feature-grid">
            <div className="feature-item">
              <div className="feature-icon">🚚</div>
              <h3>Cash on Delivery Nationwide</h3>
              <p>Inspect your parcel upon arrival before making payment at your doorstep.</p>
            </div>
            <div className="feature-item">
              <div className="feature-icon">{isSkin ? '🌿' : '🛡️'}</div>
              <h3>{isSkin ? '100% Dermatologist-Safe & Authentic' : '100% Authentic Fabrics'}</h3>
              <p>
                {isSkin
                  ? 'Clean botanical formulations gentle on sensitive skin. Zero harsh parabens.'
                  : 'Hand-picked breathable fabrics crafted with meticulous stitching and finishing.'}
              </p>
            </div>
            <div className="feature-item">
              <div className="feature-icon">📦</div>
              <h3>Discreet & Secure Packaging</h3>
              <p>Every order is wrapped with utmost care to ensure pristine arrival.</p>
            </div>
            <div className="feature-item">
              <div className="feature-icon">{isSkin ? '💬' : '🔄'}</div>
              <h3>{isSkin ? 'Skincare Consultation Helpline' : '7-Day Easy Exchange'}</h3>
              <p>
                {isSkin
                  ? 'Have questions about your skin? Message our skincare support on WhatsApp anytime.'
                  : "Simple and hassle-free sizing exchange if the fit isn't absolutely perfect."}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 6. FAQ SECTION (faq-section) */}
      <section className="faq-section">
        <div className="faq-wrapper">
          {/* Left Column: Rotated Vertical Text + Editorial Photo */}
          <div className="faq-left">
            <div className="faq-vertical-title">
              FREQUENTLY ASKED QUESTIONS
            </div>
            <div className="faq-image-box">
              <img
                src={isSkin
                  ? 'https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=800&q=80'
                  : 'https://images.unsplash.com/photo-1515372039744-b8f02a3ae446?auto=format&fit=crop&w=800&q=80'}
                alt={isSkin ? 'Botanical Skincare FAQs' : 'Modest Attire FAQs'}
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
                    <span>{f.q}</span>
                    <span className="faq-icon">{isOpen ? '−' : '+'}</span>
                  </button>
                  {isOpen && (
                    <div className="faq-answer">
                      {f.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 7. VIP NEWSLETTER */}
      <section className="tabaya-sec-newsletter">
        <div className="wrap">
          <div className="tabaya-news-card">
            <span className="tabaya-sec-subtitle" style={{ color: '#b48e4c' }}>
              {isSkin ? 'EXCLUSIVE OFFERS & SKINCARE LAUNCHES' : 'EXCLUSIVE OFFERS & NEW ARRIVALS'}
            </span>
            <h2 className="serif" style={{ fontSize: 'clamp(24px, 3.2vw, 36px)', margin: '10px 0' }}>
              {isSkin ? 'Be the First to Experience New Skincare Drops' : 'Be the First to Experience New Collections'}
            </h2>
            <p style={{ color: '#9ca3af', maxWidth: 480, margin: '0 auto 20px', fontSize: 14 }}>
              {isSkin
                ? 'Join our exclusive VIP circle to receive personalized skincare guides, early access to new botanical drops, and special member discounts.'
                : 'Join our exclusive VIP circle to receive private sale previews, early access to new arrivals, and special member discounts.'}
            </p>
            {subbed ? (
              <div style={{ color: '#10b981', fontWeight: 700, fontSize: 16 }}>
                {isSkin ? '✓ Thank you! You have been subscribed to SECRATE VIP Club.' : '✓ Thank you! You have been subscribed to the METROMAA VIP Club.'}
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
                  placeholder="Enter your mobile number or email"
                  value={subEmail}
                  onChange={(e) => setSubEmail(e.target.value)}
                />
                <button type="submit">Join Now →</button>
              </form>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
export function Shop({ category }: { category: string }) {
  const { ok, confirm } = useAge();
  const [cats, setCats] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loaded, setLoaded] = useState(false);
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
            {isSkin ? 'PURE BOTANICAL FORMULATIONS' : 'METROMAA CURATED LINEUP'}
          </p>
          <h1 className="pc-section-title">
            {activeCat ? activeCat.name : (isSkin ? 'All Skincare & Essentials' : 'All Collections')}
          </h1>
          <p className="pc-section-subtitle">
            {activeCat ? activeCat.blurb : (isSkin
              ? 'Discover nutrient-dense botanical formulations crafted to nourish, balance, and restore your skin naturally.'
              : 'Discover timeless silhouettes tailored from premium breathable fabrics for effortless modesty.')}
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
            All Products ({products.length})
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
              {c.name}
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
                <h3 style={{ fontSize: 20, color: '#1f3147', fontFamily: "'Playfair Display', Georgia, serif" }}>No products found in this collection</h3>
                <p style={{ fontSize: 14, marginTop: 4 }}>New pieces will be added shortly.</p>
                <button className="tabaya-btn primary" style={{ marginTop: 16 }} onClick={() => go('shop')}>View All Collections</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function ProductPage({ slug }: { slug: string }) {
  const { ok, confirm } = useAge();
  const { add, setOpen } = useCart();
  const [p, setP] = useState<Product | null>(null);
  const [err, setErr] = useState(false);
  const [gi, setGi] = useState(0);
  const [qty, setQty] = useState(1);
  const [showBar, setShowBar] = useState(false);
  const [selVar, setSelVar] = useState<any>(null);
  const [selectedColor, setSelectedColor] = useState<string>('');
  const [selectedSize, setSelectedSize] = useState<string>('');
  const [activeAcc, setActiveAcc] = useState<string>('desc');
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
      document.title = `${pr.name} — ${isSkin ? 'SECRATE' : 'METROMAA'}`;
      ecView({ id: pr.id, name: pr.name, price: pr.price });
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
  if (!p) return <div className="page"><div className="wrap"><p className="empty">Loading product details…</p></div></div>;
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
              <div className="pc-badges-col">
                {onSale && (
                  <span className="pc-badge-save">
                    -{salePercent}% OFF
                  </span>
                )}
                {p.tag && <span className="pc-badge-tag">{p.tag}</span>}
              </div>
              <img ref={pimgRef} key={gi} className="pdimg-fade" src={gallery[gi] || p.image} alt={p.name} style={{ width: '100%', height: 'auto', maxHeight: 580, objectFit: 'contain' }} />
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
                    <img src={im} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right: Info & Actions */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="pc-eyebrow">
                {p.category ? p.category.replace(/-/g, ' ').toUpperCase() : 'BOTANICAL CARE & ESSENTIALS'}
              </span>
              {p.sku && <span style={{ fontSize: 11, color: '#9a7030', letterSpacing: '1px' }}>SKU: {p.sku}</span>}
            </div>

            <h1 className="serif" style={{ fontSize: 'clamp(26px, 3.2vw, 38px)', fontWeight: 500, color: '#1f3147', margin: '8px 0 12px', lineHeight: 1.2 }}>
              {p.name}
            </h1>

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
                    ({revData.count} {revData.count === 1 ? 'Customer Review' : 'Customer Reviews'})
                  </span>
                </div>
              ) : (
                <span style={{ fontSize: 12.5, fontWeight: 500, color: '#6b645c' }}>
                  {isSkin ? '🌿 100% Authentic Botanical' : '✨ Verified Authentic Item'}
                </span>
              )}
              <span style={{ color: p.soldOut ? '#dc2626' : '#15803d', fontSize: 11, fontWeight: 600, background: p.soldOut ? 'rgba(220,38,38,0.08)' : 'rgba(21,128,61,0.08)', padding: '2px 8px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                {p.soldOut ? 'Sold Out' : 'In Stock'}
              </span>
            </div>

            {p.isDigital && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 6, marginBottom: 14 }}>
                <span style={{ fontSize: 16 }}>⚡</span>
                <div style={{ fontSize: 12.5, color: '#065f46', fontWeight: 600 }}>
                  Instant Digital Product · 100% Free Instant Delivery (৳0 Courier Fee)
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
                    Save {taka(currentCompareAt! - currentPrice)}
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
                <span>📖 {isSkin ? 'Read Full Description & Specifications ↓' : 'Read Full Description & Details ↓'}</span>
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
                <button className="pc-checkout-btn" disabled style={{ width: '100%', opacity: 0.6 }}>SOLD OUT (RESTOCKING SOON)</button>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#1f3147', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Quantity:</span>
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
                    ORDER NOW — CASH ON DELIVERY →
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
                    + ADD TO SHOPPING BAG
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
                      <span>ORDER VIA WHATSAPP</span>
                    </a>
                  )}
                </div>
              </>
            )}

            {/* Trust Badges */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 26, padding: '18px', background: '#f3f0ec', border: '1px solid rgba(180, 150, 100, 0.25)', fontSize: 12, color: '#6b645c' }}>
              <div>🚚 Express Delivery Nationwide</div>
              <div>💵 Cash on Delivery at Doorstep</div>
              <div>🛡️ 100% Authentic Quality</div>
              <div>🔄 7-Day Easy Exchange Policy</div>
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
                          <li>Pure botanical extracts gentle on sensitive skin</li>
                          <li>Fast-absorbing lightweight texture, zero greasy residue</li>
                          <li>Dermatologist tested, paraben-free & cruelty-free</li>
                        </>
                      ) : isApparel ? (
                        <>
                          <li>Premium breathable, luxuriously soft fabric</li>
                          <li>Resistant to color fading and wrinkling</li>
                          <li>Perfect for both everyday elegance and special occasions</li>
                        </>
                      ) : (
                        <>
                          <li>100% Authentic & Premium Quality Guaranteed</li>
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
                    <p style={{ marginTop: 6 }}>Inspect your parcel in the presence of the delivery rider before payment. Instant return or exchange if damaged in transit or unsatisfactory.</p>
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
              {p.category ? p.category.toUpperCase().replace('-', ' ') : (isSkin ? 'SECRATE BOTANICALS' : 'METROMAA ARCHIVE')} • PRODUCT SPECIFICATIONS
            </span>
            <h2 className="serif" style={{ fontSize: 'clamp(22px, 2.5vw, 32px)', color: '#1f3147', margin: 0, fontWeight: 500 }}>
              {isSkin ? 'Product Information & Botanical Specifications' : 'Product Information, Sizing & Specifications'}
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
                            <h4>Breathable Luxury Comfort</h4>
                            <p>Engineered with soft, ultra-breathable stretch fibers for all-day comfort and seamless support.</p>
                          </div>
                        </div>
                        <div className="tabaya-feature-card">
                          <span className="icon">🛡️</span>
                          <div>
                            <h4>Discreet & Hygienic Packaging</h4>
                            <p>Every order is shipped in 100% opaque, unmarked, tamper-evident protective outer packaging.</p>
                          </div>
                        </div>
                        <div className="tabaya-feature-card">
                          <span className="icon">✨</span>
                          <div>
                            <h4>Durable Shape Retention</h4>
                            <p>High-elasticity weave maintains flexibility and supportive hold through repeated washes.</p>
                          </div>
                        </div>
                        <div className="tabaya-feature-card">
                          <span className="icon">🚚</span>
                          <div>
                            <h4>Doorstep Cash on Delivery</h4>
                            <p>Pay cash when your parcel arrives with full right of inspection in front of the courier rider.</p>
                          </div>
                        </div>
                      </>
                    ) : isSkin ? (
                      <>
                        <div className="tabaya-feature-card">
                          <span className="icon">🌿</span>
                          <div>
                            <h4>100% Dermatologist-Safe & Authentic</h4>
                            <p>Pure botanical actives formulated gentle on sensitive skin. Zero harsh parabens or heavy synthetic fragrances.</p>
                          </div>
                        </div>
                        <div className="tabaya-feature-card">
                          <span className="icon">✨</span>
                          <div>
                            <h4>Radiant Nourishing Care</h4>
                            <p>Fast-absorbing lightweight texture deeply replenishes hydration and restores youthful skin elasticity.</p>
                          </div>
                        </div>
                        <div className="tabaya-feature-card">
                          <span className="icon">🛡️</span>
                          <div>
                            <h4>Factory Sealed & Fresh</h4>
                            <p>Every product is hygienically sealed directly at the lab to ensure maximum active potency upon arrival.</p>
                          </div>
                        </div>
                        <div className="tabaya-feature-card">
                          <span className="icon">🚚</span>
                          <div>
                            <h4>Doorstep Cash on Delivery</h4>
                            <p>Pay cash when your parcel arrives with full right of inspection in front of the courier rider.</p>
                          </div>
                        </div>
                      </>
                    ) : p.category === 'sunglass' ? (
                      <>
                        <div className="tabaya-feature-card">
                          <span className="icon">🕶️</span>
                          <div>
                            <h4>UV400 Polarized Eye Protection</h4>
                            <p>100% protection against harmful UVA & UVB rays with superior anti-glare high-definition optics.</p>
                          </div>
                        </div>
                        <div className="tabaya-feature-card">
                          <span className="icon">💎</span>
                          <div>
                            <h4>First-Grade Durable Frame</h4>
                            <p>Crafted with reinforced lightweight alloy and ergonomic acetate temples for all-day comfort.</p>
                          </div>
                        </div>
                        <div className="tabaya-feature-card">
                          <span className="icon">🛡️</span>
                          <div>
                            <h4>Protective Hard Case & Cloth</h4>
                            <p>Every sunglass includes a protective hard case and microfiber cleaning cloth.</p>
                          </div>
                        </div>
                        <div className="tabaya-feature-card">
                          <span className="icon">🚚</span>
                          <div>
                            <h4>Doorstep Cash on Delivery</h4>
                            <p>Pay cash when your parcel arrives with full right of inspection in front of the courier rider.</p>
                          </div>
                        </div>
                      </>
                    ) : p.category === 'gift' ? (
                      <>
                        <div className="tabaya-feature-card">
                          <span className="icon">🎁</span>
                          <div>
                            <h4>Luxury Keepsake Presentation</h4>
                            <p>Bespoke packaging, satin ribbon finish, and complimentary gift carrier bag for unforgettable surprises.</p>
                          </div>
                        </div>
                        <div className="tabaya-feature-card">
                          <span className="icon">🌹</span>
                          <div>
                            <h4>Long-Lasting Silk Flora</h4>
                            <p>Artisanal scented decorative roses that remain vibrant and never fade over time.</p>
                          </div>
                        </div>
                        <div className="tabaya-feature-card">
                          <span className="icon">💌</span>
                          <div>
                            <h4>Complimentary Greeting Card</h4>
                            <p>Express your heartfelt feelings with our customized greeting card included in every box.</p>
                          </div>
                        </div>
                        <div className="tabaya-feature-card">
                          <span className="icon">🚚</span>
                          <div>
                            <h4>Doorstep Cash on Delivery</h4>
                            <p>Pay cash when your parcel arrives with full right of inspection in front of the courier rider.</p>
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="tabaya-feature-card">
                          <span className="icon">💎</span>
                          <div>
                            <h4>100% Authentic Quality Guaranteed</h4>
                            <p>Carefully curated and strictly quality-inspected to ensure premium customer satisfaction.</p>
                          </div>
                        </div>
                        <div className="tabaya-feature-card">
                          <span className="icon">🛡️</span>
                          <div>
                            <h4>Secure Protective Packaging</h4>
                            <p>Every parcel is packed with heavy-duty protection for zero damage during courier transit.</p>
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
                            <p>Pay cash when your parcel arrives with full right of inspection in front of the courier rider.</p>
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
                        <td style={{ textTransform: 'capitalize' }}>{p.category ? p.category.replace(/-/g, ' ') : (isApparel ? 'Intimate Care' : 'Botanical Skincare')}</td>
                      </tr>
                      {p.isDigital ? (
                        <>
                          <tr>
                            <th>Fulfillment Method</th>
                            <td>Instant Digital Access / Download via Email & WhatsApp (৳0 Delivery)</td>
                          </tr>
                          <tr>
                            <th>License & Access</th>
                            <td>Lifetime Access with Free Ongoing Updates</td>
                          </tr>
                          <tr>
                            <th>Compatibility</th>
                            <td>Multi-Device Compatible (Android, iOS, Windows, Mac)</td>
                          </tr>
                          <tr>
                            <th>Support & Setup</th>
                            <td>Dedicated WhatsApp Support with Setup Guide Included</td>
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
                            <td>High-Precision Japanese Quartz / Chronograph Movement</td>
                          </tr>
                          <tr>
                            <th>Dial & Crystal</th>
                            <td>Scratch-Resistant Hardened Mineral Crystal Glass</td>
                          </tr>
                          <tr>
                            <th>Band & Clasp</th>
                            <td>Genuine Leather / Stainless Steel with Secure Deployant Clasp</td>
                          </tr>
                          <tr>
                            <th>Water Resistance</th>
                            <td>Daily Splash Resistant (3 ATM / Rain & Hand Wash Proof)</td>
                          </tr>
                          <tr>
                            <th>Package Includes</th>
                            <td>1x Luxury Watch + Premium Cushion Presentation Box + Warranty Card</td>
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
                            <td>UV400 Certified (Blocks 100% Harmful UVA & UVB Rays)</td>
                          </tr>
                          <tr>
                            <th>Lens Technology</th>
                            <td>Polarized Anti-Glare High-Definition Glass / Resin Lens</td>
                          </tr>
                          <tr>
                            <th>Frame Construction</th>
                            <td>Lightweight Reinforced Alloy / Acetate with Flexible Hinges</td>
                          </tr>
                          <tr>
                            <th>Package Includes</th>
                            <td>1x Sunglasses + 1x Protective Hard Case + 1x Microfiber Cleaning Cloth</td>
                          </tr>
                        </>
                      ) : p.category === 'gift' ? (
                        <>
                          <tr>
                            <th>Gift Set Nature</th>
                            <td>Curated Luxury Presentation Combo & Keepsake Box</td>
                          </tr>
                          <tr>
                            <th>Complimentary Note</th>
                            <td>Free Custom Greeting Card (Hand-written or Premium Printed)</td>
                          </tr>
                          <tr>
                            <th>Presentation Standard</th>
                            <td>Rigid Keepsake Gift Box with Satin Ribbon + Safe Courier Outer Carton</td>
                          </tr>
                          <tr>
                            <th>Suitable Occasions</th>
                            <td>Birthdays, Anniversaries, Corporate Gifting, Eid & Surprise Celebrations</td>
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
                            <td>100% Genuine Top-Grain Leather / High-Density Alloy Hardware</td>
                          </tr>
                          <tr>
                            <th>Interior Features</th>
                            <td>Multiple Card Slots, Currency Compartments & RFID Blocking Shield</td>
                          </tr>
                          <tr>
                            <th>Package Includes</th>
                            <td>1x Signature Accessory + Protective Dust Pouch & Gift Box</td>
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
                            <td>Premium Breathable Cotton / Luxury Modal Stretch Blend</td>
                          </tr>
                          <tr>
                            <th>Fit Standard</th>
                            <td>Comfort Tailored Fit with Reinforced Seam Stitching</td>
                          </tr>
                          <tr>
                            <th>Package Includes</th>
                            <td>1x Authentically Packaged Garment in Protective Bag</td>
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
                            <td>Formulated for All Skin Types, including Sensitive & Acne-Prone</td>
                          </tr>
                          <tr>
                            <th>Formulation Standard</th>
                            <td>Dermatologist Tested, Non-Comedogenic, Paraben-Free</td>
                          </tr>
                          <tr>
                            <th>Package Includes</th>
                            <td>1x Authentically Sealed Product + Protective Outer Packaging</td>
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
                    <p>Pay cash directly to the delivery courier when your parcel arrives. You have the right to inspect the parcel outer packaging before payment.</p>
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
            className="btn"
            onClick={handleDirectBuy}
            style={{
              background: '#8B1E1E',
              color: '#ffffff',
              borderRadius: 4,
              padding: '12px 18px',
              fontWeight: 700,
              fontSize: 12,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
              border: 'none',
              cursor: 'pointer',
              flexShrink: 0,
              boxShadow: '0 2px 8px rgba(139,30,30,0.25)'
            }}
          >
            ORDER NOW →
          </button>
        </div>
      )}
    </div>
  );
}
export function Checkout() {
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
    if (f.name.trim().length < 2 || !/^01[3-9]\d{8}$/.test(f.phone.trim()) || lines.length === 0) return;
    const t = setTimeout(() => {
      fetch('/api/checkout/ping', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-device-id': getDeviceId(),
        },
        body: JSON.stringify({ items: lines.map((l) => ({ id: l.id, qty: l.qty })), customer: { ...f, address: [f.address.trim(), thana, district].filter(Boolean).join(', '), area, district, thana, coupon: applied?.code, source: getSource() } }),
      }).catch(() => {});
    }, 1200);
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

  const submit = async () => {
    setErr('');
    if (!/^01[3-9]\d{8}$/.test(f.phone)) { setErr('Please enter a valid 11-digit Bangladeshi mobile number (01XXXXXXXXX)'); return; }
    if (!isAllDigital) {
      if (!district || !thana) { setErr('Please select your District and Thana'); return; }
      if (!f.address.trim()) { setErr('Please enter your street address / delivery location'); return; }
    }
    setBusy(true);
    try {
      const res = await placeOrder({
        items: lines.map((l) => ({
          id: l.id.includes('-') ? l.id.split('-')[0] : l.id,
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
                ? 'Discover nutrient-dense botanical formulations crafted to nourish and restore your natural glow.'
                : 'Explore our curated collections of timeless silhouettes tailored for effortless elegance.'}
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
    <div className="page" style={{ background: '#f3f0ec', minHeight: '100vh', paddingTop: '28px', paddingBottom: '70px' }}>
      <div className="wrap" style={{ maxWidth: 1120 }}>
        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#8c7d6b', marginBottom: 20, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          <span style={{ cursor: 'pointer' }} onClick={() => go('home')}>Home</span>
          <span>/</span>
          <span style={{ cursor: 'pointer' }} onClick={() => go('shop')}>Collections</span>
          <span>/</span>
          <span style={{ color: '#1f3147', fontWeight: 600 }}>Checkout</span>
        </div>

        {/* Header */}
        <div className="phead" style={{ textAlign: 'center', padding: '6px 0 28px' }}>
          <p className="pc-section-kicker">
            {isSkin ? 'SECRATE • SECURE ORDER CHECKOUT' : 'METROMAA • SECURE ORDER CHECKOUT'}
          </p>
          <h1 className="serif" style={{ fontSize: 'clamp(28px, 3.4vw, 40px)', fontWeight: 500, color: '#1f3147', margin: '6px 0 10px' }}>
            Finalize Your Order
          </h1>
          <p style={{ color: '#6b645c', fontSize: 14, maxWidth: 520, margin: '0 auto' }}>
            Pay with Cash on Delivery at your doorstep. Inspect your parcel before completing payment.
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
                  Have a VIP account or want 5% off your first order?
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
                  Sign In / Register
                </button>
              </div>
            )}

            {/* Box 1: Contact Details */}
            <div className="cobox">
              <div className="pc-corner-tr" />
              <div className="pc-corner-bl" />
              <div className="cobox-h">
                <span className="cobox-n">1</span>
                <span>Contact & Personal Details</span>
              </div>
              <div className="cobox-b">
                <div>
                  <label>Full Name *</label>
                  <input className="field" value={f.name} onChange={set('name')} placeholder="Enter your full name" />
                </div>
                <div>
                  <label>Mobile Number *</label>
                  <input
                    className="field"
                    value={f.phone}
                    onChange={(e) => setF((s) => ({ ...s, phone: e.target.value.replace(/\D/g, '').slice(0, 11) }))}
                    placeholder="01XXXXXXXXX"
                    inputMode="tel"
                    maxLength={11}
                  />
                  {f.phone.length > 0 && !/^01[3-9]\d{8}$/.test(f.phone) && (
                    <div className="fieldhint">Please enter a valid 11-digit mobile number (e.g. 017XXXXXXXX)</div>
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
                <span>{isAllDigital ? 'Instant Digital Fulfillment' : 'Shipping & Doorstep Delivery Address'}</span>
              </div>
              {isAllDigital ? (
                <div className="cobox-b">
                  <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '14px 16px', marginBottom: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#166534', fontWeight: 700, fontSize: 13.5 }}>
                      <span>⚡ Instant Digital Access</span>
                      <span style={{ fontSize: 10.5, background: '#16a34a', color: '#fff', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>
                        FREE ৳0 DELIVERY
                      </span>
                    </div>
                    <p style={{ margin: '6px 0 0', fontSize: 12.5, color: '#4b5563', lineHeight: 1.5 }}>
                      No physical courier delivery needed. Your digital download link and activation instructions will be provided instantly upon order confirmation.
                    </p>
                  </div>
                  <div>
                    <label>Email Address (for download delivery & invoice) *</label>
                    <input className="field" type="email" value={f.email || ''} onChange={set('email')} placeholder="yourname@gmail.com" />
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <label>Order Note (Optional)</label>
                    <input className="field" value={f.note} onChange={set('note')} placeholder="WhatsApp instructions or special notes" />
                  </div>
                </div>
              ) : (
                <div className="cobox-b">
                  <div className="corow">
                    <div>
                      <label>District (Zilla) *</label>
                      <SearchSelect value={district} onChange={pickDistrict} options={districts} placeholder="Search district…" />
                    </div>
                    <div>
                      <label>Thana / Upazila *</label>
                      <SearchSelect value={thana} onChange={setThana} options={thanas} placeholder={district ? 'Search thana…' : 'Select district first'} disabled={!district} />
                    </div>
                  </div>

                  <div>
                    <label>Detailed Street Address *</label>
                    <textarea className="field" value={f.address} onChange={set('address')} placeholder="House / Flat / Road, Village, Landmark or Area description" />
                  </div>

                  <div>
                    <label>Delivery Zone</label>
                    <div className="area">
                      <button type="button" className={'areaopt' + (area === 'inside' ? ' on' : '')} onClick={() => setArea('inside')}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                          <b style={{ fontSize: 13, color: area === 'inside' ? '#FAF8F5' : '#1f3147' }}>Inside Dhaka</b>
                          <span style={{ fontSize: 13, fontWeight: 700, color: area === 'inside' ? '#d4af37' : '#1f3147' }}>
                            {settings ? (freeShip ? 'FREE' : taka(settings.deliveryInside)) : '৳80'}
                          </span>
                        </div>
                        <span style={{ fontSize: 11.5, color: area === 'inside' ? 'rgba(250,248,245,0.75)' : '#8c7d6b' }}>
                          Delivered in 24–48 Hours
                        </span>
                      </button>
                      <button type="button" className={'areaopt' + (area === 'outside' ? ' on' : '')} onClick={() => setArea('outside')}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                          <b style={{ fontSize: 13, color: area === 'outside' ? '#FAF8F5' : '#1f3147' }}>Outside Dhaka</b>
                          <span style={{ fontSize: 13, fontWeight: 700, color: area === 'outside' ? '#d4af37' : '#1f3147' }}>
                            {settings ? (freeShip ? 'FREE' : taka(settings.deliveryOutside)) : '৳130'}
                          </span>
                        </div>
                        <span style={{ fontSize: 11.5, color: area === 'outside' ? 'rgba(250,248,245,0.75)' : '#8c7d6b' }}>
                          Delivered across 64 Districts
                        </span>
                      </button>
                    </div>
                  </div>

                  <div>
                    <label>Order Note (Optional)</label>
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
            <h3>Order Summary ({lines.reduce((s, l) => s + l.qty, 0)} Items)</h3>

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
              <div style={{ background: '#fee2e2', border: '1px solid #f87171', color: '#b91c1c', padding: '10px 14px', borderRadius: 2, fontSize: 13, marginTop: 14 }}>
                ⚠️ {err}
              </div>
            )}

            <button
              className="pc-cta"
              disabled={busy}
              onClick={submit}
              style={{
                width: '100%',
                padding: '18px 24px',
                fontSize: 12.5,
                letterSpacing: '0.22em',
                marginTop: 18,
                boxShadow: '0 6px 20px rgba(31,49,71,0.25)'
              }}
            >
              <span>{busy ? 'PROCESSING ORDER…' : `CONFIRM ORDER — ${taka(grand)} →`}</span>
            </button>

            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: '#6b645c', textAlign: 'center' }}>
              <div>🔒 100% Secure Checkout · No Advance Payment Required</div>
              <div>📦 Inspect your parcel upon doorstep delivery</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Confirm({ id }: { id: string }) {
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
          <p className="pc-section-kicker">{isSkin ? 'SECRATE • ORDER RECEIVED' : 'METROMAA • ORDER RECEIVED'}</p>
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

const STEPS = ['pending', 'confirmed', 'shipped', 'delivered'];

const COURIERS: Record<string, (c: string) => string> = {
  steadfast: (c) => `https://steadfast.com.bd/t/${encodeURIComponent(c)}`,
  pathao: (c) => `https://merchant.pathao.com/tracking?consignment_id=${encodeURIComponent(c)}`,
  redx: (c) => `https://redx.com.bd/track-global-parcel/?trackingId=${encodeURIComponent(c)}`,
  paperfly: (c) => `https://go.paperfly.com.bd/track/?trackingId=${encodeURIComponent(c)}`,
};
function courierLink(cour: any): string {
  if (!cour) return '';
  if (cour.url) return cour.url;
  const key = String(cour.name || '').toLowerCase().replace(/[^a-z]/g, '');
  const b = COURIERS[key];
  return typeof b === 'function' && cour.consignment ? b(cour.consignment) : '';
}

function CopyMini({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); } catch {}
    setDone(true); setTimeout(() => setDone(false), 1500);
  };
  return <button className="copymini" onClick={copy}>{done ? '✓' : 'copy'}</button>;
}

export function Track() {
  const [id, setId] = useState('');
  const [phone, setPhone] = useState('');
  const [res, setRes] = useState<any>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const lookup = async (quiet?: boolean) => {
    try {
      const r = await fetch(`/api/track?id=${encodeURIComponent(id)}&phone=${encodeURIComponent(phone)}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'not found');
      setRes(d);
    } catch (e: any) { if (!quiet) setErr(e.message); }
  };
  const submit = async () => { setErr(''); setRes(null); setBusy(true); await lookup(); setBusy(false); };
  // once an order is shown, re-check every 20s so courier status updates live
  useEffect(() => {
    if (!res) return;
    const t = setInterval(() => lookup(true), 20000);
    return () => clearInterval(t);
  }, [res?.id, id, phone]);
  return (
    <div className="page" style={{ minHeight: '75vh', paddingBottom: 60 }}><div className="wrap">
      <div className="phead" style={{ padding: '36px 0 16px' }}>
        <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 600, fontSize: 'clamp(28px, 4vw, 38px)', color: '#1f3147', textTransform: 'capitalize', letterSpacing: '-0.01em' }}>Track Your Order</h1>
        <p style={{ color: '#6b645c', marginTop: 8, fontSize: 14.5 }}>Enter your order ID and the mobile number you ordered with.</p>
      </div>
      <div className="track-form">
        <input className="field" placeholder="Order ID (e.g. SEC-XXXXXXXX)" value={id} onChange={(e) => setId(e.target.value)} />
        <input className="field" placeholder="Mobile Number (01XXXXXXXXX)" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <button className="btn" disabled={busy} onClick={submit}>{busy ? 'Checking…' : 'Track Order'}</button>
      </div>
      {err && <div className="err" style={{ marginTop: 18 }}>{err}</div>}
      {res && <TrackResult o={res} />}
    </div></div>
  );
}
function TrackResult({ o }: { o: any }) {
  const cancelled = o.status === 'cancelled';
  const returned = o.status === 'return';
  const special = cancelled || returned;
  const idx = STEPS.indexOf(o.status);
  const date = new Date(o.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  return (
    <div className="trk">
      <div className="trk-head">
        <div className="eye">order {o.id}</div>
        <h2>{cancelled ? 'order cancelled' : returned ? 'order returned' : o.status === 'hold' ? 'order on hold' : o.status === 'approved' ? 'order approved' : STEPS[idx] || o.status || 'pending'}</h2>
        <p>placed {date}, cash on delivery</p>
      </div>
      {!special ? (
        <div className="steps">
          {STEPS.map((s, i) => (
            <div className={'step' + (i <= idx ? ' on' : '')} key={s}>
              <span className="dot" /><span className="lbl">{s}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="empty">{cancelled ? 'this order was cancelled. please contact us if this is a mistake.' : 'this order has been returned. please contact us if you have any questions.'}</p>
      )}
      {o.courier && o.courier.name && (
        <div className="courier">
          <div className="eye" style={{ marginBottom: 14 }}>courier details</div>
          <div className="crow"><span>courier</span><b>{o.courier.name}</b></div>
          {o.courier.liveStatus && <div className="crow"><span>live status</span><b style={{ color: '#60a5fa' }}>{o.courier.liveStatus}</b></div>}
          {o.courier.consignment && <div className="crow"><span>tracking / consignment no.</span><b className="mono">{o.courier.consignment}<CopyMini text={o.courier.consignment} /></b></div>}
          {o.courier.phone && <div className="crow"><span>courier hotline</span><b><a href={'tel:' + o.courier.phone}>{o.courier.phone}</a></b></div>}
          {o.courier.riderNote && (
            <div className="crow rider-note" style={{ background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.25)', padding: '10px 14px', borderRadius: 8, marginTop: 12 }}>
              <span style={{ color: '#fbbf24', fontWeight: 600 }}>🛵 Rider / Delivery Note</span>
              <b style={{ color: '#fef3c7', fontWeight: 500, textAlign: 'right' }}>{o.courier.riderNote}</b>
            </div>
          )}
          {courierLink(o.courier) && <a className="btn ghost" style={{ marginTop: 16 }} href={courierLink(o.courier)} target="_blank" rel="noopener noreferrer">track on {o.courier.name}</a>}
        </div>
      )}
      {Array.isArray(o.history) && o.history.length > 0 && (
        <div className="trk-timeline" style={{ marginTop: 24, padding: '16px 18px', background: 'rgba(255, 255, 255, 0.02)', borderRadius: 12, border: '1px solid rgba(255, 255, 255, 0.06)' }}>
          <div className="eye" style={{ marginBottom: 12 }}>order timeline</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {o.history.map((h: any, i: number) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', fontSize: 13 }}>
                <div>
                  <span style={{ textTransform: 'capitalize', fontWeight: 600, color: '#f1f5f9' }}>{h.status}</span>
                  {h.note && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{h.note}</div>}
                </div>
                <span style={{ fontSize: 11, color: '#64748b', whiteSpace: 'nowrap', marginLeft: 12 }}>
                  {new Date(h.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} {new Date(h.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="trk-items">
        {o.items.map((it: any) => <div className="sl" key={it.id}><span>{it.name} × {it.qty}</span><span>{taka(it.subtotal)}</span></div>)}
        <div className="tot"><span>total</span><b>{taka(o.total)}</b></div>
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
