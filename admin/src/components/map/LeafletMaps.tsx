'use client';
// Leaflet maps (OSM tiles, no API key). Loaded only in the browser via ./index.ts (next/dynamic ssr:false).
//  - PinPicker: click / drag a marker to pick lat,lng (stores)
//  - PolygonDrawer: leaflet-draw polygon editor (zones)
//  - PointsMap: read-only markers (+ optional polygon) — order tracking, store location
import { useEffect, useRef } from 'react';
import L from './leaflet-setup';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw';
import 'leaflet-draw/dist/leaflet.draw.css';
import { MapContainer, TileLayer, Marker, Polygon, Popup, useMap } from 'react-leaflet';
import type { LatLng } from '@/lib/types';

const TILE = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTR = '&copy; OpenStreetMap contributors';
const DEFAULT_CENTER: LatLng = { lat: 19.076, lng: 72.8777 }; // Mumbai

export function pinIcon(color = '#0E9623', label = '') {
  return L.divIcon({
    className: '',
    iconSize: [30, 40], iconAnchor: [15, 40], popupAnchor: [0, -36],
    html: `<div style="position:relative;width:30px;height:40px"><svg width="30" height="40" viewBox="0 0 30 40"><path d="M15 0C6.7 0 0 6.7 0 15c0 11 15 25 15 25s15-14 15-25C30 6.7 23.3 0 15 0z" fill="${color}"/><circle cx="15" cy="15" r="6" fill="#fff"/></svg>${label ? `<span style="position:absolute;top:7px;left:0;width:30px;text-align:center;font:700 10px sans-serif;color:${color}">${label}</span>` : ''}</div>`,
  });
}

export function PinPicker({ value, onChange, height = 320, polygon }: { value?: Partial<LatLng> | null; onChange: (v: LatLng) => void; height?: number; polygon?: LatLng[] }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.Marker | null>(null);
  useEffect(() => {
    if (!el.current || map.current) return;
    const c = value?.lat && value?.lng ? (value as LatLng) : polygon?.[0] || DEFAULT_CENTER;
    const m = L.map(el.current).setView([c.lat, c.lng], 13);
    L.tileLayer(TILE, { attribution: ATTR, maxZoom: 19 }).addTo(m);
    if (polygon?.length) { const pg = L.polygon(polygon.map((p) => [p.lat, p.lng]), { color: '#0E9623', weight: 2, fillOpacity: 0.08 }).addTo(m); if (!value?.lat) m.fitBounds(pg.getBounds()); }
    const mk = L.marker([c.lat, c.lng], { draggable: true, icon: pinIcon() }).addTo(m);
    mk.on('dragend', () => { const p = mk.getLatLng(); onChange({ lat: +p.lat.toFixed(7), lng: +p.lng.toFixed(7) }); });
    m.on('click', (e: L.LeafletMouseEvent) => { mk.setLatLng(e.latlng); onChange({ lat: +e.latlng.lat.toFixed(7), lng: +e.latlng.lng.toFixed(7) }); });
    map.current = m; marker.current = mk;
    setTimeout(() => m.invalidateSize(), 200);
    return () => { m.remove(); map.current = null; };
  }, []);
  useEffect(() => {
    if (marker.current && value?.lat && value?.lng) {
      const cur = marker.current.getLatLng();
      if (Math.abs(cur.lat - value.lat) > 1e-7 || Math.abs(cur.lng - value.lng) > 1e-7) { marker.current.setLatLng([value.lat, value.lng]); map.current?.panTo([value.lat, value.lng]); }
    }
  }, [value?.lat, value?.lng]);
  return <div ref={el} style={{ height }} className="rounded-xl border border-line overflow-hidden dark:border-dark-line" />;
}

export function PolygonDrawer({ value, onChange, height = 460, center }: { value: LatLng[]; onChange: (v: LatLng[]) => void; height?: number; center?: LatLng | null }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const group = useRef<L.FeatureGroup | null>(null);
  useEffect(() => {
    if (!el.current || map.current) return;
    const c = center || value[0] || DEFAULT_CENTER;
    const m = L.map(el.current).setView([c.lat, c.lng], 11);
    L.tileLayer(TILE, { attribution: ATTR, maxZoom: 19 }).addTo(m);
    const fg = new L.FeatureGroup().addTo(m);
    const style = { color: '#0E9623', weight: 2, fillColor: '#0E9623', fillOpacity: 0.15 };
    if (value.length >= 3) { const pg = L.polygon(value.map((p) => [p.lat, p.lng]), style); fg.addLayer(pg); m.fitBounds(pg.getBounds(), { padding: [20, 20] }); }
    const DrawCtl = (L.Control as any).Draw;
    const ctl = new DrawCtl({
      position: 'topright',
      draw: { polygon: { allowIntersection: false, showArea: true, shapeOptions: style }, polyline: false, rectangle: { shapeOptions: style }, circle: false, circlemarker: false, marker: false },
      edit: { featureGroup: fg, remove: true },
    });
    m.addControl(ctl);
    const emit = () => {
      const layers = fg.getLayers() as L.Polygon[];
      const last = layers[layers.length - 1];
      if (!last) { onChange([]); return; }
      const ring = (last.getLatLngs() as L.LatLng[][])[0] || [];
      onChange(ring.map((p) => ({ lat: +p.lat.toFixed(7), lng: +p.lng.toFixed(7) })));
    };
    const Ev = (L as any).Draw.Event;
    m.on(Ev.CREATED, (e: any) => { fg.clearLayers(); fg.addLayer(e.layer); emit(); });
    m.on(Ev.EDITED, emit);
    m.on(Ev.DELETED, emit);
    map.current = m; group.current = fg;
    setTimeout(() => m.invalidateSize(), 200);
    return () => { m.remove(); map.current = null; };
  }, []);
  return <div ref={el} style={{ height }} className="rounded-xl border border-line overflow-hidden dark:border-dark-line" data-testid="zone-map" />;
}

function Fit({ points }: { points: LatLng[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length > 1) map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng])), { padding: [30, 30] });
    else if (points.length === 1) map.setView([points[0].lat, points[0].lng], 14);
  }, [JSON.stringify(points)]);
  return null;
}

export function PointsMap({ points, polygon, height = 300 }: { points: { lat: number; lng: number; label?: string; color?: string; popup?: string }[]; polygon?: LatLng[]; height?: number }) {
  const valid = points.filter((p) => typeof p.lat === 'number' && typeof p.lng === 'number' && !isNaN(p.lat));
  const center = valid[0] || polygon?.[0] || DEFAULT_CENTER;
  return (
    <div style={{ height }} className="rounded-xl border border-line overflow-hidden dark:border-dark-line">
      <MapContainer center={[center.lat, center.lng]} zoom={13} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
        <TileLayer url={TILE} attribution={ATTR} />
        {polygon && polygon.length > 2 && <Polygon positions={polygon.map((p) => [p.lat, p.lng] as [number, number])} pathOptions={{ color: '#0E9623', weight: 2, fillOpacity: 0.1 }} />}
        {valid.map((p, i) => (
          <Marker key={i} position={[p.lat, p.lng]} icon={pinIcon(p.color, p.label)}>{p.popup && <Popup>{p.popup}</Popup>}</Marker>
        ))}
        <Fit points={[...valid, ...(polygon || [])]} />
      </MapContainer>
    </div>
  );
}
