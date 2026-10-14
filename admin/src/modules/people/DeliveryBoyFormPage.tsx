'use client';
// Add / Edit Delivery Boy — port of admin/delivery-boys/form.blade.php.
// Create → createDeliveryBoy(); edit → patch delivery_boys/{uid} + updatePanelUser (name/email/phone/password),
// setUserStatus (active) and approveDeliveryBoy (approval) when those change.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Bike, ExternalLink, FileBadge, FileText, Landmark, Loader2, Lock, Mail, Phone, Save, ShieldCheck, Upload, User, UserRound, Wallet, X } from 'lucide-react';
import { approveDeliveryBoy, createDeliveryBoy, setUserStatus, updatePanelUser } from '@/lib/callables';
import { fetchDoc, patchDoc, useCountries, useZones } from '@/lib/firestore';
import { uploadFile, MAX_IMAGE_BYTES } from '@/lib/storage';
import { useAuth } from '@/lib/auth';
import { usePanel } from '@/lib/panel';
import type { DeliveryBoy, UserDoc } from '@/lib/types';
import { errMsg } from '@/lib/format';
import { cx, Card, Forbidden, Loading, PageHeader, Toggle } from '@/components/ui';
import { Input, Select, Textarea } from '@/components/form/fields';
import { useToast } from '@/components/ui/toast';
import { opts } from '@/components/ui/DataTable';
import { isActive } from '@/modules/locations/LocalTable';
import { useStorageUrl, VEHICLES } from './shared';

interface Form {
  name: string; email: string; phone: string; password: string; dob: string; address: string; country_id: string; zone_id: string;
  vehicle_type: string; vehicle_number: string; driving_license: string; id_proof: string; bank_name: string; bank_account: string; ifsc: string;
  commission_type: 'fixed' | 'percent'; commission_value: string | number; salary: string | number; approval_status: 'approved' | 'pending' | 'rejected'; status: boolean;
}
const blank = (country = ''): Form => ({
  name: '', email: '', phone: '', password: '', dob: '', address: '', country_id: country, zone_id: '', vehicle_type: '', vehicle_number: '',
  driving_license: '', id_proof: '', bank_name: '', bank_account: '', ifsc: '', commission_type: 'fixed', commission_value: 0, salary: 0, approval_status: 'approved', status: true,
});

/** Image/PDF upload that stores the Storage *path* (rider docs are private). */
function DocUpload({ label, value, onChange, folder }: { label: string; value: string; onChange: (path: string) => void; folder: string }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const inp = useRef<HTMLInputElement>(null);
  const url = useStorageUrl(value);
  const isPdf = /\.pdf($|\?)/i.test(value);
  const pick = async (f?: File) => {
    if (!f) return;
    if (f.size > MAX_IMAGE_BYTES) { toast('File is larger than 5 MB', 'error'); return; }
    setBusy(true);
    try { const { path } = await uploadFile(f, folder); onChange(path); } catch (e) { toast(errMsg(e), 'error'); }
    setBusy(false);
    if (inp.current) inp.current.value = '';
  };
  return (
    <div>
      <span className="label">{label}</span>
      <label className="flex items-center gap-4 rounded-xl border-2 border-dashed border-line p-3 cursor-pointer hover:border-primary/50 dark:border-dark-line">
        <span className="w-20 h-20 shrink-0 rounded-lg bg-slate-50 dark:bg-slate-800 overflow-hidden flex items-center justify-center">
          {busy ? <Loader2 className="w-6 h-6 animate-spin text-primary" /> : value ? (isPdf ? <FileText className="w-8 h-8 text-red-500" /> : url ? <img src={url} alt="" className="w-full h-full object-cover" /> : null) : <Upload className="w-7 h-7 text-slate-300" />}
        </span>
        <span className="text-sm flex-1"><span className="font-semibold text-primary">Click to upload</span><span className="block text-xs text-muted">JPG, PNG, WEBP or PDF</span></span>
        {value && !busy && <button type="button" className="text-red-400 hover:text-red-600" title="Remove" onClick={(e) => { e.preventDefault(); onChange(''); }}><X className="w-4 h-4" /></button>}
        <input ref={inp} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
      </label>
      {value && url && <a href={url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-primary font-semibold"><ExternalLink className="w-3 h-3" /> View current file</a>}
    </div>
  );
}

export default function DeliveryBoyFormPage() {
  const params = useParams<{ id?: string }>();
  const id = params?.id ? String(params.id) : null;
  const router = useRouter();
  const { can } = useAuth();
  const { p, countryId, settings } = usePanel();
  const toast = useToast();
  const { data: countries = [] } = useCountries();
  const { data: zones = [] } = useZones();
  const [form, setForm] = useState<Form | null>(id ? null : blank(countryId || settings.default_country_id || ''));
  const [orig, setOrig] = useState<{ boy: DeliveryBoy; user: UserDoc | null } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const [boy, user] = await Promise.all([fetchDoc<DeliveryBoy>('delivery_boys', id), fetchDoc<UserDoc>('users', id).catch(() => null)]);
      if (!boy) { toast('Delivery boy not found', 'error'); router.push(p('/delivery-boys')); return; }
      setOrig({ boy, user });
      setForm({
        name: user?.name || boy.name || '', email: user?.email || boy.email || '', phone: user?.phone || boy.phone || '', password: '',
        dob: boy.dob || '', address: boy.address || '', country_id: boy.country_id || '', zone_id: boy.zone_id || '', vehicle_type: boy.vehicle_type || '',
        vehicle_number: boy.vehicle_number || '', driving_license: boy.driving_license || '', id_proof: boy.id_proof || '',
        bank_name: boy.bank?.name || '', bank_account: boy.bank?.account || '', ifsc: boy.bank?.ifsc || '',
        commission_type: boy.commission_type || 'fixed', commission_value: boy.commission_value ?? 0, salary: boy.salary ?? 0,
        approval_status: boy.approval_status || 'pending', status: isActive(boy.status ?? 'active') && (user ? isActive(user.status) : true),
      });
    })().catch((e) => toast(errMsg(e), 'error'));
  }, [id]);

  const zoneList = useMemo(() => zones.filter((z) => !form?.country_id || z.country_id === form.country_id), [zones, form?.country_id]);
  const vehicles = useMemo(() => (form?.vehicle_type && !VEHICLES.some((v) => v.value === form.vehicle_type) ? [...VEHICLES, { value: form.vehicle_type, label: form.vehicle_type }] : VEHICLES), [form?.vehicle_type]);

  if (!can(id ? 'delivery_boy.update' : 'delivery_boy.create')) return <Forbidden />;
  if (!form) return <Loading />;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const sym = countries.find((c) => c.id === form.country_id)?.currency_symbol || '₹';
  const docFolder = `delivery_docs/${id || 'admin_uploads'}`;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.country_id || !form.zone_id) { toast('Country and zone are required', 'error'); return; }
    if (!id && form.password.length < 6) { toast('Password must be at least 6 characters', 'error'); return; }
    if (id && form.password && form.password.length < 6) { toast('Password must be at least 6 characters', 'error'); return; }
    setBusy(true);
    const bank = { name: form.bank_name.trim(), account: form.bank_account.trim(), ifsc: form.ifsc.trim() };
    const common = {
      dob: form.dob || undefined, country_id: form.country_id, zone_id: form.zone_id, address: form.address.trim() || undefined,
      vehicle_type: form.vehicle_type || undefined, vehicle_number: form.vehicle_number.trim() || undefined,
      driving_license: form.driving_license || undefined, id_proof: form.id_proof || undefined, bank,
      commission_type: form.commission_type, commission_value: Number(form.commission_value) || 0, salary: Number(form.salary) || 0,
    };
    try {
      if (!id) {
        const { uid } = await createDeliveryBoy({ name: form.name.trim(), email: form.email.trim(), password: form.password, phone: form.phone.trim(), ...common, status: form.status ? 'active' : 'inactive' });
        if (!form.status) await setUserStatus({ uid, active: false }).catch(() => {});
        if (form.approval_status !== 'approved') await approveDeliveryBoy({ uid, approve: false, remark: 'Set by admin' }).catch(() => {});
        toast('Delivery boy created');
      } else {
        await patchDoc('delivery_boys', id, {
          ...common, dob: form.dob || null, address: form.address.trim() || null, vehicle_type: form.vehicle_type || null, vehicle_number: form.vehicle_number.trim() || null,
          driving_license: form.driving_license || null, id_proof: form.id_proof || null,
        });
        const u = orig?.user;
        const upd: Parameters<typeof updatePanelUser>[0] = { uid: id };
        if (form.name.trim() !== (u?.name || orig?.boy.name || '')) upd.name = form.name.trim();
        if (form.email.trim().toLowerCase() !== (u?.email || orig?.boy.email || '').toLowerCase()) upd.email = form.email.trim();
        if (form.phone.trim() !== (u?.phone || orig?.boy.phone || '')) upd.phone = form.phone.trim();
        if (form.password) upd.password = form.password;
        if (Object.keys(upd).length > 1) await updatePanelUser(upd);
        const wasActive = isActive(orig?.boy.status ?? 'active') && (u ? isActive(u.status) : true);
        if (wasActive !== form.status) await setUserStatus({ uid: id, active: form.status });
        if (form.approval_status !== (orig?.boy.approval_status || 'pending') && form.approval_status !== 'pending') {
          await approveDeliveryBoy({ uid: id, approve: form.approval_status === 'approved' });
        }
        toast('Delivery boy updated');
      }
      router.push(p('/delivery-boys'));
    } catch (err) { toast(errMsg(err), 'error'); }
    setBusy(false);
  };

  return (
    <form onSubmit={save} className="space-y-5">
      <PageHeader title={id ? 'Edit Delivery Boy' : 'Add Delivery Boy'} back={p('/delivery-boys')} />
      <div className="grid gap-5 xl:grid-cols-3">
        <div className="xl:col-span-2 space-y-5">
          <Card title="Account" icon={UserRound}>
            <div className="grid gap-5 md:grid-cols-2">
              <Input label="Full Name" required icon={<User />} value={form.name} onChange={(e) => set('name', e.target.value)} />
              <Input label="Email" type="email" required icon={<Mail />} value={form.email} onChange={(e) => set('email', e.target.value)} />
              <Input label="Mobile" required icon={<Phone />} value={form.phone} onChange={(e) => set('phone', e.target.value)} hint="E.164 format, e.g. +919876543210" />
              <Input label="Password" type="password" required={!id} icon={<Lock />} autoComplete="new-password" value={form.password} onChange={(e) => set('password', e.target.value)}
                hint={id ? 'Leave empty to keep the current password.' : 'Minimum 6 characters.'} />
              <Input label="Date of Birth" type="date" value={form.dob} onChange={(e) => set('dob', e.target.value)} />
              <Textarea label="Address" rows={1} value={form.address} onChange={(e) => set('address', e.target.value)} />
            </div>
          </Card>

          <Card title="Service Area & Vehicle" icon={Bike}>
            <div className="grid gap-5 md:grid-cols-2">
              <Select label="Country" required placeholder="Select country" options={opts(countries, (c) => c.name)} value={form.country_id} onChange={(e) => { set('country_id', e.target.value); set('zone_id', ''); }} />
              <Select label="Zone" required placeholder="Select zone" options={opts(zoneList, (z) => z.name)} value={form.zone_id} onChange={(e) => set('zone_id', e.target.value)} />
              <Select label="Vehicle Type" placeholder="Select vehicle" options={vehicles} value={form.vehicle_type} onChange={(e) => set('vehicle_type', e.target.value)} />
              <Input label="Vehicle Number" value={form.vehicle_number} onChange={(e) => set('vehicle_number', e.target.value)} />
            </div>
          </Card>

          <Card title="Documents" icon={FileBadge} subtitle="Images or PDF up to 5MB.">
            <div className="grid gap-5 md:grid-cols-2">
              <DocUpload label="Driving License" folder={docFolder} value={form.driving_license} onChange={(v) => set('driving_license', v)} />
              <DocUpload label="ID Proof" folder={docFolder} value={form.id_proof} onChange={(v) => set('id_proof', v)} />
            </div>
          </Card>

          <Card title="Bank Details" icon={Landmark}>
            <div className="grid gap-5 md:grid-cols-3">
              <Input label="Bank Name" value={form.bank_name} onChange={(e) => set('bank_name', e.target.value)} />
              <Input label="Account Number" value={form.bank_account} onChange={(e) => set('bank_account', e.target.value)} />
              <Input label="IFSC / Routing Code" value={form.ifsc} onChange={(e) => set('ifsc', e.target.value)} />
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="Earnings" icon={Wallet}>
            <div className="space-y-4">
              <div>
                <label className="label">Commission Type</label>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" className={cx('chip justify-center !py-2', form.commission_type === 'fixed' && 'chip-active')} onClick={() => set('commission_type', 'fixed')}>Fixed per order</button>
                  <button type="button" className={cx('chip justify-center !py-2', form.commission_type === 'percent' && 'chip-active')} onClick={() => set('commission_type', 'percent')}>% of order</button>
                </div>
              </div>
              <Input label={<>Commission Value <span className="text-muted">{form.commission_type === 'percent' ? '(%)' : `(${sym})`}</span></>} type="number" step="0.01" min={0}
                value={form.commission_value} onChange={(e) => set('commission_value', e.target.value)} />
              <Input label="Monthly Salary" type="number" step="0.01" min={0} prefix={sym} value={form.salary} onChange={(e) => set('salary', e.target.value)}
                hint="Optional fixed salary paid via the earnings payout screen." />
            </div>
          </Card>
          <Card title="Status" icon={ShieldCheck}>
            <div className="space-y-4">
              <Select label="Approval Status" required options={[{ value: 'approved', label: 'Approved' }, { value: 'pending', label: 'Pending' }, { value: 'rejected', label: 'Rejected' }]}
                value={form.approval_status} onChange={(e) => set('approval_status', e.target.value as Form['approval_status'])}
                hint={id && orig?.boy.approval_status !== 'pending' && form.approval_status === 'pending' ? 'An approved/rejected rider cannot be moved back to pending.' : undefined} />
              <Toggle checked={form.status} onChange={(v) => set('status', v)} label="Active" description="Inactive delivery boys cannot log in or receive orders." />
            </div>
          </Card>
        </div>
      </div>
      <div className="card p-4 flex justify-end gap-2">
        <button type="button" className="btn-outline" onClick={() => router.push(p('/delivery-boys'))}>Cancel</button>
        <button className="btn-primary" disabled={busy} data-testid="save"><Save className="w-4 h-4" /> {busy ? 'Saving…' : 'Save Delivery Boy'}</button>
      </div>
    </form>
  );
}
