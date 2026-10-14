'use client';
// Live phone preview — port of home-builder/partials/preview.blade.php (+ styles.blade.php).
import { Bell, Mic, Search } from 'lucide-react';
import { imgUrl, tr } from '@/lib/format';
import { cx } from '@/components/ui';
import type { Mode } from '@/lib/types';
import { sectionLabel, type Header, type Section } from './defaults';
import { itemsKey, type PItem } from './hydrate';

export type Device = 'mobile' | 'tablet' | 'desktop';

const FRAME: Record<Device, string> = {
  mobile: 'w-[300px] border-[10px] border-[#111827] rounded-[38px]',
  tablet: 'w-[500px] max-w-full border-[12px] border-[#111827] rounded-[28px]',
  desktop: 'w-full border-[6px] border-[#1f2937] rounded-[14px]',
};
const clamp2 = { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' };

export function PhonePreview({ sections, header, selected, onSelect, items, device, mode, zoneName, deliveryMinutes, iconRow, lang, tick }: {
  sections: Section[]; header: Header; selected: string; onSelect: (id: string) => void; items: Record<string, PItem[] | undefined>;
  device: Device; mode: Mode; zoneName: string; deliveryMinutes: number; iconRow: { id: string; name: string; image: string }[]; lang: string; tick: number;
}) {
  const color = header.text_color || '#111827';
  const headerBg = header.bg_type === 'image' && header.bg_value ? { background: `url('${imgUrl(header.bg_value)}') center / cover no-repeat` } : { background: header.bg_value || '#FFF4C7' };
  const m = deliveryMinutes || (mode === 'quick' ? 8 : 2880);
  const delivery = m < 60 ? `${m} minutes` : m < 1440 ? `${Math.round(m / 60)} ${Math.round(m / 60) === 1 ? 'hour' : 'hours'}` : `${Math.round(m / 1440)} days`;
  const visible = sections.filter((s) => s.is_active);
  const titleOf = (s: Section, fallback: string) => tr(s.title as any, lang) || fallback;

  const ph = (n: number, name: string): PItem[] => Array.from({ length: n }, () => ({ name, image: null }));
  const get = (s: Section) => items[itemsKey(s)];

  return (
    <div className={cx('mx-auto bg-white overflow-hidden transition-all shadow-[0_20px_40px_-12px_rgba(16,24,40,.25)]', FRAME[device])}>
      <div className={cx('overflow-y-auto overflow-x-hidden relative bg-white [scrollbar-width:none] [&::-webkit-scrollbar]:hidden', device === 'desktop' ? 'h-[560px]' : 'h-[620px]')}>
        {device === 'mobile' && <div className="w-[90px] h-5 bg-[#111827] rounded-b-[14px] mx-auto absolute left-0 right-0 top-0 z-[5]" />}

        {/* App header */}
        <div className={cx('px-3 pt-6 pb-3 cursor-pointer relative', selected === 'header' && 'ring-2 ring-primary ring-inset')} style={headerBg} onClick={() => onSelect('header')}>
          <div className="flex items-center justify-between text-[10px] font-semibold" style={{ color }}><span>9:41</span><span className="tracking-widest">&bull;&bull;&bull; 5G</span></div>
          <div className="mt-2 flex items-start justify-between gap-2" style={{ color }}>
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-wide opacity-80">{mode === 'quick' ? 'Delivery in' : 'Delivered in'}</div>
              <div className="text-[22px] font-extrabold leading-tight">{delivery}</div>
              <div className="text-[10px] opacity-80 truncate">Home &middot; {zoneName} &#9662;</div>
            </div>
            <div className="w-7 h-7 rounded-full bg-white/70 flex items-center justify-center shrink-0 text-slate-700"><Bell className="w-3.5 h-3.5" /></div>
          </div>
          <div className="mt-2.5 flex items-center gap-2 bg-white rounded-xl px-3 py-2 text-[11px] text-slate-400 shadow-sm border border-black/5">
            <Search className="w-3.5 h-3.5" /><span className="flex-1 truncate">Search &quot;milk&quot;</span><Mic className="w-3.5 h-3.5 text-slate-500" />
          </div>
          {iconRow.length > 0 && (
            <div className="mt-3 flex gap-3 overflow-x-auto [scrollbar-width:none]">
              {iconRow.map((c) => (
                <div key={c.id} className="flex flex-col items-center shrink-0 w-12">
                  <img src={c.image} className="w-9 h-9 rounded-lg object-cover bg-white/70" alt="" />
                  <span className="mt-1 text-[9px] font-semibold text-center leading-tight truncate w-full" style={{ color }}>{c.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {visible.map((s) => {
          const it = get(s);
          const sel = selected === s.id;
          const st = s.settings || {};
          return (
            <div key={s.id} onClick={() => onSelect(s.id)} data-testid="preview-section"
              className={cx('group relative cursor-pointer py-2 outline outline-2 -outline-offset-2 transition-[outline-color]', sel ? 'outline-primary' : 'outline-transparent hover:outline-primary/35')}>
              <span className={cx('absolute right-1 top-1 z-[3] text-[9px] font-bold bg-primary text-white px-1.5 rounded-full', sel ? 'block' : 'hidden group-hover:block')}>{sectionLabel(s, sections, lang)}</span>

              {s.type === 'banner_slider' && (() => {
                const imgs = (it || []).map((x) => x.image).filter(Boolean) as string[];
                const h = Math.round((Number(st.height) || 180) * 0.7);
                const idx = imgs.length && st.autoplay ? tick % imgs.length : 0;
                return (
                  <div className="px-3">
                    {imgs.length ? (
                      <div>
                        <img src={imgs[idx]} className="w-full rounded-xl object-cover bg-slate-100" style={{ height: h }} alt="" />
                        <div className="flex justify-center gap-1 mt-1.5">{imgs.map((_, k) => <span key={k} className={cx('h-1.5 rounded-full', k === idx ? 'w-4 bg-primary' : 'w-1.5 bg-slate-300')} />)}</div>
                      </div>
                    ) : (
                      <div className="rounded-xl bg-gradient-to-r from-primary-50 to-amber-50 border border-dashed border-primary/40 flex items-center justify-center text-[11px] text-primary font-semibold" style={{ height: h }}>
                        {it === undefined ? 'Loading…' : 'Banner Slider · add banners'}
                      </div>
                    )}
                  </div>
                );
              })()}

              {s.type === 'category_section' && (() => {
                const list = it && it.length ? it : ph((Number(st.columns) || 4) * 2, 'Category');
                const scroll = st.style === 'scroll';
                return (
                  <div className="px-3">
                    <div className="text-[13px] font-extrabold text-slate-800 mb-0.5">{titleOf(s, 'Find Your Favorites')}</div>
                    <div className="text-[9px] text-slate-500 mb-2">Explore categories to find products you love</div>
                    <div className={scroll ? 'flex gap-2 overflow-x-auto [scrollbar-width:none]' : 'grid gap-2'} style={scroll ? undefined : { gridTemplateColumns: `repeat(${Number(st.columns) || 4}, minmax(0, 1fr))` }}>
                      {list.map((c, k) => (
                        <div key={k} className={cx('flex flex-col items-center', scroll && 'shrink-0 w-14')}>
                          <div className="w-full aspect-square rounded-xl bg-emerald-50 overflow-hidden flex items-center justify-center">{c.image && <img src={c.image} className="w-full h-full object-cover" alt="" />}</div>
                          <span className="mt-1 text-[9px] font-semibold text-slate-700 text-center leading-tight" style={clamp2}>{c.name}</span>
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
                  <div className="px-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-[13px] font-extrabold text-slate-800 truncate">{titleOf(s, 'Products')}</div>
                      <span className="text-[10px] font-bold text-primary">See all</span>
                    </div>
                    <div className="flex gap-2 overflow-x-auto [scrollbar-width:none]">
                      {list.map((p, k) => (
                        <div key={k} className="shrink-0 w-[104px] rounded-xl border border-slate-200 p-1.5 bg-white">
                          <div className="aspect-square rounded-lg bg-slate-50 overflow-hidden">{p.image && <img src={p.image} className="w-full h-full object-cover" alt="" />}</div>
                          <div className="mt-1 text-[10px] font-semibold text-slate-800 leading-tight h-[26px]" style={clamp2}>{p.name}</div>
                          <div className="text-[9px] text-slate-400 truncate">{p.unit || '1 unit'}</div>
                          <div className="mt-1 flex items-end justify-between gap-1">
                            <div className="leading-tight">
                              <div className="text-[10px] font-extrabold text-slate-900">{p.price}</div>
                              {p.mrp && <div className="text-[8px] text-slate-400 line-through">{p.mrp}</div>}
                            </div>
                            <span className="text-[9px] font-extrabold text-primary border border-primary rounded-md px-2 py-0.5 bg-primary-50">ADD</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {s.type === 'top_brands' && (
                <div className="px-3">
                  <div className="text-[13px] font-extrabold text-slate-800 mb-2">{titleOf(s, 'Top Brands')}</div>
                  <div className="flex gap-2 overflow-x-auto [scrollbar-width:none]">
                    {(it && it.length ? it : ph(5, 'Brand')).map((b, k) => (
                      <div key={k} className="shrink-0 w-14 flex flex-col items-center">
                        <div className="w-14 h-14 rounded-xl border border-slate-200 bg-white overflow-hidden flex items-center justify-center">{b.image && <img src={b.image} className="max-w-full max-h-full object-contain p-1" alt="" />}</div>
                        <span className="mt-1 text-[9px] text-slate-600 truncate w-full text-center">{b.name}</span>
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
                  <div className="px-3">
                    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
                      {list.map((g, k) => (
                        <div key={k} className={cx('rounded-xl overflow-hidden bg-amber-50 border border-dashed border-amber-200', cols > 1 ? 'aspect-square' : 'aspect-[2/1]')}>
                          {g && <img src={g} className="w-full h-full object-cover" alt="" />}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {s.type === 'title_image' && (
                <div className="px-3">
                  {st.image ? <img src={imgUrl(st.image)} className="w-full rounded-xl object-cover" alt="" />
                    : <div className="h-16 rounded-xl bg-gradient-to-r from-orange-50 to-amber-100 border border-dashed border-amber-300 flex items-center justify-center text-[11px] font-semibold text-amber-700">{titleOf(s, 'Title Image')}</div>}
                </div>
              )}

              {s.type === 'heading_text' && (
                <div className="px-3" style={{ textAlign: (st.align || 'left') as any }}>
                  <div className="text-[15px] font-extrabold leading-tight" style={{ color: st.color || '#111827' }}>{st.text || titleOf(s, 'Heading text')}</div>
                  {st.subtitle && <div className="text-[10px] text-slate-500 mt-0.5">{st.subtitle}</div>}
                </div>
              )}
            </div>
          );
        })}

        {!visible.length && <div className="text-center text-[11px] text-slate-400 py-10 px-6">No active sections. Add a section from the left panel.</div>}
        <div className="h-6" />
      </div>
    </div>
  );
}

