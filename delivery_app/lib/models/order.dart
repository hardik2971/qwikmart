import '../core/format.dart';

/// Order statuses (SPEC §4 `orders.status`).
class OrderStatus {
  OrderStatus._();
  static const paymentPending = 'payment_pending';
  static const received = 'received';
  static const processed = 'processed';
  static const shipped = 'shipped';
  static const readyForPickup = 'ready_for_pickup';
  static const pickedUp = 'picked_up';
  static const outForDelivery = 'out_for_delivery';
  static const delivered = 'delivered';
  static const cancelled = 'cancelled';
  static const returned = 'returned';

  /// Ordered happy-path steps shown on the Track Order timeline.
  static const flow = [received, processed, readyForPickup, pickedUp, outForDelivery, delivered];
}

class Store {
  Store({
    required this.id,
    required this.name,
    this.address = '',
    this.city = '',
    this.phone,
    this.lat,
    this.lng,
    this.logo,
  });

  final String id;
  final String name;
  final String address;
  final String city;
  final String? phone;
  final double? lat;
  final double? lng;
  final String? logo;

  factory Store.fromJson(Map<String, dynamic> j) => Store(
        id: asString(j['id']),
        name: asString(j['name'], 'Store'),
        address: asString(j['address']),
        city: asString(j['city']),
        phone: asStringOrNull(j['phone']),
        lat: asDoubleOrNull(j['lat']),
        lng: asDoubleOrNull(j['lng']),
        logo: asStringOrNull(j['logo']),
      );
}

class Customer {
  Customer({
    required this.name,
    this.id,
    this.phone,
    this.address = '',
    this.landmark,
    this.lat,
    this.lng,
  });

  final String? id;
  final String name;
  final String? phone;
  final String address;
  final String? landmark;
  final double? lat;
  final double? lng;

  factory Customer.fromJson(Map<String, dynamic> j) {
    // `address` may be a string (order card `delivery.address` = full address)
    // or an address snapshot object (returns `customer.address`).
    if (j['address'] is Map) {
      final snap = asMap(j['address']);
      j = {...snap, ...j, 'address': snap['full_address'] ?? snap['address_line']};
      for (final k in ['lat', 'lng', 'landmark', 'city', 'state', 'pincode']) {
        j[k] ??= snap[k];
      }
      if (snap['full_address'] != null) j['full_address'] = snap['full_address'];
    }
    final String address;
    if (j['full_address'] != null) {
      address = j['full_address'].toString();
    } else if (j['address_line'] == null && j['address'] != null) {
      // Already a full, formatted address from the API.
      address = j['address'].toString();
    } else {
      address = [
        j['address_line'] ?? j['address'],
        j['landmark'],
        j['city'],
        j['state'],
        j['pincode'],
      ].where((e) => e != null && e.toString().isNotEmpty).map((e) => e.toString()).join(', ');
    }
    return Customer(
      id: asStringOrNull(j['id']),
      name: asString(j['name'], 'Customer'),
      phone: asStringOrNull(j['phone'] ?? j['mobile']),
      address: address,
      landmark: asStringOrNull(j['landmark']),
      lat: asDoubleOrNull(j['lat']),
      lng: asDoubleOrNull(j['lng']),
    );
  }
}

class OrderItem {
  OrderItem({
    required this.name,
    this.variant,
    required this.qty,
    required this.price,
    double? total,
    this.image,
  }) : total = total ?? price * qty;

  final String name;
  final String? variant;
  final int qty;
  final double price;
  final double total;
  final String? image;

  factory OrderItem.fromJson(Map<String, dynamic> j) => OrderItem(
        name: asString(j['product_name'] ?? j['name'], 'Item'),
        variant: asStringOrNull(j['variant_name'] ?? j['variant']),
        qty: asInt(j['qty'], 1),
        price: asDouble(j['unit_price'] ?? j['sale_price'] ?? j['price']),
        total: asDoubleOrNull(j['total']),
        image: asStringOrNull(j['image']),
      );
}

class TimelineEntry {
  TimelineEntry({required this.status, this.at, this.note});
  final String status;
  final DateTime? at;
  final String? note;

  factory TimelineEntry.fromJson(Map<String, dynamic> j) => TimelineEntry(
        status: asString(j['status']),
        at: asDate(j['created_at'] ?? j['at'] ?? j['time']),
        note: asStringOrNull(j['note']),
      );
}

class DeliveryOrder {
  DeliveryOrder({
    required this.id,
    required this.orderNumber,
    required this.status,
    required this.paymentMethod,
    this.paymentStatus = 'pending',
    required this.total,
    this.subtotal = 0,
    this.deliveryCharge = 0,
    this.tax = 0,
    this.discount = 0,
    double? amountToCollect,
    this.earning = 0,
    this.distanceKm,
    this.itemsCount,
    required this.store,
    required this.customer,
    this.items = const [],
    this.timeline = const [],
    this.isAccepted = false,
    this.mode = 'quick',
    this.notes,
    this.invoiceUrl,
    this.createdAt,
    this.deliveredAt,
    this.otp,
  }) : amountToCollect = amountToCollect ?? (paymentMethod == 'cod' ? total : 0);

  final String id;
  final String orderNumber;
  String status;
  final String paymentMethod;
  String paymentStatus;
  final double total;
  final double subtotal;
  final double deliveryCharge;
  final double tax;
  final double discount;
  final double amountToCollect;
  final double earning;
  final double? distanceKm;

  /// `items_count` from list endpoints (they don't embed the items).
  final int? itemsCount;
  final Store store;
  final Customer customer;
  final List<OrderItem> items;
  List<TimelineEntry> timeline;
  bool isAccepted;
  final String mode;
  final String? notes;
  final String? invoiceUrl;
  final DateTime? createdAt;
  DateTime? deliveredAt;

  /// Only populated by the mock backend (Firestore rules never expose `orders/{id}/secret/otp` to riders).
  final String? otp;

  bool get isCod => paymentMethod.toLowerCase() == 'cod';
  int get itemCount => items.isNotEmpty ? items.fold(0, (s, i) => s + i.qty) : (itemsCount ?? 0);
  bool get isDelivered => status == OrderStatus.delivered;
  bool get isCancelled => status == OrderStatus.cancelled;
  bool get isFinished => isDelivered || isCancelled || status == OrderStatus.returned;

  /// Next workflow action for the sticky button.
  DeliveryStep get nextStep {
    if (isFinished) return DeliveryStep.done;
    if (!isAccepted) return DeliveryStep.accept;
    switch (status) {
      case OrderStatus.pickedUp:
        return DeliveryStep.outForDelivery;
      case OrderStatus.outForDelivery:
        return DeliveryStep.deliver;
      default:
        return DeliveryStep.pickUp;
    }
  }

  factory DeliveryOrder.fromJson(Map<String, dynamic> j) {
    final storeJson = asMap(j['store'] ?? j['pickup'] ?? j['pickup_info']);
    final custJson = asMap(j['customer'] ?? j['delivery'] ?? j['delivery_info']);
    final addr = asMap(j['address_snapshot'] ?? j['address']);
    final mergedCustomer = {...addr, ...custJson};
    if (mergedCustomer['name'] == null && j['user'] is Map) mergedCustomer['name'] = (j['user'] as Map)['name'];
    if (mergedCustomer['phone'] == null && j['user'] is Map) mergedCustomer['phone'] = (j['user'] as Map)['phone'];
    final timelineRaw = j['timeline'] ?? j['track'] ?? j['status_histories'] ?? j['histories'];
    final total = asDouble(j['total']);
    final pm = asString(j['payment_method'], 'cod');
    return DeliveryOrder(
      id: asString(j['id']),
      orderNumber: asString(j['order_number'], '#${j['id']}'),
      status: asString(j['status'], OrderStatus.readyForPickup),
      paymentMethod: pm,
      paymentStatus: asString(j['payment_status'], 'pending'),
      total: total,
      subtotal: asDouble(j['subtotal']),
      deliveryCharge: asDouble(j['delivery_charge']) + asDouble(j['surge_charge']),
      tax: asDouble(j['tax_amount'] ?? j['tax']),
      discount: asDouble(j['discount']) + asDouble(j['promo_discount']),
      amountToCollect: asDoubleOrNull(j['amount_to_collect']),
      earning: asDouble(j['earning'] ?? j['commission']),
      distanceKm: asDoubleOrNull(j['distance_km'] ?? j['distance'] ?? custJson['distance_km']),
      itemsCount: j['items_count'] == null ? null : asInt(j['items_count']),
      store: Store.fromJson(storeJson),
      customer: Customer.fromJson(mergedCustomer),
      items: asMapList(j['items']).map(OrderItem.fromJson).toList(),
      timeline: asMapList(timelineRaw).map(TimelineEntry.fromJson).toList(),
      isAccepted: j.containsKey('is_accepted')
          ? asBool(j['is_accepted'])
          : j['next_actions'] is List
              // Detail endpoint: unassigned orders offer `accept`.
              ? !(j['next_actions'] as List).contains('accept')
              // Backend: an order assigned to the rider (`assigned_at`) is accepted.
              : (j['type'] != 'available' && (j['assigned_at'] != null || j['accepted_at'] != null || j['delivery_boy_id'] != null)),
      mode: asString(j['mode'], 'quick'),
      notes: asStringOrNull(j['notes']),
      invoiceUrl: asStringOrNull(j['invoice_url']),
      createdAt: asDate(j['created_at']),
      deliveredAt: asDate(j['delivered_at']),
    );
  }
}

enum DeliveryStep { accept, pickUp, outForDelivery, deliver, done }
