'use client';

import { BadgePercent, Truck } from 'lucide-react';
import type { Cart } from '@/lib/types';
import { useT } from '@/lib/i18n';
import { useCurrency } from '@/hooks';

export function FreeDeliveryBar({ cart }: { cart: Cart }) {
  const { fmt } = useCurrency();
  if (!cart.items.length) return null;
  const threshold = cart.subtotal + cart.free_delivery_remaining;
  const pct = threshold ? Math.min(100, (cart.subtotal / threshold) * 100) : 100;
  return (
    <div className="rounded-btn bg-primary-50 p-3 dark:bg-primary/10">
      <div className="flex items-center gap-2 text-sm font-semibold text-primary">
        <Truck className="h-4 w-4" />
        {cart.free_delivery_remaining > 0 ? (
          <span>
            Add <b>{fmt(cart.free_delivery_remaining)}</b> more for FREE delivery
          </span>
        ) : (
          <span>Yay! You get FREE delivery on this order</span>
        )}
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/70 dark:bg-black/30">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Fees the server drops for self-pickup orders (delivery, surge, zone additional charges). */
export function pickupFees(cart: Cart) {
  return cart.delivery_charge + cart.surge_charge + (cart.additional_charges ?? 0);
}

/** Blocking cart problems from cartSummary (max qty, stock, min order …). */
export function cartIssues(cart: Cart): string[] {
  const list = (cart.issues ?? []).map((i) => (typeof i === 'string' ? i : i.message || '')).filter(Boolean);
  return Array.from(new Set(list));
}

export function CartIssues({ cart }: { cart: Cart }) {
  const { fmt } = useCurrency();
  const issues = cartIssues(cart);
  const minLeft = cart.min_order_remaining ?? 0;
  if (!issues.length && minLeft <= 0) return null;
  return (
    <div role="alert" data-testid="cart-issues" className="space-y-1 rounded-btn bg-amber-50 p-3 text-xs font-semibold text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
      {minLeft > 0 && !issues.some((i) => /minimum order/i.test(i)) && (
        <div>Minimum order is {fmt(cart.min_order ?? 0)}. Add {fmt(minLeft)} more to place the order.</div>
      )}
      {issues.map((i) => (
        <div key={i}>{i}</div>
      ))}
    </div>
  );
}

export function PriceRows({
  cart,
  selfPickup = false,
  walletUsed = 0,
}: {
  cart: Cart;
  selfPickup?: boolean;
  walletUsed?: number;
}) {
  const t = useT();
  const { fmt } = useCurrency();
  const delivery = selfPickup ? 0 : cart.delivery_charge;
  const total = Math.max(0, cart.total - (selfPickup ? pickupFees(cart) : 0) - walletUsed);
  const itemsCount = cart.items.reduce((s, i) => s + i.qty, 0);
  return (
    <div className="space-y-2.5 text-sm">
      <div className="flex justify-between">
        <span className="text-muted">
          {t('subtotal')} ({itemsCount} items)
        </span>
        <span className="font-semibold text-ink">{fmt(cart.subtotal)}</span>
      </div>
      {cart.mrp_total && cart.mrp_total > cart.subtotal ? (
        <div className="flex justify-between">
          <span className="text-muted">Product discount</span>
          <span className="font-semibold text-primary">−{fmt(cart.mrp_total - cart.subtotal)}</span>
        </div>
      ) : null}
      <div className="flex justify-between">
        <span className="text-muted">{t('delivery_charge')}</span>
        <span className="font-semibold text-ink">{delivery ? fmt(delivery) : <span className="text-primary">{t('free')}</span>}</span>
      </div>
      {!selfPickup && cart.surge_charge > 0 && (
        <div className="flex justify-between">
          <span className="text-muted">Surge fee (peak hours)</span>
          <span className="font-semibold text-ink">{fmt(cart.surge_charge)}</span>
        </div>
      )}
      {!selfPickup && (cart.additional_charges ?? 0) > 0 && (
        <div className="flex justify-between">
          <span className="text-muted">Other charges</span>
          <span className="font-semibold text-ink">{fmt(cart.additional_charges ?? 0)}</span>
        </div>
      )}
      {cart.tax > 0 && (
        <div className="flex justify-between">
          <span className="text-muted">{cart.tax_inclusive ? 'Tax (included in prices)' : 'Tax'}</span>
          <span className={cart.tax_inclusive ? 'text-muted' : 'font-semibold text-ink'}>{fmt(cart.tax)}</span>
        </div>
      )}
      {cart.promo && (
        <div className="flex justify-between">
          <span className="text-muted">{cart.promo.is_cashback ? 'Cashback' : 'Coupon'} ({cart.promo.code})</span>
          <span className="font-semibold text-primary">
            {cart.promo.is_cashback ? `+${fmt(cart.promo.discount)} after delivery` : `−${fmt(cart.promo.discount)}`}
          </span>
        </div>
      )}
      {walletUsed > 0 && (
        <div className="flex justify-between">
          <span className="text-muted">Wallet</span>
          <span className="font-semibold text-primary">−{fmt(walletUsed)}</span>
        </div>
      )}
      <div className="flex justify-between border-t border-line pt-3 text-base">
        <span className="font-bold text-ink">{t('total')}</span>
        <span className="font-extrabold text-ink">{fmt(total)}</span>
      </div>
      {cart.savings > 0 && (
        <div className="flex items-center gap-2 rounded-btn bg-primary-50 px-3 py-2 text-sm font-semibold text-primary dark:bg-primary/10">
          <BadgePercent className="h-4 w-4" /> {t('you_saved', { amount: fmt(cart.savings) })}
        </div>
      )}
    </div>
  );
}
