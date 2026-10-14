import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/auth_service.dart';
import '../core/config.dart';
import '../core/errors.dart';
import '../data/mock/mock_api.dart';
import '../models/models.dart';
import '../repositories/repositories.dart';
import 'session_provider.dart';

export 'auth_provider.dart';
export 'cart_provider.dart';
export 'session_provider.dart';

// ------------------------------------------------------------------ infrastructure

final authServiceProvider = Provider<AuthService>((ref) => AuthService());

/// Offline demo data source (only used when [AppConfig.useMock]).
final mockApiProvider = Provider<MockApi>((ref) => MockApi(headers: () => ref.read(sessionProvider).headers));

/// Signed-in Firebase uid (anonymous guests included); null while signed out / in mock mode.
final authUidProvider = StreamProvider<String?>((ref) {
  final auth = ref.watch(authServiceProvider);
  if (AppConfig.useMock || !auth.available) return Stream.value(null);
  return auth.authStateChanges().map((u) => u?.uid);
});

RepoScope _scope(Ref ref) {
  final s = ref.read(sessionProvider);
  return RepoScope(
    zoneId: s.zoneId,
    mode: s.mode,
    storeId: s.isQuick ? s.storeId : '',
    lang: s.locale,
    deliveryMinutes: s.deliveryMinutes,
    loggedIn: s.isLoggedIn,
  );
}

final catalogRepoProvider = Provider<CatalogRepository>((ref) => AppConfig.useMock
    ? MockCatalogRepository(ref.watch(mockApiProvider))
    : FirebaseCatalogRepository(() => _scope(ref)));

final cartRepoProvider = Provider<CartRepository>((ref) =>
    AppConfig.useMock ? MockCartRepository(ref.watch(mockApiProvider)) : FirebaseCartRepository(() => _scope(ref)));

final orderRepoProvider = Provider<OrderRepository>((ref) =>
    AppConfig.useMock ? MockOrderRepository(ref.watch(mockApiProvider)) : FirebaseOrderRepository(() => _scope(ref)));

final accountRepoProvider = Provider<AccountRepository>((ref) => AppConfig.useMock
    ? MockAccountRepository(ref.watch(mockApiProvider))
    : FirebaseAccountRepository(() => _scope(ref)));

final contentRepoProvider = Provider<ContentRepository>((ref) => AppConfig.useMock
    ? MockContentRepository(ref.watch(mockApiProvider))
    : FirebaseContentRepository(() => _scope(ref)));

/// Rebuild-key for data that depends on zone/mode/locale/auth.
final dataScopeProvider = Provider<String>((ref) {
  final s = ref.watch(sessionProvider);
  return '${s.zoneId}|${s.storeId}|${s.mode}|${s.locale}|${s.user?.id}|${s.mockToken}';
});

// ------------------------------------------------------------------ app / catalog

final appSettingsProvider = FutureProvider<AppSettings>((ref) async {
  try {
    return await ref.watch(accountRepoProvider).settings();
  } catch (_) {
    return const AppSettings();
  }
});

/// Home for a top category tab ('' = All).
final homeProvider = FutureProvider.family<HomeData, String>((ref, categoryId) async {
  ref.watch(dataScopeProvider);
  return ref.watch(catalogRepoProvider).home(categoryId: categoryId);
});

final categoryTreeProvider = FutureProvider<List<Category>>((ref) async {
  ref.watch(dataScopeProvider);
  return ref.watch(catalogRepoProvider).categoryTree();
});

final subcategoriesProvider = FutureProvider.family<List<Category>, String>((ref, parentId) async {
  ref.watch(dataScopeProvider);
  return ref.watch(catalogRepoProvider).subcategories(parentId);
});

final brandsProvider = FutureProvider<List<Brand>>((ref) async {
  ref.watch(dataScopeProvider);
  return ref.watch(catalogRepoProvider).brands();
});

final productsProvider = FutureProvider.autoDispose.family<Paged<Product>, ProductQuery>((ref, q) async {
  ref.watch(dataScopeProvider);
  return ref.watch(catalogRepoProvider).products(q);
});

final productDetailProvider = FutureProvider.autoDispose.family<Product, String>((ref, slug) async {
  ref.watch(dataScopeProvider);
  return ref.watch(catalogRepoProvider).product(slug);
});

final trendingProvider = FutureProvider.autoDispose<List<String>>((ref) async {
  try {
    return await ref.watch(catalogRepoProvider).trending();
  } catch (_) {
    return const [];
  }
});

// ------------------------------------------------------------------ favourites

class FavoritesNotifier extends AsyncNotifier<List<Product>> {
  @override
  Future<List<Product>> build() async {
    ref.watch(dataScopeProvider);
    if (!ref.read(sessionProvider).isLoggedIn) return const [];
    try {
      return await ref.read(accountRepoProvider).favorites();
    } on AppException catch (e) {
      if (e.isUnauthorized) return const [];
      rethrow;
    }
  }

  bool isFavorite(String productId) => (state.value ?? const []).any((p) => p.id == productId);

  /// Returns the new favourite state. Throws `unauthenticated` for guests (callers open the login screen).
  Future<bool> toggle(Product p) async {
    if (!ref.read(sessionProvider).isLoggedIn) throw const AppException.unauthenticated();
    final current = state.value ?? const <Product>[];
    final fav = current.any((x) => x.id == p.id);
    state = AsyncData(fav ? current.where((x) => x.id != p.id).toList() : [p, ...current]);
    try {
      if (fav) {
        await ref.read(accountRepoProvider).removeFavorite(p.id);
      } else {
        await ref.read(accountRepoProvider).addFavorite(p.id);
      }
      return !fav;
    } catch (e) {
      state = AsyncData(current);
      rethrow;
    }
  }
}

final favoritesProvider = AsyncNotifierProvider<FavoritesNotifier, List<Product>>(FavoritesNotifier.new);

final favoriteIdsProvider = Provider<Set<String>>((ref) {
  final favs = ref.watch(favoritesProvider).value ?? const <Product>[];
  return favs.map((p) => p.id).toSet();
});

// ------------------------------------------------------------------ account

class AddressesNotifier extends AsyncNotifier<List<Address>> {
  @override
  Future<List<Address>> build() async {
    final s = ref.watch(sessionProvider.select((s) => s.user?.id));
    if (s == null) return const [];
    return ref.read(accountRepoProvider).addresses();
  }

  Future<Address> save(Address a) async {
    final saved = await ref.read(accountRepoProvider).saveAddress(a);
    ref.invalidateSelf();
    await future;
    return saved;
  }

  Future<void> remove(String id) async {
    await ref.read(accountRepoProvider).deleteAddress(id);
    ref.invalidateSelf();
  }
}

final addressesProvider = AsyncNotifierProvider<AddressesNotifier, List<Address>>(AddressesNotifier.new);

final ordersProvider = FutureProvider.autoDispose.family<List<Order>, String>((ref, status) async {
  ref.watch(dataScopeProvider);
  return ref.watch(orderRepoProvider).list(status: status);
});

/// Realtime order (Firestore `onSnapshot`) incl. the delivery OTP while it is active.
final orderDetailProvider = StreamProvider.autoDispose.family<Order, String>((ref, id) {
  ref.watch(dataScopeProvider);
  return ref.watch(orderRepoProvider).watch(id);
});

final walletProvider = FutureProvider.autoDispose<WalletData>((ref) async {
  ref.watch(dataScopeProvider);
  return ref.watch(accountRepoProvider).wallet();
});

final referralProvider = FutureProvider.autoDispose<ReferralInfo>((ref) async {
  ref.watch(dataScopeProvider);
  return ref.watch(accountRepoProvider).referral();
});

final notificationsProvider = FutureProvider.autoDispose<List<AppNotification>>((ref) async {
  ref.watch(dataScopeProvider);
  if (!ref.watch(sessionProvider).isLoggedIn) return const [];
  return ref.watch(accountRepoProvider).notifications();
});

final unreadCountProvider = Provider<int>((ref) {
  final list = ref.watch(notificationsProvider).value ?? const <AppNotification>[];
  return list.where((n) => !n.isRead).length;
});

// ------------------------------------------------------------------ content

final blogCategoriesProvider = FutureProvider.autoDispose<List<BlogCategory>>(
  (ref) => ref.watch(contentRepoProvider).blogCategories(),
);

final blogsProvider = FutureProvider.autoDispose.family<List<Blog>, String?>(
  (ref, categoryId) => ref.watch(contentRepoProvider).blogs(categoryId: categoryId),
);

final blogProvider = FutureProvider.autoDispose.family<Blog, String>(
  (ref, slug) => ref.watch(contentRepoProvider).blog(slug),
);

final faqsProvider = FutureProvider.autoDispose<List<Faq>>((ref) => ref.watch(contentRepoProvider).faqs());

final cmsPageProvider = FutureProvider.autoDispose.family<CmsPage, String>(
  (ref, slug) => ref.watch(contentRepoProvider).page(slug),
);
