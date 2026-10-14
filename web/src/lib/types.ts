// QwikMart API types — mirrors docs/SPEC.md §4 / §5.

export type Mode = 'quick' | 'ecommerce';
/** Firestore document ids are strings; the in-browser mock uses numbers. */
export type Id = string | number;
export type FulfillmentType = 'quick' | 'ecommerce' | 'both';

export interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
  meta?: PaginationMeta;
  errors?: Record<string, string[]>;
}

export interface PaginationMeta {
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
}

export interface Paginated<T> {
  items: T[];
  meta: PaginationMeta;
}

export interface Country {
  id: Id;
  name: string;
  iso2: string;
  dial_code: string;
  currency_code: string;
  currency_symbol: string;
  timezone?: string;
  flag: string;
  is_default?: boolean;
}

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Zone {
  id: Id;
  country_id: Id;
  name: string;
  slug?: string;
  city: string;
  polygon?: LatLng[];
  fulfillment_type: FulfillmentType;
  free_delivery_above?: number | null;
  min_order?: number;
  delivery_time_minutes: number;
  default_store_id?: Id | null;
  center?: LatLng | null;
}

export interface Store {
  id: Id;
  name: string;
  slug: string;
  address?: string;
  city?: string;
  lat: number;
  lng: number;
  logo?: string | null;
  is_open?: boolean;
}

export interface ZoneDetectResult {
  zone: Zone | null;
  store: Store | null;
  distance_km: number;
  delivery_minutes: number;
  deliverable: boolean;
}

export interface Language {
  code: string;
  name: string;
  is_rtl: boolean;
  is_default?: boolean;
}

export interface PaymentGateway {
  key: string;
  name: string;
  public_key?: string | null;
  enabled: boolean;
}

export interface AppSettings {
  app_name: string;
  logo?: string;
  primary_color?: string;
  currency: { code: string; symbol: string };
  countries: Country[];
  languages: Language[];
  payment_gateways: PaymentGateway[];
  referral: { referrer_reward: number; referred_reward: number; min_order: number };
  demo_mode: boolean;
  support_phone: string;
  support_email: string;
  social_links: Record<string, string>;
  company_name?: string;
  company_address?: string;
  play_store_url?: string;
  app_store_url?: string;
  min_app_version?: string;
}

export interface User {
  id: Id;
  status?: string;
  language?: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  country_code?: string;
  avatar?: string | null;
  referral_code?: string;
  wallet_balance: number;
  type?: string;
}

/** Mock-mode sign-in result (the real API uses Firebase — see SessionResult in api.ts). */
export interface AuthResult {
  token: string;
  user: User;
  is_new?: boolean;
}

export interface Category {
  id: Id;
  parent_id: Id | null;
  name: string;
  slug: string;
  image?: string | null;
  icon?: string | null;
  banner?: string | null;
  header_color?: string | null;
  products_count?: number;
  children?: Category[];
}

export interface Brand {
  id: Id;
  name: string;
  slug: string;
  logo?: string | null;
}

export interface AttributeValue {
  id: Id;
  attribute: string; // e.g. "Size", "Color"
  value: string;
  color_hex?: string | null;
}

export interface Variant {
  id: Id;
  product_id: Id;
  name: string;
  sku?: string;
  price: number; // MRP
  sale_price: number | null;
  stock: number;
  image?: string | null;
  attributes?: AttributeValue[];
}

export interface ProductBase {
  id: Id;
  name: string;
  slug: string;
  thumbnail: string;
  images: string[];
  category_id: Id;
  category?: Pick<Category, 'id' | 'name' | 'slug'>;
  brand?: Brand | null;
  short_description?: string;
  is_veg?: boolean | null;
  rating_avg: number;
  rating_count: number;
  fulfillment_type: FulfillmentType;
  delivery_minutes?: number;
  max_qty_per_order?: number;
  variants: Variant[];
  is_favorite?: boolean;
  tags?: string[];
}

export type Product = ProductBase;

export interface Review {
  id: Id;
  user: { name: string; avatar?: string | null };
  rating: number;
  comment: string;
  images?: string[];
  created_at: string;
}

export interface ProductDetail extends ProductBase {
  description: string; // HTML
  return_allowed: boolean;
  return_days: number;
  cancelable: boolean;
  cod_allowed: boolean;
  seo_title?: string;
  seo_description?: string;
  rating_breakdown: Record<'1' | '2' | '3' | '4' | '5', number>;
  reviews: Review[];
  similar: Product[];
  cross_sell: Product[];
  up_sell: Product[];
  store?: Store | null;
  manufacturer?: string;
}

export interface Banner {
  id: Id;
  title?: string;
  subtitle?: string;
  image: string;
  tag?: string;
  bg?: string;
  link_type: 'product' | 'category' | 'url' | 'none';
  link_value?: string | null;
}

export type HomeSectionType =
  | 'banner_slider'
  | 'category_section'
  | 'product_slider'
  | 'top_brands'
  | 'grid_banner'
  | 'title_image'
  | 'heading_text';

export interface HomeSection {
  id: string;
  type: HomeSectionType;
  title?: string;
  subtitle?: string;
  settings?: Record<string, unknown>;
  items: Array<Banner | Category | Product | Brand>;
}

export interface HomeHeader {
  bg_type: 'color' | 'image';
  bg_value: string;
  text_color: string;
}

export interface HomeData {
  header: HomeHeader;
  categories: Category[];
  sections: HomeSection[];
}

export interface CartItem {
  id: Id;
  product_variant_id: Id;
  product_id: Id;
  product_name: string;
  product_slug: string;
  variant_name: string;
  image: string;
  price: number;
  sale_price: number | null;
  qty: number;
  stock: number;
  line_total: number;
  max_qty?: number;
  in_stock?: boolean;
}

export interface Coupon {
  id: Id;
  code: string;
  title: string;
  description: string;
  discount_type: 'percent' | 'fixed' | 'free_delivery';
  discount_value: number;
  max_discount?: number | null;
  min_order: number;
  banner_color?: string;
  ends_at?: string | null;
  is_applicable?: boolean;
  applicable?: boolean;
  discount?: number;
  message?: string | null;
  is_cashback?: boolean;
}

export interface CartPromo {
  code: string;
  discount: number;
  title?: string;
  is_cashback?: boolean;
  free_delivery?: boolean;
}

export interface Cart {
  items: CartItem[];
  subtotal: number;
  mrp_total?: number;
  savings: number;
  delivery_charge: number;
  surge_charge: number;
  /** Zone additional charges (packaging etc.) */
  additional_charges?: number;
  tax: number;
  promo: CartPromo | null;
  wallet_balance: number;
  total: number;
  free_delivery_remaining: number;
  // real API extras
  tax_inclusive?: boolean;
  grand_total?: number;
  wallet_used?: number;
  promo_error?: string | null;
  promo_discount?: number;
  min_order?: number;
  min_order_remaining?: number;
  can_checkout?: boolean;
  issues?: Array<string | { message?: string }>;
}

export interface Address {
  id: Id;
  label: 'Home' | 'Work' | 'Other';
  name: string;
  phone: string;
  address_line: string;
  landmark?: string;
  city: string;
  state: string;
  pincode: string;
  country_id?: Id;
  lat: number;
  lng: number;
  is_default: boolean;
}

export type OrderStatus =
  | 'payment_pending'
  | 'received'
  | 'processed'
  | 'shipped'
  | 'ready_for_pickup'
  | 'picked_up'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled'
  | 'returned';

export type PaymentMethod =
  | 'cod'
  | 'wallet'
  | 'stripe'
  | 'paypal'
  | 'razorpay'
  | 'cashfree'
  | 'phonepe'
  | 'paytabs'
  | 'midtrans'
  | 'paystack';

export interface OrderItem {
  id: Id;
  product_id: Id;
  product_variant_id: Id;
  /** Return status of this line (Firebase orders). */
  return_status?: string | null;
  product_name: string;
  product_slug?: string;
  variant_name: string;
  image: string;
  price: number;
  sale_price: number | null;
  qty: number;
  total: number;
  status: string;
  can_return?: boolean;
  can_review?: boolean;
}

export interface OrderStatusHistory {
  status: OrderStatus | string;
  note?: string;
  created_at: string;
}

export interface DeliveryBoy {
  name: string;
  phone: string;
  avatar?: string | null;
  lat?: number;
  lng?: number;
}

export interface Order {
  id: Id;
  order_number: string;
  mode: Mode;
  delivery_type: 'delivery' | 'self_pickup';
  status: OrderStatus;
  payment_method: PaymentMethod;
  payment_status: 'pending' | 'paid' | 'failed' | 'refunded';
  subtotal: number;
  discount: number;
  promo_discount: number;
  promo_code?: string | null;
  promo_is_cashback?: boolean;
  delivery_charge: number;
  /** surge + zone additional charges */
  surge_charge: number;
  additional_charges?: number;
  tax_amount: number;
  wallet_used: number;
  /** amount payable after wallet */
  total: number;
  /** order value before wallet */
  grand_total?: number;
  items_count: number;
  items?: OrderItem[];
  preview_images?: string[];
  status_label?: string;
  created_at: string;
  estimated_delivery_at?: string | null;
}

export interface OrderDetail extends Order {
  items: OrderItem[];
  address_snapshot: Partial<Address> | null;
  timeline: OrderStatusHistory[];
  delivery_otp: string | null;
  delivery_boy: DeliveryBoy | null;
  store?: Store | null;
  invoice_url?: string | null;
  can_cancel: boolean;
  can_return: boolean;
  notes?: string | null;
  cancel_reason?: string | null;
}

export interface OrderTrack {
  status: OrderStatus;
  delivery_boy: { lat: number | null; lng: number | null; updated_at?: string | null; name?: string; phone?: string } | null;
  store: { lat?: number | null; lng?: number | null; name?: string } | null;
  address: (Partial<LatLng> & { full_address?: string }) | null;
  eta_minutes: number | null;
}

export interface PlaceOrderPayload {
  address_id: Id | null;
  delivery_type: 'delivery' | 'self_pickup';
  payment_method: PaymentMethod;
  promo_code?: string;
  use_wallet: boolean;
  notes?: string;
}

export interface PaymentPayload {
  gateway: string;
  reference?: string;
  gateway_order_id?: string | null;
  client_secret?: string | null;
  redirect_url?: string | null;
  public_key?: string | null;
  amount?: number;
  currency?: string;
  extra?: Record<string, unknown>;
}

export interface PlaceOrderResult {
  order: Order;
  payment: PaymentPayload | null;
}

export interface ReturnRequest {
  id: Id;
  return_number: string;
  order_item_id?: Id;
  qty: number;
  reason: string;
  status: string;
  refund_amount: number;
  created_at: string;
}

export interface WalletTxn {
  id: Id;
  type: 'credit' | 'debit';
  amount: number;
  balance_after: number;
  payment_type: string;
  txn_id?: string | null;
  order_id?: Id | null;
  message: string;
  status: 'pending' | 'success' | 'failed';
  created_at: string;
}

export interface WalletData {
  balance: number;
  transactions: WalletTxn[];
  meta?: PaginationMeta;
}

export interface Withdrawal {
  id: Id;
  amount: number;
  message: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

export interface ReferralData {
  code: string;
  referrer_reward: number;
  referred_reward: number;
  min_order: number;
  total_earned: number;
  referrals: Array<{ name: string; status: 'pending' | 'credited'; reward: number; created_at: string }>;
}

export interface AppNotification {
  id: Id;
  title: string;
  message: string;
  type?: string;
  link?: string | null;
  image?: string | null;
  read_at: string | null;
  created_at: string;
}

export interface ChatMessage {
  /** Firestore: sender uid. */
  sender_id?: string;
  id: Id;
  sender_type: 'admin' | 'customer' | 'delivery_boy' | 'store';
  message: string;
  attachment?: string | null;
  created_at: string;
  read_at?: string | null;
}

export interface Chat {
  id: Id;
  subject: string;
  order_id?: Id | null;
  status: 'open' | 'closed';
  last_message_at: string;
  last_message?: string;
  unread_user?: number;
}

export interface BlogCategory {
  id: Id;
  name: string;
  slug: string;
  posts_count?: number;
}

export interface Blog {
  id: Id;
  title: string;
  slug: string;
  image: string;
  excerpt: string;
  content?: string;
  category?: BlogCategory;
  read_minutes: number;
  views: number;
  created_at: string;
}

export interface Faq {
  id: Id;
  question: string;
  answer: string;
}

export interface CmsPage {
  slug: string;
  title: string;
  content: string;
}

export interface SearchSuggestions {
  products: Array<Pick<Product, 'id' | 'name' | 'slug' | 'thumbnail'>>;
  categories: Array<Pick<Category, 'id' | 'name' | 'slug'>>;
}

export interface ProductFilters {
  q?: string;
  category_id?: number | string;
  brand_id?: Array<number | string> | number | string;
  min_price?: number;
  max_price?: number;
  sort?: 'price_asc' | 'price_desc' | 'newest' | 'popular' | 'rating' | 'discount' | '';
  attributes?: Record<string, string[]>;
  page?: number;
  per_page?: number;
}

export interface FacetValue {
  id: Id;
  value: string;
  color_hex?: string | null;
}

export interface ProductFacets {
  price: { min: number; max: number } | null;
  brands: Brand[];
  attributes: Array<{ key: string; name: string; values: FacetValue[] }>;
  sorts?: Array<{ key: string; label: string }>;
}
