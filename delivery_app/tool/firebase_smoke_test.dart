// End-to-end smoke test of the delivery app's Firebase flows against the local Emulator Suite
// loaded with the migrated MySQL data (NOT part of `flutter test`).
//
//   cd firebase && npm --prefix functions run build
//   npx firebase emulators:start --project qwikmart-37299 --import tools/emulator-data
//   cd delivery_app && dart run tool/firebase_smoke_test.dart
//
// Ports default to the standard emulator ports; override with env vars
// AUTH_PORT / FIRESTORE_PORT / FUNCTIONS_PORT / STORAGE_PORT (e.g. 39099/38080/35001/39199).
//
// It talks to the emulators exactly like the FlutterFire SDKs do (Identity Toolkit sign-in,
// Firestore REST `runQuery` / `commit` with the rider's ID token so the security rules apply,
// callable protocol `POST /{project}/asia-south1/{name}`) and replays the app's queries
// (lib/data/firebase/firebase_data_source.dart):
//   alex@gmail.com login → syncProfile → online → location write (only `location` allowed) →
//   customer@gmail.com places a COD order → appears in Available → accept → picked_up →
//   out_for_delivery → wrong OTP rejected → OTP (read by the customer; the rider is denied) →
//   delivered with COD cash + commission → earnings / cash / history / dashboard queries →
//   wallet + walletWithdraw + withdrawal_requests → notifications → support chat →
//   reject flow → registration of a new rider (Storage upload + registerDeliveryBoy → pending).
// Mutates the emulator data only (never run it against production).
import 'dart:async';
import 'dart:convert';
import 'dart:io';

const project = 'qwikmart-37299';
const region = 'asia-south1';
const bucket = '$project.firebasestorage.app';
final env = Platform.environment;
final host = env['EMULATOR_HOST'] ?? '127.0.0.1';
final authBase = 'http://$host:${env['AUTH_PORT'] ?? '9099'}';
final fsBase = 'http://$host:${env['FIRESTORE_PORT'] ?? '8080'}/v1/projects/$project/databases/(default)';
final fnBase = 'http://$host:${env['FUNCTIONS_PORT'] ?? '5001'}/$project/$region';
final storageBase = 'http://$host:${env['STORAGE_PORT'] ?? '9199'}';
String get docsRoot => '$fsBase/documents';

const riderEmail = 'alex@gmail.com';
const riderPassword = 'Alex@1234';
const customerEmail = 'customer@gmail.com';
const customerPassword = '123456';

// ---------------------------------------------------------------- tiny test harness
var _passed = 0;
final _failures = <String>[];
final _notes = <String>[];

void check(bool ok, String what) {
  if (ok) {
    _passed++;
    stdout.writeln('  ok   $what');
  } else {
    _failures.add(what);
    stdout.writeln('  FAIL $what');
  }
}

void note(String s) {
  _notes.add(s);
  stdout.writeln('  note $s');
}

void step(String s) => stdout.writeln('\n== $s');

// ---------------------------------------------------------------- HTTP
class HttpFail implements Exception {
  HttpFail(this.status, this.body);
  final int status;
  final dynamic body;
  String get message {
    final b = body;
    if (b is Map && b['error'] is Map) return '${b['error']['status'] ?? ''} ${b['error']['message'] ?? ''}'.trim();
    return '$b';
  }

  @override
  String toString() => 'HTTP $status: $message';
}

final _client = HttpClient();

Future<dynamic> http(String method, String url, {Object? json, List<int>? bytes, String? contentType, String? token}) async {
  final req = await _client.openUrl(method, Uri.parse(url));
  if (token != null) req.headers.set('Authorization', 'Bearer $token');
  if (json != null) {
    req.headers.contentType = ContentType.json;
    req.add(utf8.encode(jsonEncode(json)));
  } else if (bytes != null) {
    req.headers.set('Content-Type', contentType ?? 'application/octet-stream');
    req.add(bytes);
  }
  final res = await req.close();
  final text = await res.transform(utf8.decoder).join();
  dynamic body;
  try {
    body = text.isEmpty ? null : jsonDecode(text);
  } catch (_) {
    body = text;
  }
  if (res.statusCode >= 400) throw HttpFail(res.statusCode, body);
  return body;
}

// ---------------------------------------------------------------- Auth emulator
class Session {
  Session(this.uid, this.idToken, this.email, this.password);
  final String uid;
  String idToken;
  final String email;
  final String password;

  Map<String, dynamic> get claims {
    final p = idToken.split('.')[1];
    return jsonDecode(utf8.decode(base64Url.decode(base64Url.normalize(p)))) as Map<String, dynamic>;
  }

  /// Like `getIdToken(true)`: a fresh token carries the latest custom claims.
  Future<void> refresh() async {
    final s = await signIn(email, password);
    idToken = s.idToken;
  }
}

Future<Session> signIn(String email, String password) async {
  final r = await http('POST', '$authBase/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake',
      json: {'email': email, 'password': password, 'returnSecureToken': true});
  return Session(r['localId'] as String, r['idToken'] as String, email, password);
}

Future<Session> signUp(String email, String password) async {
  final r = await http('POST', '$authBase/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake',
      json: {'email': email, 'password': password, 'returnSecureToken': true});
  return Session(r['localId'] as String, r['idToken'] as String, email, password);
}

// ---------------------------------------------------------------- callables
class CallableError implements Exception {
  CallableError(this.status, this.message, this.details);
  final String status;
  final String message;
  final dynamic details;
  @override
  String toString() => '$status: $message';
}

Future<Map<String, dynamic>> call(String name, Session s, [Map<String, dynamic> data = const {}]) async {
  try {
    final r = await http('POST', '$fnBase/$name', json: {'data': data}, token: s.idToken);
    final result = (r as Map)['result'];
    return result is Map ? Map<String, dynamic>.from(result) : {'value': result};
  } on HttpFail catch (e) {
    final b = e.body;
    if (b is Map && b['error'] is Map) {
      throw CallableError('${b['error']['status']}', '${b['error']['message']}', b['error']['details']);
    }
    rethrow;
  }
}

// ---------------------------------------------------------------- Firestore REST (values)
Map<String, dynamic> enc(dynamic v) {
  if (v == null) return {'nullValue': null};
  if (v is bool) return {'booleanValue': v};
  if (v is int) return {'integerValue': '$v'};
  if (v is num) return {'doubleValue': v};
  if (v is String) return {'stringValue': v};
  if (v is DateTime) return {'timestampValue': v.toUtc().toIso8601String()};
  if (v is List) return {'arrayValue': {'values': v.map(enc).toList()}};
  if (v is Map) return {'mapValue': {'fields': v.map((k, x) => MapEntry('$k', enc(x)))}};
  throw ArgumentError('cannot encode $v');
}

dynamic dec(Map<String, dynamic> v) {
  if (v.containsKey('nullValue')) return null;
  if (v.containsKey('booleanValue')) return v['booleanValue'];
  if (v.containsKey('integerValue')) return int.parse('${v['integerValue']}');
  if (v.containsKey('doubleValue')) return (v['doubleValue'] as num).toDouble();
  if (v.containsKey('stringValue')) return v['stringValue'];
  if (v.containsKey('timestampValue')) return DateTime.parse(v['timestampValue'] as String);
  if (v.containsKey('arrayValue')) return ((v['arrayValue']['values'] as List?) ?? []).map((e) => dec(Map<String, dynamic>.from(e))).toList();
  if (v.containsKey('mapValue')) return decFields(v['mapValue']['fields']);
  if (v.containsKey('referenceValue')) return v['referenceValue'];
  if (v.containsKey('geoPointValue')) return v['geoPointValue'];
  return null;
}

Map<String, dynamic> decFields(dynamic fields) =>
    fields == null ? <String, dynamic>{} : Map<String, dynamic>.from((fields as Map).map((k, x) => MapEntry('$k', dec(Map<String, dynamic>.from(x)))));

Map<String, dynamic> decDoc(Map doc) => {...decFields(doc['fields']), 'id': (doc['name'] as String).split('/').last};

Future<Map<String, dynamic>?> getDoc(String path, String token) async {
  try {
    return decDoc(await http('GET', '$docsRoot/$path', token: token) as Map);
  } on HttpFail catch (e) {
    if (e.status == 404) return null;
    rethrow;
  }
}

Future<bool> canRead(String path, String token) async {
  try {
    await getDoc(path, token);
    return true;
  } on HttpFail catch (e) {
    if (e.status == 403) return false;
    rethrow;
  }
}

Map<String, dynamic> fieldFilter(String field, String op, dynamic value) =>
    {'fieldFilter': {'field': {'fieldPath': field}, 'op': op, 'value': enc(value)}};
Map<String, dynamic> isNull(String field) => {'unaryFilter': {'field': {'fieldPath': field}, 'op': 'IS_NULL'}};

/// Same shape the SDK sends for `collection(...).where(...).orderBy(...).limit(n)`.
Future<List<Map<String, dynamic>>> query(
  String token,
  String collection, {
  String parent = '',
  List<Map<String, dynamic>> where = const [],
  List<(String, bool)> orderBy = const [],
  int? limit,
}) async {
  final sq = <String, dynamic>{
    'from': [{'collectionId': collection}],
    if (where.length == 1) 'where': where.first,
    if (where.length > 1) 'where': {'compositeFilter': {'op': 'AND', 'filters': where}},
    if (orderBy.isNotEmpty)
      'orderBy': [for (final o in orderBy) {'field': {'fieldPath': o.$1}, 'direction': o.$2 ? 'DESCENDING' : 'ASCENDING'}],
    'limit': ?limit,
  };
  final url = parent.isEmpty ? '$docsRoot:runQuery' : '$docsRoot/$parent:runQuery';
  final r = await http('POST', url, json: {'structuredQuery': sq}, token: token) as List;
  return r.where((e) => (e as Map)['document'] != null).map((e) => decDoc((e as Map)['document'] as Map)).toList();
}

Future<bool> queryAllowed(Future<Object?> Function() f) async {
  try {
    await f();
    return true;
  } on HttpFail catch (e) {
    if (e.status == 403) return false;
    rethrow;
  }
}

/// `documents:commit` – what the SDK sends for update/set/add (with serverTimestamp / arrayUnion transforms).
Future<void> commit(String token, List<Map<String, dynamic>> writes) =>
    http('POST', '$fsBase/documents:commit', json: {'writes': writes}, token: token);

String docName(String path) => 'projects/$project/databases/(default)/documents/$path';

Map<String, dynamic> updateWrite(String path, Map<String, dynamic> fields,
        {List<String>? mask, List<Map<String, dynamic>> transforms = const [], bool? exists}) =>
    {
      'update': {'name': docName(path), 'fields': fields.map((k, v) => MapEntry(k, enc(v)))},
      'updateMask': ?(mask == null ? null : {'fieldPaths': mask}),
      if (transforms.isNotEmpty) 'updateTransforms': transforms,
      'currentDocument': ?(exists == null ? null : {'exists': exists}),
    };

Map<String, dynamic> serverTime(String field) => {'fieldPath': field, 'setToServerValue': 'REQUEST_TIME'};

Future<bool> writeAllowed(Future<void> Function() f) async {
  try {
    await f();
    return true;
  } on HttpFail catch (e) {
    if (e.status == 403) return false;
    rethrow;
  }
}

Future<T?> poll<T>(Future<T?> Function() f, {Duration timeout = const Duration(seconds: 40)}) async {
  final end = DateTime.now().add(timeout);
  while (DateTime.now().isBefore(end)) {
    final v = await f();
    if (v != null && v != false) return v;
    await Future<void>.delayed(const Duration(milliseconds: 600));
  }
  return null;
}

double n(dynamic v) => v is num ? v.toDouble() : double.tryParse('$v') ?? 0;

// ---------------------------------------------------------------- app queries (firebase_data_source.dart)
const availableStatuses = ['received', 'processed', 'ready_for_pickup'];
const activeStatuses = ['received', 'processed', 'shipped', 'ready_for_pickup', 'picked_up', 'out_for_delivery'];
const historyStatuses = ['delivered', 'cancelled', 'returned'];

Future<List<Map<String, dynamic>>> availableOrders(Session r) => query(r.idToken, 'orders', where: [
      fieldFilter('zone_id', 'EQUAL', r.claims['zone_id']),
      isNull('delivery_boy_id'),
      fieldFilter('status', 'IN', availableStatuses),
    ], limit: 50);

Future<List<Map<String, dynamic>>> activeOrders(Session r) => query(r.idToken, 'orders',
    where: [fieldFilter('delivery_boy_id', 'EQUAL', r.uid), fieldFilter('status', 'IN', activeStatuses)], limit: 50);

Future<List<Map<String, dynamic>>> historyOrders(Session r) => query(r.idToken, 'orders',
    where: [fieldFilter('delivery_boy_id', 'EQUAL', r.uid), fieldFilter('status', 'IN', historyStatuses)],
    orderBy: [('updated_at', true)],
    limit: 50);

// ---------------------------------------------------------------- customer: place a COD order
Future<Map<String, dynamic>> placeCodOrder(Session c, String zoneId) async {
  final zone = await getDoc('zones/$zoneId', c.idToken);
  final center = (zone?['center'] as Map?) ?? {};
  final storeId = '${zone?['default_store_id'] ?? ''}';
  final stocks = await query('owner', 'store_stocks',
      where: [fieldFilter('store_id', 'EQUAL', storeId), fieldFilter('stock', 'GREATER_THAN', 3)], limit: 30);
  Map<String, dynamic>? line;
  for (final s in stocks) {
    final p = await getDoc('products/${s['product_id']}', 'owner');
    if (p != null && p['status'] == 'active' && ['quick', 'both'].contains(p['fulfillment_type']) && p['cod_allowed'] != false) {
      line = s;
      break;
    }
  }
  if (line == null) throw StateError('no in-stock product in store $storeId');
  // enough units to pass the zone minimum order value
  final product = await getDoc('products/${line['product_id']}', 'owner');
  final variant = ((product?['variants'] as List?) ?? []).cast<Map>().where((v) => '${v['id']}' == '${line!['variant_id']}').firstOrNull;
  final price = n(line['sale_price'] ?? line['price'] ?? variant?['sale_price'] ?? variant?['price']);
  final minOrder = n(zone?['min_order']) + 50;
  final qty = price <= 0 ? 3 : (minOrder / price).ceil().clamp(1, (n(line['stock']) - 1).toInt().clamp(1, 20));
  await commit(c.idToken, [
    updateWrite('users/${c.uid}/cart/quick_${storeId}_${line['variant_id']}', {
      'product_id': line['product_id'],
      'variant_id': line['variant_id'],
      'store_id': storeId,
      'mode': 'quick',
      'qty': qty,
    }, transforms: [serverTime('added_at')]),
  ]);
  final addresses = await query(c.idToken, 'addresses', parent: 'users/${c.uid}');
  String addressId;
  final withLatLng = addresses.where((a) => a['lat'] != null).toList();
  if (withLatLng.isNotEmpty) {
    addressId = withLatLng.first['id'] as String;
  } else {
    addressId = 'smoke_delivery';
    await commit(c.idToken, [
      updateWrite('users/${c.uid}/addresses/$addressId', {
        'label': 'Smoke', 'name': 'Smoke Test', 'phone': '+919999999999', 'address_line': 'Andheri East',
        'city': 'Mumbai', 'lat': n(center['lat'] ?? 19.11), 'lng': n(center['lng'] ?? 72.86), 'is_default': false,
      }),
    ]);
  }
  final o = await call('placeOrder', c, {
    'zone_id': zoneId, 'mode': 'quick', 'address_id': addressId, 'delivery_type': 'delivery',
    'payment_method': 'cod', 'platform': 'app',
  });
  return o;
}

// ---------------------------------------------------------------- main
Future<void> main() async {
  stdout.writeln('Firebase emulators: auth $authBase · firestore $fsBase · functions $fnBase · storage $storageBase');
  try {
    await run();
  } on Object catch (e, st) {
    _failures.add('unexpected error: $e');
    stdout.writeln('ERROR $e\n$st');
  } finally {
    _client.close(force: true);
  }
  stdout.writeln('\n$_passed checks passed, ${_failures.length} failed.');
  for (final n in _notes) {
    stdout.writeln('NOTE: $n');
  }
  for (final f in _failures) {
    stdout.writeln('FAILED: $f');
  }
  exit(_failures.isEmpty ? 0 : 1);
}

Future<void> run() async {
  // ---------------------------------------------------------------- login + syncProfile
  step('Rider login + syncProfile');
  final rider = await signIn(riderEmail, riderPassword);
  final sync = await call('syncProfile', rider, {'app': 'delivery', 'language': 'en'});
  check(sync['user']?['type'] == 'delivery_boy', 'syncProfile → users/{uid}.type = delivery_boy');
  check(sync['blocked'] != true, 'rider not blocked');
  await rider.refresh(); // getIdToken(true)
  check(rider.claims['role'] == 'delivery_boy', 'ID token claim role = delivery_boy');
  final zoneId = rider.claims['zone_id'] as String?;
  check(zoneId != null && zoneId.isNotEmpty, 'ID token claim zone_id = $zoneId');
  final boy0 = await getDoc('delivery_boys/${rider.uid}', rider.idToken);
  check(boy0?['approval_status'] == 'approved', 'rider reads own delivery_boys doc (approved)');
  check(await canRead('users/${rider.uid}', rider.idToken), 'rider reads own users doc');

  // ---------------------------------------------------------------- online + location
  step('Go online + location stream');
  final online = await call('setOnline', rider, {'is_online': true});
  check(online['is_online'] == true, 'setOnline(true)');
  const lat = 19.1136, lng = 72.8697;
  await commit(rider.idToken, [
    updateWrite('delivery_boys/${rider.uid}', {'location': {'lat': lat, 'lng': lng}},
        mask: ['location'], transforms: [serverTime('location.updated_at')], exists: true),
  ]);
  final boy1 = await getDoc('delivery_boys/${rider.uid}', rider.idToken);
  final loc = boy1?['location'] as Map?;
  check(boy1?['is_online'] == true, 'delivery_boys.is_online = true');
  check(n(loc?['lat']) == lat && n(loc?['lng']) == lng && loc?['updated_at'] is DateTime,
      'location {lat,lng,updated_at:serverTimestamp} visible');
  check(
      !await writeAllowed(() => commit(rider.idToken, [
            updateWrite('delivery_boys/${rider.uid}', {'cash_in_hand': 0}, mask: ['cash_in_hand'], exists: true),
          ])),
      'rules: rider cannot write cash_in_hand');
  final cashBefore = n(boy1?['cash_in_hand']);
  final earningsBefore = n(boy1?['earnings_total']);

  // ---------------------------------------------------------------- FCM token
  step('FCM token in users/{uid}.fcm_tokens');
  const token = 'smoke-fcm-token-delivery';
  await commit(rider.idToken, [
    {
      'transform': {
        'document': docName('users/${rider.uid}'),
        'fieldTransforms': [
          {'fieldPath': 'fcm_tokens', 'appendMissingElements': {'values': [enc(token)]}},
          serverTime('updated_at'),
        ],
      },
    },
  ]);
  final u1 = await getDoc('users/${rider.uid}', rider.idToken);
  check((u1?['fcm_tokens'] as List? ?? []).contains(token), 'arrayUnion(fcm token) allowed');
  await commit(rider.idToken, [
    {
      'transform': {
        'document': docName('users/${rider.uid}'),
        'fieldTransforms': [
          {'fieldPath': 'fcm_tokens', 'removeAllFromArray': {'values': [enc(token)]}},
        ],
      },
    },
  ]);
  final walletBefore = n(u1?['wallet_balance']);

  // ---------------------------------------------------------------- customer places an order
  step('Customer places a COD order in the rider zone');
  final customer = await signIn(customerEmail, customerPassword);
  await call('syncProfile', customer, {'app': 'customer'});
  final placed = await placeCodOrder(customer, zoneId!);
  final orderId = placed['order_id'] as String;
  stdout.writeln('  placed ${placed['order_number']} ($orderId)');

  final inPool = await poll(() async => (await availableOrders(rider)).any((o) => o['id'] == orderId) ? true : null);
  check(inPool == true, 'order appears in Available (zone_id == claim, delivery_boy_id == null, status in [...])');
  final detail = await getDoc('orders/$orderId', rider.idToken);
  check(detail?['order_number'] == placed['order_number'], 'rider reads the available order detail');
  check(!await canRead('orders/$orderId/secret/otp', rider.idToken), 'rules: rider cannot read orders/{id}/secret/otp');

  // ---------------------------------------------------------------- accept → pickup → out for delivery
  step('Accept → picked_up → out_for_delivery');
  final acc = await call('acceptOrder', rider, {'order_id': orderId});
  check(acc['order']?['delivery_boy_id'] == rider.uid, 'acceptOrder');
  check((await activeOrders(rider)).any((o) => o['id'] == orderId), 'order in Active (delivery_boy_id == uid, status in active)');
  check(!(await availableOrders(rider)).any((o) => o['id'] == orderId), 'order left Available');
  final p1 = await call('updateDeliveryStatus', rider, {'order_id': orderId, 'status': 'picked_up'});
  check(p1['order']?['status'] == 'picked_up', 'updateDeliveryStatus(picked_up)');
  final p2 = await call('updateDeliveryStatus', rider, {'order_id': orderId, 'status': 'out_for_delivery'});
  check(p2['order']?['status'] == 'out_for_delivery', 'updateDeliveryStatus(out_for_delivery)');
  final tracked = await poll(() async {
    final o = await getDoc('orders/$orderId', rider.idToken);
    return o?['rider'] is Map ? o : null;
  }, timeout: const Duration(seconds: 15));
  check(tracked != null, 'orders/{id}.rider location present (accept / onDeliveryBoyLocation)');

  // ---------------------------------------------------------------- deliver
  step('Deliver with OTP');
  final otpDoc = await getDoc('orders/$orderId/secret/otp', customer.idToken);
  final otp = '${otpDoc?['delivery_otp'] ?? ''}';
  check(otp.isNotEmpty, 'customer reads orders/{id}/secret/otp');
  final wrong = otp == '000000' ? '111111' : '000000';
  try {
    await call('deliverOrder', rider, {'order_id': orderId, 'otp': wrong});
    check(false, 'wrong OTP rejected');
  } on CallableError catch (e) {
    check(e.status == 'INVALID_ARGUMENT', 'wrong OTP rejected ($e)');
  }
  final payable = n((detail?['totals'] as Map?)?['total']);
  final del = await call('deliverOrder', rider, {'order_id': orderId, 'otp': otp, 'cash_collected': payable});
  check(del['order']?['status'] == 'delivered', 'deliverOrder with the right OTP');
  check((n(del['cash_collected']) - payable).abs() < 0.01, 'COD cash_collected = ${del['cash_collected']} (payable $payable)');
  check((n(del['cash_in_hand']) - (cashBefore + payable)).abs() < 0.01, 'cash_in_hand ${del['cash_in_hand']} = before $cashBefore + payable');

  final cash = await query(rider.idToken, 'cash_collections',
      where: [fieldFilter('delivery_boy_id', 'EQUAL', rider.uid)], orderBy: [('created_at', true)], limit: 100);
  check(cash.any((c) => c['id'] == 'cod_$orderId' && c['type'] == 'collected_from_customer'), 'cash_collections/cod_{orderId} listed');

  final commission = await poll(() async {
    final e = await query(rider.idToken, 'delivery_earnings',
        where: [fieldFilter('delivery_boy_id', 'EQUAL', rider.uid)], orderBy: [('created_at', true)], limit: 200);
    final c = e.where((x) => x['id'] == 'commission_$orderId');
    return c.isEmpty ? null : c.first;
  });
  check(commission != null && n(commission['amount']) > 0, 'delivery_earnings/commission_{orderId} = ${commission?['amount']} (onOrderWritten)');
  final commissionAmount = n(commission?['amount']);

  // ---------------------------------------------------------------- dashboard / history / earnings
  step('Dashboard, history, earnings, returns');
  final now = DateTime.now();
  final today = await query(rider.idToken, 'delivery_earnings', where: [
    fieldFilter('delivery_boy_id', 'EQUAL', rider.uid),
    fieldFilter('created_at', 'GREATER_THAN_OR_EQUAL', DateTime(now.year, now.month, now.day)),
  ], orderBy: [('created_at', true)]);
  check(today.any((e) => e['id'] == 'commission_$orderId'), "today's earnings query includes the commission");
  final delivered = await query(rider.idToken, 'orders',
      where: [fieldFilter('delivery_boy_id', 'EQUAL', rider.uid), fieldFilter('status', 'EQUAL', 'delivered')],
      orderBy: [('updated_at', true)],
      limit: 100);
  check(delivered.any((o) => o['id'] == orderId), 'delivered-today query includes the order');
  check((await historyOrders(rider)).any((o) => o['id'] == orderId), 'History (status in [delivered,cancelled,returned]) includes the order');
  final boy2 = await getDoc('delivery_boys/${rider.uid}', rider.idToken);
  check((n(boy2?['earnings_total']) - (earningsBefore + commissionAmount)).abs() < 0.01, 'earnings_total incremented');
  check(
      await queryAllowed(() => query(rider.idToken, 'return_requests',
          where: [
            fieldFilter('delivery_boy_id', 'EQUAL', rider.uid),
            fieldFilter('status', 'IN', ['pickup_assigned', 'picked_up', 'refund_completed']),
          ],
          orderBy: [('created_at', true)],
          limit: 50)),
      'return pickups query allowed');
  check(
      !await queryAllowed(() => query(rider.idToken, 'orders', where: [fieldFilter('status', 'EQUAL', 'delivered')], limit: 5)),
      'rules: rider cannot list other orders');
  try {
    final inv = await call('getInvoiceUrl', rider, {'order_id': orderId});
    check('${inv['url']}'.startsWith('http'), 'getInvoiceUrl for the delivered order');
  } on CallableError catch (e) {
    note('getInvoiceUrl is not allowed for the assigned rider ($e) – the app shows the in-app invoice instead');
  }

  // ---------------------------------------------------------------- wallet
  step('Wallet + withdraw');
  final u2 = await getDoc('users/${rider.uid}', rider.idToken);
  check((n(u2?['wallet_balance']) - (walletBefore + commissionAmount)).abs() < 0.01,
      'commission credited to users/{uid}.wallet_balance (${u2?['wallet_balance']})');
  final txns = await query(rider.idToken, 'wallet_transactions', parent: 'users/${rider.uid}', orderBy: [('created_at', true)], limit: 50);
  check(txns.any((t) => '${t['id']}'.contains('commission_$orderId') || t['order_id'] == orderId), 'wallet_transactions lists the commission credit');
  final settings = await getDoc('settings/public', rider.idToken);
  final minWithdraw = n((settings?['wallet'] as Map?)?['min_withdraw'] ?? 100);
  final amount = minWithdraw <= 0 ? 100.0 : minWithdraw;
  final pendingW = await query(rider.idToken, 'withdrawal_requests',
      where: [fieldFilter('user_id', 'EQUAL', rider.uid)], orderBy: [('created_at', true)], limit: 50);
  final pendingList = pendingW.where((w) => w['status'] == 'pending').toList();
  if (pendingList.length >= 3) {
    // walletWithdraw allows at most 3 pending requests: let the admin panel process the oldest one.
    final admin = await signIn('admin@gmail.com', '123456');
    await call('syncProfile', admin, {'app': 'customer'}).catchError((_) => <String, dynamic>{});
    await admin.refresh();
    await call('processWithdrawal', admin, {'id': pendingList.last['id'], 'approve': true, 'remark': 'smoke test payout'});
    note('processed withdrawal ${pendingList.last['id']} as admin@gmail.com (the rider had 3 pending requests)');
  }
  {
    final w = await call('walletWithdraw', rider, {'amount': amount, 'message': 'smoke test'});
    check(w['status'] == 'pending', 'walletWithdraw($amount)');
    final ws = await query(rider.idToken, 'withdrawal_requests',
        where: [fieldFilter('user_id', 'EQUAL', rider.uid)], orderBy: [('created_at', true)], limit: 50);
    check(ws.any((x) => x['id'] == w['id'] && x['user_type'] == 'delivery_boy'), 'withdrawal_requests lists the request');
    final u3 = await getDoc('users/${rider.uid}', rider.idToken);
    check((n(u3?['wallet_balance']) - (n(u2?['wallet_balance']) - amount)).abs() < 0.01, 'wallet debited by the withdrawal');
  }

  // ---------------------------------------------------------------- notifications
  step('Notifications');
  final notifs = await query(rider.idToken, 'notifications', parent: 'users/${rider.uid}', orderBy: [('created_at', true)], limit: 50);
  check(true, 'notifications query allowed (${notifs.length} docs)');
  if (notifs.isNotEmpty) {
    final id = notifs.first['id'];
    check(
        await writeAllowed(() => commit(rider.idToken, [
              {
                'transform': {
                  'document': docName('users/${rider.uid}/notifications/$id'),
                  'fieldTransforms': [serverTime('read_at')],
                },
              },
            ])),
        'mark notification read (read_at only)');
    check(
        !await writeAllowed(() => commit(rider.idToken, [
              updateWrite('users/${rider.uid}/notifications/$id', {'title': 'x'}, mask: ['title'], exists: true),
            ])),
        'rules: notification title is read-only');
  }

  // ---------------------------------------------------------------- support chat
  step('Support chat');
  final chatId = 'smoke_${DateTime.now().millisecondsSinceEpoch}';
  await commit(rider.idToken, [
    updateWrite('chats/$chatId', {
      'user_id': rider.uid, 'user_uid': rider.uid, 'user_type': 'delivery_boy', 'user_name': 'Alex Johnson',
      'order_id': orderId, 'order_number': placed['order_number'], 'subject': 'Order ${placed['order_number']}',
      'status': 'open', 'last_message': null, 'last_message_at': null, 'unread_admin': 0, 'unread_user': 0,
    }, transforms: [serverTime('created_at')], exists: false),
  ]);
  check(true, 'rider creates chats/{id} (whitelisted fields)');
  await commit(rider.idToken, [
    updateWrite('chats/$chatId/messages/m1', {
      'user_uid': rider.uid, 'sender_id': rider.uid, 'sender_type': 'delivery_boy', 'sender_name': 'Alex Johnson',
      'message': 'Customer not answering the door', 'attachment': null, 'read_at': null,
    }, transforms: [serverTime('created_at')], exists: false),
  ]);
  check(true, 'rider creates a message (sender_id == uid)');
  final msgs = await query(rider.idToken, 'messages',
      parent: 'chats/$chatId', where: [fieldFilter('user_uid', 'EQUAL', rider.uid)], orderBy: [('created_at', false)], limit: 300);
  check(msgs.length == 1 && msgs.first['message'] == 'Customer not answering the door', 'messages query (user_uid == uid, orderBy created_at)');
  final chats = await query(rider.idToken, 'chats', where: [fieldFilter('user_uid', 'EQUAL', rider.uid)]);
  check(chats.any((c) => c['id'] == chatId), 'chats query (user_uid == uid) lists the thread');
  final summary = await poll(() async {
    final c = await getDoc('chats/$chatId', rider.idToken);
    return c?['last_message'] is Map ? c : null;
  }, timeout: const Duration(seconds: 20));
  check(summary != null && n(summary['unread_admin']) >= 1, 'onChatMessageCreated updated last_message / unread_admin');
  check(
      !await writeAllowed(() => commit(rider.idToken, [
            updateWrite('chats/$chatId/messages/m2', {
              'user_uid': rider.uid, 'sender_id': rider.uid, 'sender_type': 'admin', 'sender_name': 'Fake admin',
              'message': 'spoof', 'attachment': null, 'read_at': null,
            }, exists: false),
          ])),
      'rules: rider cannot post as admin');

  // ---------------------------------------------------------------- reject flow
  step('Reject flow');
  final second = await placeCodOrder(customer, zoneId);
  final secondId = second['order_id'] as String;
  check(await poll(() async => (await availableOrders(rider)).any((o) => o['id'] == secondId) ? true : null) == true,
      'second order in Available');
  await call('rejectOrder', rider, {'order_id': secondId, 'reason': 'smoke test'});
  final rejected = (await availableOrders(rider)).where((o) => o['id'] == secondId);
  check(rejected.isNotEmpty && (rejected.first['rejected_by'] as List? ?? []).contains(rider.uid),
      'rejectOrder → rejected_by contains uid (the app hides it from this rider)');
  await call('cancelOrder', customer, {'order_id': secondId, 'reason': 'smoke test cleanup'});

  final off = await call('setOnline', rider, {'is_online': false});
  check(off['is_online'] == false, 'setOnline(false)');

  // ---------------------------------------------------------------- registration of a new rider
  step('Registration (not registered → pending)');
  final email = 'smoke.rider.${DateTime.now().millisecondsSinceEpoch}@example.com';
  final fresh = await signUp(email, 'Smoke@1234');
  final s1 = await call('syncProfile', fresh, {'app': 'delivery', 'name': 'Smoke Rider'});
  check(s1['is_new'] == true, 'syncProfile creates users/{uid} for a new delivery login');
  await fresh.refresh();
  check(await getDoc('delivery_boys/${fresh.uid}', fresh.idToken) == null, 'no delivery_boys doc → app opens the registration stepper');
  final path = 'delivery_docs/${fresh.uid}/driving_license_1.png';
  final png = base64Decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');
  await http('POST', '$storageBase/v0/b/$bucket/o?name=${Uri.encodeComponent(path)}', bytes: png, contentType: 'image/png', token: fresh.idToken);
  check(true, 'upload to Storage $path');
  try {
    await http('POST', '$storageBase/v0/b/$bucket/o?name=${Uri.encodeComponent('delivery_docs/${rider.uid}/x.png')}',
        bytes: png, contentType: 'image/png', token: fresh.idToken);
    check(false, 'storage rules: cannot upload into another rider folder');
  } on HttpFail catch (e) {
    check(e.status == 403, 'storage rules: cannot upload into another rider folder');
  }
  final reg = await call('registerDeliveryBoy', fresh, {
    'name': 'Smoke Rider', 'phone': '+919800000001', 'dob': '1999-01-01', 'country_id': boy0?['country_id'], 'zone_id': zoneId,
    'address': 'Andheri', 'vehicle_type': 'Bike', 'vehicle_number': 'MH01AA0001',
    'driving_license': path, 'id_proof': path, 'bank': {'name': 'HDFC', 'account': '1234567890', 'ifsc': 'HDFC0000001'},
  });
  check(reg['approval_status'] == 'pending', 'registerDeliveryBoy → pending');
  await fresh.refresh();
  check(fresh.claims['role'] == 'delivery_boy' && fresh.claims['zone_id'] == null, 'claims after refresh: role delivery_boy, no zone yet');
  final pendingBoy = await getDoc('delivery_boys/${fresh.uid}', fresh.idToken);
  check(pendingBoy?['approval_status'] == 'pending' && pendingBoy?['driving_license'] == path, 'pending rider reads own profile');
  try {
    await call('setOnline', fresh, {'is_online': true});
    check(false, 'pending rider cannot go online');
  } on CallableError catch (e) {
    check(e.status == 'PERMISSION_DENIED', 'pending rider cannot go online ($e)');
  }
}
