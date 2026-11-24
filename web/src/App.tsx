import { useEffect, useState, useRef, lazy, Suspense } from 'react';
import { CartProvider, useCart, useRoute, go } from './cart';
import { WishlistProvider, useWishlist, WishlistDrawer } from './wishlist';
import { taka, getSettings, isSkincareSite, getCategories, isWellnessOrExcludedCategory, getCachedSettings, getCachedCategories } from './api';
import { initGTM, initFB, dl, trackEngagement, initInteractionTracking } from './analytics';
import { Home, Shop, ProductPage, Checkout, Confirm, Track, SearchOverlay, InfoPage } from './pages';
import { CustomerProvider, useCustomer, CustomerHeaderIcon, CustomerAccountPage } from './CustomerAccount';
import { WhatsAppIcon } from './icons';
import { setStoreLanguage, setStoreCopyOverrides, tr, useStoreLanguage } from './language';
import { NotificationWidgets } from './NotificationWidgets';
import { getTrafficAttribution } from './attribution';
import { LiveAiCallClient } from './liveAiCall';
const Admin = lazy(() => import('./admin').then((m) => ({ default: m.Admin })));
const LoveLockLanding = lazy(() => import('./LoveLockLanding').then((m) => ({ default: m.LoveLockLanding })));

function getSiteBrandDefaults() {
  const h = typeof window !== 'undefined' ? window.location.hostname.toLowerCase() : '';
  if (h.includes('secrate')) return { name: 'SECRATE', logo: '/uploads/logo_secrate_rich.webp', isMetrroma: false };
  if (h.includes('metrroma') || h.includes('metromaa')) return { name: 'METRROMA', logo: '/logo_metrroma.png', isMetrroma: true };
  return { name: 'TimeBoost', logo: '/uploads/logo_timeboost.svg', isMetrroma: false };
}

function resolveBrandName(storeName?: string | null) {
  const def = getSiteBrandDefaults();
  if (!storeName || storeName === 'dot.') return def.name;
  if (storeName === 'METRROMA' && !def.isMetrroma) return def.name;
  return storeName;
}

function resolveBrandLogo(logo?: string | null) {
  if (logo && typeof logo === 'string' && logo.trim()) return logo.trim();
  return getSiteBrandDefaults().logo;
}

function StoreLoading({ admin = false }: { admin?: boolean }) {
  const baseBrand = getSiteBrandDefaults().name;
  const brand = admin ? `${baseBrand} ADMIN` : baseBrand;
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
  const isAdmin = route.name === 'admin' || (typeof window !== 'undefined' && (/(\/|^)(admin|wp-admin|staff)(\/|$)/i.test(window.location.pathname) || window.location.hash.includes('admin') || window.location.hash.includes('staff') || !!localStorage.getItem('dot_admin_token') || !!sessionStorage.getItem('sa_admin_nav')));

  useEffect(() => {
    getTrafficAttribution();
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
      } else {
        document.querySelectorAll("link[rel*='icon'], link[rel='apple-touch-icon']").forEach((el) => el.remove());
        const blank = document.createElement('link');
        blank.rel = 'icon';
        blank.href = 'data:,';
        document.head.appendChild(blank);
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
    const defaultBrand = getSiteBrandDefaults().name;

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
      const brand = resolveBrandName(s.storeName);
      const t: any = isSkin
        ? {
            home: `${brand} — For your personal world.`,
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
            setCanonical(`${window.location.origin}/categories/${route.param}`);
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
        document.title = `${defaultBrand} — For your personal world.`;
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
          : 'skincare bangladesh, beauty products bd, self-care products, secrate bangladesh'
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

  // Preserve storefront scroll position across page refreshes
  useEffect(() => {
    if (isAdmin) return;
    const key = 'store_scroll_' + window.location.pathname + window.location.search;
    try {
      const savedY = parseInt(sessionStorage.getItem(key) || '0', 10);
      if (savedY > 0) {
        const t1 = setTimeout(() => window.scrollTo(0, savedY), 120);
        const t2 = setTimeout(() => window.scrollTo(0, savedY), 450);
        var clearTimers = () => { clearTimeout(t1); clearTimeout(t2); };
      }
    } catch {}
    let timer: any = null;
    const onScroll = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        try { sessionStorage.setItem(key, String(Math.round(window.scrollY))); } catch {}
      }, 200);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (timer) clearTimeout(timer);
      if (typeof clearTimers === 'function') clearTimers();
    };
  }, [route.name, route.param, isAdmin]);

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
  const { count: wishlistCount, setOpen: setWishlistOpen } = useWishlist();
  const { customer, openAuth } = useCustomer();
  const [menu, setMenu] = useState(false);
  const isSkin = isSkincareSite();
  const [heroStyle, setHeroStyle] = useState<'royalman' | 'tabaya'>(() => (getCachedSettings()?.appearance?.heroStyle === 'tabaya' ? 'tabaya' : 'royalman'));

  const [storeName, setStoreName] = useState(() => resolveBrandName(getCachedSettings()?.storeName));
  const [logo, setLogo] = useState(() => resolveBrandLogo(getCachedSettings()?.logo));
  const [cats, setCats] = useState<{ slug: string; name: string; parentSlug?: string }[]>(() => getCachedCategories());
  const [expandedMobileCat, setExpandedMobileCat] = useState<string | null>(null);
  const [hoveredMainCat, setHoveredMainCat] = useState<string | null>(null);
  const route = useRoute();
  const nav = (p: string) => { go(p); setMenu(false); setHoveredMainCat(null); };

  useEffect(() => {
    getSettings().then((s) => {
      setStoreName(resolveBrandName(s.storeName));
      setLogo(resolveBrandLogo(s.logo));
      if (s?.appearance?.heroStyle) setHeroStyle(s.appearance.heroStyle);
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

  const adultSubSlugs = new Set(['condom', 'for-man', 'for-women', 'muster-b-toy', 'finger-condom']);
  const mainCats = cats.filter((c) => !c.parentSlug && !adultSubSlugs.has(c.slug));
  const visibleCats = mainCats.slice(0, 4);
  const dropdownCats = mainCats.slice(4);

  return (
    <>
      <AnnouncementBar />
            <header className={`tabaya-header ${heroStyle === 'royalman' ? 'store-royal-header' : 'store-tabaya-header'}`}>

        <div className="tabaya-header-inner">
          {/* Left Column: Mobile Hamburger & Desktop Logo */}
          <div className="tabaya-header-left">
            <button
              className="tabaya-hamburger-btn"
              onClick={() => setMenu(true)}
              aria-label="Open Navigation Menu"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M4 7h16" />
                <path d="M4 12h16" />
                <path d="M4 17h16" />
              </svg>
            </button>
            <div
              className="tabaya-header-logo desktop-only-logo"
              onClick={() => nav('home')}
            >
              {logo ? (
                <img
                  className="tabaya-header-logo-img"
                  src={logo}
                  alt={storeName}
                  onError={() => {
                    const fallback = getSiteBrandDefaults().logo;
                    if (logo !== fallback) setLogo(fallback);
                  }}
                />
              ) : (
                <span className="tabaya-header-logo" style={{ fontSize: 20 }}>{storeName}</span>
              )}
            </div>
          </div>

          {/* Mobile Centered Logo */}
          <div
            className="tabaya-header-logo-center mobile-only-logo"
            onClick={() => nav('home')}
          >
            {logo ? (
              <img
                className="tabaya-header-logo-img"
                src={logo}
                alt={storeName}
                onError={() => setLogo('')}
              />
            ) : (
              <span className="tabaya-header-logo" style={{ fontSize: 20 }}>{storeName}</span>
            )}
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
                        onClick={() => nav('categories/' + c.slug)}
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
                            onClick={() => nav('categories/' + c.slug)}
                          >
                            All {tr(c.name, language)}
                          </a>
                        </li>
                        {subCats.map((sc) => (
                          <li key={sc.slug}>
                            <a
                              className={`tabaya-nav-dropdown-item ${route.name === 'shop' && route.param === sc.slug ? 'active' : ''}`}
                              onClick={() => nav('categories/' + sc.slug)}
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
                      onClick={() => nav('categories/' + c.slug)}
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
                              nav('categories/' + c.slug);
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
                                nav('categories/' + sc.slug);
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
            </ul>
          </nav>

          {/* Right Column: Only Track Order button as requested */}
                    {/* Right Column: Dynamic based on heroStyle (royalman vs tabaya) */}
          <div className="tabaya-header-right">
            {/* Language Selector */}
            <label className="header-language-wrap desktop-btn-group" aria-label="Choose website language">
              <select className="header-language" value={language} onChange={(e) => setStoreLanguage(e.target.value as 'en' | 'bn')} aria-label="Choose website language">
                <option value="en">EN</option>
                <option value="bn">BN</option>
              </select>
            </label>

            {/* Tracking Button (Icon on mobile, pill badge with icon + text on PC) */}
            <button
              className={`tabaya-h-track-btn ${route.name === 'track' ? 'active' : ''}`}
              onClick={() => nav('track')}
              aria-label={tr('Track Order', language)}
              title={tr('Track Order', language)}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1" y="3" width="15" height="13" rx="1" />
                <polygon points="16 8 20 8 23 11 23 16 16 16 8" />
                <circle cx="5.5" cy="18.5" r="2.5" />
                <circle cx="18.5" cy="18.5" r="2.5" />
              </svg>
              <span className="track-btn-label">{language === 'bn' ? 'ট্র্যাকিং' : 'Tracking'}</span>
            </button>

            {/* Customer Account Button */}
            <span className="desktop-btn-group">
              <CustomerHeaderIcon onNavigate={nav} />
            </span>

            {/* Wishlist Button */}
            <button
              className="tabaya-h-btn tabaya-h-wishlist-btn desktop-btn-group"
              onClick={() => setWishlistOpen(true)}
              aria-label={tr('My Wishlist', language)}
              title={tr('My Wishlist', language)}
              style={{ position: 'relative' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill={wishlistCount > 0 ? '#ef4444' : 'none'} stroke={wishlistCount > 0 ? '#ef4444' : 'currentColor'} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
              </svg>
              {wishlistCount > 0 && <span className="tabaya-h-cart-badge" style={{ background: '#ef4444', color: '#fff' }}>{wishlistCount}</span>}
            </button>

            {/* Cart Button */}
            <button
              className="tabaya-h-btn tabaya-h-cart-btn desktop-btn-group"
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

        {/* Full-width Search Bar (Shown in RoyalMan style) */}
        {heroStyle !== 'tabaya' && (
          <div className="store-top-search-wrap">
            <form
              className="store-top-search-bar"
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const input = (form.elements.namedItem('q') as HTMLInputElement)?.value?.trim();
                if (input) {
                  go('shop?q=' + encodeURIComponent(input));
                } else {
                  onSearch();
                }
              }}
            >
              <input
                type="search"
                name="q"
                className="store-top-search-input"
                placeholder={language === 'bn' ? 'প্রোডাক্ট খুঁজুন...' : 'Search for products'}
                autoComplete="off"
              />
              <button type="submit" className="store-top-search-btn" aria-label="Search">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="6.5" />
                  <path d="m16 16 4.5 4.5" />
                </svg>
              </button>
            </form>
          </div>
        )}
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
          <a onClick={() => nav('home')} className="tabaya-mmenu-link">{tr('Home', language)}</a>
          <a onClick={() => nav('shop')} className="tabaya-mmenu-link">{tr(isSkin ? 'All Skincare' : 'All Collections', language)}</a>
          {mainCats.map((mc) => {
            const subCats = cats.filter((sc) => sc.parentSlug === mc.slug);
            const isExp = expandedMobileCat === mc.slug;
            return (
              <div key={mc.slug} style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <a
                    onClick={() => nav('categories/' + mc.slug)}
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
                        onClick={() => nav('categories/' + sc.slug)}
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
            onClick={() => { setWishlistOpen(true); setMenu(false); }}
            className="tabaya-mmenu-link"
            style={{ color: '#ef4444', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <span>❤️ {language === 'bn' ? 'আমার উইশলিস্ট' : 'My Wishlist'} ({wishlistCount})</span>
          </a>
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
  const [name, setName] = useState(() => resolveBrandName(getCachedSettings()?.storeName));
  const [logo, setLogo] = useState(() => resolveBrandLogo(getCachedSettings()?.logo));
  const [cats, setCats] = useState<{ slug: string; name: string; adult?: boolean }[]>([]);
  useEffect(() => {
    getSettings().then((s) => {
      if (s.phone) setPhone(s.phone);
      if (s.whatsapp) setWhatsapp(s.whatsapp);
      setName(resolveBrandName(s.storeName));
      setLogo(resolveBrandLogo(s.logo));
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
                  style={{ maxHeight: 46, width: 'auto', objectFit: 'contain', display: 'block' }}
                />
              ) : null}
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
            <a key={c.slug} onClick={() => go('categories/' + c.slug)}>{tr(c.name, language)}</a>
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
          <span>
            Designed & Developed by{' '}
            <span style={{ color: '#b48e4c', fontWeight: 600 }}>Shakil</span>
          </span>
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
  const { count: wishlistCount, setOpen: setWishlistOpen } = useWishlist();
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
      <a className="tab" onClick={() => setWishlistOpen(true)}>
        <span className="tab-icon-wrap">
          <svg viewBox="0 0 24 24" fill={wishlistCount > 0 ? '#ef4444' : 'none'} stroke={wishlistCount > 0 ? '#ef4444' : 'currentColor'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
          </svg>
          {wishlistCount > 0 && <i className="badge" style={{ background: '#ef4444', color: '#fff' }}>{wishlistCount}</i>}
        </span>
        <span className="tab-label">{language === 'bn' ? 'পছন্দ' : 'Wishlist'}</span>
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

function SmartWhatsAppChat() {
  const route = useRoute();
  const language = useStoreLanguage();
  const [num, setNum] = useState('');
  const [brand, setBrand] = useState(() => {
    const cached = getCachedSettings()?.storeName;
    if (cached && cached !== 'dot.' && cached !== 'METRROMA') return cached;
    if (typeof window !== 'undefined') {
      const h = window.location.hostname.toLowerCase();
      if (h.includes('secrate')) return 'Secrate';
      if (h.includes('metrroma')) return 'Metrroma';
    }
    return 'TimeBoost';
  });
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [showTooltip, setShowTooltip] = useState(true);
  const cardRef = useRef<HTMLDivElement>(null);

  // Free Web-to-Web Live Voice Call State
  const [callMode, setCallMode] = useState(false);
  const [callState, setCallState] = useState<'form' | 'connecting' | 'ringing' | 'connected' | 'error'>('form');
  const [callerName, setCallerName] = useState('');
  const [callerPhone, setCallerPhone] = useState('');
  const [callDept, setCallDept] = useState<'Order' | 'Tracking' | 'Advice'>('Order');
  const [callSecs, setCallSecs] = useState(0);
  const [callMuted, setCallMuted] = useState(false);
  const [showKeypad, setShowKeypad] = useState(false);
  const [callErr, setCallErr] = useState('');
  const [callQueueInfo, setCallQueueInfo] = useState<{ ticketId: string; serialNumber: string; aheadCount: number; estimatedWaitSec: number; onlineAgents: number; busyAgents: number } | null>(null);
  const callQueueRef = useRef<any>(null);
  const [humanAudioMode, setHumanAudioMode] = useState<'speaker' | 'earpiece'>('speaker');
  const uaRef = useRef<any>(null);
  const sessionRef = useRef<any>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const callTimerRef = useRef<any>(null);

  // Smart AI Website Voice Assistant State (Gemini 3.8 Live Real-Time Audio)
  const [aiCfg, setAiCfg] = useState<{ enabled: boolean; websiteInboundAi: boolean; hasApiKey: boolean; adminOnline: boolean; supportPhone: string }>({ enabled: true, websiteInboundAi: true, hasApiKey: true, adminOnline: true, supportPhone: '' });
  const [aiCallStatus, setAiCallStatus] = useState<'idle' | 'connecting' | 'ringing' | 'connected' | 'ended' | 'error'>('idle');
  const aiCallStatusRef = useRef<'idle' | 'connecting' | 'ringing' | 'connected' | 'ended' | 'error'>('idle');
  const [incomingAiCall, setIncomingAiCall] = useState(false);
  useEffect(() => { aiCallStatusRef.current = aiCallStatus; }, [aiCallStatus]);
  const [aiTurns, setAiTurns] = useState<{ role: 'ai' | 'user' | 'sys'; text: string }[]>([]);
  const [aiMuted, setAiMuted] = useState(false);
  const [aiSeconds, setAiSeconds] = useState(0);
  const [aiVol, setAiVol] = useState(0);
  const [aiTextInput, setAiTextInput] = useState('');
  const [aiShowKeypad, setAiShowKeypad] = useState(false);
  const [aiAudioMode, setAiAudioMode] = useState<'speaker' | 'earpiece'>('speaker');
  const [chatyOpen, setChatyOpen] = useState(false);
  const aiLiveRef = useRef<LiveAiCallClient | null>(null);

  useEffect(() => {
    fetch('/api/ai-call/config').then((r) => r.json()).then((d) => {
      if (d && typeof d.enabled === 'boolean') {
        setAiCfg({
          enabled: d.enabled,
          websiteInboundAi: d.websiteInboundAi !== false,
          hasApiKey: d.hasApiKey !== false,
          adminOnline: d.adminOnline !== false,
          supportPhone: String(d.supportPhone || '').trim()
        });
      }
    }).catch(() => {});
  }, []);

  const canUseAiCall = aiCfg.enabled && aiCfg.websiteInboundAi && aiCfg.hasApiKey;

  const triggerDirectPhoneFallback = (reasonText?: string) => {
    const rawNum = String(aiCfg.supportPhone || num || '').replace(/[^\d+]/g, '');
    const telHref = rawNum ? `tel:${rawNum.startsWith('880') ? '+' + rawNum : rawNum}` : '';
    setCallErr(
      reasonText ||
      (isBn
        ? 'এই মুহূর্তে অ্যাডমিন প্যানেলে কেউ অ্যাক্টিভ নেই — সরাসরি ফোনে কল করা হচ্ছে।'
        : 'No agent is active in Admin Panel — opening direct phone call.')
    );
    setCallState('error');
    if (telHref && typeof window !== 'undefined') {
      try {
        window.location.href = telHref;
      } catch (_) {}
    }
  };

  useEffect(() => {
    if (aiCallStatus !== 'connected') return;
    const t = setInterval(() => setAiSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [aiCallStatus]);

  useEffect(() => {
    return () => {
      try { aiLiveRef.current?.hangup(); } catch (_) {}
    };
  }, []);

  const stopAiVisitorCall = async () => {
    aiCallStatusRef.current = 'idle';
    if (aiLiveRef.current) {
      try { aiLiveRef.current.hangup(); } catch (_) {}
      aiLiveRef.current = null;
    }
    setAiCallStatus('idle');
    setAiMuted(false);
    setAiVol(0);
    setAiTurns([]);
  };

  const startAiVisitorCall = async () => {
    if (aiLiveRef.current && (aiCallStatusRef.current === 'connecting' || aiCallStatusRef.current === 'ringing' || aiCallStatusRef.current === 'connected')) {
      setOpen(true);
      setCallMode(true);
      return;
    }
    setCallErr('');
    if (aiLiveRef.current) {
      try { aiLiveRef.current.hangup(); } catch (_) {}
      aiLiveRef.current = null;
    }
    setAiTurns([]);
    setAiSeconds(0);
    setAiMuted(false);
    setAiVol(0);
    setAiCallStatus('connecting');

    const client = new LiveAiCallClient({
      onStatus: (st, info) => {
        setAiCallStatus(st);
        if (st === 'ringing') {
          setAiTurns([{ role: 'sys', text: isBn ? '📞 রিং হচ্ছে... (কলটি রেকর্ড করা হচ্ছে)' : '📞 Ringing... (Call is recorded)' }]);
        } else if (st === 'connected') {
          setAiTurns((prev) => [...prev, { role: 'sys', text: isBn ? '🟢 কল সংযুক্ত হয়েছে — কলটি মানোন্নয়নের জন্য রেকর্ড করা হচ্ছে' : '🟢 Connected — This call is being recorded' }]);
        } else if (st === 'error') {
          const errStr = typeof info === 'string' ? info : (info?.error || '');
          const isMicErr = /মাইক্রোফোন|microphone/i.test(errStr);
          try { aiLiveRef.current?.hangup(); } catch (_) {}
          aiLiveRef.current = null;
          setAiCallStatus('idle');
          if (isMicErr || info?.fallbackToHuman === false) {
            setCallErr(errStr);
          } else {
            setCallErr(isBn ? '⚠️ AI সংযোগ পাওয়া যায়নি — সরাসরি অ্যাডমিন প্যানেলে কল করা হচ্ছে...' : '⚠️ AI unavailable — connecting directly to Admin Panel...');
            setTimeout(() => {
              startLiveCall();
            }, 600);
          }
        } else if (st === 'ended') {
          setAiCallStatus('idle');
        }
      },
      onTranscript: (role, text) => {
        if (!text) return;
        setAiTurns((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.role === role) {
            return [...prev.slice(0, -1), { role, text: last.text + text }];
          }
          return [...prev, { role, text }];
        });
      },
      onTransfer: () => {
        setAiTurns((prev) => [...prev, { role: 'sys', text: isBn ? '🔄 প্রতিনিধির সাথে সংযুক্ত করা হচ্ছে...' : '🔄 Transferring to live agent...' }]);
        setTimeout(() => {
          setCallState('connecting');
          stopAiVisitorCall();
          startLiveCall(true);
        }, 900);
      },
      onVolume: (lvl) => setAiVol(lvl)
    });

    // Unlock browser AudioContext synchronously inside user click gesture BEFORE any async fetch
    client.unlockAudio();
    aiLiveRef.current = client;

    try {
      const fresh = await fetch('/api/ai-call/config?_=' + Date.now()).then((r) => r.json()).catch(() => null);
      if (fresh && typeof fresh.enabled === 'boolean') {
        setAiCfg({
          enabled: fresh.enabled,
          websiteInboundAi: fresh.websiteInboundAi !== false,
          hasApiKey: fresh.hasApiKey !== false,
          adminOnline: fresh.adminOnline !== false,
          supportPhone: String(fresh.supportPhone || '').trim()
        });
        if (!fresh.enabled || fresh.websiteInboundAi === false || fresh.hasApiKey === false) {
          try { client.hangup(); } catch (_) {}
          aiLiveRef.current = null;
          setAiCallStatus('idle');
          startLiveCall();
          return;
        }
      } else if (!canUseAiCall) {
        try { client.hangup(); } catch (_) {}
        aiLiveRef.current = null;
        setAiCallStatus('idle');
        startLiveCall();
        return;
      }
    } catch (_) {
      if (!canUseAiCall) {
        try { client.hangup(); } catch (_) {}
        aiLiveRef.current = null;
        setAiCallStatus('idle');
        startLiveCall();
        return;
      }
    }

    let effectivePhone = callerPhone.trim();
    let effectiveName = callerName.trim();
    if (typeof window !== 'undefined') {
      try {
        const sp = new URLSearchParams(window.location.search);
        const qp = (sp.get('phone') || sp.get('p') || '').trim();
        const qn = (sp.get('name') || '').trim();
        if (qp && !effectivePhone) effectivePhone = qp;
        if (qn && !effectiveName) effectiveName = qn;
        if (!effectivePhone) effectivePhone = localStorage.getItem('visitor_caller_phone') || '';
        if (!effectiveName) effectiveName = localStorage.getItem('visitor_caller_name') || '';
      } catch (_) {}
    }

    const pMatch = typeof window !== 'undefined' ? window.location.pathname.match(/^\/(?:page|landing|p)\/([^/?#]+)/i) : null;
    const landingSlug = pMatch ? decodeURIComponent(pMatch[1]) : '';
    await client.start({ mode: 'website_inbound', name: effectiveName, phone: effectivePhone, landingSlug });
  };

  const sendAiVisitorTurn = () => {
    const txt = aiTextInput.trim();
    if (!txt || !aiLiveRef.current) return;
    setAiTextInput('');
    setAiTurns((prev) => [...prev, { role: 'user', text: txt }]);
    aiLiveRef.current.sendText(txt);
  };

  const toggleAiVisitorMute = () => {
    const next = !aiMuted;
    setAiMuted(next);
    aiLiveRef.current?.setMuted(next);
  };

  const toggleAiAudioMode = () => {
    const next = aiAudioMode === 'speaker' ? 'earpiece' : 'speaker';
    setAiAudioMode(next);
    aiLiveRef.current?.setAudioOutputMode(next);
  };

  useEffect(() => {
    const onOpenSaika = () => {
      setOpen(true);
      setCallMode(true);
      setCallState('form');
      setCallErr('');
      setShowTooltip(false);
      setChatyOpen(false);
      startAiVisitorCall();
    };
    window.addEventListener('open-saika-ai-call', onOpenSaika);
    const onGlobalTelClick = (e: MouseEvent) => {
      if (!/^\/(?:page|landing|p)\//i.test(window.location.pathname || '')) return;
      const t = e.target as HTMLElement | null;
      const telEl = t?.closest('a[href^="tel:"]') as HTMLElement | null;
      if (telEl && !telEl.hasAttribute('data-direct-tel')) {
        e.preventDefault();
        e.stopPropagation();
        onOpenSaika();
      }
    };
    document.addEventListener('click', onGlobalTelClick, true);
    return () => {
      window.removeEventListener('open-saika-ai-call', onOpenSaika);
      document.removeEventListener('click', onGlobalTelClick, true);
    };
  }, [callerName, callerPhone]);

  // WhatsApp call links prepare the answer screen. Starting media on page load
  // is unreliable on mobile browsers because microphone/audio access needs a tap.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const sp = new URLSearchParams(window.location.search);
      const isCallTrigger = sp.get('call') === '1' || sp.get('livecall') === '1' || (window.location.hash && window.location.hash.toLowerCase().includes('call'));
      if (isCallTrigger) {
        const qp = (sp.get('phone') || sp.get('p') || '').trim();
        const qn = (sp.get('name') || '').trim();
        if (qp) {
          setCallerPhone(qp);
          try { localStorage.setItem('visitor_caller_phone', qp); } catch (_) {}
        }
        if (qn) {
          setCallerName(qn);
          try { localStorage.setItem('visitor_caller_name', qn); } catch (_) {}
        }
        setOpen(true);
        setCallMode(true);
        setCallState('form');
        setCallErr('');
        setIncomingAiCall(true);
        setShowTooltip(false);
        setChatyOpen(false);
      }
    } catch (_) {}
  }, []);

  useEffect(() => {
    if (callState === 'connected') {
      callTimerRef.current = setInterval(() => setCallSecs((s) => s + 1), 1000);
    } else {
      if (callTimerRef.current) clearInterval(callTimerRef.current);
    }
    return () => { if (callTimerRef.current) clearInterval(callTimerRef.current); };
  }, [callState]);

  const stopLiveCall = () => {
    const sess = sessionRef.current;
    const ua = uaRef.current;
    sessionRef.current = null;
    uaRef.current = null;
    try { window.speechSynthesis?.cancel(); } catch (_) {}
    if (callQueueRef.current?.ticketId) {
      fetch('/api/calls/queue/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId: callQueueRef.current.ticketId })
      }).catch(() => {});
      callQueueRef.current = null;
    }
    setCallQueueInfo(null);
    fetch('/api/calls/visitor-cancel', { method: 'POST' }).catch(() => {});
    if (sess) {
      try { sess.terminate(); } catch (_) {}
    }
    if (ua) {
      setTimeout(() => {
        try { ua.stop(); } catch (_) {}
      }, 600);
    }
    setCallState('form');
    setCallSecs(0);
    setCallMuted(false);
  };

  const startLiveCall = async (isTransfer: any = false) => {
    const forceTransfer = isTransfer === true;
    setCallErr('');
    try {
      const cfgRes = await fetch('/api/ai-call/config?_=' + Date.now()).then((r) => r.json()).catch(() => null);
      if (!forceTransfer && cfgRes && cfgRes.adminOnline === false) {
        triggerDirectPhoneFallback();
        return;
      }
    } catch (_) {}
    setCallState('connecting');
    setCallSecs(0);
    setHumanAudioMode('speaker');
    try {
      const qRes = await fetch('/api/calls/queue/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: callerName.trim() || 'Website Visitor', phone: callerPhone.trim(), dept: callDept })
      }).then((r) => r.json()).catch(() => null);
      if (qRes?.ticketId) {
        callQueueRef.current = qRes;
        setCallQueueInfo(qRes);
        try {
          if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            const qMsg = isBn
              ? `${brand} কল সেন্টারে স্বাগতম। আপনার সিরিয়াল নম্বর ${parseInt(qRes.serialNumber, 10)}। ${qRes.aheadCount > 0 ? `আপনার সামনে ${qRes.aheadCount} জন অপেক্ষায় আছেন। ` : ''}অনুগ্রহ করে লাইনে থাকুন, আমাদের প্রতিনিধি এখনই যুক্ত হচ্ছেন।`
              : `Welcome to ${brand} Call Center. Your serial number is ${parseInt(qRes.serialNumber, 10)}. Please stay on the line.`;
            const u = new SpeechSynthesisUtterance(qMsg);
            u.lang = isBn ? 'bn-BD' : 'en-US';
            window.speechSynthesis.speak(u);
          }
        } catch (_) {}
      }
    } catch (_) {}
    try {
      const JsSIPMod = await import('jssip');
      const JsSIP = JsSIPMod.default || JsSIPMod;
      const socket = new JsSIP.WebSocketInterface('wss://timingboost.xyz/ws');
      const safeName = callerName.trim().replace(/["\r\n()]/g, '') || 'Visitor';
      const safePhone = callerPhone.trim().replace(/["\r\n()]/g, '');
      const displayLabel = safePhone ? `${safeName} [${callDept}] (${safePhone})` : `${safeName} [${callDept}]`;

      const ua = new JsSIP.UA({
        sockets: [socket],
        uri: 'sip:guest@timingboost.xyz',
        password: 'TbGuest#2026!',
        display_name: displayLabel,
        register: true,
        session_timers: false
      });
      uaRef.current = ua;

      let hasDialed = false;
      ua.on('registered', () => {
        if (hasDialed) return;
        hasDialed = true;
        setCallState('ringing');
        fetch('/api/calls/visitor-ring', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: callerName.trim() || 'Website Visitor', phone: callerPhone.trim(), serialNumber: callQueueRef.current?.serialNumber || null })
        }).catch(() => {});
        const session = ua.call('sip:600@timingboost.xyz', {
          mediaConstraints: { audio: true, video: false },
          pcConfig: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] },
          eventHandlers: {
            progress: () => setCallState('ringing'),
            accepted: () => {
              try { window.speechSynthesis?.cancel(); } catch (_) {}
              if (callQueueRef.current?.ticketId) {
                fetch('/api/calls/queue/leave', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticketId: callQueueRef.current.ticketId }) }).catch(() => {});
              }
              setCallState('connected');
            },
            confirmed: () => {
              try { window.speechSynthesis?.cancel(); } catch (_) {}
              setCallState('connected');
            },
            ended: () => stopLiveCall(),
            failed: (ev: any) => {
              if (uaRef.current) {
                try { uaRef.current.stop(); } catch (_) {}
                uaRef.current = null;
              }
              sessionRef.current = null;
              fetch('/api/calls/visitor-missed', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: callerName.trim() || 'Website Visitor', phone: callerPhone.trim() || 'Guest' })
              }).catch(() => {});
              const causeStr = String(ev?.cause || '');
              const wasRejectedOrBusy = ev?.originator === 'remote' || /busy|reject|declin|terminat|unavailable/i.test(causeStr);
              if (wasRejectedOrBusy) {
                const busyMsg = isBn
                  ? 'এই মুহূর্তে আমাদের প্রতিনিধি ব্যস্ত আছেন। অনুগ্রহ করে কিছুক্ষণ পর আবার চেষ্টা করুন।'
                  : 'Our representative is currently busy. Please try again shortly.';
                setCallErr(busyMsg);
                setCallState('form');
                try {
                  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
                    const u = new SpeechSynthesisUtterance(busyMsg);
                    u.lang = isBn ? 'bn-BD' : 'en-US';
                    window.speechSynthesis.speak(u);
                  }
                } catch (_) {}
                return;
              }
              triggerDirectPhoneFallback(isBn ? 'এই মুহূর্তে কোনো প্রতিনিধি অনলাইনে নেই — সরাসরি ফোনে কল করুন।' : 'No agent available — opening direct phone call.');
            }
          }
        });
        sessionRef.current = session;
        let iceReadyDone = false;
        let iceTimer: any = null;
        session.on?.('icecandidate', (ev: any) => {
          if (iceReadyDone) return;
          const cand = ev?.candidate?.candidate || '';
          if (cand.includes('srflx') || cand.includes('relay')) {
            iceReadyDone = true;
            if (iceTimer) clearTimeout(iceTimer);
            try { ev.ready(); } catch (_) {}
          } else if (!iceTimer) {
            iceTimer = setTimeout(() => {
              if (iceReadyDone) return;
              iceReadyDone = true;
              try { ev.ready(); } catch (_) {}
            }, 300);
          }
        });
        const bindRemotePc = (pc: any) => {
          if (!pc) return;
          const attach = (rStream: MediaStream) => {
            if (remoteAudioRef.current) {
              remoteAudioRef.current.srcObject = rStream;
              remoteAudioRef.current.muted = false;
              remoteAudioRef.current.play().catch(() => {});
            }
          };
          const tracks = pc.getReceivers?.().map((r: any) => r.track).filter((t: any) => t && t.kind === 'audio') || [];
          if (tracks.length > 0) attach(new MediaStream(tracks));
          pc.addEventListener('track', (ev: any) => {
            attach(ev.streams?.[0] || new MediaStream([ev.track]));
          });
        };
        if (session?.connection) bindRemotePc(session.connection);
        session?.on?.('peerconnection', (e: any) => { if (e?.peerconnection) bindRemotePc(e.peerconnection); });
      });

      ua.on('registrationFailed', () => {
        setCallErr(isBn ? 'কল সার্ভারে সংযোগ করা যায়নি।' : 'Could not connect to call server.');
        setCallState('error');
      });

      ua.start();
    } catch (e: any) {
      setCallErr(e?.message || 'Microphone or WebRTC error');
      setCallState('error');
    }
  };

  useEffect(() => {
    getSettings().then((s) => {
      const wa = s.whatsapp || s.phone || '';
      setNum(wa);
      setBrand(resolveBrandName(s.storeName));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        const toggleBtn = document.getElementById('secrate-wa-toggle-btn');
        const callBtn = document.getElementById('secrate-free-call-btn');
        if ((toggleBtn && toggleBtn.contains(e.target as Node)) || (callBtn && callBtn.contains(e.target as Node))) return;
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  if (!num) return null;
  const clean = num.replace(/[^0-9]/g, '');
  const isBn = language === 'bn';

  const defaultMsg = isBn 
    ? `আসসালামু আলাইকুম ${brand}, আমার একটি জিজ্ঞাসা আছে।`
    : `Hello ${brand}! I have an inquiry.`;

  const handleSend = (customText?: string) => {
    const msgToSend = (customText || text || defaultMsg).trim();
    const url = `https://wa.me/${clean}?text=${encodeURIComponent(msgToSend)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    setOpen(false);
  };

  const quickOptions = [
    {
      id: 'track',
      icon: '📦',
      label: isBn ? 'অর্ডার ট্র্যাকিং ও ডেলিভারি স্ট্যাটাস' : 'Track Order / Delivery Status',
      msg: isBn
        ? `আসসালামু আলাইকুম ${brand}, আমি আমার অর্ডারের ডেলিভারি স্ট্যাটাস জানতে চাই। আমার অর্ডার আইডি / ফোন নম্বর:`
        : `Hello ${brand}, I would like to check the tracking status of my order. My Order ID / Phone:`,
    },
    {
      id: 'skin',
      icon: '✨',
      label: isBn ? 'স্কিনকেয়ার ও প্রোডাক্ট পরামর্শ' : 'Skincare & Product Advice',
      msg: isBn
        ? `আসসালামু আলাইকুম ${brand}, আমার ত্বকের জন্য উপযুক্ত প্রোডাক্ট নির্বাচনে পরামর্শ প্রয়োজন।`
        : `Hello ${brand}, I would like some advice on choosing the best product for my skin.`,
    },
    {
      id: 'privacy',
      icon: '🔒',
      label: isBn ? 'গোপনীয়তা ও পার্সেল প্যাকেজিং' : 'Discreet & Safe Packaging',
      msg: isBn
        ? `আসসালামু আলাইকুম ${brand}, পার্সেল প্যাকেজিং কতটা গোপনীয় ও সুরক্ষিত থাকে জানতে চাই।`
        : `Hello ${brand}, could you please let me know about your discreet packaging and delivery process?`,
    },
    {
      id: 'order',
      icon: '🛍️',
      label: isBn ? 'হোয়াটসঅ্যাপে সরাসরি অর্ডার' : 'Order Directly via WhatsApp',
      msg: isBn
        ? (route.name === 'product' && route.param 
            ? `আসসালামু আলাইকুম ${brand}, আমি এই প্রোডাক্টটি ("${route.param}") সরাসরি অর্ডার করতে চাই।`
            : `আসসালামু আলাইকুম ${brand}, আমি একটি প্রোডাক্ট সরাসরি হোয়াটসঅ্যাপে অর্ডার করতে চাই।`)
        : (route.name === 'product' && route.param
            ? `Hello ${brand}, I would like to order "${route.param}" directly via WhatsApp.`
            : `Hello ${brand}, I would like to place an order directly via WhatsApp.`),
    },
    {
      id: 'agent',
      icon: '💬',
      label: isBn ? 'সরাসরি প্রতিনিধির সাথে কথা' : 'Speak with Support Representative',
      msg: isBn
        ? `আসসালামু আলাইকুম ${brand}, আমি সরাসরি কাস্টমার সাপোর্ট টিমের সাথে কথা বলতে চাই।`
        : `Hello ${brand}, I would like to speak directly with a customer care representative.`,
    },
  ];

  return (
    <div className="secrate-smart-wa-wrap">
      {/* Smart Chat Box Drawer */}
      {open && (
        <div ref={cardRef} className="secrate-wa-card" role="dialog" aria-modal="true">
          {/* Header */}
          <div className="secrate-wa-header">
            <div className="secrate-wa-agent">
              <div className="secrate-wa-avatar">
                <WhatsAppIcon size={22} variant="official" />
                <span className="secrate-wa-live-dot" />
              </div>
              <div className="secrate-wa-agent-info">
                <div className="secrate-wa-title">
                  {brand} Concierge
                  <span className="secrate-wa-badge">✓</span>
                </div>
                <div className="secrate-wa-status">
                  <span className="secrate-wa-green-pill" />
                  {isBn ? 'অনলাইন · দ্রুত উত্তর দেওয়া হয়' : 'Active Now · Replies in 2m'}
                </div>
              </div>
            </div>
            <button
              type="button"
              className="secrate-wa-close-btn"
              onClick={() => setOpen(false)}
              aria-label="Close chat"
            >
              ✕
            </button>
          </div>

          {/* Body */}
          <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: 'none' }} />
          <div className="secrate-wa-body" style={callMode ? { padding: 0, background: 'linear-gradient(165deg, #0b1322 0%, #101b2e 100%)' } : undefined}>
            {callMode ? (
              <div style={{ padding: '16px 16px 18px', textAlign: 'center', color: '#f8fafc' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <button
                    type="button"
                    onClick={() => { stopAiVisitorCall(); stopLiveCall(); setCallMode(false); setShowKeypad(false); }}
                    style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: '#e2e8f0', borderRadius: 999, padding: '5px 12px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}
                  >
                    ← {isBn ? 'ফিরে যান' : 'Back'}
                  </button>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: '#34d399', background: 'rgba(16,185,129,0.14)', border: '1px solid rgba(16,185,129,0.32)', padding: '4px 10px', borderRadius: 999 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }} />
                    {isBn ? 'HD ফ্রি কল · ০৳' : 'HD FREE CALL'}
                  </span>
                </div>

                {aiCallStatus !== 'idle' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, textAlign: 'center', padding: '4px 0' }}>
                    {/* Smartphone Active Call Screen */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '10px 8px', borderRadius: 16, background: 'linear-gradient(160deg, rgba(16,185,129,0.16), rgba(14,165,233,0.12))', border: '1px solid rgba(16,185,129,0.3)' }}>
                      <div style={{
                        width: 56,
                        height: 56,
                        borderRadius: '50%',
                        background: aiCallStatus === 'connected' ? 'linear-gradient(135deg, #10b981, #0ea5e9)' : '#f59e0b',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 26,
                        boxShadow: `0 0 ${Math.round(10 + aiVol * 28)}px rgba(16,185,129,0.7)`,
                        transition: 'box-shadow 0.08s ease'
                      }}>
                        {aiCallStatus === 'connected' ? '🎧' : '📞'}
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>
                        {isBn ? 'সাইকা (Saika)' : 'Saika'} · {brand}
                      </div>
                      <div style={{ fontSize: 11.5, color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span>
                          {aiCallStatus === 'connecting'
                            ? (isBn ? 'সংযুক্ত হচ্ছে...' : 'Connecting...')
                            : aiCallStatus === 'ringing'
                            ? (isBn ? 'রিং হচ্ছে...' : 'Ringing...')
                            : `⏱️ ${String(Math.floor(aiSeconds / 60)).padStart(2, '0')}:${String(aiSeconds % 60).padStart(2, '0')}`}
                        </span>
                        <span style={{ display: 'inline-flex', gap: 2.5, alignItems: 'flex-end', height: 14 }}>
                          {[0.4, 0.8, 1, 0.65, 0.45].map((m, idx) => (
                            <span
                              key={idx}
                              style={{
                                width: 3,
                                height: `${Math.max(3, Math.round((aiCallStatus === 'connected' ? (0.25 + aiVol * 1.4) : 0.25) * m * 14))}px`,
                                borderRadius: 3,
                                background: '#38bdf8',
                                transition: 'height 0.08s ease'
                              }}
                            />
                          ))}
                        </span>
                      </div>
                      <div style={{ marginTop: 4, fontSize: 10.5, fontWeight: 700, color: '#fda4af', background: 'rgba(244,63,94,0.14)', border: '1px solid rgba(244,63,94,0.32)', padding: '3px 9px', borderRadius: 999 }}>
                        🔴 {isBn ? 'এই কলটি মানোন্নয়নের জন্য রেকর্ড করা হচ্ছে' : 'This call is being recorded'}
                      </div>
                    </div>

                    {/* Live Captions */}
                    {aiTurns.length > 0 && (
                      <div style={{ maxHeight: 110, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, padding: 8, borderRadius: 12, background: 'rgba(0,0,0,0.32)', border: '1px solid rgba(255,255,255,0.08)', textAlign: 'left' }}>
                        {aiTurns.slice(-6).map((t, i) => (
                          <div
                            key={i}
                            style={{
                              alignSelf: t.role === 'user' ? 'flex-end' : t.role === 'sys' ? 'center' : 'flex-start',
                              maxWidth: '90%',
                              padding: '5px 9px',
                              borderRadius: 9,
                              fontSize: 11.5,
                              lineHeight: 1.4,
                              background: t.role === 'user' ? '#0ea5e9' : t.role === 'sys' ? 'rgba(245,158,11,0.16)' : 'rgba(255,255,255,0.1)',
                              color: t.role === 'sys' ? '#fbbf24' : '#fff'
                            }}
                          >
                            {t.text}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Phone Circular Action Grid: Mute | Speaker/Earpiece | Message | Agent */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                      <button
                        type="button"
                        onClick={toggleAiVisitorMute}
                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '9px 3px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.1)', background: aiMuted ? 'rgba(245,158,11,0.22)' : 'rgba(255,255,255,0.06)', color: '#fff', cursor: 'pointer' }}
                      >
                        <span style={{ fontSize: 17 }}>{aiMuted ? '🔇' : '🎙️'}</span>
                        <span style={{ fontSize: 10, fontWeight: 700 }}>{aiMuted ? (isBn ? 'আনমিউট' : 'Unmute') : (isBn ? 'মিউট' : 'Mute')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={toggleAiAudioMode}
                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '9px 3px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.1)', background: aiAudioMode === 'earpiece' ? 'rgba(139,92,246,0.26)' : 'rgba(56,189,248,0.18)', color: '#fff', cursor: 'pointer' }}
                      >
                        <span style={{ fontSize: 17 }}>{aiAudioMode === 'speaker' ? '🔊' : '📱'}</span>
                        <span style={{ fontSize: 10, fontWeight: 700 }}>{aiAudioMode === 'speaker' ? (isBn ? 'স্পিকার' : 'Speaker') : (isBn ? 'ইয়ারপিস' : 'Earpiece')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setAiShowKeypad((v) => !v)}
                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '9px 3px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.1)', background: aiShowKeypad ? 'rgba(56,189,248,0.22)' : 'rgba(255,255,255,0.06)', color: '#fff', cursor: 'pointer' }}
                      >
                        <span style={{ fontSize: 17 }}>⌨️</span>
                        <span style={{ fontSize: 10, fontWeight: 700 }}>{isBn ? 'লিখুন' : 'Text'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => { setCallState('connecting'); stopAiVisitorCall(); startLiveCall(true); }}
                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '9px 3px', borderRadius: 14, border: '1px solid rgba(16,185,129,0.4)', background: 'rgba(16,185,129,0.16)', color: '#34d399', cursor: 'pointer' }}
                      >
                        <span style={{ fontSize: 17 }}>👤</span>
                        <span style={{ fontSize: 10, fontWeight: 700 }}>{isBn ? 'প্রতিনিধি' : 'Agent'}</span>
                      </button>
                    </div>

                    {aiShowKeypad && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <input
                          value={aiTextInput}
                          onChange={(e) => setAiTextInput(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') sendAiVisitorTurn(); }}
                          placeholder={isBn ? 'লিখে পাঠান...' : 'Type message...'}
                          style={{ flex: 1, padding: '8px 10px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 12.5, outline: 'none' }}
                        />
                        <button
                          type="button"
                          onClick={sendAiVisitorTurn}
                          style={{ padding: '0 12px', borderRadius: 10, border: 'none', background: '#10b981', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}
                        >
                          ➤
                        </button>
                      </div>
                    )}

                    {/* Hang Up Button */}
                    <button
                      type="button"
                      onClick={stopAiVisitorCall}
                      style={{ width: '100%', padding: '11px', borderRadius: 999, border: 'none', background: 'linear-gradient(135deg, #ef4444, #dc2626)', color: '#fff', fontWeight: 800, fontSize: 13.5, cursor: 'pointer', boxShadow: '0 6px 18px rgba(220,38,38,0.4)' }}
                    >
                      📵 {isBn ? 'কল কাটুন' : 'End Call'}
                    </button>
                  </div>
                ) : callState === 'form' || callState === 'error' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 11, textAlign: 'left', padding: '4px 2px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 12px', borderRadius: 14, background: 'linear-gradient(135deg, rgba(16,185,129,0.14), rgba(14,165,233,0.12))', border: '1px solid rgba(56,189,248,0.22)' }}>
                      <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'linear-gradient(135deg, #10b981, #0ea5e9)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0, boxShadow: '0 4px 14px rgba(16,185,129,0.4)' }}>
                        🎧
                      </div>
                      <div>
                        <div style={{ fontSize: 13.5, fontWeight: 800, color: '#fff', letterSpacing: '0.01em' }}>
                          {isBn ? `সাইকা (Saika) · ${brand}` : `Saika · ${brand} Care`}
                        </div>
                        <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.35 }}>
                          {isBn ? '২৪/৭ ফ্রি HD ভয়েস কল · কোনো ব্যালেন্স লাগবে না' : '24/7 Free HD Voice Call · No Balance Needed'}
                        </div>
                      </div>
                    </div>
                    {incomingAiCall && (
                      <div style={{ padding: '9px 11px', borderRadius: 11, background: 'rgba(14,165,233,0.09)', border: '1px solid rgba(56,189,248,0.2)', color: '#cbd5e1', fontSize: 11.5, lineHeight: 1.5 }}>
                        {isBn ? 'আপনার AI কল প্রস্তুত। কল ধরতে নিচের বোতাম চাপুন এবং মাইক্রোফোন ব্যবহারের অনুমতি দিন।' : 'Your AI call is ready. Tap Answer below and allow microphone access.'}
                      </div>
                    )}
                    {callErr && (
                      <div style={{ padding: '8px 10px', borderRadius: 10, background: 'rgba(239,68,68,0.16)', border: '1px solid rgba(239,68,68,0.35)', color: '#fca5a5', fontSize: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <span>{callErr}</span>
                        {(aiCfg.supportPhone || num) && (
                          <a
                            href={`tel:${String(aiCfg.supportPhone || num).replace(/[^\d+]/g, '').replace(/^880/, '+880')}`}
                            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '7px 10px', borderRadius: 8, background: '#10b981', color: '#fff', fontWeight: 800, fontSize: 12, textDecoration: 'none' }}
                          >
                            <span>📞</span>
                            <span>{isBn ? 'সরাসরি ফোনে কল করুন' : 'Call Phone Directly'} ({aiCfg.supportPhone || num})</span>
                          </a>
                        )}
                      </div>
                    )}
                    <input
                      type="text"
                      placeholder={isBn ? 'আপনার নাম (ঐচ্ছিক)' : 'Your Name (optional)'}
                      value={callerName}
                      onChange={(e) => setCallerName(e.target.value)}
                      style={{
                        width: '100%',
                        boxSizing: 'border-box',
                        padding: '10px 13px',
                        borderRadius: 12,
                        border: '1px solid rgba(255,255,255,0.14)',
                        background: 'rgba(255,255,255,0.06)',
                        color: '#ffffff',
                        fontSize: 13,
                        outline: 'none'
                      }}
                    />
                    <input
                      type="tel"
                      placeholder={isBn ? 'মোবাইল নম্বর · 01XXXXXXXXX (ঐচ্ছিক)' : 'Mobile Number (optional)'}
                      value={callerPhone}
                      onChange={(e) => setCallerPhone(e.target.value)}
                      style={{
                        width: '100%',
                        boxSizing: 'border-box',
                        padding: '10px 13px',
                        borderRadius: 12,
                        border: '1px solid rgba(255,255,255,0.14)',
                        background: 'rgba(255,255,255,0.06)',
                        color: '#ffffff',
                        fontSize: 13,
                        outline: 'none'
                      }}
                    />
                    {canUseAiCall && (
                      <button
                        type="button"
                        onClick={startAiVisitorCall}
                        disabled={aiCallStatus === 'connecting'}
                        style={{
                          width: '100%',
                          padding: '13px 16px',
                          borderRadius: 14,
                          border: 'none',
                          background: 'linear-gradient(135deg, #10b981 0%, #0ea5e9 100%)',
                          color: '#fff',
                          fontWeight: 800,
                          fontSize: 13.5,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 8,
                          boxShadow: '0 8px 24px rgba(16, 185, 129, 0.38)'
                        }}
                      >
                        <span>📞</span>
                        <span>{aiCallStatus === 'connecting' ? (isBn ? 'সংযুক্ত হচ্ছে...' : 'Connecting...') : incomingAiCall ? (isBn ? '📞 AI কল ধরুন · সাইকা' : '📞 Answer AI Call · Saika') : (isBn ? 'কল করুন · সাইকা (২৪/৭ ফ্রি)' : 'Call Saika (24/7 Free)')}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={startLiveCall}
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        borderRadius: 12,
                        border: '1px solid rgba(16,185,129,0.35)',
                        background: 'rgba(16,185,129,0.08)',
                        color: '#34d399',
                        fontWeight: 700,
                        fontSize: 12.5,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6
                      }}
                    >
                      <span>👤</span>
                      <span>{isBn ? 'সরাসরি প্রতিনিধির সাথে কথা বলুন' : 'Talk Directly to Human Agent'}</span>
                    </button>
                  </div>
                ) : (
                  <div style={{ padding: '10px 4px 6px' }}>
                    <div style={{ width: 68, height: 68, borderRadius: '50%', background: 'radial-gradient(circle, rgba(16,185,129,0.28) 0%, rgba(16,185,129,0.08) 100%)', border: '2px solid #10b981', boxShadow: '0 0 24px rgba(16,185,129,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', color: '#34d399' }}>
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
                        <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
                      </svg>
                    </div>
                    <div style={{ fontSize: 15.5, fontWeight: 700, color: '#ffffff', marginBottom: 4 }}>
                      {brand} Support
                    </div>
                    <div style={{ fontSize: 11.5, color: '#94a3b8', marginBottom: 6 }}>
                      {callDept} Desk
                    </div>
                    <div style={{ fontSize: 14, color: callState === 'connected' ? '#34d399' : '#fbbf24', fontWeight: 700, fontFamily: 'monospace', marginBottom: 8 }}>
                      {callState === 'connecting'
                        ? (isBn ? 'সংযোগ করা হচ্ছে...' : 'Connecting...')
                        : callState === 'ringing'
                        ? (isBn ? 'প্রতিনিধিকে রিং হচ্ছে...' : 'Ringing agent...')
                        : `${String(Math.floor(callSecs / 60)).padStart(2, '0')}:${String(callSecs % 60).padStart(2, '0')}`}
                    </div>
                    <div style={{ display: 'inline-block', marginBottom: 10, fontSize: 10.5, fontWeight: 700, color: '#fda4af', background: 'rgba(244,63,94,0.14)', border: '1px solid rgba(244,63,94,0.32)', padding: '3px 10px', borderRadius: 999 }}>
                      🔴 {isBn ? 'এই কলটি মানোন্নয়নের জন্য রেকর্ড করা হচ্ছে' : 'This call is being recorded'}
                    </div>
                    {callQueueInfo && callState !== 'connected' && (
                      <div style={{ margin: '0 auto 12px', padding: '8px 12px', borderRadius: 12, background: 'rgba(56,189,248,0.12)', border: '1px solid rgba(56,189,248,0.32)', textAlign: 'center' }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: '#7dd3fc' }}>
                          🎫 {isBn ? `আপনার সিরিয়াল: #${callQueueInfo.serialNumber}` : `Your Serial: #${callQueueInfo.serialNumber}`}
                        </div>
                        <div style={{ fontSize: 11, color: '#cbd5e1', marginTop: 2 }}>
                          {callQueueInfo.aheadCount > 0
                            ? (isBn ? `⏳ আপনার সামনে ${callQueueInfo.aheadCount} জন অপেক্ষায় আছেন` : `⏳ ${callQueueInfo.aheadCount} caller(s) ahead`)
                            : (isBn ? '🟢 আপনিই পরবর্তী কলার — প্রতিনিধি যুক্ত হচ্ছেন' : '🟢 You are next — connecting agent')}
                        </div>
                      </div>
                    )}

                    {callState === 'connected' && showKeypad && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, maxWidth: 210, margin: '0 auto 14px' }}>
                        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((d) => (
                          <button
                            key={d}
                            type="button"
                            onClick={() => {
                              try { sessionRef.current?.sendDTMF(d); } catch (_) {}
                            }}
                            style={{
                              height: 38,
                              borderRadius: 10,
                              border: '1px solid rgba(255,255,255,0.12)',
                              background: 'rgba(255,255,255,0.06)',
                              color: '#f8fafc',
                              fontSize: 15,
                              fontWeight: 700,
                              cursor: 'pointer'
                            }}
                          >
                            {d}
                          </button>
                        ))}
                      </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'center', gap: 10 }}>
                      {callState === 'connected' && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              if (sessionRef.current) {
                                if (callMuted) sessionRef.current.unmute({ audio: true });
                                else sessionRef.current.mute({ audio: true });
                              }
                              setCallMuted(!callMuted);
                            }}
                            style={{ width: 42, height: 42, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.15)', background: callMuted ? '#ef4444' : 'rgba(255,255,255,0.09)', color: '#fff', cursor: 'pointer', fontSize: 16 }}
                            title={callMuted ? 'Unmute' : 'Mute'}
                          >
                            {callMuted ? '🔇' : '🎙️'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const next = humanAudioMode === 'speaker' ? 'earpiece' : 'speaker';
                              setHumanAudioMode(next);
                              if (remoteAudioRef.current) {
                                remoteAudioRef.current.volume = next === 'earpiece' ? 0.32 : 1.0;
                              }
                            }}
                            style={{ width: 42, height: 42, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.15)', background: humanAudioMode === 'earpiece' ? '#8b5cf6' : 'rgba(56,189,248,0.2)', color: '#fff', cursor: 'pointer', fontSize: 16 }}
                            title={humanAudioMode === 'speaker' ? 'Speaker' : 'Earpiece'}
                          >
                            {humanAudioMode === 'speaker' ? '🔊' : '📱'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowKeypad((v) => !v)}
                            style={{ width: 42, height: 42, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.15)', background: showKeypad ? '#6366f1' : 'rgba(255,255,255,0.09)', color: '#fff', cursor: 'pointer', fontSize: 15 }}
                            title="Keypad"
                          >
                            ⌨️
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => { stopLiveCall(); setShowKeypad(false); }}
                        style={{ height: 42, padding: '0 20px', borderRadius: 21, border: 'none', background: '#dc2626', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 13, boxShadow: '0 4px 14px rgba(220,38,38,0.4)' }}
                      >
                        {isBn ? 'কল কাটুন' : 'End Call'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* Bot Greeting Bubble */}
                <div className="secrate-wa-msg-bubble">
                  <div className="secrate-wa-msg-sender">{brand} Care</div>
                  <div className="secrate-wa-msg-text">
                    {isBn
                      ? `আসসালামু আলাইকুম! 🌸 ${brand}-এ আপনাকে স্বাগতম। আপনার যেকোনো প্রশ্ন, স্কিনকেয়ার পরামর্শ বা অর্ডারের জন্য নিচের যেকোনো অপশনে ট্যাপ করুন অথবা মেসেজ লিখুন:`
                      : `Hello! 🌸 Welcome to ${brand}. How can we help you today? Tap an option below or type your message:`}
                  </div>
                  <div className="secrate-wa-msg-time">{isBn ? 'এইমাত্র' : 'Just now'}</div>
                </div>

                {/* Quick Action Pills */}
                <div className="secrate-wa-quick-title">
                  {isBn ? '⚡ দ্রুত সহায়তার অপশন:' : '⚡ Quick assistance options:'}
                </div>
                <div className="secrate-wa-quick-list">
                  <button
                    type="button"
                    className="secrate-wa-quick-btn"
                    style={{ background: 'rgba(16, 185, 129, 0.12)', borderColor: 'rgba(16, 185, 129, 0.45)' }}
                    onClick={() => { setCallMode(true); setCallState('form'); setCallErr(''); }}
                  >
                    <span className="secrate-wa-quick-icon">📞</span>
                    <span className="secrate-wa-quick-text" style={{ color: '#065f46', fontWeight: 700 }}>
                      {isBn ? 'ফ্রি লাইভ ভয়েস কল (সরাসরি কথা বলুন)' : 'Free Live Voice Call (Talk Now)'}
                    </span>
                    <span className="secrate-wa-quick-arrow" style={{ color: '#059669' }}>›</span>
                  </button>
                  {quickOptions.map((opt) => (
                    <button
                      type="button"
                      key={opt.id}
                      className="secrate-wa-quick-btn"
                      onClick={() => {
                        setText(opt.msg);
                        handleSend(opt.msg);
                      }}
                    >
                      <span className="secrate-wa-quick-icon">{opt.icon}</span>
                      <span className="secrate-wa-quick-text">{opt.label}</span>
                      <span className="secrate-wa-quick-arrow">›</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Footer Input Area (hidden during Call Pad mode) */}
          {!callMode && (
            <div className="secrate-wa-footer">
            <div className="secrate-wa-input-row">
              <input
                type="text"
                className="secrate-wa-input"
                placeholder={isBn ? 'আপনার প্রশ্ন বা মেসেজ লিখুন...' : 'Type your message here...'}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSend();
                }}
              />
              <button
                type="button"
                className="secrate-wa-send-btn"
                onClick={() => handleSend()}
                aria-label="Send via WhatsApp"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>
            <div className="secrate-wa-trust">
              <span>🔒 {isBn ? 'শতভাগ গোপনীয় ও সুরক্ষিত চ্যাট' : '100% Confidential & Secure Chat'}</span>
            </div>
            </div>
          )}
        </div>
      )}

      {/* Compact Mobile-Friendly Floating Action Dock */}
      <div className="secrate-wa-trigger-container">
        {open ? (
          <button
            id="secrate-wa-toggle-btn"
            type="button"
            className="secrate-wa-fab open"
            onClick={() => {
              setOpen(false);
              setShowTooltip(false);
            }}
            aria-label="Close Concierge"
            title="Close"
          >
            <span className="secrate-wa-fab-close">✕</span>
          </button>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 }}>
            {/* WordPress Chaty-style Expandable Channel List */}
            {chatyOpen && (
              <>
                <button
                  id="secrate-free-call-btn"
                  type="button"
                  onClick={() => {
                    const isLanding = /^\/(?:page|landing|p)\//i.test(window.location.pathname || '');
                    setOpen(true);
                    setCallMode(true);
                    setCallState('form');
                    setCallErr('');
                    setShowTooltip(false);
                    setChatyOpen(false);
                    if (isLanding) {
                      startAiVisitorCall();
                    }
                  }}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 8, border: 'none', background: 'transparent', padding: 0, cursor: 'pointer' }}
                  title={canUseAiCall ? (isBn ? 'ফ্রি লাইভ কল (সাইকা ২৪/৭)' : 'Free Live Call') : (isBn ? 'ফ্রি কল (প্রতিনিধি)' : 'Free Live Call')}
                >
                  <span style={{ background: '#0f172a', color: '#f8fafc', fontSize: 11.5, fontWeight: 700, padding: '5px 11px', borderRadius: 999, boxShadow: '0 6px 18px rgba(0,0,0,0.22)', border: '1px solid rgba(255,255,255,0.12)', whiteSpace: 'nowrap' }}>
                    {canUseAiCall ? (isBn ? '📞 ফ্রি কল (সাইকা)' : '📞 Free Call (Saika)') : (isBn ? '📞 ফ্রি কল (প্রতিনিধি)' : '📞 Free Call (Agent)')}
                  </span>
                  <span style={{ width: 48, height: 48, borderRadius: '50%', background: 'linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%)', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 22px rgba(14, 165, 233, 0.45)', border: '2px solid rgba(255,255,255,0.92)' }}>
                    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                    </svg>
                  </span>
                </button>
                <button
                  id="secrate-wa-toggle-btn"
                  type="button"
                  onClick={() => {
                    setCallMode(false);
                    setOpen(true);
                    setShowTooltip(false);
                    setChatyOpen(false);
                  }}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 8, border: 'none', background: 'transparent', padding: 0, cursor: 'pointer' }}
                  aria-label="Toggle WhatsApp Smart Chat"
                  title="WhatsApp Concierge"
                >
                  <span style={{ background: '#0f172a', color: '#f8fafc', fontSize: 11.5, fontWeight: 700, padding: '5px 11px', borderRadius: 999, boxShadow: '0 6px 18px rgba(0,0,0,0.22)', border: '1px solid rgba(255,255,255,0.12)', whiteSpace: 'nowrap' }}>
                    {isBn ? '💬 হোয়াটসঅ্যাপ' : '💬 WhatsApp'}
                  </span>
                  <span style={{ width: 48, height: 48, borderRadius: '50%', background: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 22px rgba(37, 211, 102, 0.45)', border: '2px solid #25D366', overflow: 'hidden' }}>
                    <img src="/whatsapp-official.png" alt="WhatsApp" style={{ width: 34, height: 34, objectFit: 'contain' }} />
                  </span>
                </button>
              </>
            )}

            {/* WordPress Chaty Main Circular Message Toggle Button */}
            <button
              type="button"
              onClick={() => {
                setChatyOpen((v) => !v);
                setShowTooltip(false);
              }}
              aria-label="Contact & Live Call Menu"
              style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                border: '2px solid rgba(255,255,255,0.9)',
                background: chatyOpen ? '#0f172a' : 'linear-gradient(135deg, #4f46e5 0%, #0ea5e9 100%)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                boxShadow: '0 10px 28px rgba(79, 70, 229, 0.45)',
                transition: 'transform 0.2s ease'
              }}
            >
              {chatyOpen ? (
                <span style={{ fontSize: 22, fontWeight: 700, lineHeight: 1 }}>✕</span>
              ) : (
                <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-3 11H7v-2h10v2zm0-3H7V8h10v2z" />
                </svg>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
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
        <SmartWhatsAppChat />
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
      <WishlistDrawer />
      <MobileTabs />
      <SmartWhatsAppChat />
      <CartFab />
      <Toast />
      <NotificationWidgets />
      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}

export default function App() {
  return (
    <CustomerProvider>
      <CartProvider>
        <WishlistProvider>
          <Shell />
        </WishlistProvider>
      </CartProvider>
    </CustomerProvider>
  );
}

