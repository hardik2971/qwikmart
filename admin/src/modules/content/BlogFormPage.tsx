'use client';
// Port of admin/blogs/form.blade.php.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Eye, Save } from 'lucide-react';
import { serverTimestamp } from 'firebase/firestore';
import { usePanel } from '@/lib/panel';
import { useAuth } from '@/lib/auth';
import { fetchDoc, fetchList, saveDoc, useInvalidate, useListQ, where, limit } from '@/lib/firestore';
import { errMsg, num, searchKeywords, slugify, tr } from '@/lib/format';
import type { Blog, BlogCategory, Trans } from '@/lib/types';
import { Card, PageHeader, Toggle, Loading, Forbidden } from '@/components/ui';
import { Input, Select, ImageUpload } from '@/components/form/fields';
import { LangTabs, TransInput } from '@/components/form/lang';
import { useToast } from '@/components/ui/toast';
import { isOn } from './BlogsPage';

export default function BlogFormPage() {
  const params = useParams<{ id?: string }>();
  const id = params?.id ? String(params.id) : null;
  const router = useRouter();
  const { p, uiLang } = usePanel();
  const { can } = useAuth();
  const toast = useToast();
  const invalidate = useInvalidate();
  const cats = useListQ<BlogCategory>(['all'], 'blog_categories');
  const [doc, setDoc] = useState<Blog | null>(null);
  const [loaded, setLoaded] = useState(!id);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState<Trans>({});
  const [excerpt, setExcerpt] = useState<Trans>({});
  const [content, setContent] = useState<Trans>({});
  const [categoryId, setCategoryId] = useState('');
  const [readMinutes, setReadMinutes] = useState('5');
  const [image, setImage] = useState('');
  const [status, setStatus] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!id) return;
    fetchDoc<Blog>('blogs', id).then((b) => {
      if (!b) { toast('Blog not found', 'error'); router.replace(p('/blogs')); return; }
      setDoc(b); setTitle(b.title || {}); setExcerpt(b.excerpt || {}); setContent(b.content || {}); setCategoryId(b.category_id || '');
      setReadMinutes(String(b.read_minutes ?? 5)); setImage(b.image || ''); setStatus(isOn(b.status)); setLoaded(true);
    }).catch((e) => { toast(errMsg(e), 'error'); setLoaded(true); });
  }, [id]);

  const uniqueSlug = async (base: string) => {
    let slug = base || `blog-${Date.now()}`;
    for (let i = 2; i < 50; i++) {
      const hits = await fetchList<Blog>('blogs', where('slug', '==', slug), limit(2));
      if (!hits.some((h) => h.id !== id)) return slug;
      slug = `${base}-${i}`;
    }
    return `${base}-${Date.now()}`;
  };

  const save = async () => {
    const t = title.en || Object.values(title).find(Boolean);
    if (!t) { setErr('The title is required.'); toast('The title is required.', 'error'); return; }
    const rm = Number(readMinutes);
    if (readMinutes && (!Number.isFinite(rm) || rm < 1 || rm > 240)) { toast('Read time must be 1–240 minutes.', 'error'); return; }
    setErr(''); setBusy(true);
    try {
      const base = slugify(title.en || String(t));
      const slug = doc && doc.slug && slugify(tr(doc.title, 'en')) === base ? doc.slug : await uniqueSlug(base);
      const data: Record<string, any> = {
        title, excerpt, content, category_id: categoryId || null, read_minutes: rm || 1, image: image || null, slug,
        status: status ? 'active' : 'inactive', search_keywords: searchKeywords(title),
      };
      if (!id) { data.views = 0; data.published_at = serverTimestamp(); }
      await saveDoc('blogs', id, data);
      invalidate('list', 'blogs');
      toast(id ? 'Blog updated successfully.' : 'Blog created successfully.');
      router.push(p('/blogs'));
    } catch (e) { toast(errMsg(e), 'error'); }
    setBusy(false);
  };

  if (!can(id ? 'blog.update' : 'blog.create')) return <Forbidden />;
  if (!loaded) return <Loading />;
  const catOpts = (cats.data || []).map((c) => ({ value: c.id, label: tr(c.name, uiLang) }));
  return (
    <>
      <PageHeader title={id ? 'Edit Blog' : 'Add Blog'} back={p('/blogs')} />
      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2" title="Content">
          <LangTabs translate>
            <TransInput label="Title" value={title} onChange={setTitle} required error={err} />
            <TransInput label="Excerpt" type="textarea" rows={3} value={excerpt} onChange={setExcerpt} />
            <TransInput label="Content" type="editor" value={content} onChange={setContent} />
          </LangTabs>
          {doc
            ? <p className="mt-4 text-xs text-muted">Slug: <span className="font-mono text-navy dark:text-white">{doc.slug}</span> — regenerated automatically when the English title changes.</p>
            : <p className="mt-4 text-xs text-muted">The URL slug is generated automatically from the English title.</p>}
        </Card>
        <div className="space-y-5">
          <Card title="Settings">
            <div className="space-y-5">
              <div>
                <Select label="Category" placeholder="Select category" options={catOpts} value={categoryId} onChange={(e) => setCategoryId(e.target.value)} />
                {!cats.isLoading && !catOpts.length && <p className="mt-1 text-xs text-muted">No categories yet — <Link href={p('/blog-categories')} className="text-primary font-semibold">add one</Link>.</p>}
              </div>
              <Input label="Read Time (minutes)" type="number" min={1} max={240} value={readMinutes} onChange={(e) => setReadMinutes(e.target.value)} />
              <ImageUpload label="Cover Image" value={image} onChange={setImage} square={false} folder="catalog/blogs" hint="Recommended 1200×630, up to 5MB" />
              <Toggle checked={status} onChange={setStatus} label="Published" description="Unpublished blogs are hidden from the apps and website." />
              {doc && <p className="text-xs text-muted flex items-center gap-1.5"><Eye className="w-3.5 h-3.5" /> {num(doc.views)} views</p>}
            </div>
          </Card>
          <div className="flex justify-end gap-2">
            <Link href={p('/blogs')} className="btn-outline">Cancel</Link>
            <button type="button" className="btn-primary" disabled={busy} onClick={save} data-testid="save"><Save className="w-4 h-4" /> {busy ? 'Saving…' : 'Save Blog'}</button>
          </div>
        </div>
      </div>
    </>
  );
}
