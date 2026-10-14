'use client';

import { Suspense, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Calendar, Clock, Newspaper, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import BlogSidebar from '@/components/blog/BlogSidebar';
import { Breadcrumbs, EmptyState } from '@/components/ui';

function Inner() {
  const sp = useSearchParams();
  const category = sp.get('category');
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const blogs = useQuery({
    queryKey: ['blogs', category, page, q],
    queryFn: () => api.blogs({ category: category || undefined, page, q: q || undefined }),
    placeholderData: (p) => p,
  });
  return (
    <div className="container py-5">
      <Breadcrumbs items={[{ label: 'Blog' }]} />
      <div className="mb-6 mt-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">QwikMart Blog</h1>
          <p className="text-sm text-muted">Deals, guides and tips to shop smarter.</p>
        </div>
        <label className="flex w-full items-center gap-2 rounded-btn border border-line bg-surface px-3 sm:w-72">
          <Search className="h-4 w-4 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search articles" className="h-10 flex-1 bg-transparent text-sm text-ink outline-none" />
        </label>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_300px]">
        <div>
          {blogs.data?.items.length === 0 && <EmptyState icon={<Newspaper className="h-9 w-9" />} title="No articles found" />}
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {blogs.isLoading && Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-80" />)}
            {blogs.data?.items.map((b) => (
              <article key={b.id} className="card group flex flex-col overflow-hidden transition hover:shadow-card">
                <Link href={`/blog/${b.slug}`} className="relative block aspect-[16/10] overflow-hidden bg-soft">
                  <Image src={b.image} alt={b.title} fill sizes="(max-width:768px) 100vw, 33vw" className="object-cover transition duration-300 group-hover:scale-105" />
                </Link>
                <div className="flex flex-1 flex-col p-4">
                  {b.category && <span className="w-fit rounded-md bg-primary px-2 py-0.5 text-[11px] font-semibold text-white">{b.category.name}</span>}
                  <div className="mt-2 flex items-center gap-3 text-[11px] text-muted">
                    <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {formatDate(b.created_at, false)}</span>
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {b.read_minutes} Minutes read</span>
                  </div>
                  <Link href={`/blog/${b.slug}`} className="mt-2 line-clamp-2 font-bold text-ink hover:text-primary">{b.title}</Link>
                  <p className="mt-1 line-clamp-2 text-sm text-muted">{b.excerpt}</p>
                  <Link href={`/blog/${b.slug}`} className="mt-auto inline-flex items-center gap-1 pt-3 text-sm font-semibold text-primary">
                    Read More <ArrowRight className="h-4 w-4 rtl:rotate-180" />
                  </Link>
                </div>
              </article>
            ))}
          </div>
          {blogs.data && blogs.data.meta.last_page > 1 && (
            <div className="mt-6 flex justify-center gap-2">
              {Array.from({ length: blogs.data.meta.last_page }, (_, i) => i + 1).map((n) => (
                <button key={n} onClick={() => setPage(n)} className={`h-9 w-9 rounded-lg text-sm font-semibold ${n === page ? 'bg-primary text-white' : 'border border-line bg-surface'}`}>
                  {n}
                </button>
              ))}
            </div>
          )}
        </div>
        <BlogSidebar active={category} />
      </div>
    </div>
  );
}

export default function BlogPage() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}
