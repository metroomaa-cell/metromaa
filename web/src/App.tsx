import { useEffect, useState, useRef, lazy, Suspense } from 'react';
import { CartProvider, useCart, useRoute, go } from './cart';
import { taka, getSettings, isSkincareSite, getCategories } from './api';
import { initGTM, initFB, dl, trackEngagement, initInteractionTracking } from './analytics';
import { Home, Shop, ProductPage, Checkout, Confirm, Track, SearchOverlay, InfoPage } from './pages';
import { CustomerProvider, useCustomer, CustomerHeaderIcon, CustomerAccountPage } from './CustomerAccount';
import { WhatsAppIcon } from './icons';
import { setStoreLanguage, setStoreCopyOverrides, tr, useStoreLanguage } from './language';
const Admin = lazy(() => import('./admin').then((m) => ({ default: m.Admin })));
const LoveLockLanding = lazy(() => import('./LoveLockLanding').then((m) => ({ default: m.LoveLockLanding })));

function StoreLoading({ admin = false }: { admin?: boolean }) {
  const brand = admin ? 'SECRATE ADMIN' : (isSkincareSite() ? 'SECRATE' : 'METRROMA');
  return (
    <div className="store-loading" role="status" aria-live="polite">
      <div className="store-loading-card">
        <div className="store-loading-brand">{brand}</div>
        <p>{admin ? 'Preparing your dashboard…' : 'Your experience is getting ready…'}</p>
        <div className="store-loading-track"><span /></div>
        <span className="store-loading-note">A moment, please</span>
      </div>
    </div>
  );
}

function Effects() {
  const route = useRoute();
  const isLocalPreview = import.meta.env.DEV;
  const isAdmin = route.name === 'admin' || (typeof window !== 'undefined' && (/(\/|^)(admin|wp-admin)(\/|$)/i.test(window.location.pathname) || window.location.hash.includes('admin')));

  useEffect(() => {
    if (!isAdmin && !isLocalPreview) {
      initInteractionTracking();
    }
    getSettings().then((s) => {
      setStoreCopyOverrides(s.siteContent?.textOverrides);
      if (s.appearance) {
        const root = document.documentElement;
        const accent = s.appearance.accent || '#b48e4c';
        root.style.setProperty('--store-accent', accent);
        root.style.setProperty('--glow', accent);
        root.style.setProperty('--tabaya-accent', accent);
        root.style.setProperty('--store-columns-desktop', String(s.appearance.desktopColumns || 4));
        root.style.setProperty('--store-columns-mobile', String(s.appearance.mobileColumns || 2));
        root.style.setProperty('--store-image-fit', s.appearance.imageFit || 'contain');
        root.style.setProperty('--store-font', s.appearance.font || 'Inter');
      }
      if (!isAdmin && !isLocalPreview) {
        if (s.gtmId) initGTM(s.gtmId);
        if (s.fbPixelId) initFB(s.fbPixelId);
      }
      if (s.favicon) {
        let link: HTMLLinkElement | null = document.querySelector("link[rel*='icon']");
        if (!link) {
          link = document.createElement('link');
          link.rel = 'icon';
          document.head.appendChild(link);
        }
        link.href = s.favicon;
      }
    }).catch(() => {});
  }, [isAdmin, isLocalPreview]);
  useEffect(() => {
    if (isAdmin || isLocalPreview) return;
    const p = '/' + (route.name === 'home' ? '' : route.name) + (route.param ? '/' + route.param : '');
    const q = new URLSearchParams(location.search);
    dl({
      event: 'page_view',
      page_location: location.href,
      page_path: p || '/',
      page_title: document.title,
      campaign_source: q.get('utm_source') || (q.get('fbclid') ? 'facebook' : undefined),
      campaign_medium: q.get('utm_medium') || (q.get('fbclid') ? 'paid' : undefined),
      campaign_name: q.get('utm_campaign') || undefined,
    });
  }, [route.name, route.param, isAdmin, isLocalPreview]);
  useEffect(() => {
    if (isAdmin || isLocalPreview) return;
    const p = '/' + (route.name === 'home' ? '' : route.name) + (route.param ? '/' + route.param : '');
    trackEngagement(p || '/');
  }, [route.name, route.param, isAdmin, isLocalPreview]);
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [route.name, route.param]);
  useEffect(() => {
    let active = true;
    const isSkin = isSkincareSite();
    const defaultBrand = isSkin ? 'SECRATE' : 'METRROMA';
    getSettings().then((s) => {
      const brand = s.storeName && s.storeName !== 'dot.' ? s.storeName : defaultBrand;
      const t: any = isSkin
        ? {
            home: `${brand} | Pure Botanical Skincare & Self-Care Essentials`,
            shop: `All Skincare & Beauty — ${brand}`,
            track: `Track Your Order — ${brand}`,
            checkout: `Checkout (Cash on Delivery) — ${brand}`,
            confirm: `Order Placed Successfully — ${brand}`,
            info: brand,
            admin: `Admin Dashboard — ${brand}`,
          }
        : {
            home: `${brand} | Modern Lifestyle, Sunglasses, Watches & Curated Gifts`,
            shop: `All Collections — ${brand}`,
            track: `Track Your Order — ${brand}`,
            checkout: `Checkout (Cash on Delivery) — ${brand}`,
            confirm: `Order Placed Successfully — ${brand}`,
            info: brand,
            admin: `Admin Dashboard — ${brand}`,
          };
      if (route.name === 'shop' && route.param) {
        getCategories().then((categories) => {
          if (!active) return;
          const category = categories.find((item) => item.slug === route.param);
          document.title = `${category?.name || (isSkin ? 'Shop Skincare' : 'Collection')} — ${brand}`;
        }).catch(() => {
          if (active) document.title = `${isSkin ? 'Shop Skincare' : 'Collection'} — ${brand}`;
        });
      } else if (route.name !== 'product') {
        document.title = t[route.name] || brand;
      }
    }).catch(() => {
      if (route.name === 'shop' && route.param) {
        if (active) document.title = `${isSkin ? 'Shop Skincare' : 'Collection'} — ${defaultBrand}`;
      } else if (route.name !== 'product') {
        document.title = isSkin ? 'SECRATE | Botanical Skincare' : 'METRROMA | Modern Lifestyle, Watches & Gifts';
      }
    });

    let md = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
    if (!md) { md = document.createElement('meta'); md.name = 'description'; document.head.appendChild(md); }
    md.content = isSkin
      ? 'Premium botanical skincare, hydrating serums, gentle cleansers & self-care essentials delivered across Bangladesh with cash on delivery.'
      : 'Premium sunglasses, authentic watches, handcrafted gift boxes & curated lifestyle essentials delivered across Bangladesh with cash on delivery.';
    return () => { active = false; };
  }, [route.name, route.param]);
  useEffect(() => {
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }),
      { threshold: 0.12 }
    );
    document.querySelectorAll('.reveal:not(.in)').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [route.name, route.param]);

  useEffect(() => {
    const nav = document.querySelector('.navbar');
    const h = () => nav?.classList.toggle('solid', scrollY > 40);
    addEventListener('scroll', h); h();
    return () => removeEventListener('scroll', h);
  }, []);

  return null;
}

function AnnouncementBar() {
  const language = useStoreLanguage();
  const isSkin = isSkincareSite();
  const [announce, setAnnounce] = useState('');
  useEffect(() => {
    getSettings().then((s) => {
      if (s.announce && s.announce.trim()) {
        const threshold = s.freeShipThreshold ? taka(s.freeShipThreshold) : 'Tk 2,500';
        const alignedAnnouncement = s.announce.trim().replace(
          /(FREE (?:SHIPPING|DELIVERY)(?: ON ORDERS)? (?:OVER|ABOVE)\s*)(?:৳|Tk)?\s*[\d,]+/i,
          `$1${threshold}`,
        );
        setAnnounce(alignedAnnouncement);
      } else {
        const threshold = s.freeShipThreshold ? taka(s.freeShipThreshold) : '৳2,500';
        setAnnounce(
          isSkin
            ? `✨ Pure Botanical Skincare · Cash on Delivery Nationwide · Free Shipping Over ${threshold}`
            : `✨ Cash on Delivery Nationwide · 100% Authentic Watches, Sunglasses & Curated Gifts · Free Delivery Over ${threshold}`
        );
      }
    }).catch(() => {
      setAnnounce(
        isSkin
          ? '✨ Pure Botanical Skincare · Cash on Delivery Nationwide · 100% Authentic Quality'
          : '✨ 100% Authentic Watches, Sunglasses & Curated Gifts · Cash on Delivery Nationwide'
      );
    });
  }, [isSkin]);
  if (!announce) return null;
  return (
    <div className="tabaya-announcement">
      <div className="wrap">
        <span>{tr(announce, language)}</span>
      </div>
    </div>
  );
}

function Header({ onSearch }: { onSearch: () => void }) {
  const language = useStoreLanguage();
  const { count, setOpen } = useCart();
  const { customer, openAuth } = useCustomer();
  const [menu, setMenu] = useState(false);
  const isSkin = isSkincareSite();
  const [storeName, setStoreName] = useState(isSkin ? 'SECRATE' : 'METRROMA');
  const [logo, setLogo] = useState('');
  const [cats, setCats] = useState<{ slug: string; name: string }[]>([]);
  const route = useRoute();
  const nav = (p: string) => { go(p); setMenu(false); };

  useEffect(() => {
    getSettings().then((s) => {
      if (s.storeName && s.storeName !== 'dot.') setStoreName(s.storeName);
      else if (s.storeName === 'dot.' && isSkin) setStoreName('SECRATE');
      if (s.logo) setLogo(s.logo);
    }).catch(() => {});
    getCategories().then((cs) => {
      if (Array.isArray(cs)) setCats(cs);
    }).catch(() => {});
  }, [isSkin]);

  const [catDropdownOpen, setCatDropdownOpen] = useState(false);
  const catDropdownRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (catDropdownRef.current && !catDropdownRef.current.contains(e.target as Node)) {
        setCatDropdownOpen(false);
      }
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  const visibleCats = cats.slice(0, 2);
  const dropdownCats = cats.slice(2);

  const navLinks = [
    { label: 'Home', path: 'home' },
    { label: isSkin ? 'All Skincare' : 'All Collections', path: 'shop' },
    ...cats.map((c) => ({ label: c.name, path: 'shop/' + c.slug })),
    { label: 'Track Order', path: 'track' },
  ];

  return (
    <>
      <AnnouncementBar />
      <header className="tabaya-header">
        <div className="tabaya-header-inner">
          {/* Left Column: Brand Logo + Mobile Hamburger */}
          <div className="tabaya-header-left">
            <button
              className="tabaya-hamburger-btn"
              onClick={() => setMenu(true)}
              aria-label="Open Navigation Menu"
            >
              <svg width="18" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                <path d="M1 3.5H13" />
                <path d="M1 10.5H13" />
              </svg>
            </button>
            <div className="tabaya-header-logo" onClick={() => nav('home')} style={{ display: 'inline-flex', alignItems: 'center' }}>
              {logo ? (
                <img
                  src={logo}
                  alt={storeName}
                  style={{ maxHeight: 40, width: 'auto', objectFit: 'contain', display: 'block' }}
                />
              ) : null}
            </div>
          </div>

          {/* Center Column: Navigation Menu (Tabaya Style) */}
          <nav className="tabaya-header-center" aria-label="Main Navigation">
            <ul className="tabaya-nav-menu">
              <li>
                <a
                  className={'tabaya-nav-item' + (route.name === 'home' ? ' active' : '')}
                  onClick={() => nav('home')}
                >
                  {tr('Home', language)}
                </a>
              </li>
              <li>
                <a
                  className={'tabaya-nav-item' + (route.name === 'shop' && !route.param ? ' active' : '')}
                  onClick={() => nav('shop')}
                >
                  {tr(isSkin ? 'All Skincare' : 'All Collections', language)}
                </a>
              </li>
              {visibleCats.map((c) => {
                const isActive = route.name === 'shop' && route.param === c.slug;
                return (
                  <li key={c.slug}>
                    <a
                      className={'tabaya-nav-item' + (isActive ? ' active' : '')}
                      onClick={() => nav('shop/' + c.slug)}
                    >
                      {tr(c.name, language)}
                    </a>
                  </li>
                );
              })}

              {dropdownCats.length > 0 && (
                <li
                  ref={catDropdownRef}
                  className={`tabaya-nav-dropdown ${catDropdownOpen ? 'open' : ''} ${route.name === 'shop' && dropdownCats.some((c) => route.param === c.slug) ? 'active' : ''}`}
                  onMouseEnter={() => setCatDropdownOpen(true)}
                  onMouseLeave={() => setCatDropdownOpen(false)}
                >
                  <button
                    type="button"
                    className="tabaya-nav-dropdown-btn"
                    onClick={() => setCatDropdownOpen((o) => !o)}
                  >
                    <span>{tr('More Categories', language)}</span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>
                  <ul className="tabaya-nav-dropdown-menu">
                    {dropdownCats.map((c) => (
                      <li key={c.slug}>
                        <a
                          className={`tabaya-nav-dropdown-item ${route.name === 'shop' && route.param === c.slug ? 'active' : ''}`}
                          onClick={() => {
                            nav('shop/' + c.slug);
                            setCatDropdownOpen(false);
                          }}
                        >
                          {tr(c.name, language)}
                        </a>
                      </li>
                    ))}
                  </ul>
                </li>
              )}

              <li>
                <a
                  className={'tabaya-nav-item' + (route.name === 'track' ? ' active' : '')}
                  onClick={() => nav('track')}
                >
                  {tr('Track Order', language)}
                </a>
              </li>
            </ul>
          </nav>

          {/* Right Column: Search Icon, User Icon & Cart Bag */}
          <div className="tabaya-header-right">
            <label className="header-language-wrap" aria-label="Choose website language">
              <select className="header-language" value={language} onChange={(e) => setStoreLanguage(e.target.value as 'en' | 'bn')} aria-label="Choose website language">
                <option value="en">EN</option>
                <option value="bn">BN</option>
              </select>
            </label>
            <button
              className="tabaya-h-btn"
              onClick={onSearch}
              aria-label={tr('Search collections', language)}
              title="Search"
            >
              <svg width="19" height="19" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="9" cy="9" r="5.5" />
                <path d="m13 13 4 4" />
              </svg>
            </button>

            <CustomerHeaderIcon onNavigate={nav} />

            <button
              className="tabaya-h-btn tabaya-h-cart-btn"
              onClick={() => setOpen(true)}
              aria-label="Shopping Cart"
              title="Cart"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3.5 6.8h13v8.2a1.8 1.8 0 0 1-1.8 1.8H5.3a1.8 1.8 0 0 1-1.8-1.8V6.8z" />
                <path d="M7 6.8V5.2a3 3 0 0 1 6 0v1.6" />
              </svg>
              {count > 0 && <span className="tabaya-h-cart-badge">{count}</span>}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Backdrop & Drawer Navigation */}
      {menu && <div className="tabaya-mmenu-overlay" onClick={() => setMenu(false)} />}
      <div className={'tabaya-mmenu' + (menu ? ' open' : '')}>
        <div className="tabaya-mmenu-head">
          <span className="tabaya-header-logo" style={{ fontSize: 20, display: 'inline-flex', alignItems: 'center' }}>
            {logo ? (
              <img
                src={logo}
                alt={storeName}
                style={{ maxHeight: 34, width: 'auto', objectFit: 'contain', display: 'block' }}
              />
            ) : null}
          </span>
          <button
            className="tabaya-mmenu-close"
            onClick={() => setMenu(false)}
            aria-label="Close menu"
          >
            ×
          </button>
        </div>
        <div className="tabaya-mmenu-links">
          <a
            onClick={() => {
              if (customer) nav('account');
              else openAuth();
              setMenu(false);
            }}
            className="tabaya-mmenu-link"
            style={{ display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid #e2e8f0', paddingBottom: 12, marginBottom: 8 }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            <span>{customer ? `${tr('Account', language)} (${customer.name || customer.phone})` : tr('VIP Sign In / Register (5% OFF)', language)}</span>
          </a>
          {navLinks.map((item) => (
            <a
              key={item.path}
              onClick={() => nav(item.path)}
              className="tabaya-mmenu-link"
            >
              {tr(item.label, language)}
            </a>
          ))}
          <a
            onClick={() => { setOpen(true); setMenu(false); }}
            className="tabaya-mmenu-link"
            style={{ color: '#8B1E1E', fontWeight: 600 }}
          >
            {tr('Shopping Bag', language)} ({count} {tr(count === 1 ? 'item' : 'items', language)})
          </a>
        </div>
        <div className="tabaya-mmenu-foot">
          <div>🚚 {tr('Cash on Delivery Nationwide', language)}</div>
          <div style={{ marginTop: 4 }}>📞 {tr('Helpline: Available 24/7', language)}</div>
        </div>
      </div>
    </>
  );
}

function Footer() {
  const language = useStoreLanguage();
  const [phone, setPhone] = useState('+880 1878-374762');
  const [whatsapp, setWhatsapp] = useState('');
  const isSkin = isSkincareSite();
  const [name, setName] = useState(isSkin ? 'SECRATE' : 'METROMAA');
  const [logo, setLogo] = useState('');
  const [cats, setCats] = useState<{ slug: string; name: string; adult?: boolean }[]>([]);
  useEffect(() => {
    getSettings().then((s) => {
      if (s.phone) setPhone(s.phone);
      if (s.whatsapp) setWhatsapp(s.whatsapp);
      if (s.storeName && s.storeName !== 'dot.') setName(s.storeName);
      else if (s.storeName === 'dot.' && isSkin) setName('SECRATE');
      if (s.logo) setLogo(s.logo);
    }).catch(() => {});
    getCategories().then((cs) => {
      if (Array.isArray(cs)) setCats(cs);
    }).catch(() => {});
  }, [isSkin]);
  return (
    <footer className="tabaya-footer">
      <div className="wrap">
        <div className="tabaya-footer-grid">
          <div>
            <div className="tabaya-footer-logo serif" style={{ display: 'inline-flex', alignItems: 'center', marginBottom: 12 }}>
              {logo ? (
                <img
                  src={logo}
                  alt={name}
                  style={{ maxHeight: 42, width: 'auto', objectFit: 'contain', display: 'block' }}
                />
              ) : (
                <span>{name}</span>
              )}
            </div>
            <p className="tabaya-footer-desc">
              {tr(isSkin
                ? 'Dermatologically-inspired botanical skincare, intimate wellness & everyday self-care rituals. Clean, gentle formulations crafted with active botanicals, delivered across Bangladesh with cash on delivery.'
                : 'Watches, sunglasses and gift collections for everyday style. Cash on delivery across Bangladesh.', language)}
            </p>
            <div className="tabaya-trust-pill">
              <span>🚚 {tr('Cash on Delivery Nationwide', language)}</span>
              <span>{isSkin ? `🌿 ${tr('100% Authentic Quality Guaranteed', language)}` : `🔄 ${tr('7-Day Easy Exchange Policy', language)}`}</span>
            </div>
          </div>
          <div>
            <h4>{tr('Collections', language)}</h4>
            <a onClick={() => go('shop')}>{tr(isSkin ? 'All Skincare & Essentials' : 'All Collections', language)}</a>
            {cats.filter((c) => !c.adult).slice(0, 5).map((c) => (
            <a key={c.slug} onClick={() => go('shop/' + c.slug)}>{tr(c.name, language)}</a>
            ))}
          </div>
          <div>
            <h4>{tr('Customer Care', language)}</h4>
            <a onClick={() => go('track')}>{tr('Track Your Order', language)}</a>
            <a onClick={() => go('info/shipping')}>{tr('Shipping & Delivery', language)}</a>
            <a onClick={() => go('info/returns')}>{tr('Returns & Exchanges', language)}</a>
            <a onClick={() => go('info/contact')}>{tr('Contact Customer Support', language)}</a>
          </div>
          <div>
            <h4>{tr('Hotline & Inquiries', language)}</h4>
            <p style={{ fontSize: 14, color: '#9ca3af', lineHeight: 1.6 }}>
              {tr('Need assistance? Call or WhatsApp our helpline:', language)}
            </p>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#ffffff', margin: '8px 0' }}>
              <a href={`tel:${phone}`} style={{ color: '#fff', textDecoration: 'none' }}>📞 {phone}</a>
            </div>
            {whatsapp && (
              <div style={{ marginTop: 6 }}>
                <a
                  href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(`Hello! I have an inquiry about ${name}.`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 7,
                    color: '#25D366',
                    textDecoration: 'none',
                    fontSize: 14,
                    fontWeight: 600,
                  }}
                >
                  <WhatsAppIcon size={18} variant="official" />
                  <span>WhatsApp: +{whatsapp.replace(/[^0-9]/g, '')}</span>
                </a>
              </div>
            )}
            <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 8 }}>
              {tr('Everyday: 10:00 AM – 10:00 PM', language)}
            </div>
          </div>
        </div>
        <div className="tabaya-footer-bottom">
          <span>{language === 'bn' ? `© ২০২৬ ${name}. সর্বস্বত্ব সংরক্ষিত।` : `© 2026 ${name}. All Rights Reserved.`}</span>
          <span>{tr('Cash on Delivery · Steadfast Courier · 100% Authentic Quality Guaranteed', language)}</span>
        </div>
      </div>
    </footer>
  );
}

function CartDrawer() {
  const language = useStoreLanguage();
  const { lines, total, open, setOpen, setQty, remove } = useCart();
  const isSkin = isSkincareSite();
  const [freeThreshold, setFreeThreshold] = useState(2500);
  useEffect(() => {
    getSettings().then((s) => {
      if (s.freeShipThreshold) setFreeThreshold(s.freeShipThreshold);
    }).catch(() => {});
  }, []);
  const progress = Math.min(100, Math.round((total / freeThreshold) * 100));
  const remainingForFree = Math.max(0, freeThreshold - total);

  return (
    <>
      <div className={'pc-cart-overlay' + (open ? ' open' : '')} onClick={() => setOpen(false)} />
      <aside className={'pc-cart-drawer' + (open ? ' open' : '')}>
        <div className="pc-drawer-head">
          <div style={{ display: 'flex', alignItems: 'baseline' }}>
            <span className="pc-drawer-title">{tr('Shopping Bag', language)}</span>
            <span className="pc-drawer-count">({lines.length} {lines.length === 1 ? 'ITEM' : 'ITEMS'})</span>
          </div>
          <button className="pc-drawer-close" onClick={() => setOpen(false)} aria-label="Close cart">×</button>
        </div>

        {/* Free Shipping Progress Meter */}
        <div className="tabaya-free-meter">
          {remainingForFree === 0 ? (
            <span style={{ color: '#15803d', fontWeight: 600 }}>✓ {tr('Free Delivery Unlocked!', language)}</span>
          ) : (
            <span>{language === 'bn' ? <>ফ্রি ডেলিভারি পেতে আরও <b>{taka(remainingForFree)}</b> যোগ করুন</> : <>Add <b>{taka(remainingForFree)}</b> more for <b>Free Delivery</b></>}</span>
          )}
          <div className="tabaya-meter-bar">
            <div className="tabaya-meter-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <div className="pc-drawer-items">
          {lines.length === 0 ? (
            <div className="pc-drawer-empty">
              <div style={{ fontSize: 40, marginBottom: 12 }}>🛍️</div>
              <h4 style={{ fontFamily: 'Playfair Display, Georgia, serif', fontSize: 20, margin: '0 0 6px', color: '#1f3147' }}>{tr('Your Bag is Empty', language)}</h4>
              <p style={{ fontSize: 13, color: '#6b645c', margin: '0 0 18px', maxWidth: 260, lineHeight: 1.5 }}>
                {tr(isSkin ? 'Discover our botanical skincare & self-care essentials to find your daily favorites.' : 'Explore our curated gifts, accessories, and lifestyle essentials.', language)}
              </p>
              <button className="pc-checkout-btn" style={{ maxWidth: 220 }} onClick={() => { setOpen(false); go('shop'); }}>
                {tr('EXPLORE SHOP', language)}
              </button>
            </div>
          ) : (
            lines.map((l) => (
              <div className="pc-cart-item" key={l.id}>
                <img className="pc-cart-item-img" src={l.image} alt={l.name} />
                <div className="pc-cart-item-body">
                  <h4 className="pc-cart-item-title">{l.name}</h4>
                  <div className="pc-cart-item-variant">
                    {(l.size || l.color)
                      ? [l.color ? `${tr('Color:', language)} ${l.color}` : null, l.size ? `${tr('Size:', language)} ${l.size}` : null].filter(Boolean).join(' · ')
                      : (l.variantId ? tr('Selected Option', language) : '')}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div className="pc-cart-item-qty">
                      <button className="pc-qty-btn" onClick={() => setQty(l.id, l.qty - 1)}>−</button>
                      <span className="pc-qty-num">{l.qty}</span>
                      <button className="pc-qty-btn" onClick={() => setQty(l.id, l.qty + 1)}>+</button>
                    </div>
                    <span className="pc-cart-item-price">{taka(l.price * l.qty)}</span>
                  </div>
                  <button className="pc-remove-btn" onClick={() => remove(l.id)}>{tr('Remove', language)}</button>
                </div>
              </div>
            ))
          )}
        </div>

        {lines.length > 0 && (
          <div className="pc-drawer-foot">
            <div className="pc-subtotal-row">
              <span className="pc-subtotal-label">{tr('SUBTOTAL', language)}</span>
              <span className="pc-subtotal-val">{taka(total)}</span>
            </div>
            <button className="pc-checkout-btn" onClick={() => { setOpen(false); go('checkout'); }}>
              {tr('PROCEED TO CHECKOUT →', language)}
            </button>
            <div style={{ textAlign: 'center', fontSize: 11, color: '#888', marginTop: 10, letterSpacing: '0.04em' }}>
              {tr('🔒 Cash on Delivery · Inspect Before Payment', language)}
            </div>
          </div>
        )}
      </aside>
    </>
  );
}

function MobileTabs() {
  const language = useStoreLanguage();
  const route = useRoute();
  const { count, setOpen } = useCart();
  return (
    <nav className="tabbar">
      <a className={'tab' + (route.name === 'home' ? ' on' : '')} onClick={() => go('home')}>
        <svg viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10.5 12 4l9 6.5" /><path d="M5.5 9.5V20h13V9.5" /></svg><span>{tr('Home', language)}</span>
      </a>
      <a className={'tab' + (route.name === 'shop' ? ' on' : '')} onClick={() => go('shop')}>
        <svg viewBox="0 0 24 24"><path d="M4 5h6v6H4zM14 5h6v6h-6zM4 15h6v6H4zM14 15h6v6h-6z" /></svg><span>{tr('Shop', language)}</span>
      </a>
      <a className="tab" onClick={() => setOpen(true)}>
        <span className="tabcart"><svg viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8h12l-.8 11.6a1 1 0 0 1-1 .9H7.8a1 1 0 0 1-1-.9L6 8z" /><path d="M9 8V7a3 3 0 0 1 6 0v1" /></svg>{count > 0 && <i className="badge" key={count}>{count}</i>}</span><span>{tr('Bag', language)}</span>
      </a>
      <a className={'tab' + (route.name === 'track' ? ' on' : '')} onClick={() => go('track')}>
        <svg viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s-6.5-5-6.5-10.5A6.5 6.5 0 0 1 18.5 10.5C18.5 16 12 21 12 21z" /><circle cx="12" cy="10.5" r="2.3" /></svg><span>{tr('Track Order', language)}</span>
      </a>
      <a className={'tab' + (route.name === 'account' ? ' on' : '')} onClick={() => go('account')}>
        <svg viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg><span>{tr('Account', language)}</span>
      </a>
    </nav>
  );
}

function WhatsAppFloat() {
  const route = useRoute();
  const [num, setNum] = useState('');
  const isSkin = isSkincareSite();
  const [brand, setBrand] = useState(isSkin ? 'SECRATE' : 'METRROMA');
  useEffect(() => {
    getSettings().then((s) => {
      const wa = s.whatsapp || s.phone || '';
      setNum(wa);
      if (s.storeName && s.storeName !== 'dot.') setBrand(s.storeName);
    }).catch(() => {});
  }, [isSkin]);
  if (!num || route.name === 'product' || route.name === 'checkout') return null;
  const clean = num.replace(/[^0-9]/g, '');
  const href = `https://wa.me/${clean}?text=${encodeURIComponent(`Hello! I have an inquiry about ${brand}.`)}`;
  return (
    <a className="wafloat" href={href} target="_blank" rel="noopener noreferrer" aria-label="Chat with us on WhatsApp" title="WhatsApp Chat">
      <WhatsAppIcon size={32} variant="official" />
    </a>
  );
}

function Toast() {
  const { toast } = useCart();
  return <div className={'toast' + (toast ? ' show' : '')} aria-live="polite">{toast}</div>;
}

function CartFab() {
  const { count, total, setOpen } = useCart();
  const route = useRoute();
  if (route.name === 'checkout' || route.name === 'confirm') return null;
  return (
    <button className="tabaya-side-cart" onClick={() => setOpen(true)} aria-label="Open your shopping bag" title="Shopping Bag">
      <div className="side-cart-top">
        <svg className="side-cart-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 8h12l-.8 11.6a1 1 0 0 1-1 .9H7.8a1 1 0 0 1-1-.9L6 8z" />
          <path d="M9 8V7a3 3 0 0 1 6 0v1" />
        </svg>
        <span className="side-cart-count">{count}</span>
        <span className="side-cart-label">{count === 1 ? 'ITEMS' : 'ITEMS'}</span>
      </div>
      <div className="side-cart-bot">
        <span className="side-cart-price">{taka(total)}</span>
      </div>
    </button>
  );
}

function Shell() {
  const route = useRoute();
  const [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => {
    getSettings().then((settings: any) => {
      const appearance = settings?.appearance || {};
      const root = document.documentElement;
      if (typeof appearance.accent === 'string' && /^#[0-9a-f]{6}$/i.test(appearance.accent)) root.style.setProperty('--store-accent', appearance.accent);
      if (typeof appearance.font === 'string') root.style.setProperty('--store-font', `'${appearance.font}', Inter, sans-serif`);
      if ([2, 3, 4].includes(Number(appearance.desktopColumns))) root.style.setProperty('--store-columns-desktop', String(appearance.desktopColumns));
      if ([1, 2].includes(Number(appearance.mobileColumns))) root.style.setProperty('--store-columns-mobile', String(appearance.mobileColumns));
      if (['contain', 'cover'].includes(appearance.imageFit)) root.style.setProperty('--store-image-fit', appearance.imageFit);
    }).catch(() => {});
  }, []);
  if (route.name === 'admin') return <Suspense fallback={<StoreLoading admin />}><Admin /></Suspense>;

  // Dedicated Landing Page Funnel (Standalone high-converting page)
  const isLanding =
    route.name === 'page' ||
    route.name === 'pages' ||
    route.name === 'lp' ||
    route.name === 'landing' ||
    route.name === 'step' ||
    route.name === 'funnel' ||
    route.name === 'lovelock' ||
    route.name === 'love-lock' ||
    route.name === 'magic-condom';

  if (isLanding) {
    const landingSlug = (route.name === 'page' || route.name === 'pages' || route.name === 'lp' || route.name === 'landing' || route.name === 'step' || route.name === 'funnel')
      ? (route.param || 'lovelock')
      : route.name;
    return (
      <Suspense fallback={<StoreLoading />}>
        <Effects />
        <LoveLockLanding slug={landingSlug} />
        <Toast />
      </Suspense>
    );
  }

  let page;
  if (route.name === 'shop') page = <Shop category={route.param} />;
  else if (route.name === 'product') page = <ProductPage slug={route.param} />;
  else if (route.name === 'checkout') page = <Checkout />;
  else if (route.name === 'track') page = <Track />;
  else if (route.name === 'account') page = <CustomerAccountPage onNavigate={go} />;
  else if (route.name === 'info') page = <InfoPage slug={route.param} />;
  else if (route.name === 'confirm') page = <Confirm id={route.param} />;
  else page = <Home />;
  return (
    <>
      <div className="amb"><span className="orb o1" /><span className="orb o2" /><span className="orb o3" /></div><div className="cursor" id="cur" /><div className="grain" />
      <Effects />
      <Header onSearch={() => setSearchOpen(true)} />
      <main><div className="page-in" key={route.name + ':' + route.param}>{page}</div></main>
      <Footer />
      <CartDrawer />
      <MobileTabs />
      <WhatsAppFloat />
      <CartFab />
      <Toast />
      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}

export default function App() {
  return (
    <CustomerProvider>
      <CartProvider>
        <Shell />
      </CartProvider>
    </CustomerProvider>
  );
}

