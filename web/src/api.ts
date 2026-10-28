export type Category = {
  slug: string;
  name: string;
  parentSlug?: string;
  adult: boolean;
  blurb: string;
  image: string;
  noIndex?: boolean;
  seoExclude?: boolean;
  seoTitle?: string;
  seoDesc?: string;
  seoKeywords?: string;
};

export function isWellnessOrExcludedCategory(slugOrName?: string | null): boolean {
  const s = String(slugOrName || '').toLowerCase().trim();
  return s === 'wellness-corner' || s === 'warless-corner' || s === 'warlase-corner' || s.includes('wellness-corner') || s === 'adult' || s === 'intimate';
}

export function isWellnessOrExcludedProduct(p?: Partial<Product> | null): boolean {
  if (!p) return false;
  if (p.noIndex || p.seoExclude || p.adult) return true;
  if (isWellnessOrExcludedCategory(p.category) || isWellnessOrExcludedCategory(p.subCategory)) return true;
  return false;
}

export function autoDetectCategoryAndSub(name: string, currentMainCat = ''): { category: string; subCategory: string } {
  const n = String(name || '').toLowerCase();
  let cat = currentMainCat;
  if (!cat) {
    if (n.includes('baby') || n.includes('aveeno baby')) cat = 'baby-care';
    else if (n.includes('shampoo') || n.includes('conditioner') || n.includes('hair ') || n.includes('scalp') || n.includes('fino')) cat = 'hair-care';
    else if (n.includes('foundation') || n.includes('primer') || n.includes('concealer') || n.includes('lip tint') || n.includes('lipstick') || n.includes('mascara') || n.includes('eyeliner') || n.includes('blush') || n.includes('sheglam')) cat = 'makeup';
    else if (n.includes('deodorant') || n.includes('intimate') || n.includes('feminine') || n.includes('facial shaving') || n.includes('razor')) cat = 'femenine-care';
    else if (n.includes('beard') || n.includes('for men') || n.includes("men's")) cat = 'mens-care';
    else if (n.includes('supplement') || n.includes('tablet') || n.includes('omega') || n.includes('multivitamin')) cat = 'health-care';
    else if (n.includes('serum') || n.includes('sunscreen') || n.includes('spf') || n.includes('cleanser') || n.includes('face wash') || n.includes('toner') || n.includes('cream') || n.includes('ampoule') || n.includes('lotion') || n.includes('gel')) cat = 'beauty-care';
  }
  let sub = '';
  if (cat === 'beauty-care') {
    if (n.includes('body lotion') || n.includes('body milk')) sub = 'body-lotion-care';
    else if (n.includes('sunscreen') || n.includes('sun ') || n.includes('spf') || n.includes('uv ')) sub = 'sunscreen-sun-care';
    else if (n.includes('cleanser') || n.includes('cleansing') || n.includes('face wash') || n.includes('facewash') || n.includes('foam')) sub = 'cleanser-facewash';
    else if (n.includes('toner')) sub = 'toner-essence';
    else if (n.includes('eye cream')) sub = 'eye-care';
    else if (n.includes('mask') && !n.includes('hair')) sub = 'face-mask-pack';
    else if (n.includes('serum') || n.includes('ampoule') || n.includes('booster shot') || n.includes('essence')) sub = 'serum-ampoule';
    else if (n.includes('cream') || n.includes('gel') || n.includes('moistur')) sub = 'moisturizer-cream';
  } else if (cat === 'makeup') {
    if (n.includes('lip') || n.includes('tint') || n.includes('vaseline') || n.includes('balm')) sub = 'lip-makeup';
    else if (n.includes('mascara') || n.includes('liner') || n.includes('brow') || n.includes('eyeshadow')) sub = 'eye-makeup';
    else if (n.includes('foundation') || n.includes('primer') || n.includes('concealer') || n.includes('powder') || n.includes('blush')) sub = 'face-makeup';
  } else if (cat === 'hair-care') {
    if (n.includes('conditioner') || n.includes('shampoo')) sub = 'shampoo-conditioner';
    else if (n.includes('oil') || n.includes('tonic') || n.includes('serum')) sub = 'hair-oil-serum';
    else if (n.includes('mask') || n.includes('treatment')) sub = 'hair-mask-treatment';
  } else if (cat === 'baby-care') {
    if (n.includes('spf') || n.includes('sun') || n.includes('wash') || n.includes('shampoo')) sub = 'baby-sun-wash';
    else if (n.includes('lotion') || n.includes('cream')) sub = 'baby-lotion-cream';
  } else if (cat === 'femenine-care') {
    if (n.includes('razor') || n.includes('shav')) sub = 'womens-grooming-razor';
    else if (n.includes('deodorant') || n.includes('wash') || n.includes('hygiene')) sub = 'intimate-deodorant-hygiene';
  } else if (cat === 'mens-care') {
    if (n.includes('beard') || n.includes('shav')) sub = 'mens-grooming-beard';
    else sub = 'mens-facewash-skincare';
  } else if (cat === 'health-care') {
    if (n.includes('collagen') || n.includes('glutathione')) sub = 'collagen-beauty-supplements';
    else sub = 'daily-vitamins-wellness';
  }
  return { category: cat, subCategory: sub };
}

export type ProductColor = {
  name: string;
  hex?: string;
  image?: string;
};

export type ProductVariation = {
  id: string;
  title: string;
  size?: string;
  color?: string;
  colorHex?: string;
  price: number;
  compareAt?: number;
  stock?: number | null;
  sku?: string;
  image?: string;
};

export type Product = {
  id: string; slug: string; name: string; price: number; category: string; subCategory?: string;
  adult: boolean; tag: string; desc: string; size: string; image: string;
  images?: string[]; stock?: number | null; compareAt?: number; soldOut?: boolean;
  sku?: string; shortDesc?: string; longDesc?: string; weight?: string;
  customDeliveryInside?: number | null; customDeliveryOutside?: number | null;
  seoTitle?: string; seoDesc?: string; seoKeywords?: string;
  noIndex?: boolean; seoExclude?: boolean;
  colors?: (string | ProductColor)[];
  sizes?: string[];
  variations?: ProductVariation[];
  isDigital?: boolean;
  digitalFileUrl?: string;
  digitalInstructions?: string;
};

export type FraudDetectorSettings = {
  enabled: boolean;
  cooldownHours: number;
  maxOrdersPerDay: number;
  minSecondsBetweenOrders: number;
  blockByPhone: boolean;
  sameProductNotice: string;
  maxOrdersNotice: string;
  rapidOrderNotice: string;
};

export type SliderItem = {
  id: string;
  image: string;
  mobileImage?: string;
  title?: string;
  subtitle?: string;
  buttonText?: string;
  buttonLink?: string;
  badge?: string;
  active?: boolean;
};

export type Settings = {
  storeName?: string;
  logo?: string;
  favicon?: string;
  sliders?: SliderItem[];
  announce: string;
  deliveryInside: number;
  deliveryOutside: number;
  freeShipThreshold: number;
  whatsapp: string;
  phone: string;
  gtmId?: string;
  fbPixelId?: string;
  appearance?: { font?: string; accent?: string; desktopColumns?: number; mobileColumns?: number; imageFit?: 'contain' | 'cover' };
  homeContent?: Record<'en' | 'bn', Record<string, any>>;
  siteContent?: { sections?: Record<string, boolean>; textOverrides?: Record<string, { en?: string; bn?: string }>; infoPages?: Record<string, Record<'en' | 'bn', { title?: string; body?: string[] }>> };
  fraudDetector?: FraudDetectorSettings;
};
const j = (r: Response) => {
  if (!r.ok) throw new Error('request failed');
  return r.json();
};

// Share simultaneous storefront requests (header, home sections, and title effects often need the same data).
const pendingJsonRequests = new Map<string, Promise<any>>();
function getJsonOnce<T>(url: string): Promise<T> {
  const pending = pendingJsonRequests.get(url);
  if (pending) return pending as Promise<T>;
  const request = fetch(url).then(j).finally(() => {
    if (pendingJsonRequests.get(url) === request) pendingJsonRequests.delete(url);
  });
  pendingJsonRequests.set(url, request);
  return request;
}

const SETTINGS_CACHE_KEY = 'metromaa_cached_settings';
const CATS_CACHE_KEY = 'metromaa_cached_categories';
const PRODUCTS_CACHE_KEY = 'metromaa_cached_products';

export function getCachedSettings(): Settings | null {
  try {
    const raw = localStorage.getItem(SETTINGS_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function getCachedCategories(): Category[] {
  try {
    const raw = localStorage.getItem(CATS_CACHE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function getCachedProducts(): Product[] {
  try {
    const raw = localStorage.getItem(PRODUCTS_CACHE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function getCachedProduct(slug: string): Product | null {
  try {
    const products = getCachedProducts();
    return products.find((p: any) => p.slug === slug || p.id === slug) || null;
  } catch { return null; }
}

export const getSettings = (): Promise<Settings> =>
  getJsonOnce<Settings>('/api/settings').then((data) => {
    try { localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(data)); } catch {}
    return data;
  });

export const getCategories = (): Promise<Category[]> =>
  getJsonOnce<Category[]>('/api/categories').then((data) => {
    try { localStorage.setItem(CATS_CACHE_KEY, JSON.stringify(data)); } catch {}
    return data;
  });

export const getProducts = (category?: string): Promise<Product[]> =>
  getJsonOnce<Product[]>('/api/products' + (category ? `?category=${encodeURIComponent(category)}` : '')).then((data) => {
    if (!category && Array.isArray(data) && data.length > 0) {
      try { localStorage.setItem(PRODUCTS_CACHE_KEY, JSON.stringify(data)); } catch {}
    }
    return data;
  });

export const getProduct = (slug: string): Promise<Product> =>
  getJsonOnce<Product>('/api/products/' + encodeURIComponent(slug)).then((data) => {
    try {
      const existing = getCachedProducts();
      const idx = existing.findIndex((p: any) => p.id === data.id || p.slug === data.slug);
      if (idx >= 0) existing[idx] = data;
      else existing.push(data);
      localStorage.setItem(PRODUCTS_CACHE_KEY, JSON.stringify(existing));
    } catch {}
    return data;
  });

export type OrderPayload = {
  items: {
    id: string;
    qty: number;
    name?: string;
    price?: number;
    image?: string;
    variantId?: string;
    variantTitle?: string;
    size?: string;
    color?: string;
  }[];
  customer: { name: string; phone: string; address: string; area?: string; note?: string; coupon?: string; source?: string; landing?: string; district?: string; thana?: string; freeDelivery?: boolean; shippingCost?: number };
  shipping?: { cost: number; method: string };
};


export function getSource(): string {
  try {
    const saved = localStorage.getItem('dot_src');
    if (saved) return saved;
    const p = new URLSearchParams(location.search);
    let src = p.get('utm_source') || p.get('ref') || p.get('source') || '';
    if (!src && p.get('fbclid')) src = 'facebook';
    if (!src && p.get('ttclid')) src = 'tiktok';
    if (!src && p.get('gclid')) src = 'google';
    if (!src && document.referrer) {
      try {
        const h = new URL(document.referrer).hostname.replace(/^www\./, '');
        if (h && !location.hostname.includes(h)) {
          if (h.includes('facebook') || h.includes('fb.me') || h.includes('instagram')) src = 'facebook';
          else if (h.includes('tiktok')) src = 'tiktok';
          else src = h;
        }
      } catch {}
    }
    src = (src || 'direct').toLowerCase().slice(0, 60);
    localStorage.setItem('dot_src', src);
    return src;
  } catch { return 'direct'; }
}

export function getDeviceId(): string {
  try {
    let id = localStorage.getItem('dot_did');
    if (!id) {
      const match = document.cookie.match(/(?:^|; )dot_did=([^;]*)/);
      if (match && match[1]) id = decodeURIComponent(match[1]);
    }
    if (!id || id.length < 8) {
      id = 'did_' + Math.random().toString(36).slice(2, 11) + Date.now().toString(36);
    }
    localStorage.setItem('dot_did', id);
    document.cookie = `dot_did=${encodeURIComponent(id)};path=/;max-age=31536000;SameSite=Lax`;
    return id;
  } catch {
    return 'unknown_device';
  }
}

export async function placeOrder(p: OrderPayload) {
  const did = getDeviceId();
  const r = await fetch('/api/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-device-id': did,
    },
    body: JSON.stringify({ ...p, deviceId: did }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || 'could not place order');
  return data as { id: string; total: number; status: string };
}

export const taka = (n: number) => 'Tk ' + (Number(n) || 0).toLocaleString('en-US');

export async function validateCoupon(code: string, subtotal: number, phone?: string) {
  const r = await fetch('/api/coupon/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, subtotal, phone })
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || 'invalid code');
  return d as { code: string; discount: number };
}

export type Review = { id: string; name: string; rating: number; text: string; at: string; adminReply?: string };
export const fetchReviews = (pid: string): Promise<{ count: number; avg: number; reviews: Review[] }> => fetch('/api/reviews/' + pid).then(j);
export async function postReview(b: { productId: string; name: string; rating: number; text: string }) {
  const r = await fetch('/api/reviews', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || 'could not submit');
  return d;
}

export function isSkincareSite(): boolean {
  if (typeof window === 'undefined') return false;
  const h = (window.location.hostname || '').toLowerCase();
  return h.includes('secrate');
}

export type MasterColor = {
  id: string;
  name: string;
  hex: string;
};

export async function fetchMasterColors(): Promise<MasterColor[]> {
  try {
    const res = await fetch('/api/colors');
    const data = await res.json();
    return data.colors || [];
  } catch {
    return [];
  }
}

export async function createMasterColor(name: string, hex: string): Promise<{ success: boolean; color?: MasterColor; colors: MasterColor[] }> {
  try {
    const res = await fetch('/api/colors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, hex }),
    });
    return await res.json();
  } catch (err: any) {
    return { success: false, colors: [] };
  }
}

export async function deleteMasterColor(id: string): Promise<{ success: boolean; colors: MasterColor[] }> {
  try {
    const res = await fetch('/api/colors/' + encodeURIComponent(id), { method: 'DELETE' });
    return await res.json();
  } catch {
    return { success: false, colors: [] };
  }
}

// ---- CUSTOMER VIP ACCOUNT SYSTEM ----
export type CustomerOrder = {
  id: string;
  createdAt: string;
  status: string;
  total: number;
  subtotal: number;
  shippingCost: number;
  discount: number;
  coupon?: string;
  items: any[];
  courier?: any;
  address?: string;
  district?: string;
  thana?: string;
};

export type Customer = {
  id: string;
  phone: string;
  name: string;
  email?: string;
  ordersCount: number;
  totalSpent: number;
  tier: string;
  savedAddress?: {
    address: string;
    district: string;
    thana: string;
    area: 'inside' | 'outside';
  };
  wishlist: string[];
  firstOrderDiscountAvailable: boolean;
  welcomeCoupon: string;
  createdAt: string;
  orders?: CustomerOrder[];
};

export function getCustomerToken(): string {
  try { return localStorage.getItem('metrroma_customer_token') || ''; }
  catch { return ''; }
}

export function setCustomerToken(token: string) {
  try { localStorage.setItem('metrroma_customer_token', token); }
  catch {}
}

export function clearCustomerToken() {
  try { localStorage.removeItem('metrroma_customer_token'); }
  catch {}
}

export async function sendCustomerOtp(
  arg1: string | { email?: string; phone?: string; name?: string; method?: 'email' | 'phone' },
  name?: string,
  phone?: string
): Promise<{ ok: boolean; message: string; demoCode?: string }> {
  const payload = typeof arg1 === 'object'
    ? arg1
    : { email: arg1, name, phone, method: arg1.includes('@') ? 'email' : 'phone' };

  const r = await fetch('/api/customer/send-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || 'Could not send verification code');
  return d;
}

export async function verifyCustomerOtp(
  arg1: string | { email?: string; phone?: string; code: string; name?: string },
  code?: string,
  name?: string,
  phone?: string
): Promise<{ ok: boolean; token: string; isNew?: boolean; customer: Customer }> {
  const payload = typeof arg1 === 'object'
    ? arg1
    : { email: arg1, code: code || '', name, phone };

  const r = await fetch('/api/customer/verify-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || 'Invalid verification code');
  if (d.token) setCustomerToken(d.token);
  return d;
}

export async function getCustomerMe(): Promise<Customer | null> {
  const token = getCustomerToken();
  if (!token) return null;
  const r = await fetch('/api/customer/me', {
    headers: { 'x-customer-token': token }
  });
  if (!r.ok) {
    if (r.status === 401) clearCustomerToken();
    return null;
  }
  const d = await r.json();
  return d.customer;
}

export async function updateCustomerProfile(data: { name?: string; email?: string; phone?: string; savedAddress?: any }): Promise<Customer> {
  const token = getCustomerToken();
  const r = await fetch('/api/customer/profile', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'x-customer-token': token
    },
    body: JSON.stringify(data)
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || 'Could not update profile');
  return d.customer;
}

export async function toggleCustomerWishlist(productId: string): Promise<string[]> {
  const token = getCustomerToken();
  if (!token) throw new Error('Sign in required');
  const r = await fetch('/api/customer/wishlist', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-customer-token': token
    },
    body: JSON.stringify({ productId })
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || 'Could not update wishlist');
  return d.wishlist;
}

export async function logoutCustomer(): Promise<void> {
  const token = getCustomerToken();
  clearCustomerToken();
  if (token) {
    fetch('/api/customer/logout', {
      method: 'POST',
      headers: { 'x-customer-token': token }
    }).catch(() => {});
  }
}

export async function getAdminCustomers(): Promise<any[]> {
  const token = localStorage.getItem('dot_admin_token') || 'dot_master_admin_token_2026';
  const r = await fetch('/api/admin/customers', {
    headers: { 'x-admin-token': token }
  });
  const d = await r.json();
  return d.customers || [];
}



