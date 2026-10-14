'use client';
// Media Library — port of admin/media/index.blade.php, backed by Cloud Storage `catalog/**` (list/listAll, upload, copy URL, delete).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { deleteObject, getDownloadURL, getMetadata, list, listAll, ref as sref, type StorageReference } from 'firebase/storage';
import { CloudUpload, Copy, File as FileIcon, Folder, ImageOff, RefreshCw, Trash2, Upload } from 'lucide-react';
import { storage } from '@/lib/firebase';
import { uploadFile } from '@/lib/storage';
import { errMsg, fmtDate } from '@/lib/format';
import { usePanel } from '@/lib/panel';
import { Forbidden, PageHeader, Spinner, cx } from '@/components/ui';
import { SearchBox } from '@/components/form/fields';
import { useConfirm } from '@/components/ui/confirm';
import { useToast } from '@/components/ui/toast';

interface MediaFile { path: string; name: string; folder: string; url: string; size: number; updated: string; contentType: string }
const ROOT = 'catalog';
const PAGE = 48;
const MAX = 10 * 1024 * 1024;
const fmtSize = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : b >= 1024 ? `${Math.round(b / 1024)} KB` : `${b} B`);
const isImage = (f: MediaFile) => f.contentType.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|avif)$/i.test(f.name);

async function hydrate(items: StorageReference[]): Promise<MediaFile[]> {
  return Promise.all(items.map(async (r) => {
    const [url, meta] = await Promise.all([getDownloadURL(r).catch(() => ''), getMetadata(r).catch(() => null)]);
    return {
      path: r.fullPath, name: r.name, folder: r.parent?.fullPath.replace(`${ROOT}/`, '') || ROOT, url,
      size: Number(meta?.size || 0), updated: meta?.updated || '', contentType: meta?.contentType || '',
    };
  }));
}

export default function MediaPage() {
  const { isStore } = usePanel();
  const toast = useToast();
  const { confirm } = useConfirm();
  const [folders, setFolders] = useState<string[]>([]);
  const [folder, setFolder] = useState('');
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [token, setToken] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(0);
  const [over, setOver] = useState(false);
  const [q, setQ] = useState('');
  const [tick, setTick] = useState(0);

  // folders under catalog/
  useEffect(() => {
    listAll(sref(storage(), ROOT)).then((r) => setFolders(r.prefixes.map((p) => p.name))).catch(() => setFolders([]));
  }, [tick]);

  const load = useCallback(async (more = false) => {
    setLoading(true);
    try {
      if (folder) {
        const res = await list(sref(storage(), `${ROOT}/${folder}`), { maxResults: PAGE, pageToken: more ? token : undefined });
        const hyd = await hydrate(res.items);
        setFiles((s) => (more ? [...s, ...hyd] : hyd));
        setToken(res.nextPageToken);
      } else {
        // "All": root files + first page of each folder
        const root = await listAll(sref(storage(), ROOT));
        const pages = await Promise.all(root.prefixes.map((p) => list(p, { maxResults: PAGE }).catch(() => null)));
        const items = [...root.items, ...pages.flatMap((p) => p?.items ?? [])];
        setFiles(await hydrate(items));
        setToken(undefined);
      }
    } catch (e) { toast(errMsg(e), 'error'); setFiles([]); }
    setLoading(false);
  }, [folder, token]);

  useEffect(() => { load(false); }, [folder, tick]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return [...files].filter((f) => !t || f.name.toLowerCase().includes(t)).sort((a, b) => b.updated.localeCompare(a.updated));
  }, [files, q]);
  const totalSize = files.reduce((s, f) => s + f.size, 0);

  const upload = async (list: FileList | null) => {
    if (!list?.length) return;
    const arr = Array.from(list);
    setUploading(arr.length);
    let ok = 0;
    for (const f of arr) {
      if (f.size > MAX) { toast(`${f.name} is larger than 10 MB`, 'error'); continue; }
      try { await uploadFile(f, `${ROOT}/${folder || 'media'}`, f.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 60) + '-' + Date.now().toString(36)); ok++; }
      catch (e) { toast(`${f.name}: ${errMsg(e)}`, 'error'); }
    }
    setUploading(0);
    if (ok) { toast(`${ok} file(s) uploaded.`); setTick((t) => t + 1); }
  };

  const del = async (f: MediaFile) => {
    if (!(await confirm({ title: 'Delete this file?', message: 'Anything using it will show a broken image.', danger: true }))) return;
    try { await deleteObject(sref(storage(), f.path)); toast('File deleted.'); setFiles((s) => s.filter((x) => x.path !== f.path)); }
    catch (e) { toast(errMsg(e), 'error'); }
  };
  const copy = async (f: MediaFile) => {
    try { await navigator.clipboard.writeText(f.url); toast('URL copied'); } catch { toast('Could not copy URL', 'error'); }
  };

  if (isStore) return <Forbidden />;

  return (
    <div>
      <PageHeader title="Media Library" subtitle={`${files.length} files · ${fmtSize(totalSize)}`}>
        <label className="btn-primary cursor-pointer" data-testid="upload-media">
          <Upload className="w-4 h-4" /> Upload Files
          <input type="file" multiple className="hidden" onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
        </label>
      </PageHeader>

      <label
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={(e) => { e.preventDefault(); setOver(false); }}
        onDrop={(e) => { e.preventDefault(); setOver(false); upload(e.dataTransfer.files); }}
        className={cx('mb-5 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 cursor-pointer transition bg-white dark:bg-dark-card',
          over ? 'border-primary bg-primary-50' : 'border-line dark:border-dark-line hover:border-primary/50')}>
        <span className="w-12 h-12 rounded-full bg-primary-50 text-primary flex items-center justify-center"><CloudUpload className="w-6 h-6" /></span>
        {uploading ? <span className="text-sm font-semibold text-primary">Uploading {uploading} file(s)…</span>
          : <span className="text-sm"><span className="font-semibold text-primary">Click to upload</span> or drag &amp; drop files here</span>}
        <span className="text-xs text-muted">Images, PDF, video, CSV up to 10MB each · saved to <code>{ROOT}/{folder || 'media'}/</code></span>
        <input type="file" multiple className="hidden" onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
      </label>

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 p-4 border-b border-line dark:border-dark-line">
          <button type="button" className={cx('chip', !folder && 'chip-active')} onClick={() => setFolder('')}>All</button>
          {folders.map((f) => (
            <button key={f} type="button" className={cx('chip', folder === f && 'chip-active')} onClick={() => setFolder(f)}>
              <Folder className="w-3.5 h-3.5" /> {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <SearchBox value={q} onChange={setQ} placeholder="Search file name" />
            <button type="button" className="icon-btn !w-9 !h-9" title="Refresh" onClick={() => { setQ(''); setTick((t) => t + 1); }}><RefreshCw className={cx('w-4 h-4', loading && 'animate-spin')} /></button>
          </div>
        </div>

        {loading && !files.length ? <div className="py-16 flex justify-center"><Spinner /></div> : !shown.length ? (
          <div className="py-16 flex flex-col items-center gap-2 text-muted"><ImageOff className="w-9 h-9 text-slate-300" />No files found.</div>
        ) : (
          <div className="grid gap-4 p-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
            {shown.map((f) => (
              <div key={f.path} className="group rounded-xl border border-line dark:border-dark-line overflow-hidden bg-white dark:bg-dark-card hover:shadow-md transition">
                <a href={f.url} target="_blank" rel="noreferrer" className="block aspect-square bg-slate-50 dark:bg-slate-800 relative">
                  {isImage(f) ? <img src={f.url} loading="lazy" className="w-full h-full object-cover" alt={f.name} /> : (
                    <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-muted">
                      <FileIcon className="w-9 h-9" /><span className="text-xs font-bold uppercase">{f.name.split('.').pop()}</span>
                    </span>
                  )}
                  <span className="absolute top-2 left-2 pill bg-white/90 text-navy text-[10px] shadow-sm">{f.folder}</span>
                </a>
                <div className="p-2.5">
                  <p className="text-xs font-semibold text-navy dark:text-white truncate" title={f.path}>{f.name}</p>
                  <p className="text-[11px] text-muted">{fmtSize(f.size)}{f.updated ? ` · ${fmtDate(f.updated)}` : ''}</p>
                  <div className="mt-2 flex items-center gap-1.5">
                    <button type="button" className="btn-soft btn-sm flex-1 justify-center" onClick={() => copy(f)}><Copy className="w-3.5 h-3.5" /> Copy URL</button>
                    <button type="button" className="icon-btn !w-8 !h-8 hover:!text-red-500 hover:!border-red-300" title="Delete" onClick={() => del(f)}><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        {folder && token && (
          <div className="flex justify-center p-4 border-t border-line dark:border-dark-line">
            <button type="button" className="btn-outline" disabled={loading} onClick={() => load(true)}>{loading ? 'Loading…' : 'Load more'}</button>
          </div>
        )}
      </div>
    </div>
  );
}
