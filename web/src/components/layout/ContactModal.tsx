'use client';

import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { CheckCircle2, Clock, Mail, PhoneCall, SendHorizonal } from 'lucide-react';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { useAuthStore } from '@/store';
import { Modal, Spinner } from '../ui';
import { useSettings } from './TopBar';

const TOPICS = [
  { key: 'order', label: 'Order issue' },
  { key: 'payment', label: 'Payment / refund' },
  { key: 'delivery', label: 'Delivery' },
  { key: 'return', label: 'Return / replacement' },
  { key: 'account', label: 'Account / login' },
  { key: 'partner', label: 'Sell or deliver with us' },
  { key: 'feedback', label: 'Feedback / suggestion' },
  { key: 'other', label: 'Something else' },
] as const;
const ORDER_TOPICS = ['order', 'payment', 'delivery', 'return'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const empty = { name: '', email: '', phone: '', topic: 'order', order_no: '', message: '', website: '' };

/** "Contact us" popup: details from settings/public + a form posted to submitContactMessage. */
export default function ContactModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: s } = useSettings();
  const user = useAuthStore((st) => st.user);
  const [f, setF] = useState(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [ticket, setTicket] = useState<string | null>(null);

  // prefill from the signed-in customer each time the popup opens
  useEffect(() => {
    if (!open) return;
    setTicket(null);
    setErrors({});
    setF((v) => ({ ...v, name: v.name || user?.name || '', email: v.email || user?.email || '', phone: v.phone || user?.phone || '' }));
  }, [open, user]);

  const set = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setF((v) => ({ ...v, [k]: e.target.value }));
    setErrors((er) => ({ ...er, [k]: '' }));
  };

  const send = useMutation({
    mutationFn: () => api.contact({ ...f, order_no: ORDER_TOPICS.includes(f.topic) ? f.order_no : '', source: 'website' }),
    onSuccess: (r) => {
      setTicket(r.ticket ?? 'received');
      setF({ ...empty, name: f.name, email: f.email, phone: f.phone });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (!f.name.trim()) er.name = 'Please enter your name';
    if (!EMAIL_RE.test(f.email.trim())) er.email = 'Please enter a valid e-mail';
    if (f.phone.trim() && !/^\+?[\d\s-]{7,20}$/.test(f.phone.trim())) er.phone = 'Please enter a valid phone number';
    if (f.message.trim().length < 10) er.message = 'Please tell us a little more (at least 10 characters)';
    setErrors(er);
    if (Object.keys(er).length === 0) send.mutate();
  };

  const phone = s?.support_phone;
  const email = s?.support_email;
  const field = (k: string) => (errors[k] ? 'input border-red-400 focus:border-red-500' : 'input');
  const msg = (k: string) => errors[k] && <p className="mt-1 text-xs text-red-500">{errors[k]}</p>;

  return (
    <Modal open={open} onClose={onClose} size="lg" title="Contact us">
      <div className="grid gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <aside className="order-last space-y-3 rounded-2xl bg-soft p-5 text-sm md:order-none">
          <p className="text-base font-bold text-ink">We&apos;re here to help</p>
          <p className="text-muted">Questions about an order, a payment or your account? Send us a message and our team will reply by e-mail.</p>
          {phone && (
            <a href={`tel:${phone.replace(/\s+/g, '')}`} className="flex items-center gap-3 rounded-xl bg-surface p-3 hover:text-primary">
              <PhoneCall className="h-5 w-5 shrink-0 text-primary" /> <span className="font-semibold">{phone}</span>
            </a>
          )}
          {email && (
            <a href={`mailto:${email}`} className="flex items-center gap-3 rounded-xl bg-surface p-3 hover:text-primary">
              <Mail className="h-5 w-5 shrink-0 text-primary" /> <span className="break-all font-semibold">{email}</span>
            </a>
          )}
          <div className="flex items-start gap-3 rounded-xl bg-surface p-3">
            <Clock className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <span>
              <span className="block font-semibold text-ink">Support hours</span>
              <span className="text-muted">7 AM – 11 PM, every day. We reply within 24 hours.</span>
            </span>
          </div>
          {s?.company_address && <p className="pt-1 text-xs text-muted">{s.company_name ? `${s.company_name}, ` : ''}{s.company_address}</p>}
        </aside>

        {ticket ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <CheckCircle2 className="h-14 w-14 text-primary" />
            <h3 className="mt-4 text-xl font-bold text-ink">Message sent</h3>
            <p className="mt-2 max-w-sm text-muted">
              Thank you! {ticket !== 'received' && <>Your ticket number is <b className="text-ink">{ticket}</b>. </>}We&apos;ll get back to you at{' '}
              <b className="text-ink">{f.email}</b> soon.
            </p>
            <div className="mt-6 flex gap-3">
              <button type="button" className="btn-outline" onClick={() => setTicket(null)}>Send another</button>
              <button type="button" className="btn-primary" onClick={onClose}>Done</button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="c-name">Full name *</label>
                <input id="c-name" value={f.name} onChange={set('name')} className={field('name')} maxLength={80} autoComplete="name" />
                {msg('name')}
              </div>
              <div>
                <label className="label" htmlFor="c-email">E-mail *</label>
                <input id="c-email" type="email" value={f.email} onChange={set('email')} className={field('email')} maxLength={120} autoComplete="email" />
                {msg('email')}
              </div>
              <div>
                <label className="label" htmlFor="c-phone">Phone</label>
                <input id="c-phone" type="tel" value={f.phone} onChange={set('phone')} className={field('phone')} maxLength={20} autoComplete="tel" placeholder="+91 98765 43210" />
                {msg('phone')}
              </div>
              <div>
                <label className="label" htmlFor="c-topic">Topic</label>
                <select id="c-topic" value={f.topic} onChange={set('topic')} className="input">
                  {TOPICS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
              </div>
            </div>
            {ORDER_TOPICS.includes(f.topic) && (
              <div>
                <label className="label" htmlFor="c-order">Order number (optional)</label>
                <input id="c-order" value={f.order_no} onChange={set('order_no')} className="input" maxLength={40} placeholder="e.g. QM-ORD-00620" />
              </div>
            )}
            <div>
              <label className="label" htmlFor="c-msg">Message *</label>
              <textarea id="c-msg" value={f.message} onChange={set('message')} rows={5} maxLength={2000} className={`${field('message')} h-auto py-3`} placeholder="How can we help you?" />
              <div className="flex justify-between">{msg('message') || <span />}<span className="mt-1 text-xs text-muted">{f.message.length}/2000</span></div>
            </div>
            {/* honeypot — hidden from people, filled by bots */}
            <input value={f.website} onChange={set('website')} name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />
            <button type="submit" disabled={send.isPending} className="btn-primary w-full">
              {send.isPending ? <Spinner /> : <SendHorizonal className="h-4 w-4" />} Send message
            </button>
            <p className="text-center text-xs text-muted">By sending this form you agree that we use your details to answer your request, as described in our Privacy Policy.</p>
          </form>
        )}
      </div>
    </Modal>
  );
}
