import { Timestamp } from 'firebase/firestore';
import type { Trans } from './types';
import { firebaseConfig, USE_EMULATORS, EMU_HOST, EMU_PORT } from './firebase';

export function toDate(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (v instanceof Timestamp) return v.toDate();
  if (typeof v?.toDate === 'function') return v.toDate();
  if (typeof v?.seconds === 'number') return new Date(v.seconds * 1000);
  if (typeof v === 'string' || typeof v === 'number') { const d = new Date(v); return isNaN(+d) ? null : d; }
  return null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n: number) => String(n).padStart(2, '0');

/** "12 Oct 2026" */
export function fmtDate(v: any): string {
  const d = toDate(v); if (!d) return '—';
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
/** "12 Oct 2026, 02:15 PM" */
export function fmtDateTime(v: any): string {
  const d = toDate(v); if (!d) return '—';
  let h = d.getHours(); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
  return `${fmtDate(d)}, ${pad(h)}:${pad(d.getMinutes())} ${ap}`;
}
export function timeAgo(v: any): string {
  const d = toDate(v); if (!d) return '';
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hours ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} days ago`;
  return fmtDate(d);
}
/** yyyy-mm-dd in local time */
export function ymd(d: Date): string { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

let _currency = '₹';
export function setCurrencySymbol(s: string) { _currency = s || '₹'; }
export function money(n: any, symbol?: string): string {
  const v = Number(n || 0);
  return `${symbol ?? _currency}${v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
export function num(n: any): string { return Number(n || 0).toLocaleString('en-IN'); }

/** Pick a translation: field[lang] ?? field.en ?? first value. */
export function tr(v: Trans | string | null | undefined, lang = 'en'): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  return v[lang] || v.en || Object.values(v).find(Boolean) || '';
}

export function slugify(s: string): string {
  return (s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function statusColor(status: any): 'green' | 'amber' | 'blue' | 'purple' | 'cyan' | 'red' | 'gray' {
  if (typeof status === 'boolean') status = status ? 'active' : 'inactive';
  switch (String(status ?? '').toLowerCase()) {
    case 'delivered': case 'active': case 'approved': case 'success': case 'paid': case 'credited': case 'refund_completed': case 'published':
    case 'open': case 'credit': case 'collected_from_customer': case 'yes': case 'online': case '1': case 'quick': return 'green';
    case 'pending': case 'payment_pending': case 'draft': case 'pending_approval': case 'ready_for_pickup': case 'ecommerce': return 'amber';
    case 'received': case 'processed': case 'pickup_assigned': case 'info': case 'submitted_to_admin': case 'both': return 'blue';
    case 'shipped': case 'picked_up': case 'returned': case 'self_pickup': return 'purple';
    case 'out_for_delivery': return 'cyan';
    case 'cancelled': case 'rejected': case 'failed': case 'inactive': case 'debit': case 'closed': case 'refunded': case 'no': case 'offline': case '0': return 'red';
    default: return 'gray';
  }
}
export function statusLabel(status: any): string {
  if (typeof status === 'boolean' || status === 1 || status === 0 || status === '1' || status === '0') return status ? 'Active' : 'Inactive';
  if (status === 'ecommerce') return 'eCommerce';
  return String(status ?? '').replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Resolve an image field: full URL, data URI, or a Storage path (served from the emulator or prod bucket). */
export function imgUrl(v?: string | null, fallbackText?: string): string {
  if (!v) return fallbackText ? `https://placehold.co/200x200/E6F4E9/0E9623?text=${encodeURIComponent(fallbackText.slice(0, 2).toUpperCase())}` : '';
  if (/^(https?:|data:|blob:)/.test(v) || v.startsWith('/')) return v;
  const bucket = firebaseConfig.storageBucket;
  const base = USE_EMULATORS ? `http://${EMU_HOST}:${EMU_PORT.storage}` : 'https://firebasestorage.googleapis.com';
  return `${base}/v0/b/${bucket}/o/${encodeURIComponent(v)}?alt=media`;
}
export function avatarUrl(v?: string | null, name?: string): string {
  return v ? imgUrl(v) : `https://ui-avatars.com/api/?background=E6F4E9&color=0E9623&name=${encodeURIComponent(name || 'User')}`;
}

/** Country flag emoji from ISO2 or stored emoji. */
export function flagEmoji(flag?: string | null, iso2?: string | null): string {
  if (flag && !flag.includes('/') && !flag.includes('.')) return flag;
  if (!iso2 || iso2.length !== 2) return '🏳️';
  return String.fromCodePoint(...iso2.toUpperCase().split('').map((c) => 127397 + c.charCodeAt(0)));
}

export function greeting(d = new Date()): string {
  const h = d.getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

/** Build search keyword prefixes the same way the backend triggers do (for docs created client-side before the trigger runs). */
export function searchKeywords(...values: (string | Trans | null | undefined)[]): string[] {
  const out = new Set<string>();
  for (const v of values) {
    const texts = typeof v === 'string' ? [v] : v ? Object.values(v) : [];
    for (const t of texts) for (const w of String(t || '').toLowerCase().split(/[^\p{L}\p{N}@.+]+/u)) {
      for (let i = 2; i <= Math.min(15, w.length); i++) out.add(w.slice(0, i));
    }
  }
  return [...out].slice(0, 400);
}

export function errMsg(e: any): string { return e?.message || String(e || 'Something went wrong'); }

/** Search input → words, normalised exactly like the backend `searchKeywords()` (functions/src/shared/util.ts). */
export function searchTerms(q: string): string[] {
  // Same normalisation as backend keywordWords(): drop apostrophes ("Lay's" → "lays"), split on other punctuation.
  return (q || '').toLowerCase().normalize('NFKC').replace(/['’‘`´]/gu, '').split(/[\s,./()\-_+&|:;"!?#@]+/u).filter(Boolean);
}
/** Server-side array-contains value: the phrase prefix (keywords hold ≤15-char prefixes of every word and of the whole phrase). */
export function searchKey(terms: string[]): string { return terms.join(' ').slice(0, 15); }
