'use client';
// Attributes — port of admin/attributes/index + form.blade.php. Create/edit in a modal: translatable name + values (value, color_hex).
import { useState } from 'react';
import { Pencil, Plus, Save, Trash2 } from 'lucide-react';
import { removeDoc, saveDoc, useInvalidate } from '@/lib/firestore';
import { errMsg, searchKeywords, tr } from '@/lib/format';
import { usePanel } from '@/lib/panel';
import { useAuth } from '@/lib/auth';
import type { Attribute, AttributeValue, Trans } from '@/lib/types';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Card, Forbidden, PageHeader, RowActions } from '@/components/ui';
import { Modal } from '@/components/ui/Modal';
import { LangTabs, TransInput } from '@/components/form/lang';
import { useConfirm } from '@/components/ui/confirm';
import { useToast } from '@/components/ui/toast';
import { newId } from './shared';

interface ValRow extends AttributeValue { key: string; useColor: boolean }
const blank = (): ValRow => ({ key: newId(), id: '', value: '', color_hex: '', useColor: false });

export default function AttributesPage() {
  const { isStore, uiLang, languages } = usePanel();
  const { can } = useAuth();
  const toast = useToast();
  const { confirm } = useConfirm();
  const invalidate = useInvalidate();
  const [refreshKey, setRefreshKey] = useState(0);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Attribute | null>(null);
  const [name, setName] = useState<Trans>({});
  const [rows, setRows] = useState<ValRow[]>([blank()]);
  const [saving, setSaving] = useState(false);

  if (isStore || !can('attribute.list')) return <Forbidden />;

  const openForm = (a: Attribute | null) => {
    setEditing(a);
    setName(a?.name || {});
    setRows(a?.values?.length ? a.values.map((v) => ({ ...v, id: String(v.id), key: newId(), color_hex: v.color_hex || '', useColor: !!v.color_hex })) : [blank()]);
    setOpen(true);
  };
  const upd = (key: string, patch: Partial<ValRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const remove = (key: string) => setRows((rs) => { const n = rs.filter((r) => r.key !== key); return n.length ? n : [blank()]; });

  const save = async () => {
    const def = languages[0]?.code || 'en';
    if (!(name[def] || name.en || '').trim()) { toast('Attribute name is required', 'error'); return; }
    const values = rows.filter((r) => r.value.trim()).map((r) => ({
      id: r.id || newId(), value: r.value.trim(), color_hex: r.useColor && /^#[0-9a-fA-F]{3,8}$/.test(r.color_hex || '') ? r.color_hex!.toUpperCase() : null,
    }));
    const seen = new Set<string>();
    for (const v of values) { const k = v.value.toLowerCase(); if (seen.has(k)) { toast(`Duplicate value "${v.value}"`, 'error'); return; } seen.add(k); }
    setSaving(true);
    try {
      await saveDoc('attributes', editing?.id ?? null, { name, values, search_keywords: searchKeywords(name, ...values.map((v) => v.value)) });
      toast(editing ? 'Attribute updated.' : 'Attribute created.');
      setOpen(false); setRefreshKey((k) => k + 1); invalidate('lookup', 'attributes');
    } catch (e) { toast(errMsg(e), 'error'); }
    setSaving(false);
  };

  const del = async (a: Attribute) => {
    if (!(await confirm({ title: 'Delete this attribute and all of its values?', message: tr(a.name, uiLang), danger: true }))) return;
    try { await removeDoc('attributes', a.id); toast('Attribute deleted.'); setRefreshKey((k) => k + 1); invalidate('lookup', 'attributes'); }
    catch (e) { toast(errMsg(e), 'error'); }
  };

  const columns: Column<Attribute>[] = [
    { key: 'name', header: 'Name', className: 'font-semibold text-navy dark:text-white whitespace-nowrap', render: (a) => tr(a.name, uiLang) },
    {
      key: 'values', header: 'Values', render: (a) => (
        <div className="flex flex-wrap gap-1.5 max-w-xl">
          {(a.values ?? []).slice(0, 12).map((v) => (
            <span key={v.id} className="chip !py-1 !px-2.5 text-xs inline-flex items-center gap-1.5">
              {v.color_hex && <span className="w-3.5 h-3.5 rounded-full border border-black/10" style={{ background: v.color_hex }} />}{v.value}
            </span>
          ))}
          {!(a.values ?? []).length && <span className="text-muted text-sm">No values</span>}
          {(a.values ?? []).length > 12 && <span className="chip !py-1 !px-2.5 text-xs">+{(a.values ?? []).length - 12} more</span>}
        </div>
      ),
    },
    { key: 'count', header: 'Count', render: (a) => <span className="pill bg-primary-50 text-primary">{a.values?.length ?? 0}</span> },
    {
      key: 'actions', header: 'Actions', align: 'right', render: (a) => (
        <RowActions onDelete={can('attribute.delete') ? () => del(a) : undefined}>
          {can('attribute.update') && <button type="button" className="icon-btn" title="Edit" onClick={() => openForm(a)}><Pencil className="w-4 h-4" /></button>}
        </RowActions>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Attributes" subtitle="Variant attributes such as Size, Color or Weight and their values.">
        {can('attribute.create') && <button type="button" className="btn-primary" onClick={() => openForm(null)} data-testid="add-attribute"><Plus className="w-4 h-4" /> Add Attribute</button>}
      </PageHeader>
      <DataTable<Attribute> path="attributes" defaultSort={null} search="Search attributes or values" columns={columns} refreshKey={refreshKey} testId="attributes-table" />

      <Modal open={open} onClose={() => setOpen(false)} size="3xl" title={editing ? 'Edit Attribute' : 'Add Attribute'}
        footer={<>
          <button type="button" className="btn-outline" onClick={() => setOpen(false)}>Cancel</button>
          <button type="button" className="btn-primary" onClick={save} disabled={saving} data-testid="save"><Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save Attribute'}</button>
        </>}>
        <div className="p-5 space-y-5">
          <Card title="Attribute Details" subtitle="e.g. Size, Color, Weight, Pack.">
            <LangTabs translate>
              <TransInput label="Attribute Name" value={name} onChange={setName} required />
            </LangTabs>
          </Card>
          <Card title="Values" subtitle="Add the selectable values. Pick a color for swatch-style values (e.g. Red, Blue)."
            actions={<button type="button" className="btn-soft btn-sm" onClick={() => setRows((r) => [...r, blank()])}><Plus className="w-3.5 h-3.5" /> Add Value</button>}>
            <div className="space-y-2.5">
              {rows.map((r, i) => (
                <div key={r.key} className="flex flex-wrap items-center gap-2.5 rounded-xl border border-line dark:border-dark-line p-2.5 bg-slate-50/50 dark:bg-white/[.02]">
                  <span className="w-7 text-center text-xs font-bold text-muted">{i + 1}</span>
                  <input type="text" value={r.value} onChange={(e) => upd(r.key, { value: e.target.value })} placeholder="Value e.g. Large / Red / 500 g" className="input flex-1 min-w-[180px]"
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setRows((x) => [...x, blank()]); } }} />
                  <label className="flex items-center gap-2 text-sm text-muted cursor-pointer select-none">
                    <input type="checkbox" checked={r.useColor} onChange={(e) => upd(r.key, { useColor: e.target.checked, color_hex: e.target.checked ? r.color_hex || '#0E9623' : '' })} className="rounded border-line text-primary focus:ring-primary" />
                    Color
                  </label>
                  {r.useColor && (
                    <div className="flex items-center gap-2">
                      <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(r.color_hex || '') ? r.color_hex! : '#000000'} onChange={(e) => upd(r.key, { color_hex: e.target.value.toUpperCase() })}
                        className="h-10 w-11 rounded-lg border border-line dark:border-dark-line cursor-pointer p-0.5 bg-white dark:bg-dark-card" />
                      <input type="text" value={r.color_hex || ''} maxLength={9} onChange={(e) => upd(r.key, { color_hex: e.target.value })} className="input font-mono !w-28" placeholder="#FF0000" />
                    </div>
                  )}
                  <button type="button" className="icon-btn hover:!text-red-500 hover:!border-red-300" title="Remove" onClick={() => remove(r.key)}><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted">Empty rows are ignored. Removing an existing value detaches it from any variants that used it.</p>
          </Card>
        </div>
      </Modal>
    </div>
  );
}
