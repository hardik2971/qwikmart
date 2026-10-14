import 'json.dart';
import 'user.dart';

class OrderItem {
  /// Item key: the variant id (Firestore order items are keyed by variant).
  final String id;
  final String orderId;
  final String productId;
  final String variantId;
  final String productName;
  final String productSlug;
  final String variantName;
  final String image;
  final double price;
  final double? salePrice;
  final int qty;
  final double total;
  final String status;
  final String returnStatus;
  final bool canReview;
  final bool canReturn;

  const OrderItem({
    required this.id,
    this.orderId = '',
    required this.productId,
    this.variantId = '',
    required this.productName,
    this.productSlug = '',
    this.variantName = '',
    this.image = '',
    required this.price,
    this.salePrice,
    required this.qty,
    required this.total,
    this.status = '',
    this.returnStatus = '',
    this.canReview = false,
    this.canReturn = false,
  });

  /// [order] (optional) is the parent order JSON — used to derive review/return eligibility.
  factory OrderItem.fromJson(Map<String, dynamic> j, {Map<String, dynamic>? order}) {
    final status = asString(j['status'], asString(order?['status']));
    final variantId = asId(j['variant_id'] ?? j['product_variant_id']);
    final returnStatus = asString(j['return_status']);
    return OrderItem(
      id: variantId.isNotEmpty ? variantId : asId(j['id']),
      orderId: asId(j['order_id'] ?? order?['id']),
      productId: asId(j['product_id']),
      variantId: variantId,
      productName: asText(j['product_name'] ?? j['name']),
      productSlug: asString(j['product_slug'] ?? j['slug']),
      variantName: asString(j['variant_name']),
      image: asString(j['image']),
      price: asDouble(j['price']),
      salePrice: asDoubleOrNull(j['sale_price']),
      qty: asInt(j['qty'], 1),
      total: asDouble(j['total']),
      status: status,
      returnStatus: returnStatus,
      canReview: j.containsKey('can_review')
          ? asBool(j['can_review'])
          : (const ['delivered', 'returned'].contains(asString(order?['status'], status)) &&
              status != 'returned' &&
              !asBool(j['is_reviewed'])),
      canReturn: j.containsKey('can_return') ? asBool(j['can_return']) : _returnable(j, order, status, returnStatus),
    );
  }

  /// Delivered, return allowed for the product, inside `return_days` of delivery, no return requested yet.
  static bool _returnable(Map<String, dynamic> j, Map<String, dynamic>? order, String status, String returnStatus) {
    if (status != 'delivered' || returnStatus.isNotEmpty || !asBool(j['return_allowed'])) return false;
    final delivered = asDate(order?['delivered_at']);
    if (delivered == null) return true;
    final days = asInt(j['return_days']);
    return days <= 0 || DateTime.now().difference(delivered).inHours <= days * 24;
  }

  double get unitPrice => (salePrice != null && salePrice! > 0) ? salePrice! : price;
}

class TimelineEntry {
  final String status;
  final String label;
  final String note;
  final DateTime? createdAt;
  const TimelineEntry({required this.status, this.label = '', this.note = '', this.createdAt});

  factory TimelineEntry.fromJson(Map<String, dynamic> j) => TimelineEntry(
        status: asString(j['status']),
        label: asString(j['label']),
        note: asString(j['note']),
        createdAt: asDate(j['at'] ?? j['created_at']),
      );
}

class DeliveryBoyInfo {
  final String name;
  final String phone;
  final String avatar;
  final String vehicleNumber;
  final double? lat;
  final double? lng;
  const DeliveryBoyInfo({required this.name, this.phone = '', this.avatar = '', this.vehicleNumber = '', this.lat, this.lng});

  factory DeliveryBoyInfo.fromJson(Map<String, dynamic> j) => DeliveryBoyInfo(
        name: asString(j['name'], 'Delivery partner'),
        phone: asString(j['phone']),
        avatar: asString(j['avatar']),
        vehicleNumber: asString(j['vehicle_number']),
        lat: asDoubleOrNull(j['lat']),
        lng: asDoubleOrNull(j['lng']),
      );
}

class StoreInfo {
  final String id;
  final String name;
  final String phone;
  final String address;
  final double? lat;
  final double? lng;
  const StoreInfo({this.id = '', this.name = '', this.phone = '', this.address = '', this.lat, this.lng});

  factory StoreInfo.fromJson(Map<String, dynamic> j) => StoreInfo(
        id: asId(j['id']),
        name: asString(j['name']),
        phone: asString(j['phone']),
        address: asString(j['address']),
        lat: asDoubleOrNull(j['lat']),
        lng: asDoubleOrNull(j['lng']),
      );
}

class Order {
  final String id;
  final String orderNumber;
  final String status;
  final String mode;
  final String deliveryType;
  final String paymentMethod;
  final String paymentStatus;
  final double subtotal;
  final double discount;
  final double promoDiscount;
  final String promoCode;
  /// Cashback coupon: [promoDiscount] is credited to the wallet after delivery, not deducted from the total.
  final bool promoIsCashback;
  final double deliveryCharge;
  final double surgeCharge;
  final double additionalCharges;
  final double taxAmount;
  final double walletUsed;
  final double total;
  final double grandTotal;
  final String deliveryOtp;
  final DateTime? createdAt;
  final DateTime? estimatedDeliveryAt;
  final List<OrderItem> items;
  final int itemsCount;
  final List<TimelineEntry> timeline;
  final Address? address;
  final DeliveryBoyInfo? deliveryBoy;
  /// Live rider position (`orders/{id}.rider`, copied by the backend from the rider's location).
  final LatLngPoint? rider;
  final DateTime? riderUpdatedAt;
  final StoreInfo? store;
  final String storeId;
  final String invoiceUrl;
  final bool canCancel;
  final bool canReturn;
  final String customerName;
  final String customerPhone;
  final String cancelReason;

  const Order({
    required this.id,
    required this.orderNumber,
    required this.status,
    this.mode = 'quick',
    this.deliveryType = 'delivery',
    this.paymentMethod = 'cod',
    this.paymentStatus = 'pending',
    this.subtotal = 0,
    this.discount = 0,
    this.promoDiscount = 0,
    this.promoCode = '',
    this.promoIsCashback = false,
    this.deliveryCharge = 0,
    this.surgeCharge = 0,
    this.additionalCharges = 0,
    this.taxAmount = 0,
    this.walletUsed = 0,
    this.total = 0,
    this.grandTotal = 0,
    this.deliveryOtp = '',
    this.createdAt,
    this.estimatedDeliveryAt,
    this.items = const [],
    this.itemsCount = 0,
    this.timeline = const [],
    this.address,
    this.deliveryBoy,
    this.rider,
    this.riderUpdatedAt,
    this.store,
    this.storeId = '',
    this.invoiceUrl = '',
    this.canCancel = false,
    this.canReturn = false,
    this.customerName = '',
    this.customerPhone = '',
    this.cancelReason = '',
  });

  /// Accepts a Firestore `orders/{id}` doc (with `id`, nested `totals`) or the flat mock shape.
  factory Order.fromJson(Map<String, dynamic> j) {
    final totals = asMap(j['totals']);
    dynamic t(String k) => j[k] ?? totals[k];
    final items = asMapList(j['items']).map((i) => OrderItem.fromJson(i, order: j)).toList();
    final addr = asMapOrNull(j['address'] ?? j['address_snapshot']);
    final db = asMapOrNull(j['delivery_boy']);
    final store = asMapOrNull(j['store']);
    final customer = asMap(j['customer'] ?? j['user']);
    final rider = asMapOrNull(j['rider']);
    final total = asDouble(t('total'));
    return Order(
      id: asId(j['id']),
      orderNumber: asString(j['order_number']),
      status: asString(j['status'], 'received'),
      mode: asString(j['mode'], 'quick'),
      deliveryType: asString(j['delivery_type'], 'delivery'),
      paymentMethod: asString(j['payment_method'], 'cod'),
      paymentStatus: asString(j['payment_status'], 'pending'),
      subtotal: asDouble(t('subtotal')),
      discount: asDouble(t('discount')),
      promoDiscount: asDouble(t('promo_discount')),
      promoCode: asString(j['promo_code']),
      promoIsCashback: asBool(j['promo_is_cashback']),
      deliveryCharge: asDouble(t('delivery_charge')),
      surgeCharge: asDouble(t('surge_charge')),
      additionalCharges: asDouble(t('additional_charges')),
      taxAmount: asDouble(t('tax_amount')),
      walletUsed: asDouble(t('wallet_used')),
      total: total,
      grandTotal: asDouble(t('grand_total'), total),
      deliveryOtp: asString(j['delivery_otp']),
      createdAt: asDate(j['created_at']),
      estimatedDeliveryAt: asDate(j['estimated_delivery_at']),
      items: items,
      itemsCount: asInt(j['items_count'], items.fold<int>(0, (s, i) => s + i.qty)),
      timeline: asMapList(j['timeline'] ?? j['status_histories']).map(TimelineEntry.fromJson).toList(),
      address: addr == null ? null : Address.fromJson(addr),
      deliveryBoy: db == null ? null : DeliveryBoyInfo.fromJson(db),
      rider: LatLngPoint.fromJson(rider),
      riderUpdatedAt: asDate(rider?['updated_at']),
      store: store == null ? null : StoreInfo.fromJson(store),
      storeId: asId(j['store_id']),
      invoiceUrl: asString(j['invoice_url']),
      canCancel: asBool(j['can_cancel']),
      canReturn: j.containsKey('can_return') ? asBool(j['can_return']) : items.any((i) => i.canReturn),
      customerName: asString(customer['name'] ?? addr?['name']),
      customerPhone: asString(customer['phone'] ?? addr?['phone']),
      cancelReason: asString(j['cancel_reason']),
    );
  }

  bool get isActive => !const ['delivered', 'cancelled', 'returned', 'payment_pending'].contains(status);
  bool get isTrackable =>
      const ['shipped', 'picked_up', 'out_for_delivery'].contains(status) || (status == 'processed' && deliveryBoy != null);
  bool get isDelivered => status == 'delivered';
  bool get isCancelled => status == 'cancelled';

  /// Same order with the OTP from `orders/{id}/secret/otp`.
  Order withOtp(String otp) => Order(
        id: id,
        orderNumber: orderNumber,
        status: status,
        mode: mode,
        deliveryType: deliveryType,
        paymentMethod: paymentMethod,
        paymentStatus: paymentStatus,
        subtotal: subtotal,
        discount: discount,
        promoDiscount: promoDiscount,
        promoCode: promoCode,
        promoIsCashback: promoIsCashback,
        deliveryCharge: deliveryCharge,
        surgeCharge: surgeCharge,
        additionalCharges: additionalCharges,
        taxAmount: taxAmount,
        walletUsed: walletUsed,
        total: total,
        grandTotal: grandTotal,
        deliveryOtp: otp,
        createdAt: createdAt,
        estimatedDeliveryAt: estimatedDeliveryAt,
        items: items,
        itemsCount: itemsCount,
        timeline: timeline,
        address: address,
        deliveryBoy: deliveryBoy,
        rider: rider,
        riderUpdatedAt: riderUpdatedAt,
        store: store,
        storeId: storeId,
        invoiceUrl: invoiceUrl,
        canCancel: canCancel,
        canReturn: canReturn,
        customerName: customerName,
        customerPhone: customerPhone,
        cancelReason: cancelReason,
      );
}

class LatLngPoint {
  final double lat;
  final double lng;
  const LatLngPoint(this.lat, this.lng);
  static LatLngPoint? fromJson(dynamic v) {
    final m = asMapOrNull(v);
    if (m == null || m['lat'] == null || m['lng'] == null) return null;
    return LatLngPoint(asDouble(m['lat']), asDouble(m['lng']));
  }
}

class TrackInfo {
  final String status;
  final LatLngPoint? rider;
  final LatLngPoint? store;
  final LatLngPoint? home;
  final int etaMinutes;
  final DateTime? updatedAt;
  final List<LatLngPoint> route;

  const TrackInfo({
    required this.status,
    this.rider,
    this.store,
    this.home,
    this.etaMinutes = 0,
    this.updatedAt,
    this.route = const [],
  });

  factory TrackInfo.fromJson(Map<String, dynamic> j) {
    final db = asMap(j['delivery_boy']);
    return TrackInfo(
      status: asString(j['status']),
      rider: LatLngPoint.fromJson(db),
      store: LatLngPoint.fromJson(j['store']),
      home: LatLngPoint.fromJson(j['address']),
      etaMinutes: asInt(j['eta_minutes']),
      updatedAt: asDate(db['updated_at']),
      route: (j['route'] is List ? j['route'] as List : const [])
          .map(LatLngPoint.fromJson)
          .whereType<LatLngPoint>()
          .toList(),
    );
  }

  /// Tracking derived from a realtime order snapshot (+ the store's coordinates).
  factory TrackInfo.fromOrder(Order o) {
    final eta = o.estimatedDeliveryAt?.difference(DateTime.now()).inMinutes ?? 0;
    final a = o.address;
    return TrackInfo(
      status: o.status,
      rider: o.rider,
      store: o.store?.lat != null && o.store?.lng != null ? LatLngPoint(o.store!.lat!, o.store!.lng!) : null,
      home: a?.lat != null && a?.lng != null ? LatLngPoint(a!.lat!, a.lng!) : null,
      etaMinutes: eta > 0 ? eta : 0,
      updatedAt: o.riderUpdatedAt,
    );
  }
}

class ReturnRequest {
  final String id;
  final String returnNumber;
  final String status;
  final String reason;
  final double refundAmount;
  final String productName;
  final DateTime? createdAt;

  const ReturnRequest({
    required this.id,
    required this.returnNumber,
    required this.status,
    this.reason = '',
    this.refundAmount = 0,
    this.productName = '',
    this.createdAt,
  });

  factory ReturnRequest.fromJson(Map<String, dynamic> j) => ReturnRequest(
        id: asId(j['id']),
        returnNumber: asString(j['return_number']),
        status: asString(j['status']),
        reason: asString(j['reason']),
        refundAmount: asDouble(j['refund_amount']),
        productName: asString(j['item_name'] ??
            j['product_name'] ??
            asMap(j['item'])['name'] ??
            asMap(j['order_item'])['product_name']),
        createdAt: asDate(j['created_at']),
      );
}
