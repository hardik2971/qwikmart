'use client';
// Catalog helpers shared by the category / banner / stock / home-builder modules.
import { fetchList, where } from '@/lib/firestore';
import { slugify, tr } from '@/lib/format';
import type { Category } from '@/lib/types';

export interface CatNode extends Category { children: CatNode[]; level: number }

/** Build a parent → children tree (sorted by sort_order, then name). Orphans become roots. */
export function buildTree(list: Category[], lang = 'en'): CatNode[] {
  const byId = new Map<string, CatNode>();
  for (const c of list) byId.set(c.id, { ...c, children: [], level: 0 });
  const roots: CatNode[] = [];
  for (const n of byId.values()) {
    const parent = n.parent_id ? byId.get(n.parent_id) : null;
    if (parent && parent.id !== n.id) parent.children.push(n); else roots.push(n);
  }
  const sortRec = (arr: CatNode[], level: number) => {
    arr.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || tr(a.name, lang).localeCompare(tr(b.name, lang)));
    for (const n of arr) { n.level = level; sortRec(n.children, level + 1); }
  };
  sortRec(roots, 0);
  return roots;
}

/** Indented options: top-level + second-level categories (optionally excluding one id and its descendants). */
export function categoryOptions(list: Category[], lang = 'en', opts: { exclude?: string | null; depth?: number } = {}) {
  const depth = opts.depth ?? 2;
  const out: { value: string; label: string }[] = [];
  const walk = (nodes: CatNode[]) => {
    for (const n of nodes) {
      if (opts.exclude && n.id === opts.exclude) continue;
      if (n.level >= depth) continue;
      out.push({ value: n.id, label: `${n.level ? '    '.repeat(n.level) + '↳ ' : ''}${tr(n.name, lang)}` });
      walk(n.children);
    }
  };
  walk(buildTree(list, lang));
  return out;
}

/** All descendant ids of a category (for "category + its children" filters). */
export function descendantIds(list: Category[], id: string): string[] {
  const out = [id];
  for (let i = 0; i < out.length; i++) for (const c of list) if (c.parent_id === out[i] && !out.includes(c.id)) out.push(c.id);
  return out;
}

/** Unique slug in a collection (appends -2, -3 … like Laravel uniqueSlug). */
export async function uniqueSlug(path: string, text: string, ignoreId?: string | null): Promise<string> {
  const base = slugify(text) || Math.random().toString(36).slice(2, 8);
  let slug = base;
  for (let i = 2; i < 50; i++) {
    const hits = await fetchList<{ id: string }>(path, where('slug', '==', slug));
    if (!hits.some((h) => h.id !== ignoreId)) return slug;
    slug = `${base}-${i}`;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export const isActive = (s: any) => s === 'active' || s === true || s === 1;
export const MODE_OPTIONS = [{ value: 'quick', label: 'Quick Commerce' }, { value: 'ecommerce', label: 'eCommerce' }];
export const STATUS_OPTIONS = [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }];
