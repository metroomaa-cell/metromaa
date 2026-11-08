import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Product } from './api';
import { taka } from './api';
import { useStoreLanguage, tr } from './language';
import { useCart } from './cart';

export type WishlistItem = {
  id: string;
  slug: string;
  name: string;
  price: number;
  compareAt?: number;
  image: string;
  category?: string;
};

type WishlistCtx = {
  items: WishlistItem[];
  count: number;
  open: boolean;
  setOpen: (o: boolean) => void;
  isSaved: (id: string) => boolean;
  toggle: (p: Product | WishlistItem) => void;
  add: (p: Product | WishlistItem) => void;
  remove: (id: string) => void;
  clear: () => void;
};

const STORAGE_KEY = 'secrate_wishlist';

const Ctx = createContext<WishlistCtx | null>(null);
export const useWishlist = () => useContext(Ctx)!;

export function WishlistProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<WishlistItem[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch {
      return [];
    }
  });
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (_) {}
  }, [items]);

  const isSaved = (id: string) => items.some((it) => it.id === id);

  const add = (p: Product | WishlistItem) => {
    if (isSaved(p.id)) return;
    setItems((prev) => [
      {
        id: p.id,
        slug: p.slug,
        name: p.name,
        price: p.price,
        compareAt: p.compareAt,
        image: p.image,
        category: (p as any).category || '',
      },
      ...prev,
    ]);
  };

  const remove = (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  const toggle = (p: Product | WishlistItem) => {
    if (isSaved(p.id)) {
      remove(p.id);
    } else {
      add(p);
    }
  };

  const clear = () => setItems([]);

  const count = items.length;

  return (
    <Ctx.Provider value={{ items, count, open, setOpen, isSaved, toggle, add, remove, clear }}>
      {children}
    </Ctx.Provider>
  );
}

export function WishlistDrawer() {
  const language = useStoreLanguage();
  const { items, count, open, setOpen, remove, clear } = useWishlist();
  const { add: addToCart, setOpen: setCartOpen } = useCart();

  const handleMoveToCart = (item: WishlistItem) => {
    addToCart(item as any, 1);
    remove(item.id);
    setOpen(false);
    setCartOpen(true);
  };

  const handleAddAllToCart = () => {
    items.forEach((it) => {
      addToCart(it as any, 1);
    });
    setOpen(false);
    setCartOpen(true);
  };

  const go = (path: string) => {
    window.location.hash = '#' + path;
    setOpen(false);
  };

  return (
    <>
      <div className={'pc-cart-overlay' + (open ? ' open' : '')} onClick={() => setOpen(false)} />
      <aside className={'pc-cart-drawer secrate-wishlist-drawer' + (open ? ' open' : '')}>
        <div className="pc-drawer-head">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 18 }}>❤️</span>
            <span className="pc-drawer-title">{language === 'bn' ? 'আমার উইশলিস্ট' : 'My Wishlist'}</span>
            <span className="pc-drawer-count">({count} {count === 1 ? 'ITEM' : 'ITEMS'})</span>
          </div>
          <button className="pc-drawer-close" onClick={() => setOpen(false)} aria-label="Close wishlist">
            ×
          </button>
        </div>

        {items.length === 0 ? (
          <div className="pc-cart-empty" style={{ padding: '60px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.8 }}>🤍</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#1f3147', marginBottom: 8 }}>
              {language === 'bn' ? 'উইশলিস্ট এখনো খালি' : 'Your Wishlist is Empty'}
            </div>
            <p style={{ fontSize: 13, color: '#64748b', maxWidth: 300, margin: '0 auto 24px', lineHeight: 1.5 }}>
              {language === 'bn'
                ? 'পছন্দের প্রোডাক্টের হার্ট (❤️) আইকনে ক্লিক করে সেভ করে রাখুন এবং যেকোনো সময় সহজে অর্ডার করুন।'
                : 'Explore collections and tap the heart icon on any product to save your personal favorites here.'}
            </p>
            <button
              type="button"
              className="tabaya-btn-gold"
              onClick={() => go('shop')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '12px 24px',
                borderRadius: 30,
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                background: 'linear-gradient(135deg, #1f3147 0%, #111e2e 100%)',
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              <span>{language === 'bn' ? 'কালেকশন দেখুন →' : 'Explore Collections →'}</span>
            </button>
          </div>
        ) : (
          <>
            <div className="pc-drawer-items" style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <span style={{ fontSize: 12, color: '#8c7d6b', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>
                  {language === 'bn' ? 'সেভ করা পণ্যসমূহ' : 'Saved Items'}
                </span>
                <button
                  type="button"
                  onClick={clear}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#94a3b8',
                    fontSize: 11.5,
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  {language === 'bn' ? 'সব মুছুন' : 'Clear All'}
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {items.map((it) => {
                  const onSale = !!it.compareAt && it.compareAt > it.price;
                  return (
                    <div
                      key={it.id}
                      style={{
                        display: 'flex',
                        gap: 14,
                        padding: 12,
                        borderRadius: 12,
                        background: '#fff',
                        border: '1px solid rgba(180, 142, 76, 0.2)',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                        alignItems: 'center',
                      }}
                    >
                      <div
                        onClick={() => go('product/' + it.slug)}
                        style={{
                          width: 68,
                          height: 76,
                          borderRadius: 8,
                          overflow: 'hidden',
                          background: '#f8f5ee',
                          flexShrink: 0,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <img
                          src={it.image}
                          alt={it.name}
                          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                        />
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        {it.category && (
                          <div style={{ fontSize: 10, color: '#8c7d6b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>
                            {it.category.replace(/-/g, ' ')}
                          </div>
                        )}
                        <div
                          onClick={() => go('product/' + it.slug)}
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: '#1f3147',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            cursor: 'pointer',
                          }}
                          title={it.name}
                        >
                          {it.name}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: '#8B1E1E' }}>
                            {taka(it.price)}
                          </span>
                          {onSale && (
                            <span style={{ fontSize: 11.5, color: '#94a3b8', textDecoration: 'line-through' }}>
                              {taka(it.compareAt!)}
                            </span>
                          )}
                        </div>

                        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                          <button
                            type="button"
                            onClick={() => handleMoveToCart(it)}
                            style={{
                              padding: '5px 12px',
                              borderRadius: 6,
                              background: '#1f3147',
                              color: '#fff',
                              border: 'none',
                              fontSize: 11.5,
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            <span>🛒 {language === 'bn' ? 'ব্যাগে নিন' : 'Move to Bag'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => remove(it.id)}
                            style={{
                              padding: '5px 8px',
                              borderRadius: 6,
                              background: 'rgba(239, 68, 68, 0.08)',
                              color: '#ef4444',
                              border: '1px solid rgba(239, 68, 68, 0.2)',
                              fontSize: 11,
                              cursor: 'pointer',
                            }}
                            title="Remove from wishlist"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="pc-drawer-foot" style={{ padding: '16px 20px', borderTop: '1px solid #e2e8f0', background: '#faf8f5' }}>
              <button
                type="button"
                className="pc-drawer-checkout"
                onClick={handleAddAllToCart}
                style={{
                  width: '100%',
                  padding: '13px',
                  borderRadius: 10,
                  background: 'linear-gradient(135deg, #1f3147 0%, #111e2e 100%)',
                  color: '#fff',
                  border: 'none',
                  fontSize: 13.5,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  boxShadow: '0 4px 15px rgba(31, 49, 71, 0.25)',
                }}
              >
                <span>🛒 {language === 'bn' ? 'সবগুলো পণ্য ব্যাগে যোগ করুন' : 'Add All to Shopping Bag'}</span>
              </button>
            </div>
          </>
        )}
      </aside>
    </>
  );
}
