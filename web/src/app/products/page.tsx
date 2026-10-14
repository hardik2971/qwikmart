'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import ProductListing from '@/components/product/ProductListing';
import { Breadcrumbs } from '@/components/ui';

function Inner() {
  const q = useSearchParams().get('q');
  return (
    <div className="container py-5">
      <Breadcrumbs items={[{ label: 'Products' }, ...(q ? [{ label: `“${q}”` }] : [])]} />
      <div className="mt-4">
        <ProductListing />
      </div>
    </div>
  );
}

export default function ProductsPage() {
  return (
    <Suspense fallback={<div className="container py-10"><div className="skeleton h-96" /></div>}>
      <Inner />
    </Suspense>
  );
}
