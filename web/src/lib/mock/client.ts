/**
 * In-browser mock backend (NEXT_PUBLIC_USE_MOCK=true, or Firebase not configured).
 * Implements the same `Api` surface as the Firebase client (src/lib/fb) on top of the
 * localStorage-backed demo store in ./handlers — nothing here touches the network.
 */
import { ApiError } from '../errors';
import type { Api, CreateChatBody, ReturnBody, ReviewBody } from '../api-types';
import type {
  Address,
  ApiEnvelope,
  AppNotification,
  AppSettings,
  AuthResult,
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
  OrderTrack,
  Paginated,
  PaymentPayload,
  Product,
  ProductDetail,
  ProductFacets,
  ProductFilters,
  ReferralData,
  ReturnRequest,
  Review,
  SearchSuggestions,
  User,
  WalletData,
  Withdrawal,
  Zone,
  ZoneDetectResult,
} from '../types';

/* ------------------------------------------------------------------ */
/* Request context (mock "headers") — provided by the zustand stores     */
/* ------------------------------------------------------------------ */

export interface MockContext {
  mockToken?: string | null;
  language?: string;
  zoneId?: Id | null;
  mode?: 'quick' | 'ecommerce';
  guestToken?: string | null;
  countryId?: Id | null;
}

let contextProvider: () => MockContext = () => ({});
export function setMockContextProvider(fn: () => MockContext) {
  contextProvider = fn;
}

let unauthorized: () => void = () => {};
export function setMockUnauthorizedHandler(fn: () => void) {
  unauthorized = fn;
}

function headers(ctx: MockContext = contextProvider()): Record<string, string> {
  const h: Record<string, string> = { 'Accept-Language': ctx.language || 'en', 'X-Mode': ctx.mode || 'quick' };
  if (ctx.mockToken) h.Authorization = `Bearer ${ctx.mockToken}`;
  if (ctx.zoneId) h['X-Zone-Id'] = String(ctx.zoneId);
  if (ctx.guestToken) h['X-Guest-Token'] = ctx.guestToken;
  if (ctx.countryId) h['X-Country-Id'] = String(ctx.countryId);
  return h;
}

async function call<T>(method: string, route: string, opts: { params?: Record<string, unknown>; body?: unknown } = {}): Promise<ApiEnvelope<T>> {
  const { mockRequest } = await import('./handlers');
  try {
    return await mockRequest<T>(method, route, opts.params || {}, opts.body, headers());
  } catch (e) {
    if (e instanceof ApiError && e.status === 401 && contextProvider().mockToken) unauthorized();
    throw e;
  }
}

async function data<T>(method: string, route: string, opts?: { params?: Record<string, unknown>; body?: unknown }): Promise<T> {
  const env = await call<T>(method, route, opts);
  if (!env.success) throw new ApiError(env.message, 400, env.errors);
  return env.data;
}

async function page<T>(route: string, params?: Record<string, unknown>): Promise<Paginated<T>> {
  const env = await call<T[]>('GET', route, { params });
  const items = Array.isArray(env.data) ? env.data : [];
  return { items, meta: env.meta || { current_page: 1, last_page: 1, per_page: items.length, total: items.length } };
}

function productParams(f: ProductFilters): Record<string, unknown> {
  const p: Record<string, unknown> = {};
  if (f.q) p.q = f.q;
  if (f.category_id) p.category_id = f.category_id;
  if (f.brand_id !== undefined && f.brand_id !== '' && !(Array.isArray(f.brand_id) && !f.brand_id.length))
    p.brand_id = Array.isArray(f.brand_id) ? f.brand_id.join(',') : f.brand_id;
  if (f.min_price) p.min_price = f.min_price;
  if (f.max_price) p.max_price = f.max_price;
  if (f.sort) p.sort = f.sort;
  if (f.page) p.page = f.page;
  p.per_page = f.per_page || 20;
  if (f.attributes) for (const [k, vals] of Object.entries(f.attributes)) if (vals.length) p[`attributes[${k}][]`] = vals;
  return p;
}

/** Attribute facets for the listing sidebar (the mock has no facet endpoint). */
const MOCK_FACETS: ProductFacets = {
  price: null,
  brands: [],
  attributes: [
    {
      key: 'color',
      name: 'Color',
      values: [
        ['Black', '#111827'],
        ['White', '#F9FAFB'],
        ['Blue', '#2563EB'],
        ['Red', '#DC2626'],
        ['Pink', '#EC4899'],
        ['Gray', '#6B7280'],
      ].map(([value, color_hex], i) => ({ id: i + 1, value, color_hex })),
    },
    { key: 'size', name: 'Size', values: ['S', 'M', 'L', 'XL'].map((value, i) => ({ id: 100 + i, value, color_hex: null })) },
    { key: 'storage', name: 'Storage', values: ['256 GB', '512 GB'].map((value, i) => ({ id: 200 + i, value, color_hex: null })) },
  ],
};

let promo: string | null = null;

export const mockApi: Api = {
  realtime: false,

  settings: () => data<AppSettings>('GET', '/settings/app'),
  countries: () => data<Country[]>('GET', '/countries'),
  zones: (countryId) => data<Zone[]>('GET', '/zones', { params: countryId ? { country_id: countryId } : {} }),
  detectZone: (lat, lng) => data<ZoneDetectResult>('POST', '/zones/detect', { body: { lat, lng } }),

  profile: () => data<User>('GET', '/profile'),
  updateProfile: (body) => data<User>('PUT', '/profile', { body }),
  uploadAvatar: async () => {
    throw new ApiError('Profile photos can be changed once you are connected to QwikMart (not in demo mode).', 422);
  },
  deleteProfile: async () => {
    await data<null>('DELETE', '/profile');
  },

  home: (categoryId) => data<HomeData>('GET', '/home', { params: categoryId ? { category_id: categoryId } : {} }),
  categories: () => data<Category[]>('GET', '/categories', { params: { tree: 1 } }),
  brands: () => data<Brand[]>('GET', '/brands'),
  products: (filters = {}) => page<Product>('/products', productParams(filters)),
  productFacets: async () => MOCK_FACETS,
  product: (slug) => data<ProductDetail>('GET', `/products/${encodeURIComponent(slug)}`),
  suggestions: (q) => data<SearchSuggestions>('GET', '/search/suggestions', { params: { q } }),
  trending: async () => {
    const d = await data<string[] | { keywords?: string[] }>('GET', '/search/trending');
    return Array.isArray(d) ? d : d?.keywords || [];
  },

  blogs: (params = {}) => page<Blog>('/blogs', params),
  blog: (slug) => data<Blog & { related?: Blog[] }>('GET', `/blogs/${encodeURIComponent(slug)}`),
  blogCategories: () => data<BlogCategory[]>('GET', '/blog-categories'),
  faqs: () => data<Faq[]>('GET', '/faqs'),
  page: (slug) => data<CmsPage>('GET', `/pages/${encodeURIComponent(slug)}`),
  contact: async () => ({ ok: true, ticket: 'QM-DEMO01' }),

  cart: () => data<Cart>('GET', '/cart'),
  addToCart: (variantId, qty) => data<Cart>('POST', '/cart', { body: { product_variant_id: variantId, qty } }),
  updateCartItem: (id, qty) => data<Cart>('PUT', `/cart/${id}`, { body: { qty } }),
  removeCartItem: (id) => data<Cart>('DELETE', `/cart/${id}`),
  clearCart: () => data<Cart>('DELETE', '/cart'),
  promoCodes: () => data<Coupon[]>('GET', '/promo-codes'),
  applyPromo: async (code) => {
    const cart = await data<Cart>('POST', '/promo-codes/apply', { body: { code } });
    promo = cart?.promo?.code || code;
    return cart;
  },
  removePromo: async () => {
    promo = null;
    return data<Cart>('POST', '/promo-codes/apply', { body: { code: null } });
  },
  appliedPromo: () => promo,

  addresses: () => data<Address[]>('GET', '/addresses'),
  addAddress: (body) => data<Address>('POST', '/addresses', { body }),
  updateAddress: (id, body) => data<Address>('PUT', `/addresses/${id}`, { body }),
  deleteAddress: async (id) => {
    await data<null>('DELETE', `/addresses/${id}`);
  },

  placeOrder: async (body) => {
    const res = await data<{ order: Order; payment: PaymentPayload | null }>('POST', '/orders', { body });
    promo = null;
    return { order: { id: res.order.id, order_number: res.order.order_number }, payment: res.payment };
  },
  verifyPayment: async (id, payload) => {
    await data<Order>('POST', `/orders/${id}/payment/verify`, { body: payload });
  },
  orders: (status, p = 1) => page<Order>('/orders', { status: status || undefined, page: p }),
  order: (id) => data<OrderDetail>('GET', `/orders/${id}`),
  trackOrder: (id) => data<OrderTrack>('GET', `/orders/${id}/track`),
  cancelOrder: async (id, reason) => {
    await data<OrderDetail>('POST', `/orders/${id}/cancel`, { body: { reason } });
  },
  reorder: async (id) => {
    const env = await call<Cart>('POST', `/orders/${id}/reorder`);
    const cart = env.data && Array.isArray(env.data.items) && 'subtotal' in env.data ? env.data : await data<Cart>('GET', '/cart');
    return { cart, message: env.message };
  },
  invoiceUrl: async () => null,
  createReturn: (b: ReturnBody) => data<ReturnRequest>('POST', '/returns', { body: { order_item_id: b.item.id, qty: b.qty, reason: b.reason } }),
  createReview: async (b: ReviewBody) => {
    await data<Review>('POST', '/reviews', { body: { order_item_id: b.item.id, rating: b.rating, comment: b.comment } });
  },

  favorites: () => data<Product[]>('GET', '/favorites', { params: { per_page: 100 } }),
  addFavorite: async (id) => {
    await data<null>('POST', '/favorites', { body: { product_id: id } });
  },
  removeFavorite: async (id) => {
    await data<null>('DELETE', `/favorites/${id}`);
  },

  wallet: async (p = 1) => (await data<WalletData>('GET', '/wallet', { params: { page: p } })) as WalletData,
  rechargeWallet: async (amount, gateway) => {
    const res = await data<{ payment?: PaymentPayload; balance?: number }>('POST', '/wallet/recharge', { body: { amount, payment_method: gateway } });
    return { payment: res.payment ?? null, recharge_id: null, completed: true };
  },
  verifyWalletRecharge: async () => ({ message: 'Wallet recharged' }),
  withdraw: (amount, message) => data<Withdrawal>('POST', '/wallet/withdraw', { body: { amount, message } }),
  withdrawals: () => data<Withdrawal[]>('GET', '/wallet/withdrawals'),
  referral: () => data<ReferralData>('GET', '/referral'),

  notifications: () => data<AppNotification[]>('GET', '/notifications', { params: { per_page: 50 } }),
  readAllNotifications: async () => {
    await data<null>('POST', '/notifications/read-all');
  },
  chats: () => data<Chat[]>('GET', '/chats'),
  createChat: (body: CreateChatBody) => data<Chat>('POST', '/chats', { body: { ...body, message: body.message || body.subject } }),
  chatMessages: async (id) => {
    const res = await page<ChatMessage>(`/chats/${id}/messages`, { per_page: 100 });
    return [...res.items].sort((a, b) => Number(a.id) - Number(b.id));
  },
  sendChatMessage: async (id, message) => {
    await data<ChatMessage>('POST', `/chats/${id}/messages`, { body: { message } });
  },
};

/** Mock-mode sign-in (in-browser only). */
export const mockAuth = {
  otp: (body: { phone: string; country_code: string; otp: string; name?: string; referral_code?: string }) =>
    data<AuthResult>('POST', '/mock-auth/otp', { body }),
  login: (body: { email?: string; phone?: string; password: string }) => data<AuthResult>('POST', '/mock-auth/login', { body }),
  register: (body: { name: string; email: string; password: string; referral_code?: string }) =>
    data<AuthResult>('POST', '/mock-auth/register', { body }),
  syncCart: (guest_token: string) => data<Cart>('POST', '/cart/sync', { body: { guest_token } }),
  logout: () => data<null>('POST', '/auth/logout'),
};
