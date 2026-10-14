'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { Briefcase, Crosshair, Home, MapPin } from 'lucide-react';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import type { Address } from '@/lib/types';
import { useAuthStore, useLocationStore } from '@/store';
import { Modal, Spinner } from '../ui';

const PinMap = dynamic(() => import('../map/PinMap'), {
  ssr: false,
  loading: () => <div className="skeleton h-[260px] w-full" />,
});

type Draft = Omit<Address, 'id'>;

async function reverse(lat: number, lng: number) {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&addressdetails=1&lat=${lat}&lon=${lng}`);
    return (await r.json()) as {
      display_name?: string;
      address?: Record<string, string>;
    };
  } catch {
    return null;
  }
}

export default function AddressForm({
  open,
  onClose,
  initial,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  initial?: Address | null;
  onSaved?: (a: Address) => void;
}) {
  const user = useAuthStore((s) => s.user);
  const loc = useLocationStore();
  const qc = useQueryClient();
  const [d, setD] = useState<Draft>(() => ({
    label: initial?.label || 'Home',
    name: initial?.name || user?.name || '',
    phone: initial?.phone || user?.phone || '',
    address_line: initial?.address_line || '',
    landmark: initial?.landmark || '',
    city: initial?.city || loc.zone?.city || 'Mumbai',
    state: initial?.state || 'Maharashtra',
    pincode: initial?.pincode || '',
    country_id: initial?.country_id || loc.country?.id || 1,
    lat: initial?.lat || loc.lat || 19.1036,
    lng: initial?.lng || loc.lng || 72.889,
    is_default: initial?.is_default ?? false,
  }));
  const [locating, setLocating] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));

  const onPin = async (lat: number, lng: number) => {
    setD((x) => ({ ...x, lat, lng }));
    const r = await reverse(lat, lng);
    if (r?.address) {
      const a = r.address;
      setD((x) => ({
        ...x,
        address_line: x.address_line || [a.road, a.neighbourhood, a.suburb].filter(Boolean).join(', '),
        city: a.city || a.town || a.state_district || x.city,
        state: a.state || x.state,
        pincode: a.postcode || x.pincode,
      }));
    }
  };

  const locate = () => {
    if (!navigator.geolocation) return toast.error('Geolocation not supported');
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        onPin(p.coords.latitude, p.coords.longitude);
      },
      () => {
        setLocating(false);
        toast.error('Unable to get location');
      },
    );
  };

  const save = useMutation({
    mutationFn: () => (initial ? api.updateAddress(initial.id, d) : api.addAddress(d)),
    onSuccess: (a) => {
      toast.success('Address saved');
      qc.invalidateQueries({ queryKey: ['addresses'] });
      onSaved?.(a);
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Edit Address' : 'Add New Address'} size="lg">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!d.name || !d.phone || !d.address_line || !d.pincode) return toast.error('Please fill all required fields');
          save.mutate();
        }}
        className="space-y-4"
      >
        <div className="relative">
          <PinMap lat={d.lat} lng={d.lng} onChange={onPin} />
          <button type="button" onClick={locate} className="btn-ghost absolute bottom-3 end-3 z-[500] px-3 py-1.5 text-xs shadow">
            {locating ? <Spinner /> : <Crosshair className="h-4 w-4 text-primary" />} Use current location
          </button>
        </div>
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <MapPin className="h-3.5 w-3.5 text-primary" /> Drag the pin or tap on the map to set your exact delivery location.
        </p>
        <div className="flex gap-2">
          {(['Home', 'Work', 'Other'] as const).map((l) => (
            <button type="button" key={l} onClick={() => set('label', l)} className={clsx('chip', d.label === l && 'chip-active')}>
              {l === 'Home' ? <Home className="h-4 w-4" /> : l === 'Work' ? <Briefcase className="h-4 w-4" /> : <MapPin className="h-4 w-4" />}
              {l}
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Full name *</label>
            <input className="input" value={d.name} onChange={(e) => set('name', e.target.value)} />
          </div>
          <div>
            <label className="label">Phone *</label>
            <input className="input" value={d.phone} onChange={(e) => set('phone', e.target.value)} inputMode="tel" />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Flat / House no., Building, Street *</label>
            <input className="input" value={d.address_line} onChange={(e) => set('address_line', e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Landmark</label>
            <input className="input" value={d.landmark} onChange={(e) => set('landmark', e.target.value)} />
          </div>
          <div>
            <label className="label">City</label>
            <input className="input" value={d.city} onChange={(e) => set('city', e.target.value)} />
          </div>
          <div>
            <label className="label">State</label>
            <input className="input" value={d.state} onChange={(e) => set('state', e.target.value)} />
          </div>
          <div>
            <label className="label">Pincode *</label>
            <input className="input" value={d.pincode} onChange={(e) => set('pincode', e.target.value)} inputMode="numeric" />
          </div>
          <label className="mt-7 flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={d.is_default} onChange={(e) => set('is_default', e.target.checked)} className="h-4 w-4 accent-[#0E9623]" />
            Make this my default address
          </label>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <button disabled={save.isPending} className="btn-primary min-w-[140px]">
            {save.isPending && <Spinner />} Save Address
          </button>
        </div>
      </form>
    </Modal>
  );
}
