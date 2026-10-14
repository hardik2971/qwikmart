'use client';
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal } from './Modal';

export interface ConfirmOpts {
  title?: string; message?: ReactNode; confirmText?: string; cancelText?: string; danger?: boolean;
  input?: { label?: string; placeholder?: string; required?: boolean; multiline?: boolean; defaultValue?: string; type?: string };
}
interface Api { confirm: (o?: ConfirmOpts) => Promise<boolean>; prompt: (o: ConfirmOpts) => Promise<string | null> }
const Ctx = createContext<Api>({ confirm: async () => false, prompt: async () => null });

/**
 * const { confirm, prompt } = useConfirm();
 * if (await confirm({ title: 'Delete brand?', danger: true })) …
 * const remark = await prompt({ title: 'Reject', input: { label: 'Remark', required: true, multiline: true } }); // null when cancelled
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOpts | null>(null);
  const [val, setVal] = useState('');
  const resolver = useRef<(v: any) => void>(() => {});
  const isPrompt = useRef(false);

  const confirm = useCallback((o: ConfirmOpts = {}) => new Promise<boolean>((res) => { isPrompt.current = false; resolver.current = res; setVal(''); setOpts(o); }), []);
  const prompt = useCallback((o: ConfirmOpts) => new Promise<string | null>((res) => { isPrompt.current = true; resolver.current = res; setVal(o.input?.defaultValue ?? ''); setOpts({ ...o, input: o.input || {} }); }), []);
  const close = (ok: boolean) => {
    if (ok && opts?.input?.required && !val.trim()) return;
    resolver.current(isPrompt.current ? (ok ? val : null) : ok);
    setOpts(null);
  };
  return (
    <Ctx.Provider value={{ confirm, prompt }}>
      {children}
      <Modal open={!!opts} onClose={() => close(false)} size="md">
        {opts && (
          <div className="p-6">
            <div className="flex gap-4">
              <span className={`w-11 h-11 shrink-0 rounded-full flex items-center justify-center ${opts.danger ? 'bg-red-50 text-red-500' : 'bg-primary-50 text-primary'}`}><AlertTriangle className="w-5 h-5" /></span>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-navy dark:text-white text-base">{opts.title || 'Are you sure?'}</h3>
                {opts.message && <div className="mt-1 text-sm text-muted">{opts.message}</div>}
                {opts.input && (
                  <div className="mt-4">
                    {opts.input.label && <label className="label">{opts.input.label}{opts.input.required && <span className="text-red-500"> *</span>}</label>}
                    {opts.input.multiline
                      ? <textarea autoFocus rows={3} className="input" placeholder={opts.input.placeholder} value={val} onChange={(e) => setVal(e.target.value)} />
                      : <input autoFocus type={opts.input.type || 'text'} className="input" placeholder={opts.input.placeholder} value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') close(true); }} />}
                  </div>
                )}
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className="btn-outline" onClick={() => close(false)}>{opts.cancelText || 'Cancel'}</button>
              <button type="button" data-testid="confirm-ok" className={opts.danger ? 'btn-danger' : 'btn-primary'} onClick={() => close(true)}>{opts.confirmText || (opts.danger ? 'Delete' : 'Confirm')}</button>
            </div>
          </div>
        )}
      </Modal>
    </Ctx.Provider>
  );
}
export const useConfirm = () => useContext(Ctx);
