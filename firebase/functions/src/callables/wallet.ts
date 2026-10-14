/** Wallet callables: walletRecharge, verifyWalletRecharge, walletWithdraw. */
import { authed, db, invalid, notFound, now, numIn, precondition, publicSettings, str } from '../shared/firebase';
import type { UserDoc, WalletRechargeDoc } from '../shared/types';
import { formatMoney, money, num } from '../shared/util';
import { createPayment, isMethodEnabled, isOnlineMethod, verifyPayment } from '../payments/gateways';
import { WalletLedger } from '../services/wallet';

export const walletRecharge = authed<{ amount?: number; gateway?: string; return_url?: string }>(async (d, ctx) => {
  const s = await publicSettings();
  const min = num(s.wallet?.min_recharge, 100);
  const max = num(s.wallet?.max_recharge, 10000);
  const amount = money(numIn(d.amount, 'amount', { required: true, min, max }));
  const gateway = str(d.gateway, 'gateway', { required: true, max: 30 });
  if (!isOnlineMethod(gateway) || !(await isMethodEnabled(gateway))) invalid('Selected payment method is not available.', { field: 'gateway' });
  const user = (await db.doc(`users/${ctx.uid}`).get()).data() as UserDoc | undefined;
  if (!user) notFound('User not found.');
  const ref = db.collection('wallet_recharges').doc();
  const reference = `WR-${ref.id.slice(0, 10).toUpperCase()}`;
  const payload = await createPayment(gateway, {
    amount, currency: s.currency_code ?? 'INR', reference, description: 'Wallet recharge',
    customer: { name: user!.name, email: user!.email ?? null, phone: user!.phone ?? null },
    return_url: str(d.return_url, 'return_url', { max: 500 }) || null, metadata: { user_id: ctx.uid, type: 'wallet' },
  });
  const doc: WalletRechargeDoc & { reference: string } = {
    user_id: ctx.uid, amount, method: gateway, gateway_order_id: payload.gateway_order_id ?? null, status: 'pending', created_at: now(), reference,
  } as never;
  await ref.set(doc);
  return { ...payload, recharge_id: ref.id };
});

export const verifyWalletRecharge = authed<Record<string, unknown>>(async (d, ctx) => {
  const id = str(d.recharge_id, 'recharge_id', { required: true, max: 128 });
  const ref = db.doc(`wallet_recharges/${id}`);
  const snap = await ref.get();
  if (!snap.exists || snap.get('user_id') !== ctx.uid) notFound('Recharge session not found or expired.');
  const pending = snap.data() as WalletRechargeDoc;
  if (pending.status === 'completed') {
    const bal = (await db.doc(`users/${ctx.uid}`).get()).get('wallet_balance');
    return { balance: money(num(bal)), already_processed: true };
  }
  const payload = (d.payload && typeof d.payload === 'object' ? d.payload : d) as Record<string, unknown>;
  const result = await verifyPayment(pending.method, payload, pending.gateway_order_id);
  if (!result.success) {
    await ref.update({ status: 'failed', updated_at: now() });
    precondition('Payment verification failed.');
  }
  const balance = await db.runTransaction(async (tx) => {
    const s = await tx.get(ref);
    if (s.get('status') === 'completed') precondition('This recharge has already been processed.');
    const l = new WalletLedger(tx);
    await l.load(ctx.uid);
    const bal = l.credit(ctx.uid, pending.amount, pending.method, 'Wallet recharge', null, result.transaction_id, `recharge_${id}`);
    l.commit();
    tx.update(ref, { status: 'completed', transaction_id: result.transaction_id ?? null, updated_at: now() });
    return bal;
  });
  const sym = (await publicSettings()).currency_symbol ?? '₹';
  return { balance, message: `${formatMoney(pending.amount, sym)} added to your wallet` };
});

export const walletWithdraw = authed<{ amount?: number; message?: string }>(async (d, ctx) => {
  const s = await publicSettings();
  const amount = money(numIn(d.amount, 'amount', { required: true, min: 1 }));
  const min = num(s.wallet?.min_withdraw, 100);
  if (amount < min) precondition(`Minimum withdrawal amount is ${formatMoney(min, s.currency_symbol ?? '₹')}.`);
  const message = str(d.message, 'message', { max: 255 }) || null;
  const pending = await db.collection('withdrawal_requests').where('user_id', '==', ctx.uid).where('status', '==', 'pending').get();
  if (pending.size >= 3) precondition('You already have pending withdrawal requests.');
  const ref = db.collection('withdrawal_requests').doc();
  await db.runTransaction(async (tx) => {
    const u = await tx.get(db.doc(`users/${ctx.uid}`));
    const l = new WalletLedger(tx);
    await l.load(ctx.uid);
    l.debit(ctx.uid, amount, 'withdrawal', 'Withdrawal request', null, null, `withdraw_${ref.id}`);
    l.commit();
    tx.set(ref, {
      user_id: ctx.uid, user_type: u.get('type') === 'delivery_boy' ? 'delivery_boy' : 'customer', user_name: u.get('name') ?? '',
      amount, message, status: 'pending', remark: null, receipt_image: null, created_at: now(), processed_at: null,
    });
  });
  return { id: ref.id, amount, status: 'pending' };
});

