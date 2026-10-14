'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, PackageSearch } from 'lucide-react';
import { errorMessage } from '@/lib/errors';
import { resumeOrderPayment } from '@/lib/payments';
import { Spinner } from '@/components/ui';

function Inner() {
  const sp = useSearchParams();
  const qc = useQueryClient();
  const [id, setId] = useState(sp.get('order'));
  const [no, setNo] = useState(sp.get('no'));
  // back from a redirect payment gateway (?pay=1): verify the pending order payment first
  const [state, setState] = useState<'ok' | 'verifying' | 'failed'>(sp.get('pay') ? 'verifying' : 'ok');
  const [error, setError] = useState('');
  const ran = useRef(false);

  useEffect(() => {
    if (state !== 'verifying' || ran.current) return;
    ran.current = true;
    resumeOrderPayment(new URLSearchParams(window.location.search))
      .then((p) => {
        if (p) {
          setId(p.id);
          setNo(p.number ?? null);
        }
        setState('ok');
        qc.invalidateQueries({ queryKey: ['orders'] });
      })
      .catch((e) => {
        setError(errorMessage(e));
        setState('failed');
      });
  }, [state, qc]);

  if (state === 'verifying')
    return (
      <div className="container flex justify-center py-16">
        <div className="card flex w-full max-w-md flex-col items-center gap-3 p-8 text-center">
          <Spinner />
          <p className="text-sm text-muted">Confirming your payment…</p>
        </div>
      </div>
    );

  if (state === 'failed')
    return (
      <div className="container flex justify-center py-16">
        <div className="card w-full max-w-md p-8 text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-red-50 text-danger">
            <AlertTriangle className="h-10 w-10" />
          </div>
          <h1 className="mt-5 text-2xl font-extrabold">Payment not confirmed</h1>
          <p className="mt-2 text-sm text-muted">{error}</p>
          <div className="mt-6 flex flex-col gap-2">
            <Link href="/orders" className="btn-primary py-3">My Orders</Link>
            <Link href="/" className="btn-ghost">Continue Shopping</Link>
          </div>
        </div>
      </div>
    );

  return (
    <div className="container flex justify-center py-16">
      <div className="card w-full max-w-md p-8 text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-primary-50 text-primary">
          <CheckCircle2 className="h-12 w-12" />
        </div>
        <h1 className="mt-5 text-2xl font-extrabold">Order placed successfully!</h1>
        {no && (
          <p className="mt-2 text-sm text-muted">
            Order number <span className="font-bold text-ink">{no}</span>
          </p>
        )}
        <p className="mt-2 text-sm">We have received your order and the store has started preparing it. You can track it live.</p>
        <div className="mt-6 flex flex-col gap-2">
          {id && (
            <Link href={`/orders/${id}`} className="btn-primary py-3">
              <PackageSearch className="h-4 w-4" /> Track Order
            </Link>
          )}
          <Link href="/" className="btn-ghost">
            Continue Shopping
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function SuccessPage() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}
