'use client';
// Form fields ported from components/form/*.blade.php. All are forwardRef so they work with react-hook-form `register()`
// and also as plain controlled inputs.
import { forwardRef, useRef, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { ImagePlus, Loader2, X, Search } from 'lucide-react';
import { cx } from '@/components/ui';
import { uploadFile, MAX_IMAGE_BYTES } from '@/lib/storage';
import { imgUrl } from '@/lib/format';
import { useToast } from '@/components/ui/toast';

export function Field({ label, required, hint, error, children, className = '' }: { label?: ReactNode; required?: boolean; hint?: ReactNode; error?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      {label && <label className="label">{label}{required && <span className="text-red-500"> *</span>}</label>}
      {children}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { label?: ReactNode; hint?: ReactNode; error?: ReactNode; icon?: ReactNode; prefix?: string; wrapClass?: string };
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ label, hint, error, icon, prefix, wrapClass = '', className = '', required, ...rest }, ref) {
  return (
    <Field label={label} required={required} hint={hint} error={error} className={wrapClass}>
      <div className="relative">
        {icon && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 [&>svg]:w-4 [&>svg]:h-4">{icon}</span>}
        {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">{prefix}</span>}
        <input ref={ref} required={required} {...rest} className={cx('input', (icon || prefix) && 'pl-9', error && 'border-red-400', className)} />
      </div>
    </Field>
  );
});

type Opt = { value: string | number; label: ReactNode } | string;
type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { label?: ReactNode; hint?: ReactNode; error?: ReactNode; options: Opt[]; placeholder?: string; wrapClass?: string };
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ label, hint, error, options, placeholder, wrapClass = '', className = '', required, multiple, ...rest }, ref) {
  return (
    <Field label={label} required={required} hint={hint} error={error} className={wrapClass}>
      <select ref={ref} required={required} multiple={multiple} {...rest} className={cx('input', multiple && 'min-h-[110px]', error && 'border-red-400', className)}>
        {placeholder !== undefined && !multiple && <option value="">{placeholder}</option>}
        {options.map((o) => typeof o === 'string'
          ? <option key={o} value={o}>{o}</option>
          : <option key={String(o.value)} value={o.value}>{o.label as any}</option>)}
      </select>
    </Field>
  );
});

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: ReactNode; hint?: ReactNode; error?: ReactNode; wrapClass?: string };
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea({ label, hint, error, wrapClass = '', className = '', required, rows = 3, ...rest }, ref) {
  return (
    <Field label={label} required={required} hint={hint} error={error} className={wrapClass}>
      <textarea ref={ref} rows={rows} required={required} {...rest} className={cx('input', error && 'border-red-400', className)} />
    </Field>
  );
});

/** Single image upload → Cloud Storage; value = download URL. Same look as components/image-upload.blade.php. */
export function ImageUpload({ value, onChange, folder = 'catalog/misc', label, hint = 'PNG, JPG or WEBP up to 5MB', square = true, accept = 'image/*', className = '' }: {
  value?: string | null; onChange: (url: string) => void; folder?: string; label?: ReactNode; hint?: ReactNode; square?: boolean; accept?: string; className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const inp = useRef<HTMLInputElement>(null);
  const pick = async (f?: File) => {
    if (!f) return;
    if (f.size > MAX_IMAGE_BYTES) { toast('File is larger than 5 MB', 'error'); return; }
    setBusy(true);
    try { const { url } = await uploadFile(f, folder); onChange(url); } catch (e: any) { toast(e?.message || 'Upload failed', 'error'); }
    setBusy(false);
    if (inp.current) inp.current.value = '';
  };
  return (
    <div className={className}>
      {label && <span className="label">{label}</span>}
      <label className="flex items-center gap-4 rounded-xl border-2 border-dashed border-line p-3 cursor-pointer hover:border-primary/50 dark:border-dark-line">
        <span className={cx(square ? 'w-20 h-20' : 'w-36 h-20', 'relative shrink-0 rounded-lg bg-slate-50 dark:bg-slate-800 overflow-hidden flex items-center justify-center')}>
          {busy ? <Loader2 className="w-6 h-6 animate-spin text-primary" /> : value ? <img src={imgUrl(value)} alt="" className="w-full h-full object-cover" /> : <ImagePlus className="w-7 h-7 text-slate-300" />}
        </span>
        <span className="text-sm flex-1">
          <span className="font-semibold text-primary">Click to upload</span>
          <span className="block text-xs text-muted">{hint}</span>
        </span>
        {value && !busy && <button type="button" title="Remove" className="text-red-400 hover:text-red-600" onClick={(e) => { e.preventDefault(); onChange(''); }}><X className="w-4 h-4" /></button>}
        <input ref={inp} type="file" accept={accept} className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
      </label>
    </div>
  );
}

/** Multiple images (gallery) — value = array of URLs, first = thumbnail. */
export function MultiImageUpload({ value, onChange, folder = 'catalog/products', label, max = 10 }: { value: string[]; onChange: (v: string[]) => void; folder?: string; label?: ReactNode; max?: number }) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    const urls: string[] = [];
    for (const f of Array.from(files).slice(0, max - value.length)) {
      if (f.size > MAX_IMAGE_BYTES) { toast(`${f.name} is larger than 5 MB`, 'error'); continue; }
      try { urls.push((await uploadFile(f, folder)).url); } catch (e: any) { toast(e?.message || 'Upload failed', 'error'); }
    }
    onChange([...value, ...urls]);
    setBusy(false);
  };
  return (
    <div>
      {label && <span className="label">{label}</span>}
      <div className="flex flex-wrap gap-3">
        {value.map((u, i) => (
          <div key={u + i} className="relative w-24 h-24 rounded-lg overflow-hidden border border-line dark:border-dark-line group">
            <img src={imgUrl(u)} alt="" className="w-full h-full object-cover" />
            {i === 0 && <span className="absolute left-1 top-1 pill bg-primary text-white !text-[10px]">Main</span>}
            <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/50 px-1 py-0.5 opacity-0 group-hover:opacity-100">
              <button type="button" className="text-white text-[10px]" onClick={() => { const c = [...value]; const [x] = c.splice(i, 1); c.unshift(x); onChange(c); }}>Main</button>
              <button type="button" className="text-white" onClick={() => onChange(value.filter((_, j) => j !== i))}><X className="w-3.5 h-3.5" /></button>
            </div>
          </div>
        ))}
        {value.length < max && (
          <label className="w-24 h-24 rounded-lg border-2 border-dashed border-line flex flex-col items-center justify-center gap-1 text-xs text-muted cursor-pointer hover:border-primary/50 dark:border-dark-line">
            {busy ? <Loader2 className="w-5 h-5 animate-spin text-primary" /> : <ImagePlus className="w-6 h-6 text-slate-300" />}
            Add images
            <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
          </label>
        )}
      </div>
    </div>
  );
}

/** Search input used in filter bars. */
export function SearchBox({ value, onChange, placeholder = 'Search', className = 'w-56' }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <label className="relative">
      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={cx('input !py-2 !pl-9', className)} />
    </label>
  );
}

/** Multi-select as checkable chips. */
export function ChipSelect({ options, value, onChange }: { options: { value: string; label: ReactNode }[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value.includes(o.value);
        return <button type="button" key={o.value} className={cx('chip', on && 'chip-active')} onClick={() => onChange(on ? value.filter((v) => v !== o.value) : [...value, o.value])}>{o.label}</button>;
      })}
    </div>
  );
}
