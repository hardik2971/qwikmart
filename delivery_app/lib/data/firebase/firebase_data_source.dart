import 'dart:async';
import 'dart:math' as math;
import 'dart:typed_data';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:intl/intl.dart';

import '../../core/app_exception.dart';
import '../../core/auth_service.dart';
import '../../core/config.dart';
import '../../core/format.dart';
import '../../core/storage.dart';
import '../../core/streams.dart';
import '../../models/models.dart';
import '../delivery_data_source.dart';

/// Firebase backend (docs/FIREBASE_BACKEND.md): reads straight from Firestore (realtime snapshots,
/// guarded by `firestore.rules`), trusted actions through `asia-south1` callables, rider documents
/// in Storage `delivery_docs/{uid}/…`.
class FirebaseDataSource implements DeliveryDataSource {
  FirebaseDataSource({FirebaseFirestore? db, FirebaseFunctions? functions, FirebaseStorage? storage, FirebaseAuth? auth})
      : _dbOverride = db,
        _fnOverride = functions,
        _storageOverride = storage,
        _authOverride = auth;

  final FirebaseFirestore? _dbOverride;
  final FirebaseFunctions? _fnOverride;
  final FirebaseStorage? _storageOverride;
  final FirebaseAuth? _authOverride;

  FirebaseFirestore get _db => _dbOverride ?? FirebaseFirestore.instance;
  FirebaseFunctions get _fn => _fnOverride ?? FirebaseFunctions.instanceFor(region: AppConfig.functionsRegion);
  FirebaseStorage get _storage => _storageOverride ?? FirebaseStorage.instance;
  FirebaseAuth get _auth => _authOverride ?? FirebaseAuth.instance;

  /// Statuses (spec §4 / rules) the rider sees in each list.
  static const activeStatuses = ['received', 'processed', 'shipped', 'ready_for_pickup', 'picked_up', 'out_for_delivery'];
  static const historyStatuses = ['delivered', 'cancelled', 'returned'];
  static const availableStatuses = ['received', 'processed', 'ready_for_pickup'];
  static const returnStatuses = ['pickup_assigned', 'picked_up', 'refund_completed'];

  final Map<String, Future<Map<String, dynamic>>> _storeCache = {};
  final Map<String, Future<String?>> _nameCache = {};

  /// Commission settings of the signed-in rider, used to show the expected earning per order.
  DeliveryProfile? _profile;

  String get _uid {
    final u = _auth.currentUser;
    if (u == null) throw AppException('Please sign in again.', code: 'unauthenticated');
    return u.uid;
  }

  DocumentReference<Map<String, dynamic>> get _userRef => _db.doc('users/$_uid');
  DocumentReference<Map<String, dynamic>> get _boyRef => _db.doc('delivery_boys/$_uid');

  // ---------------------------------------------------------------- helpers

  Future<Map<String, dynamic>> _call(String name, Map<String, dynamic> data) async {
    try {
      final r = await _fn.httpsCallable(name, options: HttpsCallableOptions(timeout: const Duration(seconds: 60))).call<dynamic>(data);
      return asMap(_plain(r.data));
    } catch (e) {
      throw AppException.from(e);
    }
  }

  Future<T> _guard<T>(Future<T> Function() f) async {
    try {
      return await f();
    } catch (e) {
      throw AppException.from(e);
    }
  }

  Stream<T> _guardStream<T>(Stream<T> s) => s.transform(StreamTransformer<T, T>.fromHandlers(
        handleError: (e, st, sink) => sink.addError(AppException.from(e), st),
      ));

  /// Firestore → plain JSON-ish values (Timestamp → DateTime, nested maps/lists).
  static dynamic _plain(dynamic v) {
    if (v is Timestamp) return v.toDate();
    if (v is GeoPoint) return {'lat': v.latitude, 'lng': v.longitude};
    if (v is DocumentReference) return v.id;
    if (v is Map) return v.map((k, val) => MapEntry(k.toString(), _plain(val)));
    if (v is List) return v.map(_plain).toList();
    return v;
  }

  static Map<String, dynamic> _data(DocumentSnapshot<Map<String, dynamic>> d) =>
      {...asMap(_plain(d.data())), 'id': d.id};

  static List<Map<String, dynamic>> _docs(QuerySnapshot<Map<String, dynamic>> q) => q.docs.map(_data).toList();

  Future<String?> _nameOf(String collection, String? id) {
    if (id == null || id.isEmpty) return Future.value(null);
    return _nameCache.putIfAbsent('$collection/$id', () async {
      try {
        final d = await _db.doc('$collection/$id').get();
        final n = d.data()?['name'];
        if (n is Map) return asStringOrNull(n['en'] ?? n.values.firstOrNull);
        return asStringOrNull(n);
      } catch (_) {
        return null;
      }
    });
  }

  Future<Map<String, dynamic>> _store(String? id) {
    if (id == null || id.isEmpty) return Future.value(const {});
    return _storeCache.putIfAbsent(id, () async {
      try {
        final d = await _db.doc('stores/$id').get();
        return d.exists ? _data(d) : <String, dynamic>{'id': id};
      } catch (_) {
        _storeCache.remove(id);
        return <String, dynamic>{'id': id};
      }
    });
  }

  static double? _distanceKm(dynamic lat1, dynamic lng1, dynamic lat2, dynamic lng2) {
    final a1 = asDoubleOrNull(lat1), o1 = asDoubleOrNull(lng1), a2 = asDoubleOrNull(lat2), o2 = asDoubleOrNull(lng2);
    if (a1 == null || o1 == null || a2 == null || o2 == null) return null;
    const r = 6371.0;
    double rad(double d) => d * math.pi / 180;
    final dLat = rad(a2 - a1), dLng = rad(o2 - o1);
    final h = math.pow(math.sin(dLat / 2), 2) + math.cos(rad(a1)) * math.cos(rad(a2)) * math.pow(math.sin(dLng / 2), 2);
    return double.parse((2 * r * math.asin(math.sqrt(h))).toStringAsFixed(1));
  }

  Future<DeliveryOrder> _order(Map<String, dynamic> d) async {
    final store = await _store(asStringOrNull(d['store_id']));
    final totals = asMap(d['totals']);
    final addr = asMap(d['address']);
    final payable = asDouble(totals['total']);
    final cod = asString(d['payment_method']) == 'cod' && asString(d['payment_status']) != 'paid';
    final mine = d['delivery_boy_id'] != null && d['delivery_boy_id'] == _auth.currentUser?.uid;
    return DeliveryOrder.fromJson({
      'id': d['id'],
      'order_number': d['order_number'],
      'status': d['status'],
      'payment_method': d['payment_method'],
      'payment_status': d['payment_status'],
      'total': totals['grand_total'] ?? payable,
      'subtotal': totals['subtotal'],
      'delivery_charge': totals['delivery_charge'],
      'surge_charge': totals['surge_charge'],
      'tax_amount': totals['tax_amount'],
      'promo_discount': totals['promo_discount'],
      'amount_to_collect': cod ? payable : 0,
      'earning': _profile?.commissionFor(payable + asDouble(totals['wallet_used'])) ?? 0,
      'distance_km': _distanceKm(store['lat'], store['lng'], addr['lat'], addr['lng']),
      'store': {...store, 'id': d['store_id'] ?? store['id'] ?? ''},
      'customer': asMap(d['customer']),
      'address': addr,
      'items': d['items'],
      'timeline': d['timeline'],
      'is_accepted': mine,
      'mode': d['mode'],
      'notes': d['notes'],
      'created_at': d['created_at'],
      'delivered_at': d['delivered_at'],
    });
  }

  Stream<List<DeliveryOrder>> _orders(Query<Map<String, dynamic>> q, {bool Function(Map<String, dynamic>)? where}) =>
      _guardStream(q.snapshots().asyncMap((s) async {
        final list = _docs(s).where((d) => where?.call(d) ?? true).toList();
        return Future.wait(list.map(_order));
      }));

  static DateTime _startOfDay() {
    final n = DateTime.now();
    return DateTime(n.year, n.month, n.day);
  }

  static bool _isToday(DateTime? d) => d != null && !d.isBefore(_startOfDay());

  // ---------------------------------------------------------------- auth / profile

  Future<DeliveryProfile> _profileFrom(Map<String, dynamic> user, Map<String, dynamic>? boy) async {
    // No delivery_boys doc yet (registration in progress) → never treat it as approved.
    final b = boy ?? const <String, dynamic>{'approval_status': 'pending'};
    final names = await Future.wait([_nameOf('zones', asStringOrNull(b['zone_id'])), _nameOf('countries', asStringOrNull(b['country_id']))]);
    final p = DeliveryProfile.fromJson({
      'user': {...user, 'id': _uid},
      'delivery_boy': {...b, 'zone_name': ?names[0], 'country_name': ?names[1]},
    });
    _profile = p;
    return p;
  }

  @override
  Future<SessionResult> session({String? fcmToken}) async {
    final res = await _call('syncProfile', {
      'app': 'delivery',
      'fcm_token': ?fcmToken,
      'language': AppStorage.instance.locale ?? 'en',
    });
    final user = asMap(res['user']);
    if (res['blocked'] == true || user['status'] == 'inactive') {
      throw AppException('Your account is inactive. Please contact support.', code: 'permission-denied');
    }
    if (const ['admin', 'staff', 'store'].contains(user['type'])) {
      throw AppException('This account is not a delivery partner account.', code: 'permission-denied');
    }
    // syncProfile (re)computes the custom claims (`role`, `zone_id`) – refresh the ID token so
    // Firestore rules see them.
    await FirebaseAuthService.idToken(forceRefresh: true);
    final boy = await _guard(() => _boyRef.get());
    if (!boy.exists) {
      // A shopper account (type customer) is not a delivery partner: refuse it instead of turning
      // it into a rider (registerDeliveryBoy would change its type). Accounts created by this app
      // get type `delivery_boy` from syncProfile, so an interrupted registration can still resume.
      if (user['type'] != null && user['type'] != 'delivery_boy') {
        throw AppException(
          'This is a QwikMart customer account, not a delivery partner account. Please register as a delivery partner with a different e-mail.',
          code: 'permission-denied',
        );
      }
      return SessionResult.notRegistered();
    }
    final p = await _profileFrom(_data(await _guard(() => _userRef.get())), _data(boy));
    if (!p.isActive) throw AppException('Your account is inactive. Please contact support.', code: 'permission-denied');
    return SessionResult.registered(p);
  }

  static String _contentType(String name) {
    final n = name.toLowerCase();
    if (n.endsWith('.pdf')) return 'application/pdf';
    if (n.endsWith('.png')) return 'image/png';
    if (n.endsWith('.webp')) return 'image/webp';
    if (n.endsWith('.gif')) return 'image/gif';
    if (n.endsWith('.heic')) return 'image/heic';
    return 'image/jpeg';
  }

  Future<String?> _upload(PickedDoc? doc, String kind) async {
    if (doc == null) return null;
    final ext = doc.name.contains('.') ? doc.name.split('.').last.toLowerCase() : 'jpg';
    final path = 'delivery_docs/$_uid/${kind}_${DateTime.now().millisecondsSinceEpoch}.$ext';
    await _guard(() => _storage.ref(path).putData(Uint8List.fromList(doc.bytes), SettableMetadata(contentType: _contentType(doc.name))));
    return path;
  }

  @override
  Future<DeliveryProfile> register(RegistrationData d, {String? fcmToken}) async {
    final license = await _upload(d.drivingLicense, 'driving_license');
    final idProof = await _upload(d.idProof, 'id_proof');
    final phone = d.phone.startsWith('+') ? d.phone : '${d.countryCode}${d.phone.replaceAll(RegExp(r'\D'), '')}';
    await _call('registerDeliveryBoy', {
      'name': d.name,
      'phone': phone,
      if (d.dob != null) 'dob': DateFormat('yyyy-MM-dd').format(d.dob!),
      'country_id': d.countryId,
      'zone_id': d.zoneId,
      'address': d.address,
      'vehicle_type': d.vehicleType,
      'vehicle_number': d.vehicleNumber,
      'driving_license': license,
      'id_proof': idProof,
      'bank': {'name': d.bankName, 'account': d.bankAccount, 'ifsc': d.ifsc},
    });
    await FirebaseAuthService.idToken(forceRefresh: true); // role claim = delivery_boy
    if (fcmToken != null) await saveFcmToken(fcmToken).catchError((_) {});
    return getProfile();
  }

  @override
  Future<void> logout({String? fcmToken}) async {
    if (_auth.currentUser == null) return;
    try {
      if (_profile?.isOnline ?? false) await setOnline(false);
    } catch (_) {}
    if (fcmToken != null) {
      await _guard(() => _userRef.update({'fcm_tokens': FieldValue.arrayRemove([fcmToken]), 'updated_at': FieldValue.serverTimestamp()}));
    }
  }

  @override
  Future<void> deleteAccount() async {
    await _call('deleteAccount', {});
  }

  @override
  Future<DeliveryProfile> getProfile() => _guard(() async {
        final r = await Future.wait([_userRef.get(), _boyRef.get()]);
        return _profileFrom(_data(r[0]), r[1].exists ? _data(r[1]) : null);
      });

  @override
  Stream<DeliveryProfile> watchProfile() => _guardStream(combineLatest<Future<DeliveryProfile>>(
        [_userRef.snapshots(), _boyRef.snapshots()],
        (v) {
          final boy = v[1] as DocumentSnapshot<Map<String, dynamic>>;
          return _profileFrom(_data(v[0] as DocumentSnapshot<Map<String, dynamic>>), boy.exists ? _data(boy) : null);
        },
      ).asyncMap((f) => f));

  /// Rules: the rider may change only `name` (+ avatar / language / fcm_tokens) on `users/{uid}`;
  /// vehicle, address and bank data are managed by the admin panel.
  @override
  Future<DeliveryProfile> updateProfile(Map<String, dynamic> fields) async {
    final name = asString(fields['name']).trim();
    if (name.isNotEmpty) {
      await _guard(() => _userRef.update({'name': name, 'updated_at': FieldValue.serverTimestamp()}));
    }
    return getProfile();
  }

  @override
  Future<List<Country>> getCountries() => _guard(() async {
        final q = await _db.collection('countries').get();
        return _docs(q)
            .where((c) => c['status'] == null || c['status'] == 'active')
            .map(Country.fromJson)
            .toList()
          ..sort((a, b) => a.name.compareTo(b.name));
      });

  @override
  Future<List<Zone>> getZones(String countryId) => _guard(() async {
        final q = await _db.collection('zones').where('country_id', isEqualTo: countryId).get();
        return _docs(q).where((z) => z['status'] == null || z['status'] == 'active').map(Zone.fromJson).toList()
          ..sort((a, b) => a.name.compareTo(b.name));
      });

  // ---------------------------------------------------------------- presence

  @override
  Future<void> setOnline(bool online) async {
    await _call('setOnline', {'is_online': online});
  }

  /// Rules allow the rider to write only `location` on its own `delivery_boys` doc.
  @override
  Future<void> sendLocation(double lat, double lng) => _guard(() => _boyRef.update({
        'location': {'lat': lat, 'lng': lng, 'updated_at': FieldValue.serverTimestamp()},
      }));

  @override
  Future<void> saveFcmToken(String token) => _guard(() => _userRef.update({
        'fcm_tokens': FieldValue.arrayUnion([token]),
        'updated_at': FieldValue.serverTimestamp(),
      }));

  // ---------------------------------------------------------------- orders

  /// `zone_id` custom claim (set by `approveDeliveryBoy` / `syncProfile`); the available-pool
  /// query must filter on it to satisfy the rules.
  Future<String?> _zoneClaim() async {
    var z = asStringOrNull((await FirebaseAuthService.claims())['zone_id']);
    if (z == null && (_profile?.isApproved ?? false)) {
      z = asStringOrNull((await FirebaseAuthService.claims(forceRefresh: true))['zone_id']);
    }
    return z;
  }

  Query<Map<String, dynamic>> get _orderCol => _db.collection('orders');

  @override
  Stream<List<DeliveryOrder>> watchOrders(String type) {
    final uid = _uid;
    switch (type) {
      case 'available':
        return Stream.fromFuture(_zoneClaim()).asyncExpand((zone) {
          if (zone == null || zone.isEmpty) return Stream.value(const <DeliveryOrder>[]);
          return _orders(
            _orderCol
                .where('zone_id', isEqualTo: zone)
                .where('delivery_boy_id', isNull: true)
                .where('status', whereIn: availableStatuses)
                .limit(50),
            where: (d) => d['delivery_type'] != 'self_pickup' && !(asList(d['rejected_by']).contains(uid)),
          ).map((l) => l..sort((a, b) => (b.createdAt ?? DateTime(0)).compareTo(a.createdAt ?? DateTime(0))));
        });
      case 'active':
        return _orders(_orderCol.where('delivery_boy_id', isEqualTo: uid).where('status', whereIn: activeStatuses).limit(50))
            .map((l) => l..sort((a, b) => (a.createdAt ?? DateTime(0)).compareTo(b.createdAt ?? DateTime(0))));
      default:
        return _orders(_orderCol
            .where('delivery_boy_id', isEqualTo: uid)
            .where('status', whereIn: historyStatuses)
            .orderBy('updated_at', descending: true)
            .limit(50));
    }
  }

  @override
  Stream<DeliveryOrder> watchOrder(String id) => _guardStream(_db.doc('orders/$id').snapshots().asyncMap((s) {
        if (!s.exists) throw AppException('Order not found.', code: 'not-found');
        return _order(_data(s));
      }));

  Future<DeliveryOrder> _getOrder(String id) => _guard(() async {
        final s = await _db.doc('orders/$id').get();
        if (!s.exists) throw AppException('Order not found.', code: 'not-found');
        return _order(_data(s));
      });

  @override
  Stream<Dashboard> watchDashboard() {
    final uid = _uid;
    final start = _startOfDay();
    final todayEarnings = _db
        .collection('delivery_earnings')
        .where('delivery_boy_id', isEqualTo: uid)
        .where('created_at', isGreaterThanOrEqualTo: Timestamp.fromDate(start))
        .orderBy('created_at', descending: true)
        .snapshots();
    final delivered = _orderCol
        .where('delivery_boy_id', isEqualTo: uid)
        .where('status', isEqualTo: 'delivered')
        .orderBy('updated_at', descending: true)
        .limit(100)
        .snapshots();
    return _guardStream(combineLatest<Dashboard>(
      [_boyRef.snapshots(), todayEarnings, delivered, watchOrders('active'), watchOrders('available')],
      (v) {
        final boy = asMap(_plain((v[0] as DocumentSnapshot<Map<String, dynamic>>).data()));
        final earn = _docs(v[1] as QuerySnapshot<Map<String, dynamic>>).fold<double>(0, (s, e) => s + asDouble(e['amount']));
        final deliveredToday = _docs(v[2] as QuerySnapshot<Map<String, dynamic>>).where((o) => _isToday(asDate(o['delivered_at']))).length;
        return Dashboard(
          todayEarnings: double.parse(earn.toStringAsFixed(2)),
          cashInHand: asDouble(boy['cash_in_hand']),
          deliveredToday: deliveredToday,
          rating: asDouble(boy['rating_avg']),
          active: (v[3] as List).length,
          pending: (v[4] as List).length,
          isOnline: asBool(boy['is_online']),
        );
      },
    ));
  }

  @override
  Future<DeliveryOrder> acceptOrder(String id) async {
    await _call('acceptOrder', {'order_id': id});
    return _getOrder(id);
  }

  @override
  Future<void> rejectOrder(String id) async {
    await _call('rejectOrder', {'order_id': id});
  }

  @override
  Future<DeliveryOrder> updateStatus(String id, String status) async {
    await _call('updateDeliveryStatus', {'order_id': id, 'status': status});
    return _getOrder(id);
  }

  @override
  Future<DeliverResult> deliver(String id, String otp, {double? cashCollected}) async {
    final before = await _getOrder(id);
    final r = await _call('deliverOrder', {'order_id': id, 'otp': otp, 'cash_collected': ?cashCollected});
    final order = await _getOrder(id);
    return DeliverResult(
      order: order,
      earning: before.earning,
      cashCollected: asDouble(r['cash_collected']),
      cashInHand: asDoubleOrNull(r['cash_in_hand']),
    );
  }

  @override
  Future<String?> invoiceUrl(String orderId) async {
    final r = await _call('getInvoiceUrl', {'order_id': orderId});
    return asStringOrNull(r['url']);
  }

  // ---------------------------------------------------------------- returns

  Future<ReturnPickup> _return(Map<String, dynamic> r) async {
    Map<String, dynamic> order = const {};
    try {
      // Readable only when this rider also delivered the order (rules: orders.delivery_boy_id == uid).
      final s = await _db.doc('orders/${r['order_id']}').get();
      if (s.exists) order = _data(s);
    } catch (_) {}
    final store = await _store(asStringOrNull(r['store_id'] ?? order['store_id']));
    return ReturnPickup.fromJson({
      ...r,
      'product_name': r['item_name'],
      'store_name': store['name'],
      'image': asMapList(order['items']).where((i) => '${i['variant_id']}' == '${r['item_variant_id']}').firstOrNull?['image'],
      // `processReturn(pickup_assigned)` copies `customer` + `address` onto the return (the rider
      // usually cannot read the order); fall back to the order when this rider delivered it.
      'order': {'order_number': r['order_number'], 'address_snapshot': r['address'] ?? order['address']},
      'customer': {...asMap(order['customer']), ...asMap(r['customer'])},
    });
  }

  @override
  Stream<List<ReturnPickup>> watchReturns() => _guardStream(_db
      .collection('return_requests')
      .where('delivery_boy_id', isEqualTo: _uid)
      .where('status', whereIn: returnStatuses)
      .orderBy('created_at', descending: true)
      .limit(50)
      .snapshots()
      .asyncMap((s) => Future.wait(_docs(s).map(_return))));

  @override
  Future<void> markReturnPickedUp(String id) async {
    await _call('returnPickedUp', {'return_id': id});
  }

  // ---------------------------------------------------------------- money

  @override
  Stream<EarningsSummary> watchEarnings() {
    final q = _db
        .collection('delivery_earnings')
        .where('delivery_boy_id', isEqualTo: _uid)
        .orderBy('created_at', descending: true)
        .limit(200)
        .snapshots();
    return _guardStream(combineLatest<EarningsSummary>([q, _boyRef.snapshots()], (v) {
      final items = _docs(v[0] as QuerySnapshot<Map<String, dynamic>>).map(Earning.fromJson).toList();
      final boy = asMap(_plain((v[1] as DocumentSnapshot<Map<String, dynamic>>).data()));
      final now = DateTime.now();
      final startOfWeek = _startOfDay().subtract(Duration(days: now.weekday - 1));
      double sum(bool Function(DateTime d) f) => double.parse(
          items.where((e) => e.date != null && f(e.date!)).fold<double>(0, (s, e) => s + e.amount).toStringAsFixed(2));
      return EarningsSummary(
        today: sum(_isToday),
        week: sum((d) => !d.isBefore(startOfWeek)),
        month: sum((d) => d.year == now.year && d.month == now.month),
        total: asDouble(boy['earnings_total'], items.fold<double>(0, (s, e) => s + e.amount)),
        items: items,
      );
    }));
  }

  @override
  Stream<CashSummary> watchCashCollections() {
    final q = _db
        .collection('cash_collections')
        .where('delivery_boy_id', isEqualTo: _uid)
        .orderBy('created_at', descending: true)
        .limit(100)
        .snapshots();
    return _guardStream(combineLatest<CashSummary>([q, _boyRef.snapshots()], (v) {
      final items = _docs(v[0] as QuerySnapshot<Map<String, dynamic>>).map(CashCollection.fromJson).toList();
      final boy = asMap(_plain((v[1] as DocumentSnapshot<Map<String, dynamic>>).data()));
      final collected = items.where((c) => c.type == 'collected_from_customer').fold<double>(0, (s, c) => s + c.amount);
      return CashSummary(
        cashInHand: asDouble(boy['cash_in_hand']),
        cashCollected: double.parse(collected.toStringAsFixed(2)),
        items: items,
      );
    }));
  }

  @override
  Stream<WalletSummary> watchWallet() {
    final txns = _userRef.collection('wallet_transactions').orderBy('created_at', descending: true).limit(50).snapshots();
    final withdrawals = _db
        .collection('withdrawal_requests')
        .where('user_id', isEqualTo: _uid)
        .orderBy('created_at', descending: true)
        .limit(50)
        .snapshots();
    return _guardStream(combineLatest<WalletSummary>([_userRef.snapshots(), txns, withdrawals], (v) {
      final user = asMap(_plain((v[0] as DocumentSnapshot<Map<String, dynamic>>).data()));
      return WalletSummary(
        balance: asDouble(user['wallet_balance']),
        transactions: _docs(v[1] as QuerySnapshot<Map<String, dynamic>>).map(WalletTxn.fromJson).toList(),
        withdrawals: _docs(v[2] as QuerySnapshot<Map<String, dynamic>>).map(Withdrawal.fromJson).toList(),
      );
    }));
  }

  @override
  Future<bool> demoModeEnabled() async {
    try {
      final s = await _db.doc('settings/public').get();
      return s.data()?['demo_mode'] == true;
    } catch (_) {
      return false;
    }
  }

  @override
  Future<double> minWithdraw() async {
    try {
      final s = await _db.doc('settings/public').get();
      return asDouble(asMap(s.data()?['wallet'])['min_withdraw'], 100);
    } catch (_) {
      return 100;
    }
  }

  @override
  Future<void> withdraw(double amount, String? message) async {
    await _call('walletWithdraw', {'amount': amount, if (message != null && message.isNotEmpty) 'message': message});
  }

  // ---------------------------------------------------------------- chat

  Future<List<Map<String, dynamic>>> _myChats() => _guard(() async {
        final q = await _db.collection('chats').where('user_uid', isEqualTo: _uid).get();
        final list = _docs(q);
        list.sort((a, b) => (asDate(b['last_message_at'] ?? b['created_at']) ?? DateTime(0))
            .compareTo(asDate(a['last_message_at'] ?? a['created_at']) ?? DateTime(0)));
        return list;
      });

  @override
  Future<ChatThread> openSupportChat() async {
    final existing = (await _myChats()).where((c) => c['order_id'] == null && c['status'] != 'closed');
    return existing.isNotEmpty ? ChatThread.fromJson(existing.first) : ChatThread.draft(subject: 'Support');
  }

  @override
  Future<ChatThread> openOrderChat(String orderId, String subject) async {
    final existing = (await _myChats()).where((c) => c['order_id'] == orderId);
    if (existing.isNotEmpty) return ChatThread.fromJson(existing.first);
    String number = subject;
    try {
      final o = await _db.doc('orders/$orderId').get();
      number = asString(o.data()?['order_number'], subject);
    } catch (_) {}
    return ChatThread.draft(subject: 'Order $number', orderId: orderId);
  }

  @override
  Stream<List<ChatMessage>> watchMessages(String chatId) {
    if (chatId.isEmpty) return Stream.value(const []);
    final uid = _uid;
    return _guardStream(_db
        .collection('chats/$chatId/messages')
        .where('user_uid', isEqualTo: uid)
        .orderBy('created_at')
        .limit(300)
        .snapshots()
        .map((s) => _docs(s).map((m) => ChatMessage.fromJson({...m, 'chat_id': chatId, 'is_mine': m['sender_id'] == uid})).toList()));
  }

  @override
  Future<String> sendMessage(ChatThread thread, String message) => _guard(() async {
        final uid = _uid;
        final name = _profile?.name ?? asString((await _userRef.get()).data()?['name'], 'Delivery partner');
        var chatId = thread.id;
        if (thread.isDraft) {
          String? orderNumber;
          if (thread.orderId != null) {
            try {
              orderNumber = asStringOrNull((await _db.doc('orders/${thread.orderId}').get()).data()?['order_number']);
            } catch (_) {}
          }
          // Two writes (not a batch): the message rule reads the chat doc with get().
          final ref = await _db.collection('chats').add({
            'user_id': uid,
            'user_uid': uid,
            'user_type': 'delivery_boy',
            'user_name': name,
            'order_id': thread.orderId,
            'order_number': orderNumber,
            'subject': thread.subject,
            'status': 'open',
            'last_message': null,
            'last_message_at': null,
            'unread_admin': 0,
            'unread_user': 0,
            'created_at': FieldValue.serverTimestamp(),
          });
          chatId = ref.id;
        }
        await _db.collection('chats/$chatId/messages').add({
          'user_uid': uid,
          'sender_id': uid,
          'sender_type': 'delivery_boy',
          'sender_name': name,
          'message': message,
          'attachment': null,
          'read_at': null,
          'created_at': FieldValue.serverTimestamp(),
        });
        return chatId;
      });

  // ---------------------------------------------------------------- notifications

  @override
  Stream<List<AppNotification>> watchNotifications() => _guardStream(_userRef
      .collection('notifications')
      .orderBy('created_at', descending: true)
      .limit(50)
      .snapshots()
      .map((s) => _docs(s).map(AppNotification.fromJson).toList()));

  @override
  Future<void> markAllNotificationsRead() => _guard(() async {
        final q = await _userRef.collection('notifications').orderBy('created_at', descending: true).limit(100).get();
        final unread = q.docs.where((d) => d.data()['read_at'] == null).toList();
        for (var i = 0; i < unread.length; i += 400) {
          final batch = _db.batch();
          for (final d in unread.skip(i).take(400)) {
            batch.update(d.reference, {'read_at': FieldValue.serverTimestamp()});
          }
          await batch.commit();
        }
      });
}

List<dynamic> asList(dynamic v) => v is List ? v : const [];
