'use client';
// Port of admin/pages/index.blade.php — static pages (pages/{slug}).
import Link from 'next/link';
import { Info, Shield, ScrollText, Receipt, FileText, Pencil, UserX, type LucideIcon } from 'lucide-react';
import { usePanel } from '@/lib/panel';
import { useAuth } from '@/lib/auth';
import { useListQ } from '@/lib/firestore';
import { errMsg, timeAgo, tr } from '@/lib/format';
import type { PageDoc } from '@/lib/types';
import { PageHeader, StatusPill, Loading, Forbidden } from '@/components/ui';

export const PAGE_SLUGS: Record<string, string> = { about: 'About Us', privacy: 'Privacy Policy', terms: 'Terms & Conditions', refund: 'Refund Policy', 'delete-account': 'Delete Account' };
const ICONS: Record<string, LucideIcon> = { about: Info, privacy: Shield, terms: ScrollText, refund: Receipt, 'delete-account': UserX };
const plain = (h?: string) => (h || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

export default function PagesPage() {
  const { p, uiLang } = usePanel();
  const { can } = useAuth();
  const list = useListQ<PageDoc & { updated_at?: any }>(['all'], 'pages');
  if (!can('page.list')) return <Forbidden />;

  const docs = new Map((list.data || []).map((d) => [d.id, d]));
  const order = Object.keys(PAGE_SLUGS);
  const slugs = [...order, ...[...docs.keys()].filter((k) => !order.includes(k)).sort()];

  return (
    <>
      <PageHeader title="Pages" subtitle="Static content shown in the apps and website" />
      {list.isLoading ? <Loading /> : list.error ? <div className="card p-10 text-center text-muted">{errMsg(list.error)}</div> : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {slugs.map((slug) => {
            const d = docs.get(slug);
            const Icon = ICONS[slug] || FileText;
            const content = d?.content || {};
            const text = plain(content.en || tr(content, uiLang));
            const langs = Object.entries(content).filter(([, v]) => plain(String(v || ''))).map(([k]) => k);
            return (
              <div key={slug} className="card flex flex-col p-5" data-testid="page-card">
                <div className="flex items-start justify-between">
                  <span className="w-11 h-11 rounded-xl bg-primary-50 text-primary flex items-center justify-center"><Icon className="w-5 h-5" /></span>
                  <StatusPill status={text ? 'published' : 'draft'} label={text ? 'Published' : 'Empty'} />
                </div>
                <h3 className="mt-4 font-bold text-navy dark:text-white">{tr(d?.title, uiLang) || PAGE_SLUGS[slug] || slug}</h3>
                <p className="text-xs text-muted font-mono">/{slug}</p>
                <p className="mt-2 flex-1 text-sm text-slate-500 line-clamp-3">{text ? (text.length > 140 ? text.slice(0, 140) + '…' : text) : 'No content yet.'}</p>
                <div className="mt-4 flex items-center justify-between border-t border-line pt-3 dark:border-dark-line">
                  <div className="flex gap-1">
                    {langs.map((c) => <span key={c} className="pill border border-line bg-slate-50 text-slate-600 uppercase dark:bg-slate-800 dark:text-slate-300">{c}</span>)}
                  </div>
                  {can('page.update') && <Link href={p(`/pages/edit/${slug}`)} className="btn-soft btn-sm"><Pencil className="w-3.5 h-3.5" /> Edit</Link>}
                </div>
                <p className="mt-2 text-[11px] text-muted">{d?.updated_at ? `Updated ${timeAgo(d.updated_at)}` : 'Not saved yet'}</p>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
