// Field schema for System Settings — port of Admin/SettingController::fields(), mapped onto the Firestore settings docs
// (settings/public per FIREBASE_BACKEND.md §3, and settings/private_{payment|sms|smtp|ai} which functions read).
import type { LucideIcon } from 'lucide-react';
import { Settings, Smartphone, CreditCard, MessageSquare, Flame, Mail, Sparkles, Gift, Wallet, Truck, Construction } from 'lucide-react';

export type DocKey = 'public' | 'private_payment' | 'private_sms' | 'private_smtp' | 'private_ai';
export type FieldType = 'text' | 'email' | 'url' | 'number' | 'textarea' | 'select' | 'toggle' | 'image' | 'color' | 'secret';
export interface FieldDef {
  doc: DocKey; path: string; type: FieldType; label: string;
  span?: 2; section?: string; hint?: string; placeholder?: string; description?: string; required?: boolean; prefix?: boolean;
  options?: { value: string; label: string }[] | 'countries' | 'zones' | 'currencies' | 'timezones'; default?: any;
}

export const TABS: { key: string; label: string; icon: LucideIcon; desc: string; locked?: boolean }[] = [
  { key: 'general', label: 'General', icon: Settings, desc: 'Branding, contact details, currency and timezone' },
  { key: 'app', label: 'App', icon: Smartphone, desc: 'Mobile app versions, store links and force update' },
  { key: 'payment', label: 'Payment Gateways', icon: CreditCard, desc: 'Enable payment methods and set API credentials', locked: true },
  { key: 'sms', label: 'SMS Gateway', icon: MessageSquare, desc: 'OTP delivery provider', locked: true },
  { key: 'firebase', label: 'Firebase', icon: Flame, desc: 'Push notifications and web config', locked: true },
  { key: 'smtp', label: 'SMTP', icon: Mail, desc: 'Outgoing email server', locked: true },
  { key: 'ai', label: 'AI', icon: Sparkles, desc: 'Google Gemini powered features', locked: true },
  { key: 'referral', label: 'Referral', icon: Gift, desc: 'Refer & earn rewards' },
  { key: 'wallet', label: 'Wallet', icon: Wallet, desc: 'Customer wallet limits' },
  { key: 'delivery', label: 'Delivery', icon: Truck, desc: 'Delivery assignment and commission defaults' },
  { key: 'maintenance', label: 'Maintenance', icon: Construction, desc: 'Maintenance mode for the website and apps' },
];

const P = (path: string, type: FieldType, label: string, x: Partial<FieldDef> = {}): FieldDef => ({ doc: 'public', path, type, label, ...x });

export const FIELDS: Record<string, FieldDef[]> = {
  general: [
    P('app_name', 'text', 'App Name', { required: true }),
    P('tagline', 'text', 'Tagline'),
    P('support.email', 'email', 'Support Email'),
    P('support.phone', 'text', 'Support Phone'),
    P('support.whatsapp', 'text', 'WhatsApp Number'),
    P('company.name', 'text', 'Company Name'),
    P('company.address', 'textarea', 'Business Address', { span: 2 }),
    P('logo', 'image', 'Logo'),
    P('favicon', 'image', 'Favicon'),
    P('currency_code', 'select', 'Default Currency', { options: 'currencies' }),
    P('currency_symbol', 'text', 'Currency Symbol'),
    P('timezone', 'select', 'Timezone', { options: 'timezones' }),
    P('primary_color', 'color', 'Primary Color'),
    P('default_country_id', 'select', 'Default Country', { options: 'countries' }),
    P('default_zone_id', 'select', 'Default Zone', { options: 'zones' }),
    P('tax_inclusive', 'toggle', 'Prices include tax', { description: 'Product prices already include tax.', default: true }),
    P('demo_mode', 'toggle', 'Demo Mode', { description: 'Masks sensitive data and locks credentials.' }),
    P('cookie_consent', 'toggle', 'Cookie consent banner', { description: 'Show the cookie banner on the website.', default: true }),
    P('social.facebook', 'url', 'Facebook', { section: 'Social Links' }),
    P('social.instagram', 'url', 'Instagram'),
    P('social.twitter', 'url', 'Twitter / X'),
    P('social.youtube', 'url', 'YouTube'),
  ],
  app: [
    P('app_versions.customer_min', 'text', 'Min Version (Android)', { section: 'Customer App', placeholder: '1.0.0' }),
    P('app_versions.customer_min_ios', 'text', 'Min Version (iOS)', { placeholder: '1.0.0' }),
    P('app_versions.force_update', 'toggle', 'Force Update', { description: 'Block older customer app versions.', span: 2 }),
    P('app_versions.delivery_min', 'text', 'Min Version (Android)', { section: 'Delivery Boy App', placeholder: '1.0.0' }),
    P('app_versions.delivery_min_ios', 'text', 'Min Version (iOS)', { placeholder: '1.0.0' }),
    P('app_versions.delivery_force_update', 'toggle', 'Force Update', { description: 'Block older delivery app versions.', span: 2 }),
    P('app_versions.play_store_url', 'url', 'Play Store URL', { section: 'Store Links' }),
    P('app_versions.app_store_url', 'url', 'App Store URL'),
    P('app_versions.delivery_play_store_url', 'url', 'Delivery App Play Store URL'),
    P('app_versions.delivery_app_store_url', 'url', 'Delivery App App Store URL'),
    P('maintenance.app', 'toggle', 'App Maintenance', { section: 'App Maintenance', description: 'Show a maintenance screen in the mobile apps.', span: 2 }),
    P('maintenance.message', 'textarea', 'Maintenance Message', { span: 2 }),
  ],
  smtp: [
    { doc: 'private_smtp', path: 'host', type: 'text', label: 'SMTP Host', placeholder: 'smtp.gmail.com' },
    { doc: 'private_smtp', path: 'port', type: 'number', label: 'SMTP Port', placeholder: '587' },
    { doc: 'private_smtp', path: 'username', type: 'text', label: 'Username' },
    { doc: 'private_smtp', path: 'password', type: 'secret', label: 'Password' },
    { doc: 'private_smtp', path: 'encryption', type: 'select', label: 'Encryption', options: [{ value: 'tls', label: 'TLS' }, { value: 'ssl', label: 'SSL' }, { value: 'none', label: 'None' }] },
    { doc: 'private_smtp', path: 'from_email', type: 'email', label: 'From Address' },
    { doc: 'private_smtp', path: 'from_name', type: 'text', label: 'From Name' },
  ],
  ai: [
    { doc: 'private_ai', path: 'gemini_api_key', type: 'secret', label: 'Gemini API Key', hint: 'Get a key from Google AI Studio.' },
    { doc: 'private_ai', path: 'gemini_model', type: 'select', label: 'Model', default: 'gemini-2.5-flash', options: [{ value: 'gemini-2.5-flash', label: 'gemini-2.5-flash (fast)' }, { value: 'gemini-2.5-pro', label: 'gemini-2.5-pro (best quality)' }] },
    P('ai_features.product_content', 'toggle', 'Product content generation', { section: 'Features', description: 'Generate descriptions & SEO from the product form.', default: true }),
    P('ai_features.translate', 'toggle', 'Auto translate', { description: 'Translate button on multilingual forms.', default: true }),
    P('ai_features.search', 'toggle', 'Smart search', { description: 'AI assisted product search in the apps.' }),
    P('ai_features.recommendations', 'toggle', 'Recommendations', { description: 'AI product recommendations.' }),
  ],
  referral: [
    P('referral.enabled', 'toggle', 'Enable Referral Program', { span: 2, default: true }),
    P('referral.referrer_reward', 'number', 'Referrer Reward', { prefix: true, hint: 'Credited to the user who shared the code.' }),
    P('referral.referred_reward', 'number', 'Referred User Reward', { prefix: true, hint: 'Credited to the new user.' }),
    P('referral.min_order', 'number', 'Minimum First Order', { prefix: true, hint: 'Rewards are released after a first order of at least this amount.' }),
  ],
  wallet: [
    P('wallet.enabled', 'toggle', 'Enable Wallet', { span: 2, default: true }),
    P('wallet.min_recharge', 'number', 'Minimum Recharge', { prefix: true }),
    P('wallet.max_recharge', 'number', 'Maximum Recharge', { prefix: true }),
    P('wallet.withdraw_enabled', 'toggle', 'Allow Withdrawals', { span: 2, section: 'Withdrawals', default: true }),
    P('wallet.min_withdraw', 'number', 'Minimum Withdraw', { prefix: true }),
  ],
  delivery: [
    P('delivery.radius_km', 'number', 'Default Delivery Radius (km)', { placeholder: '5' }),
    P('delivery.auto_assign', 'toggle', 'Auto-assign delivery boy', { span: 2, description: 'Quick orders are assigned to the nearest online, approved delivery boy of the zone as soon as they are placed (Laravel auto_assign_delivery). Off: riders accept from the pool or the store/admin assigns.', default: false }),
    P('delivery.location_interval_sec', 'number', 'Rider location interval (sec)', { placeholder: '10' }),
    P('delivery.commission_type', 'select', 'Default Commission Type', { section: 'Delivery Boy Commission', options: [{ value: 'fixed', label: 'Fixed per order' }, { value: 'percent', label: 'Percent of order' }] }),
    P('delivery.commission_value', 'number', 'Default Commission Value'),
    P('delivery.otp_required', 'toggle', 'Delivery OTP required', { span: 2, description: 'Delivery boy must enter the customer OTP to complete delivery.', default: true }),
  ],
  maintenance: [
    P('maintenance.web', 'toggle', 'Maintenance Mode', { span: 2, description: 'Website shows a maintenance notice. The admin panel stays available.' }),
    P('maintenance.app', 'toggle', 'App Maintenance', { span: 2, description: 'Show a maintenance screen in the mobile apps.' }),
    P('maintenance.message', 'textarea', 'Maintenance Message', { span: 2 }),
  ],
  firebase: [
    P('firebase_web.vapid_key', 'text', 'VAPID Key (web push)', { span: 2, hint: 'Firebase console → Project settings → Cloud Messaging → Web Push certificates.' }),
  ],
};

/** [gateway, name, icon-ish, fields: [settingKey, label, secret?, options?], publicKeyField] */
export interface GatewayDef { key: string; name: string; fields: { key: string; label: string; secret?: boolean; options?: { value: string; label: string }[] }[]; publicKey?: string }
export const GATEWAYS: GatewayDef[] = [
  { key: 'stripe', name: 'Stripe', publicKey: 'stripe_key', fields: [{ key: 'stripe_key', label: 'Publishable Key' }, { key: 'stripe_secret', label: 'Secret Key', secret: true }, { key: 'stripe_webhook_secret', label: 'Webhook Secret', secret: true }] },
  { key: 'paypal', name: 'PayPal', publicKey: 'paypal_client_id', fields: [{ key: 'paypal_client_id', label: 'Client ID' }, { key: 'paypal_secret', label: 'Client Secret', secret: true }] },
  { key: 'razorpay', name: 'Razorpay', publicKey: 'razorpay_key', fields: [{ key: 'razorpay_key', label: 'Key ID' }, { key: 'razorpay_secret', label: 'Key Secret', secret: true }] },
  { key: 'cashfree', name: 'Cashfree', publicKey: 'cashfree_app_id', fields: [{ key: 'cashfree_app_id', label: 'App ID' }, { key: 'cashfree_secret', label: 'Secret Key', secret: true }] },
  { key: 'phonepe', name: 'PhonePe', fields: [{ key: 'phonepe_merchant_id', label: 'Merchant ID' }, { key: 'phonepe_salt_key', label: 'Salt Key', secret: true }, { key: 'phonepe_salt_index', label: 'Salt Index' }] },
  {
    key: 'paytabs', name: 'PayTabs', fields: [{ key: 'paytabs_profile_id', label: 'Profile ID' }, { key: 'paytabs_server_key', label: 'Server Key', secret: true },
      { key: 'paytabs_region', label: 'Region', options: [{ value: 'ARE', label: 'UAE (ARE)' }, { value: 'SAU', label: 'Saudi Arabia (SAU)' }, { value: 'OMN', label: 'Oman (OMN)' }, { value: 'JOR', label: 'Jordan (JOR)' }, { value: 'EGY', label: 'Egypt (EGY)' }, { value: 'GLOBAL', label: 'Global' }] }],
  },
  { key: 'midtrans', name: 'Midtrans', publicKey: 'midtrans_client_key', fields: [{ key: 'midtrans_client_key', label: 'Client Key' }, { key: 'midtrans_server_key', label: 'Server Key', secret: true }] },
  { key: 'paystack', name: 'Paystack', publicKey: 'paystack_public_key', fields: [{ key: 'paystack_public_key', label: 'Public Key' }, { key: 'paystack_secret_key', label: 'Secret Key', secret: true }] },
  { key: 'wallet', name: 'Wallet', fields: [] },
  { key: 'cod', name: 'Cash on Delivery', fields: [] },
];

export const SMS_DRIVERS: { key: string; name: string; fields: { key: string; label: string; secret?: boolean }[] }[] = [
  { key: 'twilio', name: 'Twilio', fields: [{ key: 'twilio_sid', label: 'Account SID' }, { key: 'twilio_token', label: 'Auth Token', secret: true }, { key: 'twilio_from', label: 'From Number' }] },
  { key: 'fast2sms', name: 'Fast2SMS', fields: [{ key: 'fast2sms_key', label: 'API Key', secret: true }] },
  { key: '2factor', name: '2Factor', fields: [{ key: 'twofactor_key', label: 'API Key', secret: true }, { key: 'twofactor_template', label: 'OTP Template Name' }] },
  { key: 'msg91', name: 'MSG91', fields: [{ key: 'msg91_auth_key', label: 'Auth Key', secret: true }, { key: 'msg91_template_id', label: 'Template ID' }, { key: 'msg91_sender', label: 'Sender ID' }] },
  { key: 'firebase', name: 'Firebase Phone Auth', fields: [] },
  { key: 'log', name: 'Log only (testing)', fields: [] },
];

export const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SAR', 'QAR', 'KWD', 'OMR', 'BHD', 'JOD', 'EGP', 'IDR', 'NGN', 'GHS', 'KES', 'ZAR', 'MYR', 'SGD', 'PKR', 'BDT', 'LKR', 'NPR'];

export function getPath(o: any, path: string): any { return path.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o); }
export function setPath(o: Record<string, any>, path: string, v: any) {
  const ks = path.split('.'); let cur = o;
  ks.slice(0, -1).forEach((k) => { if (typeof cur[k] !== 'object' || cur[k] === null) cur[k] = {}; cur = cur[k]; });
  cur[ks[ks.length - 1]] = v;
}
