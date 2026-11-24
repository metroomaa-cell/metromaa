import React, { useState, useEffect, useRef } from 'react';

export interface AdminTopNavbarProps {
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  onSearchClick?: () => void;
  onNewOrderClick: () => void;
  onWebOrderListClick: () => void;
  onOrderListClick: () => void;
  onSendMessageClick: (channel?: string) => void;
  onExportCsvClick?: () => void;
  onImportCsvClick?: () => void;
  onAiClick: () => void;
  adminLanguage: 'en' | 'bn';
  onLanguageToggle: () => void;
  adminTheme: 'dark' | 'light';
  onThemeToggle: () => void;
  notificationCount: number;
  onNotificationClick: () => void;
  user: any;
  onViewStore: () => void;
  onLogout: () => void;
}

function SmartNavSearchBar({
  query = '',
  onChange,
  onActivate,
}: {
  query?: string;
  onChange?: (q: string) => void;
  onActivate?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const isExpanded = expanded || !!query;

  const handleActivate = () => {
    setExpanded(true);
    setTimeout(() => inputRef.current?.focus(), 60);
    onActivate?.();
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        handleActivate();
      } else if (e.key === 'Escape' && isExpanded) {
        if (!query) {
          setExpanded(false);
          inputRef.current?.blur();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isExpanded, query]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        if (!query) {
          setExpanded(false);
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [query]);

  return (
    <div
      ref={wrapRef}
      className={`sa-smart-nav-search ${isExpanded ? 'is-expanded' : ''}`}
      onClick={() => {
        if (!isExpanded) handleActivate();
      }}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        height: 34,
        width: isExpanded ? 280 : 96,
        padding: isExpanded ? '0 10px 0 12px' : '0 12px',
        borderRadius: 20,
        background: isExpanded ? 'rgba(20, 16, 34, 0.96)' : 'rgba(139, 92, 246, 0.12)',
        border: isExpanded ? '1px solid rgba(167, 139, 250, 0.65)' : '1px solid rgba(139, 92, 246, 0.28)',
        boxShadow: isExpanded
          ? '0 0 16px rgba(139, 92, 246, 0.35), inset 0 1px 2px rgba(0,0,0,0.5)'
          : 'none',
        transition: 'all 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
        cursor: isExpanded ? 'text' : 'pointer',
        boxSizing: 'border-box',
        flexShrink: 0,
      }}
    >
      <svg
        viewBox="0 0 24 24"
        width={15}
        height={15}
        fill="none"
        stroke={isExpanded ? '#c4b5fd' : '#a78bfa'}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ flexShrink: 0, transition: 'stroke 0.2s ease' }}
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>

      {!isExpanded ? (
        <span
          style={{
            marginLeft: 7,
            color: '#c4b5fd',
            fontSize: 13,
            fontWeight: 600,
            whiteSpace: 'nowrap',
            userSelect: 'none',
            letterSpacing: '0.01em',
          }}
        >
          Search
        </span>
      ) : (
        <>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => onChange?.(e.target.value)}
            placeholder="Search ID, customer, phone, SKU…"
            style={{
              flex: 1,
              minWidth: 0,
              marginLeft: 8,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#ffffff',
              fontSize: 12.5,
              fontWeight: 500,
            }}
            autoFocus
          />
          {query ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange?.('');
                inputRef.current?.focus();
              }}
              title="Clear search"
              style={{
                background: 'rgba(255, 255, 255, 0.12)',
                border: 'none',
                color: '#cbd5e1',
                borderRadius: '50%',
                width: 18,
                height: 18,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                fontSize: 11,
                lineHeight: 1,
                marginLeft: 4,
                flexShrink: 0,
              }}
            >
              ✕
            </button>
          ) : (
            <span
              style={{
                fontSize: 10,
                color: '#64748b',
                background: 'rgba(255,255,255,0.06)',
                padding: '1px 5px',
                borderRadius: 4,
                marginLeft: 4,
                flexShrink: 0,
                fontFamily: 'monospace',
                userSelect: 'none',
              }}
            >
              ESC
            </span>
          )}
        </>
      )}
    </div>
  );
}

export function AdminTopNavbar({
  searchQuery = '',
  onSearchChange,
  onSearchClick,
  onNewOrderClick,
  onWebOrderListClick,
  onOrderListClick,
  onSendMessageClick,
  onExportCsvClick,
  onImportCsvClick,
  onAiClick,
  adminLanguage,
  onLanguageToggle,
  adminTheme,
  onThemeToggle,
  notificationCount,
  onNotificationClick,
  user,
  onViewStore,
  onLogout,
}: AdminTopNavbarProps) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [messageOpen, setMessageOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const messageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
      if (noticeRef.current && !noticeRef.current.contains(e.target as Node)) {
        setNoticeOpen(false);
      }
      if (feedbackRef.current && !feedbackRef.current.contains(e.target as Node)) {
        setFeedbackOpen(false);
      }
      if (messageRef.current && !messageRef.current.contains(e.target as Node)) {
        setMessageOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const userName = user?.name || user?.username || 'Owner';
  const userRole = user?.role || 'Admin';
  const initial = userName.charAt(0).toUpperCase();

  return (
    <header className="sa-top-navbar" role="banner">
      {/* Left side: Quick Search + Quick Navigation Links */}
      <div className="sa-top-nav-left">
        {/* Smart Animated Search Bar */}
        <SmartNavSearchBar
          query={searchQuery}
          onChange={onSearchChange}
          onActivate={onSearchClick}
        />

        {/* New Order */}
        <button
          type="button"
          className="sa-nav-link-btn"
          onClick={onNewOrderClick}
          title="Create New Order (Phone / WhatsApp)"
        >
          <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="9" cy="21" r="1" />
            <circle cx="20" cy="21" r="1" />
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
          </svg>
          <span>New Order</span>
        </button>

        {/* Web Order List */}
        <button
          type="button"
          className="sa-nav-link-btn"
          onClick={onWebOrderListClick}
          title="Web Orders (Storefront & Landing Funnels)"
        >
          <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
          <span>Web Order List</span>
        </button>

        {/* Order List */}
        <button
          type="button"
          className="sa-nav-link-btn"
          onClick={onOrderListClick}
          title="All Approved Orders"
        >
          <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="8" y1="6" x2="21" y2="6" />
            <line x1="8" y1="12" x2="21" y2="12" />
            <line x1="8" y1="18" x2="21" y2="18" />
            <line x1="3" y1="6" x2="3.01" y2="6" />
            <line x1="3" y1="12" x2="3.01" y2="12" />
            <line x1="3" y1="18" x2="3.01" y2="18" />
          </svg>
          <span>Order List</span>
        </button>

        {/* Send Message with Quick Channels Dropdown */}
        <div className="sa-nav-dropdown-wrap" ref={messageRef} style={{ position: 'relative' }}>
          <button
            type="button"
            className="sa-nav-link-btn"
            onClick={() => {
              setMessageOpen((v) => !v);
              onSendMessageClick?.();
            }}
            title="Send Message — WhatsApp, SMS Marketing, Webmail"
          >
            <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <span>Send Message</span>
          </button>
          {messageOpen && (
            <div className="sa-nav-dropdown" style={{ width: 230, left: 0, top: '100%', marginTop: 6, zIndex: 1000 }}>
              <div style={{ padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.08)', fontWeight: 700, fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Messaging Channels
              </div>
              <div style={{ padding: 4 }}>
                <button
                  type="button"
                  onClick={() => {
                    setMessageOpen(false);
                    onSendMessageClick?.('whatsapp');
                  }}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '8px 12px', background: 'transparent', border: 'none', color: '#cbd5e1', fontSize: 12.5, borderRadius: 6, cursor: 'pointer', textAlign: 'left' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <span style={{ fontSize: 15 }}>💬</span>
                  <div>
                    <div style={{ color: '#fff', fontWeight: 600 }}>WhatsApp Automation</div>
                    <div style={{ fontSize: 10.5, color: '#94a3b8' }}>Auto-replies & chat</div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMessageOpen(false);
                    onSendMessageClick?.('message_marketing');
                  }}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '8px 12px', background: 'transparent', border: 'none', color: '#cbd5e1', fontSize: 12.5, borderRadius: 6, cursor: 'pointer', textAlign: 'left' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <span style={{ fontSize: 15 }}>📱</span>
                  <div>
                    <div style={{ color: '#fff', fontWeight: 600 }}>Message Marketing</div>
                    <div style={{ fontSize: 10.5, color: '#94a3b8' }}>Bulk SMS & campaigns</div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMessageOpen(false);
                    onSendMessageClick?.('emails');
                  }}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '8px 12px', background: 'transparent', border: 'none', color: '#cbd5e1', fontSize: 12.5, borderRadius: 6, cursor: 'pointer', textAlign: 'left' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <span style={{ fontSize: 15 }}>✉️</span>
                  <div>
                    <div style={{ color: '#fff', fontWeight: 600 }}>Business Webmail</div>
                    <div style={{ fontSize: 10.5, color: '#94a3b8' }}>Inboxes & replies</div>
                  </div>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Export CSV */}
        <button
          type="button"
          className="sa-nav-link-btn"
          onClick={onExportCsvClick}
          title="Export orders as CSV"
        >
          <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          <span>Export CSV</span>
        </button>

        {/* Import Excel / CSV */}
        <button
          type="button"
          className="sa-nav-link-btn"
          onClick={onImportCsvClick}
          title="Import orders from Excel (.xlsx) or CSV"
        >
          <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <span>Import Excel / CSV</span>
        </button>
      </div>

      {/* Right side: Language, AI, Notifications, Theme, Profile */}
      <div className="sa-top-nav-right">
        {/* Language Switch */}
        <button
          type="button"
          className="sa-nav-lang-btn"
          onClick={onLanguageToggle}
          title={adminLanguage === 'en' ? 'বাংলা ভাষায় পরিবর্তন করুন' : 'Switch to English'}
        >
          <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m5 8 6 6" />
            <path d="m4 14 6-6 2-3" />
            <path d="M2 5h12" />
            <path d="M7 2h1" />
            <path d="m22 22-5-10-5 10" />
            <path d="M14 18h6" />
          </svg>
          <span>{adminLanguage === 'bn' ? 'BN' : 'EN'}</span>
        </button>

        {/* Ask Saika AI Command Pill */}
        <button
          type="button"
          className="sa-nav-ai-btn"
          onClick={onAiClick}
          title="Ask Saika — আপনার পার্সোনাল ভয়েস এআই বিজনেস অ্যাসিস্ট্যান্ট"
        >
          <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="#c084fc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3z" />
            <circle cx="19" cy="5" r="1.5" fill="#c084fc" stroke="none" />
          </svg>
          <span>Ask Saika</span>
        </button>

        {/* Announcements / Megaphone */}
        <div className="sa-nav-dropdown-wrap" ref={noticeRef} style={{ position: 'relative' }}>
          <button
            type="button"
            className="sa-nav-icon-btn"
            onClick={() => setNoticeOpen((v) => !v)}
            title="System Announcements & Updates"
          >
            <svg viewBox="0 0 24 24" width={17} height={17} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m3 11 18-5v12L3 14v-3z" />
              <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
            </svg>
          </button>
          {noticeOpen && (
            <div className="sa-nav-dropdown" style={{ width: 280, right: 0 }}>
              <div style={{ padding: '8px 12px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)', fontWeight: 700, fontSize: 13, color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>📢</span>
                <span>Announcements</span>
              </div>
              <div style={{ padding: '12px', fontSize: 12.5, color: '#cbd5e1', lineHeight: 1.5 }}>
                <div style={{ padding: '8px 10px', background: 'rgba(167, 139, 250, 0.08)', borderRadius: 8, border: '1px solid rgba(167, 139, 250, 0.2)', marginBottom: 8 }}>
                  <strong style={{ color: '#c4b5fd', display: 'block', marginBottom: 2 }}>⚡ Fast Courier Sync Active</strong>
                  Pathao, SteadFast ও CarryBee এপিআই সিন্ক্রোনাইজেশন চালু আছে।
                </div>
                <div style={{ padding: '8px 10px', background: 'rgba(34, 197, 94, 0.08)', borderRadius: 8, border: '1px solid rgba(34, 197, 94, 0.2)' }}>
                  <strong style={{ color: '#4ade80', display: 'block', marginBottom: 2 }}>📧 Business Webmail Live</strong>
                  ইনবাউন্ড ইমেইল রিসিভিং এবং রিপ্লাই ১০০% লাইভ।
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Feedback / Support */}
        <div className="sa-nav-dropdown-wrap" ref={feedbackRef} style={{ position: 'relative' }}>
          <button
            type="button"
            className="sa-nav-icon-btn"
            onClick={() => setFeedbackOpen((v) => !v)}
            title="Feedback & Support"
          >
            <svg viewBox="0 0 24 24" width={17} height={17} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </button>
          {feedbackOpen && (
            <div className="sa-nav-dropdown" style={{ width: 280, right: 0 }}>
              <div style={{ padding: '8px 12px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)', fontWeight: 700, fontSize: 13, color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>💬</span>
                <span>Feedback & Support</span>
              </div>
              <div style={{ padding: '12px', fontSize: 12.5, color: '#cbd5e1', lineHeight: 1.5 }}>
                <p style={{ margin: '0 0 10px' }}>সরাসরি সাপোর্ট বা ফিডব্যাকের জন্য আমাদের সাথে যোগাযোগ করুন:</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <a
                    href="https://wa.me/8801884179112"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)', color: '#4ade80', borderRadius: 6, textDecoration: 'none', fontSize: 12, fontWeight: 600 }}
                  >
                    <span>💬 WhatsApp Support</span>
                  </a>
                  <a
                    href="mailto:support@secrate.shop"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.25)', color: '#c4b5fd', borderRadius: 6, textDecoration: 'none', fontSize: 12, fontWeight: 600 }}
                  >
                    <span>📧 support@secrate.shop</span>
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Notification Bell with Badge */}
        <button
          type="button"
          className="sa-nav-icon-btn"
          onClick={onNotificationClick}
          title={notificationCount > 0 ? `${notificationCount} new alerts` : 'Notifications'}
        >
          <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
          </svg>
          {notificationCount > 0 && (
            <span className="sa-nav-badge">
              {notificationCount > 99 ? '99+' : notificationCount}
            </span>
          )}
        </button>

        {/* Dark / Light Theme Toggle */}
        <button
          type="button"
          className="sa-nav-icon-btn"
          onClick={onThemeToggle}
          title={adminTheme === 'dark' ? 'Switch to Light theme' : 'Switch to Dark theme'}
        >
          {adminTheme === 'dark' ? (
            <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
              <path d="M19 3v4" />
              <path d="M21 5h-4" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
            </svg>
          )}
        </button>

        {/* User Avatar & Dropdown */}
        <div className="sa-nav-dropdown-wrap" ref={profileRef} style={{ position: 'relative' }}>
          <button
            type="button"
            className="sa-nav-avatar-btn"
            onClick={() => setProfileOpen((v) => !v)}
            title={`${userName} (${userRole})`}
          >
            <div style={{
              width: 30,
              height: 30,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #a78bfa 0%, #6366f1 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              fontWeight: 700,
              fontSize: 12.5,
              border: '2px solid rgba(167, 139, 250, 0.45)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
              cursor: 'pointer'
            }}>
              {initial}
            </div>
          </button>

          {profileOpen && (
            <div className="sa-nav-dropdown" style={{ width: 220, right: 0 }}>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#f1f5f9' }}>{userName}</div>
                <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'capitalize' }}>{userRole}</div>
              </div>
              <div style={{ padding: 4 }}>
                <button
                  type="button"
                  onClick={() => {
                    setProfileOpen(false);
                    onViewStore();
                  }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 12px',
                    background: 'transparent',
                    border: 'none',
                    color: '#cbd5e1',
                    fontSize: 12.5,
                    borderRadius: 6,
                    cursor: 'pointer',
                    textAlign: 'left'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <span style={{ fontSize: 14 }}>↗</span>
                  <span>View Store</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setProfileOpen(false);
                    onLogout();
                  }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 12px',
                    background: 'transparent',
                    border: 'none',
                    color: '#f87171',
                    fontSize: 12.5,
                    borderRadius: 6,
                    cursor: 'pointer',
                    textAlign: 'left'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.12)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <span style={{ fontSize: 14 }}>🚪</span>
                  <span>Log out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
