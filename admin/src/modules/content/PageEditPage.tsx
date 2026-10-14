'use client';
// Port of admin/pages/form.blade.php — pages/{slug} title + content (LangTabs + editor).
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { FileText, Save } from 'lucide-react';
import { usePanel } from '@/lib/panel';
import { useAuth } from '@/lib/auth';
import { fetchDoc, saveDoc, useInvalidate } from '@/lib/firestore';
import { errMsg, tr } from '@/lib/format';
import type { PageDoc, Trans } from '@/lib/types';
import { Card, PageHeader, Loading, Forbidden } from '@/components/ui';
import { LangTabs, TransInput } from '@/components/form/lang';
import { useToast } from '@/components/ui/toast';
import { PAGE_SLUGS } from './PagesPage';

export default function PageEditPage() {
  const params = useParams<{ slug: string }>();
  const slug = String(params?.slug || '').toLowerCase();
  const router = useRouter();
  const { p, uiLang } = usePanel();
  const { can } = useAuth();
  const toast = useToast();
  const invalidate = useInvalidate();
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState<Trans>({});
  const [content, setContent] = useState<Trans>({});

  useEffect(() => {
    if (!slug) return;
    fetchDoc<PageDoc>('pages', slug).then((d) => {
      setTitle(d?.title && Object.keys(d.title).length ? d.title : { en: PAGE_SLUGS[slug] || slug });
      setContent(d?.content || {});
      setLoaded(true);
    }).catch((e) => { toast(errMsg(e), 'error'); setLoaded(true); });
  }, [slug]);

  const save = async () => {
    if (!(title.en || Object.values(title).some(Boolean))) { toast('The title is required.', 'error'); return; }
    setBusy(true);
    try {
      await saveDoc('pages', slug, { slug, title, content, status: 'active' });
      invalidate('list', 'pages');
      toast('Page saved.');
      router.push(p('/pages'));
    } catch (e) { toast(errMsg(e), 'error'); }
    setBusy(false);
  };

  if (!can('page.update')) return <Forbidden />;
  if (!loaded) return <Loading />;
  return (
    <>
      <PageHeader title={`Edit: ${tr(title, uiLang) || slug}`} subtitle={`/${slug}`} back={p('/pages')} />
      <div className="max-w-5xl">
        <Card title="Page Content" subtitle="Use Translate to fill the other languages from English." icon={FileText}>
          <LangTabs translate>
            <TransInput label="Title" required value={title} onChange={setTitle} />
            <TransInput label="Content" type="editor" value={content} onChange={setContent} />
          </LangTabs>
          <div className="mt-6 flex justify-end gap-2 border-t border-line pt-5 dark:border-dark-line">
            <Link href={p('/pages')} className="btn-outline">Cancel</Link>
            <button type="button" className="btn-primary" disabled={busy} onClick={save} data-testid="save"><Save className="w-4 h-4" /> {busy ? 'Saving…' : 'Save Page'}</button>
          </div>
        </Card>
      </div>
    </>
  );
}
