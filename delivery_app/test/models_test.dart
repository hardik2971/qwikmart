import 'package:deliveryboy/core/launcher.dart';
import 'package:deliveryboy/models/models.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('DeliveryOrder workflow', () {
    DeliveryOrder order(String status, {bool accepted = true, String pm = 'cod', double? collect}) => DeliveryOrder.fromJson({
          'id': 'o1',
          'order_number': 'SB-ORD-00001',
          'status': status,
          'payment_method': pm,
          'total': 574,
          'amount_to_collect': collect,
          'is_accepted': accepted,
          'store': {'name': 'Mumbai Store'},
          'customer': {'name': 'Purnima', 'phone': '+919876543210'},
          'address': {'address_line': '201 Time Square', 'city': 'Mumbai', 'lat': 19.1, 'lng': 72.8},
        });

    test('next step follows accept → picked up → out for delivery → deliver → done', () {
      expect(order('ready_for_pickup', accepted: false).nextStep, DeliveryStep.accept);
      expect(order('ready_for_pickup').nextStep, DeliveryStep.pickUp);
      expect(order('picked_up').nextStep, DeliveryStep.outForDelivery);
      expect(order('out_for_delivery').nextStep, DeliveryStep.deliver);
      expect(order('delivered').nextStep, DeliveryStep.done);
      expect(order('cancelled').nextStep, DeliveryStep.done);
    });

    test('COD amount to collect, prepaid collects nothing', () {
      expect(order('out_for_delivery', collect: 574).amountToCollect, 574);
      expect(order('out_for_delivery', pm: 'razorpay', collect: 0).amountToCollect, 0);
      expect(order('out_for_delivery', pm: 'razorpay', collect: 0).isCod, isFalse);
    });

    test('customer + address snapshot are merged', () {
      final c = order('received').customer;
      expect(c.name, 'Purnima');
      expect(c.phone, '+919876543210');
      expect(c.address, contains('201 Time Square'));
      expect(c.lat, 19.1);
    });
  });

  test('return pickup shows the customer / address copied onto the return', () {
    final r = ReturnPickup.fromJson({
      'id': 'r1',
      'return_number': 'RET-0001',
      'order_number': 'SB-ORD-00002',
      'product_name': 'Milk',
      'status': 'pickup_assigned',
      'order': {
        'address_snapshot': {'name': 'Asha', 'address_line': '12 MG Road', 'city': 'Pune', 'lat': 18.5, 'lng': 73.8},
      },
      'customer': {'name': 'Asha Rao', 'phone': '+911234567890'},
    });
    expect(r.customer.name, 'Asha Rao');
    expect(r.customer.phone, '+911234567890');
    expect(r.customer.address, contains('12 MG Road'));
    expect(r.customer.lat, 18.5);
    expect(r.isPickedUp, isFalse);
  });

  test('cash collection keeps the short amount', () {
    final c = CashCollection.fromJson({'id': 'cod_1', 'amount': 500, 'expected_amount': 574, 'short_amount': 74, 'order_id': '1'});
    expect(c.amount, 500);
    expect(c.shortAmount, 74);
  });

  group('Launcher URIs', () {
    test('tel', () {
      expect(Launcher.telUri('+91 98765-43210').toString(), 'tel:+919876543210');
      expect(Launcher.telUri(''), isNull);
      expect(Launcher.telUri(null), isNull);
    });
    test('directions', () {
      expect(Launcher.directionsUri(19.1, 72.8).toString(),
          'https://www.google.com/maps/dir/?api=1&destination=19.1,72.8&travelmode=driving');
      expect(Launcher.directionsUri(null, null, label: 'Mumbai Store, Andheri').toString(),
          'https://www.google.com/maps/search/?api=1&query=Mumbai%20Store%2C%20Andheri');
      expect(Launcher.directionsUri(null, null), isNull);
    });
  });
}
