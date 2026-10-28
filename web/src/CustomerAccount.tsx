import { BD_GEO } from './bd-geo';
import React, { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  type Customer,
  getCustomerMe,
  sendCustomerOtp,
  verifyCustomerOtp,
  updateCustomerProfile,
  logoutCustomer,
  taka
} from './api';
import { useCart } from './cart';

// Context
type CustomerContextType = {
  customer: Customer | null;
  loading: boolean;
  authOpen: boolean;
  openAuth: () => void;
  closeAuth: () => void;
  refreshCustomer: () => Promise<void>;
  logout: () => Promise<void>;
};

const CustomerContext = createContext<CustomerContextType>({
  customer: null,
  loading: false,
  authOpen: false,
  openAuth: () => {},
  closeAuth: () => {},
  refreshCustomer: async () => {},
  logout: async () => {},
});

export const useCustomer = () => useContext(CustomerContext);

export function CustomerProvider({ children }: { children: ReactNode }) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [authOpen, setAuthOpen] = useState(false);

  const refreshCustomer = async () => {
    try {
      const me = await getCustomerMe();
      setCustomer(me);
    } catch {
      setCustomer(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshCustomer();
  }, []);

  const logout = async () => {
    await logoutCustomer();
    setCustomer(null);
  };

  return (
    <CustomerContext.Provider
      value={{
        customer,
        loading,
        authOpen,
        openAuth: () => setAuthOpen(true),
        closeAuth: () => setAuthOpen(false),
        refreshCustomer,
        logout,
      }}
    >
      {children}
      {authOpen && <CustomerAuthModal onClose={() => setAuthOpen(false)} />}
    </CustomerContext.Provider>
  );
}

// Minimalist Luxury Auth Modal (No Emoji Clutter)
export function CustomerAuthModal({ onClose }: { onClose: () => void }) {
  const { refreshCustomer } = useCustomer();
  const [step, setStep] = useState<'auth' | 'otp' | 'set_address'>('auth');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [countdown, setCountdown] = useState(0);

  // Set Address State (Popup after account creation/login)
  const [addrPhone, setAddrPhone] = useState('');
  const [addrDistrict, setAddrDistrict] = useState('');
  const [addrThana, setAddrThana] = useState('');
  const [addrStreet, setAddrStreet] = useState('');
  const [addrSaving, setAddrSaving] = useState(false);

  useEffect(() => {
    if (countdown > 0) {
      const t = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [countdown]);

  const handleSendOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError('');
    setNotice('');

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError('Please enter a valid email address (e.g. example@gmail.com)');
      return;
    }

    const cleanName = name.trim();
    if (!cleanName) {
      setError('Please enter your full name');
      return;
    }

    setBusy(true);
    try {
      const res = await sendCustomerOtp(cleanEmail, cleanName);
      setStep('otp');
      setCountdown(60);
      if (res.demoCode) {
        setNotice(`Verification code sent to ${cleanEmail}. (Test code: ${res.demoCode})`);
      } else {
        setNotice(res.message || `Verification code sent to ${cleanEmail}`);
      }
    } catch (err: any) {
      setError(err.message || 'Could not send verification code');
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!code.trim()) {
      setError('Please enter the 6-digit verification code');
      return;
    }
    setBusy(true);
    try {
      const cleanEmail = email.trim().toLowerCase();
      const res = await verifyCustomerOtp(cleanEmail, code.trim(), name.trim());
      await refreshCustomer();

      // Check if address needs to be set (new account or address not set yet)
      const hasAddress = res.customer?.savedAddress?.address && res.customer.savedAddress.address.trim().length > 0;
      if (!hasAddress) {
        setNotice('Account verified! Please set your delivery address below.');
        setStep('set_address');
      } else {
        onClose();
      }
    } catch (err: any) {
      setError(err.message || 'Invalid verification code');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setAddrSaving(true);
    try {
      const cleanPhone = addrPhone.replace(/\D/g, '').slice(-11);
      if (cleanPhone && !/^01[3-9]\d{8}$/.test(cleanPhone)) {
        setError('Please enter a valid 11-digit mobile number (01XXXXXXXXX)');
        setAddrSaving(false);
        return;
      }
      if (!addrStreet.trim()) {
        setError('Please enter your detailed delivery address');
        setAddrSaving(false);
        return;
      }

      await updateCustomerProfile({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: cleanPhone,
        savedAddress: {
          address: addrStreet.trim(),
          district: addrDistrict.trim(),
          thana: addrThana.trim(),
        },
      });
      await refreshCustomer();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Could not save address');
    } finally {
      setAddrSaving(false);
    }
  };

  const districts = Object.keys(BD_GEO).sort();
  const thanas = addrDistrict ? (BD_GEO[addrDistrict] || []) : [];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(9, 13, 22, 0.78)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: '#ffffff',
          color: '#111827',
          width: '100%',
          maxWidth: step === 'set_address' ? 480 : 440,
          borderRadius: 8,
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
          overflow: 'hidden',
          border: '1px solid #e5e7eb',
        }}
      >
        {/* Header Bar */}
        <div
          style={{
            padding: '24px 28px 20px',
            background: '#0f172a',
            color: '#f8fafc',
            position: 'relative',
          }}
        >
          <button
            onClick={onClose}
            style={{
              position: 'absolute',
              top: 18,
              right: 18,
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              fontSize: 22,
              lineHeight: 1,
              cursor: 'pointer',
            }}
            aria-label="Close"
          >
            &times;
          </button>
          <div style={{ fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#cbd5e1', marginBottom: 4 }}>
            {step === 'set_address' ? 'VIP DELIVERY SETUP' : 'METRROMA VIP Circle'}
          </div>
          <h3 style={{ margin: 0, fontSize: 20, fontFamily: 'var(--font-serif)', fontWeight: 500, color: '#ffffff' }}>
            {step === 'auth' ? 'Sign In or Create Account' : step === 'otp' ? 'Verify Email Address' : 'Set Your Delivery Address'}
          </h3>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: '#94a3b8', lineHeight: 1.4 }}>
            {step === 'auth'
              ? 'Enter your name and email to receive your 6-digit verification code.'
              : step === 'otp'
              ? `Verification code sent to ${email}`
              : 'Please enter your delivery address. No address is preset.'}
          </p>
        </div>

        {/* Form Body */}
        <div style={{ padding: '24px 28px' }}>
          {error && (
            <div
              style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#991b1b',
                padding: '10px 14px',
                borderRadius: 6,
                fontSize: 13,
                marginBottom: 16,
              }}
            >
              {error}
            </div>
          )}

          {notice && (
            <div
              style={{
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                color: '#166534',
                padding: '10px 14px',
                borderRadius: 6,
                fontSize: 13,
                marginBottom: 16,
              }}
            >
              {notice}
            </div>
          )}

          {step === 'auth' ? (
            <form onSubmit={handleSendOtp}>
              {/* Full Name */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#475569', marginBottom: 6 }}>
                  Full Name <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="Enter your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={{
                    width: '100%',
                    border: '1px solid #cbd5e1',
                    borderRadius: 6,
                    padding: '10px 12px',
                    fontSize: 14,
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Email Address */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#475569', marginBottom: 6 }}>
                  Email Address <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <input
                  type="email"
                  required
                  placeholder="example@gmail.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={{
                    width: '100%',
                    border: '1px solid #cbd5e1',
                    borderRadius: 6,
                    padding: '10px 12px',
                    fontSize: 14,
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 6,
                  padding: '12px 14px',
                  marginBottom: 20,
                  fontSize: 12,
                  color: '#334155',
                  lineHeight: 1.5,
                }}
              >
                <strong style={{ color: '#0f172a' }}>VIP Privileges:</strong>
                <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                  <li>Instant 1-click email OTP verification</li>
                  <li>5% off voucher applied to your account</li>
                  <li>Fast checkout with your custom saved address</li>
                  <li>Live order status & delivery tracking</li>
                </ul>
              </div>

              <button
                type="submit"
                disabled={busy}
                style={{
                  width: '100%',
                  background: '#0f172a',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 6,
                  padding: '12px 16px',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: busy ? 'not-allowed' : 'pointer',
                  opacity: busy ? 0.7 : 1,
                  transition: 'background 0.2s',
                }}
              >
                {busy ? 'Sending verification code...' : 'Continue with Email Verification'}
              </button>
            </form>
          ) : step === 'otp' ? (
            <form onSubmit={handleVerifyOtp}>
              <div style={{ marginBottom: 18 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#475569', marginBottom: 6 }}>
                  Email Verification Code
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  maxLength={6}
                  placeholder="Enter 6-digit code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  style={{
                    width: '100%',
                    border: '1px solid #cbd5e1',
                    borderRadius: 6,
                    padding: '12px 14px',
                    fontSize: 20,
                    letterSpacing: '0.35em',
                    textAlign: 'center',
                    fontWeight: 700,
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={busy}
                style={{
                  width: '100%',
                  background: '#0f172a',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 6,
                  padding: '12px 16px',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: busy ? 'not-allowed' : 'pointer',
                  opacity: busy ? 0.7 : 1,
                  marginBottom: 14,
                }}
              >
                {busy ? 'Verifying...' : 'Verify & Open Account'}
              </button>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                <button
                  type="button"
                  onClick={() => { setStep('auth'); setCode(''); setError(''); }}
                  style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: 0 }}
                >
                  &larr; Change Details
                </button>
                <button
                  type="button"
                  disabled={busy || countdown > 0}
                  onClick={() => handleSendOtp()}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: countdown > 0 ? '#94a3b8' : '#0f172a',
                    fontWeight: 600,
                    cursor: countdown > 0 ? 'default' : 'pointer',
                    padding: 0,
                  }}
                >
                  {countdown > 0 ? `Resend in ${countdown}s` : 'Resend code'}
                </button>
              </div>
            </form>
          ) : (
            /* Step 3: Pop-up to Set Your Address */
            <form onSubmit={handleSaveAddress}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#475569', marginBottom: 6 }}>
                  Contact Phone Number <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <div style={{ display: 'flex' }}>
                  <span
                    style={{
                      background: '#f1f5f9',
                      border: '1px solid #cbd5e1',
                      borderRight: 'none',
                      borderRadius: '6px 0 0 6px',
                      padding: '10px 12px',
                      fontSize: 14,
                      color: '#475569',
                      fontWeight: 600,
                    }}
                  >
                    +88
                  </span>
                  <input
                    type="tel"
                    required
                    autoFocus
                    placeholder="01XXXXXXXXX"
                    value={addrPhone}
                    onChange={(e) => setAddrPhone(e.target.value)}
                    style={{
                      flex: 1,
                      border: '1px solid #cbd5e1',
                      borderRadius: '0 6px 6px 0',
                      padding: '10px 12px',
                      fontSize: 14,
                      outline: 'none',
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#475569', marginBottom: 6 }}>
                    District (Zilla)
                  </label>
                  <select
                    value={addrDistrict}
                    onChange={(e) => {
                      setAddrDistrict(e.target.value);
                      setAddrThana('');
                    }}
                    style={{
                      width: '100%',
                      border: '1px solid #cbd5e1',
                      borderRadius: 6,
                      padding: '10px 10px',
                      fontSize: 13.5,
                      background: '#ffffff',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  >
                    <option value="">-- Select District --</option>
                    {districts.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#475569', marginBottom: 6 }}>
                    Thana / Upazila
                  </label>
                  {thanas.length > 0 ? (
                    <select
                      value={addrThana}
                      onChange={(e) => setAddrThana(e.target.value)}
                      style={{
                        width: '100%',
                        border: '1px solid #cbd5e1',
                        borderRadius: 6,
                        padding: '10px 10px',
                        fontSize: 13.5,
                        background: '#ffffff',
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    >
                      <option value="">-- Select Thana --</option>
                      {thanas.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      placeholder="e.g. Dhanmondi, Mirpur"
                      value={addrThana}
                      onChange={(e) => setAddrThana(e.target.value)}
                      style={{
                        width: '100%',
                        border: '1px solid #cbd5e1',
                        borderRadius: 6,
                        padding: '10px 12px',
                        fontSize: 13.5,
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                  )}
                </div>
              </div>

              {/* Full Address */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#475569', marginBottom: 6 }}>
                  Full Delivery Address <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <textarea
                  required
                  rows={2}
                  placeholder="House / Flat No, Road, Area, Landmark"
                  value={addrStreet}
                  onChange={(e) => setAddrStreet(e.target.value)}
                  style={{
                    width: '100%',
                    border: '1px solid #cbd5e1',
                    borderRadius: 6,
                    padding: '10px 12px',
                    fontSize: 13.5,
                    outline: 'none',
                    boxSizing: 'border-box',
                    resize: 'vertical',
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={addrSaving}
                style={{
                  width: '100%',
                  background: '#0f172a',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 6,
                  padding: '12px 16px',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: addrSaving ? 'not-allowed' : 'pointer',
                  opacity: addrSaving ? 0.7 : 1,
                  marginBottom: 10,
                }}
              >
                {addrSaving ? 'Saving Address...' : 'Save Address & Finish'}
              </button>

              <button
                type="button"
                onClick={onClose}
                style={{
                  width: '100%',
                  background: 'none',
                  border: 'none',
                  color: '#64748b',
                  fontSize: 13,
                  cursor: 'pointer',
                  padding: '8px 0',
                }}
              >
                Skip for now & browse store
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

// Clean SVG User Icon Button for Header
export function CustomerHeaderIcon({ onNavigate }: { onNavigate: (path: string) => void }) {
  const { customer, openAuth } = useCustomer();

  return (
    <button
      className="tabaya-h-btn"
      onClick={() => {
        if (customer) onNavigate('account');
        else openAuth();
      }}
      aria-label={customer ? 'My Account' : 'Sign In'}
      title={customer ? (customer.name || customer.phone) : 'Sign In / VIP Club'}
      style={{ position: 'relative' }}
    >
      <svg
        width="19"
        height="19"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
      {customer && (
        <span
          style={{
            position: 'absolute',
            top: 6,
            right: 6,
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: '#10b981',
          }}
        />
      )}
    </button>
  );
}

// Full Customer Account Page
export function CustomerAccountPage({ onNavigate }: { onNavigate: (path: string) => void }) {
  const { customer, loading, openAuth, logout, refreshCustomer } = useCustomer();
  const [activeTab, setActiveTab] = useState<'orders' | 'address'>('orders');
  const [addressForm, setAddressForm] = useState({
    name: '',
    email: '',
    address: '',
    district: '',
    thana: '',
  });
  const [addrSaving, setAddrSaving] = useState(false);
  const [addrNotice, setAddrNotice] = useState('');
  const [copiedVoucher, setCopiedVoucher] = useState(false);

  useEffect(() => {
    if (customer) {
      setAddressForm({
        name: customer.name || '',
        email: customer.email || '',
        address: customer.savedAddress?.address || '',
        district: customer.savedAddress?.district || '',
        thana: customer.savedAddress?.thana || '',
      });
    }
  }, [customer]);

  if (loading) {
    return (
      <div className="wrap" style={{ padding: '80px 24px', textAlign: 'center' }}>
        <p style={{ color: '#64748b' }}>Loading account details...</p>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="wrap" style={{ padding: '90px 24px', maxWidth: 540, margin: '0 auto', textAlign: 'center' }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </div>
        <h2 className="serif" style={{ fontSize: 28, margin: '0 0 8px' }}>VIP Customer Account</h2>
        <p style={{ color: '#64748b', fontSize: 14, marginBottom: 24, lineHeight: 1.6 }}>
          Sign in or create an account with your mobile number to view past orders, live delivery tracking, and access your 5% welcome discount.
        </p>
        <button
          className="btn"
          onClick={openAuth}
          style={{ width: '100%', maxWidth: 300, margin: '0 auto' }}
        >
          Sign In / Create Account
        </button>
      </div>
    );
  }

  const handleSaveAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddrSaving(true);
    setAddrNotice('');
    try {
      await updateCustomerProfile({
        name: addressForm.name,
        email: addressForm.email,
        savedAddress: {
          address: addressForm.address,
          district: addressForm.district,
          thana: addressForm.thana,
        },
      });
      await refreshCustomer();
      setAddrNotice('Saved successfully. This address will auto-fill at checkout.');
      setTimeout(() => setAddrNotice(''), 4000);
    } catch (err: any) {
      setAddrNotice(err.message || 'Could not save address');
    } finally {
      setAddrSaving(false);
    }
  };

  const copyVoucherCode = () => {
    navigator.clipboard.writeText('WELCOME5');
    setCopiedVoucher(true);
    setTimeout(() => setCopiedVoucher(false), 3000);
  };

  return (
    <div className="wrap" style={{ padding: '40px 24px 80px', maxWidth: 960, margin: '0 auto' }}>
      {/* Profile Overview Card */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: 8,
          border: '1px solid #e2e8f0',
          padding: '24px 28px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 20,
          marginBottom: 24,
          boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: '50%',
              background: '#0f172a',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 20,
              fontFamily: 'var(--font-serif)',
              fontWeight: 600,
            }}
          >
            {(customer.name || 'V').slice(0, 1).toUpperCase()}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: '#0f172a' }}>
                {customer.name || 'VIP Member'}
              </h2>
              <span
                style={{
                  background: '#f1f5f9',
                  color: '#475569',
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: 4,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                {customer.tier || 'VIP Member'}
              </span>
            </div>
            <div style={{ fontSize: 13, color: '#64748b', marginTop: 3 }}>
              +88 {customer.phone} {customer.email ? `· ${customer.email}` : ''}
            </div>
          </div>
        </div>

        <button
          onClick={logout}
          style={{
            background: 'none',
            border: '1px solid #cbd5e1',
            borderRadius: 6,
            padding: '8px 16px',
            fontSize: 13,
            color: '#475569',
            cursor: 'pointer',
            transition: 'border-color 0.2s',
          }}
        >
          Sign Out
        </button>
      </div>

      {/* Welcome Voucher Banner */}
      {customer.firstOrderDiscountAvailable ? (
        <div
          style={{
            background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
            color: '#ffffff',
            borderRadius: 8,
            padding: '18px 24px',
            marginBottom: 24,
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <div>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#94a3b8' }}>
              Welcome Offer For New Accounts
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, marginTop: 2 }}>
              5% Discount on your First Order
            </div>
            <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 2 }}>
              Valid for single use at checkout. Code auto-applies when checking out.
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              style={{
                background: 'rgba(255, 255, 255, 0.1)',
                border: '1px dashed rgba(255, 255, 255, 0.3)',
                borderRadius: 4,
                padding: '6px 14px',
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: '0.1em',
              }}
            >
              WELCOME5
            </span>
            <button
              onClick={copyVoucherCode}
              style={{
                background: '#ffffff',
                color: '#0f172a',
                border: 'none',
                borderRadius: 4,
                padding: '7px 14px',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {copiedVoucher ? 'Copied!' : 'Copy Code'}
            </button>
          </div>
        </div>
      ) : null}

      {/* Tabs Navigation */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid #e2e8f0',
          marginBottom: 24,
          gap: 24,
        }}
      >
        <button
          onClick={() => setActiveTab('orders')}
          style={{
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'orders' ? '2px solid #0f172a' : '2px solid transparent',
            padding: '10px 4px',
            fontSize: 14,
            fontWeight: activeTab === 'orders' ? 600 : 500,
            color: activeTab === 'orders' ? '#0f172a' : '#64748b',
            cursor: 'pointer',
          }}
        >
          My Orders ({customer.orders?.length || 0})
        </button>
        <button
          onClick={() => setActiveTab('address')}
          style={{
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'address' ? '2px solid #0f172a' : '2px solid transparent',
            padding: '10px 4px',
            fontSize: 14,
            fontWeight: activeTab === 'address' ? 600 : 500,
            color: activeTab === 'address' ? '#0f172a' : '#64748b',
            cursor: 'pointer',
          }}
        >
          Saved Delivery Address
        </button>
      </div>

      {/* Tab: Orders */}
      {activeTab === 'orders' && (
        <div>
          {(!customer.orders || customer.orders.length === 0) ? (
            <div
              style={{
                background: '#ffffff',
                borderRadius: 8,
                border: '1px solid #e2e8f0',
                padding: '48px 24px',
                textAlign: 'center',
              }}
            >
              <p style={{ color: '#64748b', fontSize: 14, margin: '0 0 16px' }}>
                You have not placed any orders with this number yet.
              </p>
              <button
                className="btn"
                onClick={() => onNavigate('shop')}
              >
                Explore Collections
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {customer.orders.map((o) => {
                const statusColor =
                  o.status === 'delivered' ? '#166534' :
                  o.status === 'shipped' ? '#1e40af' :
                  o.status === 'confirmed' ? '#854d0e' : '#475569';
                const statusBg =
                  o.status === 'delivered' ? '#f0fdf4' :
                  o.status === 'shipped' ? '#eff6ff' :
                  o.status === 'confirmed' ? '#fefce8' : '#f1f5f9';

                return (
                  <div
                    key={o.id}
                    style={{
                      background: '#ffffff',
                      borderRadius: 8,
                      border: '1px solid #e2e8f0',
                      padding: '20px 24px',
                      boxShadow: '0 1px 4px rgba(0,0,0,0.02)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, borderBottom: '1px solid #f1f5f9', paddingBottom: 14, marginBottom: 14 }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 15, color: '#0f172a' }}>
                          Order #{o.id}
                        </div>
                        <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                          Placed on {new Date(o.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span
                          style={{
                            background: statusBg,
                            color: statusColor,
                            fontSize: 12,
                            fontWeight: 600,
                            padding: '3px 10px',
                            borderRadius: 4,
                            textTransform: 'capitalize',
                          }}
                        >
                          {o.status}
                        </span>
                        <button
                          onClick={() => onNavigate(`track?id=${o.id}&phone=${customer.phone}`)}
                          style={{
                            background: 'none',
                            border: '1px solid #cbd5e1',
                            borderRadius: 4,
                            padding: '4px 10px',
                            fontSize: 12,
                            color: '#334155',
                            cursor: 'pointer',
                          }}
                        >
                          Live Track
                        </button>
                      </div>
                    </div>

                    {/* Order Items */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {o.items?.map((item: any, idx: number) => (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            {item.image && (
                              <img
                                src={item.image}
                                alt={item.name}
                                style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 4 }}
                              />
                            )}
                            <div>
                              <div style={{ fontWeight: 500, color: '#1e293b' }}>{item.name}</div>
                              <div style={{ fontSize: 12, color: '#64748b' }}>Qty: {item.qty}</div>
                            </div>
                          </div>
                          <div style={{ fontWeight: 600, color: '#0f172a' }}>
                            {taka(item.price * item.qty)}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Order Footer */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, paddingTop: 12, borderTop: '1px solid #f8fafc', fontSize: 13 }}>
                      <div style={{ color: '#64748b' }}>
                        {o.courier?.name ? `Courier: ${o.courier.name}` : 'Cash on Delivery'}
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
                        Total: {taka(o.total)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab: Saved Address */}
      {activeTab === 'address' && (
        <div
          style={{
            background: '#ffffff',
            borderRadius: 8,
            border: '1px solid #e2e8f0',
            padding: '24px 28px',
          }}
        >
          <h3 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 6px', color: '#0f172a' }}>
            Default Delivery Information
          </h3>
          <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 20px' }}>
            Save your primary delivery location once. The checkout form will automatically pre-fill these details for one-click ordering.
          </p>

          {addrNotice && (
            <div
              style={{
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                color: '#166534',
                padding: '10px 14px',
                borderRadius: 6,
                fontSize: 13,
                marginBottom: 18,
              }}
            >
              {addrNotice}
            </div>
          )}

          <form onSubmit={handleSaveAddress}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>
                  Full Name
                </label>
                <input
                  type="text"
                  value={addressForm.name}
                  onChange={(e) => setAddressForm({ ...addressForm, name: e.target.value })}
                  style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: 6, padding: '10px 12px', fontSize: 14, boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>
                  Email Address
                </label>
                <input
                  type="email"
                  placeholder="name@example.com"
                  value={addressForm.email}
                  onChange={(e) => setAddressForm({ ...addressForm, email: e.target.value })}
                  style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: 6, padding: '10px 12px', fontSize: 14, boxSizing: 'border-box' }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>
                  District (জেলা)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Dhaka, Chittagong"
                  value={addressForm.district}
                  onChange={(e) => setAddressForm({ ...addressForm, district: e.target.value })}
                  style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: 6, padding: '10px 12px', fontSize: 14, boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>
                  Thana / Area (থানা)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Dhanmondi, Mirpur"
                  value={addressForm.thana}
                  onChange={(e) => setAddressForm({ ...addressForm, thana: e.target.value })}
                  style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: 6, padding: '10px 12px', fontSize: 14, boxSizing: 'border-box' }}
                />
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>
                Street Address / House & Road Details
              </label>
              <textarea
                rows={2}
                placeholder="House #, Road #, Area..."
                value={addressForm.address}
                onChange={(e) => setAddressForm({ ...addressForm, address: e.target.value })}
                style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: 6, padding: '10px 12px', fontSize: 14, boxSizing: 'border-box' }}
              />
            </div>

            <button
              type="submit"
              disabled={addrSaving}
              style={{
                background: '#0f172a',
                color: '#ffffff',
                border: 'none',
                borderRadius: 6,
                padding: '10px 20px',
                fontSize: 14,
                fontWeight: 600,
                cursor: addrSaving ? 'not-allowed' : 'pointer',
              }}
            >
              {addrSaving ? 'Saving...' : 'Save Delivery Details'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
