'use client';

import { Cookie } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { useMounted } from '@/hooks';
import { useUiStore } from '@/store';

export default function CookieBar() {
  const t = useT();
  const mounted = useMounted();
  const consent = useUiStore((s) => s.cookieConsent);
  const set = useUiStore((s) => s.setCookieConsent);
  if (!mounted || consent) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-[70] border-t border-line bg-surface shadow-pop animate-slide-up">
      <div className="container flex flex-col gap-3 py-4 md:flex-row md:items-center md:gap-6">
        <div className="flex flex-1 items-start gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary">
            <Cookie className="h-4 w-4" />
          </span>
          <div>
            <div className="text-sm font-semibold text-ink">{t('privacy_title')}</div>
            <p className="text-xs leading-relaxed text-muted md:text-[13px]">{t('privacy_text')}</p>
          </div>
        </div>
        <div className="flex shrink-0 gap-2 self-end md:self-auto">
          <button onClick={() => set('declined')} className="btn-ghost px-5 py-2">
            {t('decline')}
          </button>
          <button onClick={() => set('accepted')} className="btn-outline px-5 py-2">
            {t('accept')}
          </button>
        </div>
      </div>
    </div>
  );
}
