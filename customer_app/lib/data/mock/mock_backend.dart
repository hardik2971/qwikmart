import 'dart:math' as math;

import '../../core/errors.dart';
import '../../models/json.dart';
import 'mock_seed.dart';

/// Result returned by the mock backend (same shape as an unwrapped API envelope).
class MockResult {
  final dynamic data;
  final Map<String, dynamic>? meta;
  final String message;
  const MockResult(this.data, {this.meta, this.message = 'OK'});
}

class _V {
  final int id;
  final String name;
  final double mrp;
  final double sale;
  int stock;
  _V(this.id, this.name, this.mrp, this.sale, this.stock);
  double get price => sale > 0 && sale < mrp ? sale : mrp;
}

class _P {
  final int id;
  final String name;
  final String slug;
  final int catId;
  final int subId;
  final int brandId;
  final String brand;
  final List<_V> variants;
  double rating;
  int ratingCount;
  final bool? isVeg;
  final String fulfillment;
  final List<Map<String, dynamic>> reviews = [];
  _P({
    required this.id,
    required this.name,
    required this.slug,
    required this.catId,
    required this.subId,
    required this.brandId,
    required this.brand,
    required this.variants,
    required this.rating,
    required this.ratingCount,
    required this.isVeg,
    required this.fulfillment,
  });
  _V get dv => variants.first;
  int get discount => dv.mrp > 0 ? ((dv.mrp - dv.price) / dv.mrp * 100).round() : 0;
}

class _Ctx {
  final Map<String, String> h;
  _Ctx(this.h);
  String get mode => (h['X-Mode'] ?? 'quick') == 'ecommerce' ? 'ecommerce' : 'quick';
  int get zoneId => int.tryParse(h['X-Zone-Id'] ?? '') ?? 1;
  String? get token {
    final a = h['Authorization'] ?? '';
    return a.startsWith('Bearer ') ? a.substring(7) : null;
  }

  String get guest => h['X-Guest-Token'] ?? 'anon';
}

/// In-memory implementation of the QwikMart REST API used for standalone demos and as an
/// automatic fallback when the Laravel backend is unreachable. State lives for the app session.
class MockBackend {
  MockBackend() {
    _seed();
  }

  final _rand = math.Random(42);
  final DateTime _boot = DateTime.now();
  late _Ctx _ctx;

  final List<_P> _products = [];
  final Map<String, int> _brandIds = {};
  final Map<int, SeedCategory> _cats = {};
  final Map<int, Map<String, dynamic>> _users = {};
  final Map<String, int> _tokens = {};
  final Map<String, List<Map<String, dynamic>>> _carts = {};
  final Map<String, Set<int>> _favs = {};
  final Map<int, List<Map<String, dynamic>>> _addresses = {};
  final List<Map<String, dynamic>> _orders = [];
  final Map<int, List<Map<String, dynamic>>> _walletTxns = {};
  final Map<int, List<Map<String, dynamic>>> _withdrawals = {};
  final Map<int, List<Map<String, dynamic>>> _notifications = {};
  final Map<int, List<Map<String, dynamic>>> _chats = {};
  final Map<int, List<Map<String, dynamic>>> _messages = {};
  final List<Map<String, dynamic>> _pendingReplies = [];
  final List<Map<String, dynamic>> _returns = [];
  int _seq = 1000;

  int _next() => ++_seq;

  // ---------------------------------------------------------------- seed

  static String slugify(String s) => s
      .toLowerCase()
      .replaceAll(RegExp(r"[^a-z0-9]+"), '-')
      .replaceAll(RegExp(r'-+'), '-')
      .replaceAll(RegExp(r'^-|-$'), '');

  void _seed() {
    for (final c in [...seedParents, ...seedSubs]) {
      _cats[c.id] = c;
    }
    var pid = 0;
    for (final row in seedProducts) {
      pid++;
      final sub = row[1] as int;
      final parent = _cats[sub]!.parentId!;
      final brand = row[2] as String;
      _brandIds.putIfAbsent(brand, () => _brandIds.length + 1);
      final variants = <_V>[];
      var vi = 0;
      for (final v in row[3] as List) {
        vi++;
        final l = v as List;
        variants.add(_V(pid * 10 + vi, l[0] as String, (l[1] as num).toDouble(), (l[2] as num).toDouble(), 20 + _rand.nextInt(80)));
      }
      final p = _P(
        id: pid,
        name: row[0] as String,
        slug: slugify(row[0] as String),
        catId: parent,
        subId: sub,
        brandId: _brandIds[brand]!,
        brand: brand,
        variants: variants,
        rating: (row[4] as num).toDouble(),
        ratingCount: row[5] as int,
        isVeg: row[6] as bool?,
        fulfillment: _cats[parent]!.fulfillment,
      );
      for (var i = 0; i < 3; i++) {
        p.reviews.add({
          'id': pid * 100 + i,
          'user': {'name': seedReviewers[(pid + i) % seedReviewers.length], 'avatar': ''},
          'rating': i == 1 ? 4 : 5,
          'comment': seedReviewComments[(pid + i) % seedReviewComments.length],
          'images': <String>[],
          'created_at': _ago(days: 3 + i * 4 + pid % 5),
        });
      }
      _products.add(p);
    }

    // Demo customer (SPEC §3).
    _users[1] = {
      'id': 1,
      'name': 'Rahul Sharma',
      'email': 'customer@gmail.com',
      'phone': '9876543210',
      'country_code': '+91',
      'avatar': '',
      'referral_code': 'E579EC',
      'wallet_balance': 2136.30,
      'password': '123456',
    };
    _addresses[1] = [
      {
        'id': 1, 'label': 'Home', 'name': 'Rahul Sharma', 'phone': '9876543210',
        'address_line': 'Flat 402, Lake Homes, Chandivali', 'landmark': 'Near Powai Lake', 'city': 'Mumbai',
        'state': 'Maharashtra', 'pincode': '400076', 'country_id': 1, 'lat': 19.1176, 'lng': 72.9060, 'is_default': true,
      },
      {
        'id': 2, 'label': 'Work', 'name': 'Rahul Sharma', 'phone': '9876543210',
        'address_line': 'Office 12B, Kalpataru Square, Andheri Kurla Road', 'landmark': 'Saki Naka Metro', 'city': 'Mumbai',
        'state': 'Maharashtra', 'pincode': '400059', 'country_id': 1, 'lat': 19.1110, 'lng': 72.8860, 'is_default': false,
      },
    ];
    _walletTxns[1] = [
      _txn('credit', 200, 'paystack', 'Wallet successfully recharged', days: 0, hours: 2, txnId: 'TXN-1784431R0233'),
      _txn('debit', 364.45, 'wallet', 'Used against Order Placement', days: 0, hours: 3, orderId: 110),
      _txn('debit', 297.25, 'wallet', 'Used against Order Placement', days: 1, orderId: 109),
      _txn('credit', 600, 'paystack', 'Wallet successfully recharged', days: 2, txnId: 'TXN-1784430918'),
      _txn('credit', 50, 'cashback', 'Cashback for WALLETCASH50', days: 4),
      _txn('credit', 50, 'referral', 'Referral reward — Priya Nair joined', days: 6),
      _txn('credit', 2000, 'razorpay', 'Wallet successfully recharged', days: 10, txnId: 'pay_N8xQ2ab91'),
    ];
    _notifications[1] = [
      _notif('Your order is on the way 🛵', 'Order SB-ORD-00112 is out for delivery. Track it live!', 'order', minutes: 6, data: {'order_id': 112}),
      _notif('Order received', 'We have received your order SB-ORD-00111.', 'order', minutes: 3, data: {'order_id': 111}),
      _notif('Flat ₹99 OFF in Mumbai', 'Use code MUMBAI99 on orders above ₹599. Valid today only!', 'promotion', minutes: 90),
      _notif('Fresh Alphonso is here 🥭', 'Ratnagiri Alphonso mangoes now available in 8 minutes.', 'product', minutes: 300, data: {'slug': 'alphonso-mango-ratnagiri'}),
      _notif('Wallet credited', '₹200 added to your QwikMart wallet.', 'default', minutes: 125, read: true),
      _notif('Order delivered', 'Order SB-ORD-00110 was delivered. Rate your items!', 'order', minutes: 2880, read: true, data: {'order_id': 110}),
    ];
    _chats[1] = [
      {'id': 1, 'subject': 'Order help', 'order_id': 112, 'status': 'open', 'last_message_at': _ago(minutes: 20)},
    ];
    _messages[1] = [
      _msg(1, 'customer', 'hello', minutes: 31),
      _msg(1, 'customer', 'when can i expect my order?', minutes: 30),
      _msg(1, 'admin', "Hello! Sure, I'd be happy to help. Please provide your order ID and the information you'd like to update.", minutes: 28),
      _msg(1, 'customer', 'My order ID is #SB-ORD-00112. I entered the wrong delivery address.', minutes: 25),
      _msg(1, 'admin', 'Thank you. Could you please provide the correct delivery address?', minutes: 24),
      _msg(1, 'customer', 'Flat 402, Lake Homes, Chandivali, Powai, Mumbai 400076.', minutes: 22),
      _msg(1, 'admin', 'Done! The address has been updated and your rider is on the way. 🛵', minutes: 20),
    ];

    // Demo orders across statuses.
    _seedOrder(112, 'out_for_delivery', [[43, 2, 1], [52, 1, 1], [46, 1, 1]], minutesAgo: 12, otp: '310115', live: true);
    _seedOrder(111, 'received', [[43, 1, 1]], minutesAgo: 3, otp: '675048', payment: 'cod');
    _seedOrder(110, 'delivered', [[14, 1, 1], [18, 1, 2], [25, 1, 1]], minutesAgo: 60 * 26, otp: '493021', payment: 'wallet');
    _seedOrder(109, 'delivered', [[13, 2, 2], [17, 1, 1], [20, 1, 1]], minutesAgo: 60 * 24 * 9, otp: '118204', payment: 'razorpay');
    _seedOrder(108, 'cancelled', [[28, 2, 2], [39, 1, 1]], minutesAgo: 60 * 24 * 15, otp: '550912', payment: 'cod');
    _seedOrder(107, 'shipped', [[82, 1, 1]], minutesAgo: 60 * 20, otp: '902117', payment: 'stripe', mode: 'ecommerce');
  }

  String _ago({int days = 0, int hours = 0, int minutes = 0}) =>
      DateTime.now().subtract(Duration(days: days, hours: hours, minutes: minutes)).toUtc().toIso8601String();

  Map<String, dynamic> _txn(String type, double amount, String paymentType, String message,
      {int days = 0, int hours = 0, int? orderId, String? txnId}) {
    return {
      'id': _next(),
      'type': type,
      'amount': amount,
      'balance_after': 0,
      'payment_type': paymentType,
      'txn_id': txnId ?? '',
      'order_id': orderId,
      'message': message,
      'status': 'success',
      'created_at': _ago(days: days, hours: hours),
    };
  }

  Map<String, dynamic> _notif(String title, String message, String type,
      {int minutes = 0, bool read = false, Map<String, dynamic>? data}) {
    return {
      'id': _next(),
      'title': title,
      'message': message,
      'type': type,
      'image': '',
      'data': {'type': type, ...?data},
      'read_at': read ? _ago(minutes: minutes - 1) : null,
      'created_at': _ago(minutes: minutes),
    };
  }

  Map<String, dynamic> _msg(int chatId, String sender, String text, {int minutes = 0}) => {
        'id': _next(),
        'chat_id': chatId,
        'sender_type': sender,
        'message': text,
        'attachment': '',
        'created_at': _ago(minutes: minutes),
        'read_at': _ago(minutes: minutes),
      };

  void _seedOrder(int id, String status, List<List<int>> lines,
      {required int minutesAgo, required String otp, String payment = 'cod', String mode = 'quick', bool live = false}) {
    final items = <Map<String, dynamic>>[];
    for (final l in lines) {
      final p = _products[l[0] - 1];
      final v = p.variants[(l[1] - 1).clamp(0, p.variants.length - 1)];
      items.add(_orderItem(p, v, l[2]));
    }
    final subtotal = items.fold<double>(0, (s, i) => s + (i['total'] as double));
    final delivery = subtotal >= 299 ? 0.0 : 30.0;
    final created = DateTime.now().subtract(Duration(minutes: minutesAgo));
    final o = <String, dynamic>{
      'id': id,
      'order_number': 'SB-ORD-${id.toString().padLeft(5, '0')}',
      'user_id': 1,
      'status': status,
      'mode': mode,
      'delivery_type': 'delivery',
      'payment_method': payment,
      'payment_status': payment == 'cod' && status != 'delivered' ? 'pending' : 'paid',
      'subtotal': subtotal,
      'discount': 0.0,
      'promo_discount': 0.0,
      'promo_code': '',
      'delivery_charge': delivery,
      'surge_charge': 0.0,
      'tax_amount': 0.0,
      'wallet_used': payment == 'wallet' ? subtotal + delivery : 0.0,
      'total': subtotal + delivery,
      'delivery_otp': otp,
      'address': _addresses[1]!.first,
      'items': items,
      'cancel_reason': status == 'cancelled' ? 'Ordered by mistake' : '',
      '_created': created,
      '_live': live,
      '_simulate': false,
    };
    _orders.add(o);
  }

  Map<String, dynamic> _orderItem(_P p, _V v, int qty) => {
        'id': _next(),
        'product_id': p.id,
        'product_variant_id': v.id,
        'product_name': p.name,
        'product_slug': p.slug,
        'variant_name': v.name,
        'image': '',
        'price': v.mrp,
        'sale_price': v.price,
        'qty': qty,
        'total': v.price * qty,
        'status': 'received',
        '_reviewed': false,
        '_returned': false,
      };

  // ---------------------------------------------------------------- dispatch

  Future<MockResult> handle(
    String method,
    String path, {
    required Map<String, dynamic> query,
    required Map<String, dynamic> body,
    required Map<String, String> headers,
  }) async {
    await Future<void>.delayed(Duration(milliseconds: 150 + _rand.nextInt(200)));
    _ctx = _Ctx(headers);
    final seg = path.split('?').first.split('/').where((s) => s.isNotEmpty).toList();
    String s(int i) => i < seg.length ? seg[i] : '';
    final m = method.toUpperCase();

    switch (s(0)) {
      case 'settings':
        return MockResult(_settings());
      case 'countries':
        return MockResult(seedCountries);
      case 'zones':
        if (s(1) == 'detect') return MockResult(_detect(asDouble(body['lat']), asDouble(body['lng'])));
        return MockResult(seedZones
            .where((z) => query['country_id'] == null || '${z['country_id']}' == '${query['country_id']}')
            .map(_zoneJson)
            .toList());
      case 'auth': // real API: Firebase session endpoints; only logout is meaningful offline
        if (s(1) == 'logout') return _auth('logout', body);
        throw AppException('Sign-in is not available offline', code: 'unavailable');
      case 'mock-auth': // offline demo login (AccountRepository.mock*)
        return _auth(s(1), body);
      case 'profile':
        return _profile(m, body);
      case 'home':
        return MockResult(_home(asInt(query['category_id'])));
      case 'categories':
        return MockResult(_categories(query));
      case 'brands':
        return MockResult(_brands(_products.where(_visible)));
      case 'products':
        if (seg.length == 1) return _productList(query);
        if (s(2) == 'reviews') return _productReviews(s(1));
        return MockResult(_productDetail(s(1)));
      case 'search':
        return MockResult(s(1) == 'trending' ? seedTrending : _suggestions(asString(query['q'])));
      case 'blogs':
        return seg.length == 1 ? _blogs(query) : MockResult(_blog(s(1)));
      case 'blog-categories':
        return MockResult(seedBlogCategories);
      case 'faqs':
        return MockResult([
          for (var i = 0; i < seedFaqs.length; i++) {'id': i + 1, 'question': seedFaqs[i][0], 'answer': seedFaqs[i][1]},
        ]);
      case 'pages':
        final p = seedPages[s(1)];
        if (p == null) throw AppException('Page not found', code: 'not-found');
        return MockResult({'slug': s(1), 'title': p[0], 'content': p[1]});
      case 'cart':
        return _cart(m, s(1), body);
      case 'promo-codes':
        if (s(1) == 'apply') return MockResult(_applyPromo(asString(body['code'])), message: 'Coupon applied');
        return MockResult(_promos());
      case 'addresses':
        return _addressesRoute(m, s(1), body);
      case 'orders':
        return _ordersRoute(m, seg, query, body);
      case 'returns':
        return _returnsRoute(m, body);
      case 'reviews':
        return _postReview(body);
      case 'favorites':
        return _favorites(m, s(1), body);
      case 'wallet':
        return _wallet(m, s(1), body);
      case 'referral':
        return MockResult(_referral());
      case 'notifications':
        return _notificationsRoute(m, s(1));
      case 'chats':
        return _chatsRoute(m, seg, body);
    }
    throw AppException('Not found: /$path', code: 'not-found');
  }

  // ---------------------------------------------------------------- helpers

  int? get _userId => _ctx.token == null ? null : _tokens[_ctx.token!];

  int _requireUser() {
    final id = _userId;
    if (id == null || !_users.containsKey(id)) {
      throw AppException('Please login to continue', code: 'unauthenticated');
    }
    return id;
  }

  String get _owner => _userId != null ? 'u$_userId' : 'g${_ctx.guest}';

  bool _visible(_P p) => p.fulfillment == 'both' || p.fulfillment == _ctx.mode;

  Map<String, dynamic> get _zone => seedZones.firstWhere((z) => z['id'] == _ctx.zoneId, orElse: () => seedZones.first);

  Map<String, dynamic> _catJson(SeedCategory c) => {
        'id': c.id,
        'parent_id': c.parentId,
        'name': c.name,
        'slug': slugify(c.name),
        'image': '',
        'icon': '',
        'header_color': c.headerColor,
        'product_count': _products.where((p) => p.subId == c.id || p.catId == c.id).length,
      };

  Map<String, dynamic> _zoneJson(Map<String, dynamic> z) => {
        'id': z['id'],
        'name': z['name'],
        'city': z['city'],
        'country_id': z['country_id'],
        'fulfillment_type': z['fulfillment_type'],
        'delivery_time_minutes': z['delivery_time_minutes'],
        'min_order': z['min_order'],
        'lat': z['lat'],
        'lng': z['lng'],
        'address': z['address'],
      };

  Map<String, dynamic> _pJson(_P p, {bool detail = false}) {
    final sub = _cats[p.subId]!;
    final favs = _favs[_owner] ?? const <int>{};
    final j = <String, dynamic>{
      'id': p.id,
      'name': p.name,
      'slug': p.slug,
      'thumbnail': '',
      'images': <String>[],
      'category_id': p.catId,
      'sub_category_id': p.subId,
      'category': {'id': p.subId, 'name': sub.name},
      'brand': {'id': p.brandId, 'name': p.brand, 'slug': slugify(p.brand), 'logo': ''},
      'rating_avg': p.rating,
      'rating_count': p.ratingCount,
      'is_veg': p.isVeg,
      'variants': p.variants
          .map((v) => {
                'id': v.id,
                'name': v.name,
                'sku': 'SB-${v.id}',
                'price': v.mrp,
                'sale_price': v.sale,
                'stock': v.stock,
                'image': '',
              })
          .toList(),
      'delivery_minutes': p.fulfillment == 'ecommerce' ? 0 : _zone['delivery_time_minutes'],
      'is_favorite': favs.contains(p.id),
      'fulfillment_type': p.fulfillment,
      'short_description': '${p.brand} ${sub.name.toLowerCase()} — ${p.dv.name}. Delivered fresh from Mumbai Store.',
      'return_allowed': p.catId >= 4,
      'return_days': p.catId >= 4 ? 7 : 0,
      'cancelable': true,
      'cod_allowed': p.dv.price < 50000,
      'max_qty_per_order': 10,
    };
    if (detail) {
      final total = p.ratingCount;
      j['description'] =
          '<p><b>${p.name}</b> by ${p.brand} is a customer favourite in ${sub.name}. Sourced from trusted suppliers and stored in hygienic, temperature-controlled conditions at our Mumbai dark store.</p>'
          '<ul><li>100% genuine ${p.brand} product</li><li>Quality checked before dispatch</li><li>Best before: see pack</li><li>Country of origin: India</li></ul>'
          '<p>Customer care: support@qwikmart.app</p>';
      j['rating_breakdown'] = {
        '5': (total * .62).round(),
        '4': (total * .22).round(),
        '3': (total * .09).round(),
        '2': (total * .04).round(),
        '1': (total * .03).round(),
      };
      j['reviews'] = p.reviews.reversed.take(5).toList();
      final similar = _products.where((o) => o.id != p.id && o.subId == p.subId).toList()
        ..addAll(_products.where((o) => o.id != p.id && o.catId == p.catId && o.subId != p.subId));
      j['similar'] = similar.take(10).map((o) => _pJson(o)).toList();
      j['store'] = {'id': _ctx.zoneId, 'name': _zone['store']};
    }
    return j;
  }

  _P? _findProduct(String slugOrId) {
    final id = int.tryParse(slugOrId);
    for (final p in _products) {
      if (p.slug == slugOrId || (id != null && p.id == id)) return p;
    }
    return null;
  }

  (_P, _V)? _findVariant(int variantId) {
    for (final p in _products) {
      for (final v in p.variants) {
        if (v.id == variantId) return (p, v);
      }
    }
    return null;
  }

  List<Map<String, dynamic>> _brands(Iterable<_P> products) {
    final seen = <int>{};
    final out = <Map<String, dynamic>>[];
    final sorted = products.toList()..sort((a, b) => b.ratingCount.compareTo(a.ratingCount));
    for (final p in sorted) {
      if (p.brand == 'Fresho' || !seen.add(p.brandId)) continue;
      out.add({'id': p.brandId, 'name': p.brand, 'slug': slugify(p.brand), 'logo': ''});
    }
    return out;
  }

  double _haversine(double lat1, double lng1, double lat2, double lng2) {
    const r = 6371.0;
    double rad(double d) => d * math.pi / 180;
    final dLat = rad(lat2 - lat1);
    final dLng = rad(lng2 - lng1);
    final a = math.sin(dLat / 2) * math.sin(dLat / 2) +
        math.cos(rad(lat1)) * math.cos(rad(lat2)) * math.sin(dLng / 2) * math.sin(dLng / 2);
    return 2 * r * math.asin(math.sqrt(a));
  }

  // ---------------------------------------------------------------- settings / geo

  Map<String, dynamic> _settings() => {
        'app_name': 'QwikMart',
        'logo': '',
        'primary_color': '#0E9623',
        'currency': {'code': 'INR', 'symbol': '₹'},
        'currency_symbol': '₹',
        'countries': seedCountries,
        'languages': [
          {'code': 'en', 'name': 'English', 'is_rtl': false},
          {'code': 'ar', 'name': 'العربية', 'is_rtl': true},
          {'code': 'hi', 'name': 'हिन्दी', 'is_rtl': false},
        ],
        'payment_gateways': [
          {'key': 'cod', 'name': 'Cash on Delivery', 'enabled': true},
          {'key': 'wallet', 'name': 'QwikMart Wallet', 'enabled': true},
          {'key': 'phonepe', 'name': 'PhonePe', 'enabled': true},
          {'key': 'midtrans', 'name': 'Midtrans', 'enabled': true},
          {'key': 'paystack', 'name': 'Paystack', 'enabled': true},
          {'key': 'stripe', 'name': 'Stripe', 'enabled': true},
          {'key': 'paypal', 'name': 'Paypal', 'enabled': true},
          {'key': 'razorpay', 'name': 'Razorpay', 'enabled': true},
          {'key': 'cashfree', 'name': 'Cashfree', 'enabled': true},
          {'key': 'paytabs', 'name': 'PayTabs', 'enabled': true},
        ],
        'referral': {'referrer_reward': 50, 'referred_reward': 100, 'min_order': 100},
        'demo_mode': true,
        'support_phone': '+91 98765 00000',
        'support_email': 'support@qwikmart.app',
        'social_links': {'facebook': 'https://facebook.com', 'instagram': 'https://instagram.com'},
        'min_app_version': '1.0.0',
      };

  Map<String, dynamic> _detect(double lat, double lng) {
    for (final z in seedZones) {
      final b = (z['bbox'] as List).cast<double>();
      if (lat >= b[0] && lat <= b[2] && lng >= b[1] && lng <= b[3]) {
        final d = _haversine(lat, lng, z['store_lat'] as double, z['store_lng'] as double);
        final mins = (z['delivery_time_minutes'] as int) + (d > 3 ? ((d - 3) * 1.5).round() : 0);
        return {
          'zone': _zoneJson(z),
          'store': {'id': z['id'], 'name': z['store'], 'lat': z['store_lat'], 'lng': z['store_lng']},
          'distance_km': double.parse(d.toStringAsFixed(2)),
          'delivery_minutes': mins,
          'deliverable': true,
        };
      }
    }
    return {'zone': null, 'store': null, 'distance_km': 0, 'delivery_minutes': 0, 'deliverable': false};
  }

  // ---------------------------------------------------------------- auth / profile

  Map<String, dynamic> _publicUser(int id) {
    final u = Map<String, dynamic>.from(_users[id]!)..remove('password');
    return u;
  }

  String _issueToken(int userId) {
    final t = 'mock-token-$userId-${_next()}';
    _tokens[t] = userId;
    return t;
  }

  int _createUser({String? name, String? email, String? phone, String? countryCode, String? password}) {
    final id = _users.keys.fold<int>(0, math.max) + 1;
    final code = (id * 7919 + 0xA11CE).toRadixString(16).toUpperCase().padLeft(6, '0').substring(0, 6);
    _users[id] = {
      'id': id,
      'name': (name == null || name.isEmpty) ? 'QwikMart User' : name,
      'email': email ?? '',
      'phone': phone ?? '',
      'country_code': countryCode ?? '+91',
      'avatar': '',
      'referral_code': code,
      'wallet_balance': 100.0,
      'password': password ?? '',
    };
    _walletTxns[id] = [_txn('credit', 100, 'referral', 'Welcome bonus')];
    _notifications[id] = [_notif('Welcome to QwikMart 🎉', '₹100 welcome bonus added to your wallet.', 'promotion')];
    return id;
  }

  MockResult _auth(String action, Map<String, dynamic> b) {
    switch (action) {
      case 'send-otp':
        final phone = asString(b['phone']).replaceAll(RegExp(r'\D'), '');
        if (phone.length < 6) {
          throw AppException('Enter a valid phone number', code: 'invalid-argument', errors: {'phone': ['Enter a valid phone number']});
        }
        return const MockResult({'sent': true, 'demo_otp': '123456'}, message: 'OTP sent successfully');
      case 'verify-otp':
        final phone = asString(b['phone']).replaceAll(RegExp(r'\D'), '');
        if (asString(b['otp']) != '123456') {
          throw AppException('Invalid OTP', code: 'invalid-argument', errors: {'otp': ['The OTP you entered is incorrect']});
        }
        var isNew = false;
        var id = _users.entries.where((e) => e.value['phone'] == phone).map((e) => e.key).firstOrNull;
        if (id == null) {
          id = _createUser(name: asString(b['name']), phone: phone, countryCode: asString(b['country_code'], '+91'));
          isNew = true;
        }
        return MockResult({'token': _issueToken(id), 'user': _publicUser(id), 'is_new': isNew}, message: 'Logged in');
      case 'login':
        final login = asString(b['email'] ?? b['phone']).trim().toLowerCase();
        final pass = asString(b['password']);
        for (final e in _users.entries) {
          if ((e.value['email'] == login || e.value['phone'] == login) && e.value['password'] == pass) {
            return MockResult({'token': _issueToken(e.key), 'user': _publicUser(e.key)}, message: 'Logged in');
          }
        }
        throw AppException('Invalid credentials', code: 'invalid-argument', errors: {'email': ['These credentials do not match our records.']});
      case 'register':
        final email = asString(b['email']).trim().toLowerCase();
        if (_users.values.any((u) => u['email'] == email && email.isNotEmpty)) {
          throw AppException('Email already registered', code: 'invalid-argument', errors: {'email': ['The email has already been taken.']});
        }
        final id = _createUser(
          name: asString(b['name']),
          email: email,
          phone: asString(b['phone']),
          password: asString(b['password']),
        );
        return MockResult({'token': _issueToken(id), 'user': _publicUser(id)}, message: 'Account created');
      case 'logout':
        if (_ctx.token != null) _tokens.remove(_ctx.token);
        return const MockResult(null, message: 'Logged out');
    }
    throw AppException('Not found', code: 'not-found');
  }

  MockResult _profile(String m, Map<String, dynamic> b) {
    final id = _requireUser();
    if (m == 'PUT' || m == 'POST') {
      final u = _users[id]!;
      for (final k in ['name', 'email', 'fcm_token']) {
        if (b[k] != null) u[k] = b[k];
      }
      return MockResult(_publicUser(id), message: 'Profile updated');
    }
    if (m == 'DELETE') {
      _users.remove(id);
      _tokens.removeWhere((_, v) => v == id);
      return const MockResult(null, message: 'Account deleted');
    }
    return MockResult(_publicUser(id));
  }

  // ---------------------------------------------------------------- catalog

  List<Map<String, dynamic>> _visibleParents() => seedParents
      .where((c) => c.fulfillment == 'both' || c.fulfillment == _ctx.mode)
      .map(_catJson)
      .toList();

  dynamic _categories(Map<String, dynamic> q) {
    final parentId = asIntOrNull(q['parent_id']);
    if (parentId != null) {
      return seedSubs.where((c) => c.parentId == parentId).map(_catJson).toList();
    }
    final parents = _visibleParents();
    if (asBool(q['tree'])) {
      for (final p in parents) {
        p['children'] = seedSubs.where((c) => c.parentId == p['id']).map(_catJson).toList();
      }
    }
    return parents;
  }

  List<_P> _filtered(Map<String, dynamic> q) {
    final term = asString(q['q']).trim().toLowerCase();
    final catId = asIntOrNull(q['category_id']);
    final brandIds = asString(q['brand_id']).split(',').map(int.tryParse).whereType<int>().toSet();
    final minP = asDoubleOrNull(q['min_price']);
    final maxP = asDoubleOrNull(q['max_price']);
    final ids = asString(q['ids']).split(',').map(int.tryParse).whereType<int>().toSet();
    var list = _products.where((p) {
      if (ids.isNotEmpty) return ids.contains(p.id);
      if (!_visible(p)) return false;
      if (catId != null && p.catId != catId && p.subId != catId) return false;
      if (brandIds.isNotEmpty && !brandIds.contains(p.brandId)) return false;
      if (minP != null && p.dv.price < minP) return false;
      if (maxP != null && p.dv.price > maxP) return false;
      if (term.isNotEmpty) {
        final hay = '${p.name} ${p.brand} ${_cats[p.subId]!.name} ${_cats[p.catId]!.name}'.toLowerCase();
        if (!term.split(RegExp(r'\s+')).every(hay.contains)) return false;
      }
      return true;
    }).toList();
    switch (asString(q['sort'])) {
      case 'price_asc':
        list.sort((a, b) => a.dv.price.compareTo(b.dv.price));
      case 'price_desc':
        list.sort((a, b) => b.dv.price.compareTo(a.dv.price));
      case 'newest':
        list.sort((a, b) => b.id.compareTo(a.id));
      case 'popular':
        list.sort((a, b) => b.ratingCount.compareTo(a.ratingCount));
      case 'rating':
        list.sort((a, b) => b.rating.compareTo(a.rating));
      case 'discount':
        list.sort((a, b) => b.discount.compareTo(a.discount));
    }
    return list;
  }

  MockResult _paginate(List<Map<String, dynamic>> all, Map<String, dynamic> q, {int perPage = 20}) {
    final per = asInt(q['per_page'], perPage).clamp(1, 100);
    final page = asInt(q['page'], 1).clamp(1, 10000);
    final last = math.max(1, (all.length / per).ceil());
    final slice = all.skip((page - 1) * per).take(per).toList();
    return MockResult(slice, meta: {'current_page': page, 'last_page': last, 'per_page': per, 'total': all.length});
  }

  MockResult _productList(Map<String, dynamic> q) =>
      _paginate(_filtered(q).map((p) => _pJson(p)).toList(), q);

  Map<String, dynamic> _productDetail(String slug) {
    final p = _findProduct(slug);
    if (p == null) throw AppException('Product not found', code: 'not-found');
    return _pJson(p, detail: true);
  }

  MockResult _productReviews(String id) {
    final p = _findProduct(id);
    if (p == null) throw AppException('Product not found', code: 'not-found');
    return _paginate(p.reviews.reversed.toList(), const {});
  }

  Map<String, dynamic> _suggestions(String q) {
    final t = q.trim().toLowerCase();
    if (t.isEmpty) return {'products': [], 'categories': []};
    final products = _products
        .where((p) => _visible(p) && '${p.name} ${p.brand}'.toLowerCase().contains(t))
        .take(8)
        .map((p) => {'id': p.id, 'name': p.name, 'slug': p.slug})
        .toList();
    final cats = _cats.values
        .where((c) => c.name.toLowerCase().contains(t))
        .take(4)
        .map((c) => {'id': c.id, 'name': c.name, 'parent_id': c.parentId})
        .toList();
    return {'products': products, 'categories': cats};
  }

  // ---------------------------------------------------------------- home

  Map<String, dynamic> _section(String id, String type, String title, List<Map<String, dynamic>> items,
          {String subtitle = '', Map<String, dynamic> settings = const {}}) =>
      {'id': id, 'type': type, 'title': title, 'subtitle': subtitle, 'is_active': true, 'settings': settings, 'items': items};

  List<Map<String, dynamic>> _top(Iterable<_P> ps, {int n = 10, bool byDiscount = false}) {
    final l = ps.where(_visible).toList()
      ..sort((a, b) => byDiscount ? b.discount.compareTo(a.discount) : b.ratingCount.compareTo(a.ratingCount));
    return l.take(n).map((p) => _pJson(p)).toList();
  }

  Map<String, dynamic> _home(int categoryId) {
    final mode = _ctx.mode;
    final parents = _visibleParents();
    final tabs = [
      {'id': 0, 'name': 'All', 'slug': 'all', 'header_color': mode == 'quick' ? '#EBEC8D' : '#FDE2D6'},
      ...parents,
    ];
    final sections = <Map<String, dynamic>>[];
    String color;

    if (categoryId > 0 && _cats.containsKey(categoryId)) {
      final cat = _cats[categoryId]!;
      color = cat.headerColor;
      final inCat = _products.where((p) => p.catId == categoryId);
      final banners = <Map<String, dynamic>>[
        {
          'id': 900 + categoryId, 'title': '${cat.name}\nStore', 'subtitle': 'Best prices on ${cat.name.toLowerCase()} — delivered fast',
          'badge': 'TOP PICKS', 'cta': 'Shop Now', 'bg_color': cat.headerColor, 'bg_color2': '#FFFFFF', 'accent': '#0B7A1C',
          'emoji': '', 'link_type': 'category', 'link_value': '$categoryId', 'image': '',
        },
        ...seedBanners.values.expand((b) => b).where((b) => b['link_value'] == '$categoryId'),
      ];
      sections
        ..add(_section('c1', 'banner_slider', '', banners, settings: {'autoplay': true}))
        ..add(_section('c2', 'category_section', 'Shop by Category',
            seedSubs.where((s) => s.parentId == categoryId).map(_catJson).toList(),
            subtitle: 'Everything in ${cat.name}', settings: {'style': 'grid'}))
        ..add(_section('c3', 'product_slider', 'Bestsellers in ${cat.name}', _top(inCat),
            settings: {'category_id': categoryId}))
        ..add(_section('c4', 'product_slider', 'Top Deals', _top(inCat, byDiscount: true),
            settings: {'category_id': categoryId, 'sort': 'discount'}))
        ..add(_section('c5', 'top_brands', 'Top Brands', _brands(inCat.where(_visible))));
    } else if (mode == 'quick') {
      color = '#EBEC8D';
      final favSubs = [101, 106, 105, 107, 103, 109, 114, 115, 121, 124, 129, 142];
      sections
        ..add(_section('q1', 'banner_slider', '', seedBanners['quick']!, settings: {'autoplay': true}))
        ..add(_section('q2', 'category_section', 'Find Your Favorites',
            favSubs.map((id) => _catJson(_cats[id]!)).toList(),
            subtitle: 'Explore categories to find products you love.', settings: {'style': 'scroll'}))
        ..add(_section('q3', 'title_image', 'Fresh Grocery', [
          {
            'id': 21, 'title': 'Fresh\nGrocery', 'subtitle': 'Farm Fresh · Quality Assured · Delivered with Care', 'cta': 'Order Now',
            'bg_color': '#FFE6CC', 'bg_color2': '#FFF7EE', 'accent': '#E8590C', 'emoji': '🥬🍅🥕🧺',
            'link_type': 'category', 'link_value': '3', 'image': '',
          },
        ]))
        ..add(_section('q4', 'product_slider', 'Bestsellers', _top(_products), settings: {'sort': 'popular'}))
        ..add(_section('q5', 'grid_banner', 'Daily Essentials', [
          {'id': 31, 'title': 'Atta & Rice', 'subtitle': 'Up to 25% OFF', 'emoji': '🌾', 'bg_color': '#F6EBC8', 'link_type': 'category', 'link_value': '102'},
          {'id': 32, 'title': 'Cooking Oils', 'subtitle': 'From ₹149', 'emoji': '🫒', 'bg_color': '#E5F2C9', 'link_type': 'category', 'link_value': '103'},
          {'id': 33, 'title': 'Breakfast', 'subtitle': 'Bread, eggs & more', 'emoji': '🍳', 'bg_color': '#FFE3D3', 'link_type': 'category', 'link_value': '105'},
          {'id': 34, 'title': 'Cleaning', 'subtitle': 'Min 15% OFF', 'emoji': '🧽', 'bg_color': '#DDEBFA', 'link_type': 'category', 'link_value': '141'},
        ], settings: {'columns': 2}))
        ..add(_section('q6', 'product_slider', 'Snacks & Munchies', _top(_products.where((p) => p.catId == 2)),
            settings: {'category_id': 2}))
        ..add(_section('q7', 'top_brands', 'Top Brands', _brands(_products.where(_visible)).take(12).toList()))
        ..add(_section('q8', 'product_slider', 'Dairy, Bread & Eggs',
            _top(_products.where((p) => p.subId == 105 || p.subId == 106)), settings: {'category_id': 105}))
        ..add(_section('q9', 'product_slider', 'Mega Savings', _top(_products, byDiscount: true), settings: {'sort': 'discount'}))
        ..add(_section('q10', 'heading_text', "India's last minute app", [], subtitle: 'Crafted with ❤️ in Mumbai'));
    } else {
      color = '#FDE2D6';
      sections
        ..add(_section('e1', 'banner_slider', '', seedBanners['ecommerce']!, settings: {'autoplay': true}))
        ..add(_section('e2', 'grid_banner', 'Top Picks', [
          {'id': 41, 'title': 'Sweatshirts', 'subtitle': '30-70% OFF', 'emoji': '🧥', 'bg_color': '#CDE8BE', 'cta': 'Shop Now', 'link_type': 'category', 'link_value': '134'},
          {'id': 42, 'title': 'Handbags', 'subtitle': '40-60% OFF', 'emoji': '👜', 'bg_color': '#CDE8BE', 'cta': 'Shop Now', 'link_type': 'category', 'link_value': '135'},
          {'id': 43, 'title': 'Jewellery', 'subtitle': 'UP TO 70% OFF', 'emoji': '💍', 'bg_color': '#CDE8BE', 'cta': 'Shop Now', 'link_type': 'category', 'link_value': '135'},
          {'id': 44, 'title': "Men's Footwear", 'subtitle': '50-70% OFF', 'emoji': '👟', 'bg_color': '#CDE8BE', 'cta': 'Shop Now', 'link_type': 'category', 'link_value': '136'},
          {'id': 45, 'title': 'Watches', 'subtitle': 'UP TO 60% OFF', 'emoji': '⌚', 'bg_color': '#CDE8BE', 'cta': 'Shop Now', 'link_type': 'category', 'link_value': '133'},
          {'id': 46, 'title': 'Headphones', 'subtitle': 'UP TO 70% OFF', 'emoji': '🎧', 'bg_color': '#CDE8BE', 'cta': 'Shop Now', 'link_type': 'category', 'link_value': '131'},
        ], settings: {'columns': 3}))
        ..add(_section('e3', 'top_brands', 'Top Brands', _brands(_products.where(_visible)).take(12).toList()))
        ..add(_section('e4', 'title_image', 'Beauty Sale', [
          {
            'id': 22, 'title': 'UP TO\n40% OFF', 'subtitle': 'Skincare, makeup & fragrances', 'cta': 'Shop Now', 'badge': 'ETUDE',
            'bg_color': '#F9DCCF', 'bg_color2': '#FFF3EC', 'accent': '#9A3412', 'emoji': '💄🌸', 'link_type': 'category', 'link_value': '4', 'image': '',
          },
        ]))
        ..add(_section('e5', 'product_slider', 'Trending Now', _top(_products), settings: {'sort': 'popular'}))
        ..add(_section('e6', 'category_section', 'Shop by Category',
            seedSubs.where((s) => [4, 6, 8, 9, 10, 11].contains(s.parentId)).take(12).map(_catJson).toList(),
            subtitle: 'Curated collections for you', settings: {'style': 'scroll'}))
        ..add(_section('e7', 'product_slider', 'Best of Electronics', _top(_products.where((p) => p.catId == 8 || p.catId == 10)),
            settings: {'category_id': 8}))
        ..add(_section('e8', 'product_slider', 'Fashion Deals', _top(_products.where((p) => p.catId == 9), byDiscount: true),
            settings: {'category_id': 9}));
    }
    return {
      'header': {'bg_type': 'color', 'bg_value': color, 'text_color': '#111827'},
      'categories': tabs,
      'sections': sections,
    };
  }

  // ---------------------------------------------------------------- blogs

  Map<String, dynamic> _blogJson(Map<String, dynamic> b, {bool detail = false}) {
    final cat = seedBlogCategories.firstWhere((c) => c['id'] == b['cat']);
    final j = {
      'id': b['id'],
      'title': b['title'],
      'slug': slugify(b['title'] as String),
      'image': '',
      'excerpt': b['excerpt'],
      'read_minutes': b['read_minutes'],
      'views': b['views'],
      'category': cat,
      'created_at': _ago(days: (b['id'] as int) * 3),
    };
    if (detail) {
      j['content'] = '<p>${b['excerpt']}</p>'
          '<h3>Why it matters</h3><p>QwikMart brings your neighbourhood store to your phone. Whether you order in Quick mode for 8-minute delivery or explore the wider eCommerce catalog, small habits add up to big savings.</p>'
          '<h3>Top tips</h3><ul><li>Turn on wallet usage at checkout to apply cashback instantly.</li><li>Check the coupons list — the best eligible offer is highlighted.</li><li>Share your referral code with friends and earn on their first order.</li></ul>'
          '<p>Happy shopping! — Team QwikMart</p>';
    }
    return j;
  }

  MockResult _blogs(Map<String, dynamic> q) {
    final cat = asIntOrNull(q['category_id']);
    final list = seedBlogs.where((b) => cat == null || b['cat'] == cat).map(_blogJson).toList();
    return _paginate(list, q);
  }

  Map<String, dynamic> _blog(String slug) {
    final b = seedBlogs.firstWhere(
      (b) => slugify(b['title'] as String) == slug || '${b['id']}' == slug,
      orElse: () => throw AppException('Blog not found', code: 'not-found'),
    );
    return _blogJson(b, detail: true);
  }

  // ---------------------------------------------------------------- cart

  List<Map<String, dynamic>> get _myCart => _carts.putIfAbsent(_owner, () => []);

  ({double delivery, double freeAbove, double base}) _deliveryRule() =>
      _ctx.mode == 'ecommerce' ? (delivery: 49, freeAbove: 499, base: 49) : (delivery: 30, freeAbove: 299, base: 30);

  Map<String, dynamic> _cartJson() {
    final items = <Map<String, dynamic>>[];
    double subtotal = 0, mrp = 0;
    for (final line in _myCart) {
      final found = _findVariant(line['variant_id'] as int);
      if (found == null) continue;
      final (p, v) = found;
      final qty = line['qty'] as int;
      subtotal += v.price * qty;
      mrp += v.mrp * qty;
      items.add({
        'id': line['id'],
        'product_id': p.id,
        'product_variant_id': v.id,
        'product_name': p.name,
        'product_slug': p.slug,
        'variant_name': v.name,
        'image': '',
        'price': v.mrp,
        'sale_price': v.price,
        'qty': qty,
        'stock': v.stock,
        'max_qty': 10,
        'line_total': v.price * qty,
      });
    }
    final rule = _deliveryRule();
    final delivery = items.isEmpty || subtotal >= rule.freeAbove ? 0.0 : rule.delivery;
    final hour = DateTime.now().hour;
    final surge = items.isNotEmpty && _ctx.mode == 'quick' && hour >= 18 && hour < 21 ? 10.0 : 0.0;
    final uid = _userId;
    return {
      'items': items,
      'subtotal': _r(subtotal),
      'mrp_total': _r(mrp),
      'savings': _r(mrp - subtotal),
      'delivery_charge': delivery,
      'surge_charge': surge,
      'tax': 0,
      'promo': null,
      'wallet_balance': uid == null ? 0 : _users[uid]!['wallet_balance'],
      'total': _r(subtotal + delivery + surge),
      'free_delivery_remaining': items.isEmpty ? 0 : _r(math.max(0, rule.freeAbove - subtotal)),
      'free_delivery_above': rule.freeAbove,
    };
  }

  double _r(num v) => (v * 100).round() / 100;

  MockResult _cart(String m, String idSeg, Map<String, dynamic> b) {
    final cart = _myCart;
    if (idSeg == 'sync' && m == 'POST') {
      final guest = _carts.remove('g${asString(b['guest_token'])}') ?? [];
      for (final g in guest) {
        final existing = cart.where((c) => c['variant_id'] == g['variant_id']).firstOrNull;
        if (existing != null) {
          existing['qty'] = math.min(10, (existing['qty'] as int) + (g['qty'] as int));
        } else {
          cart.add(g);
        }
      }
      return MockResult(_cartJson(), message: 'Cart synced');
    }
    switch (m) {
      case 'GET':
        return MockResult(_cartJson());
      case 'POST':
        final vid = asInt(b['product_variant_id']);
        final qty = asInt(b['qty'], 1);
        final found = _findVariant(vid);
        if (found == null) throw AppException('Product not available', code: 'not-found');
        final existing = cart.where((c) => c['variant_id'] == vid).firstOrNull;
        final newQty = (existing?['qty'] as int? ?? 0) + qty;
        if (newQty > 10) throw AppException('Maximum 10 units allowed per order', code: 'failed-precondition');
        if (newQty > found.$2.stock) throw AppException('Only ${found.$2.stock} left in stock', code: 'failed-precondition');
        if (existing != null) {
          existing['qty'] = newQty;
        } else {
          cart.add({'id': _next(), 'variant_id': vid, 'qty': qty});
        }
        return MockResult(_cartJson(), message: 'Added to cart');
      case 'PUT':
        final line = cart.where((c) => '${c['id']}' == idSeg).firstOrNull;
        if (line == null) throw AppException('Cart item not found', code: 'not-found');
        final qty = asInt(b['qty']);
        if (qty > 10) throw AppException('Maximum 10 units allowed per order', code: 'failed-precondition');
        if (qty <= 0) {
          cart.remove(line);
        } else {
          line['qty'] = qty;
        }
        return MockResult(_cartJson());
      case 'DELETE':
        if (idSeg.isEmpty) {
          cart.clear();
        } else {
          cart.removeWhere((c) => '${c['id']}' == idSeg);
        }
        return MockResult(_cartJson());
    }
    throw AppException('Method not allowed', code: 'invalid-argument');
  }

  // ---------------------------------------------------------------- promos

  double _promoDiscount(Map<String, dynamic> p, double subtotal, double delivery) {
    switch (p['discount_type']) {
      case 'percent':
        return _r(math.min(subtotal * (p['discount_value'] as num) / 100, (p['max_discount'] as num).toDouble()));
      case 'free_delivery':
        return delivery;
      default:
        return (p['discount_value'] as num).toDouble();
    }
  }

  List<Map<String, dynamic>> _promos() {
    final cart = _cartJson();
    final subtotal = asDouble(cart['subtotal']);
    return seedPromos.map((p) {
      final min = (p['min_order'] as num).toDouble();
      return {
        ...p,
        'is_applicable': subtotal >= min,
        'remaining': _r(math.max(0, min - subtotal)),
        'ends_at': DateTime.now().add(const Duration(days: 30)).toUtc().toIso8601String(),
      };
    }).toList();
  }

  Map<String, dynamic> _applyPromo(String code) {
    final p = seedPromos.where((p) => p['code'] == code.trim().toUpperCase()).firstOrNull;
    if (p == null) throw AppException('Invalid coupon code', code: 'invalid-argument', errors: {'code': ['This coupon code is invalid or expired']});
    final cart = _cartJson();
    final subtotal = asDouble(cart['subtotal']);
    final min = (p['min_order'] as num).toDouble();
    if (subtotal < min) {
      throw AppException('Add ₹${_r(min - subtotal)} more to use ${p['code']}', code: 'failed-precondition');
    }
    final discount = _promoDiscount(p, subtotal, asDouble(cart['delivery_charge']));
    return {'code': p['code'], 'discount': discount, 'message': 'You saved ₹${discount.toStringAsFixed(0)} with ${p['code']}'};
  }

  // ---------------------------------------------------------------- addresses

  MockResult _addressesRoute(String m, String idSeg, Map<String, dynamic> b) {
    final uid = _requireUser();
    final list = _addresses.putIfAbsent(uid, () => []);
    if (m == 'GET') return MockResult(list);
    if (m == 'POST' || m == 'PUT') {
      final data = Map<String, dynamic>.from(b)..remove('id');
      if (asString(data['address_line']).isEmpty) {
        throw AppException('Address is required', code: 'invalid-argument', errors: {'address_line': ['Please enter your address']});
      }
      data['is_default'] = asBool(data['is_default']) || list.isEmpty;
      if (data['is_default'] == true) {
        for (final a in list) {
          a['is_default'] = false;
        }
      }
      if (m == 'POST') {
        final a = {'id': _next(), ...data};
        list.add(a);
        return MockResult(a, message: 'Address saved');
      }
      final a = list.firstWhere((a) => '${a['id']}' == idSeg, orElse: () => throw AppException('Not found', code: 'not-found'));
      a.addAll(data);
      return MockResult(a, message: 'Address updated');
    }
    if (m == 'DELETE') {
      list.removeWhere((a) => '${a['id']}' == idSeg);
      if (list.isNotEmpty && !list.any((a) => a['is_default'] == true)) list.first['is_default'] = true;
      return const MockResult(null, message: 'Address deleted');
    }
    throw AppException('Method not allowed', code: 'invalid-argument');
  }

  // ---------------------------------------------------------------- orders

  static const _flow = ['received', 'processed', 'picked_up', 'out_for_delivery', 'delivered'];
  static const _route = [
    [19.1036, 72.8879],
    [19.1058, 72.8912],
    [19.1079, 72.8950],
    [19.1101, 72.8985],
    [19.1128, 72.9012],
    [19.1150, 72.9040],
    [19.1176, 72.9060],
  ];

  void _advance(Map<String, dynamic> o) {
    if (o['_simulate'] != true || o['status'] == 'cancelled' || o['status'] == 'delivered') return;
    final elapsed = DateTime.now().difference(o['_created'] as DateTime).inSeconds;
    String status;
    if (o['delivery_type'] == 'self_pickup') {
      status = elapsed < 20 ? 'received' : (elapsed < 40 ? 'processed' : 'ready_for_pickup');
    } else if (o['mode'] == 'ecommerce') {
      status = elapsed < 30 ? 'received' : (elapsed < 90 ? 'processed' : 'shipped');
    } else {
      status = elapsed < 20
          ? 'received'
          : elapsed < 40
              ? 'processed'
              : elapsed < 55
                  ? 'picked_up'
                  : elapsed < 240
                      ? 'out_for_delivery'
                      : 'delivered';
    }
    o['status'] = status;
    if (status == 'delivered') o['payment_status'] = 'paid';
  }

  /// 0..1 progress of the rider from store to home.
  double _progress(Map<String, dynamic> o) {
    if (o['_live'] == true) {
      return (DateTime.now().difference(_boot).inSeconds % 150) / 150;
    }
    if (o['_simulate'] == true) {
      final e = DateTime.now().difference(o['_created'] as DateTime).inSeconds;
      return ((e - 55) / (240 - 55)).clamp(0.0, 1.0);
    }
    return o['status'] == 'delivered' ? 1 : 0.0;
  }

  List<double> _pointAt(double t) {
    final n = _route.length - 1;
    final x = (t.clamp(0.0, 1.0)) * n;
    final i = math.min(x.floor(), n - 1);
    final f = x - i;
    final a = _route[i], b = _route[i + 1];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  }

  List<Map<String, dynamic>> _timeline(Map<String, dynamic> o) {
    final created = o['_created'] as DateTime;
    final status = o['status'] as String;
    const notes = {
      'received': 'Your order has been placed',
      'processed': 'Your order is being prepared',
      'picked_up': 'Your order has been picked up',
      'ready_for_pickup': 'Your order is ready for pickup at the store',
      'shipped': 'Your order has been shipped',
      'out_for_delivery': 'Your order is out for delivery',
      'delivered': 'Your order has been delivered',
      'cancelled': 'Your order was cancelled',
    };
    List<String> path;
    if (status == 'cancelled') {
      path = ['received', 'cancelled'];
    } else if (o['delivery_type'] == 'self_pickup') {
      path = ['received', 'processed', 'ready_for_pickup'];
      path = path.sublist(0, path.indexOf(status) + 1);
    } else if (o['mode'] == 'ecommerce') {
      const f = ['received', 'processed', 'shipped', 'out_for_delivery', 'delivered'];
      path = f.sublist(0, math.max(1, f.indexOf(status) + 1));
    } else {
      path = _flow.sublist(0, math.max(1, _flow.indexOf(status) + 1));
    }
    final total = DateTime.now().difference(created);
    return [
      for (var i = 0; i < path.length; i++)
        {
          'status': path[i],
          'note': notes[path[i]] ?? path[i],
          'created_at': created
              .add(Duration(seconds: (total.inSeconds * (i / math.max(1, path.length))).round()))
              .toUtc()
              .toIso8601String(),
        },
    ];
  }

  Map<String, dynamic> _orderJson(Map<String, dynamic> o) {
    _advance(o);
    final status = o['status'] as String;
    final assigned = const ['processed', 'picked_up', 'out_for_delivery', 'delivered'].contains(status) &&
        o['delivery_type'] != 'self_pickup' &&
        o['mode'] == 'quick';
    final pos = _pointAt(_progress(o));
    final delivered = status == 'delivered';
    final user = _users[o['user_id']] ?? const {};
    final items = (o['items'] as List).cast<Map<String, dynamic>>().map((i) {
      return {
        ...Map<String, dynamic>.from(i)..removeWhere((k, _) => k.startsWith('_')),
        'status': i['_returned'] == true ? 'return_requested' : status,
        'can_review': delivered && i['_reviewed'] != true,
        'can_return': delivered && i['_returned'] != true,
      };
    }).toList();
    final zone = seedZones.first;
    return {
      ...Map<String, dynamic>.from(o)..removeWhere((k, _) => k.startsWith('_') || k == 'user_id'),
      'items': items,
      'items_count': items.fold<int>(0, (s, i) => s + (i['qty'] as int)),
      'created_at': (o['_created'] as DateTime).toUtc().toIso8601String(),
      'estimated_delivery_at': (o['_created'] as DateTime)
          .add(Duration(minutes: o['mode'] == 'ecommerce' ? 60 * 48 : 12))
          .toUtc()
          .toIso8601String(),
      'timeline': _timeline(o),
      'customer': {'name': user['name'] ?? '', 'phone': '${user['country_code'] ?? '+91'} ${user['phone'] ?? ''}'},
      'store': {
        'name': zone['store'],
        'phone': '+91 22 4000 1234',
        'address': 'Kurla-Andheri Road, Saki Naka, Mumbai 400072',
        'lat': zone['store_lat'],
        'lng': zone['store_lng'],
      },
      'delivery_boy': assigned
          ? {'name': 'Abhay', 'phone': '+919812345670', 'avatar': '', 'lat': pos[0], 'lng': pos[1]}
          : null,
      'invoice_url': '',
      'can_cancel': const ['payment_pending', 'received', 'processed'].contains(status),
      'can_return': delivered,
    };
  }

  MockResult _ordersRoute(String m, List<String> seg, Map<String, dynamic> q, Map<String, dynamic> b) {
    final uid = _requireUser();
    final mine = _orders.where((o) => o['user_id'] == uid).toList()
      ..sort((a, b) => (b['_created'] as DateTime).compareTo(a['_created'] as DateTime));
    if (seg.length == 1) {
      if (m == 'POST') return _placeOrder(uid, b);
      final status = asString(q['status']);
      final list = mine.map(_orderJson).where((o) {
        switch (status) {
          case '':
          case 'all':
            return true;
          case 'active':
            return !const ['delivered', 'cancelled', 'returned'].contains(o['status']);
          default:
            return o['status'] == status;
        }
      }).toList();
      return _paginate(list, q);
    }
    final o = mine.where((o) => '${o['id']}' == seg[1]).firstOrNull;
    if (o == null) throw AppException('Order not found', code: 'not-found');
    final action = seg.length > 2 ? seg[2] : '';
    switch (action) {
      case '':
        return MockResult(_orderJson(o));
      case 'track':
        final j = _orderJson(o);
        final p = _progress(o);
        final pos = _pointAt(p);
        return MockResult({
          'status': j['status'],
          'delivery_boy': {
            'name': 'Abhay',
            'phone': '+919812345670',
            'lat': pos[0],
            'lng': pos[1],
            'updated_at': DateTime.now().toUtc().toIso8601String(),
          },
          'store': {'lat': _route.first[0], 'lng': _route.first[1]},
          'address': {'lat': _route.last[0], 'lng': _route.last[1]},
          'eta_minutes': j['status'] == 'delivered' ? 0 : math.max(1, ((1 - p) * 8).ceil()),
          'route': _route.map((r) => {'lat': r[0], 'lng': r[1]}).toList(),
        });
      case 'cancel':
        _advance(o);
        if (!const ['payment_pending', 'received', 'processed'].contains(o['status'])) {
          throw AppException('This order can no longer be cancelled', code: 'failed-precondition');
        }
        o['status'] = 'cancelled';
        o['_simulate'] = false;
        o['_live'] = false;
        o['cancel_reason'] = asString(b['reason'], 'Cancelled by customer');
        final paid = (o['payment_method'] != 'cod' ? (o['total'] as num).toDouble() : 0.0) + (o['wallet_used'] as num).toDouble();
        final refund = o['payment_method'] == 'cod' ? (o['wallet_used'] as num).toDouble() : paid - (o['wallet_used'] as num).toDouble();
        if (refund > 0) _credit(uid, refund, 'refund', 'Refund for ${o['order_number']}', orderId: o['id'] as int);
        o['payment_status'] = refund > 0 ? 'refunded' : o['payment_status'];
        return MockResult(_orderJson(o), message: 'Order cancelled');
      case 'reorder':
        for (final i in (o['items'] as List).cast<Map<String, dynamic>>()) {
          final cart = _myCart;
          final ex = cart.where((c) => c['variant_id'] == i['product_variant_id']).firstOrNull;
          if (ex != null) {
            ex['qty'] = math.min(10, (ex['qty'] as int) + (i['qty'] as int));
          } else {
            cart.add({'id': _next(), 'variant_id': i['product_variant_id'], 'qty': i['qty']});
          }
        }
        return MockResult(_cartJson(), message: 'Items added to cart');
      case 'payment':
        o['payment_status'] = 'paid';
        return MockResult(_orderJson(o), message: 'Payment verified');
      case 'invoice':
        return MockResult({'invoice_url': ''});
    }
    throw AppException('Not found', code: 'not-found');
  }

  void _credit(int uid, double amount, String type, String message, {int? orderId, String txnId = ''}) {
    final u = _users[uid]!;
    u['wallet_balance'] = _r((u['wallet_balance'] as num).toDouble() + amount);
    _walletTxns.putIfAbsent(uid, () => []).insert(0, {
      ..._txn('credit', amount, type, message, orderId: orderId, txnId: txnId),
      'balance_after': u['wallet_balance'],
    });
  }

  void _debit(int uid, double amount, String type, String message, {int? orderId, String status = 'success'}) {
    final u = _users[uid]!;
    u['wallet_balance'] = _r((u['wallet_balance'] as num).toDouble() - amount);
    _walletTxns.putIfAbsent(uid, () => []).insert(0, {
      ..._txn('debit', amount, type, message, orderId: orderId),
      'balance_after': u['wallet_balance'],
      'status': status,
    });
  }

  MockResult _placeOrder(int uid, Map<String, dynamic> b) {
    final cart = _cartJson();
    final lines = (cart['items'] as List).cast<Map<String, dynamic>>();
    if (lines.isEmpty) throw AppException('Your cart is empty', code: 'failed-precondition');
    final deliveryType = asString(b['delivery_type'], 'delivery');
    final addressId = asIntOrNull(b['address_id']);
    final addresses = _addresses[uid] ?? [];
    Map<String, dynamic>? address;
    if (deliveryType == 'delivery') {
      address = addresses.where((a) => a['id'] == addressId).firstOrNull;
      if (address == null) {
        throw AppException('Please select a delivery address', code: 'invalid-argument', errors: {'address_id': ['Please select a delivery address']});
      }
    }
    final subtotal = asDouble(cart['subtotal']);
    final delivery = deliveryType == 'self_pickup' ? 0.0 : asDouble(cart['delivery_charge']);
    final surge = deliveryType == 'self_pickup' ? 0.0 : asDouble(cart['surge_charge']);
    var promoDiscount = 0.0;
    final code = asString(b['promo_code']);
    Map<String, dynamic>? promo;
    if (code.isNotEmpty) {
      promo = seedPromos.where((p) => p['code'] == code.toUpperCase()).firstOrNull;
      if (promo != null && subtotal >= (promo['min_order'] as num)) {
        promoDiscount = _promoDiscount(promo, subtotal, delivery);
      }
    }
    var total = _r(math.max(0, subtotal + delivery + surge - promoDiscount));
    final method = asString(b['payment_method'], 'cod');
    final balance = (_users[uid]!['wallet_balance'] as num).toDouble();
    var walletUsed = 0.0;
    if (method == 'wallet') {
      if (balance < total) throw AppException('Insufficient wallet balance', code: 'failed-precondition');
      walletUsed = total;
    } else if (asBool(b['use_wallet'])) {
      walletUsed = _r(math.min(balance, total));
    }
    final payable = _r(total - walletUsed);
    final id = _orders.map((o) => o['id'] as int).fold<int>(0, math.max) + 1;
    final items = <Map<String, dynamic>>[];
    for (final l in lines) {
      final found = _findVariant(l['product_variant_id'] as int)!;
      found.$2.stock = math.max(0, found.$2.stock - (l['qty'] as int));
      items.add(_orderItem(found.$1, found.$2, l['qty'] as int));
    }
    final mode = _ctx.mode;
    final o = <String, dynamic>{
      'id': id,
      'order_number': 'SB-ORD-${id.toString().padLeft(5, '0')}',
      'user_id': uid,
      'status': 'received',
      'mode': mode,
      'delivery_type': deliveryType,
      'payment_method': method,
      'payment_status': method == 'cod' && payable > 0 ? 'pending' : 'paid',
      'transaction_id': method == 'cod' || method == 'wallet' ? '' : 'mock_${_next()}',
      'subtotal': subtotal,
      'discount': asDouble(cart['savings']),
      'promo_discount': promoDiscount,
      'promo_code': promo?['code'] ?? '',
      'delivery_charge': delivery,
      'surge_charge': surge,
      'tax_amount': 0.0,
      'wallet_used': walletUsed,
      'total': total,
      'delivery_otp': (100000 + _rand.nextInt(899999)).toString(),
      'address': address,
      'items': items,
      'notes': asString(b['notes']),
      'cancel_reason': '',
      '_created': DateTime.now(),
      '_live': false,
      '_simulate': true,
    };
    _orders.add(o);
    if (walletUsed > 0) _debit(uid, walletUsed, 'wallet', 'Used against Order Placement', orderId: id);
    if (promo != null && promo['code'] == 'WALLETCASH50' && promoDiscount > 0) {
      // WALLETCASH50 is a cashback coupon — credited to wallet instead of discounting.
      o['promo_discount'] = 0.0;
      o['total'] = total = _r(total + promoDiscount);
      _credit(uid, promoDiscount, 'cashback', 'Cashback for WALLETCASH50', orderId: id);
    }
    _myCart.clear();
    _notifications.putIfAbsent(uid, () => []).insert(
        0, _notif('Order placed 🎉', 'Your order ${o['order_number']} has been received.', 'order', data: {'order_id': id}));
    return MockResult({
      'order': _orderJson(o),
      'payment': {
        'gateway': method,
        'status': o['payment_status'],
        'amount': payable,
        'mock': true,
      },
    }, message: 'Order placed successfully');
  }

  // ---------------------------------------------------------------- returns / reviews

  Map<String, dynamic>? _findOrderItem(int uid, int itemId) {
    for (final o in _orders.where((o) => o['user_id'] == uid)) {
      for (final i in (o['items'] as List).cast<Map<String, dynamic>>()) {
        if (i['id'] == itemId || i['product_variant_id'] == itemId) return {'order': o, 'item': i};
      }
    }
    return null;
  }

  MockResult _returnsRoute(String m, Map<String, dynamic> b) {
    final uid = _requireUser();
    if (m == 'GET') return MockResult(_returns.where((r) => r['user_id'] == uid).toList());
    final found = _findOrderItem(uid, asInt(b['order_item_id']));
    if (found == null) throw AppException('Order item not found', code: 'not-found');
    final item = found['item'] as Map<String, dynamic>;
    item['_returned'] = true;
    final r = {
      'id': _next(),
      'return_number': 'RET-${(_returns.length + 1).toString().padLeft(5, '0')}',
      'order_id': (found['order'] as Map)['id'],
      'order_item_id': item['id'],
      'user_id': uid,
      'qty': asInt(b['qty'], 1),
      'reason': asString(b['reason']),
      'status': 'pending',
      'refund_amount': (item['sale_price'] as num) * asInt(b['qty'], 1),
      'product_name': item['product_name'],
      'created_at': DateTime.now().toUtc().toIso8601String(),
    };
    _returns.add(r);
    return MockResult(r, message: 'Return request submitted');
  }

  MockResult _postReview(Map<String, dynamic> b) {
    final uid = _requireUser();
    final found = _findOrderItem(uid, asInt(b['order_item_id']));
    final rating = asInt(b['rating']);
    if (rating < 1 || rating > 5) throw AppException('Please select a rating', code: 'failed-precondition');
    _P? p;
    if (found != null) {
      final item = found['item'] as Map<String, dynamic>;
      item['_reviewed'] = true;
      p = _findProduct('${item['product_id']}');
    } else if (b['product_id'] != null) {
      p = _findProduct(asString(b['product_id']));
    }
    if (p == null) throw AppException('Product not found', code: 'not-found');
    final review = {
      'id': _next(),
      'user': {'name': _users[uid]!['name'], 'avatar': ''},
      'rating': rating,
      'comment': asString(b['comment']),
      'images': <String>[],
      'created_at': DateTime.now().toUtc().toIso8601String(),
    };
    p.reviews.add(review);
    p.rating = _r((p.rating * p.ratingCount + rating) / (p.ratingCount + 1));
    p.ratingCount += 1;
    return MockResult(review, message: 'Thanks for your review!');
  }

  // ---------------------------------------------------------------- favorites

  MockResult _favorites(String m, String idSeg, Map<String, dynamic> body) {
    final set = _favs.putIfAbsent(_owner, () => <int>{});
    final id = int.tryParse(idSeg) ?? asIntOrNull(body['product_id']);
    switch (m) {
      case 'POST':
        if (id != null) set.add(id);
        return MockResult({'product_id': id, 'is_favorite': true}, message: 'Added to favourites');
      case 'DELETE':
        if (id != null) set.remove(id);
        return MockResult({'product_id': id, 'is_favorite': false}, message: 'Removed from favourites');
    }
    return MockResult(_products.where((p) => set.contains(p.id)).map((p) => _pJson(p)).toList());
  }

  // ---------------------------------------------------------------- wallet / referral

  MockResult _wallet(String m, String action, Map<String, dynamic> b) {
    final uid = _requireUser();
    final u = _users[uid]!;
    switch (action) {
      case '':
        final txns = _walletTxns[uid] ?? [];
        return MockResult(
          {'balance': u['wallet_balance'], 'transactions': txns},
          meta: {'current_page': 1, 'last_page': 1, 'per_page': 50, 'total': txns.length},
        );
      case 'recharge':
        final amount = asDouble(b['amount']);
        if (amount < 10) throw AppException('Minimum recharge amount is ₹10', code: 'failed-precondition');
        final method = asString(b['payment_method'], 'razorpay');
        _credit(uid, amount, method, 'Wallet successfully recharged', txnId: 'TXN-${_next()}${_rand.nextInt(9999)}');
        return MockResult({'status': 'success', 'balance': u['wallet_balance'], 'gateway': method, 'mock': true},
            message: '₹${amount.toStringAsFixed(0)} added to wallet');
      case 'withdraw':
        final amount = asDouble(b['amount']);
        if (amount <= 0) throw AppException('Enter a valid amount', code: 'failed-precondition');
        if (amount > (u['wallet_balance'] as num)) throw AppException('Insufficient wallet balance', code: 'failed-precondition');
        _debit(uid, amount, 'withdrawal', 'Withdrawal request — ${asString(b['message'], 'Bank transfer')}', status: 'pending');
        final w = {
          'id': _next(),
          'amount': amount,
          'message': asString(b['message']),
          'status': 'pending',
          'created_at': DateTime.now().toUtc().toIso8601String(),
        };
        _withdrawals.putIfAbsent(uid, () => []).insert(0, w);
        return MockResult(w, message: 'Withdrawal request submitted');
      case 'withdrawals':
        return MockResult(_withdrawals[uid] ?? []);
    }
    throw AppException('Not found', code: 'not-found');
  }

  Map<String, dynamic> _referral() {
    final uid = _requireUser();
    final isDemo = uid == 1;
    return {
      'code': _users[uid]!['referral_code'],
      'referrer_reward': 50,
      'referred_reward': 100,
      'min_order': 100,
      'total_earned': isDemo ? 150 : 0,
      'referrals': isDemo
          ? [
              {'name': 'Priya Nair', 'status': 'credited', 'reward': 50, 'created_at': _ago(days: 6)},
              {'name': 'Rohan Mehta', 'status': 'credited', 'reward': 50, 'created_at': _ago(days: 14)},
              {'name': 'Sneha Kulkarni', 'status': 'credited', 'reward': 50, 'created_at': _ago(days: 21)},
              {'name': 'Imran Shaikh', 'status': 'pending', 'reward': 50, 'created_at': _ago(days: 1)},
            ]
          : [],
    };
  }

  // ---------------------------------------------------------------- notifications / chat

  MockResult _notificationsRoute(String m, String action) {
    final uid = _requireUser();
    final list = _notifications.putIfAbsent(uid, () => []);
    if (m == 'POST' && action == 'read-all') {
      for (final n in list) {
        n['read_at'] ??= DateTime.now().toUtc().toIso8601String();
      }
      return const MockResult(null, message: 'All notifications marked as read');
    }
    return MockResult(list, meta: {'current_page': 1, 'last_page': 1, 'per_page': 50, 'total': list.length, 'unread': list.where((n) => n['read_at'] == null).length});
  }

  void _flushReplies() {
    final now = DateTime.now();
    final due = _pendingReplies.where((r) => (r['due'] as DateTime).isBefore(now)).toList();
    for (final r in due) {
      _pendingReplies.remove(r);
      final chatId = r['chat_id'] as int;
      _messages.putIfAbsent(chatId, () => []).add(_msg(chatId, 'admin', r['message'] as String));
    }
  }

  String _botReply(String text) {
    final t = text.toLowerCase();
    if (t.contains('address')) return 'Thank you. Could you please provide the correct delivery address?';
    if (t.contains('refund') || t.contains('return')) {
      return 'Refunds are credited to your QwikMart wallet instantly once the return is approved. Anything else I can help with?';
    }
    if (t.contains('order') || t.contains('late') || t.contains('where')) {
      return "Hello! Sure, I'd be happy to help. Please provide your order ID and the information you'd like to update.";
    }
    if (t.contains('thank')) return "You're welcome! Have a great day 😊";
    return 'Thanks for reaching out! A support executive will get back to you shortly.';
  }

  MockResult _chatsRoute(String m, List<String> seg, Map<String, dynamic> b) {
    final uid = _requireUser();
    final threads = _chats.putIfAbsent(uid, () => []);
    _flushReplies();
    if (seg.length == 1) {
      if (m == 'POST') {
        final orderId = asIntOrNull(b['order_id']);
        final existing = threads.where((t) => t['status'] == 'open' && t['order_id'] == orderId).firstOrNull;
        if (existing != null) return MockResult(existing);
        final t = {
          'id': _next(),
          'subject': asString(b['subject'], 'Support'),
          'order_id': orderId,
          'status': 'open',
          'last_message_at': DateTime.now().toUtc().toIso8601String(),
        };
        threads.insert(0, t);
        _messages[t['id'] as int] = [_msg(t['id'] as int, 'admin', 'Hi 👋 Welcome to QwikMart support. How can we help you today?')];
        return MockResult(t, message: 'Chat started');
      }
      return MockResult(threads.map((t) {
        final msgs = _messages[t['id']] ?? [];
        return {...t, 'last_message': msgs.isEmpty ? '' : msgs.last['message']};
      }).toList());
    }
    final chatId = int.tryParse(seg[1]) ?? 0;
    final thread = threads.where((t) => t['id'] == chatId).firstOrNull;
    if (thread == null) throw AppException('Chat not found', code: 'not-found');
    final msgs = _messages.putIfAbsent(chatId, () => []);
    if (m == 'POST') {
      final text = asString(b['message']).trim();
      if (text.isEmpty) throw AppException('Message cannot be empty', code: 'failed-precondition');
      final msg = _msg(chatId, 'customer', text);
      msgs.add(msg);
      thread['last_message_at'] = msg['created_at'];
      _pendingReplies.add({'chat_id': chatId, 'message': _botReply(text), 'due': DateTime.now().add(const Duration(seconds: 3))});
      return MockResult(msg);
    }
    return MockResult(msgs, meta: {'current_page': 1, 'last_page': 1, 'per_page': 100, 'total': msgs.length});
  }
}
