/** Wallet ledger (Laravel WalletService) — transaction-safe: load() reads, credit()/debit() stage, commit() writes. */
import { db, now, precondition, Transaction, invalid, notFound } from '../shared/firebase';
import { money, randomCode } from '../shared/util';

interface Op {
  uid: string; type: 'credit' | 'debit'; amount: number; balanceAfter: number; paymentType: string; message: string;
  orderId: string | null; txnId: string; docId: string;
}

export class WalletLedger {
  private balances = new Map<string, number>();
  private ops: Op[] = [];
  private skip = new Set<string>();

  constructor(private tx: Transaction) {}

  /** Read the user's balance (must be called before any write in the transaction). */
  async load(uid: string): Promise<number> {
    if (!this.balances.has(uid)) {
      const snap = await this.tx.get(db.doc(`users/${uid}`));
      if (!snap.exists) notFound('User not found.');
      this.balances.set(uid, money(Number(snap.get('wallet_balance') ?? 0)));
    }
    return this.balances.get(uid)!;
  }

  /** For idempotent credits: returns false when the deterministic transaction doc already exists. */
  async reserve(uid: string, docId: string): Promise<boolean> {
    const snap = await this.tx.get(db.doc(`users/${uid}/wallet_transactions/${docId}`));
    if (snap.exists) {
      this.skip.add(`${uid}/${docId}`);
      return false;
    }
    return true;
  }

  balance(uid: string): number {
    return this.balances.get(uid) ?? 0;
  }

  credit(uid: string, amount: number, paymentType: string, message: string, orderId: string | null = null, txnId?: string | null, docId?: string) {
    return this.apply(uid, 'credit', amount, paymentType, message, orderId, txnId, docId);
  }

  debit(uid: string, amount: number, paymentType: string, message: string, orderId: string | null = null, txnId?: string | null, docId?: string) {
    return this.apply(uid, 'debit', amount, paymentType, message, orderId, txnId, docId);
  }

  private apply(uid: string, type: 'credit' | 'debit', amount: number, paymentType: string, message: string, orderId: string | null, txnId?: string | null, docId?: string): number {
    const amt = money(amount);
    if (amt <= 0) invalid('Amount must be greater than zero.');
    if (!this.balances.has(uid)) throw new Error(`WalletLedger: balance for ${uid} not loaded`);
    if (docId && this.skip.has(`${uid}/${docId}`)) return this.balances.get(uid)!;
    const bal = this.balances.get(uid)!;
    if (type === 'debit' && bal + 0.001 < amt) precondition('Insufficient wallet balance.');
    const next = money(type === 'credit' ? bal + amt : bal - amt);
    this.balances.set(uid, next);
    this.ops.push({
      uid, type, amount: amt, balanceAfter: next, paymentType, message, orderId,
      txnId: txnId || `WT${Date.now().toString(36).toUpperCase()}${randomCode(4)}`,
      docId: docId || db.collection('_').doc().id,
    });
    return next;
  }

  /** Stage all writes. */
  commit() {
    const touched = new Set<string>();
    for (const op of this.ops) {
      touched.add(op.uid);
      this.tx.set(db.doc(`users/${op.uid}/wallet_transactions/${op.docId}`), {
        type: op.type, amount: op.amount, balance_after: op.balanceAfter, payment_type: op.paymentType, txn_id: op.txnId,
        order_id: op.orderId, message: op.message, status: 'success', created_at: now(),
      });
    }
    for (const uid of touched) this.tx.update(db.doc(`users/${uid}`), { wallet_balance: this.balances.get(uid), updated_at: now() });
    this.ops = [];
  }
}

/** Standalone single credit/debit in its own transaction. */
export async function walletApply(uid: string, type: 'credit' | 'debit', amount: number, paymentType: string, message: string, orderId: string | null = null, txnId?: string | null): Promise<number> {
  return db.runTransaction(async (tx) => {
    const l = new WalletLedger(tx);
    await l.load(uid);
    const bal = type === 'credit' ? l.credit(uid, amount, paymentType, message, orderId, txnId) : l.debit(uid, amount, paymentType, message, orderId, txnId);
    l.commit();
    return bal;
  });
}
