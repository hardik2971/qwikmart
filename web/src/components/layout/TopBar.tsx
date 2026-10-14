'use client';

import { Phone, Globe } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { LANGUAGES, useT } from '@/lib/i18n';
import { useMounted } from '@/hooks';
import { useUiStore, type Lang } from '@/store';
import { socialIcons } from '../icons';

export function useSettings() {
  return useQuery({ queryKey: ['settings'], queryFn: api.settings, staleTime: 10 * 60_000 });
}

export default function TopBar() {
  const t = useT();
  const { data: settings } = useSettings();
  const mounted = useMounted();
  const lang = useUiStore((s) => s.language);
  const setLang = useUiStore((s) => s.setLanguage);
  const links = settings?.social_links || {};

  return (
    <div className="hidden border-b border-black/5 text-xs text-ink/80 md:block" style={{ background: 'var(--header-from)' }}>
      <div className="container flex h-9 items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="font-medium">{t('follow_us')}</span>
          {socialIcons.map(({ key, Icon, color }) => (
            <a
              key={key}
              href={links[key] || '#'}
              target="_blank"
              rel="noreferrer"
              aria-label={key}
              className="flex h-5 w-5 items-center justify-center rounded-full text-white transition hover:scale-110"
              style={{ background: color }}
            >
              <Icon className="h-3 w-3" />
            </a>
          ))}
        </div>
        <div className="flex items-center gap-5">
          <a href={`tel:${settings?.support_phone || ''}`} className="inline-flex items-center gap-1.5 hover:text-primary">
            <Phone className="h-3.5 w-3.5" /> {settings?.support_phone || '+91 8200323466'}
          </a>
          <label className="inline-flex items-center gap-1.5">
            <Globe className="h-3.5 w-3.5" />
            <select
              value={mounted ? lang : 'en'}
              onChange={(e) => setLang(e.target.value as Lang)}
              className="cursor-pointer bg-transparent font-medium outline-none"
              aria-label={t('language')}
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code} className="text-black">
                  {l.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </div>
  );
}
