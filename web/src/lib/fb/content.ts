/** Blogs, blog categories, FAQs and CMS pages — public Firestore reads. */
import { collection, doc, getDoc, getDocs, limit, orderBy, query, where, type QueryConstraint } from 'firebase/firestore';
import { ApiError } from '../errors';
import { fb } from '../firebase';
import type { Blog, BlogCategory, CmsPage, Faq, Paginated } from '../types';
import { cached, ctx, guard, iso, isOn, num, pick, type Raw } from './core';

const db = () => fb().db;

const rawCategories = () =>
  cached('blog_categories', 10 * 60_000, () => guard(async () => (await getDocs(collection(db(), 'blog_categories'))).docs.map((d) => ({ id: d.id, c: d.data() }))));

/** Latest active posts (bounded window; blogs are few). */
const rawBlogs = () =>
  cached('blogs', 5 * 60_000, () =>
    guard(async () =>
      (await getDocs(query(collection(db(), 'blogs'), where('status', '==', 'active'), orderBy('published_at', 'desc'), limit(200)))).docs.map((d) => ({ id: d.id, b: d.data() })),
    ),
  );

function toCat(id: string, c: Raw, lang: string, count?: number): BlogCategory {
  return { id, name: pick(c.name, lang), slug: c.slug, posts_count: count };
}

function toBlog(id: string, b: Raw, lang: string, cats: Array<{ id: string; c: Raw }>): Blog {
  const cat = cats.find((x) => x.id === String(b.category_id));
  return {
    id,
    title: pick(b.title, lang),
    slug: b.slug,
    image: b.image ?? '',
    excerpt: pick(b.excerpt, lang),
    content: pick(b.content, lang),
    category: cat ? toCat(cat.id, cat.c, lang) : undefined,
    read_minutes: num(b.read_minutes, 3),
    views: num(b.views),
    created_at: iso(b.published_at ?? b.created_at),
  };
}

export async function blogCategories(): Promise<BlogCategory[]> {
  const { lang } = ctx();
  const [cats, blogs] = await Promise.all([rawCategories(), rawBlogs()]);
  return cats.map(({ id, c }) => toCat(id, c, lang, blogs.filter((x) => String(x.b.category_id) === id).length));
}

export async function blogs(params: { category?: string; page?: number; q?: string } = {}): Promise<Paginated<Blog>> {
  const { lang } = ctx();
  const [cats, all] = await Promise.all([rawCategories(), rawBlogs()]);
  let list = all;
  if (params.category) {
    const cat = cats.find((c) => c.c.slug === params.category || c.id === params.category);
    list = cat ? list.filter((x) => String(x.b.category_id) === cat.id) : [];
  }
  let out = list.map(({ id, b }) => toBlog(id, b, lang, cats));
  if (params.q) {
    const q = params.q.toLowerCase();
    out = out.filter((b) => b.title.toLowerCase().includes(q) || b.excerpt.toLowerCase().includes(q));
  }
  const per = 9;
  const p = Math.max(1, params.page || 1);
  return { items: out.slice((p - 1) * per, p * per).map((b) => ({ ...b, content: undefined })), meta: { current_page: p, last_page: Math.max(1, Math.ceil(out.length / per)), per_page: per, total: out.length } };
}

export async function blog(slug: string): Promise<Blog & { related?: Blog[] }> {
  const { lang } = ctx();
  const [cats, all] = await Promise.all([rawCategories(), rawBlogs()]);
  let found = all.find((x) => x.b.slug === slug || x.id === slug);
  if (!found) {
    const s = await guard(() => getDocs(query(collection(db(), 'blogs'), where('slug', '==', slug), limit(1))));
    if (!s.empty && isOn(s.docs[0].get('status'))) found = { id: s.docs[0].id, b: s.docs[0].data() };
  }
  if (!found) throw new ApiError('Blog not found', 404);
  const post = toBlog(found.id, found.b, lang, cats);
  const related = all
    .filter((x) => x.id !== found!.id && String(x.b.category_id) === String(found!.b.category_id))
    .slice(0, 3)
    .map(({ id, b }) => ({ ...toBlog(id, b, lang, cats), content: undefined }));
  return { ...post, related };
}

export async function faqs(): Promise<Faq[]> {
  const { lang } = ctx();
  const s = await guard(() => getDocs(query(collection(db(), 'faqs'), where('status', '==', 'active') as QueryConstraint)));
  return s.docs
    .map((d) => ({ id: d.id, f: d.data() }))
    .sort((a, b) => num(a.f.sort_order) - num(b.f.sort_order))
    .map(({ id, f }) => ({ id, question: pick(f.question, lang), answer: pick(f.answer, lang) }));
}

export async function page(slug: string): Promise<CmsPage> {
  const { lang } = ctx();
  const s = await guard(() => getDoc(doc(db(), 'pages', slug)));
  if (!s.exists() || s.get('status') === 'inactive') throw new ApiError('Page not found', 404);
  return { slug, title: pick(s.get('title'), lang), content: pick(s.get('content'), lang) };
}
