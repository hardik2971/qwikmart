'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Camera, KeyRound, Trash2 } from 'lucide-react';
import { api, isUsingMock } from '@/lib/api';
import { changePassword, clearSession, hasPasswordLogin } from '@/lib/auth';
import { errorMessage } from '@/lib/errors';
import { LANGUAGES } from '@/lib/i18n';
import { useCurrency, useIsAuthed, useMounted } from '@/hooks';
import { useAuthStore, useUiStore, type Lang } from '@/store';
import AccountShell from '@/components/account/AccountShell';
import { Spinner } from '@/components/ui';

/** Email/password customers only — re-authenticates with Firebase, then updatePassword(). */
function ChangePasswordCard() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    hasPasswordLogin().then(setEnabled, () => setEnabled(false));
  }, []);
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const m = useMutation({
    mutationFn: async () => {
      if (pw.next.length < 6) throw new Error('New password must be at least 6 characters');
      if (pw.next !== pw.confirm) throw new Error('New passwords do not match');
      await changePassword(pw.current, pw.next);
    },
    onSuccess: () => {
      setPw({ current: '', next: '', confirm: '' });
      toast.success('Password changed');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!enabled) return null;
  return (
    <div className="card p-5">
      <h2 className="mb-4 flex items-center gap-2 font-bold">
        <KeyRound className="h-4 w-4 text-primary" /> Change password
      </h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate();
        }}
        className="grid gap-4 md:grid-cols-3"
      >
        <div>
          <label className="label">Current password</label>
          <input className="input" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
        </div>
        <div>
          <label className="label">New password</label>
          <input className="input" type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
        </div>
        <div>
          <label className="label">Confirm new password</label>
          <input className="input" type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
        </div>
        <div className="md:col-span-3">
          <button disabled={m.isPending || !pw.current || !pw.next} className="btn-primary min-w-[160px]">
            {m.isPending && <Spinner />} Update password
          </button>
        </div>
      </form>
    </div>
  );
}

export default function ProfilePage() {
  const authed = useIsAuthed();
  const mounted = useMounted();
  const router = useRouter();
  const qc = useQueryClient();
  const { fmt } = useCurrency();
  const setUser = useAuthStore((s) => s.setUser);
  const lang = useUiStore((s) => s.language);
  const setLang = useUiStore((s) => s.setLanguage);
  const q = useQuery({ queryKey: ['profile'], queryFn: api.profile, enabled: authed });
  const [form, setForm] = useState({ name: '', email: '', phone: '' });

  useEffect(() => {
    if (q.data) {
      setForm({ name: q.data.name || '', email: q.data.email || '', phone: q.data.phone || '' });
      setUser(q.data);
    }
  }, [q.data, setUser]);

  const save = useMutation({
    // phone & password are managed by Firebase Authentication, not the profile API
    mutationFn: () => api.updateProfile({ name: form.name, email: form.email }),
    onSuccess: (u) => {
      setUser(u);
      qc.invalidateQueries({ queryKey: ['profile'] });
      toast.success('Profile updated');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const fileRef = useRef<HTMLInputElement>(null);
  const avatar = useMutation({
    mutationFn: (file: File) => api.uploadAvatar(file),
    onSuccess: (u) => {
      setUser(u);
      qc.setQueryData(['profile'], u);
      toast.success('Profile photo updated');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  // Firebase: the email is the sign-in identity (users/{uid}.email is server-owned) — shown read-only
  const emailLocked = !isUsingMock() && !!q.data?.email;
  const del = useMutation({
    mutationFn: api.deleteProfile,
    onSuccess: async () => {
      await clearSession();
      qc.clear();
      toast.success('Account deleted');
      router.push('/');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <AccountShell title="Profile">
      <div className="space-y-5">
        <div className="card p-5">
          <h1 className="mb-1 text-xl font-bold">Personal Information</h1>
          <div className="mb-4 flex items-center gap-4">
            <span className="relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-primary-50 text-xl font-bold text-primary">
              {q.data?.avatar ? <Image src={q.data.avatar} alt="" fill sizes="64px" className="object-cover" /> : (q.data?.name?.[0]?.toUpperCase() || 'U')}
            </span>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) avatar.mutate(f);
                e.target.value = '';
              }}
            />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={avatar.isPending} className="btn-ghost px-3 py-1.5 text-sm">
              {avatar.isPending ? <Spinner /> : <Camera className="h-4 w-4" />} Change photo
            </button>
          </div>
          <p className="mb-5 text-sm text-muted">Wallet balance: <b className="text-primary">{fmt(q.data?.wallet_balance ?? 0)}</b> · Referral code: <b className="text-ink">{q.data?.referral_code}</b></p>
          {q.isLoading ? (
            <div className="skeleton h-40" />
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                save.mutate();
              }}
              className="grid gap-4 md:grid-cols-2"
            >
              <div>
                <label className="label">Full name</label>
                <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <label className="label">Email</label>
                <input
                  className={emailLocked ? 'input opacity-70' : 'input'}
                  type="email"
                  value={form.email}
                  readOnly={emailLocked}
                  title={emailLocked ? 'Your email is your sign-in ID' : undefined}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div>
                <label className="label">Phone</label>
                <input
                  className="input opacity-70"
                  value={form.phone ? `${q.data?.country_code || ''} ${form.phone}`.trim() : ''}
                  readOnly
                  placeholder="Add by logging in with Phone + OTP"
                  title="Your phone number is verified through OTP login"
                />
              </div>
              <div className="flex items-end">
                <button disabled={save.isPending} className="btn-primary min-w-[140px]">
                  {save.isPending && <Spinner />} Save Changes
                </button>
              </div>
            </form>
          )}
        </div>

        <ChangePasswordCard />

        <div className="card p-5">
          <h2 className="mb-4 font-bold">Preferences</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="label">Language</label>
              <select className="input" value={mounted ? lang : 'en'} onChange={(e) => setLang(e.target.value as Lang)}>
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.name} {l.rtl ? '(RTL)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="card border-red-200 p-5 dark:border-red-500/30">
          <h2 className="font-bold text-danger">Delete account</h2>
          <p className="mt-1 text-sm text-muted">This permanently removes your account, wallet and order history.</p>
          <button
            onClick={() => confirm('Are you sure? This cannot be undone.') && del.mutate()}
            className="btn mt-3 border border-danger text-danger hover:bg-red-50 dark:hover:bg-red-500/10"
          >
            <Trash2 className="h-4 w-4" /> Delete my account
          </button>
        </div>
      </div>
    </AccountShell>
  );
}
