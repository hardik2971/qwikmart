'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ShoppingBag, Trash2 } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { useCart, useCartActions, useIsAuthed } from '@/hooks';
import { Breadcrumbs, EmptyState } from '@/components/ui';
import CartLines from '@/components/checkout/CartLines';
import CouponBox from '@/components/checkout/CouponBox';
import { CartIssues, cartIssues, FreeDeliveryBar, PriceRows } from '@/components/checkout/Summary';

export default function CartPage() {
  const t = useT();
  const router = useRouter();
  const authed = useIsAuthed();
  const { data: cart, isLoading } = useCart();
  const { clear } = useCartActions();

  if (isLoading || !cart)
    return (
      <div className="container grid gap-6 py-8 lg:grid-cols-[1fr_380px]">
        <div className="skeleton h-96" />
        <div className="skeleton h-80" />
      </div>
    );

  const count = cart.items.length;

  return (
    <div className="container py-5">
      <Breadcrumbs items={[{ label: t('cart') }]} />
      <div className="mt-4 mb-5">
        <h1 className="text-2xl font-bold">{t('my_cart')}</h1>
        <p className="text-sm text-muted">There are {count} product(s) in your cart</p>
      </div>
      {count === 0 ? (
        <div className="card">
          <EmptyState
            icon={<ShoppingBag className="h-9 w-9" />}
            image="/images/empty/empty-cart.webp"
            title={t('empty_cart')}
            subtitle={t('empty_cart_sub')}
            action={<Link href="/" className="btn-primary">{t('start_shopping')}</Link>}
          />
        </div>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[1fr_380px]">
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-line bg-soft/60 px-5 py-3 text-sm font-semibold text-ink">
              <span>Product</span>
              <span className="flex items-center gap-4">
                <span className="text-muted">{count} Items</span>
                <button onClick={() => clear.mutate()} className="inline-flex items-center gap-1 text-xs text-danger">
                  <Trash2 className="h-3.5 w-3.5" /> Clear Cart
                </button>
              </span>
            </div>
            <div className="px-5">
              <CartLines items={cart.items} />
            </div>
          </div>
          <aside className="card sticky top-36 space-y-4 p-5">
            <FreeDeliveryBar cart={cart} />
            <CouponBox cart={cart} />
            <PriceRows cart={cart} />
            <CartIssues cart={cart} />
            <button
              onClick={() => router.push(authed ? '/checkout' : '/login?next=/checkout')}
              disabled={cartIssues(cart).length > 0 || (cart.min_order_remaining ?? 0) > 0}
              className="btn-primary w-full py-3"
            >
              {t('proceed_checkout')}
            </button>
            <Link href="/" className="btn-ghost w-full">
              {t('continue_shopping')}
            </Link>
            {!authed && <p className="text-center text-xs text-muted">Your cart is saved as a guest and will sync when you log in.</p>}
          </aside>
        </div>
      )}
    </div>
  );
}
