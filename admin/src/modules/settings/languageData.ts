// Language constants — port of Admin/LanguageController (PLATFORMS, SUPPORTED, RTL, starterKeys).
export const PLATFORMS: Record<string, [string, string]> = {
  customer_app: ['Customer App', 'Edit Customer App'],
  delivery_app: ['Rider App', 'Edit Delivery Boy App'],
  website: ['Website', 'Edit Website'],
  admin: ['Admin Panel', 'Edit Admin panel'],
};

export const SUPPORTED: Record<string, string> = {
  en: 'English', ar: 'Arabic', hi: 'Hindi', bn: 'Bengali', ur: 'Urdu', fr: 'French', es: 'Spanish (Castilian)',
  pt: 'Portuguese', de: 'German', it: 'Italian', ru: 'Russian', tr: 'Turkish', fa: 'Persian', he: 'Hebrew',
  id: 'Indonesian', ms: 'Malay', th: 'Thai', vi: 'Vietnamese', zh: 'Chinese', ja: 'Japanese', ko: 'Korean',
  ta: 'Tamil', te: 'Telugu', mr: 'Marathi', gu: 'Gujarati', kn: 'Kannada', ml: 'Malayalam', pa: 'Punjabi',
  sw: 'Swahili', nl: 'Dutch', pl: 'Polish', uk: 'Ukrainian', fil: 'Filipino', am: 'Amharic', ha: 'Hausa', yo: 'Yoruba',
};
export const RTL = ['ar', 'ur', 'fa', 'he'];

export function starterKeys(platform: string): Record<string, string> {
  const common: Record<string, string> = {
    app_name: 'QwikMart', login: 'Login', logout: 'Logout', register: 'Register', email: 'Email', phone: 'Phone Number',
    password: 'Password', otp: 'OTP', send_otp: 'Send OTP', verify: 'Verify', submit: 'Submit', save: 'Save',
    cancel: 'Cancel', delete: 'Delete', edit: 'Edit', search: 'Search', loading: 'Loading...', retry: 'Retry',
    no_data: 'No data found', something_went_wrong: 'Something went wrong', yes: 'Yes', no: 'No', ok: 'OK',
    profile: 'Profile', settings: 'Settings', language: 'Language', notifications: 'Notifications', orders: 'Orders',
    order_status_received: 'Received', order_status_processed: 'Processed', order_status_shipped: 'Shipped',
    order_status_out_for_delivery: 'Out for Delivery', order_status_delivered: 'Delivered', order_status_cancelled: 'Cancelled',
  };
  const extra: Record<string, string> = platform === 'customer_app' || platform === 'website' ? {
    home: 'Home', categories: 'Categories', cart: 'Cart', wishlist: 'Wishlist', checkout: 'Checkout',
    add_to_cart: 'Add to Cart', buy_now: 'Buy Now', quick: 'Quick', ecommerce: 'eCommerce',
    delivery_in_minutes: 'Delivery in :minutes minutes', select_address: 'Select Address', add_address: 'Add Address',
    apply_coupon: 'Apply Coupon', subtotal: 'Subtotal', delivery_charge: 'Delivery Charge', tax: 'Tax', total: 'Total',
    place_order: 'Place Order', payment_method: 'Payment Method', cash_on_delivery: 'Cash on Delivery', wallet: 'Wallet',
    track_order: 'Track Order', reorder: 'Reorder', return_order: 'Return Order', refer_and_earn: 'Refer & Earn',
    out_of_stock: 'Out of Stock', view_all: 'View All', help_support: 'Help & Support',
  } : platform === 'delivery_app' ? {
    dashboard: 'Dashboard', go_online: 'Go Online', go_offline: 'Go Offline', new_order: 'New Order',
    accept: 'Accept', reject: 'Reject', pickup: 'Pick Up', deliver: 'Deliver', enter_delivery_otp: 'Enter delivery OTP',
    cash_to_collect: 'Cash to Collect', earnings: 'Earnings', cash_in_hand: 'Cash in Hand', withdraw: 'Withdraw',
    navigate: 'Navigate', call_customer: 'Call Customer', returns: 'Returns',
  } : {
    dashboard: 'Dashboard', products: 'Products', customers: 'Customers', stores: 'Stores', zones: 'Zones',
    delivery_boys: 'Delivery Boys', reports: 'Reports', add_new: 'Add New', actions: 'Actions', status: 'Status',
    active: 'Active', inactive: 'Inactive', export: 'Export', filter: 'Filter',
  };
  return { ...common, ...extra };
}

export function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
