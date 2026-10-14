import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:razorpay_flutter/razorpay_flutter.dart';

import '../models/json.dart';

/// Native Razorpay checkout (Android / iOS) for a gateway payload returned by `placeOrder` / `walletRecharge`
/// (`gateway: razorpay`, `gateway_order_id`, `public_key`, `amount`, `currency`, `extra.{name,prefill,theme_color}`).
///
/// Resolves with the fields `verifyPayment` / `verifyWalletRecharge` check server-side
/// (`razorpay_order_id`, `razorpay_payment_id`, `razorpay_signature`), or `null` when the customer cancels.
/// Throws [RazorpayCheckoutException] when the payment fails.
class RazorpayCheckout {
  static bool supports(Map<String, dynamic> payment) =>
      !kIsWeb &&
      asString(payment['gateway']) == 'razorpay' &&
      asString(payment['gateway_order_id']).isNotEmpty &&
      asString(payment['public_key']).isNotEmpty;

  static Future<Map<String, dynamic>?> pay(
    Map<String, dynamic> payment, {
    String? description,
  }) {
    final razorpay = Razorpay();
    final done = Completer<Map<String, dynamic>?>();

    void finish() => Future<void>.delayed(Duration.zero, razorpay.clear);

    razorpay.on(Razorpay.EVENT_PAYMENT_SUCCESS, (PaymentSuccessResponse r) {
      if (!done.isCompleted) {
        done.complete({
          'razorpay_order_id':
              r.orderId ?? asString(payment['gateway_order_id']),
          'razorpay_payment_id': r.paymentId,
          'razorpay_signature': r.signature,
          'reference': payment['reference'],
          'gateway_order_id': payment['gateway_order_id'],
        });
      }
      finish();
    });
    razorpay.on(Razorpay.EVENT_PAYMENT_ERROR, (PaymentFailureResponse r) {
      if (!done.isCompleted) {
        // Code 2 = closed by the user (Razorpay.PAYMENT_CANCELLED) → treat as "pay later", not an error.
        if (r.code == Razorpay.PAYMENT_CANCELLED) {
          done.complete(null);
        } else {
          done.completeError(
            RazorpayCheckoutException(
              r.message?.isNotEmpty == true ? r.message! : 'Payment failed',
            ),
          );
        }
      }
      finish();
    });
    razorpay.on(Razorpay.EVENT_EXTERNAL_WALLET, (ExternalWalletResponse r) {
      // External wallets complete outside Razorpay's flow; the order stays payment pending until verified.
      if (!done.isCompleted) done.complete(null);
      finish();
    });

    final extra = asMap(payment['extra']);
    final prefill = asMap(extra['prefill']);
    final amount = asDouble(payment['amount']);
    razorpay.open({
      'key': asString(payment['public_key']),
      'order_id': asString(payment['gateway_order_id']),
      'amount': (amount * 100)
          .round(), // paise; Razorpay takes the order amount, this is for display
      'currency': asString(payment['currency'], 'INR'),
      'name': asString(extra['name'], 'QwikMart'),
      'description': description ?? 'Order payment',
      'prefill': {
        if (asString(prefill['name']).isNotEmpty)
          'name': asString(prefill['name']),
        if (asString(prefill['email']).isNotEmpty)
          'email': asString(prefill['email']),
        if (asString(prefill['phone']).isNotEmpty)
          'contact': asString(prefill['phone']),
      },
      'theme': {'color': asString(extra['theme_color'], '#0E9623')},
      'retry': {'enabled': true, 'max_count': 2},
    });
    return done.future;
  }
}

class RazorpayCheckoutException implements Exception {
  final String message;
  RazorpayCheckoutException(this.message);
  @override
  String toString() => message;
}
