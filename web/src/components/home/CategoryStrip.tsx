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
    <div className="border-b border-line transition-colors" style={{ background: 'var(--cat-tint)' }}>
      <div className="container">
        <div className="no-scrollbar flex gap-1 overflow-x-auto py-2 md:justify-center">
          {loading
            ? Array.from({ length: 10 }).map((_, i) => <div key={i} className="skeleton mx-2 h-[68px] w-16 shrink-0 rounded-2xl" />)
            : tabs.map((c) => {
                const active = (c?.id ?? null) === activeId;
                return (
                  <button
                    key={c?.id ?? 'all'}
                    onClick={() => onSelect(c)}
                    className={clsx(
                      'group flex w-[74px] shrink-0 flex-col items-center gap-1.5 px-1 py-1 text-[12.5px] transition md:w-[84px]',
                      active ? 'font-bold text-primary' : 'font-medium text-body hover:text-ink',
                    )}
                  >
                    <span
                      className={clsx(
                        'flex h-12 w-12 items-center justify-center rounded-2xl transition',
                        active ? 'bg-primary-50 ring-2 ring-primary' : 'bg-soft group-hover:bg-primary-50',
                      )}
                    >
                      <CatIcon icon={c ? c.icon : '/images/icons/all.webp'} size={30} />
                    </span>
                    <span className="w-full truncate text-center">{c ? c.name : t('all')}</span>
                  </button>
                );
              })}
        </div>
      </div>
    </div>
  );
}
