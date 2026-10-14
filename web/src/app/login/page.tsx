'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { ArrowLeft, Eye, EyeOff, Lock, Mail, Phone, ShieldCheck, Truck, Zap } from 'lucide-react';
import { api } from '@/lib/api';
import {
  authMode,
  confirmPhoneOtp,
  registerWithEmail,
  sendPasswordReset,
  sendPhoneOtp,
  type SessionResult,
  signInWithEmail,
  type PhoneConfirmation,
} from '@/lib/auth';
import { errorMessage } from '@/lib/errors';
import { useMounted } from '@/hooks';
import { useAuthStore } from '@/store';
import { Logo, Spinner } from '@/components/ui';
import { useSettings } from '@/components/layout/TopBar';

function OtpInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length: 6 }, (_, i) => value[i] || '');
  const set = (i: number, d: string) => {
    const arr = digits.slice();
    arr[i] = d;
    onChange(arr.join('').slice(0, 6));
  };
  return (
    <div className="flex justify-between gap-2" dir="ltr">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={d}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, '');
            if (!v) return set(i, '');
            set(i, v[v.length - 1]);
            refs.current[i + 1]?.focus();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && !digits[i]) refs.current[i - 1]?.focus();
            if (e.key === 'ArrowLeft') refs.current[i - 1]?.focus();
            if (e.key === 'ArrowRight') refs.current[i + 1]?.focus();
          }}
          onPaste={(e) => {
            const p = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
            if (p) {
              e.preventDefault();
              onChange(p);
              refs.current[Math.min(p.length, 5)]?.focus();
            }
          }}
          className={clsx(
            'h-12 w-full min-w-0 rounded-btn border bg-surface text-center text-xl font-bold text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 sm:h-14',
            d ? 'border-primary' : 'border-line',
          )}
        />
      ))}
    </div>
  );
}

function Inner() {
  const sp = useSearchParams();
  const router = useRouter();
  const qc = useQueryClient();
  const next = sp.get('next') || '/';
  const ref = sp.get('ref') || '';
  const authed = useAuthStore((s) => !!s.user);

  const [tab, setTab] = useState<'otp' | 'email' | 'register'>('otp');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // otp
  const [cc, setCc] = useState('+91');
  const [phone, setPhone] = useState('');
  const [step, setStep] = useState<1 | 2>(1);
  const [otp, setOtp] = useState('');
  const [name, setName] = useState('');
  const [timer, setTimer] = useState(0);
  const confirmation = useRef<PhoneConfirmation | null>(null);
  // email / register
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [reg, setReg] = useState({ name: '', email: '', password: '', referral_code: ref });

  const countries = useQuery({ queryKey: ['countries'], queryFn: api.countries, staleTime: 600_000 });

  useEffect(() => {
    if (!timer) return;
    const t = setTimeout(() => setTimer((x) => x - 1), 1000);
    return () => clearTimeout(t);
  }, [timer]);

  useEffect(() => {
    if (authed && !busy) router.replace(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => setError(''), [tab]);

  /** Called after syncProfile (the guest cart was kept via linkWithCredential or merged with mergeGuestCart). */
  const finish = async (res: SessionResult) => {
    await qc.invalidateQueries();
    toast.success(res.is_new ? `Welcome to QwikMart, ${res.user.name}!` : `Welcome back, ${res.user.name}!`);
    router.replace(next);
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      const msg = errorMessage(e);
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const sendOtp = () =>
    run(async () => {
      if (!/^\d{6,14}$/.test(phone)) throw new Error('Enter a valid phone number');
      confirmation.current = await sendPhoneOtp(cc, phone, 'recaptcha-container');
      setOtp('');
      setStep(2);
      setTimer(30);
      toast.success(`OTP sent to ${cc} ${phone}`);
    });

  const verify = () =>
    run(async () => {
      if (otp.length !== 6) throw new Error('Enter the 6-digit OTP');
      if (!confirmation.current) throw new Error('Please request a new OTP');
      await finish(await confirmPhoneOtp(confirmation.current, otp, { name: name || undefined, referral_code: ref || undefined }));
    });

  const forgot = () =>
    run(async () => {
      if (!email.includes('@')) throw new Error('Enter your email address above, then tap "Forgot password?"');
      await sendPasswordReset(email);
      toast.success(authMode() === 'mock' ? 'Demo mode: no email is sent.' : `If an account exists for ${email}, a reset link is on its way.`);
    });

  const mounted = useMounted();
  const isMock = mounted && authMode() === 'mock';
  const settings = useSettings();
  // demo credentials only in mock mode or when the admin enabled demo mode (settings/public.demo_mode)
  const showDemo = isMock || (mounted && settings.data?.demo_mode === true);

  return (
    <div className="container flex justify-center py-10">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-2xl border border-line bg-surface shadow-card md:grid-cols-2">
        <div className="relative hidden flex-col justify-between overflow-hidden p-10 md:flex" style={{ background: 'linear-gradient(160deg,#EBEC8D 0%,#F8F9E9 60%,#E6F4E9 100%)' }}>
          <Logo className="h-11 w-auto" />
          <div>
            <h2 className="text-3xl font-extrabold leading-tight text-[#111827]">
              Groceries in <span className="text-primary">8 minutes.</span>
              <br /> Everything else in days.
            </h2>
            <ul className="mt-6 space-y-3 text-sm text-[#344054]">
              <li className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-primary"><Zap className="h-4 w-4" /></span> Lightning-fast quick commerce</li>
              <li className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-primary"><Truck className="h-4 w-4" /></span> Live order tracking with OTP delivery</li>
              <li className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-primary"><ShieldCheck className="h-4 w-4" /></span> Wallet, cashback &amp; referral rewards</li>
            </ul>
          </div>
          <div className="absolute -bottom-20 -end-20 h-72 w-72 rounded-full bg-primary/10" />
          {showDemo ? <p className="relative text-xs text-[#7C8DB5]">Demo: phone 9876543210 · OTP 123456 · customer@gmail.com / 123456</p> : <span />}
        </div>

        <div className="p-6 sm:p-10">
          <h1 className="text-2xl font-bold">{tab === 'register' ? 'Create your account' : 'Login to QwikMart'}</h1>
          <p className="mt-1 text-sm text-muted">{tab === 'register' ? 'It only takes a minute.' : 'Access orders, wallet and faster checkout.'}</p>

          <div className="mt-6 grid grid-cols-3 gap-1 rounded-btn bg-soft p-1">
            {[
              ['otp', 'Phone + OTP'],
              ['email', 'Email'],
              ['register', 'Register'],
            ].map(([k, l]) => (
              <button
                key={k}
                onClick={() => setTab(k as typeof tab)}
                className={clsx('rounded-lg py-2 text-xs font-semibold sm:text-sm', tab === k ? 'bg-surface text-primary shadow-soft' : 'text-muted')}
              >
                {l}
              </button>
            ))}
          </div>

          {tab === 'otp' && (
            <div className="mt-6">
              {step === 1 ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    sendOtp();
                  }}
                >
                  <label className="label">Mobile number</label>
                  <div className="flex gap-2">
                    <select value={cc} onChange={(e) => setCc(e.target.value)} className="input w-28">
                      {(countries.data || [{ id: 1, dial_code: '+91', flag: '🇮🇳', iso2: 'IN' }]).map((c) => (
                        <option key={c.id + c.dial_code} value={c.dial_code}>
                          {c.flag && !c.flag.startsWith('http') ? c.flag : c.iso2} {c.dial_code}
                        </option>
                      ))}
                    </select>
                    <div className="relative flex-1">
                      <Phone className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                      <input value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} inputMode="tel" placeholder="9876543210" className="input ps-9" autoFocus />
                    </div>
                  </div>
                  <button disabled={busy} className="btn-primary mt-5 w-full py-3">
                    {busy && <Spinner />} Send OTP
                  </button>
                </form>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    verify();
                  }}
                >
                  <button type="button" onClick={() => setStep(1)} className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
                    <ArrowLeft className="h-4 w-4 rtl:rotate-180" /> Change number
                  </button>
                  <p className="mb-3 text-sm">
                    Enter the 6-digit code sent to <b className="text-ink">{cc} {phone}</b>
                  </p>
                  <OtpInput value={otp} onChange={setOtp} />
                  <div className="mt-3 flex items-center justify-between text-sm">
                    <span className="text-muted">{isMock ? 'Demo OTP: 123456' : "Didn't get the code?"}</span>
                    <button type="button" disabled={timer > 0} onClick={sendOtp} className="font-semibold text-primary disabled:text-muted">
                      {timer > 0 ? `Resend in ${timer}s` : 'Resend OTP'}
                    </button>
                  </div>
                  <label className="label mt-4">Your name <span className="font-normal text-muted">(new users)</span></label>
                  <input value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="Full name" />
                  <button disabled={busy || otp.length !== 6} className="btn-primary mt-5 w-full py-3">
                    {busy && <Spinner />} Verify &amp; Continue
                  </button>
                </form>
              )}
            </div>
          )}

          {tab === 'email' && (
            <form
              className="mt-6 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                run(async () => finish(await signInWithEmail(email, password)));
              }}
            >
              <div>
                <label className="label">Email</label>
                <div className="relative">
                  <Mail className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                  <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" className="input ps-9" placeholder="customer@gmail.com" />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <label className="label">Password</label>
                  <button type="button" onClick={forgot} disabled={busy} className="mb-1.5 text-xs font-semibold text-primary">
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                  <input value={password} onChange={(e) => setPassword(e.target.value)} type={show ? 'text' : 'password'} className="input pe-10 ps-9" placeholder="••••••" />
                  <button type="button" onClick={() => setShow((s) => !s)} className="absolute end-3 top-1/2 -translate-y-1/2 text-muted" aria-label="Toggle password">
                    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <button disabled={busy} className="btn-primary w-full py-3">
                {busy && <Spinner />} Login
              </button>
              {showDemo && (
                <button
                  type="button"
                  onClick={() => {
                    setEmail('customer@gmail.com');
                    setPassword('123456');
                  }}
                  className="w-full text-center text-xs font-semibold text-primary"
                >
                  Use demo credentials
                </button>
              )}
            </form>
          )}

          {tab === 'register' && (
            <form
              className="mt-6 grid gap-4 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                run(async () => {
                  if (!reg.name || !reg.email || reg.password.length < 6) throw new Error('Fill all fields (password min 6 chars)');
                  await finish(await registerWithEmail({ ...reg, referral_code: reg.referral_code || undefined }));
                });
              }}
            >
              <div className="sm:col-span-2">
                <label className="label">Full name</label>
                <input value={reg.name} onChange={(e) => setReg({ ...reg, name: e.target.value })} className="input" />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Email</label>
                <input type="email" value={reg.email} onChange={(e) => setReg({ ...reg, email: e.target.value })} className="input" autoComplete="email" />
              </div>
              <div>
                <label className="label">Password</label>
                <input type="password" value={reg.password} onChange={(e) => setReg({ ...reg, password: e.target.value })} className="input" />
              </div>
              <div>
                <label className="label">Referral code <span className="font-normal text-muted">(optional)</span></label>
                <input value={reg.referral_code} onChange={(e) => setReg({ ...reg, referral_code: e.target.value.toUpperCase() })} className="input uppercase" />
              </div>
              <button disabled={busy} className="btn-primary py-3 sm:col-span-2">
                {busy && <Spinner />} Create Account
              </button>
            </form>
          )}

          {error && (
            <p role="alert" data-testid="auth-error" className="mt-4 rounded-btn bg-red-50 px-3 py-2 text-sm text-danger dark:bg-red-500/10">
              {error}
            </p>
          )}
          {/* host for the invisible reCAPTCHA used by Firebase phone sign-in */}
          <div id="recaptcha-container" />

          <p className="mt-6 text-center text-xs text-muted">
            By continuing you agree to our <Link href="/pages/terms" className="text-primary">Terms</Link> &amp;{' '}
            <Link href="/pages/privacy" className="text-primary">Privacy Policy</Link>.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}
