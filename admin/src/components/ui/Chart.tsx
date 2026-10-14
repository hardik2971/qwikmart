'use client';
// ApexCharts wrapper (client only). Usage: <Chart type="area" height={320} series={[...]} options={{...}} />
import dynamic from 'next/dynamic';
import type { ApexOptions } from 'apexcharts';

const ReactApexChart = dynamic(() => import('react-apexcharts'), { ssr: false, loading: () => <div className="h-full min-h-[200px]" /> });

export const CHART_BASE: ApexOptions = {
  chart: { fontFamily: 'Plus Jakarta Sans, sans-serif', toolbar: { show: false }, zoom: { enabled: false }, foreColor: '#7C8DB5' },
  grid: { borderColor: '#E6EAF2', strokeDashArray: 4 },
  dataLabels: { enabled: false },
  legend: { position: 'top', horizontalAlign: 'right', fontWeight: 500, markers: { size: 6 } as any },
  tooltip: { theme: 'light' },
};

export function Chart({ type, series, options = {}, height = 300 }: { type: 'area' | 'line' | 'bar' | 'donut' | 'pie' | 'radialBar'; series: any; options?: ApexOptions; height?: number | string }) {
  const merged: ApexOptions = { ...CHART_BASE, ...options, chart: { ...CHART_BASE.chart, ...(options.chart || {}) }, grid: { ...CHART_BASE.grid, ...(options.grid || {}) } };
  return <ReactApexChart type={type} series={series} options={merged} height={height} />;
}
