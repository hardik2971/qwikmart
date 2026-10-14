import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart' hide Order;
import 'package:firebase_storage/firebase_storage.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/errors.dart';
import '../../core/firebase.dart';
import '../../models/models.dart';
import '../repositories.dart';
import 'fs_json.dart';

/// Uploads [files] to `users/{uid}/{folder}/…` (≤ 5 MB images, see storage.rules). Returns storage paths
/// and download URLs.
Future<List<({String path, String url})>> uploadUserImages(String folder, List<XFile> files) async {
  final uid = Fb.uid;
  final out = <({String path, String url})>[];
  final stamp = DateTime.now().millisecondsSinceEpoch;
  for (final (i, f) in files.indexed) {
    final name = f.name.toLowerCase();
    final ext = name.endsWith('.png') ? 'png' : name.endsWith('.webp') ? 'webp' : 'jpg';
    final type = f.mimeType ?? (ext == 'png' ? 'image/png' : ext == 'webp' ? 'image/webp' : 'image/jpeg');
    final path = 'users/$uid/$folder/${stamp}_$i.$ext';
    final ref = Fb.storage.ref(path);
    await ref.putData(await f.readAsBytes(), SettableMetadata(contentType: type));
    out.add((path: path, url: await ref.getDownloadURL()));
  }
  return out;
}

/// Cart lines live in `users/{uid}/cart/{mode}_{storeId|central}_{variantId}`; prices always come from the
/// `cartSummary` callable (re-run whenever the lines change).
class FirebaseCartRepository implements CartRepository {
  final ScopeReader scope;
  FirebaseCartRepository(this.scope);

  CollectionReference<Map<String, dynamic>> _lines(String uid) => Fb.db.collection('users/$uid/cart');

  Map<String, dynamic> _args({String? promoCode, String? addressId}) {
    final s = scope();
    return {
      'zone_id': s.zoneId,
      'mode': s.mode,
      'promo_code': (promoCode == null || promoCode.isEmpty) ? null : promoCode,
      if (addressId != null && addressId.isNotEmpty) 'address_id': addressId,
      'lang': s.lang,
      'platform': 'app',
    };
  }

  @override
  Future<Cart> summary({String? promoCode, String? addressId}) async {
    if (Fb.auth.currentUser == null) return Cart.empty;
    return Cart.fromJson(await Fb.callMap('cartSummary', _args(promoCode: promoCode, addressId: addressId)));
  }

  @override
  Future<void> setLine({required String productId, required String variantId, required int qty, String? lineId}) =>
      guard(() async {
        final s = scope();
        final storeId = s.isQuick && s.storeId.isNotEmpty ? s.storeId : null;
        final id = lineId ?? '${s.mode}_${storeId ?? 'central'}_$variantId';
        final ref = _lines(Fb.uid).doc(id);
        if (qty <= 0) {
          await ref.delete();
          return;
        }
        if (lineId != null) {
          await ref.update({'qty': qty.clamp(1, 100), 'updated_at': FieldValue.serverTimestamp()});
        } else {
          await ref.set({
            'product_id': productId,
            'variant_id': variantId,
            'store_id': storeId,
            'mode': s.mode,
            'qty': qty.clamp(1, 100),
            'added_at': FieldValue.serverTimestamp(),
            'updated_at': FieldValue.serverTimestamp(),
          });
        }
      });

  @override
  Future<void> clear() => guard(() async {
        final snap = await _lines(Fb.uid).where('mode', isEqualTo: scope().mode).get();
        final batch = Fb.db.batch();
        for (final d in snap.docs) {
          batch.delete(d.reference);
        }
        await batch.commit();
      });

  @override
  Stream<void> changes() {
    final u = Fb.auth.currentUser;
    if (u == null) return const Stream.empty();
    String? last;
    return _lines(u.uid)
        .where('mode', isEqualTo: scope().mode)
        .snapshots()
        .where((s) => !s.metadata.hasPendingWrites)
        .map((s) => (s.docs.map((d) => '${d.id}:${d.data()['qty']}').toList()..sort()).join(','))
        .where((sig) {
          // The first snapshot is the state the caller already priced.
          final changed = last != null && sig != last;
          last = sig;
          return changed;
        })
        .map((_) {});
  }

  @override
  Future<List<Coupon>> coupons({double subtotal = 0}) => guard(() async {
        final s = scope();
        final r = await Fb.call('listCoupons', {'zone_id': s.zoneId, 'mode': s.mode, 'lang': s.lang, 'platform': 'app'});
        return asMapList(r).map((j) => Coupon.fromJson(j).withSubtotal(subtotal)).toList();
      });

  @override
  Future<AppliedPromo> applyCoupon(String code) => guard(() async {
        final r = await Fb.callMap('cartSummary', _args(promoCode: code));
        final promo = asMapOrNull(r['promo']);
        if (promo == null) {
          final err = asString(r['promo_error']);
          throw AppException(err.isEmpty ? 'This coupon cannot be applied' : err, code: 'failed-precondition');
        }
        return AppliedPromo.fromJson(promo);
      });
}

class FirebaseOrderRepository implements OrderRepository {
  final ScopeReader scope;
  FirebaseOrderRepository(this.scope);

  FirebaseFirestore get _db => Fb.db;

  @override
  Future<PlaceOrderResult> place({
    required String? addressId,
    required String deliveryType,
    required String paymentMethod,
    String? promoCode,
    bool useWallet = false,
    String? notes,
  }) =>
      guard(() async {
        final s = scope();
        final r = await Fb.callMap('placeOrder', {
          'zone_id': s.zoneId,
          'mode': s.mode,
          'address_id': deliveryType == 'delivery' ? addressId : null,
          'delivery_type': deliveryType,
          'payment_method': paymentMethod,
          'promo_code': (promoCode == null || promoCode.isEmpty) ? null : promoCode,
          'use_wallet': useWallet,
          'notes': notes,
          'platform': 'app',
          'lang': s.lang,
        });
        return PlaceOrderResult(asId(r['order_id']), asString(r['order_number']), asMapOrNull(r['payment']));
      });

  @override
  Future<void> verifyPayment(String orderId, String gateway, Map<String, dynamic> payload) =>
      guard(() => Fb.call('verifyPayment', {'order_id': orderId, 'gateway': gateway, 'payload': payload}));

  static const _activeStatuses = ['received', 'processed', 'shipped', 'ready_for_pickup', 'picked_up', 'out_for_delivery'];

  @override
  Future<List<Order>> list({String status = ''}) => guard(() async {
        Query<Map<String, dynamic>> q = _db.collection('orders').where('user_id', isEqualTo: Fb.uid);
        if (status == 'active') {
          q = q.where('status', whereIn: _activeStatuses);
        } else if (status.isNotEmpty && status != 'all') {
          q = q.where('status', isEqualTo: status);
        }
        final snap = await q.orderBy('created_at', descending: true).limit(50).get();
        return snap.docs.map(docJson).map(Order.fromJson).toList();
      });

  Future<String> _otp(String id) async {
    try {
      final d = await _db.doc('orders/$id/secret/otp').get();
      return asString(d.data()?['delivery_otp']);
    } catch (_) {
      return '';
    }
  }

  final Map<String, Map<String, dynamic>> _stores = {};

  Future<Map<String, dynamic>?> _store(String storeId) async {
    if (storeId.isEmpty) return null;
    if (_stores.containsKey(storeId)) return _stores[storeId];
    try {
      final d = await _db.doc('stores/$storeId').get();
      if (!d.exists) return null;
      final j = docJson(d);
      return _stores[storeId] = {
        'id': storeId,
        'name': j['name'],
        'phone': j['phone'],
        'address': j['address'],
        'lat': j['lat'],
        'lng': j['lng'],
      };
    } catch (_) {
      return null;
    }
  }

  Future<Order> _build(DocumentSnapshot<Map<String, dynamic>> d, {String? otp}) async {
    final j = docJson(d);
    if (asString(j['user_id']) != Fb.uid) throw const AppException('Order not found', code: 'not-found');
    final store = await _store(asId(j['store_id']));
    final order = Order.fromJson({...j, 'store': ?store});
    final status = order.status;
    final needsOtp = order.isActive || status == 'payment_pending';
    if (!needsOtp) return order;
    return order.withOtp(otp ?? await _otp(d.id));
  }

  @override
  Future<Order> detail(String id) => guard(() async {
        final d = await _db.doc('orders/$id').get();
        if (!d.exists) throw const AppException('Order not found', code: 'not-found');
        return _build(d);
      });

  @override
  Stream<Order> watch(String id) {
    String? otp;
    return _db.doc('orders/$id').snapshots().asyncMap((d) async {
      if (!d.exists) throw const AppException('Order not found', code: 'not-found');
      final o = await _build(d, otp: (otp?.isEmpty ?? true) ? null : otp);
      if (o.deliveryOtp.isNotEmpty) otp = o.deliveryOtp;
      return o;
    }).handleError((Object e) => throw AppException.from(e));
  }

  @override
  Stream<TrackInfo> track(String id) => watch(id).map(TrackInfo.fromOrder);

  @override
  Future<void> cancel(String id, String reason) => guard(() => Fb.call('cancelOrder', {'order_id': id, 'reason': reason}));

  @override
  Future<String> reorder(String id) => guard(() async {
        final s = scope();
        final r = await Fb.callMap('reorder', {'order_id': id, 'zone_id': s.zoneId, 'mode': s.mode});
        final added = asInt(r['added']);
        final skipped = asStringList(r['skipped']);
        if (added == 0) {
          throw AppException(skipped.isEmpty ? 'No items could be added' : 'Unavailable: ${skipped.join(', ')}',
              code: 'failed-precondition');
        }
        return skipped.isEmpty ? '' : '$added added · unavailable: ${skipped.join(', ')}';
      });

  @override
  Future<String> invoiceUrl(String id) => guard(() async {
        final r = await Fb.callMap('getInvoiceUrl', {'order_id': id});
        return asString(r['url']);
      });

  @override
  Future<String> requestReturn({
    required String orderId,
    required String variantId,
    required int qty,
    required String reason,
    List<XFile> images = const [],
  }) =>
      guard(() async {
        final uploaded = images.isEmpty ? const <({String path, String url})>[] : await uploadUserImages('returns/$orderId', images);
        final r = await Fb.callMap('requestReturn', {
          'order_id': orderId,
          'variant_id': variantId,
          'qty': qty,
          'reason': reason,
          'images': uploaded.map((u) => u.path).toList(),
        });
        return 'Return request ${asString(r['return_number'])} submitted';
      });

  @override
  Future<List<ReturnRequest>> returns() => guard(() async {
        final snap = await _db
            .collection('return_requests')
            .where('user_id', isEqualTo: Fb.uid)
            .orderBy('created_at', descending: true)
            .limit(50)
            .get();
        return snap.docs.map(docJson).map(ReturnRequest.fromJson).toList();
      });

  @override
  Future<String> review({
    required String orderId,
    required String variantId,
    required String productId,
    required int rating,
    required String comment,
    List<XFile> images = const [],
  }) =>
      guard(() async {
        // Reviews are public: pass download URLs (user folders are owner-read only in storage.rules).
        final uploaded = images.isEmpty ? const <({String path, String url})>[] : await uploadUserImages('reviews', images);
        await Fb.call('submitReview', {
          'order_id': orderId,
          'variant_id': variantId,
          'rating': rating,
          'comment': comment,
          'images': uploaded.map((u) => u.url).toList(),
        });
        return '';
      });
}
