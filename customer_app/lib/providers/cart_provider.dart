import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/errors.dart';
import '../models/models.dart';
import 'providers.dart';

/// Cart of the current Firebase user (anonymous guests included).
///
/// Lines are written to `users/{uid}/cart`; the priced cart always comes from the `cartSummary` callable,
/// re-run after every change (own mutations, and line changes from elsewhere via [CartRepository.changes]).
class CartNotifier extends AsyncNotifier<Cart> {
  /// Variant ids with an in-flight mutation (used to show a spinner / block double taps).
  final Set<String> busy = {};
  StreamSubscription<void>? _changes;
  Timer? _debounce;

  @override
  Future<Cart> build() async {
    ref.watch(sessionProvider.select((s) => (s.user?.id, s.mockToken, s.mode, s.zoneId, s.storeId)));
    ref.watch(authUidProvider.select((a) => a.value));
    final addressId = ref.watch(checkoutAddressIdProvider);
    final repo = ref.read(cartRepoProvider);
    _changes?.cancel();
    _changes = repo.changes().listen((_) {
      _debounce?.cancel();
      _debounce = Timer(const Duration(milliseconds: 250), () => refresh().catchError((Object _) {}));
    }, onError: (Object _) {});
    ref.onDispose(() {
      _changes?.cancel();
      _debounce?.cancel();
    });
    try {
      return await repo.summary(addressId: addressId);
    } catch (_) {
      return Cart.empty;
    }
  }

  Cart get _cart => state.value ?? Cart.empty;

  Future<void> _run(String variantId, Future<void> Function() op) async {
    if (busy.contains(variantId)) return;
    busy.add(variantId);
    try {
      await op();
      await refresh();
    } finally {
      busy.remove(variantId);
    }
  }

  /// Adds one unit of [variantId] (of [productId]).
  Future<void> add(String productId, String variantId) => setQty(variantId, _cart.qtyForVariant(variantId) + 1, productId: productId);

  Future<void> setQty(String variantId, int qty, {String? productId}) async {
    final item = _cart.itemForVariant(variantId);
    if (item == null && qty <= 0) return;
    if (item != null && qty > item.qty && qty > item.maxQty && item.maxQty > 0) {
      throw AppException('Maximum ${item.maxQty} units allowed per order', code: 'failed-precondition');
    }
    if (item != null && qty > item.qty && item.stock > 0 && qty > item.stock) {
      throw AppException('Only ${item.stock} left in stock', code: 'failed-precondition');
    }
    final pid = item?.productId ?? productId;
    if (pid == null || pid.isEmpty) throw const AppException('Product not available', code: 'not-found');
    await _run(variantId, () => ref.read(cartRepoProvider).setLine(productId: pid, variantId: variantId, qty: qty, lineId: item?.id));
  }

  Future<void> increment(String variantId, {String? productId}) {
    final line = _cart.itemForVariant(variantId);
    if (line != null && line.qty >= line.limit) {
      throw AppException('You can order a maximum of ${line.limit} units of ${line.productName}.', code: 'invalid-argument');
    }
    return setQty(variantId, _cart.qtyForVariant(variantId) + 1, productId: productId);
  }
  Future<void> decrement(String variantId) => setQty(variantId, _cart.qtyForVariant(variantId) - 1);

  Future<void> clear() async {
    await ref.read(cartRepoProvider).clear();
    ref.read(appliedPromoProvider.notifier).state = null;
    await refresh();
  }

  Future<Cart>? _inFlight;

  /// Re-prices the cart (`cartSummary`). Concurrent calls share one request.
  Future<void> refresh() async {
    final f = _inFlight ??=
        ref.read(cartRepoProvider).summary(addressId: ref.read(checkoutAddressIdProvider)).whenComplete(() => _inFlight = null);
    state = AsyncData(await f);
  }
}

final cartProvider = AsyncNotifierProvider<CartNotifier, Cart>(CartNotifier.new);

/// Delivery address chosen at checkout: the cart summary is priced for it (distance-based delivery charge),
/// exactly like placeOrder prices the order.
final checkoutAddressIdProvider = StateProvider<String?>((ref) => null);

final cartCountProvider = Provider<int>((ref) => ref.watch(cartProvider).value?.itemCount ?? 0);

final appliedPromoProvider = StateProvider<AppliedPromo?>((ref) => null);
