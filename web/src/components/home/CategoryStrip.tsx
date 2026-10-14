'use client';

import Image from 'next/image';
import clsx from 'clsx';
import type { Category, Id } from '@/lib/types';
import { useT } from '@/lib/i18n';

export function CatIcon({ icon, size = 28 }: { icon?: string | null; size?: number }) {
  if (!icon) return <span style={{ fontSize: size * 0.85 }}>🛍️</span>;
  if (icon.startsWith('http') || icon.startsWith('/'))
    return <Image src={icon} alt="" width={size} height={size} className="object-contain" style={{ width: size, height: size }} />;
  return (
    <span style={{ fontSize: size * 0.85, lineHeight: 1 }} aria-hidden>
      {icon}
    </span>
  );
}

export default function CategoryStrip({
  categories,
  activeId,
  onSelect,
  loading,
}: {
  categories: Category[];
  activeId: Id | null;
  onSelect: (c: Category | null) => void;
  loading?: boolean;
}) {
  const t = useT();
  const tabs: Array<Category | null> = [null, ...categories];
  return (
    <div style={{ background: 'linear-gradient(180deg,var(--header-via),var(--header-to))' }}>
      <div className="container">
        <div className="no-scrollbar flex gap-1 overflow-x-auto md:justify-center">
          {loading
            ? Array.from({ length: 10 }).map((_, i) => <div key={i} className="skeleton mx-2 my-3 h-12 w-16 shrink-0" />)
            : tabs.map((c) => {
                const active = (c?.id ?? null) === activeId;
                return (
                  <button
                    key={c?.id ?? 'all'}
                    onClick={() => onSelect(c)}
                    className={clsx(
                      'relative flex w-[76px] shrink-0 flex-col items-center gap-1 px-1 pb-2.5 pt-2 text-[13px] transition md:w-[88px]',
                      active ? 'font-bold text-ink' : 'font-medium text-ink/80 hover:text-ink',
                    )}
                  >
                    <span className="flex h-8 items-center justify-center transition group-hover:scale-110">
                      <CatIcon icon={c ? c.icon : '/images/icons/all.webp'} size={32} />
                    </span>
                    <span className="w-full truncate text-center">{c ? c.name : t('all')}</span>
                    <span className={clsx('absolute inset-x-2 bottom-0 h-[3px] rounded-full transition', active ? 'bg-ink' : 'bg-transparent')} />
                  </button>
                );
              })}
        </div>
      </div>
    </div>
  );
}
