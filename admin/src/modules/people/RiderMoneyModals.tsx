'use client';
// Collect cash (collectCash) and pay earnings (payEarnings) modals — shared by the rider detail, cash collection and earnings pages.
import { useEffect, useState } from 'react';
import { HandCoins, Send } from 'lucide-react';
import { collectCash, payEarnings } from '@/lib/callables';
import { errMsg, money } from '@/lib/format';
import { cx, Toggle } from '@/components/ui';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/toast';
import { Input, Select, Textarea } from '@/components/form/fields';

export interface CashTarget { id: string; name?: string; cash: number }

export function CollectCashModal({ open, onClose, boys, initial, onDone }: { open: boolean; onClose: () => void; boys: CashTarget[]; initial?: CashTarget | null; onDone: () => void }) {
  const toast = useToast();
  const [sel, setSel] = useState<CashTarget | null>(initial || null);
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setSel(initial || null); setAmount(initial?.cash ? String(initial.cash) : ''); setMessage(''); } }, [open, initial?.id]);
  const list = initial && !boys.some((b) => b.id === initial.id) ? [initial, ...boys] : boys;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sel) return;
    const a = Number(amount);
    if (!(a > 0)) { toast('Enter a valid amount', 'error'); return; }
    if (a > sel.cash + 0.001) { toast(`Amount exceeds cash in hand (${money(sel.cash)})`, 'error'); return; }
    setBusy(true);
    try { await collectCash({ delivery_boy_id: sel.id, amount: a, message: message.trim() || undefined }); toast('Cash collected'); onClose(); onDone(); }
    catch (err) { toast(errMsg(err), 'error'); }
    setBusy(false);
  };
  return (
    <Modal open={open} onClose={onClose} title="Collect Cash" size="md">
      <form onSubmit={submit} className="p-5 space-y-4">
        <Select label="Delivery Boy" required placeholder="Select delivery boy" value={sel?.id || ''}
          options={list.map((b) => ({ value: b.id, label: `${b.name || b.id} — ${money(b.cash)}` }))}
          onChange={(e) => { const b = list.find((x) => x.id === e.target.value) || null; setSel(b); setAmount(b?.cash ? String(b.cash) : ''); }} />
        {sel && (
          <div className="rounded-xl bg-red-50 dark:bg-red-500/10 px-4 py-3 flex items-center justify-between">
            <span className="text-sm text-red-700">Cash in hand</span><span className="font-extrabold text-red-600">{money(sel.cash)}</span>
          </div>
        )}
        <Input label="Amount" type="number" step="0.01" min={0.01} max={sel?.cash || undefined} required value={amount} onChange={(e) => setAmount(e.target.value)} />
        <Textarea label="Message" rows={2} placeholder="e.g. Cash received at store counter" value={message} onChange={(e) => setMessage(e.target.value)} />
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={!sel || busy} data-testid="collect-cash"><HandCoins className="w-4 h-4" /> {busy ? 'Saving…' : 'Collect'}</button>
        </div>
      </form>
    </Modal>
  );
}

export function PayoutModal({ open, onClose, boy, pending, initialMode = 'pending', onDone }: {
  open: boolean; onClose: () => void; boy: { id: string; name?: string } | null; pending: number; initialMode?: 'pending' | 'entry'; onDone: () => void;
}) {
  const toast = useToast();
  const [mode, setMode] = useState<'pending' | 'entry'>(initialMode);
  const [type, setType] = useState<'bonus' | 'salary'>('bonus');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [credit, setCredit] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setMode(initialMode); setType('bonus'); setAmount(''); setNote(''); setCredit(true); } }, [open, initialMode]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!boy) return;
    if (mode === 'pending' && pending <= 0) { toast('No pending earnings to pay.', 'error'); return; }
    setBusy(true);
    try {
      // type 'commission' without amount = pay all pending entries; credit_wallet is accepted by the function (not in the typed wrapper).
      const payload = mode === 'pending'
        ? { delivery_boy_id: boy.id, type: 'commission' as const, message: note || undefined, credit_wallet: credit }
        : { delivery_boy_id: boy.id, type, amount: Number(amount), message: note || undefined, credit_wallet: credit };
      const r = await payEarnings(payload as Parameters<typeof payEarnings>[0]);
      toast(r?.paid != null ? `Paid ${money(r.paid)}` : 'Payout recorded'); onClose(); onDone();
    } catch (err) { toast(errMsg(err), 'error'); }
    setBusy(false);
  };
  return (
    <Modal open={open} onClose={onClose} title="Delivery Boy Payout" size="md">
      <form onSubmit={submit} className="p-5 space-y-4">
        <p className="text-sm text-muted">Delivery boy: <span className="font-semibold text-navy dark:text-white">{boy?.name}</span></p>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className={cx('chip justify-center !py-2', mode === 'pending' && 'chip-active')} onClick={() => setMode('pending')}>Pay pending earnings</button>
          <button type="button" className={cx('chip justify-center !py-2', mode === 'entry' && 'chip-active')} onClick={() => setMode('entry')}>Bonus / Salary</button>
        </div>
        {mode === 'pending' ? (
          <div className="rounded-xl bg-amber-50 dark:bg-amber-500/10 px-4 py-3 flex items-center justify-between">
            <span className="text-sm text-amber-700">Pending earnings</span><span className="font-extrabold text-amber-700">{money(pending)}</span>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Select label="Type" options={[{ value: 'bonus', label: 'Bonus' }, { value: 'salary', label: 'Salary' }]} value={type} onChange={(e) => setType(e.target.value as 'bonus' | 'salary')} />
            <Input label="Amount" type="number" step="0.01" min={0.01} required value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
        )}
        <Input label="Note" placeholder="Optional note for the wallet transaction" value={note} onChange={(e) => setNote(e.target.value)} />
        <Toggle checked={credit} onChange={setCredit} label="Credit to delivery boy wallet" description="The paid amount is added to the wallet so it can be withdrawn." />
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={busy || (mode === 'pending' && pending <= 0)} data-testid="pay-earnings"><Send className="w-4 h-4" /> {busy ? 'Paying…' : 'Confirm'}</button>
        </div>
      </form>
    </Modal>
  );
}
