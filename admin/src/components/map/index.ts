'use client';
// Client-only map components (Leaflet touches `window` at import time).
import dynamic from 'next/dynamic';

const loading = () => null;
export const PinPicker = dynamic(() => import('./LeafletMaps').then((m) => m.PinPicker), { ssr: false, loading });
export const PolygonDrawer = dynamic(() => import('./LeafletMaps').then((m) => m.PolygonDrawer), { ssr: false, loading });
export const PointsMap = dynamic(() => import('./LeafletMaps').then((m) => m.PointsMap), { ssr: false, loading });
