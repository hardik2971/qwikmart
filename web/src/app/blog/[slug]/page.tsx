'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Calendar, Clock, Eye, Newspaper, Share2 } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import BlogSidebar from '@/components/blog/BlogSidebar';
import { Breadcrumbs, EmptyState } from '@/components/ui';

export default function BlogDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const q = useQuery({ queryKey: ['blog', slug], queryFn: () => api.blog(slug) });
  const b = q.data;
  const share = async () => {
    const url = window.location.href;
    if (navigator.share) await navigator.share({ title: b?.title, url }).catch(() => null);
    else {
      await navigator.clipboard.writeText(url).catch(() => null);
      toast.success('Link copied');
    }
  };
  return (
    <div className="container py-5">
      <Breadcrumbs items={[{ label: 'Blog', href: '/blog' }, { label: b?.title || '…' }]} />
      <div className="mt-5 grid items-start gap-6 lg:grid-cols-[1fr_300px]">
        {q.isLoading ? (
          <div className="skeleton h-[600px]" />
        ) : !b ? (
          <EmptyState icon={<Newspaper className="h-9 w-9" />} title="Article not found" action={<Link href="/blog" className="btn-primary">Back to blog</Link>} />
        ) : (
          <article className="card overflow-hidden">
            <div className="relative aspect-[16/8] bg-soft">
              <Image src={b.image} alt={b.title} fill priority sizes="(max-width:1024px) 100vw, 900px" className="object-cover" />
            </div>
            <div className="p-5 md:p-8">
              {b.category && (
                <Link href={`/blog?category=${b.category.slug}`} className="rounded-md bg-primary px-2 py-0.5 text-xs font-semibold text-white">
                  {b.category.name}
                </Link>
              )}
              <h1 className="mt-3 text-2xl font-extrabold leading-tight md:text-3xl">{b.title}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted">
                <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> {formatDate(b.created_at, false)}</span>
                <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {b.read_minutes} min read</span>
                <span className="flex items-center gap-1"><Eye className="h-3.5 w-3.5" /> {b.views} views</span>
                <button onClick={share} className="ms-auto flex items-center gap-1 font-semibold text-primary">
                  <Share2 className="h-3.5 w-3.5" /> Share
                </button>
              </div>
              <div className="prose-sb mt-6" dangerouslySetInnerHTML={{ __html: b.content || `<p>${b.excerpt}</p>` }} />
            </div>
            {b.related && b.related.length > 0 && (
              <div className="border-t border-line p-5 md:p-8">
                <h2 className="mb-4 font-bold">Related articles</h2>
                <div className="grid gap-4 sm:grid-cols-3">
                  {b.related.map((r) => (
                    <Link key={r.id} href={`/blog/${r.slug}`} className="group">
                      <span className="relative block aspect-[16/10] overflow-hidden rounded-lg bg-soft">
                        <Image src={r.image} alt="" fill sizes="300px" className="object-cover" />
                      </span>
                      <span className="mt-2 line-clamp-2 block text-sm font-semibold text-ink group-hover:text-primary">{r.title}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </article>
        )}
        <BlogSidebar active={b?.category?.slug} />
      </div>
    </div>
  );
}
