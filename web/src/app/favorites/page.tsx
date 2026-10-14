'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Heart } from 'lucide-react';
import { api } from '@/lib/api';
import { useCtxKey, useIsAuthed } from '@/hooks';
import AccountShell from '@/components/account/AccountShell';
import { ProductGrid } from '@/components/product/ProductRail';
import { EmptyState } from '@/components/ui';

export default function FavoritesPage() {
  const authed = useIsAuthed();
  const ctx = useCtxKey();
  const q = useQuery({ queryKey: ['favorites', ...ctx], queryFn: api.favorites, enabled: authed });
  return (
    <AccountShell title="Favourites">
      <div className="card p-5">
        <h1 className="mb-4 text-xl font-bold">My Favourites</h1>
        {q.data?.length === 0 ? (
          <EmptyState icon={<Heart className="h-9 w-9" />} title="No favourites yet" subtitle="Tap the heart on any product to save it here." action={<Link href="/" className="btn-primary">Explore products</Link>} />
        ) : (
          <ProductGrid products={q.data || []} loading={q.isLoading} cols="lg:grid-cols-4" />
        )}
      </div>
    </AccountShell>
  );
}
