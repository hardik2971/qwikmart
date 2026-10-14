'use client';
// Taxes — port of admin/taxes/index.blade.php (table + add/edit modal).
import { useEffect, useState } from 'react';
import { Pencil, Percent, Plus, Save } from 'lucide-react';
import { removeDoc, saveDoc, useInvalidate, countDocs, where } from '@/lib/firestore';
import { errMsg, searchKeywords } from '@/lib/format';
import { usePanel } from '@/lib/panel';
import { useAuth } from '@/lib/auth';
import type { Tax } from '@/lib/types';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Forbidden, PageHeader, RowActions, StatusPill, Toggle } from '@/components/ui';
import { Modal } from '@/components/ui/Modal';
import { useConfirm } from '@/components/ui/confirm';
import { useToast } from '@/components/ui/toast';

function ProductCount({ taxId }: { taxId: string }) {
  const [n, setN] = useState<number | null>(null);
  const { can } = useAuth();
  const all = can('product.list');
  useEffect(() => {
    // without product.list the rules only allow reading active products
    countDocs('products', [where('tax_id', '==', taxId), ...(all ? [] : [where('status', '==', 'active')])]).then((c) => setN(c)).catch(() => setN(null));
  }, [taxId, all]);
  return <>{n ?? '—'}</>;
}

const fmtPct = (n: number) => `${Number(n || 0).toFixed(2).replace(/\.?0+$/, '')}%`;

export default function TaxesPage() {
  const { isStore } = usePanel();
  const { can } = useAuth();
  const toast = useToast();
  const { confirm } = useConfirm();
  const invalidate = useInvalidate();
  const [refreshKey, setRefreshKey] = useState(0);
  const [form, setForm] = useState<{ id: string | null; name: string; percent: string; status: boolean } | null>(null);
  const [errors, setErrors] = useState<{ name?: string; percent?: string }>({});
  const [saving, setSaving] = useState(false);

  if (isStore || !can('tax.list')) return <Forbidden />;

  const done = () => { setRefreshKey((k) => k + 1); invalidate('lookup', 'taxes'); };
  const save = async () => {
    if (!form) return;
    const e: typeof errors = {};
    if (!form.name.trim()) e.name = 'The name field is required.';
    const pct = Number(form.percent);
    if (form.percent === '' || !Number.isFinite(pct) || pct < 0 || pct > 100) e.percent = 'Percent must be between 0 and 100.';
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    try {
      await saveDoc('taxes', form.id, { name: form.name.trim(), percent: pct, status: form.status ? 'active' : 'inactive', search_keywords: searchKeywords(form.name) });
      toast(form.id ? 'Tax updated.' : 'Tax created.');
      setForm(null); done();
    } catch (err) { toast(errMsg(err), 'error'); }
    setSaving(false);
  };
  const del = async (t: Tax) => {
    if (!(await confirm({ title: 'Delete this tax?', message: t.name, danger: true }))) return;
    try { await removeDoc('taxes', t.id); toast('Tax deleted.'); done(); } catch (err) { toast(errMsg(err), 'error'); }
  };

  const columns: Column<Tax>[] = [
    {
      key: 'name', header: 'Name', sort: 'name', render: (t) => (
        <div className="flex items-center gap-3">
          <span className="w-9 h-9 rounded-lg bg-primary-50 text-primary flex items-center justify-center"><Percent className="w-4 h-4" /></span>
          <span className="font-semibold text-navy dark:text-white">{t.name}</span>
        </div>
      ),
    },
    { key: 'percent', header: 'Percent', sort: 'percent', render: (t) => <span className="pill bg-blue-50 text-blue-600">{fmtPct(t.percent)}</span> },
    { key: 'products', header: 'Products', render: (t) => <ProductCount taxId={t.id} /> },
    { key: 'status', header: 'Status', sort: 'status', render: (t) => <StatusPill status={t.status} /> },
    {
      key: 'actions', header: 'Actions', align: 'right', render: (t) => (
        <RowActions onDelete={can('tax.delete') ? () => del(t) : undefined}>
          {can('tax.update') && (
            <button type="button" className="icon-btn" title="Edit" onClick={() => { setErrors({}); setForm({ id: t.id, name: t.name, percent: String(Number(t.percent || 0)), status: t.status !== 'inactive' }); }}>
              <Pencil className="w-4 h-4" />
            </button>
          )}
        </RowActions>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Taxes" subtitle="Tax classes applied to product prices.">
        {can('tax.create') && <button type="button" className="btn-primary" onClick={() => { setErrors({}); setForm({ id: null, name: '', percent: '', status: true }); }} data-testid="add-tax"><Plus className="w-4 h-4" /> Add Tax</button>}
      </PageHeader>
      <DataTable<Tax>
        path="taxes"
        defaultSort={{ field: 'name', dir: 'asc' }}
        search="Search taxes"
        filters={[{ key: 'status', placeholder: 'All Statuses', options: [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }] }]}
        columns={columns}
        refreshKey={refreshKey}
        testId="taxes-table"
      />

      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? 'Edit Tax' : 'Add Tax'}
        footer={<>
          <button type="button" className="btn-outline" onClick={() => setForm(null)}>Cancel</button>
          <button type="button" className="btn-primary" onClick={save} disabled={saving} data-testid="save"><Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save'}</button>
        </>}>
        {form && (
          <div className="p-5 space-y-4">
            <div>
              <label className="label" htmlFor="tax_name">Name <span className="text-red-500">*</span></label>
              <input id="tax_name" className="input" maxLength={120} placeholder="e.g. GST 5%" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
            </div>
            <div>
              <label className="label" htmlFor="tax_percent">Percent <span className="text-red-500">*</span></label>
              <div className="relative">
                <input id="tax_percent" type="number" step="0.01" min={0} max={100} className="input pr-9" value={form.percent} onChange={(e) => setForm({ ...form, percent: e.target.value })} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">%</span>
              </div>
              {errors.percent && <p className="mt-1 text-xs text-red-500">{errors.percent}</p>}
            </div>
            <Toggle checked={form.status} onChange={(v) => setForm({ ...form, status: v })} label="Active" description="Inactive taxes can't be assigned to products." />
          </div>
        )}
      </Modal>
    </div>
  );
}
