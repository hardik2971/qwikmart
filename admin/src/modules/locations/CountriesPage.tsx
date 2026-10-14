'use client';
// Countries — port of admin/countries/{index,form}.blade.php (form as a modal). Direct Firestore writes.
import { useMemo, useState } from 'react';
import { Pencil, Plus, Save } from 'lucide-react';
import { batchUpdate, fetchList, removeDoc, saveDoc, useInvalidate, useStores, useZones } from '@/lib/firestore';
import { useAuth } from '@/lib/auth';
import type { Country } from '@/lib/types';
import { cx, CountryFlag, Forbidden, PageHeader, RowActions, StatusPill, Toggle } from '@/components/ui';
import { Modal } from '@/components/ui/Modal';
import { useConfirm } from '@/components/ui/confirm';
import { useToast } from '@/components/ui/toast';
import { ImageUpload, Input, Select } from '@/components/form/fields';
import { errMsg } from '@/lib/format';
import { LocalTable, STATUS_OPTS, isActive, useAll } from './LocalTable';

const FORMATS = [
  { value: 'd M Y', label: 'd M Y (12 Oct 2026)' }, { value: 'd/m/Y', label: 'd/m/Y (12/10/2026)' }, { value: 'm/d/Y', label: 'm/d/Y (10/12/2026)' },
  { value: 'Y-m-d', label: 'Y-m-d (2026-10-12)' }, { value: 'd-m-Y', label: 'd-m-Y (12-10-2026)' }, { value: 'M d, Y', label: 'M d, Y (Oct 12, 2026)' },
];
const TIMEZONES: string[] = (() => { try { return ['UTC', ...((Intl as any).supportedValuesOf?.('timeZone') ?? [])]; } catch { return ['UTC']; } })();

type Form = Omit<Country, 'id' | 'status'> & { id?: string; status: boolean };
const blank = (): Form => ({ name: '', iso2: '', dial_code: '', currency_code: '', currency_symbol: '', timezone: 'UTC', date_format: 'd M Y', flag: '', is_default: false, status: true });
const isImg = (f?: string) => !!f && (f.includes('/') || f.includes('.'));

export default function CountriesPage() {
  const { can } = useAuth();
  const toast = useToast();
  const { confirm } = useConfirm();
  const invalidate = useInvalidate();
  const { rows, loading, error, reload } = useAll(() => fetchList<Country>('countries'), []);
  const { data: zones = [] } = useZones();
  const { data: stores = [] } = useStores();
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);

  const counts = useMemo(() => {
    const m: Record<string, { z: number; s: number }> = {};
    zones.forEach((z) => { (m[z.country_id] ??= { z: 0, s: 0 }).z++; });
    stores.forEach((s) => { (m[s.country_id] ??= { z: 0, s: 0 }).s++; });
    return m;
  }, [zones, stores]);

  if (!can('country.list')) return <Forbidden />;
  const refresh = () => { reload(); invalidate('lookup', 'countries'); };

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    if (!form.name.trim() || form.iso2.trim().length !== 2) { toast('Name and a 2-letter ISO code are required', 'error'); return; }
    setBusy(true);
    try {
      const { id, ...data } = form;
      await saveDoc('countries', id || null, {
        ...data, iso2: data.iso2.toUpperCase(), currency_code: data.currency_code.toUpperCase(),
        status: data.is_default ? 'active' : data.status ? 'active' : 'inactive', is_default: !!data.is_default,
      });
      toast(id ? 'Country updated' : 'Country created');
      setForm(null); refresh();
    } catch (err) { toast(errMsg(err), 'error'); }
    setBusy(false);
  };

  const makeDefault = async (c: Country) => {
    if (c.is_default) return;
    if (!(await confirm({ title: `Make ${c.name} the default country?` }))) return;
    try {
      await batchUpdate([
        ...rows.filter((r) => r.is_default && r.id !== c.id).map((r) => ({ path: 'countries', id: r.id, data: { is_default: false } })),
        { path: 'countries', id: c.id, data: { is_default: true, status: 'active' } },
      ]);
      toast(`${c.name} is now the default country`); refresh();
    } catch (err) { toast(errMsg(err), 'error'); }
  };

  const del = async (c: Country) => {
    if (!(await confirm({ title: 'Delete country?', message: `${c.name} will be removed. Zones and stores keep their reference.`, danger: true }))) return;
    try { await removeDoc('countries', c.id); toast('Country deleted'); refresh(); } catch (err) { toast(errMsg(err), 'error'); }
  };

  return (
    <div>
      <PageHeader title="Countries">
        {can('country.create') && <button type="button" className="btn-primary" data-testid="add-country" onClick={() => setForm(blank())}><Plus className="w-4 h-4" /> Add Country</button>}
      </PageHeader>

      <LocalTable<Country>
        rows={rows} loading={loading} error={error} onRefresh={refresh} search="Search" defaultSort={{ field: 'name', dir: 'asc' }}
        searchText={(c) => `${c.name} ${c.iso2} ${c.dial_code} ${c.currency_code}`}
        filters={[{ key: 'status', placeholder: 'All Statuses', options: STATUS_OPTS, test: (c, v) => (isActive(c.status) ? 'active' : 'inactive') === v }]}
        columns={[
          { key: 'name', header: 'Name', sort: 'name', render: (c) => <div className="font-medium">{c.name}<span className="block text-xs text-muted">{counts[c.id]?.z ?? 0} zones · {counts[c.id]?.s ?? 0} stores</span></div> },
          { key: 'dial_code', header: 'Dial Code', sort: 'dial_code' },
          { key: 'iso2', header: 'Code', sort: 'iso2' },
          { key: 'currency', header: 'Currency', render: (c) => <>{c.currency_symbol} <span className="text-muted text-xs">{c.currency_code}</span></> },
          { key: 'flag', header: 'Flag', align: 'center', render: (c) => <CountryFlag country={c} /> },
          { key: 'status', header: 'Status', sort: 'status', render: (c) => <StatusPill status={isActive(c.status)} /> },
          {
            key: 'default', header: 'Default', align: 'center', render: (c) => (
              <button type="button" className={cx('toggle', c.is_default && 'toggle-on cursor-default')} disabled={!!c.is_default || !can('country.update')} onClick={() => makeDefault(c)}
                title={c.is_default ? 'Default country' : 'Set as default'} data-testid={`default-${c.id}`}><span className="toggle-dot" /></button>
            ),
          },
          {
            key: 'actions', header: 'Actions', align: 'right', render: (c) => (
              <RowActions onDelete={!c.is_default && can('country.delete') ? () => del(c) : undefined}>
                {can('country.update') && <button type="button" className="icon-btn" title="Edit" onClick={() => setForm({ ...blank(), ...c, status: isActive(c.status) })}><Pencil className="w-4 h-4" /></button>}
              </RowActions>
            ),
          },
        ]}
      />

      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? 'Edit Country' : 'Add Country'} size="3xl">
        {form && (
          <form onSubmit={save} className="p-5">
            <p className="text-xs text-muted mb-4">Each country has its own currency, timezone and date format used across the apps.</p>
            <div className="grid gap-5 md:grid-cols-2">
              <Input label="Country Name" required value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="India" />
              <div className="grid grid-cols-2 gap-4">
                <Input label="ISO Code (2 letters)" required maxLength={2} className="uppercase" value={form.iso2} onChange={(e) => set('iso2', e.target.value.toUpperCase())} placeholder="IN" />
                <Input label="Dial Code" required value={form.dial_code} onChange={(e) => set('dial_code', e.target.value)} placeholder="+91" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input label="Currency Code" required maxLength={3} value={form.currency_code} onChange={(e) => set('currency_code', e.target.value.toUpperCase())} placeholder="INR" />
                <Input label="Currency Symbol" required value={form.currency_symbol} onChange={(e) => set('currency_symbol', e.target.value)} placeholder="₹" />
              </div>
              <Select label="Timezone" required options={TIMEZONES.includes(form.timezone || 'UTC') ? TIMEZONES : [form.timezone as string, ...TIMEZONES]} value={form.timezone || 'UTC'} onChange={(e) => set('timezone', e.target.value)} />
              <Select label="Date Format" required options={FORMATS.some((f) => f.value === form.date_format) ? FORMATS : [...FORMATS, { value: form.date_format as string, label: form.date_format as string }]} value={form.date_format || 'd M Y'} onChange={(e) => set('date_format', e.target.value)} />
              <Input label="Flag (emoji or image URL)" value={isImg(form.flag) ? '' : form.flag || ''} onChange={(e) => set('flag', e.target.value)} placeholder="🇮🇳" hint="Leave empty to use the emoji generated from the ISO code." />
              <ImageUpload label="Or upload a flag image" folder="catalog/flags" value={isImg(form.flag) ? form.flag : ''} onChange={(u) => set('flag', u)} hint="PNG/SVG/JPG up to 1MB" />
              <div className="flex items-center gap-3"><span className="text-sm text-muted">Preview:</span><CountryFlag country={form} /></div>
              <div className="md:col-span-2">
                <Toggle checked={form.is_default || form.status} disabled={!!form.is_default} onChange={(v) => set('status', v)} label="Active"
                  description={form.is_default ? 'This is the default country and is always active.' : 'Inactive countries are hidden in the apps.'} />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2 border-t border-line pt-5 dark:border-dark-line">
              <button type="button" className="btn-outline" onClick={() => setForm(null)}>Cancel</button>
              <button className="btn-primary" disabled={busy} data-testid="save"><Save className="w-4 h-4" /> {busy ? 'Saving…' : 'Save Country'}</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
