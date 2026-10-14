'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { ChevronRight, Percent, Tag, X } from 'lucide-react';
import { api } from '@/lib/api';
import type { Cart, Coupon } from '@/lib/types';
import { useT } from '@/lib/i18n';
import { useCartActions, useCartKey, useCurrency } from '@/hooks';
import { Modal } from '../ui';

function couponLabel(c: Coupon, fmt: (n: number) => string) {
  if (c.discount_type === 'free_delivery') return 'Free delivery';
  if (c.discount_type === 'percent') return `${c.discount_value}% off${c.max_discount ? ` up to ${fmt(c.max_discount)}` : ''}`;
  return `Flat ${fmt(c.discount_value)} off`;
}

export default function CouponBox({ cart }: { cart: Cart }) {
  const t = useT();
  const { fmt } = useCurrency();
  const key = useCartKey();
  const { applyPromo } = useCartActions();
  const [code, setCode] = useState('');
  const [open, setOpen] = useState(false);
  const coupons = useQuery({ queryKey: ['coupons', ...key, cart.subtotal], queryFn: api.promoCodes });

  // an applicable coupon first, else the nearest one locked only by the minimum order ("Add ₹X more to unlock").
  // Coupons locked for another reason (audience, time window, usage limit…) are never teased.
  const onlyMinLocked = (c: Coupon) => c.min_order > cart.subtotal && (!c.message || /more/i.test(c.message));
  const teaser =
    coupons.data?.find((c) => c.is_applicable !== false && c.min_order <= cart.subtotal) ||
    coupons.data?.filter(onlyMinLocked).sort((a, b) => a.min_order - b.min_order)[0];

  if (cart.promo) {
    return (
      <div className="flex items-center gap-3 rounded-btn border border-dashed border-primary bg-primary-50 p-3 dark:bg-primary/10">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-white">
          <Percent className="h-4 w-4" />
        </span>
        <div className="flex-1">
          <div className="text-sm font-bold text-ink">{cart.promo.code} applied</div>
          <div className="text-xs text-primary">
            {cart.promo.is_cashback ? `${fmt(cart.promo.discount)} cashback after delivery` : `You save ${fmt(cart.promo.discount)}`}
          </div>
        </div>
        <button onClick={() => applyPromo.mutate(null)} className="rounded-full p-1 text-muted hover:bg-surface" aria-label="Remove coupon">
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {teaser && (
        <div className="flex items-center gap-3 rounded-btn border border-line p-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary">
            <Percent className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-ink">{teaser.code}</div>
            <div className="text-xs text-muted">
              {teaser.min_order > cart.subtotal
                ? `Add ${fmt(teaser.min_order - cart.subtotal)} more to unlock this offer`
                : couponLabel(teaser, fmt)}
            </div>
          </div>
          <button
            disabled={teaser.min_order > cart.subtotal || applyPromo.isPending}
            onClick={() => applyPromo.mutate(teaser.code)}
            className="btn-primary px-3 py-1.5 text-xs"
          >
            {t('apply')}
          </button>
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (code.trim()) applyPromo.mutate(code.trim().toUpperCase());
        }}
        className="flex items-center gap-2 rounded-btn border border-line px-3 py-1"
      >
        <Tag className="h-4 w-4 text-muted" />
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Discount Code" className="h-9 flex-1 bg-transparent text-sm uppercase text-ink outline-none placeholder:normal-case placeholder:text-muted" />
        <button className="text-sm font-bold text-primary">Apply</button>
      </form>
      <button onClick={() => setOpen(true)} className="flex w-full items-center justify-between text-sm font-semibold text-primary">
        <span className="inline-flex items-center gap-1.5">
          <Percent className="h-4 w-4" /> {t('view_coupons')}
        </span>
        <ChevronRight className="h-4 w-4 rtl:rotate-180" />
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Available Coupons">
        <div className="space-y-3">
          {coupons.isLoading && <div className="skeleton h-24" />}
          {coupons.data?.map((c) => {
            const locked = c.min_order > cart.subtotal || c.is_applicable === false;
            return (
              <div key={c.id} className={clsx('flex overflow-hidden rounded-card border border-line', locked && 'opacity-70')}>
                <div className="flex w-14 items-center justify-center text-white" style={{ background: c.banner_color || '#0E9623' }}>
                  <span className="-rotate-90 whitespace-nowrap text-xs font-extrabold tracking-wider">{c.discount_type === 'percent' ? `${c.discount_value}%` : 'OFFER'}</span>
                </div>
                <div className="flex-1 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded border border-dashed border-primary px-2 py-0.5 text-sm font-bold text-primary">{c.code}</span>
                    <button
                      disabled={locked || applyPromo.isPending}
                      onClick={() => applyPromo.mutate(c.code, { onSuccess: () => setOpen(false) })}
                      className="text-sm font-bold text-primary disabled:text-muted"
                    >
                      {t('apply')}
                    </button>
                  </div>
                  <div className="mt-1.5 text-sm font-semibold text-ink">{c.title}</div>
                  <div className="text-xs text-muted">{c.description}</div>
                  {locked && (
                    <div className="mt-1 text-xs font-semibold text-warning" data-testid="coupon-reason">
                      {c.message || (c.min_order > cart.subtotal ? `Add ${fmt(c.min_order - cart.subtotal)} more to unlock` : 'Not applicable to this cart')}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Modal>
    </div>
  );
}
