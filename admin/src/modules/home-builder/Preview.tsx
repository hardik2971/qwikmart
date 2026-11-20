'use client';
// Live preview of the customer home screen. It mirrors the current storefront design (web/src/components/home/* and
// customer_app/lib/features/home/*): white top bar with logo, Quick/eCommerce switch, orange delivery badge and the
// category strip (tinted with the selected category's header colour), the navy hero on the "All" tab, then the sections.
// Brand tokens are the storefront's (web/tailwind.config.ts) — not the admin panel's green.
import { Bell, ChevronDown, ChevronRight, Clock, MapPin, Mic, Search, ShoppingBag, Zap } from 'lucide-react';
import { imgUrl, tr } from '@/lib/format';
import { cx } from '@/components/ui';
import type { Mode } from '@/lib/types';
import { sectionLabel, type Section } from './defaults';
import { itemsKey, type PItem } from './hydrate';

export type Device = 'mobile' | 'tablet' | 'desktop';
export interface PreviewTab { id: string; name: string; image: string }

/** Storefront brand tokens (web/tailwind.config.ts, customer_app AppColors). */
const B = {
  primary: '#1846D1', primary50: '#EDF2FF', accent: '#F26411', accentInk: '#C2410C', accent50: '#FFF1E7',
  night: '#0A1B4D', ink: '#0B1B3F', body: '#3A4766', muted: '#637091', line: '#E1E7F2', soft: '#EEF2FA', page: '#F4F6FB',
};
const BRAND_TEXT = ['#0E9623', '#D9480F', '#1D4ED8', '#7C3AED', '#BE185D', '#0F766E', '#B45309', '#111827'];

const FRAME: Record<Device, string> = {
  mobile: 'w-[300px] border-[10px] border-[#111827] rounded-[38px]',
  tablet: 'w-[500px] max-w-full border-[12px] border-[#111827] rounded-[28px]',
  desktop: 'w-full border-[6px] border-[#1f2937] rounded-[14px]',
};
const clamp2 = { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' };
const hashOf = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0);
const num = (v?: string | null) => { const n = parseFloat(String(v ?? '').replace(/[^0-9.]/g, '')); return Number.isFinite(n) ? n : 0; };

function SectionHeader({ title, subtitle, seeAll }: { title: string; subtitle?: string; seeAll?: boolean }) {
  return (
    <div className="flex items-end justify-between gap-2 px-3 pt-3 pb-2">
      <div className="min-w-0">
        <div className="text-[13.5px] font-extrabold tracking-[-0.02em] truncate" style={{ color: B.ink }}>{title}</div>
        {subtitle && <div className="text-[9.5px] mt-0.5 truncate" style={{ color: B.muted }}>{subtitle}</div>}
      </div>
      {seeAll && <span className="shrink-0 flex items-center text-[10px] font-bold" style={{ color: B.primary }}>See all<ChevronRight className="w-3 h-3" /></span>}
    </div>
  );
}

function SearchBox({ large }: { large?: boolean }) {
  return (
    <div className={cx('flex items-center gap-2 bg-white rounded-xl border px-3 text-slate-400', large ? 'py-2.5 text-[11px]' : 'py-2 text-[10.5px]')} style={{ borderColor: B.line }}>
      <Search className="w-3.5 h-3.5 shrink-0" style={{ color: large ? B.primary : B.muted }} />
      <span className="flex-1 truncate">Search &quot;milk&quot;</span>
      <Mic className="w-3.5 h-3.5 shrink-0" style={{ color: large ? B.primary : B.muted }} />
    </div>
  );
}

export function PhonePreview({ sections, selected, onSelect, items, device, mode, zoneName, deliveryMinutes, tabs, activeTab, tint, logo, lang, tick }: {
  sections: Section[]; selected: string; onSelect: (id: string) => void; items: Record<string, PItem[] | undefined>;
  device: Device; mode: Mode; zoneName: string; deliveryMinutes: number;
  /** top-level category tabs of this mode ("All" is added here) */ tabs: PreviewTab[];
  /** selected category tab id, '' = All */ activeTab: string;
  /** selected category's header colour (tints the category strip), null on "All" */ tint: string | null;
  logo: string; lang: string; tick: number;
}) {
  const quick = mode === 'quick';
  const mins = deliveryMinutes || (quick ? 8 : 0);
  const all = !activeTab;
  const desktop = device === 'desktop';
  const visible = sections.filter((s) => s.is_active);
  const titleOf = (s: Section, fallback: string) => tr(s.title as any, lang) || fallback;
  const ph = (n: number, name: string): PItem[] => Array.from({ length: n }, () => ({ name, image: null }));
  const get = (s: Section) => items[itemsKey(s)];
  const stripBg = tint ? `color-mix(in srgb, ${tint} 16%, white)` : '#FFFFFF';
  const strip: PreviewTab[] = [{ id: '', name: 'All', image: '' }, ...tabs];

  return (
    <div className={cx('mx-auto bg-white overflow-hidden transition-all shadow-[0_20px_40px_-12px_rgba(16,24,40,.25)]', FRAME[device])}>
      <div className={cx('overflow-y-auto overflow-x-hidden relative [scrollbar-width:none] [&::-webkit-scrollbar]:hidden', desktop ? 'h-[560px]' : 'h-[620px]')} style={{ background: B.page }}>
        {device === 'mobile' && <div className="w-[90px] h-5 bg-[#111827] rounded-b-[14px] mx-auto absolute left-0 right-0 top-0 z-[5]" />}

        {/* ===== Top bar (logo · mode switch · bell), delivery badge, category strip ===== */}
        <div className={cx('bg-white cursor-pointer relative', selected === 'header' && 'ring-2 ring-primary ring-inset')} onClick={() => onSelect('header')}>
          {!desktop && <div className="flex items-center justify-between px-4 pt-1.5 text-[10px] font-semibold" style={{ color: B.ink }}><span>9:41</span><span className="tracking-widest">&bull;&bull;&bull; 5G</span></div>}
          <div className="flex items-center gap-2 px-3 pt-2.5">
            <img src={logo} alt="" className="h-[18px] w-auto object-contain" />
            <div className="ml-auto flex items-center rounded-full p-[2px] border" style={{ background: B.soft, borderColor: B.line }}>
              {(['quick', 'ecommerce'] as Mode[]).map((m) => (
                <span key={m} className="flex items-center gap-0.5 rounded-full px-2 py-[3px] text-[9.5px] font-bold"
                  style={m === mode ? { background: B.night, color: '#fff' } : { color: B.body }}>
                  {m === 'quick' && <Zap className="w-2.5 h-2.5" style={{ color: m === mode ? B.accent : B.body }} fill="currentColor" />}
                  {m === 'quick' ? 'Quick' : 'eCommerce'}
                </span>
              ))}
            </div>
            <span className="w-6 h-6 rounded-full flex items-center justify-center shrink-0" style={{ background: B.soft, color: B.body }}><Bell className="w-3 h-3" /></span>
          </div>
          <div className="flex items-center gap-2 px-3 pt-2 pb-2.5">
            <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: B.accent50, color: B.accentInk }}>
              {quick ? <Zap className="w-4 h-4" fill="currentColor" /> : <MapPin className="w-4 h-4" />}
            </span>
            <div className="min-w-0 leading-tight">
              <div className="text-[12.5px] font-extrabold tracking-[-0.01em] truncate" style={{ color: B.ink }}>{quick ? `Delivery in ${mins} minutes` : 'Delivery in 1–4 days'}</div>
              <div className="flex items-center text-[9.5px] font-medium truncate" style={{ color: B.muted }}>{zoneName}<ChevronDown className="w-3 h-3 shrink-0" /></div>
            </div>
          </div>
          <div className="flex gap-1 overflow-x-auto px-1.5 py-1.5 border-y transition-colors [scrollbar-width:none]" style={{ background: stripBg, borderColor: B.line }}>
            {strip.map((c) => {
              const on = c.id === activeTab;
              return (
                <div key={c.id || 'all'} className="flex flex-col items-center shrink-0 w-[50px]">
                  <span className="w-[34px] h-[34px] rounded-[11px] flex items-center justify-center border-2 overflow-hidden"
                    style={{ background: on ? B.primary50 : B.soft, borderColor: on ? B.primary : 'transparent' }}>
                    {c.id ? (c.image ? <img src={c.image} alt="" className="w-5 h-5 object-contain" /> : <ShoppingBag className="w-4 h-4" style={{ color: B.muted }} />)
                      : <ShoppingBag className="w-4 h-4" style={{ color: B.primary }} />}
                  </span>
                  <span className={cx('mt-0.5 text-[8.5px] leading-tight truncate w-full text-center', on ? 'font-extrabold' : 'font-medium')} style={{ color: on ? B.primary : B.body }}>{c.name}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ===== Navy hero on "All", a plain search bar on category tabs ===== */}
        {all ? (
          <div className="px-3 pt-3">
            <div className="rounded-[18px] p-3.5 text-white" style={{ background: B.night }}>
              <span className="inline-flex max-w-full items-center gap-1.5 rounded-full py-[3px] pl-[3px] pr-2 text-[9.5px] font-semibold" style={{ background: 'rgba(255,255,255,.10)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.15)' }}>
                <span className="w-4 h-4 rounded-full flex items-center justify-center shrink-0" style={{ background: B.accent }}><MapPin className="w-2.5 h-2.5" /></span>
                <span className="truncate">{quick && mins ? `${mins} min delivery to ${zoneName}` : `Delivering to ${zoneName}`}</span>
                <ChevronDown className="w-3 h-3 opacity-70 shrink-0" />
              </span>
              <div className="mt-3 flex items-start gap-2">
                <span className="mt-1.5 flex flex-col items-end gap-[2px] shrink-0">
                  {[[14, 1], [10, 0.8], [6, 0.6]].map(([w, a], k) => <span key={k} className="h-[2px] rounded" style={{ width: w, background: B.accent, opacity: a }} />)}
                </span>
                <div className="text-[17px] font-extrabold leading-[1.08] tracking-[-0.03em]">
                  {quick ? 'Groceries and daily essentials, at your door in minutes.' : 'Electronics, fashion and home, delivered in 1–4 days.'}
                </div>
              </div>
              <div className="mt-1.5 text-[10px] leading-snug" style={{ color: 'rgba(255,255,255,.75)' }}>
                {quick ? 'Fresh produce, staples and snacks, packed by a store near you.' : 'Shop brands you trust, with doorstep returns.'}
              </div>
              <div className="mt-3"><SearchBox large /></div>
              <div className="mt-2 text-[9.5px] font-semibold underline underline-offset-2" style={{ color: 'rgba(255,255,255,.85)', textDecorationColor: 'rgba(255,255,255,.35)' }}>Browse all categories</div>
            </div>
          </div>
        ) : (
          <div className="px-3 pt-3"><SearchBox /></div>
        )}

        {/* ===== Sections ===== */}
        {visible.map((s) => {
          const it = get(s);
          const sel = selected === s.id;
          const st = s.settings || {};
          return (
            <div key={s.id} onClick={() => onSelect(s.id)} data-testid="preview-section"
              className={cx('group relative cursor-pointer pb-1 outline outline-2 -outline-offset-2 transition-[outline-color]', sel ? 'outline-primary' : 'outline-transparent hover:outline-primary/35')}>
              <span className={cx('absolute right-1 top-1 z-[3] text-[9px] font-bold bg-primary text-white px-1.5 rounded-full', sel ? 'block' : 'hidden group-hover:block')}>{sectionLabel(s, sections, lang)}</span>

              {s.type === 'banner_slider' && (() => {
                const imgs = (it || []).map((x) => x.image).filter(Boolean) as string[];
                const idx = imgs.length && st.autoplay ? tick % imgs.length : 0;
                return (
                  <div className="px-3 pt-3">
                    {imgs.length ? (
                      <div>
                        <img src={imgs[idx]} className="w-full rounded-[14px] object-cover bg-white aspect-[1600/600]" alt="" />
                        {imgs.length > 1 && (
                          <div className="flex justify-center gap-1 mt-2">{imgs.map((_, k) => <span key={k} className="h-1.5 rounded-full transition-all" style={{ width: k === idx ? 14 : 6, background: k === idx ? B.night : B.line }} />)}</div>
                        )}
                      </div>
                    ) : (
                      <div className="rounded-[14px] border border-dashed flex items-center justify-center text-[11px] font-semibold aspect-[1600/600]" style={{ background: B.primary50, borderColor: `${B.primary}66`, color: B.primary }}>
                        {it === undefined ? 'Loading…' : 'Banner Slider · add banners'}
                      </div>
                    )}
                  </div>
                );
              })()}

              {s.type === 'category_section' && (() => {
                const list = it && it.length ? it : ph(8, 'Category');
                const scroll = st.style === 'scroll';
                const cols = desktop ? 6 : 4;
                return (
                  <div>
                    <SectionHeader title={titleOf(s, 'Shop by Category')} />
                    <div className={cx('px-3', scroll ? 'flex gap-1.5 overflow-x-auto [scrollbar-width:none]' : 'grid gap-x-1.5 gap-y-2.5')} style={scroll ? undefined : { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
                      {list.map((c, k) => (
                        <div key={k} className={cx('flex flex-col items-center', scroll && 'shrink-0 w-[60px]')}>
                          <div className="w-full aspect-square rounded-[14px] overflow-hidden flex items-center justify-center" style={{ background: B.soft }}>{c.image && <img src={c.image} className="w-full h-full object-contain" alt="" />}</div>
                          <span className="mt-1 text-[9px] font-semibold text-center leading-tight" style={{ ...clamp2, color: B.ink }}>{c.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {s.type === 'product_slider' && (() => {
                const lim = Math.min(Number(st.limit) || 10, 12);
                const list = it && it.length ? it.slice(0, lim) : ph(3, it === undefined ? 'Loading…' : 'Product name').map((x) => ({ ...x, price: '—', unit: '' }));
                return (
                  <div>
                    <SectionHeader title={titleOf(s, 'Products')} seeAll />
                    <div className="flex gap-2 overflow-x-auto px-3 [scrollbar-width:none]">
                      {list.map((p, k) => {
                        const price = num(p.price); const mrp = num(p.mrp);
                        const off = mrp > price && price > 0 ? Math.round(((mrp - price) / mrp) * 100) : 0;
                        return (
                          <div key={k} className="shrink-0 w-[112px] rounded-[14px] border bg-white p-1.5" style={{ borderColor: B.line }}>
                            <div className="relative aspect-square rounded-[10px] overflow-hidden" style={{ background: B.soft }}>
                              {p.image && <img src={p.image} className="w-full h-full object-cover" alt="" />}
                              {off > 0 && <span className="absolute left-1 top-1 rounded-md px-1 text-[8px] font-extrabold leading-[1.5] text-white" style={{ background: B.accentInk }}>{off}% OFF</span>}
                            </div>
                            <span className="mt-1.5 inline-block rounded-md px-1 text-[8px] font-semibold" style={{ background: B.soft, color: B.muted }}>{p.unit || '1 unit'}</span>
                            <div className="mt-1 flex items-baseline gap-1 leading-tight">
                              <span className="text-[10.5px] font-extrabold" style={{ color: B.ink }}>{p.price}</span>
                              {p.mrp && off > 0 && <span className="text-[8px] line-through" style={{ color: B.muted }}>{p.mrp}</span>}
                            </div>
                            <div className="mt-0.5 text-[9.5px] font-semibold leading-tight h-[24px]" style={{ ...clamp2, color: B.ink }}>{p.name}</div>
                            {quick && (
                              <span className="mt-1 inline-flex items-center gap-0.5 rounded-md px-1 text-[8px] font-bold" style={{ background: B.primary50, color: B.primary }}>
                                <Clock className="w-2.5 h-2.5" />{mins} mins
                              </span>
                            )}
                            <div className="mt-1.5 rounded-[9px] border-[1.5px] bg-white text-center text-[10px] font-extrabold py-[3px]" style={{ borderColor: B.primary, color: B.primary }}>ADD</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {s.type === 'top_brands' && (
                <div>
                  <SectionHeader title={titleOf(s, 'Top Brands')} />
                  <div className="flex gap-2 overflow-x-auto px-3 [scrollbar-width:none]">
                    {(it && it.length ? it : ph(5, 'Brand')).map((b, k) => (
                      <div key={k} className="shrink-0 w-[76px] h-[46px] rounded-xl border bg-white p-1.5 flex items-center justify-center" style={{ borderColor: B.line }}>
                        {b.image ? <img src={b.image} className="max-w-full max-h-full object-contain" alt="" />
                          : <span className="text-[10px] font-extrabold text-center leading-tight" style={{ ...clamp2, color: BRAND_TEXT[Math.abs(hashOf(b.name || '')) % BRAND_TEXT.length] }}>{b.name}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {s.type === 'grid_banner' && (() => {
                const cols = Number(st.columns) || 2;
                const imgs = ((st.images || []) as any[]).map((im) => (im?.image ? imgUrl(im.image) : ''));
                const list = imgs.length ? imgs : Array(cols).fill('');
                return (
                  <div className="px-3 pt-3">
                    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
                      {list.map((g, k) => (
                        <div key={k} className={cx('rounded-[14px] overflow-hidden', cols > 1 ? 'aspect-square' : 'aspect-[2/1]', !g && 'border border-dashed')} style={g ? undefined : { background: B.primary50, borderColor: `${B.primary}55` }}>
                          {g && <img src={g} className="w-full h-full object-cover" alt="" />}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {s.type === 'title_image' && (
                <div className="px-3 pt-3">
                  {st.image ? <img src={imgUrl(st.image)} className="w-full rounded-[14px] object-cover aspect-[1600/500]" alt="" />
                    : <div className="aspect-[1600/500] rounded-[14px] border border-dashed flex items-center justify-center text-[11px] font-semibold" style={{ background: B.accent50, borderColor: `${B.accent}66`, color: B.accentInk }}>{titleOf(s, 'Title Image')}</div>}
                </div>
              )}

              {s.type === 'heading_text' && (
                // App: large soft-grey heading, left aligned · Website (desktop): centered display heading.
                <div className={cx('px-4', desktop ? 'py-6 text-center' : 'pt-5 pb-2')}>
                  <div className={cx('font-extrabold leading-[1.1] tracking-[-0.02em]', desktop ? 'text-[22px]' : 'text-[24px]')} style={{ color: desktop ? B.ink : '#CBD2DC' }}>{st.text || titleOf(s, 'Heading text')}</div>
                  {st.subtitle && <div className="text-[10px] font-semibold mt-1" style={{ color: B.muted }}>{st.subtitle}</div>}
                </div>
              )}
            </div>
          );
        })}

        {!visible.length && <div className="text-center text-[11px] py-10 px-6" style={{ color: B.muted }}>No active sections. Add a section from the left panel.</div>}
        <div className="h-6" />
      </div>
    </div>
  );
}
