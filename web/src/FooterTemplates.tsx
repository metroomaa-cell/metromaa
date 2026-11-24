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

export interface SocialLinkItem {
  id?: string;
  platform: string;
  url: string;
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
  { id: 'facebook', name: 'Facebook', defaultUrl: 'https://facebook.com/' },
  { id: 'instagram', name: 'Instagram', defaultUrl: 'https://instagram.com/' },
  { id: 'whatsapp', name: 'WhatsApp', defaultUrl: 'https://wa.me/' },
  { id: 'tiktok', name: 'TikTok', defaultUrl: 'https://tiktok.com/@' },
  { id: 'youtube', name: 'YouTube', defaultUrl: 'https://youtube.com/@' },
  { id: 'twitter', name: 'X (Twitter)', defaultUrl: 'https://x.com/' },
  { id: 'telegram', name: 'Telegram', defaultUrl: 'https://t.me/' },
  { id: 'pinterest', name: 'Pinterest', defaultUrl: 'https://pinterest.com/' },
  { id: 'linkedin', name: 'LinkedIn', defaultUrl: 'https://linkedin.com/company/' },
  { id: 'threads', name: 'Threads', defaultUrl: 'https://threads.net/@' },
  { id: 'snapchat', name: 'Snapchat', defaultUrl: 'https://snapchat.com/add/' },
  { id: 'discord', name: 'Discord', defaultUrl: 'https://discord.gg/' },
  { id: 'reddit', name: 'Reddit', defaultUrl: 'https://reddit.com/r/' },
  { id: 'custom', name: 'Custom Website / Link', defaultUrl: 'https://' },
] as const;

export const OFFICIAL_COLORS: Record<string, string> = {
  facebook: '#1877F2',
  instagram: '#E4405F',
  whatsapp: '#25D366',
  youtube: '#FF0000',
  tiktok: '#000000',
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

/* Comprehensive SVG Social Icons for all global platforms */
export function SocialIcon({ type, size = 18, color }: { type: string; size?: number; color?: string }) {
  const fill = color || 'currentColor';
  const cleanType = (type || '').toLowerCase().trim();

  switch (cleanType) {
    case 'facebook':
      return (
        <svg viewBox="0 0 24 24" width={size} height={size} fill={fill}>
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
        </svg>
      );
    case 'instagram':
      return (
        <svg viewBox="0 0 24 24" width={size} height={size} fill={fill}>
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
        </svg>
      );
    case 'tiktok':
      return (
        <svg viewBox="0 0 24 24" width={size} height={size} fill={fill}>
          <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64c.298-.002.595.042.88.13V9.4a6.33 6.33 0 0 0-1-.08A6.34 6.34 0 0 0 3 15.66a6.34 6.34 0 0 0 10.81 4.47 6.27 6.27 0 0 0 1.9-4.47V8.5a8.27 8.27 0 0 0 4.88 1.58V6.69z"/>
        </svg>
      );
    case 'youtube':
      return (
        <svg viewBox="0 0 24 24" width={size} height={size} fill={fill}>
          <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
        </svg>
      );
    case 'whatsapp':
      return (
        <svg viewBox="0 0 24 24" width={size} height={size} fill={fill}>
          <path d="M17.507 14.307c-.283-.141-1.674-.824-1.933-.918-.259-.094-.447-.141-.636.141-.188.282-.73 1.036-.895 1.224-.165.188-.33.212-.612.071-.282-.141-1.192-.439-2.272-1.4-.84-.748-1.407-1.672-1.572-1.954-.165-.282-.018-.435.124-.575.127-.127.283-.33.424-.494.141-.165.1-.33.024-.612-.075-.282-.636-1.53-.872-2.094-.23-.55-.463-.475-.636-.484l-.542-.01c-.188 0-.494.071-.753.353-.259.282-.988.965-.988 2.353 0 1.388 1.012 2.73 1.153 2.918.141.188 1.99 3.04 4.823 4.263.674.292 1.2.466 1.611.597.677.215 1.293.185 1.78.112.543-.081 1.674-.684 1.909-1.344.235-.66.235-1.224.165-1.344-.07-.12-.259-.188-.542-.33zm-5.467 7.42c-2.036 0-3.953-.59-5.58-1.608l-.4-.25-4.144 1.087 1.106-4.04-.26-.414c-1.12-1.785-1.716-3.86-1.716-5.992 0-6.075 4.942-11.017 11.02-11.017 2.943 0 5.71 1.147 7.79 3.228 2.08 2.08 3.226 4.848 3.226 7.792 0 6.077-4.944 11.019-11.022 11.019zm9.394-18.414c-2.508-2.51-5.845-3.893-9.394-3.893-7.31 0-13.26 5.95-13.26 13.26 0 2.336.61 4.617 1.77 6.626l-1.88 6.874 7.034-1.845c1.944 1.06 4.143 1.62 6.39 1.62h.005c7.31 0 13.26-5.95 13.26-13.26 0-3.548-1.382-6.885-3.89-9.395z"/>
        </svg>
      );
    case 'twitter':
    case 'x':
      return (
        <svg viewBox="0 0 24 24" width={size} height={size} fill={fill}>
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
        </svg>
      );
    case 'telegram':
      return (
        <svg viewBox="0 0 24 24" width={size} height={size} fill={fill}>
          <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.161c-.18.716-1.574 6.44-2.284 9.24-.3 1.185-.737 1.581-1.16 1.62-.919.085-1.616-.607-2.506-1.19-.139-.092-2.174-1.386-2.92-1.748-.746-.362-1.077-.732-.016-1.792.244-.244 4.542-4.16 4.625-4.512.01-.044.02-.19-.07-.27-.09-.08-.22-.053-.32-.03-.13.03-2.29 1.46-6.46 4.28-.61.42-1.16.63-1.66.62-.55-.01-1.6-.31-2.39-.56-.97-.31-1.74-.48-1.67-1.01.04-.28.42-.56 1.15-.86 4.49-1.95 7.49-3.24 9-3.87 4.28-1.78 5.17-2.09 5.75-2.1.13 0 .41.03.6.18.15.13.2.3.22.42-.01.07.01.23-.03.38z"/>
        </svg>
      );
    case 'pinterest':
      return (
        <svg viewBox="0 0 24 24" width={size} height={size} fill={fill}>
          <path d="M12 0a12 12 0 0 0-4.37 23.18c-.06-.94-.12-2.39.02-3.42l1.04-4.41s-.26-.52-.26-1.3c0-1.22.71-2.13 1.59-2.13.75 0 1.11.56 1.11 1.24 0 .76-.48 1.89-.73 2.94-.21.88.44 1.6 1.31 1.6 1.57 0 2.78-1.66 2.78-4.05 0-2.12-1.52-3.6-3.7-3.6-2.52 0-4 1.89-4 3.84 0 .76.29 1.58.66 2.02.07.09.08.17.06.26l-.25 1.02c-.04.16-.14.2-.32.12-1.19-.55-1.93-2.28-1.93-3.67 0-2.98 2.17-5.72 6.25-5.72 3.28 0 5.83 2.34 5.83 5.46 0 3.26-2.05 5.88-4.9 5.88-.96 0-1.86-.5-2.17-1.09l-.59 2.25c-.21.82-.78 1.85-1.17 2.47A12 12 0 1 0 12 0z"/>
        </svg>
      );
    case 'linkedin':
      return (
        <svg viewBox="0 0 24 24" width={size} height={size} fill={fill}>
          <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
        </svg>
      );
    case 'threads':
      return (
        <svg viewBox="0 0 24 24" width={size} height={size} fill={fill}>
          <path d="M12.186 24C5.454 24 0 18.608 0 12.004 0 5.397 5.454 0 12.186 0c6.643 0 11.968 5.253 12.146 11.758h-3.303C20.852 7.03 16.942 3.25 12.186 3.25c-4.908 0-8.91 3.935-8.91 8.754s4.002 8.754 8.91 8.754c3.968 0 7.37-2.615 8.487-6.237h-3.41c-.78 1.83-2.678 3.107-4.912 3.107-2.923 0-5.326-2.193-5.59-5.06h17.228C24.084 12.92 24.1 13.25 24.1 13.59c0 5.75-4.48 10.41-11.914 10.41z"/>
        </svg>
      );
    case 'snapchat':
      return (
        <svg viewBox="0 0 24 24" width={size} height={size} fill={fill}>
          <path d="M12.001 0c-4.408 0-7.391 3.167-7.391 6.963 0 1.053.305 2.115.829 2.98.118.196.126.335.04.542-.116.279-.444.608-.946.953-.615.423-.889.712-.89 1.157 0 .394.271.741.979.948.337.098.749.167 1.155.195.14.009.24.103.24.244-.002.325-.098.857-.311 1.458-.291.821-.693 1.346-1.162 1.516-.54.195-.733.568-.733.84 0 .376.357.777 1.312.99 1.488.332 3.82.493 5.378.503h.001c.21 0 .37.16.37.37 0 .19-.13.34-.31.37-1.12.19-2.2.4-3.11.75-.43.16-.7.42-.7.71 0 .42.54.81 1.49 1.08 1.44.41 3.66.64 5.2.64 1.54 0 3.76-.23 5.2-.64.95-.27 1.49-.66 1.49-1.08 0-.29-.27-.55-.7-.71-.91-.35-1.99-.56-3.11-.75-.18-.03-.31-.18-.31-.37 0-.21.16-.37.37-.37h.001c1.558-.01 3.89-.171 5.378-.503.955-.213 1.312-.614 1.312-.99 0-.272-.193-.645-.733-.84-.469-.17-.871-.695-1.162-1.516-.213-.601-.309-1.133-.311-1.458 0-.141.1-.235.24-.244.406-.028.818-.097 1.155-.195.708-.207.979-.554.979-.948-.001-.445-.275-.734-.89-1.157-.502-.345-.83-.674-.946-.953-.086-.207-.078-.346.04-.542.524-.865.829-1.927.829-2.98 0-3.796-2.983-6.963-7.391-6.963z"/>
        </svg>
      );
    case 'discord':
      return (
        <svg viewBox="0 0 24 24" width={size} height={size} fill={fill}>
          <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.893.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
        </svg>
      );
    case 'reddit':
      return (
        <svg viewBox="0 0 24 24" width={size} height={size} fill={fill}>
          <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.197-2.512-.73a.326.326 0 0 0-.232-.095z"/>
        </svg>
      );
    case 'custom':
    default:
      return (
        <svg viewBox="0 0 24 24" width={size} height={size} fill={fill}>
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
        </svg>
      );
  }
}

/**
 * 🌟 Circular Badge Social Row matching user reference image:
 * Features customizable: iconColor, bgColor, borderColor, and official colors preset!
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
  const iconColor = st.iconColor || '#1e293b';
  const bgColor = st.bgColor || '#ffffff';
  const borderColor = st.borderColor || '#cbd5e1';

  return (
    <div className={`ft-universal-socials ${className}`} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      {links.map((item, idx) => {
        const platform = (item.platform || 'facebook').toLowerCase();
        const thisIconColor = isOfficial ? (OFFICIAL_COLORS[platform] || iconColor) : iconColor;
        const thisBgColor = bgColor;
        const thisBorderColor = borderColor;

        return (
          <a
            key={idx}
            href={item.url}
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
              transition: 'all 0.2s ease',
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
  const phone = f.phone || settings?.phone || '+880 1878-374762';
  const hours = f.phoneHours || '9 AM - 8 PM';
  const email = f.email || 'support@' + (typeof window !== 'undefined' ? window.location.hostname.replace(/^www\./, '') : 'store.com');
  const address = f.address || 'House-14/16, Road-4, Block-D, Dhaka Uddan, Mohammadpur, Dhaka';
  const about = f.aboutText || `${name} - Premium watches, sunglasses and curated lifestyle collections crafted for everyday elegance and presence.`;
  const cols = Array.isArray(f.columns) && f.columns.length > 0 ? f.columns : DEFAULT_COLUMNS;
  const col1 = cols[0] || DEFAULT_COLUMNS[0];
  const col2 = cols[1] || DEFAULT_COLUMNS[1];

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
            <RenderSocialRow footer={f} size={36} iconSize={17} />
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
  const [newsEmail, setNewsEmail] = useState('');
  const [subbed, setSubbed] = useState(false);
  const cols = Array.isArray(f.columns) && f.columns.length > 0 ? f.columns : DEFAULT_COLUMNS;
  const col1 = cols[0] || DEFAULT_COLUMNS[0];
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

          {/* Connect (Universal Social Icons) */}
          <div className="ft-avora-col">
            <h5 className="ft-avora-title">Connect</h5>
            <RenderSocialRow footer={f} size={32} iconSize={15} />
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
  const [email, setEmail] = useState('');
  const [subbed, setSubbed] = useState(false);
  const phone = f.phone || settings?.phone || '+880 1878-374762';
  const emailAddr = f.email || 'info@' + (typeof window !== 'undefined' ? window.location.hostname.replace(/^www\./, '') : 'store.com');
  const address = f.address || '506 S. Washington Avenue, Dhaka, Bangladesh';
  const hours = f.phoneHours || 'Tues, Thurs, & Fri | 11AM-5PM\nWed & Sat | 11AM-7PM\nCLOSED SUNDAY & MONDAY';

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
            <RenderSocialRow footer={f} size={34} iconSize={16} />
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
  const [email, setEmail] = useState('');
  const [subbed, setSubbed] = useState(false);
  const cols = Array.isArray(f.columns) && f.columns.length > 0 ? f.columns : DEFAULT_COLUMNS;
  const col1 = cols[0] || DEFAULT_COLUMNS[0];
  const col2 = cols[1] || DEFAULT_COLUMNS[1];
  const col3 = cols[2] || DEFAULT_COLUMNS[2];

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
            <RenderSocialRow footer={f} size={34} iconSize={16} />
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
            <div style={{ marginTop: 18 }}>
              <RenderSocialRow footer={f} size={34} iconSize={16} />
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
