import React, { useState } from 'react';
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

export interface SocialLinkItem {
  id?: string;
  platform: string;
  url: string;
  color?: string; // Optional custom color per individual icon
}

export interface SocialStyle {
  preset?: 'minimal' | 'official' | 'gold' | 'dark' | 'custom';
  iconColor?: string;
  bgColor?: string;
  borderColor?: string;
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
  socialLinks?: SocialLinkItem[];
  socialStyle?: SocialStyle;
  socials?: Record<string, string>; // legacy fallback
}

export const AVAILABLE_PLATFORMS = [
  { id: 'facebook', name: 'Facebook', defaultUrl: 'https://facebook.com/', officialColor: '#1877F2' },
  { id: 'instagram', name: 'Instagram', defaultUrl: 'https://instagram.com/', officialColor: '#E4405F' },
  { id: 'tiktok', name: 'TikTok', defaultUrl: 'https://tiktok.com/@', officialColor: '#000000' },
  { id: 'youtube', name: 'YouTube', defaultUrl: 'https://youtube.com/@', officialColor: '#FF0000' },
  { id: 'whatsapp', name: 'WhatsApp', defaultUrl: 'https://wa.me/', officialColor: '#25D366' },
  { id: 'twitter', name: 'X (Twitter)', defaultUrl: 'https://x.com/', officialColor: '#000000' },
  { id: 'telegram', name: 'Telegram', defaultUrl: 'https://t.me/', officialColor: '#229ED9' },
  { id: 'pinterest', name: 'Pinterest', defaultUrl: 'https://pinterest.com/', officialColor: '#BD081C' },
  { id: 'linkedin', name: 'LinkedIn', defaultUrl: 'https://linkedin.com/company/', officialColor: '#0A66C2' },
  { id: 'threads', name: 'Threads', defaultUrl: 'https://threads.net/@', officialColor: '#000000' },
  { id: 'snapchat', name: 'Snapchat', defaultUrl: 'https://snapchat.com/add/', officialColor: '#EAAA00' },
  { id: 'discord', name: 'Discord', defaultUrl: 'https://discord.gg/', officialColor: '#5865F2' },
  { id: 'reddit', name: 'Reddit', defaultUrl: 'https://reddit.com/r/', officialColor: '#FF4500' },
  { id: 'custom', name: 'Custom Website / Link', defaultUrl: 'https://', officialColor: '#0f172a' },
] as const;

export const OFFICIAL_COLORS: Record<string, string> = {
  facebook: '#1877F2',
  instagram: '#E4405F',
  tiktok: '#000000',
  youtube: '#FF0000',
  whatsapp: '#25D366',
  twitter: '#000000',
  telegram: '#229ED9',
  pinterest: '#BD081C',
  linkedin: '#0A66C2',
  threads: '#000000',
  snapchat: '#EAAA00',
  discord: '#5865F2',
  reddit: '#FF4500',
  custom: '#0f172a',
};

export function ShakilDeveloperCredit({ style, linkColor }: { style?: React.CSSProperties; linkColor?: string }) {
  return (
    <span style={{ fontSize: 12, opacity: 0.9, ...style }}>
      Designed &amp; Developed BY{' '}
      <a
        href="https://shakil.metrroma.com"
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: linkColor || 'inherit', fontWeight: 700, textDecoration: 'underline' }}
      >
        Shakil
      </a>
    </span>
  );
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

export const TEMPLATE_DEFAULT_CONFIGS: Record<string, {
  name: string;
  aboutText?: string;
  phone?: string;
  phoneHours?: string;
  email?: string;
  address?: string;
  newsletterTitle?: string;
  columns: FooterColumn[];
}> = {
  watch_luxury: {
    name: 'Watch & Luxury',
    aboutText: 'The crown is Yours! Royalman is one of the largest Online Watch store In Bangladesh!',
    phone: '09613008080',
    phoneHours: '9 AM - 8 PM',
    email: 'contact@royalman.com.bd',
    address: 'House-14/16, Road-4, Block-D, Dhaka Uddan, Mohammadpur, Dhaka',
    columns: [
      {
        title: 'COMPANY',
        links: [
          { text: 'About Us', url: 'info/about' },
          { text: 'Contact Us', url: 'info/contact' },
          { text: 'Privacy Policy', url: 'info/privacy' },
          { text: 'Terms & Conditions', url: 'info/terms' },
          { text: 'Cancellation & Refund Policy', url: 'info/returns' },
        ],
      },
      {
        title: 'USEFUL LINKS',
        links: [
          { text: 'Home', url: 'home' },
          { text: 'Shop', url: 'shop' },
          { text: 'Checkout', url: 'checkout' },
          { text: 'My account', url: 'account' },
        ],
      },
    ],
  },
  royalman: {
    name: 'Watch & Luxury',
    aboutText: 'The crown is Yours! Royalman is one of the largest Online Watch store In Bangladesh!',
    phone: '09613008080',
    phoneHours: '9 AM - 8 PM',
    email: 'contact@royalman.com.bd',
    address: 'House-14/16, Road-4, Block-D, Dhaka Uddan, Mohammadpur, Dhaka',
    columns: [
      {
        title: 'COMPANY',
        links: [
          { text: 'About Us', url: 'info/about' },
          { text: 'Contact Us', url: 'info/contact' },
          { text: 'Privacy Policy', url: 'info/privacy' },
          { text: 'Terms & Conditions', url: 'info/terms' },
          { text: 'Cancellation & Refund Policy', url: 'info/returns' },
        ],
      },
      {
        title: 'USEFUL LINKS',
        links: [
          { text: 'Home', url: 'home' },
          { text: 'Shop', url: 'shop' },
          { text: 'Checkout', url: 'checkout' },
          { text: 'My account', url: 'account' },
        ],
      },
    ],
  },
  avora: {
    name: 'Avora Style',
    aboutText: 'AVORA',
    newsletterTitle: 'Newsletter',
    columns: [
      {
        title: 'Skincare',
        links: [
          { text: 'Balms', url: 'shop' },
          { text: 'Body', url: 'shop' },
          { text: 'Fragrance', url: 'shop' },
          { text: 'Sets', url: 'shop' },
        ],
      },
      {
        title: 'Support',
        links: [
          { text: '24/7 Support', url: 'info/contact' },
          { text: 'Terms & Conditions', url: 'info/terms' },
          { text: 'Privacy Policy', url: 'info/privacy' },
        ],
      },
    ],
  },
  boutique: {
    name: 'Boutique Style',
    phone: '248.879.0833',
    email: 'info@joyabendmode.com',
    address: '506 S. Washington Avenue\nRoyal Oak, Michigan 48067',
    phoneHours: '*by appointment only\nTues, Thurs, & Fri | 11AM-5PM\nWed & Sat | 11AM-7PM\nCLOSED SUNDAY & MONDAY',
    columns: [
      {
        title: 'CONTACT',
        links: [
          { text: '248.879.0833', url: 'tel:2488790833' },
          { text: 'info@joyabendmode.com', url: 'mailto:info@joyabendmode.com' },
          { text: '506 S. Washington Avenue', url: 'info/contact' },
          { text: 'Royal Oak, Michigan 48067', url: 'info/contact' },
        ],
      },
      {
        title: 'HOURS',
        links: [
          { text: '*by appointment only', url: '#' },
          { text: 'Tues, Thurs, & Fri | 11AM-5PM', url: '#' },
          { text: 'Wed & Sat | 11AM-7PM', url: '#' },
          { text: 'CLOSED SUNDAY & MONDAY', url: '#' },
        ],
      },
      {
        title: 'INFORMATION',
        links: [
          { text: 'Contact Us', url: 'info/contact' },
          { text: 'Browse Collections', url: 'shop' },
          { text: 'Terms & Conditions', url: 'info/terms' },
          { text: 'Privacy Policy', url: 'info/privacy' },
        ],
      },
    ],
  },
  enky: {
    name: 'Enky Modern',
    newsletterTitle: 'Join our newsletter to stay up to date on the latest news and updates.',
    columns: [
      {
        title: 'Sitemap',
        links: [
          { text: 'About Us', url: 'info/about' },
          { text: 'Space design', url: 'shop' },
          { text: 'Customer Stories', url: 'info/about' },
          { text: 'FAQ', url: 'info/shipping' },
        ],
      },
      {
        title: 'Partners',
        links: [
          { text: 'Architects', url: 'info/contact' },
          { text: 'Co-Working', url: 'info/contact' },
          { text: 'Real Estate', url: 'info/contact' },
        ],
      },
      {
        title: 'Services',
        links: [
          { text: 'Furniture as Service', url: 'shop' },
          { text: 'Second-Hand Marketplace', url: 'shop' },
          { text: 'Enky Invest', url: 'shop' },
        ],
      },
    ],
  },
  classic: {
    name: 'Classic Tabaya',
    columns: [
      {
        title: 'COLLECTIONS',
        links: [
          { text: 'All Collections', url: 'shop' },
          { text: 'Featured Best Sellers', url: 'shop' },
          { text: 'New Arrivals', url: 'shop' },
        ],
      },
      {
        title: 'CUSTOMER CARE',
        links: [
          { text: 'Track Your Order', url: 'track' },
          { text: 'Shipping & Delivery', url: 'info/shipping' },
          { text: 'Returns & Exchanges', url: 'info/returns' },
          { text: 'Contact Customer Support', url: 'info/contact' },
        ],
      },
      {
        title: 'QUICK LINKS',
        links: [
          { text: 'About Us', url: 'info/about' },
          { text: 'Terms of Service', url: 'info/terms' },
          { text: 'Privacy Policy', url: 'info/privacy' },
          { text: 'Order Helpline', url: 'info/contact' },
        ],
      },
    ],
  },
};

export function getTemplateDefaults(templateId?: string) {
  const tid = templateId || 'classic';
  return TEMPLATE_DEFAULT_CONFIGS[tid] || TEMPLATE_DEFAULT_CONFIGS.classic;
}

export function getTemplateDefaultColumns(templateId?: string): FooterColumn[] {
  return getTemplateDefaults(templateId).columns;
}

export const DEFAULT_COLUMNS: FooterColumn[] = TEMPLATE_DEFAULT_CONFIGS.classic.columns;

export function normalizeSocialLinks(footer?: FooterSettings): SocialLinkItem[] {
  if (Array.isArray(footer?.socialLinks) && footer.socialLinks.length > 0) {
    return footer.socialLinks.filter((s) => s && typeof s.url === 'string' && s.url.trim());
  }
  const s = footer?.socials || {};
  const res: SocialLinkItem[] = [];
  if (s.facebook) res.push({ platform: 'facebook', url: s.facebook });
  if (s.instagram) res.push({ platform: 'instagram', url: s.instagram });
  if (s.tiktok) res.push({ platform: 'tiktok', url: s.tiktok });
  if (s.youtube) res.push({ platform: 'youtube', url: s.youtube });
  if (s.whatsapp) res.push({ platform: 'whatsapp', url: s.whatsapp.startsWith('http') ? s.whatsapp : `https://wa.me/${s.whatsapp.replace(/[^0-9]/g, '')}` });
  if (s.pinterest) res.push({ platform: 'pinterest', url: s.pinterest });
  if (s.twitter) res.push({ platform: 'twitter', url: s.twitter });
  if (res.length === 0) {
    return [
      { platform: 'facebook', url: 'https://facebook.com' },
      { platform: 'instagram', url: 'https://instagram.com' },
      { platform: 'tiktok', url: 'https://tiktok.com' },
      { platform: 'youtube', url: 'https://youtube.com' },
    ];
  }
  return res;
}

/**
 * Official, pixel-perfect brand SVG icons
 * Sourced directly from official brand guidelines and FontAwesome 6 Pro
 */
export function SocialIcon({ type, size = 18, color }: { type: string; size?: number; color?: string }) {
  const fill = color || 'currentColor';
  const cleanType = (type || '').toLowerCase().trim();

  switch (cleanType) {
    case 'facebook':
      // Official Facebook "f" logo
      return (
        <svg viewBox="0 0 320 512" width={size} height={size} fill={fill} style={{ display: 'block' }}>
          <path d="M279.14 288l14.22-92.66h-88.91v-60.13c0-25.35 12.42-50.06 52.24-50.06h40.42V6.26S260.43 0 225.36 0c-73.22 0-121.08 44.38-121.08 124.72v70.62H22.89V288h81.39v224h100.17V288z"/>
        </svg>
      );
    case 'instagram':
      // Official Instagram glyph
      return (
        <svg viewBox="0 0 448 512" width={size} height={size} fill={fill} style={{ display: 'block' }}>
          <path d="M224.1 141c-63.6 0-114.9 51.3-114.9 114.9s51.3 114.9 114.9 114.9S339 319.5 339 255.9 287.7 141 224.1 141zm0 189.6c-41.1 0-74.7-33.5-74.7-74.7s33.5-74.7 74.7-74.7 74.7 33.5 74.7 74.7-33.6 74.7-74.7 74.7zm146.4-194.3c0 14.9-12 26.8-26.8 26.8-14.9 0-26.8-12-26.8-26.8s12-26.8 26.8-26.8 26.8 12 26.8 26.8zm76.1 27.2c-1.7-35.9-9.9-67.7-36.2-93.9-26.2-26.2-58-34.4-93.9-36.2-37-2.1-147.9-2.1-184.9 0-35.8 1.7-67.6 9.9-93.9 36.1s-34.4 58-36.2 93.9c-2.1 37-2.1 147.9 0 184.9 1.7 35.9 9.9 67.7 36.2 93.9s58 34.4 93.9 36.2c37 2.1 147.9 2.1 184.9 0 35.9-1.7 67.7-9.9 93.9-36.2 26.2-26.2 34.4-58 36.2-93.9 2.1-37 2.1-147.8 0-184.8zM398.8 388c-7.8 19.6-22.9 34.7-42.6 42.6-29.5 11.7-99.5 9-132.1 9s-102.7 2.6-132.1-9c-19.6-7.8-34.7-22.9-42.6-42.6-11.7-29.5-9-99.5-9-132.1s-2.6-102.7 9-132.1c7.8-19.6 22.9-34.7 42.6-42.6 29.5-11.7 99.5-9 132.1-9s102.7-2.6 132.1 9c19.6 7.8 34.7 22.9 42.6 42.6 11.7 29.5 9 99.5 9 132.1s2.7 102.7-9 132.1z"/>
        </svg>
      );
    case 'tiktok':
      // Official TikTok musical note logo
      return (
        <svg viewBox="0 0 448 512" width={size} height={size} fill={fill} style={{ display: 'block' }}>
          <path d="M448 209.91a210.06 210.06 0 0 1-122.77-39.25V349.38A162.55 162.55 0 1 1 185 188.31V278.2a74.62 74.62 0 1 0 52.23 71.18V0l88 0a121.18 121.18 0 0 0 1.86 22.17h0A122.18 122.18 0 0 0 381 102.39a121.43 121.43 0 0 0 67 20.14z"/>
        </svg>
      );
    case 'youtube':
      // Official YouTube play logo
      return (
        <svg viewBox="0 0 576 512" width={size} height={size} fill={fill} style={{ display: 'block' }}>
          <path d="M549.655 124.083c-6.281-23.65-24.787-42.276-48.284-48.597C458.781 64 288 64 288 64S117.22 64 74.629 75.486c-23.497 6.322-42.003 24.947-48.284 48.597-11.412 42.867-11.412 132.305-11.412 132.305s0 89.438 11.412 132.305c6.281 23.65 24.787 41.5 48.284 47.821C117.22 448 288 448 288 448s170.78 0 213.371-11.486c23.497-6.321 42.003-24.171 48.284-47.821 11.412-42.867 11.412-132.305 11.412-132.305s0-89.438-11.412-132.305zm-317.51 213.583V174.334l142.739 81.666-142.739 81.666z"/>
        </svg>
      );
    case 'whatsapp':
      // Official WhatsApp bubble & receiver
      return (
        <svg viewBox="0 0 448 512" width={size} height={size} fill={fill} style={{ display: 'block' }}>
          <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z"/>
        </svg>
      );
    case 'twitter':
    case 'x':
      // Official X (Twitter) logo
      return (
        <svg viewBox="0 0 512 512" width={size} height={size} fill={fill} style={{ display: 'block' }}>
          <path d="M389.2 48h70.6L305.6 224.2 487 464H345L233.7 318.6 106.5 464H35.8L200.7 275.5 26.8 48H172.4L272.9 180.9 389.2 48zM364.4 421.8h39.1L151.1 88h-42L364.4 421.8z"/>
        </svg>
      );
    case 'telegram':
      // Official Telegram plane
      return (
        <svg viewBox="0 0 496 512" width={size} height={size} fill={fill} style={{ display: 'block' }}>
          <path d="M248 8C111 8 0 119 0 256s111 248 248 248 248-111 248-248S385 8 248 8zm121.8 169.9l-40.7 191.8c-3 13.6-11.1 16.9-22.4 10.5l-62-45.7-29.9 28.8c-3.3 3.3-6.1 6.1-12.5 6.1l4.4-63.1 114.9-103.8c5-4.4-1.1-6.9-7.7-2.5l-142 89.4-61.2-19.1c-13.3-4.2-13.6-13.3 2.8-19.7l239.1-92.2c11.1-4 20.8 2.7 17.2 19.5z"/>
        </svg>
      );
    case 'pinterest':
      // Official Pinterest badge
      return (
        <svg viewBox="0 0 384 512" width={size} height={size} fill={fill} style={{ display: 'block' }}>
          <path d="M204 6.5C101.4 6.5 0 74.9 0 185.6 0 256 39.6 296 63.6 296c9.9 0 15.6-27.6 15.6-35.4 0-9.3-23.7-29.1-23.7-67.8 0-80.4 61.2-137.4 140.4-137.4 68.1 0 118.5 38.7 118.5 109.8 0 53.1-21.3 152.7-90.3 152.7-24.9 0-46.2-18-46.2-43.8 0-38.1 24.9-75 24.9-114.3 0-66.3-93.6-54.3-93.6 25.8 0 16.8 2.1 35.4 9.6 50.7-13.8 59.4-42 147.9-42 209.1 0 18.9 2.7 37.5 4.5 56.4 3.3 3.9 4.8 3.9 8.4 1.5 36.3-50.7 52.8-82.5 73.2-162.9 8.7 16.5 31.8 29.4 57 29.4 99.9 0 148.2-96 148.2-197.4C360 81.5 287.4 6.5 204 6.5z"/>
        </svg>
      );
    case 'linkedin':
      // Official LinkedIn logo
      return (
        <svg viewBox="0 0 448 512" width={size} height={size} fill={fill} style={{ display: 'block' }}>
          <path d="M416 32H31.9C14.3 32 0 46.5 0 64.3v383.4C0 465.5 14.3 480 31.9 480H416c17.6 0 32-14.5 32-32.3V64.3c0-17.8-14.4-32.3-32-32.3zM135.4 416H69V202.2h66.5V416zm-33.2-243c-21.3 0-38.5-17.3-38.5-38.5S80.9 96 102.2 96c21.2 0 38.5 17.3 38.5 38.5 0 21.3-17.2 38.5-38.5 38.5zm282.1 243h-66.4V312c0-24.8-.5-56.7-34.5-56.7-34.6 0-39.9 27-39.9 54.9V416h-66.4V202.2h63.7v29.2h.9c8.9-16.8 30.6-34.5 62.9-34.5 67.2 0 79.7 44.3 79.7 101.9V416z"/>
        </svg>
      );
    case 'threads':
      // Official Threads logo
      return (
        <svg viewBox="0 0 448 512" width={size} height={size} fill={fill} style={{ display: 'block' }}>
          <path d="M331.5 235.7c2.2 .9 4.2 1.9 6.3 2.8c29.2 14.1 50.6 35.2 61.8 61.4c15.7 36.5 17.2 95.8-30.3 143.2c-36.2 36.1-87.6 52.9-148.7 48.6c-59.5-4.2-108.6-27.4-142.1-67C43.1 382.4 24 321.6 24 248.5c0-73.4 19.2-134.4 55.4-176.4C113.8 28.6 164.7 4.2 226.7 0c61.6-4.2 113.8 15.6 151.2 57.3c35.4 39.5 53.6 96.1 54.1 168.3l-50.6 0c-.5-59.8-14.7-105.7-41.9-136.2c-27.4-30.5-66.2-45-112.5-41.9c-48.4 3.3-88 22.8-114.5 56.4c-26.6 33.7-40.7 82.5-40.7 141.2c0 58.7 14.1 107.5 40.7 141.2c26.6 33.7 66.1 53.2 114.5 56.4c48.6 3.4 89.2-9.7 117.6-38c35.8-35.7 34.6-79.8 23.3-106.1c-6.8-15.8-19.6-28.7-37.1-37.2c-1.3-.6-2.6-1.3-4-1.9c-11.4 50.1-39 88.3-83.3 100.8c-28.2 8-57.8 4.2-79.7-10.4c-21.8-14.5-34.6-38.3-34.6-67.1c0-43.5 32-75.3 80.6-79.6c20.3-1.8 40.8 .2 61.2 6.1zm-84.3 90.6c19.9-1.8 38.6-10.8 51.5-24.8c12.8-14 20.2-32.9 21.6-54.8c-15.8-3.9-31.9-5.2-47.8-3.8c-26.9 2.4-44.5 18.2-44.5 40.9c0 15 6.7 27.2 18.2 34.8c9.7 6.4 22.7 8.3 35.8 7.1l-14.8 .6z"/>
        </svg>
      );
    case 'snapchat':
      // Official Snapchat ghost
      return (
        <svg viewBox="0 0 512 512" width={size} height={size} fill={fill} style={{ display: 'block' }}>
          <path d="M495.2 355.4c-4.9-10.4-14.6-17.1-25.6-21.8-21.3-9.1-41.2-14.8-49.9-20.7-7-4.8-10.2-10.4-10.2-17.7 0-14.7 13.7-32.5 19.3-39.6 10.9-13.8 22.3-33.4 22.3-61.9 0-77.9-61.7-141.7-195.1-141.7S60.9 117.8 60.9 195.7c0 28.5 11.4 48.1 22.3 61.9 5.6 7.1 19.3 24.9 19.3 39.6 0 7.3-3.2 12.9-10.2 17.7-8.7 5.9-28.6 11.6-49.9 20.7-11 4.7-20.7 11.4-25.6 21.8-5.3 11.2-3.8 23.3 4 33.1 13.9 17.5 45.4 23.6 74.3 26.8 3.5.4 6 3.4 5.7 6.9-.9 10.4-2.6 30.1-2.6 44.6 0 6.6 4.3 12.4 10.6 14.2 18.2 5.1 48.8 8.9 83.7 8.9 21.6 0 45.1-1.6 68.3-7.5 10.5-2.7 21.6-2.7 32.1 0 23.2 5.9 46.7 7.5 68.3 7.5 34.9 0 65.5-3.8 83.7-8.9 6.3-1.8 10.6-7.6 10.6-14.2 0-14.5-1.7-34.2-2.6-44.6-.3-3.5 2.2-6.5 5.7-6.9 28.9-3.2 60.4-9.3 74.3-26.8 7.8-9.8 9.3-21.9 4-33.1z"/>
        </svg>
      );
    case 'discord':
      // Official Discord controller face
      return (
        <svg viewBox="0 0 640 512" width={size} height={size} fill={fill} style={{ display: 'block' }}>
          <path d="M524.531 69.836a1.5 1.5 0 0 0-.764-.7A485.065 485.065 0 0 0 404.081 32.03a1.816 1.816 0 0 0-1.923.91 337.461 337.461 0 0 0-14.901 30.607 449.214 449.214 0 0 0-134.426 0 304.247 304.247 0 0 0-15.188-30.607 1.877 1.877 0 0 0-1.924-.91 483.682 483.682 0 0 0-119.688 37.107 1.712 1.712 0 0 0-.788.676C39.068 183.651 18.186 294.69 28.43 404.354a2.016 2.016 0 0 0 .765 1.375 487.666 487.666 0 0 0 146.825 74.189 1.9 1.9 0 0 0 2.063-.676A348.2 348.2 0 0 0 208.12 430.4a1.86 1.86 0 0 0-1.019-2.588 321.173 321.173 0 0 1-45.868-21.853 1.885 1.885 0 0 1-.185-3.126 251.047 251.047 0 0 0 9.109-7.13 1.819 1.819 0 0 1 1.9-.256c96.229 43.917 200.41 43.917 295.5 0a1.812 1.812 0 0 1 1.924.233 234.533 234.533 0 0 0 9.132 7.16 1.884 1.884 0 0 1-.162 3.126 301.407 301.407 0 0 1-45.89 21.83 1.875 1.875 0 0 0-1 2.611 391.055 391.055 0 0 0 30.014 48.815 1.864 1.864 0 0 0 2.063.676 486.048 486.048 0 0 0 147.09-74.2 1.822 1.822 0 0 0 .765-1.352c12.264-126.783-20.532-236.912-86.934-334.541zM222.491 337.58c-28.972 0-52.844-26.587-52.844-59.239s23.409-59.241 52.844-59.241c29.665 0 53.306 26.82 52.843 59.239 0 32.654-23.41 59.241-52.843 59.241zm195.38 0c-28.971 0-52.843-26.587-52.843-59.239s23.409-59.241 52.843-59.241c29.667 0 53.307 26.82 52.844 59.239 0 32.654-23.177 59.241-52.844 59.241z"/>
        </svg>
      );
    case 'reddit':
      // Official Reddit alien
      return (
        <svg viewBox="0 0 512 512" width={size} height={size} fill={fill} style={{ display: 'block' }}>
          <path d="M440.3 203.7c-15 0-28.2 6.2-37.9 15.9-35.7-24.7-83.8-40.6-137.1-42.3L293 80.8c.7-3.1-.6-6.4-3.2-8.4-2.6-2-6.1-2.4-9.1-1.1L168.1 120c-7.6-6.4-17.4-10.4-28.1-10.4-24.3 0-44 19.7-44 44 0 14.2 6.8 26.8 17.3 34.9-1.2 6.3-1.8 12.8-1.8 19.5 0 70.8 82.5 128.2 184.2 128.2s184.2-57.4 184.2-128.2c0-6.7-.6-13.2-1.8-19.5 10.6-8.1 17.4-20.7 17.4-34.9-.1-24.3-19.8-43.9-44.1-43.9zM224 232c13.3 0 24 10.7 24 24s-10.7 24-24 24-24-10.7-24-24 10.7-24 24-24zm120 72c-20.8 20.8-60.1 22.2-64 22.2s-43.2-1.4-64-22.2c-3.1-3.1-3.1-8.2 0-11.3 3.1-3.1 8.2-3.1 11.3 0 13.5 13.5 41.5 17.5 52.7 17.5s39.2-4 52.7-17.5c3.1-3.1 8.2-3.1 11.3 0 3.2 3.1 3.2 8.2 0 11.3zm8-24c-13.3 0-24-10.7-24-24s10.7-24 24-24 24 10.7 24 24-10.7 24-24 24z"/>
        </svg>
      );
    case 'custom':
    default:
      // Universal website / link globe
      return (
        <svg viewBox="0 0 24 24" width={size} height={size} fill={fill} style={{ display: 'block' }}>
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
        </svg>
      );
  }
}

export function formatSocialUrl(platform: string, url: string): string {
  if (!url || typeof url !== 'string') return '#';
  const trimmed = url.trim();
  const p = (platform || '').toLowerCase().trim();
  if (p === 'whatsapp') {
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
    const digits = trimmed.replace(/[^0-9]/g, '');
    const cleanNum = digits.startsWith('880') ? digits : ('880' + digits.replace(/^0+/, ''));
    return `https://wa.me/${cleanNum}`;
  }
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://') && !trimmed.startsWith('tel:') && !trimmed.startsWith('mailto:')) {
    return 'https://' + trimmed.replace(/^\/+/, '');
  }
  return trimmed;
}

/**
 * 🌟 Circular Badge Social Row matching user reference image:
 * Features customizable per-icon color or global theme colors!
 */
export function RenderSocialRow({
  footer,
  className = '',
  size = 38,
  iconSize = 18,
}: {
  footer?: FooterSettings;
  className?: string;
  size?: number;
  iconSize?: number;
}) {
  const links = normalizeSocialLinks(footer);
  const st = footer?.socialStyle || {};
  const isOfficial = st.preset === 'official';
  const globalIconColor = st.iconColor || '#1e293b';
  const bgColor = st.bgColor || '#ffffff';
  const borderColor = st.borderColor || '#cbd5e1';

  return (
    <div className={`ft-universal-socials ${className}`} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      {links.map((item, idx) => {
        const platform = (item.platform || 'facebook').toLowerCase();
        
        // Priority: Individual Item Custom Color > Official Preset Color > Global Icon Color
        const thisIconColor = item.color && item.color.trim()
          ? item.color.trim()
          : (isOfficial ? (OFFICIAL_COLORS[platform] || globalIconColor) : globalIconColor);

        const thisBgColor = bgColor;
        const thisBorderColor = borderColor;

        return (
          <a
            key={idx}
            href={formatSocialUrl(item.platform, item.url)}
            target="_blank"
            rel="noopener noreferrer"
            title={item.platform}
            className="ft-social-circle-badge"
            style={{
              width: size,
              height: size,
              borderRadius: '50%',
              background: thisBgColor,
              border: `1.5px solid ${thisBorderColor}`,
              color: thisIconColor,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              textDecoration: 'none',
              boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              flexShrink: 0,
            }}
          >
            <SocialIcon type={platform} size={iconSize} color={thisIconColor} />
          </a>
        );
      })}
    </div>
  );
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
  const tplDef = getTemplateDefaults('watch_luxury');
  const phone = f.phone || settings?.phone || tplDef.phone || '09613008080';
  const hours = f.phoneHours || tplDef.phoneHours || '9 AM - 8 PM';
  const email = f.email || tplDef.email || 'contact@royalman.com.bd';
  const address = f.address || tplDef.address || 'House-14/16, Road-4, Block-D, Dhaka Uddan, Mohammadpur, Dhaka';
  const about = f.aboutText || tplDef.aboutText || 'The crown is Yours! Royalman is one of the largest Online Watch store In Bangladesh!';
  const cols = Array.isArray(f.columns) && f.columns.length > 0 ? f.columns : tplDef.columns;
  const col1 = cols[0] || tplDef.columns[0];
  const col2 = cols[1] || tplDef.columns[1];

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

          {/* Col 4: Support hotline pill + Universal Social Media */}
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
            <RenderSocialRow footer={f} size={36} iconSize={18} />
          </div>
        </div>

        {/* Bottom copyright line */}
        <div className="ft-rm-bottom">
          <span>{f.copyright || (language === 'bn' ? `© ২০২৬ ${name}. সর্বস্বত্ব সংরক্ষিত।` : `© 2026 ${name}. All Rights Reserved.`)}</span>
          <ShakilDeveloperCredit />
        </div>
      </div>
    </footer>
  );
}

// Backwards compatibility alias
export const RoyalManFooter = WatchLuxuryFooter;

/**
 * 🔲 TEMPLATE 2: Avora Style (media_1795556291462_807034c2.webp)
 * Minimalist luxury: Top columns + hairline divider + GIANT wordmark + Universal Social Media
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
  const f: FooterSettings = settings?.footer || {};
  const tplDef = getTemplateDefaults('avora');
  const [newsEmail, setNewsEmail] = useState('');
  const [subbed, setSubbed] = useState(false);
  const cols = Array.isArray(f.columns) && f.columns.length > 0 ? f.columns : tplDef.columns;
  const col1 = cols[0] || tplDef.columns[0];
  const col2 = cols[1] || tplDef.columns[1] || { title: 'Support', links: [] };
  const giantText = (f.aboutText && f.aboutText.length < 20 ? f.aboutText : name).toUpperCase();

  const handleSub = (e: React.FormEvent) => {
    e.preventDefault();
    if (newsEmail.trim()) setSubbed(true);
  };

  return (
    <footer className="ft-avora">
      <div className="ft-avora-container">
        {/* Top 5 columns matching media_1795556291462_807034c2.webp */}
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
            <h5 className="ft-avora-title">{f.newsletterTitle || tplDef.newsletterTitle || 'Newsletter'}</h5>
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

          {/* Connect (Universal Social Icons) */}
          <div className="ft-avora-col">
            <h5 className="ft-avora-title">Connect</h5>
            <RenderSocialRow footer={f} size={34} iconSize={16} />
          </div>

          {/* Support (Editable Column 2) */}
          <div className="ft-avora-col">
            <h5 className="ft-avora-title">{col2.title}</h5>
            <div className="ft-avora-links">
              {col2.links.map((lnk, idx) => (
                <a key={idx} href={`#${lnk.url}`} onClick={(e) => handleLinkClick(lnk.url, e)}>
                  {lnk.text}
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* Divider hairline */}
        <div className="ft-avora-divider" />

        {/* Middle copyright & Powered by */}
        <div className="ft-avora-mid-row">
          <span>{f.copyright || `© Copyright 2026. ${name} All Rights Reserved.`}</span>
          <ShakilDeveloperCredit />
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
 * Soft blush luxury: Center Circular Seal + Horizontal Divider Nav + 3 Columns + "Let's connect" Universal Socials + Capsule Newsletter
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
  const tplDef = getTemplateDefaults('boutique');
  const [email, setEmail] = useState('');
  const [subbed, setSubbed] = useState(false);
  const phone = f.phone || settings?.phone || tplDef.phone || '248.879.0833';
  const emailAddr = f.email || tplDef.email || 'info@joyabendmode.com';
  const address = f.address || tplDef.address || '506 S. Washington Avenue\nRoyal Oak, Michigan 48067';
  const hours = f.phoneHours || tplDef.phoneHours || '*by appointment only\nTues, Thurs, & Fri | 11AM-5PM\nWed & Sat | 11AM-7PM\nCLOSED SUNDAY & MONDAY';
  const cols = Array.isArray(f.columns) && f.columns.length > 0 ? f.columns : tplDef.columns;
  const col1 = cols[0] || tplDef.columns[0];
  const col2 = cols[1] || tplDef.columns[1];
  const col3 = cols[2] || tplDef.columns[2];

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
            <h5 className="ft-btq-col-title">{col1.title}</h5>
            <div className="ft-btq-col-body">
              {col1.links && col1.links.length > 0 ? (
                col1.links.map((lnk, idx) => (
                  <a key={idx} href={lnk.url.startsWith('http') || lnk.url.startsWith('tel:') || lnk.url.startsWith('mailto:') ? lnk.url : `#${lnk.url}`} onClick={(e) => handleLinkClick(lnk.url, e)} className="ft-btq-link">
                    {lnk.text}
                  </a>
                ))
              ) : (
                <>
                  <a href={`tel:${phone}`} className="ft-btq-link">{phone}</a>
                  <a href={`mailto:${emailAddr}`} className="ft-btq-link">{emailAddr}</a>
                  <p style={{ marginTop: 8, whiteSpace: 'pre-line' }}>{address}</p>
                </>
              )}
            </div>
          </div>

          {/* Hours */}
          <div className="ft-btq-col ft-btq-col-center">
            <h5 className="ft-btq-col-title">{col2.title}</h5>
            <div className="ft-btq-col-body">
              {col2.links && col2.links.length > 0 ? (
                col2.links.map((lnk, idx) => (
                  <div key={idx} style={{ lineHeight: 1.8 }}>{lnk.text}</div>
                ))
              ) : (
                <div style={{ whiteSpace: 'pre-line', lineHeight: 1.8 }}>{hours}</div>
              )}
            </div>
          </div>

          {/* Information */}
          <div className="ft-btq-col ft-btq-col-right">
            <h5 className="ft-btq-col-title">{col3.title}</h5>
            <div className="ft-btq-col-body">
              {col3.links.map((lnk, idx) => (
                <a key={idx} href={`#${lnk.url}`} onClick={(e) => handleLinkClick(lnk.url, e)} className="ft-btq-link">
                  {lnk.text}
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom Socials & Newsletter Bar */}
        <div className="ft-btq-bottom-bar">
          <div className="ft-btq-social-block">
            <span className="ft-btq-cursive">Let's connect</span>
            <RenderSocialRow footer={f} size={36} iconSize={17} />
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
        <div className="ft-btq-copyright" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <span>{f.copyright || `© 2026 ${name}. ALL RIGHTS RESERVED.`}</span>
          <ShakilDeveloperCredit />
        </div>
      </div>
    </footer>
  );
}

/**
 * 💥 TEMPLATE 4: Enky Style (media_1795556291463_52097314.webp)
 * Modernist high-contrast: Newsletter box with Subscribe capsule + Sitemap/Partners/Services + GIANT modern brand text + Universal Socials
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
  const tplDef = getTemplateDefaults('enky');
  const [email, setEmail] = useState('');
  const [subbed, setSubbed] = useState(false);
  const cols = Array.isArray(f.columns) && f.columns.length > 0 ? f.columns : tplDef.columns;
  const col1 = cols[0] || tplDef.columns[0];
  const col2 = cols[1] || tplDef.columns[1];
  const col3 = cols[2] || tplDef.columns[2];

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
              {f.newsletterTitle || tplDef.newsletterTitle || 'Join our newsletter to stay up to date on the latest news and updates.'}
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
            <RenderSocialRow footer={f} size={36} iconSize={17} />
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
          <div className="ft-enky-copyright" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <span>{f.copyright || `© 2026 ${name}. All Rights Reserved.`}</span>
            <ShakilDeveloperCredit />
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
            <div style={{ marginTop: 18 }}>
              <RenderSocialRow footer={f} size={36} iconSize={17} />
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
                  <SocialIcon type="whatsapp" size={18} color="#25D366" />
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
          <ShakilDeveloperCredit />
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

  // Custom HTML Mode (Hardcoded Developer Credit permanently retained below custom HTML)
  if (f.mode === 'custom_html' && f.customHtml && f.customHtml.trim()) {
    return (
      <div className="custom-html-footer-container">
        <div dangerouslySetInnerHTML={{ __html: f.customHtml }} />
        <div style={{ textAlign: 'center', padding: '14px 20px', background: '#090812', borderTop: '1px solid rgba(255,255,255,0.08)', color: '#94a3b8', fontSize: 13 }}>
          <ShakilDeveloperCredit linkColor="#c4b5fd" />
        </div>
      </div>
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
