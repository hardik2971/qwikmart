'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { onIdTokenChanged, signOut, type User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from './firebase';
import type { Claims, RoleDoc, UserDoc } from './types';

export type Panel = 'admin' | 'store' | 'delivery';

export interface AuthState {
  loading: boolean;
  user: User | null;
  claims: Claims;
  profile: UserDoc | null;
  role: RoleDoc | null;
  /** false while the staff / store-staff role doc is still loading */
  roleReady: boolean;
  /** permission check — same semantics as Laravel Role::hasPermission (exact key, `module.*`, `*`). */
  can: (perm?: string | null) => boolean;
  refreshClaims: () => Promise<Claims>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

/** Panel for a custom-claim role. Legacy store staff (role 'staff' + store_id claim, as imported from Laravel) belong to the store panel, never /admin. */
export function panelForRole(role?: string, storeId?: string | null): Panel | null {
  if (role === 'staff' && storeId) return 'store';
  if (role === 'admin' || role === 'staff') return 'admin';
  if (role === 'store') return 'store';
  if (role === 'delivery_boy') return 'delivery';
  return null;
}

export function roleLabel(claims: Claims, role: RoleDoc | null): string {
  switch (claims.role) {
    case 'admin': return 'Super Admin';
    case 'store': return role?.name ?? 'Owner';
    case 'staff': return role?.name ?? 'Staff';
    case 'delivery_boy': return 'Delivery Boy';
    default: return 'Customer';
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [claims, setClaims] = useState<Claims>({});
  const [profile, setProfile] = useState<UserDoc | null>(null);
  const [role, setRole] = useState<RoleDoc | null>(null);
  const [roleReady, setRoleReady] = useState(false);

  useEffect(() => {
    return onIdTokenChanged(auth(), async (u) => {
      setUser(u);
      if (u) {
        try {
          const t = await u.getIdTokenResult();
          setClaims({ role: t.claims.role as any, store_id: t.claims.store_id as any, role_id: t.claims.role_id as any, zone_id: t.claims.zone_id as any });
        } catch { setClaims({}); }
      } else {
        setClaims({}); setProfile(null); setRole(null);
      }
      setLoading(false);
    });
  }, []);

  // live profile doc
  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db(), 'users', user.uid), (s) => setProfile(s.exists() ? ({ id: s.id, ...s.data() } as UserDoc) : null), () => setProfile(null));
  }, [user?.uid]);

  // role permissions (staff / store staff)
  useEffect(() => {
    const rid = claims.role_id || profile?.role_id;
    if (!user || !rid || claims.role === 'admin') { setRole(null); setRoleReady(true); return; }
    setRoleReady(false);
    return onSnapshot(doc(db(), 'roles', rid), (s) => { setRole(s.exists() ? ({ id: s.id, ...s.data() } as RoleDoc) : null); setRoleReady(true); }, () => { setRole(null); setRoleReady(true); });
  }, [user?.uid, claims.role_id, profile?.role_id, claims.role]);

  const can = useCallback((perm?: string | null) => {
    if (!perm) return true;
    if (claims.role === 'admin') return true;
    if (claims.role === 'store' && !(claims.role_id || profile?.role_id)) return true;
    const perms = role?.permissions ?? [];
    const [module] = perm.split('.');
    return perms.includes('*') || perms.includes(perm) || perms.includes(`${module}.*`);
  }, [claims.role, claims.role_id, profile?.role_id, role]);

  const refreshClaims = useCallback(async () => {
    const u = auth().currentUser;
    if (!u) return {};
    const t = await u.getIdTokenResult(true);
    const c: Claims = { role: t.claims.role as any, store_id: t.claims.store_id as any, role_id: t.claims.role_id as any, zone_id: t.claims.zone_id as any };
    setClaims(c);
    return c;
  }, []);

  const logout = useCallback(async () => { await signOut(auth()); }, []);

  const value = useMemo(() => ({ loading, user, claims, profile, role, roleReady, can, refreshClaims, logout }), [loading, user, claims, profile, role, roleReady, can, refreshClaims, logout]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}
