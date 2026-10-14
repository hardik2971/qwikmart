import '../../models/models.dart';

/// Static seed data for the demo backend. Mirrors SPEC §10 seed (Mumbai Store,
/// Alex Johnson, SB-ORD-xxxxx orders…).
class MockSeed {
  MockSeed._();

  static DateTime ago({int days = 0, int hours = 0, int minutes = 0}) =>
      DateTime.now().subtract(Duration(days: days, hours: hours, minutes: minutes));

  static String img(String text) => 'https://placehold.co/160x160/E6F4E9/0E9623/png?text=${Uri.encodeComponent(text)}';

  static final mumbaiStore = Store(
    id: '1',
    name: 'Mumbai Store',
    address: 'Shop 4, Andheri Kurla Road, Andheri East',
    city: 'Mumbai, Maharashtra',
    phone: '+91 9820012345',
    lat: 19.1136,
    lng: 72.8697,
  );

  static final customers = <Customer>[
    Customer(
      id: '11',
      name: 'Purnima W/Team',
      phone: '+91 9988776655',
      address: '201, Time Square Empire Mirzapur Highway Bhuj Mumbai Maharashtra India 400001',
      lat: 19.1197,
      lng: 72.8468,
    ),
    Customer(
      id: '12',
      name: 'Rahul Sharma',
      phone: '+91 9876543210',
      address: 'B-12, Juhu Tara Road, Juhu, Mumbai, Maharashtra 400049',
      lat: 19.1075,
      lng: 72.8263,
    ),
    Customer(
      id: '13',
      name: 'Ayesha Khan',
      phone: '+91 9123456780',
      address: 'Lake View Tower, Hiranandani Gardens, Powai, Mumbai 400076',
      lat: 19.1334,
      lng: 72.9133,
    ),
    Customer(
      id: '14',
      name: 'Vikram Mehta',
      phone: '+91 9090909090',
      address: 'Flat 7, Shanti Niwas, Vile Parle East, Mumbai 400057',
      lat: 19.0996,
      lng: 72.8556,
    ),
    Customer(
      id: '15',
      name: 'Sneha Patil',
      phone: '+91 9812345670',
      address: '14 Hill Road, Bandra West, Mumbai 400050',
      lat: 19.0596,
      lng: 72.8295,
    ),
  ];

  static final products = <OrderItem>[
    OrderItem(name: 'Amul Taaza Toned Milk', variant: '500 ml', qty: 2, price: 27, image: img('Milk')),
    OrderItem(name: 'Britannia Brown Bread', variant: '400 g', qty: 1, price: 50, image: img('Bread')),
    OrderItem(name: 'Fortune Sunflower Oil', variant: '1 L', qty: 1, price: 155, image: img('Oil')),
    OrderItem(name: 'Tata Salt', variant: '1 kg', qty: 1, price: 28, image: img('Salt')),
    OrderItem(name: "Lay's Classic Salted", variant: '52 g', qty: 3, price: 20, image: img('Chips')),
    OrderItem(name: 'Aashirvaad Whole Wheat Atta', variant: '5 kg', qty: 1, price: 289, image: img('Atta')),
    OrderItem(name: 'Maggi 2-Minute Noodles', variant: 'Pack of 4', qty: 2, price: 56, image: img('Maggi')),
    OrderItem(name: 'Robusta Banana', variant: '1 dozen', qty: 1, price: 60, image: img('Banana')),
    OrderItem(name: 'Cadbury Dairy Milk Silk', variant: '60 g', qty: 2, price: 80, image: img('Choco')),
    OrderItem(name: 'Mother Dairy Classic Curd', variant: '400 g', qty: 1, price: 35, image: img('Curd')),
  ];

  static List<TimelineEntry> timelineFor(String status, DateTime placed) {
    final idx = OrderStatus.flow.indexOf(status);
    if (idx < 0) {
      return [TimelineEntry(status: OrderStatus.received, at: placed), TimelineEntry(status: status, at: placed.add(const Duration(minutes: 9)))];
    }
    return [
      for (var i = 0; i <= idx; i++)
        TimelineEntry(status: OrderStatus.flow[i], at: placed.add(Duration(minutes: i * 6))),
    ];
  }

  static DeliveryOrder order({
    required int id,
    required int customer,
    required List<int> items,
    required String status,
    required String payment,
    required DateTime placed,
    bool accepted = false,
    double distance = 2.4,
    String mode = 'quick',
    String? notes,
  }) {
    final its = items.map((i) => products[i % products.length]).toList();
    final subtotal = its.fold<double>(0, (s, i) => s + i.total);
    const delivery = 25.0;
    final tax = double.parse((subtotal * 0.05).toStringAsFixed(2));
    final total = double.parse((subtotal + delivery + tax).toStringAsFixed(2));
    return DeliveryOrder(
      id: '$id',
      orderNumber: 'SB-ORD-${id.toString().padLeft(5, '0')}',
      status: status,
      paymentMethod: payment,
      paymentStatus: payment == 'cod' ? (status == OrderStatus.delivered ? 'paid' : 'pending') : 'paid',
      subtotal: subtotal,
      deliveryCharge: delivery,
      tax: tax,
      total: total,
      earning: double.parse((25 + distance * 6).toStringAsFixed(2)),
      distanceKm: distance,
      store: mumbaiStore,
      customer: customers[customer],
      items: its,
      timeline: timelineFor(status, placed),
      isAccepted: accepted,
      mode: mode,
      notes: notes,
      createdAt: placed,
      deliveredAt: status == OrderStatus.delivered ? placed.add(const Duration(minutes: 28)) : null,
      otp: '123456',
    );
  }

  static List<DeliveryOrder> orders() => [
        // available
        order(id: 74, customer: 0, items: [0, 1, 4, 8], status: OrderStatus.readyForPickup, payment: 'cod', placed: ago(minutes: 14), distance: 2.6, notes: 'Please ring the bell twice.'),
        order(id: 79, customer: 2, items: [5, 2, 3], status: OrderStatus.processed, payment: 'razorpay', placed: ago(minutes: 6), distance: 4.1),
        order(id: 81, customer: 3, items: [7, 9], status: OrderStatus.readyForPickup, payment: 'cod', placed: ago(minutes: 3), distance: 1.8),
        // active
        order(id: 71, customer: 1, items: [6, 8, 0], status: OrderStatus.pickedUp, payment: 'cod', placed: ago(minutes: 32), accepted: true, distance: 3.2),
        order(id: 69, customer: 4, items: [2, 5], status: OrderStatus.readyForPickup, payment: 'stripe', placed: ago(minutes: 40), accepted: true, distance: 5.6, mode: 'ecommerce'),
        // history
        order(id: 66, customer: 0, items: [0, 1], status: OrderStatus.delivered, payment: 'cod', placed: ago(hours: 2), accepted: true, distance: 2.6),
        order(id: 65, customer: 2, items: [3, 4, 9], status: OrderStatus.delivered, payment: 'razorpay', placed: ago(hours: 4), accepted: true, distance: 4.0),
        order(id: 63, customer: 3, items: [5], status: OrderStatus.delivered, payment: 'cod', placed: ago(hours: 6), accepted: true, distance: 1.9),
        order(id: 61, customer: 4, items: [6, 7, 8], status: OrderStatus.delivered, payment: 'wallet', placed: ago(days: 1, hours: 2), accepted: true, distance: 5.1),
        order(id: 58, customer: 1, items: [2, 0], status: OrderStatus.cancelled, payment: 'cod', placed: ago(days: 1, hours: 5), accepted: true, distance: 3.3),
        order(id: 55, customer: 0, items: [1, 4, 7], status: OrderStatus.delivered, payment: 'cod', placed: ago(days: 2, hours: 1), accepted: true, distance: 2.6),
        order(id: 52, customer: 3, items: [9, 3], status: OrderStatus.delivered, payment: 'paystack', placed: ago(days: 3), accepted: true, distance: 1.8),
      ];

  static DeliveryProfile alex() => DeliveryProfile(
        id: '7',
        name: 'Alex Johnson',
        email: 'alex@gmail.com',
        phone: '9876501234',
        countryCode: '+91',
        dob: DateTime(1996, 4, 18),
        address: '12, Marol Naka, Andheri East, Mumbai 400059',
        country: 'India',
        zone: 'Mumbai',
        vehicleType: 'Bike',
        vehicleNumber: 'MH 02 AB 4521',
        drivingLicense: img('DL'),
        idProof: img('ID'),
        bankName: 'HDFC Bank',
        bankAccount: '50100234567812',
        ifsc: 'HDFC0000123',
        approvalStatus: 'approved',
        rating: 4.8,
        joinedAt: DateTime(2026, 1, 9),
      );

  static List<CashCollection> cash() => [
        CashCollection(id: '81', orderId: '81', amount: 1669.82, message: 'Order delivered — COD cash collected', date: DateTime(2026, 8, 11, 14, 47)),
        CashCollection(id: '72', orderId: '72', amount: 2770.31, message: 'Order delivered — COD cash collected', date: DateTime(2026, 8, 11, 14, 4)),
        CashCollection(id: '78', orderId: '78', amount: 5794.82, message: 'Order delivered — COD cash collected', date: DateTime(2026, 8, 11, 2, 56)),
        CashCollection(id: '71', orderId: '71', amount: 842.50, message: 'Order delivered — COD cash collected', date: DateTime(2026, 8, 10, 19, 12)),
        CashCollection(id: '70', amount: 12500, type: 'submitted_to_admin', message: 'Cash submitted to admin', date: DateTime(2026, 8, 10, 11, 30)),
        CashCollection(id: '65', orderId: '65', amount: 1299, message: 'Order delivered — COD cash collected', date: DateTime(2026, 8, 9, 16, 21)),
        CashCollection(id: '60', orderId: '60', amount: 455.75, message: 'Order delivered — COD cash collected', date: DateTime(2026, 8, 9, 10, 2)),
      ];

  static List<Earning> earnings() => [
        Earning(id: '1', amount: 40.60, type: 'commission', orderNumber: 'SB-ORD-00066', date: ago(hours: 2)),
        Earning(id: '2', amount: 49.00, type: 'commission', orderNumber: 'SB-ORD-00065', date: ago(hours: 4)),
        Earning(id: '3', amount: 36.40, type: 'commission', orderNumber: 'SB-ORD-00063', date: ago(hours: 6)),
        Earning(id: '4', amount: 150.00, type: 'bonus', date: ago(days: 1)),
        Earning(id: '5', amount: 55.60, type: 'commission', orderNumber: 'SB-ORD-00061', date: ago(days: 1, hours: 2)),
        Earning(id: '6', amount: 40.60, type: 'commission', orderNumber: 'SB-ORD-00055', date: ago(days: 2, hours: 1)),
        Earning(id: '7', amount: 35.80, type: 'commission', orderNumber: 'SB-ORD-00052', date: ago(days: 3)),
        Earning(id: '8', amount: 300.00, type: 'bonus', date: ago(days: 8)),
        Earning(id: '9', amount: 6500.00, type: 'salary', date: ago(days: 12)),
      ];

  static List<Withdrawal> withdrawals() => [
        Withdrawal(id: '2', amount: 100, status: 'approved', message: 'Weekly payout', remark: 'money transfer', date: DateTime(2026, 8, 11, 15, 47)),
        Withdrawal(id: '1', amount: 300, status: 'approved', message: 'Fuel expenses', remark: 'money transfer', date: DateTime(2026, 8, 11, 15, 45)),
      ];

  static List<WalletTxn> walletTxns() => [
        WalletTxn(id: '5', type: 'debit', amount: 100, message: 'Withdrawal request #2', paymentType: 'withdrawal', date: DateTime(2026, 8, 11, 15, 47)),
        WalletTxn(id: '4', type: 'debit', amount: 300, message: 'Withdrawal request #1', paymentType: 'withdrawal', date: DateTime(2026, 8, 11, 15, 45)),
        WalletTxn(id: '3', type: 'credit', amount: 150, message: 'Weekly target bonus', paymentType: 'admin', date: DateTime(2026, 8, 10, 9, 0)),
        WalletTxn(id: '2', type: 'credit', amount: 206, message: 'Delivery commissions', paymentType: 'admin', date: DateTime(2026, 8, 9, 21, 0)),
        WalletTxn(id: '1', type: 'credit', amount: 50, message: 'Joining bonus', paymentType: 'admin', date: DateTime(2026, 8, 1, 10, 0)),
      ];

  static List<ReturnPickup> returns() => [
        ReturnPickup(
          id: '3',
          returnNumber: 'RET-00003',
          orderNumber: 'SB-ORD-00061',
          productName: 'Cadbury Dairy Milk Silk 60 g',
          image: img('Choco'),
          qty: 1,
          reason: 'Product damaged / melted',
          status: 'pickup_assigned',
          customer: customers[4],
          storeName: 'Mumbai Store',
          refundAmount: 80,
          date: ago(hours: 3),
        ),
        ReturnPickup(
          id: '2',
          returnNumber: 'RET-00002',
          orderNumber: 'SB-ORD-00055',
          productName: 'Britannia Brown Bread 400 g',
          image: img('Bread'),
          qty: 1,
          reason: 'Expired product received',
          status: 'pickup_assigned',
          customer: customers[0],
          storeName: 'Mumbai Store',
          refundAmount: 50,
          date: ago(hours: 20),
        ),
        ReturnPickup(
          id: '1',
          returnNumber: 'RET-00001',
          orderNumber: 'SB-ORD-00052',
          productName: 'Tata Salt 1 kg',
          image: img('Salt'),
          qty: 1,
          reason: 'Wrong item delivered',
          status: 'picked_up',
          customer: customers[3],
          storeName: 'Mumbai Store',
          refundAmount: 28,
          date: ago(days: 2),
        ),
      ];

  static List<ChatMessage> supportChat() {
    final base = ago(minutes: 30);
    var i = 0;
    ChatMessage m(String text, bool mine) =>
        ChatMessage(id: '${++i}', message: text, isMine: mine, createdAt: base.add(Duration(minutes: i * 2)), read: true);
    return [
      m('Hello, I need assistance with an order', true),
      m('Sure. Please provide the order ID and let me know what happened.', false),
      m("The order ID is #ID45892. I reached the customer's address, but the customer is not available.", true),
      m('Did you try calling the customer?', false),
      m('Yes, I called twice, but there was no response.', true),
      m('Please wait for a few minutes and try calling once more.', false),
      m("I tried again, but the customer still didn't answer.", true),
    ];
  }

  static List<AppNotification> notifications() => [
        AppNotification(id: '6', title: 'New order request', message: 'SB-ORD-00081 from Mumbai Store is waiting for pickup (1.8 km).', type: 'order', createdAt: ago(minutes: 3), orderId: '81'),
        AppNotification(id: '5', title: 'New order request', message: 'SB-ORD-00074 is ready for pickup at Mumbai Store.', type: 'order', createdAt: ago(minutes: 14), orderId: '74'),
        AppNotification(id: '4', title: 'Withdrawal approved', message: 'Your withdrawal request #2 of ₹100 has been approved.', type: 'default', createdAt: ago(hours: 5), read: true),
        AppNotification(id: '3', title: 'Weekend bonus unlocked', message: 'Complete 25 deliveries this weekend and earn an extra ₹300.', type: 'promotion', createdAt: ago(days: 1), read: true),
        AppNotification(id: '2', title: 'Cash submission reminder', message: 'Please submit your cash in hand at Mumbai Store before 9 PM.', type: 'default', createdAt: ago(days: 2), read: true),
        AppNotification(id: '1', title: 'Welcome to QwikMart!', message: 'Your account has been approved. Go online to start delivering.', type: 'default', createdAt: ago(days: 30), read: true),
      ];

  static final countries = <Country>[
    Country(id: '1', name: 'India', dialCode: '+91', flag: '🇮🇳'),
    Country(id: '2', name: 'Australia', dialCode: '+61', flag: '🇦🇺'),
    Country(id: '3', name: 'Canada', dialCode: '+1', flag: '🇨🇦'),
    Country(id: '4', name: 'United Arab Emirates', dialCode: '+971', flag: '🇦🇪'),
    Country(id: '5', name: 'United Kingdom', dialCode: '+44', flag: '🇬🇧'),
    Country(id: '6', name: 'United States', dialCode: '+1', flag: '🇺🇸'),
  ];

  static final zones = <Zone>[
    Zone(id: '1', name: 'Mumbai', countryId: '1', city: 'Mumbai'),
    Zone(id: '7', name: 'Pune', countryId: '1', city: 'Pune'),
    Zone(id: '3', name: 'Sydney', countryId: '2', city: 'Sydney'),
    Zone(id: '2', name: 'Toronto', countryId: '3', city: 'Toronto'),
    Zone(id: '4', name: 'Dubai', countryId: '4', city: 'Dubai'),
    Zone(id: '5', name: 'London', countryId: '5', city: 'London'),
    Zone(id: '6', name: 'New York', countryId: '6', city: 'New York'),
  ];
}
