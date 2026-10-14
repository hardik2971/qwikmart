'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { ChevronDown, Headset, Search } from 'lucide-react';
import { api } from '@/lib/api';
import type { Id } from '@/lib/types';
import { Breadcrumbs } from '@/components/ui';

export default function FaqPage() {
  const q = useQuery({ queryKey: ['faqs'], queryFn: api.faqs, staleTime: 600_000 });
  const [open, setOpen] = useState<Id | null>(null);
  const [term, setTerm] = useState('');
  const list = (q.data || []).filter((f) => (f.question + f.answer).toLowerCase().includes(term.toLowerCase()));
  return (
    <div className="container max-w-4xl py-5">
      <Breadcrumbs items={[{ label: 'FAQ' }]} />
      <div className="mb-6 mt-6 text-center">
        <h1 className="text-3xl font-extrabold">Frequently Asked Questions</h1>
        <p className="mt-2 text-sm text-muted">Everything you need to know about QwikMart.</p>
        <label className="mx-auto mt-5 flex max-w-md items-center gap-2 rounded-btn border border-line bg-surface px-3">
          <Search className="h-4 w-4 text-muted" />
          <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search questions" className="h-11 flex-1 bg-transparent text-sm text-ink outline-none" />
        </label>
      </div>
      <div className="space-y-3">
        {q.isLoading && Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-14" />)}
        {list.map((f) => {
          const isOpen = open === f.id;
          return (
            <div key={f.id} className={clsx('card overflow-hidden transition', isOpen && 'border-primary')}>
              <button onClick={() => setOpen(isOpen ? null : f.id)} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-start">
                <span className="font-semibold text-ink">{f.question}</span>
                <ChevronDown className={clsx('h-5 w-5 shrink-0 text-muted transition', isOpen && 'rotate-180 text-primary')} />
              </button>
              {isOpen && <div className="prose-sb px-5 pb-4 text-sm" dangerouslySetInnerHTML={{ __html: f.answer }} />}
            </div>
          );
        })}
      </div>
      <div className="card mt-8 flex flex-col items-center gap-3 p-6 text-center sm:flex-row sm:text-start">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-50 text-primary">
          <Headset className="h-6 w-6" />
        </span>
        <div className="flex-1">
          <div className="font-bold text-ink">Still have questions?</div>
          <div className="text-sm text-muted">Our support team is available 24×7.</div>
        </div>
        <Link href="/support" className="btn-primary">Chat with us</Link>
      </div>
    </div>
  );
}
