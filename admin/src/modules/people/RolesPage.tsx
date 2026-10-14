'use client';
// Roles (admin) / Store Roles (store panel) — port of admin/roles/index.blade.php + screenshot docs/reference/40.png.
// Permission matrix: module rows × action toggles, per-row "Select all", per-action column select and a global select all.
// Writes roles/{id} {name, scope, store_id, permissions} directly.
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CheckCheck, Lock, Pencil, Plus, Save, Trash2, Users } from 'lucide-react';
import { fetchList, removeDoc, saveDoc, useInvalidate, where, countDocs } from '@/lib/firestore';
import { useAuth } from '@/lib/auth';
import { usePanel } from '@/lib/panel';
import { PERMISSION_MODULES, STORE_PERMISSION_MODULES } from '@/lib/menu';
import type { RoleDoc } from '@/lib/types';
import { errMsg, statusLabel } from '@/lib/format';
import { cx, Forbidden, PageHeader } from '@/components/ui';
import { Modal } from '@/components/ui/Modal';
import { useConfirm } from '@/components/ui/confirm';
import { useToast } from '@/components/ui/toast';
import { LocalTable, useAll } from '@/modules/locations/LocalTable';

const PROTECTED = 'super admin';
const permLabel = (mod: string, action: string) => (mod === 'dashboard' && action === 'view' ? 'Manage Dashboard' : `${statusLabel(mod)} ${statusLabel(action)}`);

function UserCount({ roleId, storeId }: { roleId: string; storeId?: string | null }) {
  const [n, setN] = useState<number | null>(null);
  useEffect(() => { countDocs('users', [where('role_id', '==', roleId), ...(storeId ? [where('store_id', '==', storeId)] : [])]).then((c) => setN(c)).catch(() => setN(null)); }, [roleId]);
  return <>{n == null ? '–' : n} {n === 1 ? 'user' : 'users'}</>;
}

export default function RolesPage() {
  const { can } = useAuth();
  const { p, isStore, storeId } = usePanel();
  const toast = useToast();
  const { confirm } = useConfirm();
  const invalidate = useInvalidate();
  const label = isStore ? 'Store Roles' : 'Role';
  const modules = useMemo(() => Object.entries(PERMISSION_MODULES).filter(([m]) => !isStore || STORE_PERMISSION_MODULES.includes(m)), [isStore]);
  const allKeys = useMemo(() => modules.flatMap(([m, acts]) => acts.map((a) => `${m}.${a}`)), [modules]);
  const actions = useMemo(() => [...new Set(modules.flatMap(([, a]) => a))], [modules]);
  const { rows, loading, error, reload } = useAll<RoleDoc>(async () => {
    if (isStore) return storeId ? fetchList<RoleDoc>('roles', where('scope', '==', 'store'), where('store_id', '==', storeId)) : [];
    return fetchList<RoleDoc>('roles', where('scope', '==', 'admin'));
  }, [isStore, storeId]);
  const [form, setForm] = useState<{ id: string | null; name: string; perms: string[] } | null>(null);
  const [busy, setBusy] = useState(false);

  if (!can('role.list')) return <Forbidden />;
  const permsOf = (r: RoleDoc) => ((r.permissions || []).includes('*') ? allKeys : (r.permissions || []).filter((k) => allKeys.includes(k)));
  const has = (k: string) => !!form?.perms.includes(k);
  const allOn = (keys: string[]) => keys.length > 0 && keys.every(has);
  const setAll = (keys: string[]) => setForm((f) => {
    if (!f) return f;
    const on = keys.every((k) => f.perms.includes(k));
    const rest = f.perms.filter((k) => !keys.includes(k));
    return { ...f, perms: on ? rest : [...rest, ...keys] };
  });
  const flip = (k: string) => setForm((f) => (f ? { ...f, perms: f.perms.includes(k) ? f.perms.filter((x) => x !== k) : [...f.perms, k] } : f));
  const colKeys = (a: string) => modules.filter(([, acts]) => acts.includes(a)).map(([m]) => `${m}.${a}`);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form || !form.name.trim()) { toast('Title is required', 'error'); return; }
    const dup = rows.find((r) => r.name.trim().toLowerCase() === form.name.trim().toLowerCase() && r.id !== form.id);
    if (dup) { toast('A role with this name already exists', 'error'); return; }
    setBusy(true);
    try {
      await saveDoc('roles', form.id, { name: form.name.trim(), scope: isStore ? 'store' : 'admin', store_id: isStore ? storeId : null, permissions: allKeys.filter((k) => form.perms.includes(k)) });
      toast(form.id ? 'Role updated' : 'Role created');
      setForm(null); reload(); invalidate('lookup', 'roles');
    } catch (err) { toast(errMsg(err), 'error'); }
    setBusy(false);
  };
  const del = async (r: RoleDoc) => {
    if (!(await confirm({ title: 'Delete this role?', message: 'Users with this role lose its permissions.', danger: true }))) return;
    try { await removeDoc('roles', r.id); toast('Role deleted'); reload(); invalidate('lookup', 'roles'); } catch (e) { toast(errMsg(e), 'error'); }
  };

  return (
    <div>
      <PageHeader title={label}>
        {isStore && can('staff.list') && <Link href={p('/staff')} className="btn-outline"><Users className="w-4 h-4" /> Store Users</Link>}
        {can('role.create') && <button type="button" className="btn-primary" data-testid="add-role" onClick={() => setForm({ id: null, name: '', perms: [] })}><Plus className="w-4 h-4" /> Add New</button>}
      </PageHeader>

      <LocalTable<RoleDoc>
        rows={rows} loading={loading} error={error} onRefresh={reload} search="Search" defaultSort={{ field: 'name', dir: 'asc' }} searchText={(r) => r.name}
        columns={[
          {
            key: 'name', header: 'Name', sort: 'name', align: 'center', render: (r) => (
              <div><div className="font-semibold text-navy dark:text-white">{r.name}</div><div className="text-[11px] text-muted">{permsOf(r).length} permissions · <UserCount roleId={r.id} storeId={storeId} /></div></div>
            ),
          },
          {
            key: 'actions', header: 'Actions', align: 'center', className: 'w-48', render: (r) => (
              <div className="flex items-center justify-center gap-1.5">
                {can('role.update') && <button type="button" className="icon-btn" title="Edit" onClick={() => setForm({ id: r.id, name: r.name, perms: permsOf(r) })}><Pencil className="w-4 h-4" /></button>}
                {r.name.trim().toLowerCase() === PROTECTED
                  ? <span className="icon-btn opacity-40 cursor-not-allowed" title="Protected role"><Lock className="w-4 h-4" /></span>
                  : can('role.delete') && <button type="button" className="icon-btn hover:!text-red-500 hover:!border-red-300" title="Delete" onClick={() => del(r)}><Trash2 className="w-4 h-4" /></button>}
              </div>
            ),
          },
        ]}
      />

      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? 'Edit Role' : 'Add Role'} size="5xl">
        {form && (
          <form onSubmit={save}>
            <div className="p-5 space-y-4">
              <div>
                <label className="label">Title <span className="text-red-500">*</span></label>
                <input type="text" className="input" placeholder="Title" required maxLength={100} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="role-name" />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold text-navy dark:text-white">Permissions <span className="text-muted font-normal">({form.perms.length} selected)</span></span>
                <button type="button" className="btn-soft btn-sm" onClick={() => setAll(allKeys)} data-testid="select-all"><CheckCheck className="w-3.5 h-3.5" />{allOn(allKeys) ? 'Clear all' : 'Select all'}</button>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 px-4 py-2.5 text-xs">
                <span className="font-semibold text-muted">Select column:</span>
                {actions.map((a) => (
                  <label key={a} className="inline-flex items-center gap-1.5 cursor-pointer select-none text-slate-600 dark:text-slate-300">
                    <input type="checkbox" className="rounded border-line text-primary focus:ring-primary w-3.5 h-3.5" checked={allOn(colKeys(a))} onChange={() => setAll(colKeys(a))} />
                    {statusLabel(a)}
                  </label>
                ))}
              </div>
              <div className="rounded-xl border border-line dark:border-dark-line overflow-hidden max-h-[58vh] overflow-y-auto scrollbar-thin">
                {modules.map(([mod, acts]) => {
                  const keys = acts.map((a) => `${mod}.${a}`);
                  return (
                    <div key={mod} className="flex border-b border-line last:border-b-0 dark:border-dark-line">
                      <div className="w-36 sm:w-44 shrink-0 bg-slate-100 dark:bg-slate-800 px-4 py-3">
                        <div className="text-[13px] font-bold text-navy dark:text-white">{statusLabel(mod)}</div>
                        <label className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] text-muted cursor-pointer select-none">
                          <input type="checkbox" className="rounded border-line text-primary focus:ring-primary w-3.5 h-3.5" checked={allOn(keys)} onChange={() => setAll(keys)} />
                          Select all
                        </label>
                      </div>
                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-2.5 px-4 py-3">
                        {keys.map((k, i) => (
                          <label key={k} className="flex items-center gap-2 cursor-pointer select-none text-xs text-slate-600 dark:text-slate-300" onClick={(e) => { e.preventDefault(); flip(k); }} data-perm={k}>
                            <span className={cx('toggle scale-75 origin-left', has(k) && 'toggle-on')}><span className="toggle-dot" /></span>
                            <span className="-ml-2">{permLabel(mod, acts[i])}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-line dark:border-dark-line">
              <button className="btn-primary" disabled={busy} data-testid="save"><Save className="w-4 h-4" /> {busy ? 'Saving…' : 'Save'}</button>
              <button type="button" className="btn-gray" onClick={() => setForm(null)}>Cancel</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
