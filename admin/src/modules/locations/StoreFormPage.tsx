'use client';
// Add / Edit Store — port of admin/stores/form.blade.php. Store doc is written directly; the owner login is created with
// createPanelUser({type:'store'}) after the store exists, then owner_uid is patched. On edit the owner can be updated via updatePanelUser.
import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Image as ImageIcon, KeyRound, Lock, Mail, MapPin, Phone, Save, Settings2, Store as StoreIcon, User } from 'lucide-react';
import { fetchDoc, patchDoc, saveDoc, useCountries, useInvalidate, useZones } from '@/lib/firestore';
import { createPanelUser, updatePanelUser } from '@/lib/callables';
import { useAuth } from '@/lib/auth';
import { usePanel } from '@/lib/panel';
import type { Fulfillment, Store, UserDoc } from '@/lib/types';
import { errMsg, slugify } from '@/lib/format';
import { Card, Forbidden, Loading, PageHeader, Toggle } from '@/components/ui';
import { ImageUpload, Input, Select, Textarea } from '@/components/form/fields';
import { PinPicker } from '@/components/map';
import { useToast } from '@/components/ui/toast';
import { opts } from '@/components/ui/DataTable';
import { FULFILLMENT_OPTS, isActive } from './LocalTable';
import { PlaceSearch } from './PlaceSearch';

interface Form {
  name: string; email: string; phone: string; country_id: string; zone_id: string; city: string; fulfillment_type: Fulfillment; address: string;
  lat: string | number; lng: string | number; commission_percent: string | number; opening_time: string; closing_time: string;
  is_open: boolean; status: boolean; logo: string; banner: string; slug: string; owner_uid: string;
}
interface Owner { name: string; email: string; phone: string; password: string }

const blank = (country = ''): Form => ({
  name: '', email: '', phone: '', country_id: country, zone_id: '', city: '', fulfillment_type: 'both', address: '', lat: '', lng: '',
  commission_percent: 0, opening_time: '', closing_time: '', is_open: true, status: true, logo: '', banner: '', slug: '', owner_uid: '',
});

export default function StoreFormPage() {
  const params = useParams<{ id?: string }>();
  const id = params?.id ? String(params.id) : null;
  const router = useRouter();
  const { can } = useAuth();
  const { p, countryId, settings } = usePanel();
  const toast = useToast();
  const invalidate = useInvalidate();
  const { data: countries = [] } = useCountries();
  const { data: zones = [] } = useZones();
  const [form, setForm] = useState<Form | null>(id ? null : blank(countryId || settings.default_country_id || ''));
  const [owner, setOwner] = useState<Owner>({ name: '', email: '', phone: '', password: '' });
  const [ownerDoc, setOwnerDoc] = useState<UserDoc | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const s = await fetchDoc<Store>('stores', id);
      if (!s) { toast('Store not found', 'error'); router.push(p('/stores')); return; }
      setForm({
        name: s.name || '', email: s.email || '', phone: s.phone || '', country_id: s.country_id || '', zone_id: s.zone_id || '', city: s.city || '',
        fulfillment_type: s.fulfillment_type || 'both', address: s.address || '', lat: s.lat ?? '', lng: s.lng ?? '', commission_percent: s.commission_percent ?? 0,
        opening_time: (s.opening_time || '').slice(0, 5), closing_time: (s.closing_time || '').slice(0, 5), is_open: s.is_open !== false, status: isActive(s.status),
        logo: s.logo || '', banner: s.banner || '', slug: s.slug || '', owner_uid: s.owner_uid || '',
      });
      if (s.owner_uid) {
        const u = await fetchDoc<UserDoc>('users', s.owner_uid).catch(() => null);
        setOwnerDoc(u);
        if (u) setOwner({ name: u.name || '', email: u.email || '', phone: u.phone || '', password: '' });
      }
    })().catch((e) => toast(errMsg(e), 'error'));
  }, [id]);

  const zoneList = useMemo(() => zones.filter((z) => !form?.country_id || z.country_id === form.country_id), [zones, form?.country_id]);
  const zone = zones.find((z) => z.id === form?.zone_id);

  if (!can(id ? 'store.update' : 'store.create')) return <Forbidden />;
  if (!form) return <Loading />;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const hasOwner = !!ownerDoc;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.country_id) { toast('Store name and country are required', 'error'); return; }
    const creatingOwner = !hasOwner;
    if (creatingOwner && (!owner.name.trim() || !owner.email.trim() || owner.password.length < 6)) {
      toast('Owner name, login email and a password (min 6 characters) are required', 'error'); return;
    }
    if (!creatingOwner && owner.password && owner.password.length < 6) { toast('Password must be at least 6 characters', 'error'); return; }
    setBusy(true);
    let storeId = id;
    try {
      const lat = form.lat === '' ? null : Number(form.lat);
      const lng = form.lng === '' ? null : Number(form.lng);
      storeId = await saveDoc('stores', id, {
        name: form.name.trim(), slug: form.slug || slugify(form.name), email: form.email.trim() || null, phone: form.phone.trim() || null,
        country_id: form.country_id, zone_id: form.zone_id || null, city: form.city.trim() || null, fulfillment_type: form.fulfillment_type,
        address: form.address.trim() || null, lat: lat != null && isFinite(lat) ? +lat.toFixed(7) : null, lng: lng != null && isFinite(lng) ? +lng.toFixed(7) : null,
        commission_percent: Math.min(100, Math.max(0, Number(form.commission_percent) || 0)), opening_time: form.opening_time || null, closing_time: form.closing_time || null,
        is_open: form.is_open, status: form.status ? 'active' : 'inactive', logo: form.logo || null, banner: form.banner || null,
        ...(id ? {} : { orders_count: 0, revenue: 0 }),
      });
      invalidate('lookup', 'stores');
    } catch (err) { toast(errMsg(err), 'error'); setBusy(false); return; }

    try {
      if (creatingOwner) {
        const { uid } = await createPanelUser({ type: 'store', name: owner.name.trim(), email: owner.email.trim(), password: owner.password, phone: owner.phone.trim() || undefined, store_id: storeId! });
        await patchDoc('stores', storeId!, { owner_uid: uid });
      } else if (ownerDoc) {
        const upd: Parameters<typeof updatePanelUser>[0] = { uid: ownerDoc.id };
        if (owner.name.trim() !== (ownerDoc.name || '')) upd.name = owner.name.trim();
        if (owner.email.trim().toLowerCase() !== (ownerDoc.email || '').toLowerCase()) upd.email = owner.email.trim();
        if (owner.phone.trim() !== (ownerDoc.phone || '')) upd.phone = owner.phone.trim();
        if (owner.password) upd.password = owner.password;
        if (Object.keys(upd).length > 1) await updatePanelUser(upd);
      }
      toast(id ? 'Store updated' : 'Store created');
      router.push(p('/stores'));
    } catch (err) {
      toast(`Store saved, but the owner login failed: ${errMsg(err)}`, 'error');
      if (!id && storeId) router.push(p(`/stores/edit/${storeId}`));
    }
    setBusy(false);
  };

  return (
    <form onSubmit={save} className="space-y-5">
      <PageHeader title={id ? 'Edit Store' : 'Add Store'} back={p('/stores')} />
      <div className="grid gap-5 xl:grid-cols-3">
        <div className="xl:col-span-2 space-y-5">
          <Card title="Store Information" icon={StoreIcon}>
            <div className="grid gap-5 md:grid-cols-2">
              <Input label="Store Name" required value={form.name} onChange={(e) => set('name', e.target.value)} wrapClass="md:col-span-2" />
              <Input label="Store Email" type="email" icon={<Mail />} value={form.email} onChange={(e) => set('email', e.target.value)} />
              <Input label="Store Phone" icon={<Phone />} value={form.phone} onChange={(e) => set('phone', e.target.value)} />
              <Select label="Country" required placeholder="Select country" options={opts(countries, (c) => c.name)} value={form.country_id} onChange={(e) => { set('country_id', e.target.value); set('zone_id', ''); }} />
              <Select label="Zone" placeholder="Select zone" options={opts(zoneList, (z) => z.name + (z.city ? ` (${z.city})` : ''))} value={form.zone_id} onChange={(e) => set('zone_id', e.target.value)} />
              <Input label="City" value={form.city} onChange={(e) => set('city', e.target.value)} />
              <Select label="Fulfillment Type" required options={FULFILLMENT_OPTS} value={form.fulfillment_type} onChange={(e) => set('fulfillment_type', e.target.value as Fulfillment)} />
              <Textarea label="Address" rows={2} value={form.address} onChange={(e) => set('address', e.target.value)} wrapClass="md:col-span-2" />
            </div>
          </Card>

          <Card title="Store Location" icon={MapPin} subtitle="Click on the map or drag the pin to set the exact store location (used for distance-based delivery charges).">
            <PlaceSearch placeholder="Search address or place" onPick={(pl) => { set('lat', pl.lat); set('lng', pl.lng); }} />
            <PinPicker key={form.zone_id || 'none'} height={360} polygon={zone?.polygon}
              value={form.lat !== '' && form.lng !== '' ? { lat: Number(form.lat), lng: Number(form.lng) } : null}
              onChange={(v) => { set('lat', v.lat); set('lng', v.lng); }} />
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <Input label="Latitude" type="number" step="any" value={form.lat} onChange={(e) => set('lat', e.target.value)} />
              <Input label="Longitude" type="number" step="any" value={form.lng} onChange={(e) => set('lng', e.target.value)} />
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="Settings" icon={Settings2}>
            <div className="space-y-4">
              <Input label="Admin Commission (%)" type="number" step="0.01" min={0} max={100} value={form.commission_percent} onChange={(e) => set('commission_percent', e.target.value)} />
              <div className="grid grid-cols-2 gap-3">
                <Input label="Opening Time" type="time" value={form.opening_time} onChange={(e) => set('opening_time', e.target.value)} />
                <Input label="Closing Time" type="time" value={form.closing_time} onChange={(e) => set('closing_time', e.target.value)} />
              </div>
              <Toggle checked={form.is_open} onChange={(v) => set('is_open', v)} label="Open for orders" description="Temporarily close the store without disabling it." />
              <Toggle checked={form.status} onChange={(v) => set('status', v)} label="Active" description="Inactive stores are hidden from customers." />
            </div>
          </Card>

          <Card title="Branding" icon={ImageIcon}>
            <div className="space-y-4">
              <ImageUpload label="Logo" folder="catalog/stores" value={form.logo} onChange={(u) => set('logo', u)} />
              <ImageUpload label="Banner" folder="catalog/stores" square={false} hint="Wide image, up to 5MB" value={form.banner} onChange={(u) => set('banner', u)} />
            </div>
          </Card>

          <Card title="Owner Login" icon={KeyRound} subtitle="Credentials the store owner uses to sign in to the Store panel.">
            <div className="space-y-4">
              <Input label="Owner Name" required icon={<User />} value={owner.name} onChange={(e) => setOwner({ ...owner, name: e.target.value })} />
              <Input label="Login Email" type="email" required icon={<Mail />} value={owner.email} onChange={(e) => setOwner({ ...owner, email: e.target.value })} />
              <Input label="Phone" icon={<Phone />} value={owner.phone} onChange={(e) => setOwner({ ...owner, phone: e.target.value })} hint="E.164 format, e.g. +919876543210" />
              <Input label="Password" type="password" required={!hasOwner} icon={<Lock />} autoComplete="new-password" value={owner.password}
                onChange={(e) => setOwner({ ...owner, password: e.target.value })} hint={hasOwner ? 'Leave empty to keep the current password.' : 'Minimum 6 characters.'} />
              {id && form.owner_uid && !ownerDoc && <p className="text-xs text-amber-600">The linked owner account could not be loaded — saving creates a new owner login.</p>}
            </div>
          </Card>
        </div>
      </div>

      <div className="card p-4 flex justify-end gap-2">
        <button type="button" className="btn-outline" onClick={() => router.push(p('/stores'))}>Cancel</button>
        <button className="btn-primary" disabled={busy} data-testid="save"><Save className="w-4 h-4" /> {busy ? 'Saving…' : 'Save Store'}</button>
      </div>
    </form>
  );
}
