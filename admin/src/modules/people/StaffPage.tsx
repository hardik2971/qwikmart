'use client';
// Staff Users (admin) / Store Users (store panel) — port of admin/staff/{index,form}.blade.php (form as a modal).
// create → createPanelUser, edit → updatePanelUser, status → setUserStatus, delete → deleteUser.
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Eye, EyeOff, Lock, Mail, Pencil, Phone, Plus, Save, ShieldCheck, TriangleAlert, User } from 'lucide-react';
import { createPanelUser, deleteUser, setUserStatus, updatePanelUser } from '@/lib/callables';
import { fetchList, useRoles, where } from '@/lib/firestore';
import { useAuth } from '@/lib/auth';
import { usePanel } from '@/lib/panel';
import type { UserDoc } from '@/lib/types';
import { errMsg, statusLabel, timeAgo } from '@/lib/format';
import { cx, Forbidden, PageHeader, RowActions, StatusPill, Toggle } from '@/components/ui';
import { Modal } from '@/components/ui/Modal';
import { useConfirm } from '@/components/ui/confirm';
import { useToast } from '@/components/ui/toast';
import { Input, Select } from '@/components/form/fields';
import { opts } from '@/components/ui/DataTable';
import { LocalTable, STATUS_OPTS, isActive, useAll } from '@/modules/locations/LocalTable';
import { isDeleted, UserCell } from './shared';

interface Form { id?: string; type: string; name: string; email: string; phone: string; password: string; role_id: string; status: boolean; orig?: UserDoc }

export default function StaffPage() {
  const { can, user: me } = useAuth();
  const { p, isStore, storeId } = usePanel();
  const toast = useToast();
  const { confirm } = useConfirm();
  const label = isStore ? 'Store User' : 'Staff User';
  const { data: roles = [], refetch: refetchRoles } = useRoles(isStore ? 'store' : 'admin', isStore ? storeId : null);
  const { rows, loading, error, reload } = useAll<UserDoc>(async () => {
    if (isStore) return storeId ? fetchList<UserDoc>('users', where('type', '==', 'store'), where('store_id', '==', storeId)) : [];
    return fetchList<UserDoc>('users', where('type', 'in', ['staff', 'admin']));
  }, [isStore, storeId]);
  const list = useMemo(() => rows.filter((u) => !isDeleted(u)), [rows]);
  const roleName = useMemo(() => Object.fromEntries(roles.map((r) => [r.id, r.name])), [roles]);
  const [form, setForm] = useState<Form | null>(null);
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  if (!can('staff.list')) return <Forbidden />;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const needsRole = (f: Form) => f.type === 'staff';

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    if (!form.id && form.password.length < 6) { toast('Password must be at least 6 characters', 'error'); return; }
    if (form.id && form.password && form.password.length < 6) { toast('Password must be at least 6 characters', 'error'); return; }
    if (needsRole(form) && !form.role_id) { toast('Select a role', 'error'); return; }
    setBusy('save');
    try {
      if (!form.id) {
        const { uid } = await createPanelUser({
          type: isStore ? 'store' : 'staff', name: form.name.trim(), email: form.email.trim(), password: form.password, phone: form.phone.trim() || undefined,
          role_id: form.role_id || undefined, ...(isStore && storeId ? { store_id: storeId } : {}),
        });
        if (!form.status) await setUserStatus({ uid, active: false }).catch(() => {});
        toast(`${label} created`);
      } else {
        const o = form.orig!;
        const upd: Parameters<typeof updatePanelUser>[0] = { uid: form.id };
        if (form.name.trim() !== (o.name || '')) upd.name = form.name.trim();
        if (form.email.trim().toLowerCase() !== (o.email || '').toLowerCase()) upd.email = form.email.trim();
        if (form.phone.trim() !== (o.phone || '')) upd.phone = form.phone.trim();
        if (form.password) upd.password = form.password;
        if (o.type !== 'admin' && (form.role_id || null) !== (o.role_id || null)) upd.role_id = form.role_id || null;
        if (Object.keys(upd).length > 1) await updatePanelUser(upd);
        if (isActive(o.status) !== form.status) await setUserStatus({ uid: form.id, active: form.status });
        toast(`${label} updated`);
      }
      setForm(null); reload();
    } catch (err) { toast(errMsg(err), 'error'); }
    setBusy(null);
  };

  const toggle = async (u: UserDoc) => {
    setBusy(u.id);
    try { await setUserStatus({ uid: u.id, active: !isActive(u.status) }); toast('Status updated'); reload(); } catch (e) { toast(errMsg(e), 'error'); }
    setBusy(null);
  };
  const del = async (u: UserDoc) => {
    if (!(await confirm({ title: `Delete ${u.name}?`, message: 'The login account is removed.', danger: true }))) return;
    try { await deleteUser({ uid: u.id }); toast(`${label} deleted`); reload(); } catch (e) { toast(errMsg(e), 'error'); }
  };
  const openNew = () => { setShowPw(false); refetchRoles(); setForm({ type: isStore ? 'store' : 'staff', name: '', email: '', phone: '', password: '', role_id: '', status: true }); };
  const openEdit = (u: UserDoc) => { setShowPw(false); setForm({ id: u.id, type: u.type, name: u.name || '', email: u.email || '', phone: u.phone || '', password: '', role_id: u.role_id || '', status: isActive(u.status), orig: u }); };

  return (
    <div>
      <PageHeader title={`${label}s`} subtitle={isStore ? 'Team members who can sign in to your store panel' : 'Admin panel team members and their roles'}>
        {can('role.list') && <Link href={p('/roles')} className="btn-outline"><ShieldCheck className="w-4 h-4" /> {isStore ? 'Store Roles' : 'Roles'}</Link>}
        {can('staff.create') && <button type="button" className="btn-primary" onClick={openNew} data-testid="add-staff"><Plus className="w-4 h-4" /> Add {label}</button>}
      </PageHeader>

      {!roles.length && (
        <div className="card mb-4 flex items-center gap-3 !border-amber-200 !bg-amber-50 p-4 text-sm text-amber-700">
          <TriangleAlert className="w-5 h-5 shrink-0" />
          <span>No roles exist yet. <Link href={p('/roles')} className="font-semibold underline">Create a role</Link> first — every {label.toLowerCase()} must have a role.</span>
        </div>
      )}

      <LocalTable<UserDoc>
        rows={list} loading={loading} error={error} onRefresh={reload} search="Search name, email, phone" defaultSort={{ field: 'name', dir: 'asc' }}
        searchText={(u) => `${u.name} ${u.email ?? ''} ${u.phone ?? ''}`}
        filters={[
          { key: 'role_id', placeholder: 'All Roles', options: opts(roles, (r) => r.name) },
          { key: 'status', placeholder: 'All Statuses', options: STATUS_OPTS, test: (u, v) => (isActive(u.status) ? 'active' : 'inactive') === v },
        ]}
        columns={[
          { key: 'name', header: 'User', sort: 'name', render: (u) => <div><UserCell user={u} />{u.id === me?.uid && <span className="ml-10 text-[11px] text-primary font-semibold">You</span>}</div> },
          { key: 'email', header: 'Email', sort: 'email', render: (u) => u.email || '-' },
          { key: 'phone', header: 'Phone', render: (u) => u.phone || '-' },
          {
            key: 'role', header: 'Role', render: (u) => (
              <span className="pill bg-primary-50 text-primary border border-primary/20">
                {u.type === 'admin' ? 'Super Admin' : u.role_id ? roleName[u.role_id] || u.role_id : isStore ? 'Owner' : '-'}
              </span>
            ),
          },
          {
            key: 'status', header: 'Status', sort: 'status', render: (u) => can('staff.update') && u.id !== me?.uid
              ? <button type="button" className={cx('toggle', isActive(u.status) && 'toggle-on')} disabled={busy === u.id} onClick={() => toggle(u)} title="Toggle status"><span className="toggle-dot" /></button>
              : <StatusPill status={isActive(u.status)} />,
          },
          { key: 'last_login_at', header: 'Last Login', sort: 'last_login_at', render: (u) => <span className="text-xs text-muted whitespace-nowrap">{u.last_login_at ? timeAgo(u.last_login_at) : 'Never'}</span> },
          {
            key: 'actions', header: 'Actions', align: 'right', render: (u) => (
              <RowActions onDelete={can('staff.delete') && u.id !== me?.uid && u.type !== 'admin' ? () => del(u) : undefined}>
                {can('staff.update') && <button type="button" className="icon-btn" title="Edit" onClick={() => openEdit(u)}><Pencil className="w-4 h-4" /></button>}
              </RowActions>
            ),
          },
        ]}
      />

      <Modal open={!!form} onClose={() => setForm(null)} title={form ? `${form.id ? 'Edit' : 'Add'} ${form.type === 'admin' ? 'Admin' : label}` : ''} size="2xl">
        {form && (
          <form onSubmit={save} className="p-5">
            <div className="grid gap-5 md:grid-cols-2">
              <Input label="Full Name" required icon={<User />} wrapClass="md:col-span-2" value={form.name} onChange={(e) => set('name', e.target.value)} />
              <Input label="Email" type="email" required icon={<Mail />} value={form.email} onChange={(e) => set('email', e.target.value)} />
              <Input label="Phone" icon={<Phone />} value={form.phone} onChange={(e) => set('phone', e.target.value)} hint="E.164 format, e.g. +919876543210" />
              <div>
                <label className="label">Password {!form.id && <span className="text-red-500">*</span>}</label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type={showPw ? 'text' : 'password'} className="input pl-9 pr-10" autoComplete="new-password" required={!form.id} value={form.password}
                    onChange={(e) => set('password', e.target.value)} placeholder={form.id ? 'Leave blank to keep current' : 'Min 6 characters'} />
                  <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" onClick={() => setShowPw(!showPw)}>{showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
                </div>
              </div>
              {form.type === 'admin'
                ? <div><label className="label">Role</label><div className="input bg-slate-50 dark:bg-slate-800">{statusLabel('super_admin')}</div></div>
                : <Select label="Role" required={needsRole(form)} placeholder={isStore ? 'Owner (full access)' : 'Select role'} options={opts(roles, (r) => r.name)} value={form.role_id} onChange={(e) => set('role_id', e.target.value)} />}
              <div className="md:col-span-2">
                <Toggle checked={form.status} disabled={form.id === me?.uid} onChange={(v) => set('status', v)} label="Active" description="Inactive users cannot sign in." />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2 border-t border-line pt-5 dark:border-dark-line">
              <button type="button" className="btn-outline" onClick={() => setForm(null)}>Cancel</button>
              <button className="btn-primary" disabled={busy === 'save'} data-testid="save"><Save className="w-4 h-4" /> {busy === 'save' ? 'Saving…' : `Save ${label}`}</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
