'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Search, TrendingUp, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useCtxKey, useDebounced } from '@/hooks';

const HINTS_QUICK = ['McCain Samosa Cheese Corn', 'Amul Taaza Toned Milk', 'Aashirvaad Atta', 'Alphonso Mango', 'Lay\'s Magic Masala', 'Fresh Paneer'];
const HINTS_ECOM = ['boAt Rockerz 450', 'iPhone 17 Pro Max', 'Noise Smart Watch', 'Levi\'s T-Shirt', 'Prestige Pressure Cooker'];

export default function SearchBar({ initial = '' }: { initial?: string }) {
  const t = useT();
  const router = useRouter();
  const ctx = useCtxKey();
  const [q, setQ] = useState(initial);
  const [open, setOpen] = useState(false);
  const [hint, setHint] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const dq = useDebounced(q.trim(), 250);
  const hints = ctx[0] === 'ecommerce' ? HINTS_ECOM : HINTS_QUICK;

  useEffect(() => {
    const id = setInterval(() => setHint((h) => h + 1), 2600);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const sugg = useQuery({
    queryKey: ['suggest', dq, ...ctx],
    queryFn: () => api.suggestions(dq),
    enabled: open && dq.length > 1,
  });
  const trending = useQuery({ queryKey: ['trending'], queryFn: api.trending, enabled: open, staleTime: 600_000 });

  const go = (term: string) => {
    if (!term.trim()) return;
    setOpen(false);
    router.push(`/products?q=${encodeURIComponent(term.trim())}`);
  };

  return (
    <div ref={box} className="relative w-full">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          go(q);
        }}
        className="flex h-11 items-center gap-2.5 rounded-btn border border-black/5 bg-surface px-3.5 shadow-soft focus-within:border-primary"
      >
        <Search className="h-[18px] w-[18px] shrink-0 text-muted" />
        <div className="relative flex-1">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => setOpen(true)}
            className="w-full bg-transparent text-sm text-ink outline-none"
            aria-label={t('search')}
          />
          {!q && (
            <div className="pointer-events-none absolute inset-0 flex items-center gap-1.5 overflow-hidden text-sm">
              <span className="shrink-0 text-muted">{t('looking_for')}</span>
              <span key={hint} className="animate-slide-up truncate font-medium text-ink/80">
                {hints[hint % hints.length]}
              </span>
            </div>
          )}
        </div>
        {q && (
          <button type="button" onClick={() => setQ('')} className="text-muted hover:text-ink" aria-label="Clear">
            <X className="h-4 w-4" />
          </button>
        )}
      </form>

      {open && (
        <div className="absolute inset-x-0 top-12 z-50 max-h-[70vh] overflow-y-auto rounded-card border border-line bg-surface p-3 shadow-pop">
          {dq.length > 1 && sugg.data && (sugg.data.products.length > 0 || sugg.data.categories.length > 0) ? (
            <div className="space-y-1">
              {sugg.data.categories.map((c) => (
                <Link
                  key={'c' + c.id}
                  href={`/category/${c.slug}`}
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-between rounded-lg px-2 py-2 text-sm hover:bg-soft"
                >
                  <span className="font-medium text-ink">{c.name}</span>
                  <span className="text-xs text-muted">in Categories</span>
                </Link>
              ))}
              {sugg.data.products.map((p) => (
                <Link
                  key={p.id}
                  href={`/product/${p.slug}`}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-soft"
                >
                  <Image src={p.thumbnail} alt="" width={36} height={36} className="rounded-md border border-line" />
                  <span className="line-clamp-1 text-ink">{p.name}</span>
                </Link>
              ))}
              <button onClick={() => go(q)} className="w-full rounded-lg px-2 py-2 text-start text-sm font-semibold text-primary hover:bg-primary-50">
                See all results for “{q}”
              </button>
            </div>
          ) : dq.length > 1 && sugg.isFetching ? (
            <div className="space-y-2 p-1">
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton h-8" />
              ))}
            </div>
          ) : (
            <div>
              <div className="mb-2 flex items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-muted">
                <TrendingUp className="h-3.5 w-3.5" /> Trending searches
              </div>
              <div className="flex flex-wrap gap-2">
                {(trending.data || []).map((s) => (
                  <button key={s} onClick={() => go(s)} className="chip text-xs">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
