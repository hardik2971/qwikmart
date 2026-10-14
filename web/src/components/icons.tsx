import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement>;

export const FacebookIcon = (p: P) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
    <path d="M13.5 21v-7.5h2.5l.4-3h-2.9V8.6c0-.9.3-1.5 1.5-1.5h1.6V4.4c-.3 0-1.2-.1-2.3-.1-2.3 0-3.8 1.4-3.8 3.9v2.3H8v3h2.5V21h3z" />
  </svg>
);
export const InstagramIcon = (p: P) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}>
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
  </svg>
);
export const XIcon = (p: P) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
    <path d="M17.8 3h3.1l-6.8 7.7 8 10.3h-6.2l-4.9-6.3L5.4 21H2.3l7.2-8.3L1.8 3h6.4l4.4 5.8L17.8 3zm-1.1 16.2h1.7L7.3 4.7H5.5l11.2 14.5z" />
  </svg>
);
export const YoutubeIcon = (p: P) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
    <path d="M22 8.2a3 3 0 0 0-2.1-2.1C18 5.6 12 5.6 12 5.6s-6 0-7.9.5A3 3 0 0 0 2 8.2 31 31 0 0 0 1.6 12c0 1.3.1 2.6.4 3.8a3 3 0 0 0 2.1 2.1c1.9.5 7.9.5 7.9.5s6 0 7.9-.5a3 3 0 0 0 2.1-2.1c.3-1.2.4-2.5.4-3.8s-.1-2.6-.4-3.8zM10 15.1V8.9l5.2 3.1-5.2 3.1z" />
  </svg>
);
export const WhatsappIcon = (p: P) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
    <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.4.1-.7.3-.2.3-.9.9-.9 2.2s.9 2.5 1 2.7c.1.2 1.8 2.8 4.4 3.9 1.6.7 2.3.8 3.1.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3z" />
  </svg>
);

export const socialIcons = [
  { key: 'facebook', Icon: FacebookIcon, color: '#1877F2' },
  { key: 'x', Icon: XIcon, color: '#111827' },
  { key: 'instagram', Icon: InstagramIcon, color: '#E1306C' },
  { key: 'youtube', Icon: YoutubeIcon, color: '#FF0000' },
  { key: 'whatsapp', Icon: WhatsappIcon, color: '#25D366' },
] as const;

export function AppStoreBadge() {
  return (
    <span className="inline-flex items-center gap-2 rounded-lg bg-black px-3 py-1.5 text-white">
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
        <path d="M16.4 12.6c0-2.6 2.1-3.8 2.2-3.9a4.8 4.8 0 0 0-3.8-2c-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.4-.9a5 5 0 0 0-4.2 2.6c-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8 1.6 0 2 .8 3.4.8 1.4 0 2.3-1.3 3.1-2.5a11 11 0 0 0 1.4-2.9 4.5 4.5 0 0 1-2.6-4.1zM13.9 5c.7-.9 1.2-2 1-3.2-1 .1-2.2.7-3 1.6-.6.7-1.2 1.9-1 3 1.1.1 2.3-.6 3-1.4z" />
      </svg>
      <span className="leading-tight">
        <span className="block text-[9px] opacity-80">Download on the</span>
        <span className="block text-sm font-semibold">App Store</span>
      </span>
    </span>
  );
}

export function PlayStoreBadge() {
  return (
    <span className="inline-flex items-center gap-2 rounded-lg bg-black px-3 py-1.5 text-white">
      <svg viewBox="0 0 24 24" className="h-6 w-6">
        <path fill="#34A853" d="M3.6 2.3 13.4 12l-9.8 9.7c-.4-.2-.6-.6-.6-1.1V3.4c0-.5.2-.9.6-1.1z" />
        <path fill="#FBBC04" d="m16.8 8.6-3.4 3.4 3.4 3.4 3.9-2.2c1-.6 1-1.9 0-2.4l-3.9-2.2z" />
        <path fill="#EA4335" d="M3.6 21.7 13.4 12l3.4 3.4-11.4 6.5c-.6.3-1.3.2-1.8-.2z" />
        <path fill="#4285F4" d="M3.6 2.3c.5-.4 1.2-.5 1.8-.2l11.4 6.5-3.4 3.4-9.8-9.7z" />
      </svg>
      <span className="leading-tight">
        <span className="block text-[9px] opacity-80">GET IT ON</span>
        <span className="block text-sm font-semibold">Google Play</span>
      </span>
    </span>
  );
}

/** Brand tiles for the payment-method list (initials on brand colour). */
export const PAYMENT_BRANDS: Record<string, { name: string; color: string; label: string }> = {
  phonepe: { name: 'PhonePe', color: '#5F259F', label: 'Pe' },
  midtrans: { name: 'Midtrans', color: '#002855', label: 'M' },
  paystack: { name: 'Paystack', color: '#00C3F7', label: 'P' },
  stripe: { name: 'Stripe', color: '#635BFF', label: 'S' },
  paypal: { name: 'PayPal', color: '#003087', label: 'P' },
  razorpay: { name: 'Razorpay', color: '#0C2451', label: 'R' },
  cashfree: { name: 'Cashfree', color: '#6933D3', label: 'C' },
  paytabs: { name: 'PayTabs', color: '#E5373C', label: 'PT' },
  cod: { name: 'Cash on Delivery', color: '#0E9623', label: '₹' },
  wallet: { name: 'QwikMart Wallet', color: '#0E9623', label: '$' },
};

export function PaymentLogo({ method, size = 32 }: { method: string; size?: number }) {
  const b = PAYMENT_BRANDS[method] || { color: '#7C8DB5', label: method.slice(0, 1).toUpperCase() };
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-lg text-xs font-extrabold text-white"
      style={{ background: b.color, width: size, height: size }}
    >
      {b.label}
    </span>
  );
}
