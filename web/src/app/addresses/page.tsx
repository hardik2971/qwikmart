'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { MapPinned, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import type { Address, Id } from '@/lib/types';
import { useIsAuthed } from '@/hooks';
import AccountShell from '@/components/account/AccountShell';
import AddressForm from '@/components/checkout/AddressForm';
import { EmptyState } from '@/components/ui';

export default function AddressesPage() {
  const authed = useIsAuthed();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['addresses'], queryFn: api.addresses, enabled: authed });
  const [editing, setEditing] = useState<Address | null | undefined>(undefined);
  const del = useMutation({
    mutationFn: (id: Id) => api.deleteAddress(id),
    onSuccess: () => {
      toast.success('Address deleted');
      qc.invalidateQueries({ queryKey: ['addresses'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const makeDefault = useMutation({
    mutationFn: (id: Id) => api.updateAddress(id, { is_default: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['addresses'] }),
  });
  return (
    <AccountShell title="Addresses">
      <div className="card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">Saved Addresses</h1>
          <button onClick={() => setEditing(null)} className="btn-primary">
            <Plus className="h-4 w-4" /> Add Address
          </button>
        </div>
        {q.isLoading && <div className="skeleton h-28" />}
        {q.data?.length === 0 && <EmptyState icon={<MapPinned className="h-9 w-9" />} title="No saved addresses" subtitle="Add an address for faster checkout." />}
        <div className="grid gap-3 md:grid-cols-2">
          {q.data?.map((a) => (
            <div key={a.id} className="rounded-card border border-line p-4">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 font-semibold text-ink">
                  {a.label}
                  {a.is_default && <span className="rounded-full bg-primary-50 px-2 py-0.5 text-[10px] font-bold text-primary">DEFAULT</span>}
                </span>
                <div className="flex gap-1">
                  {!a.is_default && (
                    <button onClick={() => makeDefault.mutate(a.id)} className="rounded-full p-1.5 text-muted hover:bg-soft" title="Make default">
                      <Star className="h-4 w-4" />
                    </button>
                  )}
                  <button onClick={() => setEditing(a)} className="rounded-full p-1.5 text-muted hover:bg-soft" title="Edit">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button onClick={() => confirm('Delete this address?') && del.mutate(a.id)} className="rounded-full p-1.5 text-danger hover:bg-red-50" title="Delete">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="mt-2 text-sm text-ink">{a.name}</div>
              <div className="text-sm text-muted">
                {a.address_line}
                {a.landmark ? `, ${a.landmark}` : ''}, {a.city}, {a.state} {a.pincode}
              </div>
              <div className="mt-1 text-xs text-muted">{a.phone}</div>
            </div>
          ))}
        </div>
      </div>
      {editing !== undefined && <AddressForm open onClose={() => setEditing(undefined)} initial={editing} />}
    </AccountShell>
  );
}
