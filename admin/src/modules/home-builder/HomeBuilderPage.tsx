'use client';
// Home Builder — port of admin/home-builder/index.blade.php (+ partials) and HomeBuilderController.
// One layout per (zone, mode, category tab), id {zoneId}_{mode}_{categoryId|'all'}:
//  - home_layout_drafts/{id} — panel-only working copy (draft_sections + header)
//  - home_layouts/{id}       — public, published data only (written by the publishHomeLayout callable)
//  - Save Draft  → saveDoc('home_layout_drafts', …) (auto-saved 1.5 s after each change, Ctrl+S to save now)
//  - Publish     → save draft, then publishHomeLayout({layout_id}) (copies draft sections + header → home_layouts server-side)
//  - Preview     → previewHomeSections callable; falls back to client-side hydration from Firestore when the callable fails.
// Store panel: zone fixed to stores/{storeId}.zone_id and store_id is stamped on the draft (and copied on publish).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft, ArrowUpDown, Copy, GripVertical, Info, MapPin, Monitor, PanelTop, Plus, Rocket, Save, Settings2, ShoppingBag, Smartphone, Tablet, Trash2, Undo2, Zap,
} from 'lucide-react';
import { fetchDoc, fetchList, patchDoc, saveDoc, useBrands, useCategories, useDocQ, useInvalidate, useZones, where } from '@/lib/firestore';
import { publishHomeLayout } from '@/lib/callables';
import { usePanel } from '@/lib/panel';
import { useAuth } from '@/lib/auth';
import { fmtDateTime, imgUrl, tr } from '@/lib/format';
import { Forbidden, Loading, Toggle, cx } from '@/components/ui';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import type { Category, HomeLayout, Mode, SectionType, Store } from '@/lib/types';
import { SortableList } from '@/modules/catalog/Sortable';
import {
  DEFAULT_HEADER, SECTION_ICONS, SECTION_TYPES, TYPE_KEYS, clone, loadSections, newSection, payload, rid, sectionLabel, type Header, type Section,
} from './defaults';
import { clientItems, itemsKey, serverItemsBatch, type PItem } from './hydrate';
import { PhonePreview, type Device } from './Preview';
import { HeaderSettings, NothingSelected, SectionSettings } from './Settings';

const DRAFTS = 'home_layout_drafts';
const modeLabel = (m: Mode) => (m === 'quick' ? 'Quick' : 'eCommerce');
const okForMode = (c: Category, m: Mode) => (m === 'quick' ? c.show_in_quick !== false : c.show_in_ecommerce !== false);
const isActive = (s: any) => s === 'active' || s === true;

export default function HomeBuilderPage() {
  const params = useParams<{ mode?: string }>();
  const mode: Mode = params?.mode === 'ecommerce' ? 'ecommerce' : 'quick';
  const sp = useSearchParams();
  const router = useRouter();
  const { p, isStore, storeId, countryId, settings, uiLang } = usePanel();
  const { can } = useAuth();
  const toast = useToast();
  const { confirm } = useConfirm();
  const invalidate = useInvalidate();
  const canList = can('home_builder.list');
  const canUpdate = can('home_builder.update');

  const { data: zones = [], isLoading: zonesLoading } = useZones();
  const { data: allCats = [] } = useCategories();
  const { data: brands = [] } = useBrands();
  const { data: store, isLoading: storeLoading } = useDocQ<Store>('stores', isStore ? storeId : null);

  // ---------- scope ----------
  const zonesAvail = useMemo(() => (isStore ? zones.filter((z) => z.id === store?.zone_id) : zones.filter((z) => !countryId || z.country_id === countryId)), [zones, isStore, store, countryId]);
  const qZone = sp?.get('zone_id') || '';
  const zone = zonesAvail.find((z) => z.id === qZone) || zonesAvail.find((z) => z.id === settings.default_zone_id) || zonesAvail[0] || null;
  const zoneId = zone?.id || '';
  const tabs = useMemo(() => allCats.filter((c) => !c.parent_id && isActive(c.status) && okForMode(c, mode)).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)), [allCats, mode]);
  const qCat = sp?.get('category_id') || '';
  const category = tabs.find((c) => c.id === qCat) || null;
  const categoryId = category?.id || null;
  const edit: 'draft' | 'published' = sp?.get('edit') === 'published' ? 'published' : 'draft';
  const layoutId = zoneId ? `${zoneId}_${mode}_${categoryId || 'all'}` : null;

  // ---------- editor state ----------
  const [layout, setLayout] = useState<HomeLayout | null>(null);
  const [loading, setLoading] = useState(true);
  const [sections, setSections] = useState<Section[]>([]);
  const [header, setHeader] = useState<Header>(DEFAULT_HEADER);
  const [publishedJson, setPublishedJson] = useState('[]');
  const [selected, setSelected] = useState<string>('header');
  const [device, setDevice] = useState<Device>('mobile');
  const [addOpen, setAddOpen] = useState(false);
  const [addType, setAddType] = useState<SectionType | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupZone, setSetupZone] = useState('');
  const [setupMode, setSetupMode] = useState<Mode>(mode);
  const [copyFrom, setCopyFrom] = useState('');
  const [copyOptions, setCopyOptions] = useState<{ value: string; label: string; group: string }[]>([]);
  const [statuses, setStatuses] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [rev, setRev] = useState(0);
  const [catIcon, setCatIcon] = useState<string | null>(null);
  const [catIconDirty, setCatIconDirty] = useState(false);
  const [items, setItems] = useState<Record<string, PItem[]>>({});
  const [tick, setTick] = useState(0);

  const sectionsRef = useRef(sections); sectionsRef.current = sections;
  const headerRef = useRef(header); headerRef.current = header;
  const layoutRef = useRef(layout); layoutRef.current = layout;
  const catIconRef = useRef({ v: catIcon, dirty: catIconDirty }); catIconRef.current = { v: catIcon, dirty: catIconDirty };
  const savingRef = useRef(false);
  const queued = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef(new Set<string>());
  const serverDown = useRef(false);

  // ---------- load layout ----------
  const loadLayout = useCallback(async () => {
    if (!layoutId) { setLoading(false); return; }
    setLoading(true);
    try {
      const [draft, pub] = await Promise.all([fetchDoc<HomeLayout>(DRAFTS, layoutId), fetchDoc<HomeLayout>('home_layouts', layoutId)]);
      // legacy docs kept draft_sections on the public doc — use them until the first draft save
      const doc: HomeLayout | null = draft || pub ? {
        ...(pub ?? {}), ...(draft ?? {}), id: layoutId,
        draft_sections: draft?.draft_sections ?? pub?.draft_sections ?? pub?.published_sections ?? [],
        published_sections: pub?.published_sections ?? [], is_published: !!pub?.is_published, published_at: pub?.published_at,
        header: draft?.header ?? pub?.header,
      } as HomeLayout : null;
      setLayout(doc);
      const src = edit === 'published' ? doc?.published_sections : doc?.draft_sections;
      setSections(loadSections(src));
      setPublishedJson(JSON.stringify(payload(loadSections(doc?.published_sections))));
      setHeader({ ...DEFAULT_HEADER, ...(category?.header_color ? { bg_value: category.header_color } : {}), ...((edit === 'published' ? pub?.header : doc?.header) || {}) });
      setCatIcon(category?.icon || null); setCatIconDirty(false);
      setDirty(false); setSavedAt(null); setRev(0);
      setSelected('header');
    } catch (e: any) {
      toast(e?.message || 'Could not load the layout', 'error');
    }
    setLoading(false);
  }, [layoutId, edit, category?.id]);
  useEffect(() => { loadLayout(); }, [loadLayout]);

  const loadStatuses = useCallback(async () => {
    if (!zoneId) return;
    try {
      const list = await fetchList<HomeLayout>('home_layouts', where('zone_id', '==', zoneId), where('mode', '==', mode));
      setStatuses(Object.fromEntries(list.map((l) => [l.category_id || 'all', !!l.is_published])));
    } catch { /* ignore */ }
  }, [zoneId, mode]);
  useEffect(() => { loadStatuses(); }, [loadStatuses]);

  // copy-from options (other tabs of this zone/mode + other zones/modes)
  useEffect(() => {
    if (!zoneId) return;
    let alive = true;
    (async () => {
      try {
        const scope = isStore ? [where('zone_id', '==', zoneId)] : [];
        const [pubs, drafts] = await Promise.all([fetchList<HomeLayout>('home_layouts', ...scope), fetchList<HomeLayout>(DRAFTS, ...scope).catch(() => [] as HomeLayout[])]);
        const byId = new Map<string, HomeLayout>();
        [...pubs, ...drafts].forEach((l) => byId.set(l.id, l));
        const list = [...byId.values()];
        const zoneIds = new Set(zonesAvail.map((z) => z.id));
        const opts = list.filter((l) => l.id !== layoutId && zoneIds.has(l.zone_id)).map((l) => {
          const same = l.zone_id === zoneId && l.mode === mode;
          const cat = l.category_id ? allCats.find((c) => c.id === l.category_id) : null;
          const tab = l.category_id ? (cat ? tr(cat.name, uiLang) : 'Category') : 'All';
          const zn = zones.find((z) => z.id === l.zone_id)?.name || 'Zone';
          return { value: l.id, label: same ? tab : `${zn} · ${modeLabel(l.mode)} · ${tab}`, group: same ? 'This zone' : 'Other zones / modes' };
        }).sort((a, b) => (a.group === b.group ? a.label.localeCompare(b.label) : a.group === 'This zone' ? -1 : 1));
        if (alive) setCopyOptions(opts);
      } catch { if (alive) setCopyOptions([]); }
    })();
    return () => { alive = false; };
  }, [zoneId, mode, layoutId, isStore, zonesAvail.length, allCats.length]);

  // ---------- persistence ----------
  const save = useCallback(async (manual = false): Promise<boolean> => {
    if (!layoutId || !zoneId || !canUpdate) return false;
    if (timer.current) clearTimeout(timer.current);
    if (savingRef.current) { queued.current = true; return false; }
    savingRef.current = true; setSaving(true); setDirty(false);
    try {
      const h = headerRef.current;
      const data: Record<string, any> = {
        zone_id: zoneId, mode, category_id: categoryId,
        header: { bg_type: h.bg_type === 'image' ? 'image' : 'color', bg_value: h.bg_value || '', text_color: h.text_color || '#111827' },
        draft_sections: payload(sectionsRef.current),
      };
      if (isStore && storeId) data.store_id = storeId;
      const isNew = !layoutRef.current;
      await saveDoc(DRAFTS, layoutId, data);
      if (isNew) setLayout({ id: layoutId, ...(data as any), published_sections: [], is_published: false });
      else setLayout((l) => (l ? { ...l, draft_sections: data.draft_sections, header: data.header } : l));
      const ci = catIconRef.current;
      if (ci.dirty && categoryId && !isStore) {
        await patchDoc('categories', categoryId, { icon: ci.v || null });
        setCatIconDirty(false);
        invalidate('lookup', 'categories');
      }
      setSavedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      if (isNew) loadStatuses();
      if (manual) toast('Draft saved.');
      return true;
    } catch (e: any) {
      setDirty(true);
      toast(e?.message || 'Could not save the draft.', 'error');
      return false;
    } finally {
      savingRef.current = false; setSaving(false);
      if (queued.current) { queued.current = false; setTimeout(() => save(false), 0); }
    }
  }, [layoutId, zoneId, mode, categoryId, isStore, storeId, canUpdate]);

  // mark a user change → autosave after 1.5 s
  const changed = () => { setDirty(true); setRev((r) => r + 1); };
  useEffect(() => {
    if (!rev || !canUpdate) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => save(false), 1500);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [rev]);

  const updateSections = (fn: (s: Section[]) => Section[]) => { setSections((s) => fn(s)); changed(); };
  const updateHeader = (h: Header) => { setHeader(h); changed(); };

  // Ctrl+S + unsaved guard
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(true); } };
    const unload = (e: BeforeUnloadEvent) => { if (dirty || savingRef.current) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('keydown', key);
    window.addEventListener('beforeunload', unload);
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('beforeunload', unload); };
  }, [save, dirty]);

  useEffect(() => { const t = setInterval(() => setTick((x) => x + 1), 3000); return () => clearInterval(t); }, []);

  const go = async (q: { zone_id?: string; category_id?: string | null; edit?: string }, toMode: Mode = mode) => {
    if (dirty) await save(false);
    const qs = new URLSearchParams();
    const z = q.zone_id ?? zoneId; if (z) qs.set('zone_id', z);
    const c = q.category_id === undefined ? categoryId : q.category_id; if (c) qs.set('category_id', c);
    const e = q.edit ?? edit; if (e === 'published') qs.set('edit', e);
    router.push(`${p(`/home-builder/${toMode}`)}${qs.toString() ? `?${qs}` : ''}`);
  };

  const publish = async () => {
    if (!layoutId) return;
    if (!(await confirm({ title: 'Publish this layout?', message: 'It will go live in the app immediately.', confirmText: 'Publish' }))) return;
    setPublishing(true);
    try {
      const ok = await save(false);
      if (!ok && !layoutRef.current) throw new Error('Could not save the draft before publishing.');
      await publishHomeLayout({ layout_id: layoutId });
      const doc = await fetchDoc<HomeLayout>('home_layouts', layoutId);
      if (doc) {
        setLayout((l) => ({ ...(l ?? doc), published_sections: doc.published_sections, is_published: doc.is_published, published_at: doc.published_at }));
        setPublishedJson(JSON.stringify(payload(loadSections(doc.published_sections))));
      }
      setDirty(false);
      loadStatuses();
      toast('Layout published successfully.');
    } catch (e: any) { toast(e?.message || 'Publish failed.', 'error'); }
    setPublishing(false);
  };

  const discard = async () => {
    if (!layoutId || !layout) return;
    if (!(await confirm({ title: 'Discard draft?', message: 'Discard all draft changes and reset to the published layout?', danger: true, confirmText: 'Discard' }))) return;
    try {
      if (timer.current) clearTimeout(timer.current);
      const pub = await fetchDoc<HomeLayout>('home_layouts', layoutId);
      await saveDoc(DRAFTS, layoutId, { zone_id: zoneId, mode, category_id: categoryId, draft_sections: pub?.published_sections ?? layout.published_sections ?? [], ...(pub?.header ? { header: pub.header } : {}), ...(isStore && storeId ? { store_id: storeId } : {}) });
      toast('Draft discarded.');
      await loadLayout();
    } catch (e: any) { toast(e?.message || 'Could not discard', 'error'); }
  };

  const copyLayout = async () => {
    if (!copyFrom) return;
    if (!(await confirm({ title: 'Copy layout?', message: 'Replace the current draft sections and header with the selected layout?' }))) return;
    try {
      const src = (await fetchDoc<HomeLayout>(DRAFTS, copyFrom).catch(() => null)) || (await fetchDoc<HomeLayout>('home_layouts', copyFrom));
      if (!src) { toast('Nothing to copy from the selected layout.', 'error'); return; }
      const secs = loadSections(src.draft_sections?.length ? src.draft_sections : src.published_sections).map((s) => ({ ...s, id: rid() }));
      setSections(secs);
      if (src.header) setHeader({ ...DEFAULT_HEADER, ...src.header });
      changed();
      setCopyFrom('');
      toast('Layout copied into the draft.');
    } catch (e: any) { toast(e?.message || 'Could not copy layout', 'error'); }
  };

  // ---------- sections ----------
  const addSection = () => {
    if (!addType) return;
    const s = newSection(addType);
    updateSections((list) => [...list, s]);
    setSelected(s.id); setAddOpen(false); setAddType(null);
  };
  const removeSection = async (s: Section) => {
    if (!(await confirm({ title: 'Delete section?', message: `Delete "${sectionLabel(s, sections, uiLang)}"?`, danger: true }))) return;
    updateSections((list) => list.filter((x) => x.id !== s.id));
    if (selected === s.id) setSelected('header');
  };
  const duplicate = (s: Section) => {
    const c: Section = { ...clone(s), id: rid() };
    updateSections((list) => { const i = list.findIndex((x) => x.id === s.id); const n = [...list]; n.splice(i + 1, 0, c); return n; });
    setSelected(c.id);
  };

  // ---------- preview hydration ----------
  useEffect(() => { setItems({}); pending.current.clear(); }, [zoneId, mode]);
  useEffect(() => {
    if (!zoneId) return;
    const t = setTimeout(() => {
      const todo = sections.filter((s) => s.is_active && s.type !== 'heading_text' && !(itemsKey(s) in items) && !pending.current.has(itemsKey(s)));
      if (!todo.length) return;
      const keys = todo.map(itemsKey);
      keys.forEach((k) => pending.current.add(k));
      const fallback = async (s: Section) => { try { return await clientItems(s, { mode, lang: uiLang, categories: allCats, brands }); } catch { return []; } };
      (async () => {
        // one callable round-trip for all sections that need items (not one per section)
        let byId: Record<string, PItem[]> | null = null;
        if (!serverDown.current) {
          try { byId = await serverItemsBatch(zoneId, mode, todo, uiLang); } catch { serverDown.current = true; }
        }
        const res = await Promise.all(todo.map(async (s) => (byId ? byId[s.id] ?? [] : await fallback(s))));
        setItems((m) => { const n = { ...m }; todo.forEach((s, i) => { n[keys[i]] = res[i]; }); return n; });
        keys.forEach((k) => pending.current.delete(k));
      })();
    }, 400);
    return () => clearTimeout(t);
  }, [sections, zoneId, mode, items, allCats.length, brands.length]);

  const iconRow = useMemo(() => {
    const list = category ? allCats.filter((c) => c.parent_id === category.id && isActive(c.status)).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)) : tabs;
    return list.slice(0, 12).map((c) => ({ id: c.id, name: tr(c.name, uiLang), image: imgUrl(c.icon || c.image, tr(c.name, uiLang)) }));
  }, [category, allCats, tabs, uiLang]);

  const hasChanges = useMemo(() => JSON.stringify(payload(sections)) !== publishedJson, [sections, publishedJson]);

  // ---------- render ----------
  if (!canList) return <Forbidden />;
  if (zonesLoading || (isStore && storeLoading)) return <Loading />;
  if (!zone) {
    return (
      <div>
        <div className="mb-5"><h1 className="page-title">Home Builder</h1><p className="text-sm text-primary font-medium mt-0.5">Design the app home screen for each zone</p></div>
        <div className="card p-10 text-center">
          <div className="mx-auto w-14 h-14 rounded-full bg-primary-50 text-primary flex items-center justify-center mb-3"><MapPin className="w-6 h-6" /></div>
          <h3 className="font-bold text-navy dark:text-white">No zone available</h3>
          <p className="text-sm text-muted mt-1">{isStore ? 'Your store is not linked to a delivery zone yet. Please contact the administrator.' : 'Create a delivery zone first, then design its home layout here.'}</p>
          {!isStore && <Link href={p('/zones/new')} className="btn-primary mt-4 inline-flex"><Plus className="w-4 h-4" /> Add Zone</Link>}
        </div>
      </div>
    );
  }

  const selSection = sections.find((s) => s.id === selected) || null;
  const published = !!layout?.is_published;
  const statusText = saving ? 'Saving…' : dirty ? 'Unsaved changes' : savedAt ? `Draft saved ${savedAt}` : '';

  return (
    <div className="space-y-4">
      {/* ============ Top bar ============ */}
      <div className="card px-4 py-3 flex flex-wrap items-center gap-3">
        <Link href={p('/dashboard')} className="icon-btn" title="Back"><ArrowLeft className="w-4 h-4" /></Link>
        {zonesAvail.length > 1 ? (
          <select value={zoneId} onChange={(e) => go({ zone_id: e.target.value, category_id: null })} className="input !py-1.5 !w-56 font-semibold text-navy" data-testid="zone-select">
            {zonesAvail.map((z) => <option key={z.id} value={z.id}>{z.name} {modeLabel(mode)} Zone</option>)}
          </select>
        ) : <div className="font-bold text-navy dark:text-white">{zone.name} {modeLabel(mode)} Zone</div>}
        <span className={cx('pill', published ? 'bg-primary-50 text-primary' : 'bg-amber-100 text-amber-700')}>{published ? 'Published' : 'Draft'}</span>
        {published && hasChanges && <span className="text-xs text-amber-600 font-medium">Unpublished changes</span>}
        {published && layout?.published_at && <span className="text-xs text-muted hidden lg:inline">Published {fmtDateTime(layout.published_at)}</span>}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted hidden md:inline">{statusText}</span>
          <div className="inline-flex rounded-lg border border-line overflow-hidden text-sm font-semibold dark:border-dark-line">
            {(['draft', 'published'] as const).map((e, i) => (
              <button key={e} type="button" onClick={() => edit !== e && go({ edit: e })}
                className={cx('px-3 py-1.5', i > 0 && 'border-l border-line dark:border-dark-line', edit === e ? 'bg-navy text-white' : 'bg-white text-bodytext hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-200')}>
                {e === 'draft' ? 'Edit Draft' : 'Edit Published'}
              </button>
            ))}
          </div>
          <button type="button" className="btn-outline btn-sm" onClick={() => { setSetupZone(zoneId); setSetupMode(mode); setSetupOpen(true); }}><Settings2 className="w-4 h-4" /> Edit setup</button>
          {canUpdate && published && <button type="button" className="btn-outline btn-sm" onClick={discard} title="Reset draft to the published layout"><Undo2 className="w-4 h-4" /> Discard</button>}
          {canUpdate && <button type="button" className="btn-soft btn-sm" onClick={() => save(true)} disabled={saving} data-testid="save-draft"><Save className="w-4 h-4" /> Save Draft</button>}
          {canUpdate && <button type="button" className="btn-primary btn-sm" onClick={publish} disabled={publishing} data-testid="publish"><Rocket className="w-4 h-4" /> {publishing ? 'Publishing…' : 'Publish Changes'}</button>}
        </div>
      </div>

      {/* ============ Category tabs ============ */}
      <div className="card px-4 py-3 flex flex-wrap items-center gap-2">
        {[{ id: null as string | null, name: 'All' }, ...tabs.map((c) => ({ id: c.id as string | null, name: tr(c.name, uiLang) }))].map((t) => {
          const pub = !!statuses[t.id || 'all'];
          return (
            <button key={t.id || 'all'} type="button" className={cx('chip', categoryId === t.id && 'chip-active')} onClick={() => categoryId !== t.id && go({ category_id: t.id })}>
              {t.name}
              <span className={cx('text-[10px] font-semibold px-1.5 rounded-full', pub ? 'bg-primary-50 text-primary' : 'bg-slate-100 text-slate-500')}>{pub ? 'PUBLISHED' : 'DRAFT'}</span>
            </button>
          );
        })}
        {!isStore && (
          <div className="ml-auto flex gap-2">
            <Link href={p('/categories/order')} className="btn-outline btn-sm"><ArrowUpDown className="w-4 h-4" /> Reorder</Link>
            <Link href={p('/categories/new')} className="btn-primary btn-sm"><Plus className="w-4 h-4" /> Add Category</Link>
          </div>
        )}
      </div>

      {loading ? <Loading /> : (
        <div className="grid gap-4 lg:grid-cols-[290px_minmax(0,1fr)] xl:grid-cols-[290px_minmax(0,1fr)_360px] items-start">
          {/* LEFT: sections list */}
          <div className="card p-4 space-y-3 xl:sticky xl:top-4">
            <div className={cx('flex gap-2 rounded-lg p-3 text-xs leading-relaxed border', edit === 'published' ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-sky-50 text-sky-800 border-sky-200')}>
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              {edit === 'published'
                ? <span>Editing the live (published) layout. Changes are saved as a draft — click <b>Publish Changes</b> to update it live. Switch to Edit Draft to work on the draft.</span>
                : <span>You are editing the draft. Changes are auto-saved and go live only after you click <b>Publish Changes</b>.</span>}
            </div>
            <button type="button" onClick={() => setSelected('header')}
              className={cx('w-full flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-semibold transition',
                selected === 'header' ? 'border-primary bg-primary-50 text-primary' : 'border-line text-navy hover:bg-slate-50 dark:border-dark-line dark:text-white dark:hover:bg-slate-800')}>
              <PanelTop className="w-4 h-4" /> Header Settings
            </button>
            <div className="flex items-center justify-between pt-1">
              <h3 className="font-bold text-navy dark:text-white">Sections</h3>
              {canUpdate && <button type="button" className="btn-primary btn-sm" onClick={() => { setAddType(null); setAddOpen(true); }} data-testid="add-section"><Plus className="w-4 h-4" /> Add</button>}
            </div>
            <SortableList items={sections} onReorder={(n) => { setSections(n); changed(); }} render={(s, handle) => {
              const Icon = SECTION_ICONS[s.type];
              return (
                <div onClick={() => setSelected(s.id)} data-testid="section-row"
                  className={cx('flex items-center gap-2 rounded-lg border px-2 py-2 cursor-pointer bg-white dark:bg-slate-800 transition',
                    selected === s.id ? 'border-primary ring-2 ring-primary/15' : 'border-line hover:border-primary/40 dark:border-dark-line')}>
                  <span {...handle} onClick={(e) => e.stopPropagation()} className="cursor-grab text-slate-400 hover:text-navy touch-none" title="Drag to reorder"><GripVertical className="w-4 h-4" /></span>
                  <span className="w-7 h-7 rounded-md bg-primary-50 text-primary flex items-center justify-center shrink-0"><Icon className="w-3.5 h-3.5" /></span>
                  <span className={cx('flex-1 min-w-0 text-sm font-medium truncate', s.is_active ? 'text-navy dark:text-white' : 'text-slate-400 line-through')}>{sectionLabel(s, sections, uiLang)}</span>
                  <span onClick={(e) => e.stopPropagation()}>
                    <Toggle checked={s.is_active} disabled={!canUpdate} onChange={(v) => updateSections((list) => list.map((x) => (x.id === s.id ? { ...x, is_active: v } : x)))} />
                  </span>
                  {canUpdate && <button type="button" className="text-slate-400 hover:text-primary p-0.5" onClick={(e) => { e.stopPropagation(); duplicate(s); }} title="Duplicate"><Copy className="w-3.5 h-3.5" /></button>}
                  {canUpdate && <button type="button" className="text-red-400 hover:text-red-600 p-0.5" onClick={(e) => { e.stopPropagation(); removeSection(s); }} title="Delete"><Trash2 className="w-4 h-4" /></button>}
                </div>
              );
            }} />
            {!sections.length && (
              <div className="text-center text-sm text-muted py-6 border border-dashed border-line rounded-lg dark:border-dark-line">
                No sections yet.<br />
                {canUpdate && <button type="button" className="text-primary font-semibold mt-1" onClick={() => setAddOpen(true)}>+ Add your first section</button>}
              </div>
            )}
          </div>

          {/* CENTER: live preview */}
          <div className="card p-4">
            <div className="flex items-center justify-center gap-1 mb-4">
              {([['mobile', Smartphone], ['tablet', Tablet], ['desktop', Monitor]] as const).map(([d, Ic]) => (
                <button key={d} type="button" className={cx('icon-btn', device === d && '!bg-primary-50 !text-primary !border-primary')} onClick={() => setDevice(d)} title={d}><Ic className="w-4 h-4" /></button>
              ))}
            </div>
            <PhonePreview sections={sections} header={header} selected={selected} onSelect={setSelected} items={items} device={device} mode={mode}
              zoneName={zone.name} deliveryMinutes={Number(zone.delivery_time_minutes) || 0} iconRow={iconRow} lang={uiLang} tick={tick} />
            <p className="text-center text-xs text-muted mt-3">Preview is approximate · click a section to edit it</p>
          </div>

          {/* RIGHT: settings */}
          <div className={cx('card p-4 lg:col-span-2 xl:col-span-1 xl:sticky xl:top-4', !canUpdate && 'pointer-events-none opacity-80')}>
            {selected === 'header' ? (
              <HeaderSettings header={header} onChange={updateHeader} tabName={category ? tr(category.name, uiLang) : 'All'}
                copyOptions={copyOptions} copyFrom={copyFrom} setCopyFrom={setCopyFrom} onCopy={copyLayout}
                categoryIcon={catIcon} onCategoryIcon={category && !isStore ? (v) => { setCatIcon(v); setCatIconDirty(true); changed(); } : null} />
            ) : selSection ? (
              <SectionSettings key={selSection.id} section={selSection} all={sections} zoneId={zoneId} mode={mode} lang={uiLang} isStore={isStore}
                onChange={(n) => updateSections((list) => list.map((x) => (x.id === n.id ? n : x)))} onDelete={() => removeSection(selSection)} />
            ) : <NothingSelected />}
          </div>
        </div>
      )}

      {/* Add Section modal */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add Section" size="md"
        footer={<>
          <button type="button" className="btn-gray btn-sm" onClick={() => setAddOpen(false)}>Cancel</button>
          <button type="button" className="btn-primary btn-sm" disabled={!addType} onClick={addSection} data-testid="add-section-ok">OK</button>
        </>}>
        <div className="p-5 grid grid-cols-3 gap-3">
          {TYPE_KEYS.map((t) => {
            const Ic = SECTION_ICONS[t];
            return (
              <button key={t} type="button" onClick={() => setAddType(t)} onDoubleClick={() => { setAddType(t); const s = newSection(t); updateSections((l) => [...l, s]); setSelected(s.id); setAddOpen(false); }}
                className={cx('flex flex-col items-center justify-center gap-2 rounded-xl border px-2 py-4 text-xs font-semibold transition',
                  addType === t ? 'border-primary bg-primary-50 text-primary ring-2 ring-primary/20' : 'border-line text-navy hover:border-primary/50 dark:border-dark-line dark:text-slate-200')}>
                <Ic className="w-5 h-5" />
                {t === 'heading_text' ? 'Heading / Text' : SECTION_TYPES[t]}
              </button>
            );
          })}
        </div>
      </Modal>

      {/* Edit setup modal */}
      <Modal open={setupOpen} onClose={() => setSetupOpen(false)} title="Layout Setup" size="md"
        footer={<>
          <button type="button" className="btn-gray btn-sm" onClick={() => setSetupOpen(false)}>Cancel</button>
          <button type="button" className="btn-primary btn-sm" onClick={() => { setSetupOpen(false); go({ zone_id: setupZone || zoneId, category_id: null, edit: 'draft' }, setupMode); }}>Open Layout</button>
        </>}>
        <div className="p-5 space-y-4">
          <div>
            <label className="label">Zone</label>
            <select className="input" value={setupZone} onChange={(e) => setSetupZone(e.target.value)} disabled={isStore}>
              {zonesAvail.map((z) => <option key={z.id} value={z.id}>{z.name}{z.city ? ` · ${z.city}` : ''}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Mode</label>
            <div className="grid grid-cols-2 gap-2">
              {([['quick', Zap, 'Quick Commerce'], ['ecommerce', ShoppingBag, 'eCommerce']] as const).map(([m, Ic, l]) => (
                <label key={m} className={cx('flex items-center gap-2 rounded-lg border px-3 py-2.5 cursor-pointer', setupMode === m ? 'border-primary bg-primary-50' : 'border-line dark:border-dark-line')}>
                  <input type="radio" name="hb-mode" className="text-primary focus:ring-primary" checked={setupMode === m} onChange={() => setSetupMode(m)} />
                  <Ic className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold text-navy dark:text-white">{l}</span>
                </label>
              ))}
            </div>
          </div>
          <p className="text-[11px] text-muted">Each zone has separate Quick and eCommerce home layouts, with one layout per category tab.</p>
        </div>
      </Modal>
    </div>
  );
}
