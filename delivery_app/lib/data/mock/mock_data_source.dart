import 'dart:async';
import 'dart:math';

import '../../core/app_exception.dart';
import '../../core/config.dart';
import '../../core/storage.dart';
import '../../models/models.dart';
import '../delivery_data_source.dart';
import 'mock_data.dart';

/// In-memory demo backend (fully offline). State is kept for the app session so the whole guided
/// workflow (accept → pick up → deliver → cash/earnings update) works; every `watch*` stream
/// re-emits after a mutation, like the Firestore snapshots of the real backend.
class MockDataSource implements DeliveryDataSource {
  MockDataSource();

  final _rand = Random();
  final _changes = StreamController<void>.broadcast();
  late final List<DeliveryOrder> _orders = MockSeed.orders();
  late final List<CashCollection> _cash = MockSeed.cash();
  late final List<Earning> _earnings = MockSeed.earnings();
  late final List<Withdrawal> _withdrawals = MockSeed.withdrawals();
  late final List<WalletTxn> _walletTxns = MockSeed.walletTxns();
  late final List<ReturnPickup> _returns = MockSeed.returns();
  late final List<AppNotification> _notifications = MockSeed.notifications();
  final Map<String, List<ChatMessage>> _chats = {'support': MockSeed.supportChat()};
  final Map<String, ChatThread> _threads = {'support': ChatThread(id: 'support', subject: 'Support')};

  DeliveryProfile _profile = MockSeed.alex();
  double _cashInHand = 1669.82;
  double _cashCollected = 298657.15;
  double _walletBalance = 6;
  bool _online = false;
  int _nextId = 1000;
  int _nextOrderId = 82;

  Future<void> _latency([int ms = 350]) => Future.delayed(Duration(milliseconds: ms + _rand.nextInt(200)));

  void _notify() => _changes.add(null);

  /// Emits [compute] now (after a short simulated latency) and again after every mutation.
  Stream<T> _watch<T>(T Function() compute) async* {
    await _latency(200);
    yield compute();
    await for (final _ in _changes.stream) {
      yield compute();
    }
  }

  DeliveryOrder _find(String id) {
    final o = _orders.where((o) => o.id == id);
    if (o.isEmpty) throw AppException('Order not found', code: 'not-found');
    return o.first;
  }

  // ---------------------------------------------------------------- auth

  /// Offline demo sign-in (no Firebase): only the demo rider or a mock-registered rider.
  Future<DeliveryProfile> login(String email, String password) async {
    await _latency(600);
    final e = email.trim().toLowerCase();
    if (e == AppConfig.demoEmail && password == AppConfig.demoPassword) {
      _profile = MockSeed.alex();
      await AppStorage.instance.setMockUser('alex');
      return _profile;
    }
    final pending = AppStorage.instance.mockUser;
    if (pending != null && pending.startsWith('pending|') && pending.split('|')[2] == e) {
      _profile = _pendingProfile(pending);
      return _profile;
    }
    throw AppException('Invalid email or password', code: 'invalid-argument');
  }

  DeliveryProfile _pendingProfile(String stored) {
    final p = stored.split('|');
    return DeliveryProfile(id: 'pending', name: p[1], email: p[2], approvalStatus: 'pending', zone: 'Mumbai', country: 'India');
  }

  @override
  Future<SessionResult> session({String? fcmToken}) async => SessionResult.registered(await getProfile());

  @override
  Future<DeliveryProfile> register(RegistrationData d, {String? fcmToken}) async {
    await _latency(900);
    if (d.email.trim().toLowerCase() == AppConfig.demoEmail) {
      throw AppException('This email is already registered.', code: 'already-exists', errors: {
        'email': ['This email is already registered.'],
      });
    }
    final stored = 'pending|${d.name}|${d.email.trim().toLowerCase()}';
    await AppStorage.instance.setMockUser(stored);
    _profile = _pendingProfile(stored);
    return _profile;
  }

  @override
  Future<void> logout({String? fcmToken}) async {
    await _latency(150);
    _online = false;
  }

  @override
  Future<void> deleteAccount() async {
    await _latency(300);
    _online = false;
  }

  // ---------------------------------------------------------------- profile

  @override
  Future<DeliveryProfile> getProfile() async {
    await _latency(250);
    final stored = AppStorage.instance.mockUser;
    if (stored != null && stored.startsWith('pending|')) return _pendingProfile(stored);
    return _profile;
  }

  @override
  Stream<DeliveryProfile> watchProfile() => _watch(() => _profile);

  @override
  Future<DeliveryProfile> updateProfile(Map<String, dynamic> fields) async {
    await _latency();
    _profile = _profile.copyWith(
      name: fields['name'] as String?,
      address: fields['address'] as String?,
      vehicleType: fields['vehicle_type'] as String?,
      vehicleNumber: fields['vehicle_number'] as String?,
    );
    _notify();
    return _profile;
  }

  @override
  Future<List<Country>> getCountries() async {
    await _latency(200);
    return MockSeed.countries;
  }

  @override
  Future<List<Zone>> getZones(String countryId) async {
    await _latency(200);
    return MockSeed.zones.where((z) => z.countryId == countryId).toList();
  }

  // ---------------------------------------------------------------- presence

  @override
  Future<void> setOnline(bool online) async {
    await _latency(250);
    _online = online;
    _notify();
  }

  @override
  Future<void> sendLocation(double lat, double lng) async {}

  @override
  Future<void> saveFcmToken(String token) async {}

  /// Demo helper: drops a brand-new available order (simulates an FCM push).
  DeliveryOrder simulateIncomingOrder() {
    final id = _nextOrderId++;
    final o = MockSeed.order(
      id: id,
      customer: _rand.nextInt(MockSeed.customers.length),
      items: [_rand.nextInt(10), _rand.nextInt(10), _rand.nextInt(10)],
      status: OrderStatus.readyForPickup,
      payment: _rand.nextBool() ? 'cod' : 'razorpay',
      placed: DateTime.now(),
      distance: double.parse((1 + _rand.nextDouble() * 4).toStringAsFixed(1)),
    );
    _orders.insert(0, o);
    _notifications.insert(
      0,
      AppNotification(
        id: '${_nextId++}',
        title: 'New order request',
        message: '${o.orderNumber} is ready for pickup at ${o.store.name} (${o.distanceKm} km).',
        type: 'order',
        createdAt: DateTime.now(),
        orderId: o.id,
      ),
    );
    _notify();
    return o;
  }

  bool get isOnline => _online;

  // ---------------------------------------------------------------- orders

  bool _isToday(DateTime? d) {
    if (d == null) return false;
    final n = DateTime.now();
    return d.year == n.year && d.month == n.month && d.day == n.day;
  }

  @override
  Stream<Dashboard> watchDashboard() => _watch(() {
        final today = _earnings.where((e) => _isToday(e.date)).fold<double>(0, (s, e) => s + e.amount);
        return Dashboard(
          todayEarnings: double.parse(today.toStringAsFixed(2)),
          cashInHand: _cashInHand,
          deliveredToday: _orders.where((o) => o.isDelivered && _isToday(o.deliveredAt)).length,
          rating: _profile.rating,
          pending: _orders.where((o) => !o.isAccepted && !o.isFinished).length,
          active: _orders.where((o) => o.isAccepted && !o.isFinished).length,
          isOnline: _online,
        );
      });

  List<DeliveryOrder> _list(String type) {
    switch (type) {
      case 'available':
        return _orders.where((o) => !o.isAccepted && !o.isFinished).toList();
      case 'active':
        return _orders.where((o) => o.isAccepted && !o.isFinished).toList();
      default:
        final h = _orders.where((o) => o.isFinished).toList();
        h.sort((a, b) => (b.deliveredAt ?? b.createdAt ?? DateTime(0)).compareTo(a.deliveredAt ?? a.createdAt ?? DateTime(0)));
        return h;
    }
  }

  @override
  Stream<List<DeliveryOrder>> watchOrders(String type) => _watch(() => _list(type));

  @override
  Stream<DeliveryOrder> watchOrder(String id) => _watch(() => _find(id));

  @override
  Future<DeliveryOrder> acceptOrder(String id) async {
    await _latency();
    final o = _find(id);
    if (o.isAccepted) throw AppException('Order already accepted', code: 'failed-precondition');
    o.isAccepted = true;
    _notify();
    return o;
  }

  @override
  Future<void> rejectOrder(String id) async {
    await _latency();
    _orders.removeWhere((o) => o.id == id);
    _notify();
  }

  @override
  Future<DeliveryOrder> updateStatus(String id, String status) async {
    await _latency();
    final o = _find(id);
    _advance(o, status);
    _notify();
    return o;
  }

  void _advance(DeliveryOrder o, String status) {
    // fill any intermediate steps so the timeline stays coherent
    final target = OrderStatus.flow.indexOf(status);
    final have = o.timeline.map((t) => t.status).toSet();
    for (var i = 0; i <= target; i++) {
      final s = OrderStatus.flow[i];
      if (!have.contains(s)) o.timeline = [...o.timeline, TimelineEntry(status: s, at: DateTime.now())];
    }
    o.status = status;
  }

  @override
  Future<DeliverResult> deliver(String id, String otp, {double? cashCollected}) async {
    await _latency(700);
    final o = _find(id);
    if (otp != (o.otp ?? AppConfig.demoOtp)) {
      throw AppException('Invalid OTP. Please check with the customer.', code: 'invalid-argument', errors: {
        'otp': ['Invalid OTP. Please check with the customer.'],
      });
    }
    _advance(o, OrderStatus.delivered);
    o.deliveredAt = DateTime.now();
    o.paymentStatus = 'paid';
    _earnings.insert(0, Earning(id: '${_nextId++}', amount: o.earning, type: 'commission', orderNumber: o.orderNumber, date: DateTime.now()));
    var cash = 0.0;
    if (o.isCod) {
      cash = o.amountToCollect;
      _cashInHand = double.parse((_cashInHand + cash).toStringAsFixed(2));
      _cashCollected = double.parse((_cashCollected + cash).toStringAsFixed(2));
      _cash.insert(
        0,
        CashCollection(
          id: o.id,
          orderId: o.id,
          orderNumber: o.orderNumber,
          amount: cash,
          message: 'Order delivered — COD cash collected',
          date: DateTime.now(),
        ),
      );
    }
    _notify();
    return DeliverResult(order: o, earning: o.earning, cashCollected: cash, cashInHand: _cashInHand);
  }

  @override
  Future<String?> invoiceUrl(String orderId) async => null;

  // ---------------------------------------------------------------- returns

  @override
  Stream<List<ReturnPickup>> watchReturns() => _watch(() => List.of(_returns));

  @override
  Future<void> markReturnPickedUp(String id) async {
    await _latency();
    _returns.firstWhere((r) => r.id == id).status = 'picked_up';
    _notify();
  }

  // ---------------------------------------------------------------- money

  @override
  Stream<EarningsSummary> watchEarnings() => _watch(() {
        final now = DateTime.now();
        double sumWhere(bool Function(DateTime d) f) =>
            _earnings.where((e) => e.date != null && f(e.date!)).fold<double>(0, (s, e) => s + e.amount);
        final startOfWeek = DateTime(now.year, now.month, now.day).subtract(Duration(days: now.weekday - 1));
        return EarningsSummary(
          today: sumWhere(_isToday),
          week: sumWhere((d) => !d.isBefore(startOfWeek)),
          month: sumWhere((d) => d.year == now.year && d.month == now.month),
          total: 48250 + _earnings.fold<double>(0, (s, e) => s + e.amount),
          items: List.of(_earnings),
        );
      });

  @override
  Stream<CashSummary> watchCashCollections() =>
      _watch(() => CashSummary(cashInHand: _cashInHand, cashCollected: _cashCollected, items: List.of(_cash)));

  @override
  Stream<WalletSummary> watchWallet() => _watch(
      () => WalletSummary(balance: _walletBalance, withdrawals: List.of(_withdrawals), transactions: List.of(_walletTxns)));

  @override
  Future<bool> demoModeEnabled() async => true;

  @override
  Future<double> minWithdraw() async => 1;

  @override
  Future<void> withdraw(double amount, String? message) async {
    await _latency(600);
    if (amount <= 0) throw AppException('Enter a valid amount', code: 'invalid-argument');
    if (amount > _walletBalance) {
      throw AppException('Insufficient wallet balance', code: 'failed-precondition', errors: {
        'amount': ['Amount exceeds available balance (₹${_walletBalance.toStringAsFixed(0)}).'],
      });
    }
    final id = '${_withdrawals.length + 1}';
    _withdrawals.insert(0, Withdrawal(id: id, amount: amount, message: message, status: 'pending', date: DateTime.now()));
    _walletBalance -= amount;
    _walletTxns.insert(
        0, WalletTxn(id: '${_nextId++}', type: 'debit', amount: amount, message: 'Withdrawal request #$id', status: 'pending', date: DateTime.now()));
    _notify();
  }

  // ---------------------------------------------------------------- chat

  @override
  Future<ChatThread> openSupportChat() async {
    await _latency(200);
    return _threads['support']!;
  }

  @override
  Future<ChatThread> openOrderChat(String orderId, String subject) async {
    await _latency(200);
    final id = 'order_$orderId';
    return _threads.putIfAbsent(id, () {
      final o = _orders.where((e) => e.id == orderId);
      _chats[id] = [
        ChatMessage(
          id: '${_nextId++}',
          message: 'Hi, please call me when you reach${o.isEmpty ? '' : ' — ${o.first.customer.address.split(',').first}'}.',
          isMine: false,
          createdAt: DateTime.now().subtract(const Duration(minutes: 4)),
        ),
      ];
      return ChatThread(id: id, subject: o.isEmpty ? subject : 'Order ${o.first.orderNumber}', orderId: orderId);
    });
  }

  @override
  Stream<List<ChatMessage>> watchMessages(String chatId) => _watch(() => List.of(_chats[chatId] ?? const <ChatMessage>[]));

  @override
  Future<String> sendMessage(ChatThread thread, String message) async {
    final chatId = thread.isDraft ? 'support' : thread.id;
    await _latency(250);
    (_chats[chatId] ??= []).add(ChatMessage(id: '${_nextId++}', message: message, isMine: true, createdAt: DateTime.now(), chatId: chatId));
    _notify();
    // auto reply so the realtime stream shows something new
    Timer(const Duration(seconds: 3), () {
      final reply = chatId == 'support'
          ? 'Thanks for the update. Our support team is looking into it and will get back to you shortly.'
          : 'Okay, thank you!';
      (_chats[chatId] ??= []).add(ChatMessage(id: '${_nextId++}', message: reply, isMine: false, createdAt: DateTime.now()));
      _notify();
    });
    return chatId;
  }

  // ---------------------------------------------------------------- notifications

  @override
  Stream<List<AppNotification>> watchNotifications() => _watch(() => List.of(_notifications));

  @override
  Future<void> markAllNotificationsRead() async {
    await _latency(150);
    for (final n in _notifications) {
      n.read = true;
    }
    _notify();
  }
}
