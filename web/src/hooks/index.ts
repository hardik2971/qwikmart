'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, isUsingMock } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { money } from '@/lib/format';
import type { Cart, Id, Product } from '@/lib/types';
import { useAuthStore, useCartStore, useLocationStore, useUiStore } from '@/store';

export function useMounted() {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  return m;
}

/** Context values that should be part of catalogue query keys. */
export function useCtxKey() {
  const mode = useUiStore((s) => s.mode);
  const lang = useUiStore((s) => s.language);
  const zoneId = useLocationStore((s) => s.zone?.id ?? null);
  return [mode, lang, zoneId] as const;
}

export function useCurrency() {
  const symbol = useLocationStore((s) => s.country?.currency_symbol) || '₹';
  return { symbol, fmt: (n: number | null | undefined) => money(n, symbol) };
}

/** Cart query key: the cart owner (Firebase uid — anonymous guest or customer; mock: guest token / user) + context. */
export function useCartKey() {
  const authed = useAuthStore((s) => !!s.user);
  const guest = useCartStore((s) => s.guestToken);
  const owner = useCartStore((s) => s.owner);
  const mode = useUiStore((s) => s.mode);
  const zoneId = useLocationStore((s) => s.zone?.id ?? null);
  const who = isUsingMock() ? (authed ? 'user' : guest) : owner;
  return ['cart', who, mode, zoneId] as const;
}

export function useCart() {
  const key = useCartKey();
  const setSummary = useCartStore((s) => s.setSummary);
  const q = useQuery({ queryKey: key, queryFn: () => api.cart(), staleTime: 15_000, enabled: isUsingMock() || !!key[1] });
  useEffect(() => {
    if (q.data) setSummary(q.data.items.reduce((s, i) => s + i.qty, 0), q.data.total);
  }, [q.data, setSummary]);
  return q;
}

/** Checkout summary: same cart, priced by the server for the selected address and delivery type. */
export function useCheckoutCart(addressId: Id | null, deliveryType: 'delivery' | 'self_pickup', enabled = true) {
  const key = useCartKey();
  return useQuery({
    queryKey: [...key, 'checkout', addressId, deliveryType],
    queryFn: () => api.cart({ address_id: addressId, delivery_type: deliveryType }),
    placeholderData: (prev) => prev,
    enabled: enabled && (isUsingMock() || !!key[1]),
  });
}

export function useCartActions() {
  const qc = useQueryClient();
  const key = useCartKey();
  const set = (cart: Cart) => {
    qc.setQueryData(key, cart);
    // the checkout summary (priced for the selected address / delivery type) is a separate query
    qc.invalidateQueries({ queryKey: [...key, 'checkout'] });
  };
  const onError = (e: unknown) => toast.error(errorMessage(e));

  const add = useMutation({
    mutationFn: ({ variantId, qty = 1, productId }: { variantId: Id; qty?: number; productId?: Id }) => api.addToCart(variantId, qty, productId),
    onSuccess: set,
    onError,
  });
  const update = useMutation({
    mutationFn: ({ id, qty }: { id: Id; qty: number }) =>
      qty <= 0 ? api.removeCartItem(id) : api.updateCartItem(id, qty),
    onSuccess: set,
    onError,
  });
  const remove = useMutation({ mutationFn: (id: Id) => api.removeCartItem(id), onSuccess: set, onError });
  const clear = useMutation({ mutationFn: api.clearCart, onSuccess: set, onError });
  const applyPromo = useMutation({
    mutationFn: (code: string | null) => (code ? api.applyPromo(code) : api.removePromo()),
    onSuccess: (c, code) => {
      set(c);
      if (code) toast.success(`${code} applied`);
    },
    onError,
  });
  return { add, update, remove, clear, applyPromo, busy: add.isPending || update.isPending || remove.isPending };
}

/** Quantity of a variant in the cart + helpers used by product cards & detail. */
export function useCartLine(variantId?: Id, productId?: Id) {
  const { data } = useCart();
  const actions = useCartActions();
  const line = variantId == null ? undefined : data?.items.find((i) => String(i.product_variant_id) === String(variantId));
  // max_qty_per_order / stock from cartSummary (the server rejects more at checkout)
  const max = line ? Math.min(...[line.max_qty ?? 0, line.stock].filter((n) => n > 0), Infinity) : Infinity;
  return {
    line,
    max: Number.isFinite(max) ? max : undefined,
    qty: line?.qty ?? 0,
    add: (qty = 1) => variantId != null && actions.add.mutate({ variantId, qty, productId }),
    inc: () => {
      if (line && line.qty >= max) return toast.error(`You can order a maximum of ${max} units of this item.`);
      return line ? actions.update.mutate({ id: line.id, qty: line.qty + 1 }) : variantId != null && actions.add.mutate({ variantId, productId });
    },
    dec: () => line && actions.update.mutate({ id: line.id, qty: line.qty - 1 }),
    busy: actions.busy,
  };
}

export function useIsAuthed() {
  const authed = useAuthStore((s) => !!s.user);
  const mounted = useMounted();
  return mounted && authed;
}

/** Redirects to /login?next=… when nobody is signed in (after hydration). */
export function useRequireAuth() {
  const authed = useAuthStore((s) => !!s.user);
  const mounted = useMounted();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (mounted && !authed) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [mounted, authed, router, pathname]);
  return mounted && authed;
}

export function useToggleFavorite() {
  const qc = useQueryClient();
  const authed = useAuthStore((s) => !!s.user);
  const router = useRouter();
  const m = useMutation({
    mutationFn: async (p: Pick<Product, 'id' | 'is_favorite'>) => {
      if (p.is_favorite) await api.removeFavorite(p.id);
      else await api.addFavorite(p.id);
      return !p.is_favorite;
    },
    onSuccess: (fav) => {
      toast.success(fav ? 'Added to favourites' : 'Removed from favourites');
      qc.invalidateQueries({ queryKey: ['favorites'] });
      qc.invalidateQueries({ queryKey: ['product'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['home'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (p: Pick<Product, 'id' | 'is_favorite'>) => {
    if (!authed) {
      toast('Please login to save favourites');
      router.push('/login');
      return;
    }
    m.mutate(p);
  };
}

export function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
