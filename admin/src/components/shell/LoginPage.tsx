'use client';
// Port of auth/login.blade.php (screenshot 46) + auth/forgot.blade.php, using Firebase email/password auth.
import Link from 'next/link';
import { Suspense, useEffect, useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signInWithEmailAndPassword, sendPasswordResetEmail, signOut } from 'firebase/auth';
import { Mail, KeyRound, Eye, EyeOff, ArrowRight, ShieldCheck, Store, Truck, ShoppingCart, ShoppingBag, ArrowLeft } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { panelForRole, useAuth, type Panel } from '@/lib/auth';
import { usePublicSettings } from '@/lib/panel';
import { useToast } from '@/components/ui/toast';

export const DEMO: Record<Panel, { email: string; password: string }> = {
  admin: { email: 'admin@gmail.com', password: '123456' },
  store: { email: 'mumbai@store.com', password: 'Mumbai@1' },
  delivery: { email: 'alex@gmail.com', password: 'Alex@1234' },
};
const TITLE: Record<Panel, string> = { admin: 'Admin', store: 'Store Panel', delivery: 'Delivery Boy Panel' };

function authError(code: string): string {
  switch (code) {
    case 'auth/invalid-credential': case 'auth/wrong-password': case 'auth/user-not-found': case 'auth/invalid-login-credentials': return 'These credentials do not match our records.';
    case 'auth/too-many-requests': return 'Too many attempts. Please try again later.';
    case 'auth/user-disabled': return 'This account has been disabled.';
    case 'auth/network-request-failed': return 'Network error — is the Firebase emulator running?';
    case 'auth/invalid-email': return 'Please enter a valid email address.';
    default: return 'Login failed. Please try again.';
  }
}

function Illustration() {
  return (
    <>
      <div className="hidden lg:block absolute inset-y-0 left-0 w-[62%] pointer-events-none select-none" aria-hidden="true">
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 1200 1000" preserveAspectRatio="none">
          <defs>
            <linearGradient id="g1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#2DB84A" /><stop offset=".55" stopColor="#16A033" /><stop offset="1" stopColor="#0E9623" /></linearGradient>
            <linearGradient id="g2" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#A8DDB2" stopOpacity=".9" /><stop offset="1" stopColor="#E6F4E9" stopOpacity=".2" /></linearGradient>
            <linearGradient id="g3" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#5CC46F" /><stop offset="1" stopColor="#CDEAD3" stopOpacity=".4" /></linearGradient>
          </defs>
          <path d="M0 0 H520 C380 140 640 300 520 470 C420 610 760 760 900 1000 H0 Z" fill="url(#g2)" />
          <path d="M0 0 H330 C200 160 470 300 360 480 C260 640 560 780 700 1000 H0 Z" fill="url(#g3)" />
          <path d="M0 0 H200 C70 170 330 330 230 500 C150 640 380 800 480 1000 H0 Z" fill="url(#g1)" />
          <path d="M0 620 C200 700 420 760 760 1000 H0 Z" fill="#0E9623" opacity=".85" />
          <path d="M440 120 C620 160 700 300 640 420 C600 520 640 620 740 700" fill="none" stroke="#0E9623" strokeWidth="2.5" strokeDasharray="7 9" opacity=".6" />
          <circle cx="60" cy="18" r="16" fill="none" stroke="#fff" strokeWidth="3" opacity=".9" />
          <circle cx="620" cy="75" r="10" fill="none" stroke="#0E9623" strokeWidth="2.5" opacity=".5" />
          <circle cx="1000" cy="870" r="16" fill="none" stroke="#0E9623" strokeWidth="2.5" opacity=".45" />
        </svg>
        <div className="absolute top-[7%] left-[19%] w-44 h-32 dots opacity-70" />
        <div className="absolute top-[19%] left-[30%] float-1 w-28 h-28 rounded-full bg-white/90 shadow-xl flex items-center justify-center text-primary"><ShoppingCart className="w-14 h-14" strokeWidth={2.2} /></div>
        <div className="absolute top-[28%] left-[12%] float-2 w-28 h-28 rounded-full bg-white/90 shadow-xl flex items-center justify-center"><span className="w-16 h-16 rounded-full bg-primary text-white flex items-center justify-center text-3xl font-extrabold">%</span></div>
        <div className="absolute top-[38%] left-[46%] float-3 w-28 h-28 rounded-full bg-white/90 shadow-xl flex items-center justify-center text-primary"><Truck className="w-14 h-14" strokeWidth={2.2} /></div>
        <div className="absolute top-[63%] left-[54%] float-4 w-28 h-28 rounded-full bg-white/90 shadow-xl flex items-center justify-center text-primary"><ShoppingBag className="w-14 h-14" strokeWidth={2.2} /></div>
        {/* cart + bags + boxes (vector art from firebase/tools/assets — build-catalog.ts) */}
        <img src="/images/login/login-cart-scene.webp" alt="" className="absolute bottom-[4%] left-[4%] w-[min(520px,34vw)] h-auto drop-shadow-xl" />
      </div>
      <div className="hidden lg:block absolute bottom-10 right-0 w-56 h-80 dots-gray" />
    </>
  );
}

export function AuthCard({ children }: { children: ReactNode }) {
  return (
    <div className="login-bg min-h-screen overflow-x-hidden">
      <div className="relative min-h-screen flex items-center justify-center lg:justify-end px-4 py-10 lg:pr-[7vw]">
        <Illustration />
        <div className="relative z-10 w-full max-w-[430px] rounded-[22px] bg-white shadow-[0_20px_60px_-15px_rgba(16,24,40,.25)] px-8 sm:px-10 py-10">
          <div className="flex justify-center"><img src="/images/brand/qwikmart-logo.png" alt="QwikMart" className="h-14" /></div>
          {children}
          <p className="mt-7 text-center text-xs text-slate-500">© {new Date().getFullYear()} QwikMart. All Rights Reserved.</p>
        </div>
      </div>
    </div>
  );
}

function LoginInner({ panel }: { panel: Panel }) {
  const router = useRouter();
  const sp = useSearchParams();
  const toast = useToast();
  const { user, claims, loading } = useAuth();
  const settings = usePublicSettings();
  // Demo credentials are pre-filled / shown only when settings/public.demo_mode is explicitly true (missing = false).
  const demo = settings.demo_mode === true ? DEMO[panel] : null;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [prefilled, setPrefilled] = useState(false);
  // Until React has hydrated, a submit would fall back to a native GET and put the credentials in the URL.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  // prefill once, and never over what the user already typed (settings/public can arrive after they started typing)
  useEffect(() => { if (demo && !prefilled) { setPrefilled(true); if (!email && !password) { setEmail(demo.email); setPassword(demo.password); } } }, [demo, prefilled]);
  useEffect(() => { if (sp.get('error') === 'role') setError('This account cannot access this panel.'); }, [sp]);

  // already signed in with the right role → go straight to the panel
  useEffect(() => {
    if (loading || !user || busy) return;
    const target = panelForRole(claims.role, claims.store_id);
    if (target === panel && (panel !== 'store' || claims.store_id)) router.replace(sp.get('next') || `/${panel}/dashboard`);
  }, [loading, user, claims.role]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const cred = await signInWithEmailAndPassword(auth(), email.trim(), password);
      const tok = await cred.user.getIdTokenResult(true);
      const target = panelForRole(tok.claims.role as string, tok.claims.store_id as string | undefined);
      if (!target) { await signOut(auth()); setError('This account cannot access the panel.'); setBusy(false); return; }
      if (target === 'store' && !tok.claims.store_id) { await signOut(auth()); setError('This store account is not linked to a store.'); setBusy(false); return; }
      toast('Welcome back!');
      router.replace(target === panel ? sp.get('next') || `/${panel}/dashboard` : `/${target}/dashboard`);
    } catch (err: any) {
      setError(authError(err?.code));
      setBusy(false);
    }
  };

  return (
    <AuthCard>
      <h1 className="mt-7 text-center text-2xl font-bold text-navy">Welcome back</h1>
      <p className="mt-1 text-center text-sm text-slate-500">Sign in to continue to your {panel === 'admin' ? 'dashboard' : TITLE[panel].toLowerCase()}</p>
      {panel !== 'admin' && <div className="mt-3 flex justify-center"><span className="pill bg-primary-50 text-primary border border-primary/20">{TITLE[panel]}</span></div>}
      <form onSubmit={submit} method="post" action="#" data-ready={ready ? "1" : undefined} className="mt-7 space-y-4">
        <div>
          <label htmlFor="email" className="block text-[13px] font-medium text-navy mb-1.5">Email address</label>
          <div className="relative">
            <Mail className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
            <input id="email" name="email" type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className={`input !py-3 !pl-11 !rounded-xl ${error ? '!border-red-400' : ''}`} />
          </div>
          {error && <p className="mt-1.5 text-xs text-red-500" data-testid="login-error">{error}</p>}
        </div>
        <div>
          <label htmlFor="password" className="block text-[13px] font-medium text-navy mb-1.5">Password</label>
          <div className="relative">
            <KeyRound className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
            <input id="password" name="password" type={show ? 'text' : 'password'} required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••" className="input !py-3 !pl-11 !pr-11 !rounded-xl" />
            <button type="button" className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-primary" onClick={() => setShow(!show)} title="Show / hide password">
              {show ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </button>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-[13px] text-slate-600"><input type="checkbox" defaultChecked className="rounded border-line text-primary focus:ring-primary/30" /> Remember me</label>
          <Link href={`/${panel}/forgot-password`} className="text-[13px] text-slate-600 hover:text-primary">Forgot Password?</Link>
        </div>
        <button type="submit" disabled={busy || !ready} data-testid="login-submit" className="w-full mt-2 flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-white font-semibold shadow-[0_8px_20px_-6px_rgba(14,150,35,.55)] hover:bg-primary-dark transition disabled:opacity-60">
          {busy ? 'Signing in…' : 'Login'} <ArrowRight className="w-4 h-4" />
        </button>
      </form>
      <div className="my-5 flex items-center gap-3 text-xs text-slate-400"><span className="flex-1 h-px bg-line" />or<span className="flex-1 h-px bg-line" /></div>
      <div className="space-y-3">
        {panel !== 'admin' && <Link href="/admin/login" className="w-full flex items-center justify-center gap-2 rounded-xl border border-primary/40 bg-primary-50 py-3 text-primary font-semibold hover:bg-primary-100 transition"><ShieldCheck className="w-4 h-4" /> Super Admin Panel</Link>}
        {panel !== 'store' && <Link href="/store/login" className="w-full flex items-center justify-center gap-2 rounded-xl border border-primary/40 bg-primary-50 py-3 text-primary font-semibold hover:bg-primary-100 transition"><Store className="w-4 h-4" /> Store Panel</Link>}
        {panel !== 'delivery' && <Link href="/delivery/login" className="w-full flex items-center justify-center gap-2 rounded-xl border border-primary/40 bg-primary-50 py-3 text-primary font-semibold hover:bg-primary-100 transition"><Truck className="w-4 h-4" /> Delivery Boy Panel</Link>}
      </div>
      {demo && <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800"><b>Demo:</b> {demo.email} / {demo.password}</div>}
    </AuthCard>
  );
}

export function LoginPage({ panel }: { panel: Panel }) {
  return <Suspense fallback={null}><LoginInner panel={panel} /></Suspense>;
}

export function ForgotPasswordPage({ panel }: { panel: Panel }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      await sendPasswordResetEmail(auth(), email.trim(), { url: `${window.location.origin}/${panel}/login` });
      setSent(true);
    } catch (err: any) {
      // don't leak whether the account exists
      if (err?.code === 'auth/user-not-found') setSent(true); else setError(authError(err?.code));
    }
    setBusy(false);
  };
  return (
    <AuthCard>
      <h1 className="mt-7 text-center text-2xl font-bold text-navy">Forgot password?</h1>
      <p className="mt-1 text-center text-sm text-slate-500">Enter your email and we'll send you a reset link.</p>
      {sent ? (
        <div className="mt-6 rounded-xl border border-primary/30 bg-primary-50 px-4 py-3 text-sm text-primary" data-testid="reset-sent">If an account exists for <b>{email}</b>, a password reset link has been sent.</div>
      ) : (
        <form onSubmit={submit} method="post" action="#" className="mt-7 space-y-4">
          <div>
            <label className="block text-[13px] font-medium text-navy mb-1.5">Email address</label>
            <div className="relative">
              <Mail className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
              <input type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="input !py-3 !pl-11 !rounded-xl" />
            </div>
            {error && <p className="mt-1.5 text-xs text-red-500">{error}</p>}
          </div>
          <button type="submit" disabled={busy} className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-white font-semibold hover:bg-primary-dark transition disabled:opacity-60">
            {busy ? 'Sending…' : 'Send Reset Link'} <ArrowRight className="w-4 h-4" />
          </button>
        </form>
      )}
      <Link href={`/${panel}/login`} className="mt-5 flex items-center justify-center gap-1.5 text-sm text-slate-600 hover:text-primary"><ArrowLeft className="w-4 h-4" /> Back to login</Link>
    </AuthCard>
  );
}
