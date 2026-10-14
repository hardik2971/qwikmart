'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { Check, ChevronRight, Clock3, MapPin, NotebookPen, Plus, ShoppingBag, Store, Truck, Wallet } from 'lucide-react';
import { api, isUsingMock } from '@/lib/api';
import { payOrder } from '@/lib/payments';
import { errorMessage } from '@/lib/errors';
import { useT } from '@/lib/i18n';
import type { Address, Id, PaymentMethod } from '@/lib/types';
import { useCart, useCartKey, useCheckoutCart, useCurrency, useRequireAuth } from '@/hooks';
import { useLocationStore, useUiStore } from '@/store';
import { Breadcrumbs, EmptyState, Modal, Spinner, Toggle } from '@/components/ui';
import { PAYMENT_BRANDS, PaymentLogo } from '@/components/icons';
import { useSettings } from '@/components/layout/TopBar';
import CartLines from '@/components/checkout/CartLines';
import CouponBox from '@/components/checkout/CouponBox';
import AddressForm from '@/components/checkout/AddressForm';
import { CartIssues, cartIssues, FreeDeliveryBar, pickupFees, PriceRows } from '@/components/checkout/Summary';

const GATEWAY_ORDER: PaymentMethod[] = ['phonepe', 'midtrans', 'paystack', 'stripe', 'paypal', 'razorpay', 'cashfree', 'cod'];

export default function CheckoutPage() {
  const t = useT();
  const authed = useRequireAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const cartKey = useCartKey();
  const { fmt } = useCurrency();
  const mode = useUiStore((s) => s.mode);
  const loc = useLocationStore();
  const settings = useSettings();
  const { data: baseCart, isLoading } = useCart();
  const addresses = useQuery({ queryKey: ['addresses'], queryFn: api.addresses, enabled: authed });
  const wallet = useQuery({ queryKey: ['wallet', 1], queryFn: () => api.wallet(1), enabled: authed });

  const [addressId, setAddressId] = useState<Id | null>(null);
  const [deliveryType, setDeliveryType] = useState<'delivery' | 'self_pickup'>('delivery');
  const [useWallet, setUseWallet] = useState(false);
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [notes, setNotes] = useState('');

  // priced by the server for the selected address (distance-based delivery) and delivery type (self-pickup drops
  // delivery / surge / zone charges) — the same inputs placeOrder uses, so the shown total is what gets charged
  const checkoutCart = useCheckoutCart(addressId, deliveryType, authed && (deliveryType === 'self_pickup' || !!addressId));
  const cart = checkoutCart.data ?? baseCart;

  useEffect(() => {
    if (!addressId && addresses.data?.length) setAddressId((addresses.data.find((a) => a.is_default) || addresses.data[0]).id);
  }, [addresses.data, addressId]);

  const gateways = useMemo(() => {
    const enabled = settings.data?.payment_gateways?.filter((g) => g.enabled).map((g) => g.key as PaymentMethod);
    const list = enabled?.length ? enabled : GATEWAY_ORDER;
    return [...GATEWAY_ORDER.filter((g) => list.includes(g)), ...list.filter((g) => !GATEWAY_ORDER.includes(g))];
  }, [settings.data]);

  const balance = wallet.data?.balance ?? cart?.wallet_balance ?? 0;
  // self-pickup: the server drops delivery, surge and zone charges (cartSummary / placeOrder)
  const payable = cart ? Math.max(0, cart.total - (deliveryType === 'self_pickup' ? pickupFees(cart) : 0)) : 0;
  const blocked = cart ? cartIssues(cart).length > 0 || (cart.min_order_remaining ?? 0) > 0 : false;
  const walletUsed = useWallet ? Math.min(balance, payable) : 0;
  const remaining = payable - walletUsed;
  const effectiveMethod: PaymentMethod | null = remaining <= 0 && useWallet ? 'wallet' : method;

  const place = useMutation({
    mutationFn: async () => {
      if (deliveryType === 'delivery' && !addressId) throw new Error('Please select a delivery address');
      if (!effectiveMethod) throw new Error('Please select a payment method');
      const res = await api.placeOrder({
        address_id: deliveryType === 'delivery' ? addressId : null,
        delivery_type: deliveryType,
        payment_method: effectiveMethod,
        promo_code: cart?.promo?.code,
        use_wallet: useWallet || effectiveMethod === 'wallet',
        notes: notes || undefined,
      });
      if (res.payment) {
        if (!isUsingMock()) {
          // Razorpay / Stripe complete in-page (then verifyPayment); redirect gateways come back to /checkout/success
          try {
            const done = await payOrder(res.order, res.payment);
            return { ...res, redirected: !done };
          } catch (e) {
            qc.invalidateQueries({ queryKey: cartKey });
            toast.error(`${errorMessage(e)} Your order ${res.order.order_number} is awaiting payment.`);
            router.replace(`/orders/${res.order.id}`);
            return { ...res, redirected: true };
          }
        }
        // demo mock: simulated gateway
        toast.loading(`Processing ${PAYMENT_BRANDS[res.payment.gateway]?.name || res.payment.gateway} payment…`, { id: 'pay', duration: 1200 });
        await new Promise((r) => setTimeout(r, 1000));
        await api.verifyPayment(res.order.id, {
          gateway: res.payment.gateway,
          gateway_order_id: res.payment.gateway_order_id,
          payment_id: `demo_${Date.now()}`,
        });
        toast.dismiss('pay');
      }
      return { ...res, redirected: false };
    },
    onSuccess: (res) => {
      if (res.redirected) return;
      qc.invalidateQueries({ queryKey: cartKey });
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['wallet'] });
      router.replace(`/checkout/success?order=${res.order.id}&no=${encodeURIComponent(res.order.order_number)}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (!authed || isLoading || !cart)
    return (
      <div className="container grid gap-6 py-8 lg:grid-cols-[1fr_400px]">
        <div className="skeleton h-[500px]" />
        <div className="skeleton h-96" />
      </div>
    );

  if (!cart.items.length && !place.isPending && !place.isSuccess)
    return (
      <EmptyState
        icon={<ShoppingBag className="h-9 w-9" />}
        title={t('empty_cart')}
        subtitle="Add some products before checking out."
        action={<Link href="/" className="btn-primary">{t('start_shopping')}</Link>}
      />
    );

  const eta = mode === 'quick' ? `${loc.deliveryMinutes || loc.zone?.delivery_time_minutes || 8} minutes` : '1–4 days';

  return (
    <div className="container py-5">
      <Breadcrumbs items={[{ label: t('cart'), href: '/cart' }, { label: t('checkout') }]} />
      <h1 className="mb-5 mt-4 text-2xl font-bold">{t('checkout')}</h1>
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_400px]">
        <div className="space-y-5">
          {/* delivery type */}
          <div className="card grid grid-cols-2 gap-2 p-2">
            {[
              { k: 'delivery' as const, icon: Truck, label: 'Home Delivery', sub: `Arrives in ${eta}` },
              { k: 'self_pickup' as const, icon: Store, label: 'Self Pickup', sub: loc.store?.name || 'Pick up from store' },
            ].map(({ k, icon: Icon, label, sub }) => (
              <button
                key={k}
                onClick={() => setDeliveryType(k)}
                className={clsx('flex items-center gap-3 rounded-btn p-3 text-start transition', deliveryType === k ? 'bg-primary-50 ring-1 ring-primary dark:bg-primary/10' : 'hover:bg-soft')}
              >
                <Icon className={clsx('h-5 w-5', deliveryType === k ? 'text-primary' : 'text-muted')} />
                <span>
                  <span className="block text-sm font-semibold text-ink">{label}</span>
                  <span className="block text-xs text-muted">{sub}</span>
                </span>
              </button>
            ))}
          </div>

          {deliveryType === 'delivery' && (
            <section className="card p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-primary" />
                  <h2 className="font-bold">{t('delivery_address')}</h2>
                  <span className="chip py-0.5 text-xs"><Clock3 className="h-3.5 w-3.5 text-primary" /> {eta}</span>
                  {loc.distanceKm != null && <span className="chip py-0.5 text-xs">{loc.distanceKm.toFixed(2)} km</span>}
                </div>
                <button onClick={() => setFormOpen(true)} className="inline-flex items-center gap-1 text-sm font-semibold text-primary">
                  <Plus className="h-4 w-4" /> {t('add_address')}
                </button>
              </div>
              {addresses.isLoading && <div className="skeleton h-20" />}
              {addresses.data?.length === 0 && (
                <button onClick={() => setFormOpen(true)} className="w-full rounded-btn border-2 border-dashed border-line p-6 text-sm text-muted hover:border-primary hover:text-primary">
                  No saved address — add one to continue
                </button>
              )}
              <div className="grid gap-3 md:grid-cols-2">
                {addresses.data?.map((a: Address) => (
                  <button
                    key={a.id}
                    onClick={() => setAddressId(a.id)}
                    className={clsx('relative rounded-btn border p-3.5 text-start transition', a.id === addressId ? 'border-primary bg-primary-50/60 dark:bg-primary/10' : 'border-line hover:border-primary/50')}
                  >
                    {a.id === addressId && (
                      <span className="absolute end-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white">
                        <Check className="h-3 w-3" />
                      </span>
                    )}
                    <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                      {a.label} {a.is_default && <span className="text-xs font-medium text-primary">• Default</span>}
                    </div>
                    <div className="mt-1 line-clamp-2 pe-6 text-xs text-muted">
                      {a.name}, {a.address_line}, {a.landmark ? `${a.landmark}, ` : ''}
                      {a.city} {a.pincode}
                    </div>
                    <div className="mt-1 text-xs text-muted">{a.phone}</div>
                  </button>
                ))}
              </div>
            </section>
          )}

          <section className="card p-5">
            <div className="flex items-center gap-2">
              <ShoppingBag className="h-5 w-5 text-primary" />
              <h2 className="font-bold">
                {t('cart')} <span className="text-sm font-normal text-muted">({cart.items.length} items)</span>
              </h2>
            </div>
            <CartLines items={cart.items} />
            <div className="mt-2 flex items-start gap-2 rounded-btn border border-line px-3 py-2">
              <NotebookPen className="mt-1 h-4 w-4 text-muted" />
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Delivery instructions (optional)"
                className="flex-1 resize-none bg-transparent text-sm text-ink outline-none placeholder:text-muted"
              />
            </div>
          </section>
        </div>

        <aside className="card space-y-4 p-5">
          <h2 className="flex items-center gap-2 font-bold">{t('order_summary')}</h2>
          <FreeDeliveryBar cart={cart} />
          <CouponBox cart={cart} />

          <div className="flex items-center gap-3 rounded-btn border border-line p-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-btn bg-primary-50 text-primary">
              <Wallet className="h-5 w-5" />
            </span>
            <div className="flex-1">
              <div className="text-sm font-bold text-ink">{t('use_wallet')}</div>
              <div className="text-xs text-muted">{fmt(balance)}</div>
            </div>
            <Toggle checked={useWallet} onChange={setUseWallet} disabled={balance <= 0} />
          </div>

          <PriceRows cart={cart} selfPickup={deliveryType === 'self_pickup'} walletUsed={walletUsed} />

          <button onClick={() => setPayOpen(true)} disabled={remaining <= 0 && useWallet} className="flex w-full items-center gap-3 rounded-btn border border-line p-3 text-start hover:border-primary disabled:opacity-70">
            {effectiveMethod ? <PaymentLogo method={effectiveMethod} /> : <Wallet className="h-8 w-8 rounded-lg bg-soft p-1.5 text-muted" />}
            <span className="flex-1">
              <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted">{t('payment_method')}</span>
              <span className="block text-sm font-semibold text-ink">
                {effectiveMethod ? PAYMENT_BRANDS[effectiveMethod]?.name || effectiveMethod : 'Select Payment Method'}
              </span>
            </span>
            <ChevronRight className="h-4 w-4 text-muted rtl:rotate-180" />
          </button>

          <CartIssues cart={cart} />
          <button onClick={() => place.mutate()} disabled={place.isPending || blocked} className="btn-primary w-full py-3 text-base">
            {place.isPending && <Spinner />} {t('place_order')} · {fmt(Math.max(0, remaining))}
            <ChevronRight className="h-4 w-4 rtl:rotate-180" />
          </button>
          <p className="text-center text-[11px] text-muted">
            By placing the order you agree to our <Link href="/pages/terms" className="text-primary">Terms</Link>.
          </p>
        </aside>
      </div>

      <Modal open={payOpen} onClose={() => setPayOpen(false)} title={t('payment_method')} size="sm">
        <div className="space-y-2">
          {gateways.map((g) => (
            <button
              key={g}
              onClick={() => {
                setMethod(g);
                setPayOpen(false);
              }}
              className={clsx('flex w-full items-center gap-3 rounded-btn border p-3 text-start transition', method === g ? 'border-primary bg-primary-50 dark:bg-primary/10' : 'border-line hover:bg-soft')}
            >
              <PaymentLogo method={g} />
              <span className="flex-1 text-sm font-semibold text-ink">{PAYMENT_BRANDS[g]?.name || g}</span>
              <span className={clsx('flex h-5 w-5 items-center justify-center rounded-full border-2', method === g ? 'border-primary' : 'border-line')}>
                {method === g && <span className="h-2.5 w-2.5 rounded-full bg-primary" />}
              </span>
            </button>
          ))}
        </div>
      </Modal>

      {formOpen && <AddressForm open={formOpen} onClose={() => setFormOpen(false)} onSaved={(a) => setAddressId(a.id)} />}
    </div>
  );
}
