/** Pure helpers: money rounding, geo, keywords, i18n, time. No Firebase imports (unit-testable). */
import { randomInt } from 'node:crypto';
import type { I18n, LatLng } from './types';

/** Round to 2 decimals (half away from zero), avoiding float artefacts. */
export function money(n: number | null | undefined): number {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v)) return 0;
  return Math.sign(v) * Math.round((Math.abs(v) + Number.EPSILON) * 100) / 100;
}

export function num(v: unknown, fallback = 0): number {
  if (v === null || v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function formatMoney(n: number, symbol = '₹'): string {
  return `${symbol}${money(n).toFixed(2).replace(/\.00$/, '')}`;
}

/* ------------------------------------------------------------------ geo */
const EARTH_KM = 6371;
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Ray-casting point-in-polygon. Accepts `{lat,lng}` objects or `[lat,lng]` pairs (same as Laravel ZoneService). */
export function pointInPolygon(lat: number, lng: number, polygon: Array<LatLng | [number, number]> | null | undefined): boolean {
  if (!Array.isArray(polygon)) return false;
  const pts = polygon.map((p) => (Array.isArray(p) ? [Number(p[0]), Number(p[1])] : [Number(p.lat), Number(p.lng)]));
  const n = pts.length;
  if (n < 3) return false;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [yi, xi] = pts[i];
    const [yj, xj] = pts[j];
    const intersect = (yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / ((yj - yi) || 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/* ------------------------------------------------------------------ search keywords */
/**
 * Lowercase word prefixes (2..15 chars) for every word in the given values (strings or i18n maps).
 * Also adds prefixes of the full phrase (so "basmati rice" matches "basmati r").
 */
export function searchKeywords(...values: Array<string | I18n | null | undefined | Array<string | null | undefined>>): string[] {
  const out = new Set<string>();
  const texts: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === 'string' && v.trim()) texts.push(v);
    else if (Array.isArray(v)) v.forEach(push);
    else if (v && typeof v === 'object') Object.values(v as Record<string, unknown>).forEach(push);
  };
  values.forEach(push);
  for (const text of texts) {
    const words = keywordWords(text);
    for (const w of words) addPrefixes(out, w);
    if (words.length > 1) addPrefixes(out, words.join(' '));
    // joined forms of punctuated tokens: "coca-cola" → "cocacola" ("lay's" → "lays" via APOSTROPHES)
    for (const joined of keywordJoined(text)) addPrefixes(out, joined);
  }
  return [...out].slice(0, 400);
}

/** Apostrophes are removed ("lay's" → "lays"); other punctuation separates words. Same rule in tools/lib/common.ts. */
const APOSTROPHES = /['’‘`´]/gu;
const SEPARATORS = /[\s,./()\-_+&|:;"!?#@*[\]{}<>=~^%$\\]+/u;

/** Lowercase words of a text after punctuation normalisation (use it on search queries too). */
export function keywordWords(text: string): string[] {
  return text.toLowerCase().normalize('NFKC').replace(APOSTROPHES, '').split(SEPARATORS).filter(Boolean);
}

/** Tokens with inner punctuation ("coca-cola", "m.r.p") also indexed without it ("cocacola", "mrp"). */
function keywordJoined(text: string): string[] {
  const out: string[] = [];
  for (const tok of text.toLowerCase().normalize('NFKC').replace(APOSTROPHES, '').split(/[\s,/()+&|:;"!?#@]+/u)) {
    const parts = tok.split(/[.\-_]+/u).filter(Boolean);
    if (parts.length > 1) out.push(parts.join(''));
  }
  return out;
}

function addPrefixes(set: Set<string>, w: string) {
  const chars = [...w];
  const max = Math.min(15, chars.length);
  for (let i = 2; i <= max; i++) set.add(chars.slice(0, i).join(''));
  if (chars.length === 1) return;
}

/* ------------------------------------------------------------------ i18n */
export function pick(field: I18n | string | null | undefined, lang = 'en'): string {
  if (field === null || field === undefined) return '';
  if (typeof field === 'string') return field;
  return field[lang] ?? field.en ?? Object.values(field)[0] ?? '';
}

/* ------------------------------------------------------------------ time */
export const DEFAULT_TZ = 'Asia/Kolkata';

/** Wall-clock parts in a timezone. */
export function zonedParts(at: Date = new Date(), tz = DEFAULT_TZ): { date: string; time: string; hour: number } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(at).map((p) => [p.type, p.value]));
  const hour = Number(parts.hour) % 24;
  const hh = String(hour).padStart(2, '0');
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${hh}:${parts.minute}:${parts.second}`, hour };
}

/** `HH:mm` local time. */
export function localHm(at: Date = new Date(), tz = DEFAULT_TZ): string {
  return zonedParts(at, tz).time.slice(0, 5);
}

/** True when `time` (HH:mm[:ss]) is inside [from, to) handling windows that wrap midnight. */
export function inWindow(time: string, from: string, to: string, inclusiveEnd = false): boolean {
  if (from <= to) return time >= from && (inclusiveEnd ? time <= to : time < to);
  return time >= from || (inclusiveEnd ? time <= to : time < to);
}

export function randomDigits(n: number): string {
  let s = '';
  for (let i = 0; i < n; i++) s += randomInt(0, 10);
  if (s[0] === '0') s = String(randomInt(1, 10)) + s.slice(1);
  return s;
}

export function randomCode(len = 8, alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'): string {
  let s = '';
  for (let i = 0; i < len; i++) s += alphabet[randomInt(0, alphabet.length)];
  return s;
}

export function isOn(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  return v === true || v === 1 || v === 'active' || v === '1' || v === 'true';
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export function uniq<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}
