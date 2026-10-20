/**
 * In-browser demo backend (NEXT_PUBLIC_USE_MOCK=true). Route strings below are internal keys of this mock
 * only — no network requests are made. Mutable state (cart, orders, wallet, addresses, favourites, chats…) is persisted
 * to localStorage so the demo survives page reloads.
 */
import { ApiError } from '../errors';
import type {
  Id,
  Address,
  ApiEnvelope,
  AppNotification,
  AppSettings,
  Cart,
  CartItem,
  Category,
  Chat,
  ChatMessage,
  HomeData,
  HomeSection,
  Mode,
  OrderDetail,
  OrderItem,
  OrderStatus,
  OrderTrack,
  PaymentMethod,
  PlaceOrderPayload,
  Product,
  ReturnRequest,
  User,
  WalletTxn,
  Withdrawal,
} from '../types';
import {
  blogCategories,
  blogs,
  brands,
  catById,
  catBySlug,
  categories,
  cmsPages,
  countries,
  coupons,
  ecomBanners,
  faqs,
  gridBanners,
  parentOf,
  productSummary,
  products,
  quickBanners,
  reviewsFor,
  stores,
  titleImage,
  trendingSearches,
  zones,
} from './data';

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

interface CartLine {
  id: number;
  variantId: Id;
  qty: number;
}

interface MockState {
  carts: Record<string, CartLine[]>;
  promo: Record<string, string | null>;
  users: Array<User & { password: string; token: string }>;
  addresses: Address[];
  orders: OrderDetail[];
  wallet: WalletTxn[];
  withdrawals: Withdrawal[];
  favorites: Id[];
  notifications: AppNotification[];
  chats: Chat[];
  messages: Record<string, ChatMessage[]>;
  returns: ReturnRequest[];
  seq: number;
  trackStart: number;
}

const STORAGE_KEY = 'sb-mock-state-v1';
const MUMBAI_STORE = stores[0];
const HOME_ADDR = { lat: 19.1036, lng: 72.889 };

const now = () => new Date().toISOString();
const ago = (mins: number) => new Date(Date.now() - mins * 60000).toISOString();

function seedState(): MockState {
  const demoUser: User & { password: string; token: string } = {
    id: 1,
    name: 'Rajesh Sharma',
    email: 'customer@gmail.com',
    phone: '9876543210',
    country_code: '+91',
    avatar: null,
    referral_code: 'E579EC',
    wallet_balance: 2600,
    password: '123456',
    token: 'demo-token-customer',
  };

  const address: Address = {
    id: 1,
    label: 'Home',
    name: 'Rajesh Sharma',
    phone: '+91 9876543210',
    address_line: 'Flat 302, Sai Krupa CHS, Saki Naka',
    landmark: 'Near Saki Naka Metro',
    city: 'Mumbai',
    state: 'Maharashtra',
    pincode: '400072',
    country_id: 1,
    lat: HOME_ADDR.lat,
    lng: HOME_ADDR.lng,
    is_default: true,
  };

  const mkItems = (ids: Array<[number, number]>): OrderItem[] =>
    ids.map(([pid, qty], i) => {
      const p = products[pid - 1];
      const v = p.variants[0];
      const unit = v.sale_price ?? v.price;
      return {
        id: pid * 10 + i,
        product_id: p.id,
        product_variant_id: v.id,
        product_name: p.name,
        product_slug: p.slug,
        variant_name: v.name,
        image: p.thumbnail,
        price: v.price,
        sale_price: v.sale_price,
        qty,
        total: unit * qty,
        status: 'received',
      };
    });

  const mkOrder = (
    id: number,
    status: OrderStatus,
    items: OrderItem[],
    minsAgo: number,
    pm: PaymentMethod,
    mode: Mode = 'quick',
  ): OrderDetail => {
    const subtotal = items.reduce((s, i) => s + i.total, 0);
    const delivery = subtotal >= 199 ? 0 : 25;
    const flow: OrderStatus[] =
      status === 'cancelled'
        ? ['received', 'cancelled']
        : ['received', 'processed', 'shipped', 'out_for_delivery', 'delivered'].slice(
            0,
            ['received', 'processed', 'shipped', 'out_for_delivery', 'delivered'].indexOf(status) + 1,
          ) as OrderStatus[];
    return {
      id,
      order_number: `SB-ORD-${String(id).padStart(5, '0')}`,
      mode,
      delivery_type: 'delivery',
      status,
      payment_method: pm,
      payment_status: status === 'delivered' || pm !== 'cod' ? 'paid' : 'pending',
      subtotal,
      discount: items.reduce((s, i) => s + (i.price - (i.sale_price ?? i.price)) * i.qty, 0),
      promo_discount: 0,
      delivery_charge: delivery,
      surge_charge: 0,
      tax_amount: 0,
      wallet_used: 0,
      total: subtotal + delivery,
      items_count: items.length,
      items: items.map((i) => ({ ...i, status, can_return: status === 'delivered', can_review: status === 'delivered' })),
      created_at: ago(minsAgo),
      estimated_delivery_at: ago(minsAgo - 12),
      address_snapshot: address,
      timeline: flow.map((s, k) => ({ status: s, note: statusNote(s), created_at: ago(minsAgo - (k * minsAgo) / (flow.length + 1)) })),
      delivery_otp: String(100000 + ((id * 7919) % 900000)),
      delivery_boy:
        status === 'out_for_delivery' || status === 'delivered' || status === 'shipped'
          ? { name: 'Alex Johnson', phone: '+91 9820012345', avatar: null, lat: MUMBAI_STORE.lat, lng: MUMBAI_STORE.lng }
          : null,
      store: MUMBAI_STORE,
      invoice_url: null,
      can_cancel: ['received', 'processed', 'payment_pending'].includes(status),
      can_return: status === 'delivered',
      notes: null,
      cancel_reason: status === 'cancelled' ? 'Ordered by mistake' : null,
    };
  };

  const orders = [
    mkOrder(142, 'out_for_delivery', mkItems([[11, 1], [12, 1], [20, 2]]), 6, 'cod'),
    mkOrder(141, 'received', mkItems([[27, 1], [30, 2]]), 30, 'razorpay'),
    mkOrder(138, 'delivered', mkItems([[3, 1], [5, 1], [25, 2]]), 60 * 26, 'wallet'),
    mkOrder(131, 'delivered', mkItems([[53, 1]]), 60 * 24 * 6, 'stripe', 'ecommerce'),
    mkOrder(127, 'cancelled', mkItems([[33, 3]]), 60 * 24 * 12, 'cod'),
  ];

  const wallet: WalletTxn[] = [
    { id: 6, type: 'credit', amount: 200, balance_after: 2600, payment_type: 'paystack', txn_id: 'TXN1784431908', message: 'Wallet successfully recharged.', status: 'success', created_at: ago(60 * 3) },
    { id: 5, type: 'debit', amount: 364.45, balance_after: 2400, payment_type: 'wallet', order_id: 138, message: 'Used against Order Placement', status: 'success', created_at: ago(60 * 26) },
    { id: 4, type: 'credit', amount: 100, balance_after: 2764.45, payment_type: 'referral', message: 'Referral reward — Priya Nair joined', status: 'success', created_at: ago(60 * 24 * 3) },
    { id: 3, type: 'credit', amount: 50, balance_after: 2664.45, payment_type: 'cashback', message: 'WALLETCASH50 cashback', status: 'success', created_at: ago(60 * 24 * 5) },
    { id: 2, type: 'debit', amount: 297.25, balance_after: 2614.45, payment_type: 'wallet', order_id: 120, message: 'Used against Order Placement', status: 'success', created_at: ago(60 * 24 * 8) },
    { id: 1, type: 'credit', amount: 2911.7, balance_after: 2911.7, payment_type: 'razorpay', txn_id: 'TXN1784401120', message: 'Wallet successfully recharged.', status: 'success', created_at: ago(60 * 24 * 10) },
  ];

  const notifications: AppNotification[] = [
    { id: 1, title: 'Your order is on the way 🚴', message: 'Alex Johnson is out for delivery with order SB-ORD-00142.', type: 'order', link: '/orders/142', read_at: null, created_at: ago(5) },
    { id: 2, title: 'Happy Hour is live!', message: 'Use HAPPYHOUR to get 15% off up to ₹100 till 9 PM.', type: 'promotion', link: '/cart', read_at: null, created_at: ago(90) },
    { id: 3, title: '₹100 referral reward credited', message: 'Priya Nair placed her first order. ₹100 added to your wallet.', type: 'default', link: '/wallet', read_at: ago(60 * 24), created_at: ago(60 * 24 * 3) },
    { id: 4, title: 'Fresh Alphonso mangoes are here', message: 'Hapus season is back — order now and get it in 8 minutes.', type: 'product', link: '/product/alphonso-mango-hapus', read_at: ago(60 * 24 * 4), created_at: ago(60 * 24 * 4) },
  ];

  const chat: Chat = { id: 1, subject: 'Order SB-ORD-00142', order_id: 142, status: 'open', last_message_at: ago(20), last_message: 'Thank you. Could you please provide the correct delivery address?' };
  const messages: ChatMessage[] = [
    { id: 1, sender_type: 'customer', message: 'hello', created_at: ago(26) },
    { id: 2, sender_type: 'customer', message: 'when can i expect my order?', created_at: ago(25) },
    { id: 3, sender_type: 'admin', message: "Hello! I'd be happy to help. Please provide your order ID and the information you'd like to update.", created_at: ago(24) },
    { id: 4, sender_type: 'customer', message: 'My order ID is SB-ORD-00142. I entered the wrong delivery address.', created_at: ago(22) },
    { id: 5, sender_type: 'admin', message: 'Thank you. Could you please provide the correct delivery address?', created_at: ago(20) },
  ];

  return {
    carts: {},
    promo: {},
    users: [demoUser],
    addresses: [address],
    orders,
    wallet,
    withdrawals: [{ id: 1, amount: 500, message: 'Withdraw to bank', status: 'approved', created_at: ago(60 * 24 * 15) }],
    favorites: [3, 19, 27, 53],
    notifications,
    chats: [chat],
    messages: { 1: messages },
    returns: [],
    seq: 1000,
    trackStart: Date.now(),
  };
}

let state: MockState | null = null;

function load(): MockState {
  if (state) return state;
  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        state = JSON.parse(raw) as MockState;
        return state;
      }
    } catch {
      /* ignore */
    }
  }
  state = seedState();
  return state;
}

function save() {
  if (typeof window === 'undefined' || !state) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* quota — ignore */
  }
}

const nextId = () => ++load().seq;

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function ok<T>(data: T, message = 'OK', meta?: ApiEnvelope<T>['meta']): ApiEnvelope<T> {
  return { success: true, message, data, ...(meta ? { meta } : {}) };
}

function paginate<T>(items: T[], params: Record<string, unknown>) {
  const per = Number(params.per_page) || 20;
  const pageNo = Math.max(1, Number(params.page) || 1);
  const total = items.length;
  return {
    items: items.slice((pageNo - 1) * per, pageNo * per),
    meta: { current_page: pageNo, last_page: Math.max(1, Math.ceil(total / per)), per_page: per, total },
  };
}

function statusNote(s: string) {
  const m: Record<string, string> = {
    payment_pending: 'Awaiting payment',
    received: 'Your order has been placed',
    processed: 'Your order is being prepared',
    shipped: 'Your order is ready for pickup by the delivery partner',
    ready_for_pickup: 'Ready for pickup at store',
    picked_up: 'Your order has been picked up',
    out_for_delivery: 'Your order is out for delivery',
    delivered: 'Your order has been delivered',
    cancelled: 'Your order has been cancelled',
    returned: 'Your order has been returned',
  };
  return m[s] || s;
}

interface Ctx {
  mode: Mode;
  user: (User & { password: string; token: string }) | null;
  cartKey: string;
  lang: string;
}

function ctxFrom(headers: Record<string, string>): Ctx {
  const st = load();
  const token = headers.Authorization?.replace('Bearer ', '') || null;
  const user = token ? st.users.find((u) => u.token === token) || null : null;
  return {
    mode: headers['X-Mode'] === 'ecommerce' ? 'ecommerce' : 'quick',
    user,
    cartKey: user ? `user:${user.id}` : `guest:${headers['X-Guest-Token'] || 'anon'}`,
    lang: headers['Accept-Language'] || 'en',
  };
}

function requireUser(ctx: Ctx) {
  if (!ctx.user) throw new ApiError('Unauthenticated.', 401);
  return ctx.user;
}

const visibleInMode = (p: { fulfillment_type: string }, mode: Mode) =>
  p.fulfillment_type === 'both' || p.fulfillment_type === mode;

const catVisible = (c: { show_in_quick: boolean; show_in_ecommerce: boolean }, mode: Mode) =>
  mode === 'quick' ? c.show_in_quick : c.show_in_ecommerce;

function withFav(p: Product): Product {
  return { ...p, is_favorite: load().favorites.includes(p.id) };
}

function inCategory(productCategoryId: Id, catId: Id) {
  if (productCategoryId === catId) return true;
  const c = catById(productCategoryId);
  return c?.parent_id === catId;
}

function findVariant(variantId: Id) {
  for (const p of products) {
    const v = p.variants.find((x) => x.id === variantId);
    if (v) return { p, v };
  }
  return null;
}

const unitPrice = (v: { price: number; sale_price: number | null }) => v.sale_price ?? v.price;
const round2 = (n: number) => Math.round(n * 100) / 100;

/* ------------------------------------------------------------------ */
/* Cart                                                                */
/* ------------------------------------------------------------------ */

function promoDiscount(code: string | null | undefined, subtotal: number, delivery: number) {
  if (!code) return { promo: null, delivery };
  const c = coupons.find((x) => x.code === code);
  if (!c || subtotal < c.min_order) return { promo: null, delivery };
  if (c.discount_type === 'free_delivery') return { promo: { code: c.code, discount: delivery, title: c.title }, delivery };
  let d = c.discount_type === 'percent' ? (subtotal * c.discount_value) / 100 : c.discount_value;
  if (c.max_discount) d = Math.min(d, c.max_discount);
  return { promo: { code: c.code, discount: round2(d), title: c.title }, delivery };
}

function buildCart(ctx: Ctx): Cart {
  const st = load();
  const lines = st.carts[ctx.cartKey] || [];
  const items: CartItem[] = [];
  for (const l of lines) {
    const f = findVariant(l.variantId);
    if (!f) continue;
    items.push({
      id: l.id,
      product_variant_id: f.v.id,
      product_id: f.p.id,
      product_name: f.p.name,
      product_slug: f.p.slug,
      variant_name: f.v.name,
      image: f.v.image || f.p.thumbnail,
      price: f.v.price,
      sale_price: f.v.sale_price,
      qty: l.qty,
      stock: f.v.stock,
      line_total: round2(unitPrice(f.v) * l.qty),
    });
  }
  const subtotal = round2(items.reduce((s, i) => s + i.line_total, 0));
  const mrpTotal = round2(items.reduce((s, i) => s + i.price * i.qty, 0));
  const freeAbove = ctx.mode === 'quick' ? 199 : 499;
  const baseDelivery = items.length === 0 ? 0 : subtotal >= freeAbove ? 0 : ctx.mode === 'quick' ? 25 : 49;
  const hour = new Date().getHours();
  const surge = items.length && ctx.mode === 'quick' && hour >= 18 && hour < 21 ? 10 : 0;
  const { promo } = promoDiscount(st.promo[ctx.cartKey], subtotal, baseDelivery);
  const total = Math.max(0, round2(subtotal + baseDelivery + surge - (promo?.discount || 0)));
  return {
    items,
    subtotal,
    mrp_total: mrpTotal,
    savings: round2(mrpTotal - subtotal + (promo?.discount || 0)),
    delivery_charge: baseDelivery,
    surge_charge: surge,
    tax: 0,
    promo,
    wallet_balance: ctx.user ? walletBalance() : 0,
    total,
    free_delivery_remaining: items.length ? Math.max(0, round2(freeAbove - subtotal)) : freeAbove,
  };
}

function walletBalance() {
  const w = load().wallet;
  return w.length ? w[0].balance_after : 0;
}

function addWallet(type: 'credit' | 'debit', amount: number, payment_type: string, message: string, extra: Partial<WalletTxn> = {}) {
  const st = load();
  const bal = round2(walletBalance() + (type === 'credit' ? amount : -amount));
  st.wallet.unshift({ id: nextId(), type, amount: round2(amount), balance_after: bal, payment_type, message, status: 'success', created_at: now(), ...extra });
  const u = st.users[0];
  if (u) u.wallet_balance = bal;
}

/* ------------------------------------------------------------------ */
/* Home                                                                */
/* ------------------------------------------------------------------ */

function homeFor(mode: Mode, categoryId: number | null): HomeData {
  const tops = categories.filter((c) => c.parent_id === null && catVisible(c, mode));
  const visible = products.filter((p) => visibleInMode(p, mode)).map(productSummary).map(withFav);
  const sections: HomeSection[] = [];
  const cat = categoryId ? catById(categoryId) : null;
  const pick = (filter: (p: Product) => boolean, n = 12) => visible.filter(filter).slice(0, n);

  if (cat) {
    const subs = categories.filter((c) => c.parent_id === cat.id);
    const inCat = (p: Product) => inCategory(p.category_id, cat.id);
    const banners = (mode === 'quick' ? quickBanners : ecomBanners).filter((b) => b.link_value === cat.slug);
    sections.push({
      id: 'b1',
      type: 'banner_slider',
      items: banners.length ? banners : [{ id: 900 + Number(cat.id), image: cat.banner || '', link_type: 'none', title: `${cat.name}|Best Deals Today`, tag: cat.name.toUpperCase(), subtitle: `Top picks in ${cat.name}, delivered fast.`, bg: `linear-gradient(100deg,${cat.header_color}66 0%,${cat.header_color} 100%)` }],
    });
    sections.push({ id: 'c1', type: 'category_section', title: 'Shop by Category', subtitle: `Everything in ${cat.name}`, items: subs });
    sections.push({ id: 'p1', type: 'product_slider', title: `Best Sellers in ${cat.name}`, items: pick(inCat) });
    subs.forEach((s, i) => {
      const items = pick((p) => p.category_id === s.id);
      if (items.length) sections.push({ id: `ps${i}`, type: 'product_slider', title: s.name, settings: { category_slug: s.slug }, items });
    });
    return { header: { bg_type: 'color', bg_value: cat.header_color || '#EBEC8D', text_color: '#111827' }, categories: tops, sections };
  }

  const subs = categories
    .filter((c) => c.parent_id !== null && catVisible(c, mode))
    .sort((a, b) => (mode === "ecommerce" ? Number(a.show_in_quick) - Number(b.show_in_quick) : 0))
    .slice(0, 14);
  if (mode === 'quick') {
    sections.push({ id: 's1', type: 'banner_slider', items: quickBanners });
    sections.push({ id: 's2', type: 'category_section', title: 'Find Your Favorites', subtitle: 'Explore categories to find products you love.', items: subs });
    sections.push({ id: 's3', type: 'product_slider', title: 'Top Picks For You', items: pick((p) => p.rating_avg >= 4.3) });
    sections.push({ id: 's4', type: 'grid_banner', items: gridBanners('quick') });
    sections.push({ id: 's5', type: 'product_slider', title: 'Snacks & Munchies', settings: { category_slug: 'snacks' }, items: pick((p) => parentOf(p.category_id)?.slug === 'snacks') });
    sections.push({ id: 's6', type: 'title_image', title: 'Fresh Grocery', items: [titleImage('quick')] });
    sections.push({ id: 's7', type: 'product_slider', title: 'Fresh Fruits & Vegetables', settings: { category_slug: 'fresh-fruits-and-vegetables' }, items: pick((p) => parentOf(p.category_id)?.slug === 'fresh-fruits-and-vegetables') });
    sections.push({ id: 's8', type: 'top_brands', title: 'Top Brands', items: brands.slice(0, 14) });
    sections.push({ id: 's9', type: 'product_slider', title: 'Dairy, Bread & Eggs', settings: { category_slug: 'dairy-and-bakery' }, items: pick((p) => parentOf(p.category_id)?.slug === 'dairy-and-bakery') });
    sections.push({ id: 's10', type: 'heading_text', title: 'Groceries delivered in 8 minutes', subtitle: 'QwikMart brings 5,000+ products from your neighbourhood dark store to your door — fresh, fast and at the best prices.', items: [] });
  } else {
    sections.push({ id: 'e1', type: 'banner_slider', items: ecomBanners });
    sections.push({ id: 'e2', type: 'category_section', title: 'Shop by Category', subtitle: 'Discover the latest across electronics, fashion & home.', items: subs });
    sections.push({ id: 'e3', type: 'product_slider', title: 'Top Picks', items: pick((p) => p.fulfillment_type === 'ecommerce') });
    sections.push({ id: 'e4', type: 'grid_banner', items: gridBanners('ecommerce') });
    sections.push({ id: 'e5', type: 'top_brands', title: 'Top Brands', items: brands.filter((b) => ['boAt', 'Noise', 'Apple', 'Samsung', 'OnePlus', 'Levi\'s', 'Allen Solly', 'Prestige', 'Lakme', 'Mamaearth'].includes(b.name)) });
    sections.push({ id: 'e6', type: 'title_image', title: 'Swag Sale', items: [titleImage('ecommerce')] });
    sections.push({ id: 'e7', type: 'product_slider', title: 'Home & Kitchen Essentials', items: pick((p) => parentOf(p.category_id)?.slug === 'home-and-kitchen' || parentOf(p.category_id)?.slug === 'grocery') });
    sections.push({ id: 'e8', type: 'heading_text', title: 'Shop more, wait less', subtitle: 'Scheduled delivery in 1–4 days across your city, with easy returns.', items: [] });
  }
  return {
    header: { bg_type: 'color', bg_value: mode === 'quick' ? '#EBEC8D' : '#FDE2D6', text_color: '#111827' },
    categories: tops,
    sections: sections.filter((s) => s.type === 'heading_text' || s.items.length > 0),
  };
}

/* ------------------------------------------------------------------ */
/* Products                                                            */
/* ------------------------------------------------------------------ */

function listProducts(params: Record<string, unknown>, mode: Mode) {
  let list = products.filter((p) => visibleInMode(p, mode));
  const q = String(params.q || '').trim().toLowerCase();
  if (q) {
    list = list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.brand?.name.toLowerCase().includes(q) ||
        p.tags?.some((t) => t.toLowerCase().includes(q)),
    );
  }
  if (params.category_id) {
    const raw = String(params.category_id);
    const id = /^\d+$/.test(raw) ? Number(raw) : catBySlug(raw)?.id;
    if (id) list = list.filter((p) => inCategory(p.category_id, id));
  }
  if (params.brand_id) {
    const ids = String(params.brand_id).split(',').map(Number);
    list = list.filter((p) => p.brand && ids.includes(Number(p.brand.id)));
  }
  const min = Number(params.min_price) || 0;
  const max = Number(params.max_price) || Infinity;
  list = list.filter((p) => {
    const pr = unitPrice(p.variants[0]);
    return pr >= min && pr <= max;
  });
  for (const [k, v] of Object.entries(params)) {
    const m = k.match(/^attributes\[(.+)\]\[\]$/);
    if (!m) continue;
    const vals = (Array.isArray(v) ? v : [v]).map((x) => String(x).toLowerCase());
    const attr = m[1].toLowerCase();
    list = list.filter((p) =>
      p.variants.some((vv) => vv.attributes?.some((a) => a.attribute.toLowerCase() === attr && vals.includes(a.value.toLowerCase()))),
    );
  }
  const disc = (p: (typeof products)[number]) => {
    const v = p.variants[0];
    return v.sale_price ? (v.price - v.sale_price) / v.price : 0;
  };
  switch (params.sort) {
    case 'price_asc':
      list = [...list].sort((a, b) => unitPrice(a.variants[0]) - unitPrice(b.variants[0]));
      break;
    case 'price_desc':
      list = [...list].sort((a, b) => unitPrice(b.variants[0]) - unitPrice(a.variants[0]));
      break;
    case 'newest':
      list = [...list].sort((a, b) => a.created_order - b.created_order);
      break;
    case 'popular':
      list = [...list].sort((a, b) => b.popularity - a.popularity);
      break;
    case 'rating':
      list = [...list].sort((a, b) => b.rating_avg - a.rating_avg);
      break;
    case 'discount':
      list = [...list].sort((a, b) => disc(b) - disc(a));
      break;
  }
  return paginate(list.map(productSummary).map(withFav), params);
}

/* ------------------------------------------------------------------ */
/* Router                                                              */
/* ------------------------------------------------------------------ */

type Handler = (m: RegExpMatchArray, params: Record<string, unknown>, body: Record<string, unknown>, ctx: Ctx) => unknown;

const routes: Array<[string, RegExp, Handler]> = [];
const on = (method: string, pattern: string, h: Handler) => {
  const re = new RegExp('^' + pattern.replace(/\{(\w+)\}/g, '([^/]+)') + '$');
  routes.push([method, re, h]);
};

const settings: AppSettings = {
  app_name: 'QwikMart',
  logo: '/images/brand/qwikmart-logo.png',
  primary_color: '#0E9623',
  currency: { code: 'INR', symbol: '₹' },
  countries,
  languages: [
    { code: 'en', name: 'English', is_rtl: false, is_default: true },
    { code: 'ar', name: 'العربية', is_rtl: true },
    { code: 'hi', name: 'हिन्दी', is_rtl: false },
  ],
  payment_gateways: [
    { key: 'phonepe', name: 'PhonePe', enabled: true },
    { key: 'midtrans', name: 'Midtrans', enabled: true },
    { key: 'paystack', name: 'Paystack', enabled: true },
    { key: 'stripe', name: 'Stripe', enabled: true, public_key: 'pk_test_demo' },
    { key: 'paypal', name: 'PayPal', enabled: true },
    { key: 'razorpay', name: 'Razorpay', enabled: true, public_key: 'rzp_test_demo' },
    { key: 'cashfree', name: 'Cashfree', enabled: true },
    { key: 'cod', name: 'Cash on Delivery', enabled: true },
  ],
  referral: { referrer_reward: 100, referred_reward: 50, min_order: 100 },
  demo_mode: true,
  support_phone: '+91 8200323466',
  support_email: 'support@qwikmart.app',
  company_name: 'QwikMart Retail Pvt. Ltd.',
  company_address: '4th Floor, Trade Centre, Bandra Kurla Complex, Mumbai 400051',
  play_store_url: 'https://play.google.com/store/apps/details?id=com.qwikmartapp.customer',
  social_links: {
    facebook: 'https://facebook.com',
    instagram: 'https://instagram.com',
    x: 'https://x.com',
    youtube: 'https://youtube.com',
    whatsapp: 'https://wa.me/918200323466',
  },
  min_app_version: '1.0.0',
};

function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// settings & geo
on('GET', '/settings/app', () => settings);
on('GET', '/countries', () => countries);
on('GET', '/zones', (_m, p) => {
  const cid = Number(p.country_id) || 0;
  return zones.filter((z) => !cid || z.country_id === cid).map(({ center: _c, ...z }) => z);
});
on('POST', '/zones/detect', (_m, _p, b) => {
  const pt = { lat: Number(b.lat), lng: Number(b.lng) };
  let best: (typeof zones)[number] | null = null;
  let bestD = Infinity;
  for (const z of zones) {
    const d = haversine(pt, z.center);
    if (d < bestD) {
      bestD = d;
      best = z;
    }
  }
  if (!best || bestD > 60) return { zone: null, store: null, distance_km: 0, delivery_minutes: 0, deliverable: false };
  const store = stores.find((s) => s.zone_id === best!.id)!;
  const dist = Math.round(haversine(pt, store) * 100) / 100;
  const { center: _c, ...zone } = best;
  return { zone, store, distance_km: dist, delivery_minutes: Math.max(best.delivery_time_minutes, Math.round(6 + dist * 1.2)), deliverable: true };
});

// auth — mock mode only. The real API uses Firebase Authentication (docs/AUTH.md); these
// routes exist only inside the in-browser mock and are never sent over the network.
on('POST', '/mock-auth/otp', (_m, _p, b) => {
  if (String(b.otp) !== '123456') throw new ApiError('Invalid OTP. Use 123456 in demo mode.', 422, { otp: ['Invalid OTP. Use 123456 in demo mode.'] });
  const st = load();
  let u = st.users.find((x) => x.phone === String(b.phone));
  const isNew = !u;
  if (!u) {
    u = { id: nextId(), name: String(b.name || 'QwikMart User'), email: null, phone: String(b.phone), country_code: String(b.country_code || '+91'), avatar: null, referral_code: 'SB' + Math.random().toString(36).slice(2, 6).toUpperCase(), wallet_balance: walletBalance(), password: '', token: 'tok-' + Math.random().toString(36).slice(2) };
    st.users.push(u);
  }
  save();
  const { password: _pw, token, ...user } = u;
  return { token, user, is_new: isNew };
});
on('POST', '/mock-auth/login', (_m, _p, b) => {
  const st = load();
  const id = String(b.email || b.phone || '').toLowerCase();
  const u = st.users.find((x) => x.email?.toLowerCase() === id || x.phone === id);
  if (!u || (u.password && u.password !== String(b.password)))
    throw new ApiError('These credentials do not match our records.', 422, { email: ['These credentials do not match our records.'] });
  const { password: _pw, token, ...user } = u;
  return { token, user };
});
on('POST', '/mock-auth/register', (_m, _p, b) => {
  const st = load();
  if (st.users.some((u) => u.email === b.email)) throw new ApiError('The email has already been taken.', 422, { email: ['The email has already been taken.'] });
  const u = { id: nextId(), name: String(b.name), email: String(b.email), phone: b.phone ? String(b.phone) : null, country_code: '+91', avatar: null, referral_code: 'SB' + Math.random().toString(36).slice(2, 6).toUpperCase(), wallet_balance: 0, password: String(b.password), token: 'tok-' + Math.random().toString(36).slice(2) };
  st.users.push(u);
  save();
  const { password: _pw, token, ...user } = u;
  return { token, user, is_new: true };
});
on('POST', '/auth/logout', () => null);
on('GET', '/profile', (_m, _p, _b, ctx) => {
  const { password: _pw, token: _t, ...user } = requireUser(ctx);
  return { ...user, wallet_balance: walletBalance() };
});
on('PUT', '/profile', (_m, _p, b, ctx) => {
  const u = requireUser(ctx);
  Object.assign(u, { name: b.name ?? u.name, email: b.email ?? u.email });
  save();
  const { password: _pw, token: _t, ...user } = u;
  return user;
});
on('DELETE', '/profile', () => null);

// catalog
on('GET', '/home', (_m, p, _b, ctx) => homeFor(ctx.mode, p.category_id ? Number(p.category_id) : null));
on('GET', '/categories', (_m, p, _b, ctx) => {
  const vis = categories.filter((c) => catVisible(c, ctx.mode));
  if (p.tree) return vis.filter((c) => c.parent_id === null).map((c) => ({ ...c, children: vis.filter((s) => s.parent_id === c.id) }));
  if (p.parent_id !== undefined) return vis.filter((c) => c.parent_id === (Number(p.parent_id) || null));
  if (p.slug) return vis.filter((c) => c.slug === p.slug);
  return vis;
});
on('GET', '/brands', () => brands);
on('GET', '/products', (_m, p, _b, ctx) => listProducts(p, ctx.mode));
on('GET', '/products/{slug}', (m) => {
  const p = products.find((x) => x.slug === decodeURIComponent(m[1]) || String(x.id) === m[1]);
  if (!p) throw new ApiError('Product not found', 404);
  const parent = parentOf(p.category_id);
  const similar = products.filter((x) => x.id !== p.id && x.category_id === p.category_id).slice(0, 10);
  const more = products.filter((x) => x.id !== p.id && parentOf(x.category_id)?.id === parent?.id && !similar.includes(x));
  const cross = products.filter((x) => parentOf(x.category_id)?.id !== parent?.id && visibleInMode(x, p.fulfillment_type === 'ecommerce' ? 'ecommerce' : 'quick')).slice(Number(p.id) % 20, (Number(p.id) % 20) + 8);
  return {
    ...p,
    is_favorite: load().favorites.includes(p.id),
    reviews: reviewsFor(p.id, Math.min(5, p.rating_count)),
    similar: [...similar, ...more].slice(0, 10).map(productSummary).map(withFav),
    cross_sell: cross.map(productSummary).map(withFav),
    up_sell: [],
    store: MUMBAI_STORE,
  };
});
on('GET', '/products/{id}/reviews', (m, p) => {
  const prod = products.find((x) => String(x.id) === m[1]);
  return paginate(reviewsFor(Number(m[1]), Math.min(20, prod?.rating_count || 5)), p);
});
on('GET', '/search/suggestions', (_m, p, _b, ctx) => {
  const q = String(p.q || '').toLowerCase();
  if (!q) return { products: [], categories: [] };
  return {
    products: products
      .filter((x) => visibleInMode(x, ctx.mode) && x.name.toLowerCase().includes(q))
      .slice(0, 6)
      .map((x) => ({ id: x.id, name: x.name, slug: x.slug, thumbnail: x.thumbnail })),
    categories: categories.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 4).map((c) => ({ id: c.id, name: c.name, slug: c.slug })),
  };
});
on('GET', '/search/trending', () => trendingSearches);

// content
on('GET', '/blogs', (_m, p) => {
  let list = blogs;
  if (p.category) list = list.filter((b) => b.category?.slug === p.category);
  if (p.q) list = list.filter((b) => b.title.toLowerCase().includes(String(p.q).toLowerCase()));
  return paginate(list.map(({ content: _c, ...b }) => b), { per_page: 9, ...p });
});
on('GET', '/blogs/{slug}', (m) => {
  const b = blogs.find((x) => x.slug === decodeURIComponent(m[1]));
  if (!b) throw new ApiError('Blog not found', 404);
  return { ...b, related: blogs.filter((x) => x.id !== b.id).slice(0, 3) };
});
on('GET', '/blog-categories', () => blogCategories.map((c) => ({ ...c, posts_count: blogs.filter((b) => b.category?.id === c.id).length })));
on('GET', '/faqs', () => faqs);
on('GET', '/pages/{slug}', (m) => {
  const pg = cmsPages.find((x) => x.slug === m[1]);
  if (!pg) throw new ApiError('Page not found', 404);
  return pg;
});

// cart
on('GET', '/cart', (_m, _p, _b, ctx) => buildCart(ctx));
on('POST', '/cart', (_m, _p, b, ctx) => {
  const st = load();
  const vid = Number(b.product_variant_id);
  const f = findVariant(vid);
  if (!f) throw new ApiError('Variant not found', 404);
  if (f.v.stock <= 0) throw new ApiError('This item is out of stock', 422);
  const lines = (st.carts[ctx.cartKey] ||= []);
  const ex = lines.find((l) => l.variantId === vid);
  const qty = Math.max(1, Number(b.qty) || 1);
  if (ex) ex.qty = Math.min(f.p.max_qty_per_order || 10, ex.qty + qty);
  else lines.push({ id: nextId(), variantId: vid, qty });
  save();
  return buildCart(ctx);
});
on('PUT', '/cart/{id}', (m, _p, b, ctx) => {
  const st = load();
  const lines = st.carts[ctx.cartKey] || [];
  const l = lines.find((x) => x.id === Number(m[1]));
  if (!l) throw new ApiError('Cart item not found', 404);
  const qty = Number(b.qty);
  if (qty <= 0) st.carts[ctx.cartKey] = lines.filter((x) => x !== l);
  else {
    const f = findVariant(l.variantId);
    const max = Math.min(f?.p.max_qty_per_order || 10, f?.v.stock || 10);
    if (qty > max) throw new ApiError(`Only ${max} allowed per order`, 422);
    l.qty = qty;
  }
  save();
  return buildCart(ctx);
});
on('DELETE', '/cart/{id}', (m, _p, _b, ctx) => {
  const st = load();
  st.carts[ctx.cartKey] = (st.carts[ctx.cartKey] || []).filter((x) => x.id !== Number(m[1]));
  save();
  return buildCart(ctx);
});
on('DELETE', '/cart', (_m, _p, _b, ctx) => {
  const st = load();
  st.carts[ctx.cartKey] = [];
  st.promo[ctx.cartKey] = null;
  save();
  return buildCart(ctx);
});
on('POST', '/cart/sync', (_m, _p, b, ctx) => {
  const st = load();
  const guestKey = `guest:${b.guest_token}`;
  const guest = st.carts[guestKey] || [];
  const mine = (st.carts[ctx.cartKey] ||= []);
  for (const g of guest) {
    const ex = mine.find((l) => l.variantId === g.variantId);
    if (ex) ex.qty = Math.min(10, ex.qty + g.qty);
    else mine.push(g);
  }
  if (st.promo[guestKey]) st.promo[ctx.cartKey] = st.promo[guestKey];
  delete st.carts[guestKey];
  save();
  return buildCart(ctx);
});
on('GET', '/promo-codes', (_m, _p, _b, ctx) => {
  const cart = buildCart(ctx);
  return coupons.map((c) => ({ ...c, is_applicable: cart.subtotal >= c.min_order }));
});
on('POST', '/promo-codes/apply', (_m, _p, b, ctx) => {
  const st = load();
  if (!b.code) {
    st.promo[ctx.cartKey] = null;
    save();
    return buildCart(ctx);
  }
  const code = String(b.code).toUpperCase();
  const c = coupons.find((x) => x.code === code);
  if (!c) throw new ApiError('Invalid promo code', 422, { code: ['This promo code is invalid or expired.'] });
  const cart = buildCart(ctx);
  if (cart.subtotal < c.min_order)
    throw new ApiError(`Add ₹${round2(c.min_order - cart.subtotal)} more to use ${c.code}`, 422);
  st.promo[ctx.cartKey] = code;
  save();
  return buildCart(ctx);
});

// addresses
on('GET', '/addresses', (_m, _p, _b, ctx) => (requireUser(ctx), load().addresses));
on('POST', '/addresses', (_m, _p, b, ctx) => {
  requireUser(ctx);
  const st = load();
  const a = { ...(b as unknown as Address), id: nextId() };
  if (a.is_default || st.addresses.length === 0) {
    st.addresses.forEach((x) => (x.is_default = false));
    a.is_default = true;
  }
  st.addresses.push(a);
  save();
  return a;
});
on('PUT', '/addresses/{id}', (m, _p, b) => {
  const st = load();
  const a = st.addresses.find((x) => x.id === Number(m[1]));
  if (!a) throw new ApiError('Address not found', 404);
  if (b.is_default) st.addresses.forEach((x) => (x.is_default = false));
  Object.assign(a, b);
  save();
  return a;
});
on('DELETE', '/addresses/{id}', (m) => {
  const st = load();
  st.addresses = st.addresses.filter((x) => x.id !== Number(m[1]));
  save();
  return null;
});

// orders
function orderStatusNow(o: OrderDetail): OrderDetail {
  return o;
}
on('POST', '/orders', (_m, _p, b, ctx) => {
  requireUser(ctx);
  const body = b as unknown as PlaceOrderPayload;
  const st = load();
  const cart = buildCart(ctx);
  if (!cart.items.length) throw new ApiError('Your cart is empty', 422);
  const addr = st.addresses.find((a) => a.id === body.address_id) || null;
  if (body.delivery_type === 'delivery' && !addr) throw new ApiError('Please select a delivery address', 422);
  const delivery = body.delivery_type === 'self_pickup' ? 0 : cart.delivery_charge;
  let total = round2(cart.subtotal + delivery + cart.surge_charge - (cart.promo?.discount || 0));
  let walletUsed = 0;
  if (body.use_wallet || body.payment_method === 'wallet') {
    walletUsed = Math.min(walletBalance(), total);
    if (body.payment_method === 'wallet' && walletUsed < total) throw new ApiError('Insufficient wallet balance', 422);
  }
  const id = nextId();
  if (walletUsed > 0) addWallet('debit', walletUsed, 'wallet', 'Used against Order Placement', { order_id: id });
  total = round2(total - walletUsed);
  const pm: PaymentMethod = total === 0 && walletUsed > 0 ? 'wallet' : body.payment_method;
  const items: OrderItem[] = cart.items.map((i) => ({
    id: nextId(),
    product_id: i.product_id,
    product_variant_id: i.product_variant_id,
    product_name: i.product_name,
    product_slug: i.product_slug,
    variant_name: i.variant_name,
    image: i.image,
    price: i.price,
    sale_price: i.sale_price,
    qty: i.qty,
    total: i.line_total,
    status: 'received',
  }));
  const order: OrderDetail = {
    id,
    order_number: `SB-ORD-${String(id).padStart(5, '0')}`,
    mode: ctx.mode,
    delivery_type: body.delivery_type,
    status: 'received',
    payment_method: pm,
    payment_status: pm === 'cod' ? 'pending' : 'paid',
    subtotal: cart.subtotal,
    discount: round2((cart.mrp_total || cart.subtotal) - cart.subtotal),
    promo_discount: cart.promo?.discount || 0,
    delivery_charge: delivery,
    surge_charge: cart.surge_charge,
    tax_amount: 0,
    wallet_used: walletUsed,
    total,
    items_count: items.length,
    items,
    created_at: now(),
    estimated_delivery_at: new Date(Date.now() + (ctx.mode === 'quick' ? 10 : 60 * 48) * 60000).toISOString(),
    address_snapshot: addr,
    timeline: [{ status: 'received', note: statusNote('received'), created_at: now() }],
    delivery_otp: String(Math.floor(100000 + Math.random() * 900000)),
    delivery_boy: null,
    store: MUMBAI_STORE,
    invoice_url: null,
    can_cancel: true,
    can_return: false,
    notes: body.notes || null,
  };
  st.orders.unshift(order);
  st.carts[ctx.cartKey] = [];
  st.promo[ctx.cartKey] = null;
  st.notifications.unshift({ id: nextId(), title: 'Order placed 🎉', message: `Your order ${order.order_number} has been placed successfully.`, type: 'order', link: `/orders/${id}`, read_at: null, created_at: now() });
  save();
  const { items: _i, timeline: _t, ...summary } = order;
  return {
    order: summary,
    payment: pm === 'cod' || pm === 'wallet' ? null : { gateway: pm, gateway_order_id: `${pm}_order_${id}`, client_secret: `demo_secret_${id}`, redirect_url: null },
  };
});
on('POST', '/orders/{id}/payment/verify', (m) => {
  const o = load().orders.find((x) => x.id === Number(m[1]));
  if (!o) throw new ApiError('Order not found', 404);
  o.payment_status = 'paid';
  save();
  return o;
});

/** Demo progression: newly placed quick orders advance through statuses over time. */
function advance(o: OrderDetail) {
  if (o.status === 'cancelled' || o.status === 'delivered' || o.status === 'returned') return o;
  const age = (Date.now() - new Date(o.created_at).getTime()) / 60000;
  const flow: OrderStatus[] = ['received', 'processed', 'shipped', 'out_for_delivery'];
  const idx = Math.min(flow.length - 1, Math.floor(age / 1.5));
  const target = flow[Math.max(idx, flow.indexOf(o.status))];
  if (target !== o.status) {
    for (let k = flow.indexOf(o.status) + 1; k <= flow.indexOf(target); k++) {
      o.timeline.push({ status: flow[k], note: statusNote(flow[k]), created_at: now() });
    }
    o.status = target;
    o.can_cancel = ['received', 'processed'].includes(target);
    if (['shipped', 'out_for_delivery'].includes(target) && !o.delivery_boy)
      o.delivery_boy = { name: 'Alex Johnson', phone: '+91 9820012345', avatar: null, lat: MUMBAI_STORE.lat, lng: MUMBAI_STORE.lng };
    save();
  }
  return o;
}

on('GET', '/orders', (_m, p, _b, ctx) => {
  requireUser(ctx);
  let list = load().orders.map(advance).map(orderStatusNow);
  if (p.status) {
    const s = String(p.status);
    list = list.filter((o) =>
      s === 'active' ? !['delivered', 'cancelled', 'returned'].includes(o.status) : o.status === s,
    );
  }
  return paginate(list.map(({ timeline: _t, ...o }) => o), p);
});
on('GET', '/orders/{id}', (m, _p, _b, ctx) => {
  requireUser(ctx);
  const o = load().orders.find((x) => x.id === Number(m[1]));
  if (!o) throw new ApiError('Order not found', 404);
  advance(o);
  const st = load();
  return {
    ...o,
    items: o.items.map((i) => ({ ...i, status: st.returns.some((r) => r.order_item_id === i.id) ? 'return_requested' : i.status })),
  };
});
on('GET', '/orders/{id}/track', (m): OrderTrack => {
  const st = load();
  const o = st.orders.find((x) => x.id === Number(m[1]));
  if (!o) throw new ApiError('Order not found', 404);
  advance(o);
  const dest = o.address_snapshot?.lat ? { lat: Number(o.address_snapshot.lat), lng: Number(o.address_snapshot.lng) } : HOME_ADDR;
  const from = { lat: MUMBAI_STORE.lat, lng: MUMBAI_STORE.lng };
  // Rider loops along the route every 4 minutes so the map always shows movement.
  const t = o.status === 'out_for_delivery' ? ((Date.now() - st.trackStart) % 240000) / 240000 : o.status === 'delivered' ? 1 : 0;
  const wobble = Math.sin(t * Math.PI * 3) * 0.002;
  const pos = { lat: from.lat + (dest.lat - from.lat) * t + wobble, lng: from.lng + (dest.lng - from.lng) * t };
  return {
    status: o.status,
    delivery_boy: o.delivery_boy ? { ...pos, updated_at: now() } : null,
    store: from,
    address: dest,
    eta_minutes: o.status === 'delivered' ? 0 : Math.max(1, Math.round(8 * (1 - t))),
  };
});
on('POST', '/orders/{id}/cancel', (m, _p, b) => {
  const st = load();
  const o = st.orders.find((x) => x.id === Number(m[1]));
  if (!o) throw new ApiError('Order not found', 404);
  advance(o);
  if (!o.can_cancel) throw new ApiError('This order can no longer be cancelled', 422);
  o.status = 'cancelled';
  o.can_cancel = false;
  o.cancel_reason = String(b.reason || '');
  o.timeline.push({ status: 'cancelled', note: `Cancelled: ${o.cancel_reason}`, created_at: now() });
  if (o.wallet_used > 0 || o.payment_status === 'paid') {
    const refund = o.wallet_used + (o.payment_method !== 'cod' ? o.total : 0);
    if (refund > 0) addWallet('credit', refund, 'refund', `Refund for ${o.order_number}`, { order_id: o.id });
    o.payment_status = 'refunded';
  }
  save();
  return o;
});
on('POST', '/orders/{id}/reorder', (m, _p, _b, ctx) => {
  const st = load();
  const o = st.orders.find((x) => x.id === Number(m[1]));
  if (!o) throw new ApiError('Order not found', 404);
  const lines = (st.carts[ctx.cartKey] ||= []);
  for (const i of o.items) {
    const ex = lines.find((l) => l.variantId === i.product_variant_id);
    if (ex) ex.qty += i.qty;
    else lines.push({ id: nextId(), variantId: i.product_variant_id, qty: i.qty });
  }
  save();
  return buildCart(ctx);
});
on('POST', '/returns', (_m, _p, b, ctx) => {
  requireUser(ctx);
  const st = load();
  const r: ReturnRequest = {
    id: nextId(),
    return_number: `RET-${String(st.returns.length + 1).padStart(5, '0')}`,
    order_item_id: Number(b.order_item_id),
    qty: Number(b.qty) || 1,
    reason: String(b.reason || ''),
    status: 'pending',
    refund_amount: 0,
    created_at: now(),
  };
  st.returns.push(r);
  save();
  return r;
});
on('GET', '/returns', () => load().returns);
on('POST', '/reviews', (_m, _p, b, ctx) => ({
  id: nextId(),
  user: { name: requireUser(ctx).name },
  rating: Number(b.rating),
  comment: String(b.comment || ''),
  created_at: now(),
}));

// favorites
on('GET', '/favorites', (_m, _p, _b, ctx) => {
  requireUser(ctx);
  const favs = load().favorites;
  return products.filter((p) => favs.includes(p.id)).map(productSummary).map(withFav);
});
on('POST', '/favorites', (_m, _p, b, ctx) => {
  requireUser(ctx);
  const st = load();
  const id = Number(b.product_id);
  if (!st.favorites.includes(id)) st.favorites.push(id);
  save();
  return null;
});
on('DELETE', '/favorites/{id}', (m, _p, _b, ctx) => {
  requireUser(ctx);
  const st = load();
  st.favorites = st.favorites.filter((x) => x !== Number(m[1]));
  save();
  return null;
});

// wallet
on('GET', '/wallet', (_m, p, _b, ctx) => {
  requireUser(ctx);
  const pg = paginate(load().wallet, { per_page: 20, ...p });
  return { balance: walletBalance(), transactions: pg.items, meta: pg.meta };
});
on('POST', '/wallet/recharge', (_m, _p, b, ctx) => {
  requireUser(ctx);
  const amount = Number(b.amount);
  if (!amount || amount < 1) throw new ApiError('Enter a valid amount', 422);
  const gw = String(b.payment_method || 'razorpay');
  addWallet('credit', amount, gw, 'Wallet successfully recharged.', { txn_id: 'TXN' + Date.now() });
  save();
  return { payment: { gateway: gw, gateway_order_id: `${gw}_wallet_${Date.now()}`, redirect_url: null }, balance: walletBalance() };
});
on('POST', '/wallet/withdraw', (_m, _p, b, ctx) => {
  requireUser(ctx);
  const amount = Number(b.amount);
  if (!amount || amount > walletBalance()) throw new ApiError('Amount exceeds wallet balance', 422);
  const st = load();
  const w: Withdrawal = { id: nextId(), amount, message: String(b.message || ''), status: 'pending', created_at: now() };
  st.withdrawals.unshift(w);
  addWallet('debit', amount, 'withdrawal', 'Withdrawal request submitted');
  save();
  return w;
});
on('GET', '/wallet/withdrawals', () => load().withdrawals);
on('GET', '/referral', (_m, _p, _b, ctx) => {
  const u = requireUser(ctx);
  return {
    code: u.referral_code || 'E579EC',
    referrer_reward: 100,
    referred_reward: 50,
    min_order: 100,
    total_earned: 300,
    referrals: [
      { name: 'Priya Nair', status: 'credited', reward: 100, created_at: ago(60 * 24 * 3) },
      { name: 'Rohan Mehta', status: 'credited', reward: 100, created_at: ago(60 * 24 * 9) },
      { name: 'Kavya Iyer', status: 'credited', reward: 100, created_at: ago(60 * 24 * 20) },
      { name: 'Imran Shaikh', status: 'pending', reward: 100, created_at: ago(60 * 5) },
    ],
  };
});

// notifications
on('GET', '/notifications', (_m, _p, _b, ctx) => (requireUser(ctx), load().notifications));
on('POST', '/notifications/read-all', () => {
  load().notifications.forEach((n) => (n.read_at ||= now()));
  save();
  return null;
});

// chats
const autoReplies = [
  'Thanks for reaching out! Let me check that for you.',
  "I've updated your request. Is there anything else I can help you with?",
  'Our delivery partner has been informed. You will receive an update shortly.',
];
on('GET', '/chats', (_m, _p, _b, ctx) => (requireUser(ctx), load().chats));
on('POST', '/chats', (_m, _p, b, ctx) => {
  requireUser(ctx);
  const st = load();
  const c: Chat = { id: nextId(), subject: String(b.subject || 'Support'), order_id: (b.order_id as number) || null, status: 'open', last_message_at: now() };
  st.chats.unshift(c);
  st.messages[c.id] = [{ id: nextId(), sender_type: 'admin', message: 'Hi 👋 Welcome to QwikMart support. How can we help you today?', created_at: now() }];
  if (b.message) st.messages[c.id].push({ id: nextId(), sender_type: 'customer', message: String(b.message), created_at: now() });
  save();
  return c;
});
on('GET', '/chats/{id}/messages', (m, p) => {
  const msgs = (load().messages[Number(m[1])] || []).filter((x) => new Date(x.created_at).getTime() <= Date.now());
  return paginate(msgs, { per_page: 100, ...p });
});
on('POST', '/chats/{id}/messages', (m, _p, b) => {
  const st = load();
  const id = Number(m[1]);
  const list = (st.messages[id] ||= []);
  const msg: ChatMessage = { id: nextId(), sender_type: 'customer', message: String(b.message || ''), created_at: now() };
  list.push(msg);
  // Scheduled auto-reply becomes visible on the next poll after ~3s.
  list.push({ id: nextId(), sender_type: 'admin', message: autoReplies[list.length % autoReplies.length], created_at: new Date(Date.now() + 3000).toISOString() });
  const chat = st.chats.find((c) => c.id === id);
  if (chat) {
    chat.last_message_at = now();
    chat.last_message = msg.message;
  }
  save();
  return msg;
});

/* ------------------------------------------------------------------ */

export async function mockRequest<T>(
  method: string,
  rawPath: string,
  params: Record<string, unknown>,
  body: unknown,
  headers: Record<string, string>,
): Promise<ApiEnvelope<T>> {
  const path = rawPath.split('?')[0].replace(/\/$/, '') || '/';
  // simulate a little network latency for realistic skeletons
  await new Promise((r) => setTimeout(r, 120 + Math.random() * 180));
  const ctx = ctxFrom(headers);
  for (const [m, re, h] of routes) {
    if (m !== method) continue;
    const match = path.match(re);
    if (!match) continue;
    const result = h(match, params, (body || {}) as Record<string, unknown>, ctx);
    if (result && typeof result === 'object' && 'items' in result && 'meta' in result && !('subtotal' in result)) {
      const r = result as { items: unknown; meta: ApiEnvelope<T>['meta'] };
      return ok(r.items as T, 'OK', r.meta);
    }
    return ok(result as T);
  }
  throw new ApiError(`Mock route not found: ${method} ${path}`, 404);
}

export type { Category };
