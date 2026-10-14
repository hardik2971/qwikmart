import L from 'leaflet';
// leaflet-draw expects a global L
if (typeof window !== 'undefined') (window as any).L = L;
export default L;
