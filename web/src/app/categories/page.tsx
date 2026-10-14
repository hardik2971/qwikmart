'use client';

import Image from 'next/image';
import Link from 'next/link';
import { CatIcon } from '@/components/home/CategoryStrip';
import { useCategoryTree } from '@/components/product/ProductListing';
import { Breadcrumbs, PageTitle } from '@/components/ui';

export default function CategoriesPage() {
  const tree = useCategoryTree();
  return (
    <div className="container py-5">
      <Breadcrumbs items={[{ label: 'Categories' }]} />
      <div className="mt-4">
        <PageTitle title="All Categories" subtitle="Browse everything available in your area" />
      </div>
      {tree.isLoading && (
        <div className="space-y-6">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-40" />
          ))}
        </div>
      )}
      <div className="space-y-8">
        {tree.data?.map((c) => (
          <section key={c.id} className="card overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-5 py-4" style={{ background: c.header_color ? `${c.header_color}80` : undefined }}>
              <Link href={`/category/${c.slug}`} className="flex items-center gap-3">
                <CatIcon icon={c.icon} size={32} />
                <h2 className="text-lg font-bold">{c.name}</h2>
              </Link>
              <Link href={`/category/${c.slug}`} className="text-sm font-semibold text-primary">
                View all
              </Link>
            </div>
            <div className="grid grid-cols-3 gap-3 p-4 sm:grid-cols-5 lg:grid-cols-8">
              {c.children?.map((s) => (
                <Link key={s.id} href={`/category/${s.slug}`} className="group text-center">
                  <span className="relative block aspect-square overflow-hidden rounded-xl bg-soft">
                    {s.image && <Image src={s.image} alt={s.name} fill sizes="120px" className="object-cover transition group-hover:scale-105" />}
                  </span>
                  <span className="mt-1.5 line-clamp-2 block text-xs font-medium text-ink">{s.name}</span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
