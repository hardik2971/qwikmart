/** Gemini-powered panel helpers. */
import { requirePanel } from '../shared/access';
import { authed, invalid, str } from '../shared/firebase';
import { generateProductContent as gen, translate } from '../services/gemini';

export const generateProductContent = authed<{ name?: string; category?: string; keywords?: string; language?: string }>(async (d, ctx) => {
  await requirePanel(ctx, 'product.create', 'product.update');
  return gen(
    str(d.name, 'name', { required: true, max: 200 }),
    str(d.category, 'category', { max: 200 }),
    str(d.keywords, 'keywords', { max: 500 }),
    str(d.language, 'language', { max: 10 }) || 'en',
  );
}, { timeoutSeconds: 120 });

export const translateFields = authed<{ fields?: Record<string, string>; from?: string; to?: string[] }>(async (d, ctx) => {
  await requirePanel(ctx);
  if (!d.fields || typeof d.fields !== 'object') invalid('The fields field must be an object.');
  if (!Array.isArray(d.to) || !d.to.length) invalid('Select at least one target language.');
  const fields = Object.fromEntries(Object.entries(d.fields!).filter(([, v]) => typeof v === 'string').slice(0, 30)) as Record<string, string>;
  return { translations: await translate(fields, d.to!.map(String).slice(0, 12), str(d.from, 'from', { max: 10 }) || 'en') };
}, { timeoutSeconds: 120 });
