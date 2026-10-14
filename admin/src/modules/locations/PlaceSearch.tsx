'use client';
// OpenStreetMap Nominatim place search (same as the Blade zone/store forms).
import { useState } from 'react';
import { Search } from 'lucide-react';
import { useToast } from '@/components/ui/toast';

export interface Place { place_id: number; display_name: string; lat: string; lon: string; boundingbox?: string[] }

export function PlaceSearch({ onPick, placeholder = 'Search for a place to center the map' }: { onPick: (p: { lat: number; lng: number; name: string }) => void; placeholder?: string }) {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Place[]>([]);
  const lookup = async () => {
    const s = q.trim();
    if (s.length < 3) { setResults([]); return; }
    setBusy(true);
    try {
      const res = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=6&q=' + encodeURIComponent(s), { headers: { Accept: 'application/json' } });
      const list = (await res.json()) as Place[];
      setResults(Array.isArray(list) ? list : []);
      if (!list?.length) toast('No places found', 'error');
    } catch { toast('Location search failed', 'error'); }
    setBusy(false);
  };
  return (
    <div className="relative mb-3">
      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input type="text" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); lookup(); } }} className="input !pl-9 !pr-24" placeholder={placeholder} />
      <button type="button" className="btn-primary btn-sm absolute right-1.5 top-1/2 -translate-y-1/2" onClick={lookup}>{busy ? '…' : 'Search'}</button>
      {results.length > 0 && (
        <div className="absolute z-[1000] mt-1 w-full card max-h-64 overflow-y-auto shadow-lg">
          {results.map((r) => (
            <button key={r.place_id} type="button" className="block w-full text-left px-3 py-2 text-sm hover:bg-primary-50 border-b border-line last:border-0 dark:border-dark-line"
              onClick={() => { setResults([]); setQ(r.display_name); onPick({ lat: +(+r.lat).toFixed(7), lng: +(+r.lon).toFixed(7), name: r.display_name }); }}>
              {r.display_name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Area-weighted polygon centroid (falls back to vertex average for degenerate rings). */
export function polygonCentroid(pts: { lat: number; lng: number }[]): { lat: number; lng: number } | null {
  if (!pts.length) return null;
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    const f = p.lng * q.lat - q.lng * p.lat;
    a += f; cx += (p.lng + q.lng) * f; cy += (p.lat + q.lat) * f;
  }
  if (Math.abs(a) < 1e-12) {
    return { lat: +(pts.reduce((s, p) => s + p.lat, 0) / pts.length).toFixed(7), lng: +(pts.reduce((s, p) => s + p.lng, 0) / pts.length).toFixed(7) };
  }
  a /= 2;
  return { lat: +(cy / (6 * a)).toFixed(7), lng: +(cx / (6 * a)).toFixed(7) };
}
