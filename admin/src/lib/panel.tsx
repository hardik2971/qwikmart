'use client';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import { useAuth, type Panel } from './auth';
import type { Country, Language, PublicSettings } from './types';
import { setReadPolicy, useCountries, useLanguages } from './firestore';
import { setCurrencySymbol } from './format';

export interface PanelCtx {
  panel: Panel;
  /** "/admin" | "/store" | "/delivery" */
  base: string;
  /** href helper: p('/orders') → '/admin/orders' */
  p: (path: string) => string;
  /** store scope (store panel only) */
  storeId: string | null;
  isStore: boolean;
  isAdmin: boolean;
  /** header country selector (admin) — '' = all countries */
  countryId: string;
  setCountryId: (id: string) => void;
  country: Country | null;
  countries: Country[];
  settings: PublicSettings;
  languages: { code: string; name: string; rtl: boolean }[];
  uiLang: string;
  setUiLang: (code: string) => void;
}

const Ctx = createContext<PanelCtx | null>(null);

export const DEFAULT_LANGS = [
  { code: 'en', name: 'English', rtl: false },
  { code: 'ar', name: 'Arabic', rtl: true },
  { code: 'hi', name: 'Hindi', rtl: false },
];

/** Live settings/public (public read) — also used on the login pages for demo_mode. */
export function usePublicSettings() {
  const [s, setS] = useState<PublicSettings>({});
  useEffect(() => onSnapshot(doc(db(), 'settings', 'public'), (d) => setS((d.data() as PublicSettings) || {}), () => setS({})), []);
  return s;
}

/** Collections the rules deny to store users (store panel never reads them). */
const STORE_DENIED = ['users', 'cash_collections', 'delivery_earnings', 'withdrawal_requests', 'email_templates', 'mail_log', 'referrals', 'wallet_transactions', 'addresses'];
/** Staff: collection → any of these permissions (firestore.rules). */
const STAFF_NEEDS: Record<string, string[]> = {
  users: ['customer.list', 'staff.list', 'delivery_boy.list'], cash_collections: ['delivery_boy.list', 'wallet.list'], delivery_earnings: ['delivery_boy.list', 'wallet.list'],
  withdrawal_requests: ['withdrawal.list'], email_templates: ['email.list', 'email.create'], mail_log: ['email.list'], referrals: ['customer.list'],
  wallet_transactions: ['wallet.list', 'customer.list'], addresses: ['customer.list', 'order.view'],
};

export function PanelProvider({ panel, children }: { panel: Panel; children: ReactNode }) {
  const { claims, user, can } = useAuth();
  // keep reads inside what firestore.rules allow for this user (set during render so child effects already see it)
  {
    const uid = user?.uid;
    const segs = (path: string) => path.split('/').filter(Boolean);
    setReadPolicy((path, id) => {
      const s = segs(path);
      const coll = s[s.length - 1];
      const ownerUid = s[0] === 'users' && s.length >= 2 ? s[1] : coll === 'users' ? id : undefined;
      if (ownerUid && ownerUid === uid) return true; // own profile / sub-collections
      if (panel === 'store') {
        if (coll === 'users' && s.length === 1 && id === undefined) return can('staff.list'); // Store Users list (rules: store_id == own store)
        return !STORE_DENIED.includes(coll) && !(s[0] === 'users' && s.length > 1);
      }
      if (claims.role === 'staff') { const need = STAFF_NEEDS[coll] || (s[0] === 'users' && s.length > 1 ? STAFF_NEEDS.users : null); return !need || need.some((p) => can(p)); }
      return true;
    });
  }
  const settings = usePublicSettings();
  const { data: countries = [] } = useCountries();
  const { data: langDocs } = useLanguages();
  const [countryId, setCountryIdState] = useState('');
  const [uiLang, setUiLangState] = useState('en');

  useEffect(() => {
    try { setCountryIdState(localStorage.getItem('sb-country') || ''); setUiLangState(localStorage.getItem('sb-lang') || 'en'); } catch { /* */ }
  }, []);
  const setCountryId = (id: string) => { setCountryIdState(id); try { localStorage.setItem('sb-country', id); } catch { /* */ } };
  const setUiLang = (c: string) => { setUiLangState(c); try { localStorage.setItem('sb-lang', c); } catch { /* */ } };

  const languages = useMemo(() => {
    const active = (langDocs || []).filter((l) => l.status === 'active' || l.status === true);
    if (!active.length) return DEFAULT_LANGS;
    return active
      .sort((a, b) => Number(!!b.is_default) - Number(!!a.is_default) || a.id.localeCompare(b.id))
      .map((l: Language) => ({ code: l.id, name: l.name, rtl: !!l.is_rtl }));
  }, [langDocs]);

  const country = countries.find((c) => c.id === countryId) || null;
  useEffect(() => {
    const def = country || countries.find((c) => c.id === settings.default_country_id) || countries.find((c) => c.is_default);
    setCurrencySymbol(def?.currency_symbol || '₹');
  }, [country, countries, settings.default_country_id]);

  const base = `/${panel}`;
  const storeId = panel === 'store' ? claims.store_id || null : null;
  const value: PanelCtx = {
    panel, base, p: (path: string) => `${base}${path.startsWith('/') ? path : '/' + path}`,
    storeId, isStore: panel === 'store', isAdmin: panel === 'admin',
    countryId: panel === 'admin' ? countryId : '', setCountryId, country, countries, settings, languages, uiLang, setUiLang,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePanel() {
  const v = useContext(Ctx);
  if (!v) throw new Error('usePanel outside PanelProvider');
  return v;
}
