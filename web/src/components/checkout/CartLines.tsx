'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Trash2 } from 'lucide-react';
import type { CartItem } from '@/lib/types';
import { discountPercent, effectivePrice } from '@/lib/format';
import { useCartActions, useCurrency } from '@/hooks';
import { QtyStepper } from '../product/ProductCard';

export default function CartLines({ items, compact }: { items: CartItem[]; compact?: boolean }) {
  const { fmt } = useCurrency();
  const { update, remove, busy } = useCartActions();
  return (
    <div className="divide-y divide-line">
      {items.map((i) => {
        const off = discountPercent(i);
        return (
          <div key={i.id} className="flex gap-3 py-4">
            <Link href={`/product/${i.product_slug}`} className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-line bg-soft md:h-20 md:w-20">
              <Image src={i.image} alt={i.product_name} fill sizes="80px" className="object-cover" />
            </Link>
            <div className="min-w-0 flex-1">
              <div className="flex justify-between gap-3">
                <Link href={`/product/${i.product_slug}`} className="line-clamp-2 text-sm font-semibold text-ink hover:text-primary">
                  {i.product_name} - {i.variant_name}
                </Link>
                <span className="shrink-0 text-sm font-bold text-primary">{fmt(i.line_total)}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                <span className="font-semibold text-ink">{fmt(effectivePrice(i))}</span>
                {off > 0 && (
                  <>
                    <span className="text-muted line-through">{fmt(i.price)}</span>
                    <span className="font-semibold text-primary">{off}% OFF</span>
                  </>
                )}
              </div>
              <div className="mt-2 flex items-center justify-between">
                <QtyStepper
                  qty={i.qty}
                  busy={busy}
                  max={Math.min(...[i.max_qty ?? 0, i.stock].filter((n) => n > 0), Infinity)}
                  onInc={() => update.mutate({ id: i.id, qty: i.qty + 1 })}
                  onDec={() => update.mutate({ id: i.id, qty: i.qty - 1 })}
                />
                {!compact && (
                  <button onClick={() => remove.mutate(i.id)} className="inline-flex items-center gap-1 text-xs font-semibold text-danger hover:underline">
                    <Trash2 className="h-3.5 w-3.5" /> Remove
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
