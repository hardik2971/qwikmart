'use client';

import { Suspense, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import ProductListing, { flattenTree, useCategoryTree } from '@/components/product/ProductListing';
import { Breadcrumbs, EmptyState } from '@/components/ui';
import { useUiStore } from '@/store';
import { FolderSearch } from 'lucide-react';

function Inner() {
  const { slug } = useParams<{ slug: string }>();
  const tree = useCategoryTree();
  const setActive = useUiStore((s) => s.setActiveCategory);
  const all = useMemo(() => flattenTree(tree.data), [tree.data]);
  // banners / home sections may link by category id (`/category/12`) as well as by slug
  const cat = all.find((c) => c.slug === slug) || all.find((c) => String(c.id) === slug) || null;
  const parent = cat?.parent_id ? all.find((c) => c.id === cat.parent_id) : null;
  const top = parent || cat;

  useEffect(() => {
    if (top) setActive(null, top.header_color ?? null);
    return () => setActive(null, null);
  }, [top, setActive]);

  if (tree.isLoading) return <div className="container py-8"><div className="skeleton h-96" /></div>;
  if (!cat)
    return (
      <EmptyState
        icon={<FolderSearch className="h-9 w-9" />}
        title="Category not found"
        subtitle="This category may not be available in your area or mode."
        action={<Link href="/categories" className="btn-primary">Browse categories</Link>}
      />
    );

  // Layout like the reference: breadcrumb, then the filters + products listing (category navigation lives in the
  // sidebar tree, so there is no separate title / sub-category strip here).
  return (
    <div className="container py-5">
      <Breadcrumbs items={[...(parent ? [{ label: parent.name, href: `/category/${parent.slug}` }] : []), { label: cat.name }]} />
      <h1 className="sr-only">{cat.name}</h1>
      <div className="mt-4">
        <ProductListing category={cat} />
      </div>
    </div>
  );
}

export default function CategoryPage() {
  return (
    <Suspense fallback={<div className="container py-8"><div className="skeleton h-96" /></div>}>
      <Inner />
    </Suspense>
  );
}
