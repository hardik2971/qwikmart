import 'dart:async';

import 'package:image_picker/image_picker.dart';

import '../../core/config.dart';
import '../../data/mock/mock_api.dart';
import '../../models/models.dart';
import '../repositories.dart';

/// Offline demo implementations (`USE_MOCK=true`) backed by the in-memory [MockApi]. No network calls.

/// Emits [load] now and every [AppConfig.pollInterval] until cancelled (the mock has no realtime feed).
Stream<T> pollStream<T>(Future<T> Function() load) {
  late final StreamController<T> c;
  Timer? timer;
  Future<void> tick() async {
    try {
      final v = await load();
      if (!c.isClosed) c.add(v);
    } catch (e, st) {
      if (!c.isClosed) c.addError(e, st);
    }
  }

  c = StreamController<T>(
    onListen: () {
      tick();
      timer = Timer.periodic(AppConfig.pollInterval, (_) => tick());
    },
    onCancel: () {
      timer?.cancel();
      return c.close();
    },
  );
  return c.stream;
}

class MockCatalogRepository implements CatalogRepository {
  final MockApi api;
  MockCatalogRepository(this.api);

  @override
  Future<HomeData> home({String? categoryId}) async {
    final r = await api.get('/home', query: {if (categoryId != null && categoryId.isNotEmpty) 'category_id': categoryId});
    return HomeData.fromJson(r.map);
  }

  @override
  Future<List<Category>> categoryTree() async => (await api.get('/categories', query: {'tree': 1})).list.map(Category.fromJson).toList();

  @override
  Future<List<Category>> subcategories(String parentId) async =>
      (await api.get('/categories', query: {'parent_id': parentId})).list.map(Category.fromJson).toList();

  @override
  Future<List<Brand>> brands() async => (await api.get('/brands')).list.map(Brand.fromJson).toList();

  @override
  Future<Paged<Product>> products(ProductQuery q) async {
    final r = await api.get('/products', query: q.toQuery());
    return Paged(
      r.list.map(Product.fromJson).toList(),
      page: asInt(r.meta?['current_page'], 1),
      lastPage: asInt(r.meta?['last_page'], 1),
      total: asInt(r.meta?['total'], r.list.length),
    );
  }

  @override
  Future<Product> product(String slug) async => Product.fromJson((await api.get('/products/$slug')).map);

  @override
  Future<List<Review>> reviews(String productId) async =>
      (await api.get('/products/$productId/reviews')).list.map(Review.fromJson).toList();

  @override
  Future<SearchSuggestions> suggestions(String q) async {
    final m = (await api.get('/search/suggestions', query: {'q': q})).map;
    return SearchSuggestions(
      asMapList(m['products'])
          .map((p) => (id: asId(p['id']), name: asText(p['name']), slug: asString(p['slug'], '${p['id']}')))
          .toList(),
      asMapList(m['categories']).map((c) => (id: asId(c['id']), name: asText(c['name']))).toList(),
    );
  }

  @override
  Future<List<String>> trending() async {
    final d = (await api.get('/search/trending')).data;
    if (d is List) return d.map((e) => e is Map ? asString(e['name'] ?? e['term']) : e.toString()).toList();
    return [];
  }
}

class MockCartRepository implements CartRepository {
  final MockApi api;
  MockCartRepository(this.api);

  @override
  Future<Cart> summary({String? promoCode, String? addressId}) async => Cart.fromJson((await api.get('/cart')).map);

  @override
  Future<void> setLine({required String productId, required String variantId, required int qty, String? lineId}) async {
    if (lineId == null) {
      if (qty > 0) await api.post('/cart', body: {'product_variant_id': variantId, 'qty': qty});
    } else if (qty <= 0) {
      await api.delete('/cart/$lineId');
    } else {
      await api.put('/cart/$lineId', body: {'qty': qty});
    }
  }

  @override
  Future<void> clear() async => api.delete('/cart');

  @override
  Stream<void> changes() => const Stream.empty();

  @override
  Future<List<Coupon>> coupons({double subtotal = 0}) async =>
      (await api.get('/promo-codes')).list.map((j) => Coupon.fromJson(j).withSubtotal(subtotal)).toList();

  @override
  Future<AppliedPromo> applyCoupon(String code) async {
    final r = await api.post('/promo-codes/apply', body: {'code': code});
    final p = AppliedPromo.fromJson(r.map);
    return AppliedPromo(
      code: p.code.isEmpty ? code : p.code,
      discount: p.discount,
      message: r.message.isNotEmpty && r.message != 'OK' ? r.message : p.message,
      isCashback: p.isCashback,
      freeDelivery: p.freeDelivery,
    );
  }

  /// Offline login: move the guest cart to the user (mock only).
  Future<void> syncGuest(String guestToken) async => api.post('/cart/sync', body: {'guest_token': guestToken});
}

class MockOrderRepository implements OrderRepository {
  final MockApi api;
  MockOrderRepository(this.api);

  @override
  Future<PlaceOrderResult> place({
    required String? addressId,
    required String deliveryType,
    required String paymentMethod,
    String? promoCode,
    bool useWallet = false,
    String? notes,
  }) async {
    final m = (await api.post('/orders', body: {
      'address_id': addressId,
      'delivery_type': deliveryType,
      'payment_method': paymentMethod,
      'promo_code': promoCode,
      'use_wallet': useWallet,
      'notes': notes,
    }))
        .map;
    final order = m['order'] is Map ? asMap(m['order']) : m;
    final payment = asMap(m['payment']);
    final paid = asString(payment['status']) == 'paid' || paymentMethod == 'cod' || paymentMethod == 'wallet';
    return PlaceOrderResult(
      asId(order['id']),
      asString(order['order_number']),
      paid ? null : {...payment, 'gateway': paymentMethod, 'amount': order['total']},
    );
  }

  @override
  Future<void> verifyPayment(String orderId, String gateway, Map<String, dynamic> payload) async =>
      api.post('/orders/$orderId/payment/verify', body: {'gateway': gateway, ...payload});

  @override
  Future<List<Order>> list({String status = ''}) async =>
      (await api.get('/orders', query: {'status': status})).list.map(Order.fromJson).toList();

  @override
  Future<Order> detail(String id) async => Order.fromJson((await api.get('/orders/$id')).map);

  /// Polls the mock order (the simulated order advances over time).
  @override
  Stream<Order> watch(String id) => pollStream(() => detail(id));

  @override
  Stream<TrackInfo> track(String id) => pollStream(() async => TrackInfo.fromJson((await api.get('/orders/$id/track')).map));

  @override
  Future<void> cancel(String id, String reason) async => api.post('/orders/$id/cancel', body: {'reason': reason});

  @override
  Future<String> reorder(String id) async => (await api.post('/orders/$id/reorder')).message;

  @override
  Future<String> invoiceUrl(String id) async => asString((await api.get('/orders/$id/invoice')).map['invoice_url']);

  @override
  Future<String> requestReturn({
    required String orderId,
    required String variantId,
    required int qty,
    required String reason,
    List<XFile> images = const [],
  }) async =>
      (await api.post('/returns', body: {'order_id': orderId, 'order_item_id': variantId, 'qty': qty, 'reason': reason})).message;

  @override
  Future<List<ReturnRequest>> returns() async => (await api.get('/returns')).list.map(ReturnRequest.fromJson).toList();

  @override
  Future<String> review({
    required String orderId,
    required String variantId,
    required String productId,
    required int rating,
    required String comment,
    List<XFile> images = const [],
  }) async =>
      (await api.post('/reviews', body: {
        'order_item_id': variantId,
        'product_id': productId,
        'rating': rating,
        'comment': comment,
      }))
          .message;
}

class MockAccountRepository extends AccountRepository {
  final MockApi api;
  MockAccountRepository(this.api);

  @override
  Future<AppSettings> settings() async => AppSettings.fromJson((await api.get('/settings/app')).map);
  @override
  Future<List<Country>> countries() async => (await api.get('/countries')).list.map(Country.fromJson).toList();
  @override
  Future<List<Zone>> zones({String? countryId}) async =>
      (await api.get('/zones', query: {'country_id': countryId})).list.map(Zone.fromJson).toList();
  @override
  Future<ZoneDetectResult> detectZone(double lat, double lng) async =>
      ZoneDetectResult.fromJson((await api.post('/zones/detect', body: {'lat': lat, 'lng': lng})).map);

  @override
  Future<AuthResult> syncProfile({String? name, String? email, String? referralCode, String? fcmToken, String? language}) async =>
      AuthResult(await profile());

  @override
  Future<void> mergeGuestCart(String guestUid) async {}

  @override
  Future<String> mockSendOtp(String phone, String countryCode) async =>
      (await api.post('/mock-auth/send-otp', body: {'phone': phone, 'country_code': countryCode})).message;

  @override
  Future<AuthResult> mockVerifyOtp(String phone, String countryCode, String otp) async => AuthResult.fromJson(
      (await api.post('/mock-auth/verify-otp', body: {'phone': phone, 'country_code': countryCode, 'otp': otp})).map);

  @override
  Future<AuthResult> mockLogin(String email, String password) async =>
      AuthResult.fromJson((await api.post('/mock-auth/login', body: {'email': email, 'password': password})).map);

  @override
  Future<AuthResult> mockRegister({required String name, required String email, required String password}) async =>
      AuthResult.fromJson(
          (await api.post('/mock-auth/register', body: {'name': name, 'email': email, 'password': password})).map);

  @override
  Future<AppUser> profile() async => AppUser.fromJson((await api.get('/profile')).map);

  @override
  Future<AppUser> updateProfile({String? name, String? email, XFile? avatar}) async =>
      AppUser.fromJson((await api.put('/profile', body: {'name': ?name, 'email': ?email})).map);

  @override
  Future<void> registerFcmToken(String token) async {}

  @override
  Future<void> logout({String? fcmToken}) async {
    try {
      await api.post('/auth/logout');
    } catch (_) {}
  }

  @override
  Future<void> deleteAccount() async => api.delete('/profile');

  @override
  Future<List<Address>> addresses() async => (await api.get('/addresses')).list.map(Address.fromJson).toList();

  @override
  Future<Address> saveAddress(Address a) async {
    final r = a.id.isNotEmpty ? await api.put('/addresses/${a.id}', body: a.toJson()) : await api.post('/addresses', body: a.toJson());
    return Address.fromJson(r.map);
  }

  @override
  Future<void> deleteAddress(String id) async => api.delete('/addresses/$id');

  @override
  Future<List<Product>> favorites() async => (await api.get('/favorites')).list.map(Product.fromJson).toList();
  @override
  Future<void> addFavorite(String productId) async => api.post('/favorites', body: {'product_id': productId});
  @override
  Future<void> removeFavorite(String productId) async => api.delete('/favorites/$productId');

  @override
  Future<WalletData> wallet() async {
    final r = await api.get('/wallet');
    final w = WalletData.fromJson(r.map);
    final withdrawals = (await api.get('/wallet/withdrawals')).list.map(WithdrawalRequest.fromJson).toList();
    return WalletData(balance: w.balance, transactions: w.transactions, withdrawals: withdrawals);
  }

  @override
  Future<Map<String, dynamic>> rechargeWallet(double amount, String method) async {
    final r = await api.post('/wallet/recharge', body: {'amount': amount, 'payment_method': method});
    return {...r.map, 'message': r.message};
  }

  @override
  Future<String> verifyRecharge(String rechargeId, Map<String, dynamic> payload) async => 'Wallet recharged';

  @override
  Future<String> withdraw(double amount, String message) async =>
      (await api.post('/wallet/withdraw', body: {'amount': amount, 'message': message})).message;

  @override
  Future<ReferralInfo> referral() async => ReferralInfo.fromJson((await api.get('/referral')).map);

  @override
  Future<List<AppNotification>> notifications() async =>
      (await api.get('/notifications', query: {'per_page': 50})).list.map(AppNotification.fromJson).toList();
  @override
  Future<void> readAllNotifications() async => api.post('/notifications/read-all');
  @override
  Future<void> readNotification(String id) async => api.post('/notifications/$id/read');
}

class MockContentRepository implements ContentRepository {
  final MockApi api;
  MockContentRepository(this.api);

  @override
  Future<List<Blog>> blogs({String? categoryId}) async =>
      (await api.get('/blogs', query: {'category_id': categoryId})).list.map(Blog.fromJson).toList();
  @override
  Future<Blog> blog(String slug) async => Blog.fromJson((await api.get('/blogs/$slug')).map);
  @override
  Future<List<BlogCategory>> blogCategories() async =>
      (await api.get('/blog-categories')).list.map(BlogCategory.fromJson).toList();
  @override
  Future<List<Faq>> faqs() async => (await api.get('/faqs')).list.map(Faq.fromJson).toList();
  @override
  Future<CmsPage> page(String slug) async => CmsPage.fromJson((await api.get('/pages/$slug')).map);

  @override
  Future<List<ChatThread>> chats() async => (await api.get('/chats')).list.map(ChatThread.fromJson).toList();

  @override
  Future<ChatThread> startChat({String subject = 'Support', String? orderId, String orderNumber = '', required String message}) async =>
      ChatThread.fromJson((await api.post('/chats', body: {'subject': subject, 'order_id': ?orderId, 'message': message})).map);

  @override
  Stream<List<ChatMessage>> messages(String chatId) => pollStream(() async =>
      (await api.get('/chats/$chatId/messages', query: {'per_page': 100})).list.map(ChatMessage.fromJson).toList()
        ..sort((a, b) => (a.createdAt ?? DateTime(0)).compareTo(b.createdAt ?? DateTime(0))));

  @override
  Future<void> send(String chatId, String message) async => api.post('/chats/$chatId/messages', body: {'message': message});

  @override
  Future<void> markChatRead(String chatId) async {}
}
