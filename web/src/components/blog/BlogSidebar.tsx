'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { Eye } from 'lucide-react';
import { api } from '@/lib/api';

export default function BlogSidebar({ active }: { active?: string | null }) {
  const cats = useQuery({ queryKey: ['blog-categories'], queryFn: api.blogCategories, staleTime: 600_000 });
  const all = useQuery({ queryKey: ['blogs', 'all-for-top'], queryFn: () => api.blogs({}), staleTime: 600_000 });
  const total = cats.data?.reduce((s, c) => s + (c.posts_count || 0), 0) ?? all.data?.meta.total ?? 0;
  const top = [...(all.data?.items || [])].sort((a, b) => b.views - a.views).slice(0, 4);
  return (
    <aside className="space-y-5">
      <div className="card p-4">
        <h3 className="mb-3 font-bold">Categories</h3>
        <div className="space-y-1">
          <Link href="/blog" className={clsx('flex items-center justify-between rounded-btn px-3 py-2 text-sm', !active ? 'bg-primary text-white' : 'text-ink hover:bg-soft')}>
            All <span className={clsx('text-xs', !active ? 'text-white/80' : 'text-muted')}>({total})</span>
          </Link>
          {cats.data?.map((c) => (
            <Link
              key={c.id}
              href={`/blog?category=${c.slug}`}
              className={clsx('flex items-center justify-between rounded-btn px-3 py-2 text-sm', active === c.slug ? 'bg-primary text-white' : 'text-ink hover:bg-soft')}
            >
              {c.name} <span className={clsx('text-xs', active === c.slug ? 'text-white/80' : 'text-muted')}>({c.posts_count ?? 0})</span>
            </Link>
          ))}
        </div>
      </div>
      <div className="card p-4">
        <h3 className="mb-3 font-bold underline decoration-primary decoration-2 underline-offset-4">Top Viewed Blogs</h3>
        <div className="space-y-3">
          {top.map((b) => (
            <Link key={b.id} href={`/blog/${b.slug}`} className="group flex gap-3">
              <span className="relative h-14 w-20 shrink-0 overflow-hidden rounded-lg bg-soft">
                <Image src={b.image} alt="" fill sizes="80px" className="object-cover" />
              </span>
              <span className="min-w-0">
                <span className="line-clamp-2 text-xs font-semibold text-ink group-hover:text-primary">{b.title}</span>
                <span className="mt-0.5 flex items-center gap-1 text-[11px] text-muted">
                  <Eye className="h-3 w-3" /> {b.views} views
                </span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </aside>
  );
}
