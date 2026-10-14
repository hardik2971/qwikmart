/** The data-layer surface used by the UI — implemented by src/lib/fb (Firebase) and src/lib/mock/client (demo). */
import type {
  Address,
  AppNotification,
  AppSettings,
  Blog,
  BlogCategory,
  Brand,
  Cart,
  Category,
  Chat,
  ChatMessage,
  CmsPage,
  Country,
  Coupon,
  Faq,
  HomeData,
  Id,
  Order,
  OrderDetail,
  OrderItem,
  OrderTrack,
  Paginated,
  PaymentPayload,
  PlaceOrderPayload,
  Product,
  ProductDetail,
  ProductFacets,
  ProductFilters,
  ReferralData,
  ReturnRequest,
  SearchSuggestions,
  User,
  WalletData,
  Withdrawal,
  Zone,
  ZoneDetectResult,
} from './types';

export interface ReturnBody {
  order_id: Id;
  item: OrderItem;
  qty: number;
  reason: string;
  images?: File[];
}
export interface ReviewBody {
  order_id: Id;
  item: OrderItem;
  rating: number;
  comment: string;
  images?: File[];
}
export interface CreateChatBody {
  subject: string;
  order_id?: Id | null;
  order_number?: string | null;
  message?: string;
}
export type Unsubscribe = () => void;

export interface Api {
  /** True when orders / chats can be watched live (Firestore onSnapshot). */
  realtime: boolean;

  settings(): Promise<AppSettings>;
  countries(): Promise<Country[]>;
  zones(countryId?: Id): Promise<Zone[]>;
  detectZone(lat: number, lng: number): Promise<ZoneDetectResult>;

  profile(): Promise<User>;
  updateProfile(body: { name?: string; email?: string }): Promise<User>;
  uploadAvatar(file: File): Promise<User>;
  deleteProfile(): Promise<void>;

  home(categoryId?: Id | null): Promise<HomeData>;
  categories(): Promise<Category[]>;
  brands(): Promise<Brand[]>;
  products(filters?: ProductFilters): Promise<Paginated<Product>>;
  productFacets(categoryId?: Id): Promise<ProductFacets>;
  product(slug: string): Promise<ProductDetail>;
  suggestions(q: string): Promise<SearchSuggestions>;
  trending(): Promise<string[]>;

  blogs(params?: { category?: string; page?: number; q?: string }): Promise<Paginated<Blog>>;
  blog(slug: string): Promise<Blog & { related?: Blog[] }>;
  blogCategories(): Promise<BlogCategory[]>;
  faqs(): Promise<Faq[]>;
  page(slug: string): Promise<CmsPage>;

  /** Cart summary; checkout passes the selected address / delivery type so the server prices them. */
  cart(opts?: { address_id?: Id | null; delivery_type?: 'delivery' | 'self_pickup' }): Promise<Cart>;
  addToCart(variantId: Id, qty: number, productId?: Id): Promise<Cart>;
  updateCartItem(id: Id, qty: number): Promise<Cart>;
  removeCartItem(id: Id): Promise<Cart>;
  clearCart(): Promise<Cart>;
  promoCodes(): Promise<Coupon[]>;
  applyPromo(code: string): Promise<Cart>;
  removePromo(): Promise<Cart>;
  appliedPromo(): string | null;

  addresses(): Promise<Address[]>;
  addAddress(body: Omit<Address, 'id'>): Promise<Address>;
  updateAddress(id: Id, body: Partial<Address>): Promise<Address>;
  deleteAddress(id: Id): Promise<void>;

  placeOrder(body: PlaceOrderPayload): Promise<{ order: { id: Id; order_number: string }; payment: PaymentPayload | null }>;
  verifyPayment(orderId: Id, payload: Record<string, unknown>): Promise<void>;
  orders(status?: string, page?: number): Promise<Paginated<Order>>;
  order(id: Id): Promise<OrderDetail>;
  trackOrder(id: Id): Promise<OrderTrack>;
  /** Live order (+ tracking) updates. Only when `realtime`. */
  watchOrder?(id: Id, cb: (o: OrderDetail, track: OrderTrack) => void, onError?: (e: unknown) => void): Unsubscribe;
  cancelOrder(id: Id, reason: string): Promise<void>;
  reorder(id: Id): Promise<{ cart: Cart; message?: string }>;
  /** Signed invoice (PDF) URL, or null when only the printable HTML invoice is available. */
  invoiceUrl(id: Id): Promise<string | null>;
  createReturn(body: ReturnBody): Promise<ReturnRequest>;
  createReview(body: ReviewBody): Promise<void>;

  favorites(): Promise<Product[]>;
  addFavorite(productId: Id): Promise<void>;
  removeFavorite(productId: Id): Promise<void>;

  wallet(page?: number): Promise<WalletData>;
  rechargeWallet(amount: number, gateway: string): Promise<{ payment: PaymentPayload | null; recharge_id: string | null; completed?: boolean }>;
  verifyWalletRecharge(rechargeId: string, payload: Record<string, unknown>): Promise<{ balance?: number; message?: string }>;
  withdraw(amount: number, message: string): Promise<Withdrawal>;
  withdrawals(): Promise<Withdrawal[]>;
  referral(): Promise<ReferralData>;

  notifications(): Promise<AppNotification[]>;
  readAllNotifications(): Promise<void>;
  readNotification?(id: Id): Promise<void>;
  chats(): Promise<Chat[]>;
  createChat(body: CreateChatBody): Promise<Chat>;
  chatMessages(id: Id): Promise<ChatMessage[]>;
  sendChatMessage(id: Id, message: string): Promise<void>;
  watchChats?(cb: (chats: Chat[]) => void): Unsubscribe;
  watchChatMessages?(id: Id, cb: (messages: ChatMessage[]) => void): Unsubscribe;
  markChatRead?(id: Id): Promise<void>;
}
