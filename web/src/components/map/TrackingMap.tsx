'use client';

import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import type { OrderTrack } from '@/lib/types';
import { pinIcon } from './PinMap';

function Fit({ points }: { points: [number, number][] }) {
  const map = useMap();
  const done = useRef(false);
  // fit once per mount, not on every rider move
  useEffect(() => {
    if (!done.current && points.length) {
      map.fitBounds(points, { padding: [40, 40], maxZoom: 15 });
      done.current = true;
    }
  });
  return null;
}

/** Live order tracking map (store → rider → customer). Dynamically imported with ssr:false. */
export default function TrackingMap({ track, height = 360 }: { track: OrderTrack; height?: number }) {
  const pt = (p?: { lat?: number | null; lng?: number | null } | null): [number, number] | null =>
    p && p.lat != null && p.lng != null ? [Number(p.lat), Number(p.lng)] : null;
  const rider = pt(track.delivery_boy);
  const home = pt(track.address) || rider;
  const store = pt(track.store) || home || rider;
  if (!store || !home)
    return (
      <div className="flex items-center justify-center rounded-xl bg-soft text-sm text-muted" style={{ height }}>
        Live location will appear once your order is on the way.
      </div>
    );
  return (
    <MapContainer center={store} zoom={14} style={{ height, width: '100%', borderRadius: 12 }} scrollWheelZoom={false}>
      <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <Fit points={[store, home]} />
      <Polyline positions={[store, ...(rider ? [rider] : []), home]} pathOptions={{ color: '#0E9623', weight: 4, dashArray: '8 8' }} />
      <Marker position={store} icon={pinIcon('#25396F', '🏪')}>
        <Popup>Store</Popup>
      </Marker>
      <Marker position={home} icon={pinIcon('#EF4444', '🏠')}>
        <Popup>Delivery address</Popup>
      </Marker>
      {rider && (
        <Marker position={rider} icon={pinIcon('#0E9623', '🛵')}>
          <Popup>Delivery partner</Popup>
        </Marker>
      )}
    </MapContainer>
  );
}
