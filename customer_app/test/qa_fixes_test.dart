// Unit tests for behaviour fixed during the release QA (cart limits / blocking issues, callable error
// messages, phone display, cashback coupons, demo-mode default).
import 'package:cloud_functions/cloud_functions.dart';
import 'package:customer/core/errors.dart';
import 'package:customer/models/models.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('callable errors drop the "[400]" status suffix added by the Functions JS SDK', () {
    final e = AppException.from(FirebaseFunctionsException(
      code: 'invalid-argument',
      message: 'Selected payment method is not available. [400]',
      details: {'field': 'gateway'},
    ));
    expect(e.message, 'Selected payment method is not available.');
    expect(e.displayMessage, 'Selected payment method is not available.');
  });

  test('cart line limit = min(max_qty_per_order, stock) and server issues block checkout', () {
    final cart = Cart.fromJson({
      'items': [
        {'line_id': 'quick_1_3', 'product_id': '2', 'variant_id': '3', 'name': 'Onion', 'price': 60, 'sale_price': 45, 'qty': 12, 'max_qty': 10, 'stock': 11},
      ],
      'subtotal': 540,
      'total': 540,
      'min_order': 99,
      'min_order_remaining': 0,
      'can_checkout': false,
      'issues': ['You can order a maximum of 10 units of Onion.'],
    });
    expect(cart.items.single.limit, 10);
    expect(cart.isBlocked, isTrue);
    expect(cart.itemForVariant('3')?.qty, 12);

    final belowMin = Cart.fromJson({
      'items': [
        {'line_id': 'quick_1_3', 'product_id': '2', 'variant_id': '3', 'name': 'Onion', 'price': 60, 'qty': 1, 'max_qty': 10, 'stock': 3},
      ],
      'min_order': 99,
      'min_order_remaining': 54,
    });
    expect(belowMin.items.single.limit, 3);
    expect(belowMin.isBlocked, isTrue);
  });

  test('E.164 phones are shown once (no duplicated dial code)', () {
    expect(AppUser.fromJson({'id': 'u', 'name': 'A', 'phone': '+919876543210'}).displayPhone, '+919876543210');
    expect(AppUser.fromJson({'id': 'u', 'name': 'A', 'phone': '9876543210', 'country_code': '+91'}).displayPhone, '+91 9876543210');
  });

  test('cashback coupons are flagged on orders (credited after delivery, not deducted)', () {
    final o = Order.fromJson({
      'id': 'o1',
      'order_number': 'SB-ORD-1',
      'status': 'delivered',
      'promo_code': 'WALLETCASH50',
      'promo_is_cashback': true,
      'totals': {'subtotal': 360, 'promo_discount': 50, 'total': 360, 'grand_total': 360},
      'items': [],
    });
    expect(o.promoIsCashback, isTrue);
    expect(o.promoDiscount, 50);
  });

  test('demo mode is off unless settings/public.demo_mode is true', () {
    expect(AppSettings.fromJson({}).demoMode, isFalse);
    expect(const AppSettings().demoMode, isFalse);
    expect(AppSettings.fromJson({'demo_mode': true}).demoMode, isTrue);
  });
}
