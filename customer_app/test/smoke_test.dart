// Smoke test: boots the app against the in-app mock data source (USE_MOCK) and visits every route,
// failing on layout/render exceptions (overflows, unbounded constraints, etc.).
import 'dart:convert';

import 'package:customer/app.dart';
import 'package:customer/core/config.dart';
import 'package:customer/core/router.dart';
import 'package:customer/core/theme.dart';
import 'package:customer/features/location/map_picker_screen.dart';
import 'package:customer/models/models.dart';
import 'package:customer/providers/providers.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

Future<void> settle(WidgetTester tester, [int frames = 12]) async {
  for (var i = 0; i < frames; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

void main() {
  AppConfig.useMock = true; // widget tests run offline against the in-app mock backend
  AppTheme.useGoogleFonts = false;
  osmTileCache = false;

  Future<(ProviderContainer, List<String>)> boot(WidgetTester tester, {String locale = 'en', String theme = 'light'}) async {
    tester.view.physicalSize = const Size(1170, 2532);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    SharedPreferences.setMockInitialValues({
      'session_v1': json.encode({
        'onboarded': true,
        'zone_id': 1,
        'zone_name': 'Mumbai',
        'address': 'Saki Naka, Mumbai, Maharashtra, India',
        'lat': 19.1176,
        'lng': 72.906,
        'distance_km': 2.48,
        'delivery_minutes': 8,
        'mode': 'quick',
        'locale': locale,
        'theme': theme,
        'guest_token': 'g_test',
      }),
    });
    final prefs = await SharedPreferences.getInstance();
    final session = (await tester.runAsync(() => SessionNotifier.load(prefs)))!;
    final container = ProviderContainer(overrides: [
      prefsProvider.overrideWithValue(prefs),
      initialSessionProvider.overrideWithValue(session),
    ]);
    addTearDown(container.dispose);
    await tester.pumpWidget(UncontrolledProviderScope(container: container, child: const QwikMartApp()));
    await settle(tester, 25);
    return (container, <String>[]);
  }

  Future<void> visit(WidgetTester tester, ProviderContainer c, List<String> errors, String route, {Object? extra}) async {
    // ignore: avoid_print
    print('visit $route');
    final router = c.read(routerProvider);
    router.go(route, extra: extra);
    await settle(tester, 15);
    final e = tester.takeException();
    if (e != null) errors.add('$route → $e');
  }

  testWidgets('every route renders without exceptions (en, light)', (tester) async {
    final (c, errors) = await boot(tester);

    // Guest flows.
    for (final r in [
      '/home',
      '/categories',
      '/favourites',
      '/profile',
      '/category/1?name=Grocery',
      '/category/105?name=Dairy',
      '/search',
      '/search?q=milk',
      '/product/amul-taaza-toned-fresh-milk',
      '/product/levi-s-men-s-slim-fit-t-shirt',
      '/location?from=app',
      '/onboarding',
      '/login',
      '/blog',
      '/faq',
      '/page/about',
    ]) {
      await visit(tester, c, errors, r);
    }

    await visit(tester, c, errors, '/home');
    expect(find.text('Find Your Favorites'), findsOneWidget);
    expect(find.text('8 minutes'), findsOneWidget);

    // Home in eCommerce mode + category tab.
    c.read(sessionProvider.notifier).setMode('ecommerce');
    await visit(tester, c, errors, '/home');
    c.read(sessionProvider.notifier).setMode('quick');
    await visit(tester, c, errors, '/home');

    // Cart with items as guest.
    await tester.runAsync(() async {
      await c.read(cartProvider.notifier).add('13', '131'); // Amul milk 500ml
      await c.read(cartProvider.notifier).add('28', '281'); // Lay's
    });
    await settle(tester);
    await visit(tester, c, errors, '/cart');
    await visit(tester, c, errors, '/payment-methods?selected=cod');

    // Login as demo customer through the mock API.
    await tester.runAsync(() async {
      final auth = await c.read(accountRepoProvider).mockVerifyOtp('9876543210', '+91', '123456');
      await c.read(authActionsProvider).completeMockSignIn(auth);
    });
    await settle(tester);

    for (final r in [
      '/cart',
      '/orders',
      '/orders/112',
      '/orders/111',
      '/orders/110',
      '/orders/108',
      '/orders/107',
      '/orders/112/track',
      '/wallet',
      '/refer',
      '/support',
      '/support?order_id=112',
      '/notifications',
      '/addresses',
      '/addresses/form',
      '/profile',
      '/favourites',
      '/order-success/110',
    ]) {
      await visit(tester, c, errors, r);
    }
    await visit(tester, c, errors, '/orders/111');
    expect(find.text('6 7 5 0 4 8'), findsOneWidget);
    final order = (await tester.runAsync(() => c.read(orderRepoProvider).detail('110')))!;
    await visit(tester, c, errors, '/review', extra: order.items.first);
    final blogs = (await tester.runAsync(() => c.read(contentRepoProvider).blogs()))!;
    await visit(tester, c, errors, '/blog/${blogs.first.slug}');

    // Place an order end-to-end.
    final addresses = (await tester.runAsync(() => c.read(accountRepoProvider).addresses()))!;
    final placed = (await tester.runAsync(() => c.read(orderRepoProvider).place(
          addressId: addresses.first.id,
          deliveryType: 'delivery',
          paymentMethod: 'cod',
          useWallet: true,
        )))!;
    expect(placed.orderNumber, startsWith('SB-ORD-'));
    await visit(tester, c, errors, '/orders/${placed.orderId}');

    await visit(tester, c, errors, '/home');
    expect(errors, isEmpty, reason: errors.join('\n\n'));
  });

  testWidgets('arabic RTL + dark theme render', (tester) async {
    final (c, errors) = await boot(tester, locale: 'ar', theme: 'dark');
    for (final r in ['/home', '/categories', '/category/1?name=Grocery', '/product/onion', '/profile']) {
      await visit(tester, c, errors, r);
    }
    expect(find.byType(Directionality), findsWidgets);
    expect(errors, isEmpty, reason: errors.join('\n\n'));
  });

  test('models parse API envelopes', () {
    final p = Product.fromJson({
      'id': '7',
      'name': {'en': 'Milk', 'ar': 'حليب'},
      'variants': [
        {'id': 1, 'name': '500 ml', 'price': '30.00', 'sale_price': '28'},
      ],
      'rating_avg': '4.5',
    });
    expect(p.id, '7');
    expect(p.name, 'Milk');
    expect(p.defaultVariant!.effectivePrice, 28);
    expect(p.defaultVariant!.discountPercent, 7);
  });

  test('models parse Firestore order docs and callable timestamps', () {
    final o = Order.fromJson({
      'id': 'abc123',
      'order_number': 'SB-ORD-00620',
      'status': 'delivered',
      'delivered_at': DateTime.now().subtract(const Duration(hours: 2)).toIso8601String(),
      'created_at': {'_seconds': 1791807279, '_nanoseconds': 0},
      'totals': {'subtotal': 120, 'delivery_charge': 25, 'wallet_used': 10, 'total': 135, 'grand_total': 145},
      'items': [
        {'variant_id': '2', 'product_id': '1', 'name': 'Tomato', 'price': 78, 'sale_price': 60, 'qty': 2, 'total': 120,
         'status': 'delivered', 'is_reviewed': false, 'return_allowed': true, 'return_days': 2},
      ],
      'rider': {'lat': 19.1, 'lng': 72.9, 'updated_at': '2026-10-12T10:00:00Z'},
      'delivery_boy': {'name': 'Alex', 'phone': '+1', 'vehicle_number': 'MH01'},
    });
    expect(o.total, 135);
    expect(o.grandTotal, 145);
    expect(o.deliveryCharge, 25);
    expect(o.createdAt!.toUtc().year, 2026);
    expect(o.items.single.id, '2');
    expect(o.items.single.orderId, 'abc123');
    expect(o.items.single.canReview, isTrue);
    expect(o.items.single.canReturn, isTrue);
    expect(o.rider!.lat, 19.1);
    expect(TrackInfo.fromOrder(o).rider!.lng, 72.9);
    final cart = Cart.fromJson({
      'items': [
        {'line_id': 'quick_1_3', 'product_id': '2', 'variant_id': '3', 'name': 'Onion', 'price': 40, 'sale_price': 35, 'qty': 2, 'max_qty': 10, 'stock': 5},
      ],
      'subtotal': 70, 'additional_charges': 5, 'grand_total': 100, 'promo_error': 'Expired',
    });
    expect(cart.items.single.id, 'quick_1_3');
    expect(cart.qtyForVariant('3'), 2);
    expect(cart.additionalCharges, 5);
    expect(cart.promoError, 'Expired');
  });
}
