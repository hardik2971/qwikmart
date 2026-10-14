/** Google Gemini (Generative Language REST) — key/model from settings/private_ai (Laravel GeminiService). */
import { HttpsError } from 'firebase-functions/v2/https';
import { logger, privateSettings, publicSettings } from '../shared/firebase';
import type { PrivateAiSettings } from '../shared/types';

export const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English', ar: 'Arabic', hi: 'Hindi', fr: 'French', es: 'Spanish', de: 'German', bn: 'Bengali', ta: 'Tamil', te: 'Telugu',
  mr: 'Marathi', gu: 'Gujarati', ur: 'Urdu',
};

export async function generate(prompt: string, json = false, temperature = 0.7): Promise<string> {
  const ai = await privateSettings<PrivateAiSettings>('ai');
  const key = ai.gemini_api_key;
  if (!key) throw new HttpsError('failed-precondition', 'Gemini API key is not configured. Add it in Settings → AI.');
  const model = ai.gemini_model || 'gemini-2.5-flash';
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature, ...(json ? { responseMimeType: 'application/json' } : {}) },
  };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60_000);
  let res: Response;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body), signal: ctrl.signal,
    });
  } catch (e) {
    throw new HttpsError('unavailable', `AI request failed: ${String((e as Error).message ?? e)}`);
  } finally {
    clearTimeout(timer);
  }
  const data = (await res.json().catch(() => ({}))) as { error?: { message?: string }; candidates?: { content?: { parts?: { text?: string }[] } }[] };
  if (!res.ok) {
    logger.warn('[Gemini] request failed', { status: res.status, body: data });
    throw new HttpsError('unavailable', `AI request failed: ${data.error?.message ?? `HTTP ${res.status}`}`);
  }
  const text = (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
  if (!text) throw new HttpsError('unavailable', 'AI returned an empty response.');
  return text;
}

export async function generateJson(prompt: string): Promise<Record<string, unknown>> {
  const text = await generate(prompt, true);
  let data: unknown;
  try { data = JSON.parse(text); } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) { try { data = JSON.parse(m[0]); } catch { /* ignore */ } }
  }
  if (!data || typeof data !== 'object') throw new HttpsError('unavailable', 'AI returned an invalid response. Please try again.');
  return data as Record<string, unknown>;
}

export async function generateProductContent(name: string, category = '', keywords = '', lang = 'en') {
  const language = LANGUAGE_NAMES[lang] ?? lang;
  const app = (await publicSettings()).app_name ?? 'QwikMart';
  const prompt = `You are an expert e-commerce copywriter and SEO specialist for "${app}", an Indian quick-commerce grocery & lifestyle app.
Write product content in ${language} for:
- Product name: ${name}
- Category: ${category}
- Focus keywords: ${keywords}

Return ONLY a JSON object with exactly these keys:
{
  "short_description": "1-2 sentence benefit-led summary (max 160 chars)",
  "description": "Rich HTML description using <p>, <ul><li> and <strong>; 120-220 words; include key features, usage and storage tips. No <h1>.",
  "seo_title": "SEO title, max 60 chars, includes product name",
  "seo_description": "Meta description, 140-160 chars, persuasive with call to action",
  "seo_keywords": "8-12 comma-separated keywords"
}`;
  const d = await generateJson(prompt);
  return {
    short_description: String(d.short_description ?? ''),
    description: String(d.description ?? ''),
    seo_title: String(d.seo_title ?? ''),
    seo_description: String(d.seo_description ?? ''),
    seo_keywords: Array.isArray(d.seo_keywords) ? d.seo_keywords.join(', ') : String(d.seo_keywords ?? ''),
  };
}

export async function translate(fields: Record<string, string>, targets: string[], source = 'en'): Promise<Record<string, Record<string, string>>> {
  const clean = Object.fromEntries(Object.entries(fields ?? {}).filter(([, v]) => typeof v === 'string' && v.trim() !== ''));
  const langs = [...new Set(targets)].filter((l) => l !== source);
  if (!Object.keys(clean).length || !langs.length) return {};
  const list = langs.map((l) => `"${l}" (${LANGUAGE_NAMES[l] ?? l})`).join(', ');
  const prompt = `Translate the values of this JSON object from ${source} into each of these languages: ${list}.
Preserve any HTML tags exactly, keep brand names and units (g, kg, ml, L) unchanged, and keep a natural e-commerce tone.
Return ONLY a JSON object whose keys are the language codes and whose values are objects with the same keys as the input.

Input:
${JSON.stringify(clean, null, 2)}`;
  const d = await generateJson(prompt);
  const out: Record<string, Record<string, string>> = {};
  for (const l of langs) {
    const v = d[l];
    if (v && typeof v === 'object') {
      out[l] = Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([k]) => k in clean).map(([k, val]) => [k, String(val)]));
    }
  }
  return out;
}
