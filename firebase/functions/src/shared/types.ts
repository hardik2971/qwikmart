/**
 * QwikMart — shared Firestore document & callable contracts (see docs/FIREBASE_BACKEND.md).
 *
 * This file is dependency-free on purpose so other packages (admin/, tools/) can copy or import it.
 * Timestamps are typed as `TimestampLike` (Admin/Client SDK `Timestamp` both satisfy it).
 */

export interface TimestampLike {
  seconds: number;
  nanoseconds: number;
  toDate(): Date;
  toMillis(): number;
}

/** Translatable text: `{en, ar, hi, ...}`. Clients pick `field[lang] ?? field.en`. */
export type I18n = Record<string, string>;
export type Mode = 'quick' | 'ecommerce';
export type FulfillmentType = Mode | 'both';
export type UserType = 'customer' | 'delivery_boy' | 'admin' | 'staff' | 'store';
export type ActiveStatus = 'active' | 'inactive';
export type LatLng = { lat: number; lng: number };

/* ------------------------------------------------------------------ Claims */
export interface CustomClaims {
  role: UserType;
  store_id?: string;
  role_id?: string;
  zone_id?: string;
}

/* ------------------------------------------------------------------ Settings & geography */
export interface PaymentMethodConfig {
  key: string;
  name: string;
  logo?: string | null;
  enabled: boolean;
  public_key?: string | null;
  mode?: 'sandbox' | 'live' | string;
}

export interface PublicSettings {
  app_name?: string;
  tagline?: string;
  logo?: string;
  favicon?: string;
  support?: { phone?: string; email?: string; whatsapp?: string };
  social?: { facebook?: string; instagram?: string; twitter?: string; youtube?: string };
  default_country_id?: string;
  default_zone_id?: string;
  demo_mode?: boolean;
  tax_inclusive?: boolean;
  payment_methods?: PaymentMethodConfig[];
  referral?: { enabled?: boolean; referrer_reward?: number; referred_reward?: number; min_order?: number };
  wallet?: { min_recharge?: number; max_recharge?: number; min_withdraw?: number };
  cod?: { enabled?: boolean; max_amount?: number };
  /** Laravel `auto_assign_delivery` → `delivery.auto_assign` (the older admin field `delivery.assign_mode: 'auto'|'manual'` is honoured when auto_assign is unset). */
  delivery?: { auto_assign?: boolean | null; assign_mode?: string | null; [k: string]: unknown };
  app_versions?: { customer_min?: string; delivery_min?: string; force_update?: boolean };
  maintenance?: { app?: boolean; web?: boolean; message?: string };
  cookie_consent?: unknown;
  home_search_hints?: string[];
  /** Optional: IANA timezone for surge/promo time windows (default Asia/Kolkata). */
  timezone?: string;
  /** Optional: currency used for gateway payments when the country is unknown (default INR). */
  currency_code?: string;
  currency_symbol?: string;
}

/** settings/private_payment — functions only. Keys follow `${gateway}_${key}` (e.g. stripe_secret). */
export type PrivatePaymentSettings = Record<string, string | number | boolean | null>;
/**
 * settings/private_smtp — canonical keys (admin Settings page + migration):
 * `host, port, username, password, encryption ('tls'|'ssl'|'none'), secure, from_email, from_name`.
 * Laravel names (`mail_host, mail_port, mail_username, mail_password, mail_encryption, mail_from_address, mail_from_name`)
 * and `from_address` are accepted as fallbacks (services/notify.ts normalizeSmtp).
 */
export interface PrivateSmtpSettings {
  host?: string; port?: number | string; secure?: boolean; username?: string; password?: string; encryption?: string;
  from_email?: string; from_address?: string; from_name?: string;
  mail_host?: string; mail_port?: number | string; mail_username?: string; mail_password?: string; mail_encryption?: string;
  mail_from_address?: string; mail_from_name?: string;
}
/** settings/private_sms (`sms_gateway` = Laravel name, fallback for `gateway`) */
export interface PrivateSmsSettings {
  gateway?: 'twilio' | 'msg91' | 'fast2sms' | '2factor' | 'log' | 'firebase';
  sms_gateway?: string;
  twilio_sid?: string; twilio_token?: string; twilio_from?: string;
  msg91_auth_key?: string; msg91_template_id?: string; msg91_sender?: string;
  fast2sms_key?: string;
  twofactor_key?: string; twofactor_template?: string;
}
/** settings/private_ai */
export interface PrivateAiSettings { gemini_api_key?: string; gemini_model?: string }

export interface Country {
  name: string; iso2: string; dial_code: string; currency_code: string; currency_symbol: string;
  timezone: string; date_format?: string; flag?: string; is_default?: boolean; status: ActiveStatus;
}

export interface SurgeSlot { from: string; to: string; amount: number }
export interface AdditionalCharge { name: I18n | string; amount: number; refundable?: boolean }

export interface Zone {
  country_id: string; name: string; slug?: string; city?: string;
  polygon: LatLng[]; center?: LatLng;
  fulfillment_type: FulfillmentType;
  base_charge: number; base_distance_km: number; per_km_charge: number;
  free_delivery_above: number | null; min_order: number;
  surge_slots?: SurgeSlot[]; additional_charges?: AdditionalCharge[];
  delivery_time_minutes?: number; default_store_id?: string | null; status: ActiveStatus;
}

export interface Store {
  zone_id: string; country_id?: string; name: string; slug?: string; email?: string; phone?: string;
  address?: string; city?: string; lat?: number | null; lng?: number | null; logo?: string; banner?: string;
  opening_time?: string; closing_time?: string; fulfillment_type: FulfillmentType;
  commission_percent?: number; status: ActiveStatus; is_open?: boolean; owner_uid?: string | null;
  orders_count?: number; revenue?: number;
}

/* ------------------------------------------------------------------ Users */
export interface UserDoc {
  type: UserType; name: string; email?: string | null; phone?: string | null; avatar?: string | null;
  store_id?: string | null; role_id?: string | null;
  referral_code: string; referred_by?: string | null;
  wallet_balance: number; orders_count: number; total_spent: number;
  fcm_tokens: string[]; status: ActiveStatus | 'deleted' | 'merged'; language?: string;
  created_at?: TimestampLike; updated_at?: TimestampLike; last_login_at?: TimestampLike;
  search_keywords?: string[];
}

export interface AddressDoc {
  label?: string; name: string; phone: string; address_line: string; landmark?: string; city?: string;
  state?: string; pincode?: string; country_id?: string; lat: number; lng: number; is_default?: boolean;
}

/** users/{uid}/cart/{lineId}, lineId = `${mode}_${storeId|'central'}_${variantId}` */
export interface CartLineDoc {
  product_id: string; variant_id: string; store_id: string | null; mode: Mode; qty: number; added_at?: TimestampLike;
}

export interface UserNotificationDoc {
  title: string; message: string; type: string; data?: Record<string, unknown>; image?: string | null;
  read_at: TimestampLike | null; created_at: TimestampLike;
}

export interface WalletTransactionDoc {
  type: 'credit' | 'debit'; amount: number; balance_after: number; payment_type: string; txn_id: string;
  order_id?: string | null; message: string; status: 'success' | 'pending' | 'failed'; created_at: TimestampLike;
}

export interface DeliveryBoyDoc {
  zone_id: string; country_id?: string | null; dob?: string | null; address?: string | null; vehicle_type?: string | null; vehicle_number?: string | null;
  driving_license?: string | null; id_proof?: string | null; bank?: { name?: string | null; account?: string | null; ifsc?: string | null };
  commission_type: 'percent' | 'fixed'; commission_value: number; salary?: number;
  cash_in_hand: number; earnings_total: number; rating_avg?: number; rating_count?: number;
  is_online: boolean; location?: { lat: number; lng: number; updated_at: TimestampLike } | null;
  approval_status: 'pending' | 'approved' | 'rejected'; approval_remark?: string | null;
  status: ActiveStatus; created_at?: TimestampLike;
  /** denormalised for panel lists */
  name?: string; phone?: string | null; email?: string | null; avatar?: string | null;
}

export interface RoleDoc { name: string; scope: 'admin' | 'store'; store_id?: string | null; permissions: string[] }

/* ------------------------------------------------------------------ Catalog */
export interface CategoryDoc {
  parent_id: string | null; name: I18n; slug: string; image?: string; icon?: string; banner?: string;
  header_color?: string; sort_order?: number; status: ActiveStatus; show_in_quick?: boolean; show_in_ecommerce?: boolean;
  product_count?: number; ancestor_ids?: string[];
}

export interface VariantDoc {
  id: string; name: string; sku?: string; attribute_value_ids?: string[]; attrs?: Record<string, string>;
  price: number; sale_price: number | null; stock: number; low_stock_alert?: number; weight?: number;
  image?: string | null; status?: boolean | ActiveStatus;
}

export interface ProductDoc {
  store_id: string | null; category_id: string; sub_category_id: string | null; category_ids: string[];
  brand_id: string | null; brand_name?: string | null; name: I18n; slug: string;
  short_description?: I18n; description?: I18n; images?: string[]; thumbnail?: string;
  product_type: 'simple' | 'variable'; tax_id?: string | null; tax_percent: number; is_veg?: boolean | null;
  return_allowed?: boolean; return_days?: number; cancelable?: boolean; cod_allowed?: boolean; max_qty_per_order?: number;
  fulfillment_type: FulfillmentType; seo?: Record<string, I18n>; schema_markup?: string; tags?: string[];
  attributes?: { name: string; values: string[] }[]; variants: VariantDoc[];
  cross_sell_ids?: string[]; up_sell_ids?: string[];
  rating_avg: number; rating_count: number; sold_count: number; is_featured?: boolean;
  status: ActiveStatus | 'draft' | 'pending_approval';
  min_price?: number; max_discount_percent?: number; in_stock_store_ids?: string[]; search_keywords?: string[];
  created_at?: TimestampLike; updated_at?: TimestampLike;
}

export interface StoreStockDoc {
  store_id: string; product_id: string; variant_id: string; stock: number;
  price: number | null; sale_price: number | null; low_stock_alert?: number;
}

export interface ReviewDoc {
  product_id: string; user_id: string; user_name: string; user_avatar?: string | null; order_id: string;
  item_variant_id: string; rating: number; comment?: string; images?: string[]; status: ActiveStatus; created_at: TimestampLike;
}

export type SectionType = 'banner_slider' | 'category_section' | 'product_slider' | 'top_brands' | 'grid_banner' | 'title_image' | 'heading_text';
export interface HomeSection { id: string; type: SectionType; title?: I18n | string | null; is_active?: boolean; sort?: number; settings: Record<string, unknown> }
export interface HomeLayoutDoc {
  zone_id: string; mode: Mode; category_id: string | null;
  header?: { bg_type?: 'color' | 'image' | 'gradient'; bg_value?: string | null; text_color?: string | null };
  /** Legacy only — drafts live in home_layout_drafts/{id}; publishHomeLayout rewrites the doc without it. */
  draft_sections?: HomeSection[];
  published_sections: HomeSection[]; is_published: boolean; published_at?: TimestampLike | null; store_id?: string | null;
}
/** home_layout_drafts/{zoneId}_{mode}_{categoryId|'all'} — panel-only working copy (rules: home_builder permission). */
export interface HomeLayoutDraftDoc {
  zone_id: string; mode: Mode; category_id: string | null;
  header?: HomeLayoutDoc['header'];
  draft_sections: HomeSection[]; store_id?: string | null; updated_at?: TimestampLike; updated_by?: string | null;
}

export interface PromoCodeDoc {
  code: string; title?: I18n; description?: I18n; image?: string | null; banner_color?: string | null;
  discount_type: 'percent' | 'fixed' | 'free_delivery'; discount_value: number; max_discount?: number | null; min_order?: number;
  usage_limit_total?: number | null; usage_limit_per_user?: number | null; used_count?: number;
  starts_at?: TimestampLike | null; ends_at?: TimestampLike | null; is_permanent?: boolean;
  applies_to?: 'all' | 'categories' | 'products' | 'stores'; applies_to_ids?: string[];
  audience?: 'all' | 'new' | 'existing'; channels?: Mode[]; platforms?: ('app' | 'web')[];
  zone_ids?: string[]; country_ids?: string[]; time_from?: string | null; time_to?: string | null;
  is_instant?: boolean; is_cashback?: boolean; status: ActiveStatus | boolean; store_id?: string | null;
}

/* ------------------------------------------------------------------ Orders & money */
export type OrderStatus =
  | 'payment_pending' | 'received' | 'processed' | 'shipped' | 'ready_for_pickup'
  | 'picked_up' | 'out_for_delivery' | 'delivered' | 'cancelled' | 'returned';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';
export type ItemStatus = OrderStatus | 'return_requested';

export interface OrderItem {
  variant_id: string; product_id: string; name: string; variant_name: string; image: string | null;
  price: number; sale_price: number | null; unit_price: number; qty: number; tax_percent: number; tax_amount: number; total: number;
  status: ItemStatus; is_reviewed: boolean; return_status?: string | null;
  category_id?: string | null; stock_source: 'store' | 'central';
  return_allowed?: boolean; return_days?: number; cancelable?: boolean;
}

export interface OrderTotals {
  subtotal: number; savings: number; discount: number; promo_discount: number; delivery_charge: number;
  surge_charge: number; additional_charges: number; tax_amount: number; wallet_used: number; total: number; grand_total: number;
}

export interface TimelineEntry { status: OrderStatus; label: string; at: TimestampLike; by: string | null; note?: string | null }

export interface OrderDoc {
  order_number: string; user_id: string; customer: { name: string; phone: string | null; email: string | null };
  store_id: string | null; zone_id: string | null; country_id: string | null;
  address: (Partial<AddressDoc> & { full_address?: string; self_pickup?: boolean; store?: string }) | null;
  mode: Mode; delivery_type: 'delivery' | 'self_pickup'; status: OrderStatus;
  payment_method: string; payment_status: PaymentStatus; transaction_id: string | null;
  items: OrderItem[]; totals: OrderTotals;
  promo_code: string | null; promo_code_id: string | null; promo_is_cashback: boolean;
  delivery_boy_id: string | null; delivery_boy: { name: string; phone: string | null; avatar: string | null; vehicle_number: string | null } | null;
  rider: { lat: number; lng: number; updated_at: TimestampLike } | null;
  timeline: TimelineEntry[]; cancel_reason: string | null; cancelled_by: string | null; notes: string | null;
  estimated_delivery_at: TimestampLike | null; assigned_at: TimestampLike | null; delivered_at: TimestampLike | null;
  invoice_path: string | null; can_cancel: boolean; all_cancelable: boolean; platform?: string | null; rejected_by?: string[];
  search_keywords: string[]; created_at: TimestampLike; updated_at: TimestampLike;
}

export type ReturnStatus = 'pending' | 'approved' | 'rejected' | 'pickup_assigned' | 'picked_up' | 'refund_completed';
export interface ReturnRequestDoc {
  return_number: string; order_id: string; order_number: string; user_id: string; item_variant_id: string; item_name: string;
  qty: number; reason: string; images: string[]; status: ReturnStatus; refund_amount: number; refund_method: 'wallet' | 'original';
  delivery_boy_id: string | null; admin_remark: string | null; store_id: string | null; zone_id?: string | null;
  /** copied from the order when a pickup rider is assigned (riders cannot read orders they did not deliver) */
  customer?: { name: string | null; phone: string | null } | null;
  address?: OrderDoc['address'];
  created_at: TimestampLike; updated_at?: TimestampLike;
}

export interface WithdrawalRequestDoc {
  user_id: string; user_type: 'customer' | 'delivery_boy'; user_name: string; amount: number; message: string | null;
  status: 'pending' | 'approved' | 'rejected'; remark: string | null; receipt_image: string | null;
  created_at: TimestampLike; processed_at: TimestampLike | null;
}

export interface CashCollectionDoc {
  delivery_boy_id: string; order_id: string | null; amount: number; type: 'collected_from_customer' | 'submitted_to_admin';
  message: string; created_at: TimestampLike;
}

export interface DeliveryEarningDoc {
  delivery_boy_id: string; order_id: string | null; amount: number; type: 'commission' | 'bonus' | 'salary';
  status: 'credited' | 'paid' | 'pending'; message?: string; created_at: TimestampLike;
}

export interface ReferralDoc {
  referrer_id: string; referred_id: string; referred_name: string; referrer_reward: number; referred_reward: number;
  min_order: number; status: 'pending' | 'credited'; created_at: TimestampLike;
}

/** Functions-only helper collections (not in the original spec; see Deviations). */
export interface PromoUsageDoc { promo_id: string; user_id: string; count: number }
export interface WalletRechargeDoc {
  user_id: string; amount: number; method: string; gateway_order_id: string | null;
  status: 'pending' | 'completed' | 'failed'; created_at: TimestampLike;
}

/* ------------------------------------------------------------------ Engagement & analytics */
export interface ChatDoc {
  user_id: string; user_uid: string; user_type: 'customer' | 'delivery_boy'; user_name: string;
  order_id: string | null; order_number: string | null; subject: string; status: 'open' | 'closed';
  last_message: { text: string; sender_type: string; at: TimestampLike } | null; last_message_at: TimestampLike | null;
  unread_admin: number; unread_user: number; created_at: TimestampLike; store_id?: string | null;
}
export interface ChatMessageDoc {
  user_uid: string; sender_id: string; sender_type: 'customer' | 'delivery_boy' | 'admin' | 'store'; sender_name: string;
  message: string; attachment: string | null; read_at: TimestampLike | null; created_at: TimestampLike;
}

export interface StatsBucket { orders: number; revenue: number }
export interface StatsDailyDoc {
  date: string; scope: string; orders: number; revenue: number; delivery_charges: number; tax: number; units: number;
  cancelled: number; returned: number; by_status: Record<string, number>;
  by_mode: Partial<Record<Mode, StatsBucket>>; by_category: Record<string, { revenue: number; units: number }>;
  by_hour: Record<string, StatsBucket>;
}

/* ------------------------------------------------------------------ Callable contracts */
export interface DetectZoneResult {
  deliverable: boolean;
  zone: (Zone & { id: string }) | null;
  store: { id: string; name: string; lat: number | null; lng: number | null; is_open: boolean } | null;
  distance_km: number | null;
  delivery_minutes: number | null;
}

export interface CartSummaryItem {
  line_id: string; product_id: string; variant_id: string; name: string; variant_name: string; image: string | null; slug: string;
  price: number; sale_price: number | null; unit_price: number; qty: number; line_total: number; tax_amount: number;
  in_stock: boolean; max_qty: number; stock: number; cod_allowed: boolean;
}

export interface CartSummaryResult {
  items: CartSummaryItem[]; item_count: number; total_qty: number; mrp_total: number;
  subtotal: number; savings: number; delivery_charge: number; delivery_charge_original: number; surge_charge: number;
  additional_charges: number; additional_charges_breakdown: { name: string; amount: number }[];
  tax: number; tax_inclusive: boolean;
  promo: { code: string; title: string | null; discount: number; is_cashback: boolean; free_delivery: boolean; message: string } | null;
  promo_error: string | null; wallet_balance: number; wallet_used: number; total: number; grand_total: number;
  min_order: number; min_order_remaining: number; can_checkout: boolean; issues: string[];
  free_delivery_remaining: number; free_delivery_above: number | null; distance_km: number | null; delivery_minutes: number | null;
  store: { id: string; name: string; is_open: boolean } | null; zone_id: string | null; mode: Mode;
  /** pricing basis: the delivery address, or the zone/store default (no address) */
  delivery_basis: 'address' | 'default';
}

export interface CouponListItem {
  code: string; title: string | null; description: string | null; image: string | null; banner_color: string | null;
  discount_type: string; discount_value: number; max_discount: number | null; min_order: number;
  applicable: boolean; discount: number; message: string | null; is_cashback: boolean;
}

export interface PaymentPayload {
  gateway: string; reference: string; gateway_order_id: string | null; client_secret?: string | null;
  redirect_url?: string | null; public_key?: string | null; amount: number; currency: string; extra?: Record<string, unknown>;
}

export interface PlaceOrderResult { order_id: string; order_number: string; payment: PaymentPayload | null }
