'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import { api } from '@/lib/api';
import { Breadcrumbs, EmptyState } from '@/components/ui';

export default function CmsPage() {
  const { slug } = useParams<{ slug: string }>();
  const q = useQuery({ queryKey: ['page', slug], queryFn: () => api.page(slug) });
  return (
    <div className="container max-w-4xl py-5">
      <Breadcrumbs items={[{ label: q.data?.title || slug }]} />
      {q.isLoading ? (
        <div className="skeleton mt-6 h-96" />
      ) : !q.data ? (
        <EmptyState icon={<FileText className="h-9 w-9" />} title="Page not found" action={<Link href="/" className="btn-primary">Go home</Link>} />
      ) : (
        <article className="card mt-6 p-6 md:p-10">
          <h1 className="text-3xl font-extrabold">{q.data.title}</h1>
          <div className="prose-sb mt-6" dangerouslySetInnerHTML={{ __html: q.data.content }} />
        </article>
      )}
    </div>
  );
}
