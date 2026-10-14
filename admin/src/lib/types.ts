// Firestore document shapes — mirrors docs/FIREBASE_BACKEND.md §3 (binding).
// Every doc read through the helpers in lib/firestore.ts also carries its `id`.
import type { Timestamp } from 'firebase/firestore';

export type Lang = 'en' | 'ar' | 'hi';
export type Trans = Partial<Record<Lang | string, string>>;
export type TS = Timestamp | null | undefined;
export type Mode = 'quick' | 'ecommerce';
export type Fulfillment = 'quick' | 'ecommerce' | 'both';
export type ActiveStatus = 'active' | 'inactive';
export type Role = 'customer' | 'delivery_boy' | 'admin' | 'staff' | 'store';

export interface WithId { id: string }

export interface Claims {
  role?: Role;
  store_id?: string;
  role_id?: string;
  zone_id?: string;
}

export interface PaymentMethodCfg { key: string; name: string; logo?: string; enabled: boolean; public_key?: string; mode?: string }
export interface PublicSettings {
  app_name?: string; tagline?: string; logo?: string; favicon?: string;
  support?: { phone?: string; email?: string; whatsapp?: string };
  social?: { facebook?: string; instagram?: string; twitter?: string; youtube?: string };
  default_country_id?: string; default_zone_id?: string; demo_mode?: boolean; tax_inclusive?: boolean;
  payment_methods?: PaymentMethodCfg[];
  referral?: { enabled?: boolean; referrer_reward?: number; referred_reward?: number; min_order?: number };
  wallet?: { min_recharge?: number; max_recharge?: number; min_withdraw?: number };
  cod?: { enabled?: boolean; max_amount?: number };
  app_versions?: { customer_min?: string; delivery_min?: string; force_update?: boolean };
  maintenance?: { app?: boolean; web?: boolean; message?: string };
  cookie_consent?: boolean | string; home_search_hints?: string[];
  [k: string]: any;
}

export interface Country extends WithId { name: string; iso2: string; dial_code: string; currency_code: string; currency_symbol: string; timezone?: string; date_format?: string; flag?: string; is_default?: boolean; status: ActiveStatus | boolean }
export interface LatLng { lat: number; lng: number }
export interface SurgeSlot { from: string; to: string; amount: number }
export interface AdditionalCharge { name: Trans; amount: number; refundable?: boolean }
export interface Zone extends WithId {
  country_id: string; name: string; slug?: string; city?: string; polygon: LatLng[]; center?: LatLng;
  fulfillment_type: Fulfillment; base_charge: number; base_distance_km: number; per_km_charge: number;
  free_delivery_above?: number | null; min_order: number; surge_slots: SurgeSlot[]; additional_charges: AdditionalCharge[];
  delivery_time_minutes: number; default_store_id?: string | null; status: ActiveStatus;
}
export interface Store extends WithId {
  zone_id: string; country_id: string; name: string; slug?: string; email?: string; phone?: string; address?: string; city?: string;
  lat?: number; lng?: number; logo?: string; banner?: string; opening_time?: string; closing_time?: string; fulfillment_type: Fulfillment;
  commission_percent?: number; status: ActiveStatus; is_open?: boolean; owner_uid?: string; orders_count?: number; revenue?: number;
}
export interface Language extends WithId { name: string; is_rtl?: boolean; is_default?: boolean; status: ActiveStatus | boolean }
export interface Translation extends WithId { language: string; platform: 'customer_app' | 'delivery_app' | 'website' | 'admin'; data: Record<string, string> }

export interface UserDoc extends WithId {
  type: Role; name: string; email?: string; phone?: string; avatar?: string; store_id?: string | null; role_id?: string | null;
  referral_code?: string; referred_by?: string | null; wallet_balance?: number; orders_count?: number; total_spent?: number;
  fcm_tokens?: string[]; status: ActiveStatus; language?: string; created_at?: TS; last_login_at?: TS; search_keywords?: string[];
}
export interface Address extends WithId { label?: string; name?: string; phone?: string; address_line?: string; landmark?: string; city?: string; state?: string; pincode?: string; country_id?: string; lat?: number; lng?: number; is_default?: boolean }
export interface UserNotification extends WithId { title: string; message: string; type?: string; data?: Record<string, any>; image?: string; read_at?: TS; created_at?: TS }
export interface WalletTxn extends WithId { type: 'credit' | 'debit'; amount: number; balance_after?: number; payment_type?: string; txn_id?: string; order_id?: string | null; message?: string; status?: string; created_at?: TS }

export interface DeliveryBoy extends WithId {
  zone_id?: string; country_id?: string; dob?: string; address?: string; vehicle_type?: string; vehicle_number?: string;
  driving_license?: string; id_proof?: string; bank?: { name?: string; account?: string; ifsc?: string };
  commission_type?: 'fixed' | 'percent'; commission_value?: number; salary?: number; cash_in_hand?: number; earnings_total?: number;
  rating_avg?: number; rating_count?: number; is_online?: boolean; location?: { lat: number; lng: number; updated_at?: TS };
  approval_status?: 'pending' | 'approved' | 'rejected'; status?: ActiveStatus; created_at?: TS;
  // denormalised for lists (may be absent — join users/{uid})
  name?: string; email?: string; phone?: string; avatar?: string;
}
export interface RoleDoc extends WithId { name: string; scope: 'admin' | 'store'; store_id?: string | null; permissions: string[] }

export interface Category extends WithId {
  parent_id: string | null; name: Trans; slug: string; image?: string; icon?: string; banner?: string; header_color?: string;
  sort_order?: number; status: ActiveStatus; show_in_quick?: boolean; show_in_ecommerce?: boolean; product_count?: number;
}
export interface Brand extends WithId { name: string; slug: string; logo?: string; status: ActiveStatus; sort_order?: number }
export interface AttributeValue { id: string; value: string; color_hex?: string | null }
export interface Attribute extends WithId { name: Trans; values: AttributeValue[] }
export interface Tax extends WithId { name: string; percent: number; status: ActiveStatus }
export interface Variant {
  id: string; name: string; sku?: string; attribute_value_ids?: string[]; attrs?: Record<string, string>;
  price: number; sale_price?: number | null; stock: number; low_stock_alert?: number; weight?: string | number; image?: string; status?: ActiveStatus;
}
export type ProductStatus = 'draft' | 'active' | 'inactive' | 'pending_approval';
export interface Product extends WithId {
  store_id: string | null; category_id: string; sub_category_id?: string | null; category_ids?: string[]; brand_id?: string | null; brand_name?: string;
  name: Trans; slug: string; short_description?: Trans; description?: Trans; images: string[]; thumbnail?: string;
  product_type: 'simple' | 'variable'; tax_id?: string | null; tax_percent?: number; is_veg?: boolean | null;
  return_allowed?: boolean; return_days?: number; cancelable?: boolean; cod_allowed?: boolean; max_qty_per_order?: number;
  fulfillment_type: Fulfillment; seo?: { title?: Trans; description?: Trans; keywords?: Trans }; schema_markup?: string; tags?: string[];
  attributes?: { name: string; values: string[] }[]; variants: Variant[]; cross_sell_ids?: string[]; up_sell_ids?: string[];
  rating_avg?: number; rating_count?: number; sold_count?: number; is_featured?: boolean; status: ProductStatus;
  min_price?: number; max_discount_percent?: number; in_stock_store_ids?: string[]; search_keywords?: string[]; created_at?: TS; updated_at?: TS;
}
export interface StoreStock extends WithId { store_id: string; product_id: string; variant_id: string; stock: number; price?: number | null; sale_price?: number | null; low_stock_alert?: number }
export interface Review extends WithId { product_id: string; user_id: string; user_name?: string; user_avatar?: string; order_id?: string; item_variant_id?: string; rating: number; comment?: string; images?: string[]; status: ActiveStatus | string; created_at?: TS }
export interface Banner extends WithId { title: Trans; subtitle?: Trans; image: string; link_type: 'product' | 'category' | 'url' | 'none'; link_value?: string; zone_id?: string | null; mode?: Mode | 'both'; status: ActiveStatus; sort_order?: number; store_id?: string | null }

export type SectionType = 'banner_slider' | 'category_section' | 'product_slider' | 'top_brands' | 'grid_banner' | 'title_image' | 'heading_text';
export interface HomeSection { id: string; type: SectionType; title: Trans | string; is_active: boolean; settings: Record<string, any> }
export interface HomeLayout extends WithId {
  zone_id: string; mode: Mode; category_id: string | null; header?: { bg_type: 'color' | 'image'; bg_value: string; text_color: string };
  /** home_layout_drafts/{id} (panel-only); legacy public docs may still carry it */
  draft_sections: HomeSection[];
  /** home_layouts/{id} (public, written by publishHomeLayout) */
  published_sections: HomeSection[]; is_published?: boolean; published_at?: TS; store_id?: string | null;
}

export interface PromoCode extends WithId {
  code: string; title?: Trans; description?: Trans; image?: string; banner_color?: string;
  discount_type: 'percent' | 'fixed' | 'free_delivery'; discount_value: number; max_discount?: number | null; min_order?: number;
  usage_limit_total?: number | null; usage_limit_per_user?: number | null; used_count?: number;
  starts_at?: TS; ends_at?: TS; is_permanent?: boolean; applies_to: 'all' | 'categories' | 'products' | 'stores'; applies_to_ids?: string[];
  audience: 'all' | 'new' | 'existing'; channels?: Mode[]; platforms?: ('app' | 'web')[]; zone_ids?: string[]; country_ids?: string[];
  time_from?: string | null; time_to?: string | null; is_instant?: boolean; is_cashback?: boolean; status: ActiveStatus; store_id?: string | null;
}
export interface Blog extends WithId { category_id?: string; title: Trans; slug: string; image?: string; excerpt?: Trans; content?: Trans; read_minutes?: number; views?: number; status: ActiveStatus | 'draft' | 'published'; published_at?: TS }
export interface BlogCategory extends WithId { name: Trans; slug: string; status?: ActiveStatus }
export interface Faq extends WithId { question: Trans; answer: Trans; sort?: number; sort_order?: number; status: ActiveStatus }
export interface PageDoc extends WithId { title: Trans; content: Trans; status?: ActiveStatus }

export type OrderStatus = 'payment_pending' | 'received' | 'processed' | 'shipped' | 'ready_for_pickup' | 'picked_up' | 'out_for_delivery' | 'delivered' | 'cancelled' | 'returned';
export interface OrderItem { variant_id: string; product_id: string; name: string; variant_name?: string; image?: string; price: number; sale_price?: number | null; qty: number; tax_amount?: number; total: number; status?: string; is_reviewed?: boolean; return_status?: string }
export interface OrderTotals { subtotal: number; savings?: number; discount?: number; promo_discount?: number; delivery_charge?: number; surge_charge?: number; additional_charges?: number; tax_amount?: number; wallet_used?: number; total: number; grand_total?: number }
export interface TimelineEntry { status: string; label?: string; at: TS | string; by?: string; note?: string }
export interface Order extends WithId {
  order_number: string; user_id: string; customer: { name?: string; phone?: string; email?: string }; store_id?: string; zone_id?: string; country_id?: string;
  address?: Address & { lat?: number; lng?: number }; mode: Mode; delivery_type: 'delivery' | 'self_pickup'; status: OrderStatus;
  payment_method: string; payment_status: 'pending' | 'paid' | 'failed' | 'refunded'; transaction_id?: string; items: OrderItem[]; totals: OrderTotals;
  promo_code?: string | null; promo_is_cashback?: boolean; delivery_boy_id?: string | null;
  delivery_boy?: { name?: string; phone?: string; avatar?: string; vehicle_number?: string } | null; rider?: { lat: number; lng: number; updated_at?: TS } | null;
  timeline?: TimelineEntry[]; cancel_reason?: string; cancelled_by?: string; notes?: string; estimated_delivery_at?: TS; assigned_at?: TS; delivered_at?: TS;
  invoice_path?: string; can_cancel?: boolean; search_keywords?: string[]; created_at?: TS; updated_at?: TS;
}
export interface ReturnRequest extends WithId {
  return_number: string; order_id: string; order_number?: string; user_id: string; item_variant_id: string; item_name?: string; qty: number; reason?: string; images?: string[];
  status: 'pending' | 'approved' | 'rejected' | 'pickup_assigned' | 'picked_up' | 'refund_completed'; refund_amount?: number; refund_method?: 'wallet' | 'original';
  delivery_boy_id?: string | null; admin_remark?: string; store_id?: string; created_at?: TS;
}
export interface WithdrawalRequest extends WithId { user_id: string; user_type: 'customer' | 'delivery_boy'; user_name?: string; amount: number; message?: string; status: 'pending' | 'approved' | 'rejected'; remark?: string; receipt_image?: string; created_at?: TS; processed_at?: TS }
export interface CashCollection extends WithId { delivery_boy_id: string; order_id?: string | null; amount: number; type: 'collected_from_customer' | 'submitted_to_admin'; message?: string; created_at?: TS }
export interface DeliveryEarning extends WithId { delivery_boy_id: string; order_id?: string | null; amount: number; type: 'commission' | 'bonus' | 'salary'; status: 'credited' | 'paid' | 'pending'; created_at?: TS }
export interface Referral extends WithId { referrer_id: string; referred_id: string; referred_name?: string; referrer_reward?: number; referred_reward?: number; status: string; created_at?: TS }

export interface Chat extends WithId {
  user_id: string; user_uid: string; user_type: 'customer' | 'delivery_boy'; user_name?: string; order_id?: string | null; order_number?: string; subject?: string;
  status: 'open' | 'closed'; last_message?: { text: string; sender_type: string; at: TS }; last_message_at?: TS; unread_admin?: number; unread_user?: number; created_at?: TS;
}
export interface ChatMessage extends WithId { user_uid: string; sender_id: string; sender_type: 'customer' | 'delivery_boy' | 'admin' | 'store'; sender_name?: string; message: string; attachment?: string | null; read_at?: TS; created_at?: TS }
export interface BroadcastNotification extends WithId { title: string; message: string; type?: string; link?: string; image?: string; target?: string; user_id?: string | null; sent_at?: TS; sent_count?: number }
export interface EmailTemplate extends WithId { subject: string; body: string; name?: string }

export interface StatsDaily extends WithId {
  date: string; scope: string; orders: number; revenue: number; delivery_charges: number; tax: number; units: number; cancelled: number; returned: number;
  by_status?: Record<string, number>; by_mode?: Record<string, { orders: number; revenue: number }>;
  by_category?: Record<string, { revenue: number; units: number }>; by_hour?: Record<string, { orders: number; revenue: number }>;
}
