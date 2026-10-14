import { describe, expect, it } from 'vitest';
import { haversineKm, inWindow, localHm, money, pointInPolygon, searchKeywords, zonedParts } from '../src/shared/util';
import { canTransition, TRANSITIONS } from '../src/shared/status';
import { hasPermission } from '../src/shared/permissions';
import { MUMBAI_POLY } from './helpers';

describe('shared helpers', () => {
  it('rounds money to 2 decimals', () => {
    expect(money(1.005)).toBe(1.01);
    expect(money(160 - 160 / 1.05)).toBe(7.62);
    expect(money(-2.345)).toBe(-2.35);
  });

  it('haversine + point in polygon (Mumbai)', () => {
    expect(pointInPolygon(19.076, 72.8777, MUMBAI_POLY)).toBe(true);
    expect(pointInPolygon(28.61, 77.2, MUMBAI_POLY)).toBe(false);
    expect(pointInPolygon(19.076, 72.8777, [[18.85, 72.75], [18.85, 73.05], [19.35, 73.05], [19.35, 72.75]])).toBe(true);
    const d = haversineKm(19.076, 72.8777, 19.116, 72.8777);
    expect(d).toBeGreaterThan(4.4);
    expect(d).toBeLessThan(4.5);
  });

  it('surge/promo windows in Asia/Kolkata incl. midnight wrap', () => {
    const at = new Date('2026-01-01T13:00:00Z'); // 18:30 IST
    expect(localHm(at)).toBe('18:30');
    expect(zonedParts(at).date).toBe('2026-01-01');
    expect(zonedParts(new Date('2026-01-01T20:00:00Z')).date).toBe('2026-01-02'); // 01:30 IST next day
    expect(inWindow('18:30', '18:00', '21:00')).toBe(true);
    expect(inWindow('21:00', '18:00', '21:00')).toBe(false);
    expect(inWindow('23:30', '22:00', '02:00')).toBe(true);
    expect(inWindow('01:00', '22:00', '02:00')).toBe(true);
    expect(inWindow('03:00', '22:00', '02:00')).toBe(false);
  });

  it('search keywords are lowercase prefixes (2..15 chars)', () => {
    const kw = searchKeywords({ en: 'Basmati Rice', hi: 'बासमती चावल' }, 'Daawat');
    expect(kw).toContain('ba');
    expect(kw).toContain('basmati');
    expect(kw).toContain('ri');
    expect(kw).toContain('daawat');
    expect(kw).toContain('basmati r');
    expect(kw).not.toContain('b');
    expect(kw.every((k) => k === k.toLowerCase() && [...k].length <= 15)).toBe(true);
  });

  it('order transitions match Laravel', () => {
    expect(canTransition('received', 'processed')).toBe(true);
    expect(canTransition('picked_up', 'cancelled')).toBe(false);
    expect(TRANSITIONS.delivered).toEqual(['returned']);
  });

  it('permission keys support wildcards', () => {
    expect(hasPermission(['order.*'], 'order.update')).toBe(true);
    expect(hasPermission(['*'], 'product.delete')).toBe(true);
    expect(hasPermission(['order.list'], 'order.update')).toBe(false);
  });
});

describe('search keyword normalisation', () => {
  it('apostrophes and inner punctuation are normalised ("lays" finds "Lay\'s", "cocacola" finds "Coca-Cola")', async () => {
    const kw = searchKeywords({ en: "Lay's Classic Salted" }, 'Coca-Cola 7-Up', 'Haldiram’s Bhujia', 'M.R.P. pack');
    for (const k of ['lays', 'la', 'classic', 'cocacola', 'coca', 'cola', '7up', 'up', 'haldirams', 'bhujia', 'mrp', 'pack']) expect(kw).toContain(k);
    const { keywordWords } = await import('../src/shared/util');
    expect(keywordWords("Lay's")).toEqual(['lays']);
  });
});
