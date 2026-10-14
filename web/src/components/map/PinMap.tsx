'use client';

import 'leaflet/dist/leaflet.css';
import { useEffect } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';

export const pinIcon = (color = '#0E9623', glyph = '') =>
  L.divIcon({
    className: '',
    iconSize: [34, 44],
    iconAnchor: [17, 42],
    html: `<div style="position:relative;width:34px;height:44px">
      <svg viewBox="0 0 34 44" width="34" height="44"><path d="M17 1C8.2 1 1 8 1 16.7 1 28.5 17 43 17 43s16-14.5 16-26.3C33 8 25.8 1 17 1z" fill="${color}" stroke="white" stroke-width="2"/><circle cx="17" cy="16.5" r="6" fill="white"/></svg>
      ${glyph ? `<span style="position:absolute;top:7px;left:0;width:34px;text-align:center;font-size:13px">${glyph}</span>` : ''}
    </div>`,
  });

function ClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

function Recenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], map.getZoom());
  }, [lat, lng, map]);
  return null;
}

/** Map with a draggable pin — used by the address form (dynamically imported, no SSR). */
export default function PinMap({
  lat,
  lng,
  onChange,
  height = 260,
}: {
  lat: number;
  lng: number;
  onChange: (lat: number, lng: number) => void;
  height?: number;
}) {
  return (
    <MapContainer center={[lat, lng]} zoom={15} style={{ height, width: '100%', borderRadius: 12 }} scrollWheelZoom>
      <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <Marker
        position={[lat, lng]}
        draggable
        icon={pinIcon()}
        eventHandlers={{
          dragend: (e) => {
            const p = (e.target as L.Marker).getLatLng();
            onChange(p.lat, p.lng);
          },
        }}
      />
      <ClickHandler onPick={onChange} />
      <Recenter lat={lat} lng={lng} />
    </MapContainer>
  );
}
