/** Catalog triggers: derived product fields, store stock → in_stock_store_ids, review ratings, category ancestry. */
import { onDocumentCreated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { db, FieldValue, logger, REGION } from '../shared/firebase';
import type { CategoryDoc, ProductDoc, StoreStockDoc } from '../shared/types';
import { isOn, money, num, pick, searchKeywords, uniq } from '../shared/util';
import { pricingFor } from '../services/cart';

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Ancestor chain (root first) for a category id. */
export async function ancestorsOf(categoryId: string | null | undefined): Promise<string[]> {
  const chain: string[] = [];
  let cur = categoryId ?? null;
  const seen = new Set<string>();
  while (cur && !seen.has(cur) && chain.length < 8) {
    seen.add(cur);
    const s = await db.doc(`categories/${cur}`).get();
    if (!s.exists) break;
    chain.unshift(cur);
    cur = (s.get('parent_id') as string | null) ?? null;
  }
  return chain;
}

export async function derivedProductFields(p: ProductDoc) {
  const active = (p.variants ?? []).filter((v) => isOn(v.status));
  const prices = active.map((v) => pricingFor(v, null));
  const min_price = prices.length ? money(Math.min(...prices.map((x) => x.unit_price))) : 0;
  const max_discount_percent = prices.length ? Math.max(0, ...prices.map((x) => x.discount_percent)) : 0;
  const category_ids = uniq([...(await ancestorsOf(p.category_id)), ...(p.sub_category_id ? await ancestorsOf(p.sub_category_id) : [])]);
  let brand_name: string | null = p.brand_name ?? null;
  if (p.brand_id) {
    const b = await db.doc(`brands/${p.brand_id}`).get();
    brand_name = b.exists ? pick(b.get('name')) || null : null;
  } else brand_name = null;
  const search_keywords = searchKeywords(p.name, brand_name ?? '', p.tags ?? [], (p.variants ?? []).map((v) => v.sku ?? ''));
  return { min_price, max_discount_percent, category_ids, brand_name, search_keywords };
}

export const onProductWritten = onDocumentWritten({ document: 'products/{productId}', region: REGION }, async (event) => {
  const before = event.data?.before.exists ? (event.data.before.data() as ProductDoc) : null;
  const after = event.data?.after.exists ? (event.data.after.data() as ProductDoc) : null;
  const id = event.params.productId;
  if (after) {
    const relevant = !before || ['name', 'variants', 'category_id', 'sub_category_id', 'brand_id', 'tags', 'status'].some((k) => !same((before as never)[k], (after as never)[k]));
    if (relevant) {
      const d = await derivedProductFields(after);
      const upd: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(d)) if (!same((after as never)[k], v)) upd[k] = v;
      if (!before && !after.in_stock_store_ids) {
        const ss = await db.collection('store_stocks').where('product_id', '==', id).get();
        // arrayUnion so a concurrent onStoreStockWritten is never overwritten
        const inStock = uniq(ss.docs.filter((s) => num(s.get('stock')) > 0).map((s) => String(s.get('store_id'))));
        if (inStock.length) upd.in_stock_store_ids = FieldValue.arrayUnion(...inStock);
      }
      for (const k of ['rating_avg', 'rating_count', 'sold_count'] as const) if (after[k] === undefined) upd[k] = 0;
      if (Object.keys(upd).length) await event.data!.after.ref.update(upd);
      after.category_ids = (upd.category_ids as string[] | undefined) ?? after.category_ids;
    }
  }
  // category product_count (active products)
  const cats = (p: ProductDoc | null) => (p && p.status === 'active' ? p.category_ids ?? [] : []);
  const old = new Set(cats(before));
  const neu = new Set(cats(after));
  const batch = db.batch();
  let n = 0;
  for (const c of neu) if (!old.has(c)) { batch.set(db.doc(`categories/${c}`), { product_count: FieldValue.increment(1) }, { merge: true }); n++; }
  for (const c of old) if (!neu.has(c)) { batch.set(db.doc(`categories/${c}`), { product_count: FieldValue.increment(-1) }, { merge: true }); n++; }
  if (n) await batch.commit().catch((e) => logger.warn('product_count update failed', String(e)));
});

export const onStoreStockWritten = onDocumentWritten({ document: 'store_stocks/{id}', region: REGION }, async (event) => {
  const before = event.data?.before.exists ? (event.data.before.data() as StoreStockDoc) : null;
  const after = event.data?.after.exists ? (event.data.after.data() as StoreStockDoc) : null;
  const doc = after ?? before;
  if (!doc?.product_id || !doc.store_id) return;
  const wasIn = !!before && num(before.stock) > 0;
  const isIn = !!after && num(after.stock) > 0;
  if (before && after && wasIn === isIn) return;
  const ref = db.doc(`products/${doc.product_id}`);
  const p = await ref.get();
  if (!p.exists) return;
  if (isIn) {
    await ref.update({ in_stock_store_ids: FieldValue.arrayUnion(String(doc.store_id)) });
  } else {
    // still in stock for another variant of the same product in this store?
    const others = await db.collection('store_stocks').where('product_id', '==', doc.product_id).where('store_id', '==', doc.store_id).get();
    if (!others.docs.some((s) => num(s.get('stock')) > 0)) await ref.update({ in_stock_store_ids: FieldValue.arrayRemove(String(doc.store_id)) });
  }
});

export const onReviewCreated = onDocumentCreated({ document: 'reviews/{id}', region: REGION }, async (event) => {
  const r = event.data?.data();
  if (!r?.product_id || r.status === 'inactive') return;
  await db.runTransaction(async (tx) => {
    const ref = db.doc(`products/${r.product_id}`);
    const p = await tx.get(ref);
    if (!p.exists) return;
    const count = num(p.get('rating_count'));
    const avg = num(p.get('rating_avg'));
    const nextCount = count + 1;
    tx.update(ref, { rating_count: nextCount, rating_avg: Math.round(((avg * count + num(r.rating)) / nextCount) * 100) / 100 });
  });
});

export const onCategoryWritten = onDocumentWritten({ document: 'categories/{id}', region: REGION }, async (event) => {
  const before = event.data?.before.exists ? (event.data.before.data() as CategoryDoc) : null;
  const after = event.data?.after.exists ? (event.data.after.data() as CategoryDoc) : null;
  const id = event.params.id;
  if (!after) return;
  if (before && (before.parent_id ?? null) === (after.parent_id ?? null) && after.ancestor_ids) return;
  const ancestors = (await ancestorsOf(after.parent_id)).filter((x) => x !== id);
  if (!same(after.ancestor_ids, ancestors)) await event.data!.after.ref.update({ ancestor_ids: ancestors, depth: ancestors.length });
  if (!before) return;
  // parent changed: children and products need new ancestry
  const children = await db.collection('categories').where('parent_id', '==', id).get();
  for (const c of children.docs) await c.ref.update({ ancestor_ids: [...ancestors, id], depth: ancestors.length + 1 });
  const products = await db.collection('products').where('category_ids', 'array-contains', id).get();
  for (const p of products.docs) {
    const d = await derivedProductFields(p.data() as ProductDoc);
    if (!same(p.get('category_ids'), d.category_ids)) await p.ref.update({ category_ids: d.category_ids });
  }
});
