import 'json.dart';

class CartItem {
  final String id;
  final String productId;
  final String variantId;
  final String productName;
  final String productSlug;
  final String variantName;
  final String image;
  final double price; // MRP
  final double? salePrice;
  final int qty;
  final int stock;
  final int maxQty;

  const CartItem({
    required this.id,
    required this.productId,
    required this.variantId,
    required this.productName,
    this.productSlug = '',
    this.variantName = '',
    this.image = '',
    required this.price,
    this.salePrice,
    required this.qty,
    this.stock = 99,
    this.maxQty = 10,
  });

  factory CartItem.fromJson(Map<String, dynamic> j) {
    final product = asMap(j['product']);
    final variant = asMap(j['variant']);
    return CartItem(
      id: asId(j['line_id'] ?? j['id']),
      productId: asId(j['product_id'] ?? product['id']),
      variantId: asId(j['variant_id'] ?? j['product_variant_id'] ?? variant['id']),
      productName: asText(j['product_name'] ?? j['name'] ?? product['name']),
      productSlug: asString(j['product_slug'] ?? j['slug'] ?? product['slug']),
      variantName: asString(j['variant_name'] ?? variant['name']),
      image: asString(j['image'] ?? product['thumbnail']),
      price: asDouble(j['price'] ?? variant['price']),
      salePrice: asDoubleOrNull(j['sale_price'] ?? variant['sale_price']),
      qty: asInt(j['qty'], 1),
      stock: asInt(j['stock'] ?? variant['stock'], 99),
      maxQty: asInt(j['max_qty'], 10),
    );
  }

  /// Highest quantity that can be ordered (max_qty_per_order and available stock).
  int get limit => [maxQty, stock].where((n) => n > 0).fold<int>(1 << 30, (a, b) => a < b ? a : b);

  double get unitPrice => (salePrice != null && salePrice! > 0 && salePrice! < price) ? salePrice! : price;
  double get lineTotal => unitPrice * qty;
  double get lineMrp => price * qty;
}

class AppliedPromo {
  final String code;
  final double discount;
  final String message;
  /// Cashback coupons are credited to the wallet after delivery and do not reduce the payable amount.
  final bool isCashback;
  final bool freeDelivery;
  const AppliedPromo({
    required this.code,
    required this.discount,
    this.message = '',
    this.isCashback = false,
    this.freeDelivery = false,
  });

  /// Accepts either a bare promo (`{code, discount, is_cashback, free_delivery}`) or the cart summary
  /// returned by `POST /promo-codes/apply` (`{promo:{...}, promo_discount, ...}`).
  factory AppliedPromo.fromJson(Map<String, dynamic> j) {
    final p = asMapOrNull(j['promo']) ?? j;
    return AppliedPromo(
      code: asString(p['code']),
      discount: asDouble(p['discount'] ?? j['promo_discount']),
      message: asString(p['message'] ?? j['message']),
      isCashback: asBool(p['is_cashback']),
      freeDelivery: asBool(p['free_delivery']) || asString(p['discount_type']) == 'free_delivery',
    );
  }

  /// Amount deducted from the bill right now.
  double get instantDiscount => isCashback ? 0 : discount;
}

class Cart {
  final List<CartItem> items;
  final double subtotal;
  final double savings;
  final double deliveryCharge;
  final double surgeCharge;
  final double tax;
  final AppliedPromo? promo;
  final double walletBalance;
  final double total;
  final double freeDeliveryRemaining;
  /// Prices already include tax (backend setting `tax_inclusive`); `tax` is informational then.
  final bool taxInclusive;
  final double minOrder;
  final double minOrderRemaining;
  final bool canCheckout;
  final List<String> issues;
  /// Zone surcharges (packaging, small-cart fee, …) added to delivery orders.
  final double additionalCharges;
  /// Server payable after promo, before wallet (`grand_total` of `cartSummary`).
  final double grandTotal;
  /// Why the requested promo code does not apply (`cartSummary.promo_error`).
  final String promoError;

  const Cart({
    this.additionalCharges = 0,
    this.grandTotal = 0,
    this.promoError = '',
    this.items = const [],
    this.subtotal = 0,
    this.savings = 0,
    this.deliveryCharge = 0,
    this.surgeCharge = 0,
    this.tax = 0,
    this.promo,
    this.walletBalance = 0,
    this.total = 0,
    this.freeDeliveryRemaining = 0,
    this.taxInclusive = true,
    this.minOrder = 0,
    this.minOrderRemaining = 0,
    this.canCheckout = true,
    this.issues = const [],
  });

  static const empty = Cart();

  factory Cart.fromJson(Map<String, dynamic> j) {
    final promo = asMapOrNull(j['promo']);
    return Cart(
      additionalCharges: asDouble(j['additional_charges']),
      grandTotal: asDouble(j['grand_total'] ?? j['total']),
      promoError: asString(j['promo_error']),
      items: asMapList(j['items']).map(CartItem.fromJson).toList(),
      subtotal: asDouble(j['subtotal']),
      savings: asDouble(j['savings']),
      deliveryCharge: asDouble(j['delivery_charge']),
      surgeCharge: asDouble(j['surge_charge']),
      tax: asDouble(j['tax']),
      promo: promo == null ? null : AppliedPromo.fromJson(promo),
      walletBalance: asDouble(j['wallet_balance']),
      total: asDouble(j['total']),
      freeDeliveryRemaining: asDouble(j['free_delivery_remaining']),
      taxInclusive: asBool(j['tax_inclusive'], true),
      minOrder: asDouble(j['min_order']),
      minOrderRemaining: asDouble(j['min_order_remaining']),
      canCheckout: asBool(j['can_checkout'], true),
      issues: (j['issues'] is List ? j['issues'] as List : const [])
          .map((e) => e is Map ? asString(e['message'] ?? e['issue']) : asString(e))
          .where((s) => s.isNotEmpty)
          .toList(),
    );
  }

  bool get isEmpty => items.isEmpty;
  /// Tax to add on top of the subtotal (0 when prices are tax-inclusive).
  double get extraTax => taxInclusive ? 0 : tax;
  int get itemCount => items.fold(0, (s, i) => s + i.qty);
  double get mrpTotal => items.fold(0.0, (s, i) => s + i.lineMrp);

  /// Problems reported by cartSummary that block checkout (max qty, stock, minimum order …).
  bool get isBlocked => issues.isNotEmpty || minOrderRemaining > 0;

  int qtyForVariant(String variantId) {
    for (final i in items) {
      if (i.variantId == variantId) return i.qty;
    }
    return 0;
  }

  CartItem? itemForVariant(String variantId) {
    for (final i in items) {
      if (i.variantId == variantId) return i;
    }
    return null;
  }
}

class Coupon {
  final String id;
  final String code;
  final String title;
  final String description;
  final String discountType; // percent | fixed | free_delivery
  final double discountValue;
  final double maxDiscount;
  final double minOrder;
  final String bannerColor;
  final bool isApplicable;
  final double remaining;
  final DateTime? endsAt;
  /// Why the coupon is not applicable (from the API), e.g. "Add items worth ₹1,185.00 more…".
  final String message;
  final String label;
  final bool isCashback;

  const Coupon({
    required this.id,
    required this.code,
    this.title = '',
    this.description = '',
    this.discountType = 'fixed',
    this.discountValue = 0,
    this.maxDiscount = 0,
    this.minOrder = 0,
    this.bannerColor = '#0E9623',
    this.isApplicable = true,
    this.remaining = 0,
    this.endsAt,
    this.message = '',
    this.label = '',
    this.isCashback = false,
  });

  factory Coupon.fromJson(Map<String, dynamic> j) => Coupon(
        id: asId(j['id'] ?? j['code']),
        code: asString(j['code']),
        title: asText(j['title']),
        description: asText(j['description']),
        discountType: asString(j['discount_type'], 'fixed'),
        discountValue: asDouble(j['discount_value']),
        maxDiscount: asDouble(j['max_discount']),
        minOrder: asDouble(j['min_order']),
        bannerColor: asString(j['banner_color'], '#0E9623'),
        isApplicable: asBool(j['applicable'] ?? j['is_applicable'], true),
        remaining: asDouble(j['remaining']),
        endsAt: asDate(j['ends_at']),
        message: asString(j['message']),
        label: asString(j['label']),
        isCashback: asBool(j['is_cashback']),
      );

  /// Copy with [remaining] derived from the current cart subtotal (the API only sends `min_order`).
  Coupon withSubtotal(double subtotal) => Coupon(
        id: id,
        code: code,
        title: title,
        description: description,
        discountType: discountType,
        discountValue: discountValue,
        maxDiscount: maxDiscount,
        minOrder: minOrder,
        bannerColor: bannerColor,
        isApplicable: isApplicable,
        remaining: remaining > 0 ? remaining : (!isApplicable && minOrder > subtotal ? minOrder - subtotal : 0),
        endsAt: endsAt,
        message: message,
        label: label,
        isCashback: isCashback,
      );

  String get headline {
    switch (discountType) {
      case 'percent':
        return '${discountValue.toStringAsFixed(0)}% OFF';
      case 'free_delivery':
        return 'FREE DELIVERY';
      default:
        return '₹${discountValue.toStringAsFixed(0)} OFF';
    }
  }
}
