// Firebase emulator smoke test for the customer app's data layer (real FlutterFire plugins, no mocks).
//
// It is a Flutter *web entrypoint*: it boots Firebase against the Emulator Suite, then drives the same
// providers / repositories the app uses through the full customer journey, logging `SMOKE …` lines to the
// browser console (and on screen):
//
//   guest (anonymous) → add to cart → email login customer@gmail.com/123456 → guest cart merged → cartSummary
//   → coupons → address add → placeOrder COD → realtime order + OTP → cancel (realtime) → orders list → reorder
//   → wallet + withdrawal → favourites → notifications → chat (realtime) → profile (+ avatar upload) → referral
//   → content → logout (back to a guest).
//
// Run (emulators started with the migrated data, see README → "Firebase emulators"):
//   flutter run -d chrome -t tool/firebase_smoke_test.dart --dart-define=USE_EMULATORS=true \
//     --dart-define=EMULATOR_HOST=127.0.0.1 --dart-define=AUTH_PORT=9099 --dart-define=FIRESTORE_PORT=8080 \
//     --dart-define=FUNCTIONS_PORT=5001 --dart-define=STORAGE_PORT=9199
// or headless: `flutter build web -t tool/firebase_smoke_test.dart …`, serve `build/web`, open it in headless
// Chrome and wait for the `SMOKE RESULT` console line (exit code = failures).
import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:customer/core/config.dart';
import 'package:customer/core/firebase.dart';
import 'package:customer/models/models.dart';
import 'package:customer/providers/providers.dart';
import 'package:customer/repositories/repositories.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';

final _log = ValueNotifier<List<String>>([]);
var _failures = 0;
var _passed = 0;

void _print(String line) {
  // ignore: avoid_print
  print(line);
  _log.value = [..._log.value, line];
}

Future<T?> step<T>(String name, Future<T> Function() body) async {
  final sw = Stopwatch()..start();
  try {
    final r = await body().timeout(const Duration(seconds: 60));
    _passed++;
    _print('SMOKE PASS $name (${sw.elapsedMilliseconds} ms)');
    return r;
  } catch (e, st) {
    _failures++;
    _print('SMOKE FAIL $name: $e');
    _print(st.toString().split('\n').take(6).join('\n'));
    return null;
  }
}

void check(bool cond, String message) {
  if (!cond) throw StateError(message);
}

Future<void> waitFor(bool Function() cond, String what, {Duration timeout = const Duration(seconds: 20)}) async {
  final end = DateTime.now().add(timeout);
  while (!cond()) {
    if (DateTime.now().isAfter(end)) throw TimeoutException('timed out waiting for $what');
    await Future<void>.delayed(const Duration(milliseconds: 100));
  }
}

/// First value of [s] matching [test].
Future<T> firstWhere<T>(Stream<T> s, bool Function(T) test, String what) =>
    s.firstWhere(test).timeout(const Duration(seconds: 30), onTimeout: () => throw TimeoutException('no $what'));

// 1×1 transparent PNG.
final _png = base64Decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=');

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(MaterialApp(
    home: Scaffold(
      body: ValueListenableBuilder<List<String>>(
        valueListenable: _log,
        builder: (_, lines, _) => ListView(
          padding: const EdgeInsets.all(12),
          children: [for (final l in lines) Text(l, style: const TextStyle(fontFamily: 'monospace', fontSize: 11))],
        ),
      ),
    ),
  ));
  _print('SMOKE START emulators=${AppConfig.useEmulators} host=${AppConfig.emulatorHost} '
      'auth=${AppConfig.authPort} firestore=${AppConfig.firestorePort} functions=${AppConfig.functionsPort} '
      'storage=${AppConfig.storagePort}');
  try {
    await _run();
  } catch (e, st) {
    _failures++;
    _print('SMOKE FAIL fatal: $e\n$st');
  }
  _print('SMOKE RESULT ${_failures == 0 ? 'OK' : 'FAILED'} passed=$_passed failed=$_failures');
}

Future<void> _run() async {
  check(AppConfig.useEmulators, 'build with --dart-define=USE_EMULATORS=true (never run this against production)');
  check(await Fb.init(), 'Firebase init failed');
  await Fb.auth.signOut();

  final prefs = await SharedPreferences.getInstance();
  final c = ProviderContainer(overrides: [
    prefsProvider.overrideWithValue(prefs),
    initialSessionProvider.overrideWithValue(const SessionState(onboarded: true, mode: 'quick')),
  ]);
  final keepAlive = <ProviderSubscription<Object?>>[
    c.listen(cartProvider, (_, _) {}),
    c.listen(authUidProvider, (_, _) {}),
  ];
  AuthSync(c).start();

  final account = c.read(accountRepoProvider);
  final catalog = c.read(catalogRepoProvider);
  final orders = c.read(orderRepoProvider);
  final content = c.read(contentRepoProvider);

  // ------------------------------------------------------------------ guest
  final guestUid = await step('anonymous guest session', () async {
    await waitFor(() => Fb.auth.currentUser != null, 'anonymous sign-in');
    final u = Fb.auth.currentUser!;
    check(u.isAnonymous, 'expected an anonymous user');
    check(!c.read(sessionProvider).isLoggedIn, 'guest must not be logged in');
    return u.uid;
  });

  await step('settings/public + countries + zones', () async {
    final s = await account.settings();
    check(s.paymentGateways.any((g) => g.key == 'cod'), 'COD missing in settings/public.payment_methods');
    check((await account.countries()).isNotEmpty, 'no countries');
    check((await account.zones()).isNotEmpty, 'no zones');
  });

  await step('detectZone → session location', () async {
    final r = await account.detectZone(19.0838889, 72.8666667);
    check(r.deliverable && r.zone != null, 'Mumbai centre should be deliverable');
    check(r.storeId.isNotEmpty, 'detectZone returned no store');
    c.read(sessionProvider.notifier).setLocation(
          zoneId: r.zone!.id,
          storeId: r.storeId,
          zoneName: r.zone!.name,
          address: 'Mumbai',
          lat: 19.0838889,
          lng: 72.8666667,
          deliveryMinutes: r.deliveryMinutes,
          countryId: r.zone!.countryId,
        );
    _print('  zone=${r.zone!.id} store=${r.storeId} minutes=${r.deliveryMinutes}');
  });

  await step('getHome', () async {
    final h = await catalog.home();
    check(h.sections.isNotEmpty, 'no home sections');
    check(h.categories.isNotEmpty, 'no top categories');
    _print('  sections=${h.sections.map((s) => s.type).join(',')}');
  });

  final tree = await step('categories + brands', () async {
    final t = await catalog.categoryTree();
    check(t.isNotEmpty, 'empty category tree');
    check((await catalog.subcategories(t.first.id)).isNotEmpty || t.first.children.isEmpty, 'subcategories mismatch');
    check((await catalog.brands()).isNotEmpty, 'no brands');
    return t;
  });

  Product? pick;
  await step('category listing (quick, in_stock_store_ids) + sorts', () async {
    for (final cat in tree ?? const <Category>[]) {
      final page = await catalog.products(ProductQuery(categoryId: cat.id, perPage: 40));
      for (final sort in ['price_asc', 'newest', 'rating', 'discount']) {
        await catalog.products(ProductQuery(categoryId: cat.id, sort: sort, perPage: 10));
      }
      pick ??= page.items.where((p) => (p.defaultVariant?.stock ?? 0) >= 5).firstOrNull;
      if (pick != null) break;
    }
    check(pick != null, 'no in-stock product found in quick mode');
    final quick = await catalog.products(const ProductQuery(perPage: 20, sort: 'newest'));
    check(quick.items.isNotEmpty, 'quick-mode listing (in_stock_store_ids) is empty');
    _print('  picked ${pick!.name} (${pick!.id}) variant ${pick!.defaultVariant!.id} stock ${pick!.defaultVariant!.stock}');
  });

  await step('search + suggestions + trending', () async {
    final word = pick!.name.split(' ').firstWhere((w) => w.length >= 3, orElse: () => pick!.name);
    final r = await catalog.products(ProductQuery(q: word, perPage: 20));
    check(r.items.any((p) => p.id == pick!.id), 'search "$word" did not find ${pick!.name}');
    final s = await catalog.suggestions(word);
    check(s.products.isNotEmpty, 'no suggestions for "$word"');
    await catalog.trending();
  });

  await step('product detail (+ reviews, similar, also-buy)', () async {
    final p = await catalog.product(pick!.slug);
    check(p.id == pick!.id && p.variants.isNotEmpty, 'detail mismatch');
    _print('  reviews=${p.reviews.length} similar=${p.similar.length} alsoBuy=${p.alsoBuy.length}');
  });

  final variantId = pick?.defaultVariant?.id ?? '';
  await step('guest add-to-cart (users/{uid}/cart) + cartSummary', () async {
    await c.read(cartProvider.future);
    await c.read(cartProvider.notifier).add(pick!.id, variantId);
    await c.read(cartProvider.notifier).increment(variantId);
    final cart = c.read(cartProvider).value!;
    check(cart.qtyForVariant(variantId) == 2, 'guest cart qty ${cart.qtyForVariant(variantId)} != 2');
    check(cart.subtotal > 0, 'cartSummary subtotal is 0');
    final lines = await Fb.db.collection('users/$guestUid/cart').get();
    check(lines.docs.any((d) => d.id == 'quick_${c.read(sessionProvider).storeId}_$variantId'), 'cart line doc id mismatch');
  });

  // ------------------------------------------------------------------ login + merge
  await step('email login customer@gmail.com (imported password) + syncProfile', () async {
    final auth = c.read(authServiceProvider);
    await auth.signInWithEmail('customer@gmail.com', '123456');
    final r = await c.read(authActionsProvider).completeFirebaseSignIn(email: 'customer@gmail.com');
    check(c.read(sessionProvider).isLoggedIn, 'session not logged in');
    check(r.user.id == Fb.auth.currentUser!.uid && r.user.id != guestUid, 'uid mismatch');
    check(r.user.email == 'customer@gmail.com', 'profile email mismatch');
    final token = await Fb.auth.currentUser!.getIdTokenResult(true);
    check(token.claims?['role'] == 'customer', 'role claim missing: ${token.claims}');
  });

  await step('guest cart merged (mergeGuestCart)', () async {
    await waitFor(() => (c.read(cartProvider).value?.qtyForVariant(variantId) ?? 0) >= 2, 'merged cart line');
    final guestLines = await Fb.db.collection('users/$guestUid/cart').get().then((q) => q.size, onError: (Object _) => -1);
    _print('  merged qty=${c.read(cartProvider).value!.qtyForVariant(variantId)} guest lines readable=$guestLines');
  });

  await step('cartSummary + listCoupons + applyCoupon', () async {
    await c.read(cartProvider.notifier).refresh();
    final cart = c.read(cartProvider).value!;
    check(cart.items.isNotEmpty && cart.grandTotal > 0, 'empty summary');
    _print('  items=${cart.items.length} subtotal=${cart.subtotal} delivery=${cart.deliveryCharge} '
        'grand=${cart.grandTotal} wallet=${cart.walletBalance} canCheckout=${cart.canCheckout} issues=${cart.issues}');
    final coupons = await c.read(cartRepoProvider).coupons(subtotal: cart.subtotal);
    _print('  coupons=${coupons.length} applicable=${coupons.where((x) => x.isApplicable).map((x) => x.code).join(',')}');
    final ok = coupons.where((x) => x.isApplicable).firstOrNull;
    if (ok != null) {
      final p = await c.read(cartRepoProvider).applyCoupon(ok.code);
      check(p.code.isNotEmpty, 'applyCoupon returned no promo');
    }
    try {
      await c.read(cartRepoProvider).applyCoupon('NOPE-${DateTime.now().millisecond}');
      throw StateError('invalid coupon accepted');
    } on StateError {
      rethrow;
    } catch (_) {/* expected: promo_error */}
  });

  final address = await step('address add (users/{uid}/addresses)', () async {
    final saved = await c.read(addressesProvider.notifier).save(const Address(
          id: '',
          label: 'Smoke',
          name: 'Smoke Test',
          phone: '+919876543210',
          addressLine: 'Carter Road, Bandra West',
          city: 'Mumbai',
          state: 'Maharashtra',
          pincode: '400050',
          lat: 19.07,
          lng: 72.824,
        ));
    check(saved.id.isNotEmpty, 'address id empty');
    final list = await c.read(addressesProvider.future);
    check(list.any((a) => a.id == saved.id), 'address not listed');
    return saved;
  });

  // ------------------------------------------------------------------ order
  final placed = await step('placeOrder (COD)', () async {
    final r = await orders.place(addressId: address!.id, deliveryType: 'delivery', paymentMethod: 'cod');
    check(r.orderNumber.startsWith('SB-ORD-'), 'bad order number ${r.orderNumber}');
    check(!r.needsPayment, 'COD must not need a payment payload');
    _print('  order ${r.orderNumber} (${r.orderId})');
    await c.read(cartProvider.notifier).refresh();
    check(c.read(cartProvider).value!.qtyForVariant(variantId) == 0, 'cart not cleared after checkout');
    return r;
  });

  StreamSubscription<Order>? live;
  final updates = <Order>[];
  await step('order detail realtime (onSnapshot) + OTP from secret/otp', () async {
    live = c.read(orderRepoProvider).watch(placed!.orderId).listen(updates.add);
    await waitFor(() => updates.isNotEmpty, 'first order snapshot');
    final o = updates.first;
    check(o.status == 'received', 'status ${o.status}');
    check(RegExp(r'^\d{6}$').hasMatch(o.deliveryOtp), 'OTP not visible: "${o.deliveryOtp}"');
    check(o.canCancel, 'order should be cancelable');
    check(o.items.any((i) => i.variantId == variantId), 'ordered item missing');
    _print('  status=${o.status} otp=${o.deliveryOtp} total=${o.total}');
  });

  await step('cancelOrder → realtime status update', () async {
    await orders.cancel(placed!.orderId, 'Smoke test');
    await waitFor(() => updates.any((o) => o.status == 'cancelled'), 'cancelled snapshot');
    await live?.cancel();
  });

  await step('orders list (user_id + created_at desc) + status filters', () async {
    final all = await orders.list();
    check(all.isNotEmpty && all.first.id == placed!.orderId, 'newest order not first');
    final cancelled = await orders.list(status: 'cancelled');
    check(cancelled.any((o) => o.id == placed!.orderId), 'cancelled filter');
    await orders.list(status: 'active');
    await orders.returns();
  });

  await step('reorder → cart', () async {
    final msg = await orders.reorder(placed!.orderId);
    await c.read(cartProvider.notifier).refresh();
    check(c.read(cartProvider).value!.qtyForVariant(variantId) > 0, 'reorder did not add the item ($msg)');
    await c.read(cartProvider.notifier).clear();
  });

  await step('invoice (getInvoiceUrl) for a delivered order', () async {
    final delivered = await orders.list(status: 'delivered');
    if (delivered.isEmpty) return _print('  (no delivered order)');
    final url = await orders.invoiceUrl(delivered.first.id);
    check(url.startsWith('http'), 'invoice url "$url"');
  });

  // ------------------------------------------------------------------ account
  await step('wallet (balance + wallet_transactions) + walletWithdraw + withdrawal_requests', () async {
    final w = await account.wallet();
    check(w.transactions.isNotEmpty, 'no wallet transactions');
    _print('  balance=${w.balance} txns=${w.transactions.length} withdrawals=${w.withdrawals.length}');
    await account.withdraw(100, 'Smoke test');
    final w2 = await account.wallet();
    check(w2.withdrawals.any((x) => x.status == 'pending' && x.amount == 100), 'withdrawal request not listed');
    check((w.balance - w2.balance - 100).abs() < 0.01, 'wallet not debited (${w.balance} → ${w2.balance})');
  });

  await step('favourites add/list/remove', () async {
    final fav = c.read(favoritesProvider.notifier);
    await c.read(favoritesProvider.future);
    if (fav.isFavorite(pick!.id)) await fav.toggle(pick!);
    check(await fav.toggle(pick!), 'toggle should add');
    c.invalidate(favoritesProvider);
    check((await c.read(favoritesProvider.future)).any((p) => p.id == pick!.id), 'favourite not listed');
    check(!await c.read(favoritesProvider.notifier).toggle(pick!), 'toggle should remove');
  });

  await step('notifications (list + mark read)', () async {
    final list = await account.notifications();
    check(list.isNotEmpty, 'no notifications');
    await account.readNotification(list.first.id);
    await account.readAllNotifications();
    final after = await account.notifications();
    check(after.every((n) => n.isRead), 'unread notifications remain');
  });

  await step('chat: create thread + messages (realtime) + send', () async {
    final t = await content.startChat(subject: 'Smoke test', message: 'Hello from the smoke test');
    final first = await firstWhere(content.messages(t.id), (l) => l.isNotEmpty, 'first message');
    check(first.single.isMine && first.single.message.contains('smoke'), 'first message mismatch');
    final stream = content.messages(t.id);
    final two = firstWhere(stream, (l) => l.length >= 2, 'second message');
    await content.send(t.id, 'Second message');
    check((await two).last.message == 'Second message', 'second message mismatch');
    check((await content.chats()).any((x) => x.id == t.id), 'thread not listed');
    await content.markChatRead(t.id);
  });

  await step('profile update (users/{uid} name) + avatar upload (Storage)', () async {
    final before = await account.profile();
    final u = await account.updateProfile(name: 'Aarav Smoke');
    check(u.name == 'Aarav Smoke', 'name not updated');
    final withAvatar = await account.updateProfile(avatar: XFile.fromData(Uint8List.fromList(_png), name: 'a.png', mimeType: 'image/png'));
    check(withAvatar.avatar.startsWith('http'), 'avatar url missing');
    await account.updateProfile(name: before.name);
    await account.registerFcmToken('smoke-test-token');
  });

  await step('referral (users doc + referrals + settings.referral)', () async {
    final r = await account.referral();
    check(r.code.isNotEmpty, 'no referral code');
    _print('  code=${r.code} referrals=${r.referrals.length} earned=${r.totalEarned}');
  });

  await step('blogs / faqs / pages', () async {
    final blogs = await content.blogs();
    check(blogs.isNotEmpty, 'no blogs');
    await content.blog(blogs.first.slug);
    check((await content.blogCategories()).isNotEmpty, 'no blog categories');
    check((await content.faqs()).isNotEmpty, 'no faqs');
    check((await content.page('about')).content.isNotEmpty, 'about page empty');
  });

  await step('logout → new guest session', () async {
    await c.read(authActionsProvider).logout();
    check(!c.read(sessionProvider).isLoggedIn, 'still logged in');
    await waitFor(() => Fb.auth.currentUser?.isAnonymous == true, 'new anonymous user');
    check(Fb.auth.currentUser!.uid != guestUid, 'expected a fresh guest');
  });

  for (final s in keepAlive) {
    s.close();
  }
}
