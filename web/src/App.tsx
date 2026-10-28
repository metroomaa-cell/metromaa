import { useEffect, useState, useRef, lazy, Suspense } from 'react';
import { CartProvider, useCart, useRoute, go } from './cart';
import { taka, getSettings, isSkincareSite, getCategories, isWellnessOrExcludedCategory, getCachedSettings, getCachedCategories } from './api';
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

    const setMetaName = (name: string, val: string) => {
      let m = document.head.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
      if (!m) {
        m = document.createElement('meta');
        m.setAttribute('name', name);
        document.head.appendChild(m);
      }
      m.setAttribute('content', val);
    };
    const setCanonical = (href: string) => {
      let c = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
      if (!c) {
        c = document.createElement('link');
        c.setAttribute('rel', 'canonical');
        document.head.appendChild(c);
      }
      c.setAttribute('href', href);
    };

    const isNoIndexRoute =
      ['admin', 'checkout', 'confirm', 'track', 'account'].includes(route.name) ||
      (route.name === 'shop' && isWellnessOrExcludedCategory(route.param));

    if (route.name !== 'product') {
      if (isNoIndexRoute) {
        setMetaName('robots', 'noindex, nofollow, noarchive, nosnippet, noimageindex');
        setMetaName('googlebot', 'noindex, nofollow, noarchive, nosnippet, noimageindex');
      } else {
        setMetaName('robots', 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1');
        setMetaName('googlebot', 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1');
      }
    }

    getSettings().then((s) => {
      const brand = s.storeName && s.storeName !== 'dot.' ? s.storeName : defaultBrand;
      const t: any = isSkin
        ? {
            home: `${brand} Bangladesh | Skincare, Beauty & Self-Care Products`,
            shop: `Shop Skincare, Makeup, Hair Care & Personal Care in Bangladesh | ${brand}`,
            track: `Track Your Order — ${brand}`,
            checkout: `Checkout (Cash on Delivery) — ${brand}`,
            confirm: `Order Placed Successfully — ${brand}`,
            info: brand,
            admin: `Admin Dashboard — ${brand}`,
          }
        : {
            home: `${brand} | Embrace the metro lifestyle`,
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
          if (isWellnessOrExcludedCategory(route.param) || category?.noIndex || category?.seoExclude || category?.adult) {
            document.title = brand;
            setMetaName('robots', 'noindex, nofollow, noarchive, nosnippet, noimageindex');
            setMetaName('googlebot', 'noindex, nofollow, noarchive, nosnippet, noimageindex');
            setMetaName('description', brand);
            setMetaName('keywords', '');
          } else {
            document.title = category?.seoTitle || `Shop ${category?.name || 'Skincare'} Online in Bangladesh | ${brand}`;
            setMetaName('description', category?.seoDesc || `Browse ${category?.name || 'Skincare'} products in Bangladesh at ${brand}. Cash on Delivery across Bangladesh.`);
            setMetaName('keywords', category?.seoKeywords || `${(category?.name || 'skincare').toLowerCase()} bangladesh, ${(category?.name || 'skincare').toLowerCase()} price in bd, ${brand.toLowerCase()}`);
            setCanonical(`${window.location.origin}/shop/${route.param}`);
          }
        }).catch(() => {
          if (active) document.title = `${isSkin ? 'Shop Skincare' : 'Collection'} — ${brand}`;
        });
      } else if (route.name !== 'product') {
        document.title = t[route.name] || brand;
        if (!isNoIndexRoute) {
          setCanonical(`${window.location.origin}${route.name === 'home' ? '/' : '/' + route.name}`);
        }
      }
    }).catch(() => {
      if (route.name === 'shop' && route.param) {
        if (active) document.title = `${isSkin ? 'Shop Skincare' : 'Collection'} — ${defaultBrand}`;
      } else if (route.name !== 'product') {
        document.title = isSkin ? 'SECRATE Bangladesh | Skincare & Self-Care' : 'METROMAA | Embrace the metro lifestyle';
      }
    });

    if (route.name !== 'product' && !(route.name === 'shop' && route.param)) {
      setMetaName(
        'description',
        isSkin
          ? 'Skincare, beauty and self-care products from a range of brands, delivered across Bangladesh with cash on delivery.'
          : 'Watches, sunglasses, and gift collections delivered across Bangladesh with cash on delivery.'
      );
      setMetaName(
        'keywords',
        isSkin
          ? 'skincare bangladesh, beauty products bd, self-care products, secrate bangladesh'
          : 'metrroma bangladesh, watches bd, sunglasses bd'
      );
    }
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
  const [announce, setAnnounce] = useState(() => {
    const s = getCachedSettings();
    if (s?.announce && s.announce.trim()) {
      return s.announce.trim().replace(/100%\s+AUTHENTIC[^·]*/gi, isSkin ? 'PRODUCT DETAILS AVAILABLE' : 'CURATED LIFESTYLE & GIFTS');
    }
    return isSkin
      ? '✨ Skincare & Self-Care · Cash on Delivery Nationwide · Product Details Available'
      : '✨ Carefully Curated Watches, Sunglasses & Gifts · Cash on Delivery Nationwide';
  });
  useEffect(() => {
    getSettings().then((s) => {
      if (s.announce && s.announce.trim()) {
        setAnnounce(s.announce.trim().replace(/100%\s+AUTHENTIC[^·]*/gi, isSkin ? 'PRODUCT DETAILS AVAILABLE' : 'CURATED LIFESTYLE & GIFTS'));
      } else {
        const threshold = s.freeShipThreshold ? taka(s.freeShipThreshold) : '৳2,500';
        setAnnounce(
          isSkin
            ? `✨ Skincare & Self-Care · Cash on Delivery Nationwide · Free Shipping Over ${threshold}`
            : `✨ Carefully Curated Watches, Sunglasses & Gifts · Cash on Delivery Nationwide · Free Delivery Over ${threshold}`
        );
      }
    }).catch(() => {
      setAnnounce(
        isSkin
          ? '✨ Skincare & Self-Care · Cash on Delivery Nationwide · Product Details Available'
          : '✨ Carefully Curated Watches, Sunglasses & Gifts · Cash on Delivery Nationwide'
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
  const [storeName, setStoreName] = useState(() => getCachedSettings()?.storeName || (isSkin ? 'SECRATE' : 'METRROMA'));
  const [logo, setLogo] = useState(() => getCachedSettings()?.logo || (isSkin ? '' : '/uploads/img_mvddqd311xu5c.webp'));
  const [cats, setCats] = useState<{ slug: string; name: string; parentSlug?: string }[]>(() => getCachedCategories());
  const [expandedMobileCat, setExpandedMobileCat] = useState<string | null>(null);
  const [hoveredMainCat, setHoveredMainCat] = useState<string | null>(null);
  const route = useRoute();
  const nav = (p: string) => { go(p); setMenu(false); setHoveredMainCat(null); };

  useEffect(() => {
    getSettings().then((s) => {
      if (s.storeName && s.storeName !== 'dot.') setStoreName(s.storeName);
      else if (s.storeName === 'dot.' && isSkin) setStoreName('SECRATE');
      setLogo(s.logo || '');
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

  const mainCats = cats.filter((c) => !c.parentSlug);
  const visibleCats = mainCats.slice(0, 3);
  const dropdownCats = mainCats.slice(3);

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
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                <path d="M4 7h16" />
                <path d="M4 12h12" />
                <path d="M4 17h16" />
              </svg>
            </button>
            <div className="tabaya-header-logo" onClick={() => nav('home')} style={{ display: 'inline-flex', alignItems: 'center' }}>
              {logo ? (
                <img
                  className="tabaya-header-logo-img"
                  src={logo}
                  alt={storeName}
                  onError={() => setLogo('')}
                />
              ) : (
                <span>{storeName}</span>
              )}
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
                const subCats = cats.filter((sc) => sc.parentSlug === c.slug);
                const isActive = route.name === 'shop' && (route.param === c.slug || subCats.some((sc) => route.param === sc.slug));
                if (subCats.length > 0) {
                  const isOpen = hoveredMainCat === c.slug;
                  return (
                    <li
                      key={c.slug}
                      className={`tabaya-nav-dropdown ${isOpen ? 'open' : ''} ${isActive ? 'active' : ''}`}
                      onMouseEnter={() => setHoveredMainCat(c.slug)}
                      onMouseLeave={() => setHoveredMainCat(null)}
                    >
                      <button
                        type="button"
                        className="tabaya-nav-dropdown-btn"
                        onClick={() => nav('shop/' + c.slug)}
                      >
                        <span>{tr(c.name, language)}</span>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </button>
                      <ul className="tabaya-nav-dropdown-menu">
                        <li>
                          <a
                            className={`tabaya-nav-dropdown-item ${route.name === 'shop' && route.param === c.slug ? 'active' : ''}`}
                            style={{ fontWeight: 700, borderBottom: '1px solid rgba(180,142,76,0.18)' }}
                            onClick={() => nav('shop/' + c.slug)}
                          >
                            All {tr(c.name, language)}
                          </a>
                        </li>
                        {subCats.map((sc) => (
                          <li key={sc.slug}>
                            <a
                              className={`tabaya-nav-dropdown-item ${route.name === 'shop' && route.param === sc.slug ? 'active' : ''}`}
                              onClick={() => nav('shop/' + sc.slug)}
                            >
                              ↳ {tr(sc.name, language)}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </li>
                  );
                }
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
                  <ul className="tabaya-nav-dropdown-menu" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
                    {dropdownCats.map((c) => {
                      const subCats = cats.filter((sc) => sc.parentSlug === c.slug);
                      return (
                        <li key={c.slug}>
                          <a
                            className={`tabaya-nav-dropdown-item ${route.name === 'shop' && route.param === c.slug ? 'active' : ''}`}
                            style={{ fontWeight: 600 }}
                            onClick={() => {
                              nav('shop/' + c.slug);
                              setCatDropdownOpen(false);
                            }}
                          >
                            {tr(c.name, language)}
                          </a>
                          {subCats.map((sc) => (
                            <a
                              key={sc.slug}
                              className={`tabaya-nav-dropdown-item ${route.name === 'shop' && route.param === sc.slug ? 'active' : ''}`}
                              style={{ paddingLeft: 26, fontSize: 12, opacity: 0.88 }}
                              onClick={() => {
                                nav('shop/' + sc.slug);
                                setCatDropdownOpen(false);
                              }}
                            >
                              ↳ {tr(sc.name, language)}
                            </a>
                          ))}
                        </li>
                      );
                    })}
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
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="6.5" />
                <path d="m16 16 4.2 4.2" />
              </svg>
            </button>

            <CustomerHeaderIcon onNavigate={nav} />

            <button
              className="tabaya-h-btn tabaya-h-cart-btn"
              onClick={() => setOpen(true)}
              aria-label="Shopping Cart"
              title="Cart"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5.5 8h13l-.9 10.5a2 2 0 0 1-2 1.8H8.4a2 2 0 0 1-2-1.8L5.5 8Z" />
                <path d="M8.5 8V6.5a3.5 3.5 0 0 1 7 0V8" />
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
                style={{ maxHeight: 36, width: 'auto', objectFit: 'contain', display: 'block' }}
                onError={() => setLogo('')}
              />
            ) : (
              <span>{storeName}</span>
            )}
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
          <a onClick={() => nav('home')} className="tabaya-mmenu-link">{tr('Home', language)}</a>
          <a onClick={() => nav('shop')} className="tabaya-mmenu-link">{tr(isSkin ? 'All Skincare' : 'All Collections', language)}</a>
          {mainCats.map((mc) => {
            const subCats = cats.filter((sc) => sc.parentSlug === mc.slug);
            const isExp = expandedMobileCat === mc.slug;
            return (
              <div key={mc.slug} style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <a
                    onClick={() => nav('shop/' + mc.slug)}
                    className="tabaya-mmenu-link"
                    style={{ flex: 1 }}
                  >
                    {tr(mc.name, language)}
                  </a>
                  {subCats.length > 0 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedMobileCat(isExp ? null : mc.slug);
                      }}
                      aria-label={`Toggle ${mc.name} sub-categories`}
                      style={{
                        background: 'rgba(180, 142, 76, 0.12)',
                        border: '1px solid rgba(180, 142, 76, 0.3)',
                        borderRadius: 6,
                        width: 28,
                        height: 28,
                        display: 'grid',
                        placeItems: 'center',
                        fontSize: 15,
                        fontWeight: 700,
                        color: '#1f3147',
                        cursor: 'pointer',
                      }}
                    >
                      {isExp ? '−' : '+'}
                    </button>
                  )}
                </div>
                {isExp && subCats.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', paddingLeft: 14, marginBottom: 6, borderLeft: '2px solid rgba(180, 142, 76, 0.35)', marginLeft: 6 }}>
                    {subCats.map((sc) => (
                      <a
                        key={sc.slug}
                        onClick={() => nav('shop/' + sc.slug)}
                        className="tabaya-mmenu-link"
                        style={{ fontSize: 13.5, padding: '7px 0', color: '#475569' }}
                      >
                        ↳ {tr(sc.name, language)}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          <a onClick={() => nav('track')} className="tabaya-mmenu-link">{tr('Track Order', language)}</a>
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
  const [name, setName] = useState(isSkin ? 'SECRATE' : 'METRROMA');
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
                ? 'Skincare, beauty and self-care products from a range of brands, delivered across Bangladesh with cash on delivery. Check each listing for product and ingredient details.'
                : 'Watches, sunglasses and gift collections for everyday style. Cash on delivery across Bangladesh.', language)}
            </p>
            <div className="tabaya-trust-pill">
              <span>🚚 {tr('Cash on Delivery Nationwide', language)}</span>
              <span>{isSkin ? `🌿 ${tr('Product Details & Ingredient Information', language)}` : `🔄 ${tr('7-Day Easy Exchange Policy', language)}`}</span>
            </div>
          </div>
          <div>
            <h4>{tr('Collections', language)}</h4>
            <a onClick={() => go('shop')}>{tr(isSkin ? 'All Skincare & Essentials' : 'All Collections', language)}</a>
            {cats.filter((c: any) => !c.parentSlug && !c.adult && !isWellnessOrExcludedCategory(c.slug)).slice(0, 6).map((c) => (
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
          <span>{tr('Cash on Delivery · Steadfast Courier · Customer Support Available', language)}</span>
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
                {tr(isSkin ? 'Explore skincare, beauty, and self-care products from a range of brands.' : 'Explore our curated gifts, accessories, and lifestyle essentials.', language)}
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
              {tr('🔒 Cash on Delivery · Courier Inspection Policy Applies', language)}
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
    <nav className="tabbar" aria-label="Mobile Navigation">
      <a className={'tab' + (route.name === 'home' ? ' on' : '')} onClick={() => go('home')}>
        <span className="tab-icon-wrap">
          <svg viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3.8 10.2 12 3.8l8.2 6.4" />
            <path d="M6.2 9.5v9.2a1.3 1.3 0 0 0 1.3 1.3h9a1.3 1.3 0 0 0 1.3-1.3V9.5" />
            <path d="M10 20v-5.2a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1V20" />
          </svg>
        </span>
        <span className="tab-label">{tr('Home', language)}</span>
      </a>
      <a className={'tab' + (route.name === 'shop' ? ' on' : '')} onClick={() => go('shop')}>
        <span className="tab-icon-wrap">
          <svg viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="4" width="6.5" height="6.5" rx="1.6" />
            <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6" />
            <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6" />
            <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6" />
          </svg>
        </span>
        <span className="tab-label">{tr('Shop', language)}</span>
      </a>
      <a className="tab" onClick={() => setOpen(true)}>
        <span className="tab-icon-wrap tabcart">
          <svg viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5.5 8.2h13l-.85 10.2a1.8 1.8 0 0 1-1.8 1.6H8.15a1.8 1.8 0 0 1-1.8-1.6L5.5 8.2Z" />
            <path d="M8.8 8.2V6.6a3.2 3.2 0 0 1 6.4 0v1.6" />
          </svg>
          {count > 0 && <i className="badge" key={count}>{count}</i>}
        </span>
        <span className="tab-label">{tr('Bag', language)}</span>
      </a>
      <a className={'tab' + (route.name === 'track' ? ' on' : '')} onClick={() => go('track')}>
        <span className="tab-icon-wrap">
          <svg viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20.5s-6-4.6-6-9.8a6 6 0 0 1 12 0c0 5.2-6 9.8-6 9.8Z" />
            <circle cx="12" cy="10.5" r="2.2" />
          </svg>
        </span>
        <span className="tab-label">{language === 'bn' ? 'ট্র্যাক' : 'Track'}</span>
      </a>
      <a className={'tab' + (route.name === 'account' ? ' on' : '')} onClick={() => go('account')}>
        <span className="tab-icon-wrap">
          <svg viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="8.2" r="3.6" />
            <path d="M5.5 19.8a6.5 6.5 0 0 1 13 0" />
          </svg>
        </span>
        <span className="tab-label">{tr('Account', language)}</span>
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

  // Dedicated Landing Page Funnel — strictly ONLY /page/<slug>
  const infoSlugs = ['privacy', 'terms', 'about', 'shipping', 'returns', 'contact', 'journal'];
  const isLanding = route.name === 'page' && !!route.param && !infoSlugs.includes(route.param.toLowerCase());

  if (isLanding) {
    return (
      <Suspense fallback={<StoreLoading />}>
        <Effects />
        <LoveLockLanding slug={route.param} />
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
  else if (route.name === 'info' || (route.name === 'page' && infoSlugs.includes((route.param || '').toLowerCase()))) page = <InfoPage slug={route.param} />;
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

