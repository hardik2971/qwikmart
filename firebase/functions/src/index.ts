/** QwikMart Cloud Functions (region asia-south1). See docs/FIREBASE_BACKEND.md. */
export { syncProfile, deleteAccount } from './callables/account';
export { detectZone, getHome } from './callables/location';
export { cartSummaryFn as cartSummary, listCoupons, mergeGuestCart } from './callables/cart';
export { placeOrder, verifyPayment, cancelOrder, reorder, getInvoiceUrl, requestReturn, submitReview } from './callables/orders';
export { walletRecharge, verifyWalletRecharge, walletWithdraw } from './callables/wallet';
export { registerDeliveryBoy, setOnline, acceptOrder, rejectOrder, updateDeliveryStatus, deliverOrder, returnPickedUp } from './callables/delivery';
export {
  adminUpdateOrderStatus, assignDeliveryBoy, verifyPickupOtp, processReturn, updatePaymentStatus, deleteOrder, deleteReturn, startChat,
  createPanelUser, updatePanelUser, setUserStatus, deleteUser, approveDeliveryBoy, createDeliveryBoy,
  walletAdjust, processWithdrawal, updateWithdrawal, collectCash, payEarnings,
  publishHomeLayout, previewHomeSections, bulkImportProducts, exportReport, sendNotification, sendBulkEmail, testSmtp,
} from './callables/panel';
export { generateProductContent, translateFields } from './callables/ai';
export { submitContactMessage } from './callables/contact';
export { onOrderWritten } from './triggers/orders';
export { onProductWritten, onStoreStockWritten, onReviewCreated, onCategoryWritten } from './triggers/catalog';
export { onMailQueued } from './triggers/mail';
export { onChatCreated, onChatMessageCreated, onDeliveryBoyLocation, onUserWritten } from './triggers/engagement';
