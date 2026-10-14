import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="container flex flex-col items-center py-24 text-center">
      <div className="text-7xl font-extrabold text-primary">404</div>
      <h1 className="mt-3 text-2xl font-bold">Page not found</h1>
      <p className="mt-1 text-sm text-muted">The page you are looking for doesn&apos;t exist or has been moved.</p>
      <Link href="/" className="btn-primary mt-6">
        Back to Home
      </Link>
    </div>
  );
}
