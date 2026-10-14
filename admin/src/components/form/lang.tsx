'use client';
// Language tabs for translatable {en, ar, hi} fields — port of components/lang-tabs + trans-input.
// <LangTabs translate title="Basic Information">
//   <TransInput label="Name" value={name} onChange={setName} required />
//   <TransInput label="Description" type="editor" value={desc} onChange={setDesc} />
// </LangTabs>
import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Languages } from 'lucide-react';
import { usePanel } from '@/lib/panel';
import { translateFields } from '@/lib/callables';
import { useToast } from '@/components/ui/toast';
import { cx } from '@/components/ui';
import type { Trans } from '@/lib/types';
import { RichEditor } from './RichEditor';

interface Reg { value: Trans; onChange: (v: Trans) => void; html?: boolean }
interface LangCtx { lang: string; register: (id: string, r: Reg | null) => void }
const Ctx = createContext<LangCtx | null>(null);

export function LangTabs({ children, translate = false, title, className = '' }: { children: ReactNode; translate?: boolean; title?: ReactNode; className?: string }) {
  const { languages } = usePanel();
  const [lang, setLang] = useState(languages[0]?.code || 'en');
  const [busy, setBusy] = useState(false);
  const regs = useRef(new Map<string, Reg>());
  const toast = useToast();

  const translateAll = async () => {
    const src = languages[0]?.code || 'en';
    const to = languages.map((l) => l.code).filter((c) => c !== src);
    const fields: Record<string, string> = {};
    regs.current.forEach((r, id) => { const v = r.value?.[src]; if (v) fields[id] = v; });
    if (!Object.keys(fields).length) { toast('Fill the default language first', 'warning'); return; }
    setBusy(true);
    try {
      const res: any = await translateFields({ fields, from: src, to });
      const data = res?.translations || res?.data || res;
      regs.current.forEach((r, id) => {
        if (!fields[id]) return;
        const next: Trans = { ...r.value };
        for (const code of to) {
          const v = data?.[code]?.[id] ?? data?.[id]?.[code];
          if (typeof v === 'string') next[code] = v;
        }
        r.onChange(next);
      });
      toast('Translated into all languages');
    } catch (e: any) { toast(e?.message || 'Translation failed', 'error'); }
    setBusy(false);
  };

  return (
    <Ctx.Provider value={{ lang, register: (id, r) => { if (r) regs.current.set(id, r); else regs.current.delete(id); } }}>
      <div className={className}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line dark:border-dark-line mb-4">
          <div className="flex items-center">
            {title && <span className="font-bold text-navy dark:text-white mr-4">{title}</span>}
            {languages.map((l) => (
              <button key={l.code} type="button" className={cx('tab', lang === l.code && 'tab-active')} onClick={() => setLang(l.code)}>{l.name}</button>
            ))}
          </div>
          {translate && (
            <button type="button" className="btn-soft btn-sm mb-1.5" onClick={translateAll} disabled={busy}>
              <Languages className="w-3.5 h-3.5" />{busy ? 'Translating…' : 'Translate'}
            </button>
          )}
        </div>
        <div className="space-y-4">{children}</div>
      </div>
    </Ctx.Provider>
  );
}

export function useLangTab() { return useContext(Ctx)?.lang || 'en'; }

export function TransInput({ label, value, onChange, type = 'input', required, rows = 3, placeholder, error, className = '' }: {
  label?: ReactNode; value: Trans | undefined | null; onChange: (v: Trans) => void; type?: 'input' | 'textarea' | 'editor'; required?: boolean; rows?: number; placeholder?: string; error?: ReactNode; className?: string;
}) {
  const ctx = useContext(Ctx);
  const { languages } = usePanel();
  const id = useId();
  const v = value || {};
  // keep registration fresh so "Translate" reads the latest value
  useEffect(() => { ctx?.register(id, { value: v, onChange, html: type === 'editor' }); });
  useEffect(() => () => ctx?.register(id, null), []);
  const lang = ctx?.lang || 'en';
  const l = languages.find((x) => x.code === lang) || { code: lang, name: lang, rtl: false };
  const isFirst = languages[0]?.code === lang;
  const set = (s: string) => onChange({ ...v, [lang]: s });
  return (
    <div className={className}>
      {label && <label className="label">{label} <span className="text-muted font-normal">({l.name})</span>{required && isFirst && <span className="text-red-500"> *</span>}</label>}
      {type === 'textarea'
        ? <textarea rows={rows} dir={l.rtl ? 'rtl' : 'ltr'} placeholder={placeholder} className="input" value={v[lang] || ''} onChange={(e) => set(e.target.value)} required={required && isFirst} data-lang={lang} />
        : type === 'editor'
          ? <RichEditor key={lang} value={v[lang] || ''} onChange={set} rtl={l.rtl} />
          : <input type="text" dir={l.rtl ? 'rtl' : 'ltr'} placeholder={placeholder} className="input" value={v[lang] || ''} onChange={(e) => set(e.target.value)} required={required && isFirst} data-lang={lang} />}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}
