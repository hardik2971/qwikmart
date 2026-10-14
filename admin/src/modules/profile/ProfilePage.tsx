'use client';
// My Profile (all panels) — port of admin/profile/edit.blade.php. Name/avatar written to users/{uid} (rules allow these
// fields on the own doc); password via reauthenticate + updatePassword.
import { useEffect, useState } from 'react';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword, updateProfile } from 'firebase/auth';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { KeyRound, UserRound } from 'lucide-react';
import { auth, db } from '@/lib/firebase';
import { useAuth, roleLabel } from '@/lib/auth';
import { Card, PageHeader } from '@/components/ui';
import { ImageUpload, Input } from '@/components/form/fields';
import { useToast } from '@/components/ui/toast';

export default function ProfilePage() {
  const { user, profile, claims, role } = useAuth();
  const toast = useToast();
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState('');
  const [saving, setSaving] = useState(false);
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwBusy, setPwBusy] = useState(false);

  useEffect(() => { setName(profile?.name || user?.displayName || ''); setAvatar(profile?.avatar || ''); }, [profile?.id]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      await updateDoc(doc(db(), 'users', user.uid), { name, avatar, updated_at: serverTimestamp() });
      await updateProfile(user, { displayName: name }).catch(() => {});
      toast('Profile updated');
    } catch (err: any) { toast(err?.message || 'Could not update profile', 'error'); }
    setSaving(false);
  };

  const changePw = async (e: React.FormEvent) => {
    e.preventDefault();
    const u = auth().currentUser;
    if (!u?.email) return;
    if (pw.next.length < 6) { toast('New password must be at least 6 characters', 'error'); return; }
    if (pw.next !== pw.confirm) { toast('Passwords do not match', 'error'); return; }
    setPwBusy(true);
    try {
      await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, pw.current));
      await updatePassword(u, pw.next);
      setPw({ current: '', next: '', confirm: '' });
      toast('Password changed');
    } catch (err: any) {
      toast(err?.code === 'auth/invalid-credential' || err?.code === 'auth/wrong-password' ? 'Current password is incorrect' : err?.message || 'Could not change password', 'error');
    }
    setPwBusy(false);
  };

  return (
    <div>
      <PageHeader title="My Profile" subtitle={roleLabel(claims, role)} />
      <div className="grid lg:grid-cols-2 gap-5">
        <Card title="Profile Information" icon={UserRound}>
          <form onSubmit={save} className="space-y-4">
            <ImageUpload label="Avatar" value={avatar} onChange={setAvatar} folder={`users/${user?.uid}/avatar`} />
            <Input label="Full Name" required value={name} onChange={(e) => setName(e.target.value)} />
            <Input label="Email" value={user?.email || ''} disabled hint="Contact a super admin to change your login email." />
            {profile?.phone && <Input label="Phone" value={profile.phone} disabled />}
            <div className="flex justify-end"><button className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</button></div>
          </form>
        </Card>
        <Card title="Change Password" icon={KeyRound}>
          <form onSubmit={changePw} className="space-y-4">
            <Input label="Current Password" type="password" required value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" />
            <Input label="New Password" type="password" required value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" />
            <Input label="Confirm New Password" type="password" required value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} autoComplete="new-password" />
            <div className="flex justify-end"><button className="btn-primary" disabled={pwBusy}>{pwBusy ? 'Updating…' : 'Update Password'}</button></div>
          </form>
        </Card>
      </div>
    </div>
  );
}
