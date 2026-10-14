'use client';
// Right-hand settings panel — port of home-builder/partials/{settings,image-input,image-list,link-input}.blade.php.
import { AlignCenter, AlignLeft, AlignRight, ArrowDown, ArrowUp, PanelTop, Settings2, Trash2 } from 'lucide-react';
import { Toggle, cx } from '@/components/ui';
import { ImageUpload } from '@/components/form/fields';
import { LangTabs, TransInput } from '@/components/form/lang';
import type { Mode, Trans } from '@/lib/types';
import { EntityPicker } from '@/modules/catalog/pickers';
import { PRODUCT_SOURCES, SECTION_ICONS, SECTION_TYPES, hex, sectionLabel, type Header, type LinkImage, type Section } from './defaults';

const FOLDER = 'catalog/home';

export function ImageField({ value, onChange, label, hint }: { value: string | null | undefined; onChange: (v: string | null) => void; label?: string; hint?: string }) {
  return (
    <div>
      {label && <label className="label">{label}</label>}
      <ImageUpload value={value || ''} onChange={(u) => onChange(u || null)} folder={FOLDER} square={false} />
      <input type="text" className="input !py-1.5 text-xs mt-2" placeholder="…or paste an image URL / storage path" value={value || ''} onChange={(e) => onChange(e.target.value || null)} />
      {hint && <p className="text-[11px] text-muted mt-1.5">{hint}</p>}
    </div>
  );
}

function LinkInput({ value, onChange }: { value: LinkImage; onChange: (v: LinkImage) => void }) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label">Link type</label>
          <select className="input !py-2 text-sm" value={value.link_type} onChange={(e) => onChange({ ...value, link_type: e.target.value as LinkImage['link_type'], link_value: null })}>
            <option value="none">None</option><option value="product">Product</option><option value="category">Category</option><option value="url">URL</option>
          </select>
        </div>
        {value.link_type === 'url' && (
          <div>
            <label className="label">URL</label>
            <input type="text" className="input !py-2 text-sm" placeholder="https://…" value={value.link_value || ''} onChange={(e) => onChange({ ...value, link_value: e.target.value || null })} />
          </div>
        )}
      </div>
      {value.link_type === 'product' && <EntityPicker type="products" multiple={false} label="Linked product" value={value.link_value} onChange={(v) => onChange({ ...value, link_value: v })} />}
      {value.link_type === 'category' && <EntityPicker type="categories" multiple={false} label="Linked category" value={value.link_value} onChange={(v) => onChange({ ...value, link_value: v })} />}
    </div>
  );
}

function ImageList({ title, images, onChange }: { title: string; images: LinkImage[]; onChange: (v: LinkImage[]) => void }) {
  const move = (k: number, d: number) => { const a = [...images]; const j = k + d; if (j < 0 || j >= a.length) return; const [m] = a.splice(k, 1); a.splice(j, 0, m); onChange(a); };
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="label !mb-0">{title}</label>
        <button type="button" className="text-xs font-semibold text-primary hover:underline" onClick={() => onChange([...images, { image: null, link_type: 'none', link_value: null }])}>+ Add image</button>
      </div>
      <div className="space-y-3">
        {images.map((im, k) => (
          <div key={k} className="rounded-lg border border-line p-3 space-y-3 bg-slate-50/60 dark:bg-slate-800/60 dark:border-dark-line">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-navy dark:text-white">Image #{k + 1}</span>
              <div className="flex items-center gap-1">
                <button type="button" className="text-muted hover:text-navy px-1 disabled:opacity-30" disabled={k === 0} onClick={() => move(k, -1)} title="Move up"><ArrowUp className="w-3.5 h-3.5" /></button>
                <button type="button" className="text-muted hover:text-navy px-1 disabled:opacity-30" disabled={k === images.length - 1} onClick={() => move(k, 1)} title="Move down"><ArrowDown className="w-3.5 h-3.5" /></button>
                <button type="button" className="text-xs font-semibold text-red-500 hover:text-red-600 pl-1" onClick={() => onChange(images.filter((_, j) => j !== k))}>Remove</button>
              </div>
            </div>
            <ImageField value={im.image} onChange={(v) => onChange(images.map((x, j) => (j === k ? { ...x, image: v } : x)))} />
            <LinkInput value={im} onChange={(v) => onChange(images.map((x, j) => (j === k ? v : x)))} />
          </div>
        ))}
        {!images.length && <div className="text-xs text-muted text-center border border-dashed border-line rounded-lg py-4 dark:border-dark-line">No images added.</div>}
      </div>
    </div>
  );
}

function ColorInput({ value, fallback, onChange }: { value: string; fallback: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input type="color" className="w-[38px] h-[38px] p-0.5 rounded-lg border border-line bg-white cursor-pointer dark:bg-slate-800 dark:border-dark-line" value={hex(value, fallback)} onChange={(e) => onChange(e.target.value.toUpperCase())} />
      <input type="text" className="input !py-2 text-sm !w-32 font-mono" value={value || ''} placeholder={fallback} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export function HeaderSettings({ header, onChange, tabName, copyOptions, copyFrom, setCopyFrom, onCopy, categoryIcon, onCategoryIcon }: {
  header: Header; onChange: (h: Header) => void; tabName: string;
  copyOptions: { value: string; label: string; group: string }[]; copyFrom: string; setCopyFrom: (v: string) => void; onCopy: () => void;
  categoryIcon?: string | null; onCategoryIcon?: ((v: string | null) => void) | null;
}) {
  const groups = [...new Set(copyOptions.map((o) => o.group))];
  return (
    <div className="space-y-5">
      <h3 className="font-bold text-navy dark:text-white flex items-center gap-2"><PanelTop className="w-4 h-4 text-primary" /> Header Settings</h3>
      <div>
        <label className="label">Copy layout from</label>
        <div className="flex gap-2">
          <select className="input !py-2 text-sm" value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
            <option value="">Select category…</option>
            {groups.map((g) => <optgroup key={g} label={g}>{copyOptions.filter((o) => o.group === g).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</optgroup>)}
          </select>
          <button type="button" className="btn-soft btn-sm shrink-0" disabled={!copyFrom} onClick={onCopy}>Apply</button>
        </div>
        <p className="text-[11px] text-muted mt-1">Copies the sections and header of the selected layout into this draft.</p>
      </div>

      <div>
        <label className="label">Header background for <span className="text-primary">{tabName}</span></label>
        <div className="inline-flex rounded-lg border border-line overflow-hidden text-sm font-semibold mb-3 dark:border-dark-line">
          <button type="button" className={cx('px-3 py-1.5', header.bg_type === 'color' ? 'bg-primary text-white' : 'bg-white text-bodytext dark:bg-slate-800 dark:text-slate-200')}
            onClick={() => header.bg_type !== 'color' && onChange({ ...header, bg_type: 'color', bg_value: '#FFF4C7' })}>Color</button>
          <button type="button" className={cx('px-3 py-1.5 border-l border-line dark:border-dark-line', header.bg_type === 'image' ? 'bg-primary text-white' : 'bg-white text-bodytext dark:bg-slate-800 dark:text-slate-200')}
            onClick={() => header.bg_type !== 'image' && onChange({ ...header, bg_type: 'image', bg_value: '' })}>Image</button>
        </div>
        {header.bg_type === 'color'
          ? <ColorInput value={header.bg_value} fallback="#FFF4C7" onChange={(v) => onChange({ ...header, bg_value: v })} />
          : <ImageField value={header.bg_value} onChange={(v) => onChange({ ...header, bg_value: v || '' })} hint="Recommended 1080×600. The image covers the whole header area behind the search bar." />}
        <p className="text-[11px] text-muted mt-1.5">Background will be used for the header area of this tab in the app.</p>
      </div>

      <div>
        <label className="label">Text color</label>
        <ColorInput value={header.text_color} fallback="#111827" onChange={(v) => onChange({ ...header, text_color: v })} />
        <p className="text-[11px] text-muted mt-1">Color of the header texts (delivery time, address, category names).</p>
      </div>

      {onCategoryIcon && <ImageField label="Category icon" value={categoryIcon} onChange={onCategoryIcon} hint="Icon shown for this category in the app category tabs (saved on the category)." />}
    </div>
  );
}

export function SectionSettings({ section, all, onChange, onDelete, zoneId, mode, lang, isStore }: {
  section: Section; all: Section[]; onChange: (s: Section) => void; onDelete: () => void; zoneId: string; mode: Mode; lang: string; isStore: boolean;
}) {
  const Icon = SECTION_ICONS[section.type];
  const st = section.settings || {};
  const set = (patch: Record<string, any>) => onChange({ ...section, settings: { ...st, ...patch } });
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="w-8 h-8 rounded-lg bg-primary-50 text-primary flex items-center justify-center"><Icon className="w-4 h-4" /></span>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-navy dark:text-white truncate">{SECTION_TYPES[section.type]}</h3>
          <p className="text-[11px] text-muted">{sectionLabel(section, all, lang)}</p>
        </div>
        <button type="button" className="icon-btn !text-red-500" title="Delete section" onClick={onDelete}><Trash2 className="w-4 h-4" /></button>
      </div>

      <LangTabs>
        <TransInput label="Title" value={section.title as Trans} onChange={(t) => onChange({ ...section, title: t })} placeholder="Section title" />
      </LangTabs>

      <div className="flex items-center justify-between rounded-lg border border-line px-3 py-2.5 dark:border-dark-line">
        <div>
          <div className="text-sm font-semibold text-navy dark:text-white">Active</div>
          <div className="text-[11px] text-muted">Show this section in the app</div>
        </div>
        <Toggle checked={section.is_active} onChange={(v) => onChange({ ...section, is_active: v })} />
      </div>
      <hr className="border-line dark:border-dark-line" />

      {section.type === 'banner_slider' && (
        <div className="space-y-4">
          <EntityPicker type="banners" label="Banners" placeholder="Search banners…" value={st.banner_ids} onChange={(v) => set({ banner_ids: v })} zoneId={zoneId} mode={mode} />
          <p className="text-[11px] text-muted -mt-2">Pick saved banners{isStore ? '' : ' (Home Builder → Banners)'} and/or add custom slides below.</p>
          <ImageList title="Custom slides" images={st.images || []} onChange={(v) => set({ images: v })} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Height (px)</label>
              <input type="number" min={60} max={500} className="input !py-2 text-sm" value={st.height ?? 180} onChange={(e) => set({ height: Number(e.target.value) })} />
            </div>
            <div>
              <label className="label">Autoplay</label>
              <div className="mt-2"><Toggle checked={!!st.autoplay} onChange={(v) => set({ autoplay: v })} /></div>
            </div>
          </div>
        </div>
      )}

      {section.type === 'category_section' && (
        <div className="space-y-4">
          <EntityPicker type="categories" label="Categories" placeholder="Search categories…" value={st.category_ids} onChange={(v) => set({ category_ids: v })} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Columns</label>
              <select className="input !py-2 text-sm" value={st.columns ?? 4} onChange={(e) => set({ columns: Number(e.target.value) })}>
                {[2, 3, 4, 5, 6].map((c) => <option key={c} value={c}>{c} columns</option>)}
              </select>
            </div>
            <div>
              <label className="label">Style</label>
              <select className="input !py-2 text-sm" value={st.style || 'grid'} onChange={(e) => set({ style: e.target.value })}>
                <option value="grid">Grid</option><option value="scroll">Horizontal scroll</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {section.type === 'product_slider' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Products source</label>
              <select className="input !py-2 text-sm" value={st.source || 'featured'} onChange={(e) => set({ source: e.target.value })}>
                {PRODUCT_SOURCES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Limit</label>
              <input type="number" min={1} max={30} className="input !py-2 text-sm" value={st.limit ?? 10} onChange={(e) => set({ limit: Math.max(1, Math.min(30, Number(e.target.value) || 1)) })} />
            </div>
          </div>
          {st.source === 'category' && <EntityPicker type="categories" multiple={false} label="Category" placeholder="Search category…" value={st.category_id} onChange={(v) => set({ category_id: v })} />}
          {st.source === 'manual' && <EntityPicker type="products" label="Products" placeholder="Search products…" value={st.product_ids} onChange={(v) => set({ product_ids: v })} />}
        </div>
      )}

      {section.type === 'top_brands' && (
        <EntityPicker type="brands" label="Brands" placeholder="Search brands…" value={st.brand_ids} onChange={(v) => set({ brand_ids: v })} />
      )}

      {section.type === 'grid_banner' && (
        <div className="space-y-4">
          <div>
            <label className="label">Columns</label>
            <select className="input !py-2 text-sm" value={st.columns ?? 2} onChange={(e) => set({ columns: Number(e.target.value) })}>
              {[1, 2, 3, 4].map((c) => <option key={c} value={c}>{c} {c === 1 ? 'column' : 'columns'}</option>)}
            </select>
          </div>
          <ImageList title="Grid images" images={st.images || []} onChange={(v) => set({ images: v })} />
        </div>
      )}

      {section.type === 'title_image' && (
        <div className="space-y-4">
          <ImageField label="Image" value={st.image} onChange={(v) => set({ image: v })} hint="Wide image, e.g. 1080×300." />
          <LinkInput value={{ image: st.image ?? null, link_type: st.link_type || 'none', link_value: st.link_value ?? null }} onChange={(v) => set({ link_type: v.link_type, link_value: v.link_value })} />
        </div>
      )}

      {section.type === 'heading_text' && (
        <div className="space-y-4">
          <div>
            <label className="label">Heading text</label>
            <input type="text" className="input !py-2 text-sm" value={st.text || ''} onChange={(e) => set({ text: e.target.value })} placeholder="e.g. Find Your Favorites" />
          </div>
          <div>
            <label className="label">Subtitle</label>
            <input type="text" className="input !py-2 text-sm" value={st.subtitle || ''} onChange={(e) => set({ subtitle: e.target.value })} placeholder="Optional" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Alignment</label>
              <div className="inline-flex rounded-lg border border-line overflow-hidden dark:border-dark-line">
                {([['left', AlignLeft], ['center', AlignCenter], ['right', AlignRight]] as const).map(([al, Ic], i) => (
                  <button key={al} type="button" onClick={() => set({ align: al })}
                    className={cx('px-3 py-2', i > 0 && 'border-l border-line dark:border-dark-line', (st.align || 'left') === al ? 'bg-primary text-white' : 'bg-white text-bodytext dark:bg-slate-800 dark:text-slate-200')}>
                    <Ic className="w-4 h-4" />
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="label">Text color</label>
              <div className="flex items-center gap-2">
                <input type="color" className="w-[38px] h-[38px] p-0.5 rounded-lg border border-line bg-white cursor-pointer shrink-0" value={hex(st.color, '#111827')} onChange={(e) => set({ color: e.target.value })} />
                <input type="text" className="input !py-2 text-xs font-mono" value={st.color || ''} onChange={(e) => set({ color: e.target.value })} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function NothingSelected() {
  return (
    <div className="text-center py-12 text-sm text-muted">
      <div className="mx-auto w-12 h-12 rounded-full bg-primary-50 text-primary flex items-center justify-center mb-3"><Settings2 className="w-5 h-5" /></div>
      Select Header Settings or a section to edit its settings.
    </div>
  );
}
