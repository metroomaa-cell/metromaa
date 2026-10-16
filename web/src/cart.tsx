import { createContext, useContext, useEffect, useRef, useState, startTransition, type ReactNode } from 'react';
import type { Product } from './api';
import { ecAdd } from './analytics';

export type CartLine = {
  id: string;
  name: string;
  price: number;
  image: string;
  qty: number;
  variantId?: string;
  size?: string;
  color?: string;
};
type CartCtx = {
  lines: CartLine[]; count: number; total: number; open: boolean; toast: string;
  setOpen: (o: boolean) => void;
  add: (p: Product & { size?: string; color?: string; variantId?: string }, qty?: number) => void;
  setQty: (id: string, qty: number) => void;
  remove: (id: string) => void;
  clear: () => void;
};
const Ctx = createContext<CartCtx | null>(null);
export const useCart = () => useContext(Ctx)!;

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>(() => {
    try { return JSON.parse(localStorage.getItem('dot_cart') || '[]'); } catch { return []; }
  });
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState('');
  const tRef = useRef<any>(null);
  useEffect(() => { localStorage.setItem('dot_cart', JSON.stringify(lines)); }, [lines]);
  const showToast = (m: string) => { setToast(m); clearTimeout(tRef.current); tRef.current = setTimeout(() => setToast(''), 2200); };

  const add = (p: Product & { size?: string; color?: string; variantId?: string }, qty = 1) => {
    const lineKey = p.variantId
      ? `${p.id}-${p.variantId}`
      : `${p.id}${p.size ? `-${p.size}` : ''}${p.color ? `-${p.color}` : ''}`;
    setLines((ls) => {
      const e = ls.find((l) => l.id === lineKey);
      if (e) return ls.map((l) => (l.id === lineKey ? { ...l, qty: Math.min(20, l.qty + qty) } : l));
      return [...ls, {
        id: lineKey,
        name: p.name,
        price: p.price,
        image: p.image,
        qty,
        variantId: p.variantId,
        size: p.size,
        color: p.color,
      }];
    });
    showToast('added to bag');
    ecAdd({ id: p.id, name: p.name, price: p.price }, qty);
  };
  const setQty = (id: string, qty: number) =>
    setLines((ls) => (qty <= 0 ? ls.filter((l) => l.id !== id) : ls.map((l) => (l.id === id ? { ...l, qty: Math.min(20, qty) } : l))));
  const remove = (id: string) => setLines((ls) => ls.filter((l) => l.id !== id));
  const clear = () => setLines([]);
  const count = lines.reduce((s, l) => s + l.qty, 0);
  const total = lines.reduce((s, l) => s + l.price * l.qty, 0);

  return <Ctx.Provider value={{ lines, count, total, open, toast, setOpen, add, setQty, remove, clear }}>{children}</Ctx.Provider>;
}

export function useRoute() {
  const [route, setRoute] = useState(() => parseRoute());
  useEffect(() => {
    const h = () => {
      startTransition(() => setRoute(parseRoute()));
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    };
    addEventListener('hashchange', h);
    addEventListener('popstate', h);
    return () => {
      removeEventListener('hashchange', h);
      removeEventListener('popstate', h);
    };
  }, []);
  return route;
}
function parseRoute() {
  const normalize = (part: string) => {
    const p = part.toLowerCase();
    if (p === 'wp-admin' || p === 'admin' || p === 'admin.html') return 'admin';
    return p;
  };

  // If old hash is present, strip # and migrate cleanly to pathname
  if (location.hash && location.hash.length > 1) {
    const raw = location.hash.replace(/^#[!/]*\/?/, '');
    const parts = raw.split('/').filter(Boolean);
    const n = normalize(parts[0] || 'home');
    const param = parts.slice(1).join('/');
    const targetSlug = n === 'admin' ? 'wp-admin' : parts[0] || '';
    const newPath = targetSlug ? '/' + [targetSlug, ...parts.slice(1)].join('/') : '/';
    try {
      window.history.replaceState(null, '', newPath);
    } catch {}
    return { name: n, param };
  }

  // Parse from pathname: e.g. /shop/category, /product/item, /checkout, /track, /wp-admin
  const pathParts = location.pathname.split('/').filter(Boolean);
  if (pathParts.length > 0) {
    const n = normalize(pathParts[0]);
    return { name: n, param: pathParts.slice(1).join('/') };
  }
  return { name: 'home', param: '' };
}

export const go = (path: string) => {
  window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
  const clean = path.replace(/^[#/]+/, '');
  const parts = clean.split('/').filter(Boolean);
  if (parts[0] === 'admin') {
    parts[0] = 'wp-admin';
  }
  const target = parts.length > 0 ? '/' + parts.join('/') : '/';
  if (location.pathname !== target || location.hash) {
    window.history.pushState(null, '', target);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }
};

export function useAge() {
  // age gate disabled per store owner — categories open directly
  return { ok: true, confirm: () => {} };
}
