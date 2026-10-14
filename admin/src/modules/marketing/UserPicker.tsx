'use client';
// Async user search — port of components/customers/picker.blade.php.
// Admin: users where search_keywords array-contains <term>. Store panel: customers derived from the store's own orders.
import { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { fetchList, where, limit } from '@/lib/firestore';
import { avatarUrl, searchKey, searchTerms } from '@/lib/format';
import type { Order, UserDoc } from '@/lib/types';

export interface PickedUser { id: string; name: string; email?: string; phone?: string; avatar?: string; type?: string }

export function UserPicker({ label = 'User', value, onChange, storeId, types, required, error, placeholder = 'Search by name, email or phone' }: {
  label?: string; value: PickedUser | null; onChange: (u: PickedUser | null) => void; storeId?: string | null; types?: string[]; required?: boolean; error?: string; placeholder?: string;
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<PickedUser[]>([]);
  const [err, setErr] = useState('');
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  useEffect(() => {
    const terms = searchTerms(q);
    if (!terms.length) { setResults([]); return; }
    const t = setTimeout(async () => {
      setLoading(true); setErr('');
      try {
        const first = searchKey(terms);
        let out: PickedUser[] = [];
        if (storeId) {
          const orders = await fetchList<Order>('orders', where('store_id', '==', storeId), where('search_keywords', 'array-contains', first), limit(40));
          const seen = new Set<string>();
          for (const o of orders) {
            if (!o.user_id || seen.has(o.user_id)) continue;
            const text = `${o.customer?.name || ''} ${o.customer?.email || ''} ${o.customer?.phone || ''}`.toLowerCase();
            if (!terms.slice(1).every((x) => text.includes(x))) continue;
            seen.add(o.user_id);
            out.push({ id: o.user_id, name: o.customer?.name || 'Customer', email: o.customer?.email, phone: o.customer?.phone, type: 'customer' });
          }
        } else {
          const users = await fetchList<UserDoc>('users', where('search_keywords', 'array-contains', first), limit(30));
          out = users
            .filter((u) => !types?.length || types.includes(u.type))
            .filter((u) => terms.slice(1).every((x) => (u.search_keywords || []).includes(x.slice(0, 15))))
            .map((u) => ({ id: u.id, name: u.name || 'User', email: u.email, phone: u.phone, avatar: u.avatar, type: u.type }));
        }
        setResults(out.slice(0, 20)); setOpen(true);
      } catch (e: any) { setErr(e?.code === 'permission-denied' ? 'You do not have permission to search users.' : e?.message || 'Search failed'); setResults([]); setOpen(true); }
      setLoading(false);
    }, 300);
    return () => clearTimeout(t);
  }, [q, storeId, (types || []).join(',')]);

  return (
    <div ref={box} className="relative">
      {label && <span className="label">{label}{required && <span className="text-red-500"> *</span>}</span>}
      {value ? (
        <div className="flex items-center gap-3 rounded-lg border border-primary/40 bg-primary-50 px-3 py-2">
          <img src={avatarUrl(value.avatar, value.name)} className="w-8 h-8 rounded-full object-cover" alt="" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-navy truncate">{value.name}</p>
            <p className="text-xs text-muted truncate">{value.email || value.phone || value.id}{value.type ? ` · ${value.type.replace('_', ' ')}` : ''}</p>
          </div>
          <button type="button" className="text-red-400 hover:text-red-600" onClick={() => onChange(null)} aria-label="Clear"><X className="w-4 h-4" /></button>
        </div>
      ) : (
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => results.length && setOpen(true)} placeholder={placeholder} className={`input pl-9 ${error ? 'border-red-400' : ''}`} autoComplete="off" data-testid="user-picker" />
          {loading && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">…</span>}
        </div>
      )}
      {open && !value && q.trim() && (
        <div className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto rounded-lg border border-line bg-white shadow-lg dark:bg-dark-card dark:border-dark-line">
          {results.map((u) => (
            <button type="button" key={u.id} onClick={() => { onChange(u); setOpen(false); setQ(''); }} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800">
              <img src={avatarUrl(u.avatar, u.name)} className="w-7 h-7 rounded-full object-cover" alt="" />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-navy dark:text-white truncate">{u.name}</span>
                <span className="block text-xs text-muted truncate">{u.email || u.phone}</span>
              </span>
            </button>
          ))}
          {!results.length && !loading && <p className="px-3 py-3 text-sm text-muted">{err || 'No users found.'}</p>}
        </div>
      )}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}
