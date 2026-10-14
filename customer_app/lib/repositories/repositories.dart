import 'package:image_picker/image_picker.dart';

import '../models/models.dart';

export 'firebase/firebase_repositories.dart';
export 'mock/mock_repositories.dart';

/// Data-layer contracts. Two implementations:
/// - `firebase/` — Cloud Firestore reads/writes + `asia-south1` callables + Storage (the real backend);
/// - `mock/` — the in-app offline demo data source (`USE_MOCK=true`).
///
/// Every method throws [AppException] (`core/errors.dart`) on failure.

/// What the data layer needs to know about the current session.
class RepoScope {
  final String? zoneId;
  final String mode; // quick | ecommerce
  /// Store serving quick orders in the zone (zone `default_store_id`); empty when unknown / eCommerce.
  final String storeId;
  final String lang;
  final int deliveryMinutes;
  final bool loggedIn;
  const RepoScope({
    this.zoneId,
    this.mode = 'quick',
    this.storeId = '',
    this.lang = 'en',
    this.deliveryMinutes = 0,
    this.loggedIn = false,
  });

  bool get isQuick => mode == 'quick';
}

typedef ScopeReader = RepoScope Function();

class Paged<T> {
  final List<T> items;
  final int page;
  final int lastPage;
  final int total;
  const Paged(this.items, {this.page = 1, this.lastPage = 1, this.total = 0});
  bool get hasMore => page < lastPage;
}

/// Product listing query (category listing, search, sort and filters).
class ProductQuery {
  final String q;
  final String? categoryId;
  final Set<String> brandIds;
  final double? minPrice;
  final double? maxPrice;
  final String sort;
  final int page;
  final int perPage;

  const ProductQuery({
    this.q = '',
    this.categoryId,
    this.brandIds = const {},
    this.minPrice,
    this.maxPrice,
    this.sort = '',
    this.page = 1,
    this.perPage = 20,
  });

  ProductQuery copyWith({
    String? q,
    String? categoryId,
    bool clearCategory = false,
    Set<String>? brandIds,
    double? minPrice,
    double? maxPrice,
    bool clearPrice = false,
    String? sort,
    int? page,
  }) =>
      ProductQuery(
        q: q ?? this.q,
        categoryId: clearCategory ? null : (categoryId ?? this.categoryId),
        brandIds: brandIds ?? this.brandIds,
        minPrice: clearPrice ? null : (minPrice ?? this.minPrice),
        maxPrice: clearPrice ? null : (maxPrice ?? this.maxPrice),
        sort: sort ?? this.sort,
        page: page ?? this.page,
        perPage: perPage,
      );

  int get activeFilters =>
      (categoryId != null ? 1 : 0) + (brandIds.isNotEmpty ? 1 : 0) + (minPrice != null || maxPrice != null ? 1 : 0);

  /// Query string for the offline mock data source.
  Map<String, dynamic> toQuery() => {
        'q': q,
        'category_id': categoryId,
        'brand_id': brandIds.isEmpty ? null : brandIds.join(','),
        'min_price': minPrice?.round(),
        'max_price': maxPrice?.round(),
        'sort': sort,
        'page': page,
        'per_page': perPage,
      };

  @override
  bool operator ==(Object other) =>
      other is ProductQuery &&
      other.q == q &&
      other.categoryId == categoryId &&
      other.brandIds.length == brandIds.length &&
      other.brandIds.containsAll(brandIds) &&
      other.minPrice == minPrice &&
      other.maxPrice == maxPrice &&
      other.sort == sort &&
      other.page == page;

  @override
  int get hashCode => Object.hash(q, categoryId, Object.hashAllUnordered(brandIds), minPrice, maxPrice, sort, page);
}

class SearchSuggestions {
  final List<({String id, String name, String slug})> products;
  final List<({String id, String name})> categories;
  const SearchSuggestions(this.products, this.categories);
}

/// Result of `placeOrder`: the new order id/number + gateway payload (null for COD / wallet / fully paid).
class PlaceOrderResult {
  final String orderId;
  final String orderNumber;
  final Map<String, dynamic>? payment;
  const PlaceOrderResult(this.orderId, this.orderNumber, this.payment);

  bool get needsPayment => payment != null && payment!.isNotEmpty;
}

/// Result of `syncProfile` (or an offline mock login, which also carries [mockToken]).
class AuthResult {
  final AppUser user;
  final bool isNew;
  final bool blocked;
  final String? mockToken;
  const AuthResult(this.user, {this.isNew = false, this.blocked = false, this.mockToken});

  factory AuthResult.fromJson(Map<String, dynamic> j) {
    final token = asString(j['token']);
    return AuthResult(
      AppUser.fromJson(asMap(j['user'])),
      isNew: asBool(j['is_new']),
      blocked: asBool(j['blocked']),
      mockToken: token.isEmpty ? null : token,
    );
  }
}

abstract class CatalogRepository {
  Future<HomeData> home({String? categoryId});
  Future<List<Category>> categoryTree();
  Future<List<Category>> subcategories(String parentId);
  Future<List<Brand>> brands();
  Future<Paged<Product>> products(ProductQuery q);

  /// Product by slug (or id), with variants, reviews, "also buy" (cross/up-sell) and similar products.
  Future<Product> product(String slug);
  Future<List<Review>> reviews(String productId);
  Future<SearchSuggestions> suggestions(String q);
  Future<List<String>> trending();
}

abstract class CartRepository {
  /// Priced cart (server prices via `cartSummary`); [promoCode] is evaluated too.
  /// [addressId]: the selected delivery address, so the delivery charge is priced like placeOrder prices it.
  Future<Cart> summary({String? promoCode, String? addressId});

  /// Sets the qty of a cart line (0 removes it). [lineId] is the existing line (null to add).
  Future<void> setLine({required String productId, required String variantId, required int qty, String? lineId});
  Future<void> clear();

  /// Emits whenever the stored cart lines change (another device, reorder, guest-cart merge). Mock: never.
  Stream<void> changes();

  Future<List<Coupon>> coupons({double subtotal = 0});

  /// Evaluates [code] against the current cart. Throws [AppException] with the reason when it does not apply.
  Future<AppliedPromo> applyCoupon(String code);
}

abstract class OrderRepository {
  Future<PlaceOrderResult> place({
    required String? addressId,
    required String deliveryType,
    required String paymentMethod,
    String? promoCode,
    bool useWallet = false,
    String? notes,
  });

  Future<void> verifyPayment(String orderId, String gateway, Map<String, dynamic> payload);
  Future<List<Order>> list({String status = ''});
  Future<Order> detail(String id);

  /// Realtime order (+ delivery OTP while active).
  Stream<Order> watch(String id);

  /// Realtime tracking: rider position, store, destination, ETA.
  Stream<TrackInfo> track(String id);
  Future<void> cancel(String id, String reason);

  /// Adds the order's items to the cart again; returns a user-facing message.
  Future<String> reorder(String id);
  Future<String> invoiceUrl(String id);

  Future<String> requestReturn({
    required String orderId,
    required String variantId,
    required int qty,
    required String reason,
    List<XFile> images = const [],
  });

  Future<List<ReturnRequest>> returns();

  Future<String> review({
    required String orderId,
    required String variantId,
    required String productId,
    required int rating,
    required String comment,
    List<XFile> images = const [],
  });
}

abstract class AccountRepository {
  Future<AppSettings> settings();
  Future<List<Country>> countries();
  Future<List<Zone>> zones({String? countryId});
  Future<ZoneDetectResult> detectZone(double lat, double lng);

  /// `syncProfile` — call after every sign-in.
  Future<AuthResult> syncProfile({String? name, String? email, String? referralCode, String? fcmToken, String? language});

  /// Moves an anonymous guest's cart into the signed-in user's cart (`mergeGuestCart`).
  Future<void> mergeGuestCart(String guestUid);
  Future<AppUser> profile();
  Future<AppUser> updateProfile({String? name, String? email, XFile? avatar});
  Future<void> registerFcmToken(String token);

  /// Sign-out housekeeping (drops this device's FCM token).
  Future<void> logout({String? fcmToken});
  Future<void> deleteAccount();

  Future<List<Address>> addresses();
  Future<Address> saveAddress(Address a);
  Future<void> deleteAddress(String id);

  Future<List<Product>> favorites();
  Future<void> addFavorite(String productId);
  Future<void> removeFavorite(String productId);

  Future<WalletData> wallet();

  /// Starts a gateway top-up; returns the payment payload (+ `recharge_id`).
  Future<Map<String, dynamic>> rechargeWallet(double amount, String method);
  Future<String> verifyRecharge(String rechargeId, Map<String, dynamic> payload);
  Future<String> withdraw(double amount, String message);

  Future<ReferralInfo> referral();

  Future<List<AppNotification>> notifications();
  Future<void> readAllNotifications();
  Future<void> readNotification(String id);

  // ---- Offline demo logins (mock data source only).
  Future<String> mockSendOtp(String phone, String countryCode) => throw UnsupportedError('mock only');
  Future<AuthResult> mockVerifyOtp(String phone, String countryCode, String otp) => throw UnsupportedError('mock only');
  Future<AuthResult> mockLogin(String email, String password) => throw UnsupportedError('mock only');
  Future<AuthResult> mockRegister({required String name, required String email, required String password}) =>
      throw UnsupportedError('mock only');
}

abstract class ContentRepository {
  Future<List<Blog>> blogs({String? categoryId});
  Future<Blog> blog(String slug);
  Future<List<BlogCategory>> blogCategories();
  Future<List<Faq>> faqs();
  Future<CmsPage> page(String slug);

  Future<List<ChatThread>> chats();

  /// Opens a support thread and posts its first message.
  Future<ChatThread> startChat({String subject = 'Support', String? orderId, String orderNumber = '', required String message});

  /// Realtime messages, oldest first.
  Stream<List<ChatMessage>> messages(String chatId);
  Future<void> send(String chatId, String message);
  Future<void> markChatRead(String chatId);
}
