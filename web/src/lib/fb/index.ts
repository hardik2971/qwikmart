/** Firebase implementation of the website data layer (Firestore + callables + Storage). */
import type { Api } from '../api-types';
import type { Product } from '../types';
import * as account from './account';
import * as cartMod from './cart';
import * as catalog from './catalog';
import * as chats from './chats';
import * as content from './content';
import { addFavorite, favoriteIds, removeFavorite } from './favorites';
import * as orders from './orders';

async function favorites(): Promise<Product[]> {
  const ids = [...(await favoriteIds())];
  const docs = await catalog.productsByIds(ids);
  return catalog.hydrate(docs);
}

export const fbApi: Api = {
  realtime: true,

  settings: catalog.settings,
  countries: catalog.countries,
  zones: catalog.zones,
  detectZone: catalog.detectZone,

  profile: account.profile,
  updateProfile: account.updateProfile,
  uploadAvatar: account.uploadAvatar,
  deleteProfile: account.deleteProfile,

  home: catalog.home,
  categories: catalog.categories,
  brands: catalog.brands,
  products: catalog.products,
  productFacets: () => catalog.productFacets(),
  product: catalog.product,
  suggestions: catalog.suggestions,
  trending: catalog.trending,

  blogs: content.blogs,
  blog: content.blog,
  blogCategories: content.blogCategories,
  faqs: content.faqs,
  page: content.page,

  cart: cartMod.cart,
  addToCart: cartMod.addToCart,
  updateCartItem: cartMod.updateCartItem,
  removeCartItem: cartMod.removeCartItem,
  clearCart: cartMod.clearCart,
  promoCodes: cartMod.promoCodes,
  applyPromo: cartMod.applyPromo,
  removePromo: cartMod.removePromo,
  appliedPromo: cartMod.getPromoCode,

  addresses: account.addresses,
  addAddress: account.addAddress,
  updateAddress: account.updateAddress,
  deleteAddress: account.deleteAddress,

  placeOrder: orders.placeOrder,
  verifyPayment: orders.verifyPayment,
  orders: orders.orders,
  order: orders.order,
  trackOrder: orders.trackOrder,
  watchOrder: orders.watchOrder,
  cancelOrder: orders.cancelOrder,
  reorder: orders.reorder,
  invoiceUrl: orders.invoiceUrl,
  createReturn: orders.createReturn,
  createReview: orders.createReview,

  favorites,
  addFavorite,
  removeFavorite,

  wallet: () => account.wallet(),
  rechargeWallet: account.rechargeWallet,
  verifyWalletRecharge: account.verifyWalletRecharge,
  withdraw: account.withdraw,
  withdrawals: account.withdrawals,
  referral: account.referral,

  notifications: account.notifications,
  readAllNotifications: account.readAllNotifications,
  readNotification: account.readNotification,
  chats: chats.chats,
  createChat: chats.createChat,
  chatMessages: chats.chatMessages,
  sendChatMessage: chats.sendChatMessage,
  watchChats: chats.watchChats,
  watchChatMessages: chats.watchChatMessages,
  markChatRead: chats.markChatRead,
};
