import React, { useState } from 'react';
import { WhatsAppIcon } from './icons';
import { tr, useStoreLanguage } from './language';
import { go } from './cart';

export interface FooterLink {
  text: string;
  url: string;
}

export interface FooterColumn {
  title: string;
  links: FooterLink[];
}

export interface FooterSettings {
  template?: 'watch_luxury' | 'royalman' | 'avora' | 'boutique' | 'enky' | 'classic';
  mode?: 'easy' | 'custom_html';
  customHtml?: string;
  aboutText?: string;
  address?: string;
  phone?: string;
  phoneHours?: string;
  email?: string;
  whatsapp?: string;
  copyright?: string;
  poweredBy?: string;
  newsletterTitle?: string;
  newsletterSubtitle?: string;
  columns?: FooterColumn[];
  socials?: {
    facebook?: string;
    instagram?: string;
    tiktok?: string;
    youtube?: string;
    whatsapp?: string;
    pinterest?: string;
    twitter?: string;
  };
}

export function getSiteBrandDefaults() {
  const h = typeof window !== 'undefined' ? window.location.hostname.toLowerCase() : '';
  if (h.includes('secrate')) return { name: 'SECRATE', logo: '/uploads/logo_secrate_rich.webp', isMetrroma: false };
  if (h.includes('metrroma') || h.includes('metromaa')) return { name: 'METRROMA', logo: '/logo_metrroma.png', isMetrroma: true };
  return { name: 'TimeBoost', logo: '/uploads/logo_timeboost.svg', isMetrroma: false };
}

export function resolveBrandLogo(logo?: string | null): string {
  if (logo && typeof logo === 'string' && logo.trim()) return logo.trim();
  return getSiteBrandDefaults().logo;
}

export function resolveBrandName(storeName?: string | null): string {
  const def = getSiteBrandDefaults();
  if (!storeName || storeName === 'dot.' || storeName === 'Dot Store') return def.name;
  return storeName;
}

export const DEFAULT_COLUMNS: FooterColumn[] = [
  {
    title: 'COMPANY',
    links: [
      { text: 'About Us', url: 'info/about' },
      { text: 'Contact Us', url: 'info/contact' },
      { text: 'Privacy Policy', url: 'info/privacy' },
      { text: 'Terms & Conditions', url: 'info/terms' },
      { text: 'Cancellation & Refund', url: 'info/returns' },
    ],
  },
  {
    title: 'USEFUL LINKS',
    links: [
      { text: 'Home', url: 'home' },
      { text: 'Shop All', url: 'shop' },
      { text: 'Track Order', url: 'track' },
      { text: 'My Account', url: 'account' },
      { text: 'Shipping & Delivery', url: 'info/shipping' },
    ],
  },
  {
    title: 'CUSTOMER CARE',
    links: [
      { text: 'Order Helpline', url: 'info/contact' },
      { text: 'Returns & Exchange', url: 'info/returns' },
      { text: 'Track Order', url: 'track' },
      { text: 'FAQ & Help', url: 'info/shipping' },
    ],
  },
];

/* Clean SVG Social Icons */
export function SocialIcon({ type, size = 18 }: { type: string; size?: number }) {
  switch (type) {
    case 'facebook':
      return (
        <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
        </svg>
      );
    case 'instagram':
      return (
        <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor">
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
        </svg>
      );
    case 'tiktok':
      return (
        <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor">
          <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64c.298-.002.595.042.88.13V9.4a6.33 6.33 0 0 0-1-.08A6.34 6.34 0 0 0 3 15.66a6.34 6.34 0 0 0 10.81 4.47 6.27 6.27 0 0 0 1.9-4.47V8.5a8.27 8.27 0 0 0 4.88 1.58V6.69z"/>
        </svg>
      );
    case 'youtube':
      return (
        <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor">
          <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
        </svg>
      );
    case 'whatsapp':
      return <WhatsAppIcon size={size} variant="official" />;
    case 'pinterest':
      return (
        <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor">
          <path d="M12 0a12 12 0 0 0-4.37 23.18c-.06-.94-.12-2.39.02-3.42l1.04-4.41s-.26-.52-.26-1.3c0-1.22.71-2.13 1.59-2.13.75 0 1.11.56 1.11 1.24 0 .76-.48 1.89-.73 2.94-.21.88.44 1.6 1.31 1.6 1.57 0 2.78-1.66 2.78-4.05 0-2.12-1.52-3.6-3.7-3.6-2.52 0-4 1.89-4 3.84 0 .76.29 1.58.66 2.02.07.09.08.17.06.26l-.25 1.02c-.04.16-.14.2-.32.12-1.19-.55-1.93-2.28-1.93-3.67 0-2.98 2.17-5.72 6.25-5.72 3.28 0 5.83 2.34 5.83 5.46 0 3.26-2.05 5.88-4.9 5.88-.96 0-1.86-.5-2.17-1.09l-.59 2.25c-.21.82-.78 1.85-1.17 2.47A12 12 0 1 0 12 0z"/>
        </svg>
      );
    default:
      return null;
  }
}

function handleLinkClick(url: string, e: React.MouseEvent) {
  e.preventDefault();
  if (!url) return;
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('tel:') || url.startsWith('mailto:')) {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  const clean = url.replace(/^[/#]+/, '');
  go(clean);
}

/**
 * ⌚ TEMPLATE 1: Watch & Luxury Style (4 Columns: Left Logo & Contacts, 2 Menu Columns, Support Hotline Pill & Circular Socials)
 */
export function WatchLuxuryFooter({
  settings,
  logo,
  name,
  preview = false,
}: {
  settings?: any;
  logo: string;
  name: string;
  preview?: boolean;
}) {
  const language = useStoreLanguage();
  const f: FooterSettings = settings?.footer || {};
  const phone = f.phone || settings?.phone || '+880 1878-374762';
  const hours = f.phoneHours || '9 AM - 8 PM';
  const email = f.email || 'support@' + (typeof window !== 'undefined' ? window.location.hostname.replace(/^www\./, '') : 'store.com');
  const address = f.address || 'House-14/16, Road-4, Block-D, Dhaka Uddan, Mohammadpur, Dhaka';
  const about = f.aboutText || `${name} - Premium watches, sunglasses and curated lifestyle collections crafted for everyday elegance and presence.`;
  const cols = Array.isArray(f.columns) && f.columns.length > 0 ? f.columns : DEFAULT_COLUMNS;
  const col1 = cols[0] || DEFAULT_COLUMNS[0];
  const col2 = cols[1] || DEFAULT_COLUMNS[1];
  const socials = f.socials || {
    facebook: '#',
    instagram: '#',
    tiktok: '#',
    youtube: '#',
    whatsapp: f.whatsapp || settings?.whatsapp || phone,
  };

  return (
    <footer className="ft-royalman">
      <div className="ft-rm-container">
        <div className="ft-rm-grid">
          {/* Col 1: Brand details */}
          <div className="ft-rm-brand-col">
            <div className="ft-rm-logo-wrap">
              {logo ? (
                <img src={logo} alt={name} className="ft-rm-logo-img" />
              ) : (
                <span className="ft-rm-logo-text">{name}</span>
              )}
            </div>
            <p className="ft-rm-about">{about}</p>
            <div className="ft-rm-contacts">
              <div className="ft-rm-contact-item">
                <span className="ft-rm-icon">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                  </svg>
                </span>
                <span>{address}</span>
              </div>
              <div className="ft-rm-contact-item">
                <span className="ft-rm-icon">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                    <path d="M6.62 10.79a15.053 15.053 0 006.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
                  </svg>
                </span>
                <a href={`tel:${phone}`} className="ft-rm-link">{phone}</a>
              </div>
              <div className="ft-rm-contact-item">
                <span className="ft-rm-icon">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                    <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
                  </svg>
                </span>
                <a href={`mailto:${email}`} className="ft-rm-link">{email}</a>
              </div>
            </div>
          </div>

          {/* Col 2: Company */}
          <div className="ft-rm-links-col">
            <h4 className="ft-rm-heading">{col1.title}</h4>
            <div className="ft-rm-link-list">
              {col1.links.map((lnk, idx) => (
                <a key={idx} href={`#${lnk.url}`} onClick={(e) => handleLinkClick(lnk.url, e)} className="ft-rm-nav-link">
                  {lnk.text}
                </a>
              ))}
            </div>
          </div>

          {/* Col 3: Useful Links */}
          <div className="ft-rm-links-col">
            <h4 className="ft-rm-heading">{col2.title}</h4>
            <div className="ft-rm-link-list">
              {col2.links.map((lnk, idx) => (
                <a key={idx} href={`#${lnk.url}`} onClick={(e) => handleLinkClick(lnk.url, e)} className="ft-rm-nav-link">
                  {lnk.text}
                </a>
              ))}
            </div>
          </div>

          {/* Col 4: Support hotline pill + Social Media */}
          <div className="ft-rm-support-col">
            <h4 className="ft-rm-heading">SUPPORT</h4>
            <a href={`tel:${phone}`} className="ft-rm-hotline-pill">
              <div className="ft-rm-pill-phone">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                  <path d="M6.62 10.79a15.053 15.053 0 006.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
                </svg>
              </div>
              <div className="ft-rm-pill-divider" />
              <div className="ft-rm-pill-info">
                <span className="ft-rm-pill-hours">{hours}</span>
                <span className="ft-rm-pill-num">{phone}</span>
              </div>
            </a>

            <h4 className="ft-rm-heading" style={{ marginTop: 24 }}>SOCIAL MEDIA</h4>
            <div className="ft-rm-social-row">
              {socials.facebook && (
                <a href={socials.facebook} target="_blank" rel="noopener noreferrer" className="ft-rm-soc-btn" title="Facebook">
                  <SocialIcon type="facebook" size={17} />
                </a>
              )}
              {socials.instagram && (
                <a href={socials.instagram} target="_blank" rel="noopener noreferrer" className="ft-rm-soc-btn" title="Instagram">
                  <SocialIcon type="instagram" size={17} />
                </a>
              )}
              {socials.tiktok && (
                <a href={socials.tiktok} target="_blank" rel="noopener noreferrer" className="ft-rm-soc-btn" title="TikTok">
                  <SocialIcon type="tiktok" size={17} />
                </a>
              )}
              {socials.youtube && (
                <a href={socials.youtube} target="_blank" rel="noopener noreferrer" className="ft-rm-soc-btn" title="YouTube">
                  <SocialIcon type="youtube" size={17} />
                </a>
              )}
              {(socials.whatsapp || settings?.whatsapp) && (
                <a
                  href={`https://wa.me/${(socials.whatsapp || settings?.whatsapp || phone).replace(/[^0-9]/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ft-rm-soc-btn"
                  title="WhatsApp"
                >
                  <WhatsAppIcon size={18} variant="white" />
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Bottom copyright line */}
        <div className="ft-rm-bottom">
          <span>{f.copyright || (language === 'bn' ? `© ২০২৬ ${name}. সর্বস্বত্ব সংরক্ষিত।` : `© 2026 ${name}. All Rights Reserved.`)}</span>
          <span style={{ fontSize: 12, opacity: 0.75 }}>Curated for Exceptional Everyday Living</span>
        </div>
      </div>
    </footer>
  );
}

/**
 * 🔲 TEMPLATE 2: Avora Style (media_1795556291462_807034c2.webp)
 * Minimalist luxury: Top columns (Logo, Skincare/Collections, Newsletter, Connect, Support) + divider line + GIANT wordmark
 */
export function AvoraFooter({
  settings,
  logo,
  name,
  preview = false,
}: {
  settings?: any;
  logo: string;
  name: string;
  preview?: boolean;
}) {
  const language = useStoreLanguage();
  const f: FooterSettings = settings?.footer || {};
  const [newsEmail, setNewsEmail] = useState('');
  const [subbed, setSubbed] = useState(false);
  const cols = Array.isArray(f.columns) && f.columns.length > 0 ? f.columns : DEFAULT_COLUMNS;
  const col1 = cols[0] || DEFAULT_COLUMNS[0];
  const socials = f.socials || {
    instagram: '#',
    facebook: '#',
    tiktok: '#',
  };
  const giantText = (f.aboutText && f.aboutText.length < 20 ? f.aboutText : name).toUpperCase();

  const handleSub = (e: React.FormEvent) => {
    e.preventDefault();
    if (newsEmail.trim()) setSubbed(true);
  };

  return (
    <footer className="ft-avora">
      <div className="ft-avora-container">
        {/* Top 5 columns */}
        <div className="ft-avora-top-grid">
          {/* Logo / Brand Name */}
          <div className="ft-avora-brand-col">
            {logo ? (
              <img src={logo} alt={name} className="ft-avora-logo" />
            ) : (
              <span className="ft-avora-brand-name">{name}</span>
            )}
          </div>

          {/* Collections / Skincare */}
          <div className="ft-avora-col">
            <h5 className="ft-avora-title">{col1.title}</h5>
            <div className="ft-avora-links">
              {col1.links.map((lnk, idx) => (
                <a key={idx} href={`#${lnk.url}`} onClick={(e) => handleLinkClick(lnk.url, e)}>
                  {lnk.text}
                </a>
              ))}
            </div>
          </div>

          {/* Newsletter */}
          <div className="ft-avora-col">
            <h5 className="ft-avora-title">{f.newsletterTitle || 'Newsletter'}</h5>
            {subbed ? (
              <p style={{ fontSize: 13, color: '#16a34a', margin: '8px 0' }}>✓ Subscribed successfully!</p>
            ) : (
              <form onSubmit={handleSub} className="ft-avora-news-form">
                <input
                  type="email"
                  placeholder="Enter Email Address"
                  value={newsEmail}
                  onChange={(e) => setNewsEmail(e.target.value)}
                  className="ft-avora-news-input"
                  required
                />
                <button type="submit" className="ft-avora-news-btn">Sign Up</button>
              </form>
            )}
          </div>

          {/* Connect */}
          <div className="ft-avora-col">
            <h5 className="ft-avora-title">Connect</h5>
            <div className="ft-avora-links">
              {socials.instagram && <a href={socials.instagram} target="_blank" rel="noopener noreferrer">Instagram</a>}
              {socials.facebook && <a href={socials.facebook} target="_blank" rel="noopener noreferrer">Facebook</a>}
              {socials.tiktok && <a href={socials.tiktok} target="_blank" rel="noopener noreferrer">TikTok</a>}
              {socials.youtube && <a href={socials.youtube} target="_blank" rel="noopener noreferrer">YouTube</a>}
              {(socials.whatsapp || settings?.whatsapp) && (
                <a href={`https://wa.me/${(socials.whatsapp || settings?.whatsapp || '').replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>
              )}
            </div>
          </div>

          {/* Support */}
          <div className="ft-avora-col">
            <h5 className="ft-avora-title">Support</h5>
            <div className="ft-avora-links">
              <a href="#info/contact" onClick={(e) => handleLinkClick('info/contact', e)}>24/7 Support</a>
              <a href="#info/terms" onClick={(e) => handleLinkClick('info/terms', e)}>Terms & Conditions</a>
              <a href="#info/privacy" onClick={(e) => handleLinkClick('info/privacy', e)}>Privacy Policy</a>
              <a href="#track" onClick={(e) => handleLinkClick('track', e)}>Track Order</a>
            </div>
          </div>
        </div>

        {/* Divider hairline */}
        <div className="ft-avora-divider" />

        {/* Middle copyright & Powered by */}
        <div className="ft-avora-mid-row">
          <span>{f.copyright || `© Copyright 2026. ${name} All Rights Reserved.`}</span>
          <span>{f.poweredBy || `Powered By ${name.toLowerCase()}.com`}</span>
        </div>

        {/* Giant Oversized Brand Typography */}
        <div className="ft-avora-giant-wrap" aria-hidden="true">
          <div className="ft-avora-giant-text">{giantText}</div>
        </div>
      </div>
    </footer>
  );
}

/**
 * 🌸 TEMPLATE 3: Laugh, Cry, Feast / Boutique Style (media_1795556291462_9cad5d3f.webp)
 * Soft blush/champagne luxury: Center Circular Seal + Horizontal Divider Links + 3 Columns (Contact, Hours, Info) + "Let's connect" + Newsletter Capsule
 */
export function BoutiqueFooter({
  settings,
  logo,
  name,
  preview = false,
}: {
  settings?: any;
  logo: string;
  name: string;
  preview?: boolean;
}) {
  const f: FooterSettings = settings?.footer || {};
  const [email, setEmail] = useState('');
  const [subbed, setSubbed] = useState(false);
  const phone = f.phone || settings?.phone || '+880 1878-374762';
  const emailAddr = f.email || 'info@' + (typeof window !== 'undefined' ? window.location.hostname.replace(/^www\./, '') : 'store.com');
  const address = f.address || '506 S. Washington Avenue, Dhaka, Bangladesh';
  const hours = f.phoneHours || 'Tues, Thurs, & Fri | 11AM-5PM\nWed & Sat | 11AM-7PM\nCLOSED SUNDAY & MONDAY';
  const socials = f.socials || { facebook: '#', instagram: '#', pinterest: '#', whatsapp: settings?.whatsapp || phone };

  const handleSub = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim()) setSubbed(true);
  };

  return (
    <footer className="ft-btq">
      <div className="ft-btq-container">
        {/* Top Center Circular Seal */}
        <div className="ft-btq-seal-wrap">
          <div className="ft-btq-seal">
            {logo ? (
              <img src={logo} alt={name} className="ft-btq-seal-img" />
            ) : (
              <span className="ft-btq-seal-text">{name}</span>
            )}
          </div>
        </div>

        {/* Horizontal Navigation Bar bordered by hairlines */}
        <div className="ft-btq-nav-bar">
          <a href="#info/about" onClick={(e) => handleLinkClick('info/about', e)}>ABOUT US</a>
          <span className="ft-btq-dot">|</span>
          <a href="#shop" onClick={(e) => handleLinkClick('shop', e)}>EVENTS & OFFERS</a>
          <span className="ft-btq-dot">|</span>
          <a href="#info/contact" onClick={(e) => handleLinkClick('info/contact', e)}>CONSULTATIONS</a>
          <span className="ft-btq-dot">|</span>
          <a href="#info/about" onClick={(e) => handleLinkClick('info/about', e)}>OUR STORY</a>
          <span className="ft-btq-dot">|</span>
          <a href="#info/shipping" onClick={(e) => handleLinkClick('info/shipping', e)}>FAQ</a>
        </div>

        {/* 3 Detail Columns: Contact, Hours, Information */}
        <div className="ft-btq-columns">
          {/* Contact */}
          <div className="ft-btq-col">
            <h5 className="ft-btq-col-title">CONTACT</h5>
            <div className="ft-btq-col-body">
              <a href={`tel:${phone}`} className="ft-btq-link">{phone}</a>
              <a href={`mailto:${emailAddr}`} className="ft-btq-link">{emailAddr}</a>
              <p style={{ marginTop: 8, whiteSpace: 'pre-line' }}>{address}</p>
            </div>
          </div>

          {/* Hours */}
          <div className="ft-btq-col ft-btq-col-center">
            <h5 className="ft-btq-col-title">HOURS</h5>
            <div className="ft-btq-col-body">
              <p className="ft-btq-subnote">*by appointment & online orders 24/7</p>
              <div style={{ whiteSpace: 'pre-line', lineHeight: 1.8 }}>{hours}</div>
            </div>
          </div>

          {/* Information */}
          <div className="ft-btq-col ft-btq-col-right">
            <h5 className="ft-btq-col-title">INFORMATION</h5>
            <div className="ft-btq-col-body">
              <a href="#info/contact" onClick={(e) => handleLinkClick('info/contact', e)}>Contact Us</a>
              <a href="#shop" onClick={(e) => handleLinkClick('shop', e)}>Browse Collections</a>
              <a href="#info/terms" onClick={(e) => handleLinkClick('info/terms', e)}>Terms & Conditions</a>
              <a href="#info/privacy" onClick={(e) => handleLinkClick('info/privacy', e)}>Privacy Policy</a>
            </div>
          </div>
        </div>

        {/* Bottom Socials & Newsletter Bar */}
        <div className="ft-btq-bottom-bar">
          <div className="ft-btq-social-block">
            <span className="ft-btq-cursive">Let's connect</span>
            <div className="ft-btq-social-icons">
              {socials.facebook && (
                <a href={socials.facebook} target="_blank" rel="noopener noreferrer" className="ft-btq-soc-link" title="Facebook">
                  <SocialIcon type="facebook" size={16} />
                </a>
              )}
              {socials.instagram && (
                <a href={socials.instagram} target="_blank" rel="noopener noreferrer" className="ft-btq-soc-link" title="Instagram">
                  <SocialIcon type="instagram" size={16} />
                </a>
              )}
              {socials.pinterest && (
                <a href={socials.pinterest} target="_blank" rel="noopener noreferrer" className="ft-btq-soc-link" title="Pinterest">
                  <SocialIcon type="pinterest" size={16} />
                </a>
              )}
              {(socials.whatsapp || settings?.whatsapp) && (
                <a href={`https://wa.me/${(socials.whatsapp || settings?.whatsapp || phone).replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer" className="ft-btq-soc-link" title="WhatsApp">
                  <WhatsAppIcon size={16} variant="official" />
                </a>
              )}
            </div>
          </div>

          <div className="ft-btq-news-block">
            <span className="ft-btq-news-label">STAY IN THE KNOW WITH {name.toUpperCase()}</span>
            {subbed ? (
              <span style={{ fontSize: 13, color: '#16a34a' }}>✓ Thank you for subscribing!</span>
            ) : (
              <form onSubmit={handleSub} className="ft-btq-news-form">
                <input
                  type="email"
                  placeholder="Your email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="ft-btq-news-input"
                  required
                />
                <button type="submit" className="ft-btq-news-btn" title="Submit">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                  </svg>
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Small copyright */}
        <div className="ft-btq-copyright">
          {f.copyright || `© 2026 ${name}. ALL RIGHTS RESERVED.`}
        </div>
      </div>
    </footer>
  );
}

/**
 * 💥 TEMPLATE 4: Enky Style (media_1795556291463_52097314.webp)
 * Modernist high-contrast: Newsletter box with Subscribe capsule + Sitemap/Partners/Services + GIANT modern brand text at bottom
 */
export function EnkyFooter({
  settings,
  logo,
  name,
  preview = false,
}: {
  settings?: any;
  logo: string;
  name: string;
  preview?: boolean;
}) {
  const f: FooterSettings = settings?.footer || {};
  const [email, setEmail] = useState('');
  const [subbed, setSubbed] = useState(false);
  const cols = Array.isArray(f.columns) && f.columns.length > 0 ? f.columns : DEFAULT_COLUMNS;
  const col1 = cols[0] || DEFAULT_COLUMNS[0];
  const col2 = cols[1] || DEFAULT_COLUMNS[1];
  const col3 = cols[2] || DEFAULT_COLUMNS[2];
  const socials = f.socials || {
    facebook: '#',
    instagram: '#',
    tiktok: '#',
    youtube: '#',
  };

  const handleSub = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim()) setSubbed(true);
  };

  return (
    <footer className="ft-enky">
      <div className="ft-enky-container">
        <div className="ft-enky-top-grid">
          {/* Left: Newsletter Box & Socials */}
          <div className="ft-enky-left-col">
            <p className="ft-enky-news-desc">
              {f.newsletterTitle || 'Join our newsletter to stay up to date on the latest news and updates.'}
            </p>
            {subbed ? (
              <div style={{ padding: '12px 18px', background: '#e2fbe8', color: '#166534', borderRadius: 99, fontSize: 13, fontWeight: 600 }}>
                ✓ Subscribed to updates!
              </div>
            ) : (
              <form onSubmit={handleSub} className="ft-enky-news-form">
                <input
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="ft-enky-news-input"
                  required
                />
                <button type="submit" className="ft-enky-news-btn">Subscribe</button>
              </form>
            )}
            <p className="ft-enky-privacy-note">
              By subscribing, you agree to our Privacy Policy and consent to receive updates.
            </p>
            <div className="ft-enky-social-row">
              {socials.facebook && (
                <a href={socials.facebook} target="_blank" rel="noopener noreferrer" className="ft-enky-soc-btn" title="Facebook">
                  <SocialIcon type="facebook" size={15} />
                </a>
              )}
              {socials.instagram && (
                <a href={socials.instagram} target="_blank" rel="noopener noreferrer" className="ft-enky-soc-btn" title="Instagram">
                  <SocialIcon type="instagram" size={15} />
                </a>
              )}
              {socials.tiktok && (
                <a href={socials.tiktok} target="_blank" rel="noopener noreferrer" className="ft-enky-soc-btn" title="TikTok">
                  <SocialIcon type="tiktok" size={15} />
                </a>
              )}
              {socials.youtube && (
                <a href={socials.youtube} target="_blank" rel="noopener noreferrer" className="ft-enky-soc-btn" title="YouTube">
                  <SocialIcon type="youtube" size={15} />
                </a>
              )}
            </div>
          </div>

          {/* Right: 3 Navigation Columns */}
          <div className="ft-enky-nav-cols">
            <div className="ft-enky-col">
              <h5 className="ft-enky-title">{col1.title}</h5>
              <div className="ft-enky-links">
                {col1.links.map((lnk, idx) => (
                  <a key={idx} href={`#${lnk.url}`} onClick={(e) => handleLinkClick(lnk.url, e)}>
                    {lnk.text}
                  </a>
                ))}
              </div>
            </div>

            <div className="ft-enky-col">
              <h5 className="ft-enky-title">{col2.title}</h5>
              <div className="ft-enky-links">
                {col2.links.map((lnk, idx) => (
                  <a key={idx} href={`#${lnk.url}`} onClick={(e) => handleLinkClick(lnk.url, e)}>
                    {lnk.text}
                  </a>
                ))}
              </div>
            </div>

            <div className="ft-enky-col">
              <h5 className="ft-enky-title">{col3.title}</h5>
              <div className="ft-enky-links">
                {col3.links.map((lnk, idx) => (
                  <a key={idx} href={`#${lnk.url}`} onClick={(e) => handleLinkClick(lnk.url, e)}>
                    {lnk.text}
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Giant Brand Wordmark */}
        <div className="ft-enky-bottom-wrap">
          <div className="ft-enky-giant-brand">
            {name.toLowerCase()}<span className="ft-enky-reg">®</span>
          </div>
          <div className="ft-enky-copyright">
            {f.copyright || `© 2026 ${name}. All Rights Reserved.`}
          </div>
        </div>
      </div>
    </footer>
  );
}

/**
 * 🏛️ TEMPLATE 5: Classic Luxury (Current Tabaya Default)
 */
export function ClassicFooter({
  settings,
  logo,
  name,
  preview = false,
}: {
  settings?: any;
  logo: string;
  name: string;
  preview?: boolean;
}) {
  const language = useStoreLanguage();
  const f: FooterSettings = settings?.footer || {};
  const phone = f.phone || settings?.phone || '+880 1878-374762';
  const whatsapp = f.whatsapp || settings?.whatsapp || '';
  const isSkin = typeof window !== 'undefined' && window.location.hostname.includes('metr');
  const about = f.aboutText || (isSkin
    ? 'Skincare, beauty and self-care products from trusted brands, delivered across Bangladesh with cash on delivery.'
    : 'Watches, sunglasses and gift collections for everyday style. Cash on delivery across Bangladesh.');

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
              ) : (
                <span>{name}</span>
              )}
            </div>
            <p className="tabaya-footer-desc">{about}</p>
            <div className="tabaya-trust-pill">
              <span>🚚 {tr('Cash on Delivery Nationwide', language)}</span>
              <span>{isSkin ? `🌿 ${tr('Product Details & Ingredient Information', language)}` : `🔄 ${tr('7-Day Easy Exchange Policy', language)}`}</span>
            </div>
          </div>
          <div>
            <h4>{tr('Collections', language)}</h4>
            <a onClick={() => go('shop')}>{tr(isSkin ? 'All Skincare & Essentials' : 'All Collections', language)}</a>
            <a onClick={() => go('shop')}>{tr('Featured Best Sellers', language)}</a>
            <a onClick={() => go('shop')}>{tr('New Arrivals', language)}</a>
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
              {tr(f.phoneHours || 'Everyday: 10:00 AM – 10:00 PM', language)}
            </div>
          </div>
        </div>
        <div className="tabaya-footer-bottom">
          <span>{f.copyright || (language === 'bn' ? `© ২০২৬ ${name}. সর্বস্বত্ব সংরক্ষিত।` : `© 2026 ${name}. All Rights Reserved.`)}</span>
          <span>Designed & Developed for exceptional performance</span>
        </div>
      </div>
    </footer>
  );
}

/**
 * 🌐 MASTER FOOTER COMPONENT
 * Renders the chosen template or custom HTML.
 */
export function RenderFooter({
  settings,
  preview = false,
}: {
  settings?: any;
  preview?: boolean;
}) {
  const f: FooterSettings = settings?.footer || {};
  const logo = resolveBrandLogo(settings?.logo);
  const name = resolveBrandName(settings?.storeName);

  // Custom HTML Mode
  if (f.mode === 'custom_html' && f.customHtml && f.customHtml.trim()) {
    return (
      <div
        className="custom-html-footer-container"
        dangerouslySetInnerHTML={{ __html: f.customHtml }}
      />
    );
  }

  // Ready Template Switcher
  const template = f.template || 'classic';
  switch (template) {
    case 'watch_luxury':
    case 'royalman':
      return <WatchLuxuryFooter settings={settings} logo={logo} name={name} preview={preview} />;
    case 'avora':
      return <AvoraFooter settings={settings} logo={logo} name={name} preview={preview} />;
    case 'boutique':
      return <BoutiqueFooter settings={settings} logo={logo} name={name} preview={preview} />;
    case 'enky':
      return <EnkyFooter settings={settings} logo={logo} name={name} preview={preview} />;
    case 'classic':
    default:
      return <ClassicFooter settings={settings} logo={logo} name={name} preview={preview} />;
  }
}
