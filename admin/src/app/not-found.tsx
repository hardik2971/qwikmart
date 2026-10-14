import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-adminbg">
      <img src="/images/brand/qwikmart-logo.png" alt="QwikMart" className="h-12" />
      <h1 className="text-2xl font-extrabold text-navy">Page not found</h1>
      <Link href="/admin" className="btn-primary">Go to dashboard</Link>
    </div>
  );
}
