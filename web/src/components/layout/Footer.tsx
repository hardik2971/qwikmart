'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Mail, MapPin, PhoneCall } from 'lucide-react';
import { api } from '@/lib/api';
import { useCtxKey } from '@/hooks';
import { useT } from '@/lib/i18n';
import { AppStoreBadge, PAYMENT_BRANDS, PaymentLogo, PlayStoreBadge, socialIcons } from '../icons';
import { Logo } from '../ui';
import { useSettings } from './TopBar';

const MAX_PAYMENTS = 5;

function FooterHeading({ children }: { children: React.ReactNode }) {
  return <h4 className="mb-5 max-w-[200px] border-b border-white/15 pb-4 text-lg font-bold text-white">{children}</h4>;
}

function FooterLink({ href, children, strong }: { href: string; children: React.ReactNode; strong?: boolean }) {
  return (
    <li>
      <Link href={href} className={`group inline-flex items-center gap-2 text-[15px] transition hover:text-white ${strong ? 'font-semibold text-white' : 'text-white/80'}`}>
        <ChevronRight className="h-4 w-4 shrink-0 transition group-hover:translate-x-0.5 rtl:rotate-180" />
        {children}
      </Link>
    </li>
  );
}

export default function Footer() {
  const t = useT();
  const { data: s } = useSettings();
  const ctx = useCtxKey();
  const { data: categories } = useQuery({ queryKey: ['categories-tree', ...ctx], queryFn: () => api.categories(), staleTime: 300_000 });
  const year = new Date().getFullYear();
  const appName = s?.app_name || 'QwikMart';

  const topCategories = (categories ?? []).filter((c) => !c.parent_id).slice(0, 6);
  // Online gateways the admin enabled, then COD / wallet.
  const payments = (s?.payment_gateways ?? []).filter((g) => g.enabled !== false && PAYMENT_BRANDS[g.key]);
  const shown = payments.slice(0, MAX_PAYMENTS);
  const extra = payments.length - shown.length;
  const playUrl = s?.play_store_url || 'https://play.google.com/store/apps/details?id=com.qwikmart.app';

  return (
    <footer className="mt-24">
      {/* App download banner — overlaps the top of the dark footer */}
      <div className="container relative z-10">
        {/* No overflow-hidden on the card itself so the phone can pop out above it; decorations are clipped separately. */}
        <div className="relative rounded-[28px] bg-gradient-to-br from-[#2BAA3A] via-[#16952A] to-[#0B7A1C] px-6 py-8 shadow-xl md:px-12 md:py-10">
          <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-[28px]">
            <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-white/10" />
            <div className="absolute -bottom-28 left-1/3 h-64 w-64 rounded-full bg-white/5" />
          </div>
          <div className="relative grid items-center gap-6 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <div className="relative mx-auto -mb-8 -mt-16 w-full max-w-[380px] md:-mb-10 md:-mt-24">
              <Image
                src="/images/app-promo.webp"
                alt={`${appName} app`}
                width={760}
                height={520}
                className="h-auto w-full drop-shadow-2xl"
                sizes="(max-width:768px) 90vw, 380px"
              />
            </div>
            <div className="text-center md:text-start">
              <h2 className="text-3xl font-extrabold tracking-tight text-white md:text-[40px] md:leading-tight">{t('app_promo_title')}</h2>
              <p className="mx-auto mt-3 max-w-xl text-base text-white/90 md:mx-0 md:text-lg">{t('app_promo_text')}</p>
              <div className="mt-6 flex flex-wrap justify-center gap-3 md:justify-start">
                <a href={playUrl} target="_blank" rel="noreferrer" aria-label="Get it on Google Play" className="rounded-lg ring-1 ring-white/70 transition hover:-translate-y-0.5">
                  <PlayStoreBadge />
                </a>
                {s?.app_store_url ? (
                  <a href={s.app_store_url} target="_blank" rel="noreferrer" aria-label="Download on the App Store" className="rounded-lg ring-1 ring-white/70 transition hover:-translate-y-0.5">
                    <AppStoreBadge />
                  </a>
                ) : (
                  <span className="rounded-lg opacity-90 ring-1 ring-white/70" title="Coming soon">
                    <AppStoreBadge />
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="-mt-28 bg-[#1C2127] pt-40 text-white/80">
        <div className="container grid gap-10 pb-12 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <FooterHeading>{t('about_us')}</FooterHeading>
            <ul className="space-y-3.5">
              <FooterLink href="/pages/about">{t('about_us')}</FooterLink>
              <FooterLink href="/pages/terms">{t('terms')}</FooterLink>
              <FooterLink href="/pages/privacy">{t('privacy')}</FooterLink>
              <FooterLink href="/blog">{t('blog')}</FooterLink>
              <FooterLink href="/support">{t('contact_us')}</FooterLink>
              <FooterLink href="/faq">{t('faq')}</FooterLink>
            </ul>
          </div>

          <div>
            <FooterHeading>{t('categories')}</FooterHeading>
            <ul className="space-y-3.5">
              {topCategories.map((c) => (
                <FooterLink key={c.id} href={`/category/${c.slug}`}>
                  {c.name}
                </FooterLink>
              ))}
              <FooterLink href="/categories" strong>
                {t('view_all_categories')}
              </FooterLink>
            </ul>
          </div>

          <div>
            <FooterHeading>{t('my_account')}</FooterHeading>
            <ul className="space-y-3.5">
              <FooterLink href="/orders">{t('my_orders')}</FooterLink>
              <FooterLink href="/wallet">{t('wallet')}</FooterLink>
              <FooterLink href="/refer-earn">{t('refer_earn')}</FooterLink>
              <FooterLink href="/favorites">{t('favorites')}</FooterLink>
              <FooterLink href="/pages/refund">{t('return_refund_policy')}</FooterLink>
            </ul>
          </div>

          <div>
            <h4 className="mb-5 border-b border-white/15 pb-4 text-lg font-bold text-white">{t('get_in_touch')}</h4>
            <ul className="space-y-4">
              {s?.company_address && (
                <li className="flex items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white"><MapPin className="h-5 w-5" /></span>
                  <span className="pt-1 text-[15px] leading-snug text-white/90">{s.company_address}</span>
                </li>
              )}
              {s?.support_phone && (
                <li className="flex items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white"><PhoneCall className="h-5 w-5" /></span>
                  <a href={`tel:${s.support_phone.replace(/\s+/g, '')}`} className="text-[15px] text-white/90 hover:text-white">{s.support_phone}</a>
                </li>
              )}
              {s?.support_email && (
                <li className="flex items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white"><Mail className="h-5 w-5" /></span>
                  <a href={`mailto:${s.support_email}`} className="break-all text-[15px] text-white/90 hover:text-white">{s.support_email}</a>
                </li>
              )}
            </ul>
            {shown.length > 0 && (
              <div className="mt-6 border-t border-white/15 pt-5">
                <p className="mb-3 text-sm font-bold text-white">{t('we_accept')}</p>
                <div className="flex flex-wrap items-center gap-2.5">
                  {shown.map((g) => (
                    <span key={g.key} title={PAYMENT_BRANDS[g.key]?.name ?? g.name} className="rounded-lg bg-white p-1">
                      <PaymentLogo method={g.key} size={30} />
                    </span>
                  ))}
                  {extra > 0 && (
                    <span className="flex h-[38px] min-w-[38px] items-center justify-center rounded-lg bg-white/15 px-2 text-xs font-bold text-white">+{extra}</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-white/10">
          <div className="container flex flex-col items-center justify-between gap-4 py-5 sm:flex-row">
            <div className="flex items-center gap-3">
              <span className="rounded-lg bg-white px-2 py-1"><Logo className="h-7 w-auto" /></span>
              <span className="text-sm text-white/70">© {year} {(s?.company_name || appName).replace(/\.$/, '')}. All Rights Reserved.</span>
            </div>
            <div className="flex gap-2">
              {/* only networks configured in settings/public.social (no dead "#" links) */}
              {socialIcons.filter(({ key }) => !!s?.social_links?.[key]).map(({ key, Icon }) => (
                <a
                  key={key}
                  href={s?.social_links?.[key]}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={key}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition hover:-translate-y-0.5 hover:bg-white/20"
                >
                  <Icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
