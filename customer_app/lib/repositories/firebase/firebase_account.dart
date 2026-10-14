import 'package:cloud_firestore/cloud_firestore.dart' hide Order;
import 'package:image_picker/image_picker.dart';

import '../../core/errors.dart';
import '../../core/firebase.dart';
import '../../models/models.dart';
import '../repositories.dart';
import 'fs_json.dart';

/// Settings / geography (public reads), profile (`users/{uid}` whitelisted fields), addresses, favourites,
/// wallet, referral and notifications — Firestore + the account / wallet callables.
class FirebaseAccountRepository extends AccountRepository {
  final ScopeReader scope;
  FirebaseAccountRepository(this.scope);

  FirebaseFirestore get _db => Fb.db;
  DocumentReference<Map<String, dynamic>> get _me => _db.doc('users/${Fb.uid}');

  // ------------------------------------------------------------------ settings & geography

  @override
  Future<AppSettings> settings() => guard(() async {
        final d = await _db.doc('settings/public').get();
        return AppSettings.fromJson(docJson(d));
      });

  @override
  Future<List<Country>> countries() => guard(() async {
        final snap = await _db.collection('countries').where('status', isEqualTo: 'active').get();
        final list = snap.docs.map(docJson).map(Country.fromJson).toList()
          ..sort((a, b) => (b.isDefault ? 1 : 0).compareTo(a.isDefault ? 1 : 0));
        return list;
      });

  @override
  Future<List<Zone>> zones({String? countryId}) => guard(() async {
        Query<Map<String, dynamic>> q = _db.collection('zones').where('status', isEqualTo: 'active');
        if (countryId != null && countryId.isNotEmpty) q = q.where('country_id', isEqualTo: countryId);
        final snap = await q.get();
        return snap.docs.map(docJson).map(Zone.fromJson).toList()..sort((a, b) => a.name.compareTo(b.name));
      });

  @override
  Future<ZoneDetectResult> detectZone(double lat, double lng) => guard(() async {
        final r = await Fb.callMap('detectZone', {'lat': lat, 'lng': lng, 'mode': scope().mode});
        return ZoneDetectResult.fromJson(r);
      });

  // ------------------------------------------------------------------ profile

  @override
  Future<AuthResult> syncProfile({String? name, String? email, String? referralCode, String? fcmToken, String? language}) =>
      guard(() async {
        final r = await Fb.callMap('syncProfile', {
          'name': (name?.isEmpty ?? true) ? null : name,
          'email': (email?.isEmpty ?? true) ? null : email,
          'referral_code': (referralCode?.isEmpty ?? true) ? null : referralCode,
          'fcm_token': fcmToken,
          'language': language,
          'app': 'customer',
        });
        return AuthResult.fromJson(r);
      });

  @override
  Future<void> mergeGuestCart(String guestUid) => guard(() => Fb.call('mergeGuestCart', {'guest_uid': guestUid}));

  @override
  Future<AppUser> profile() => guard(() async {
        final d = await _me.get();
        if (!d.exists) throw const AppException.unauthenticated();
        return AppUser.fromJson(docJson(d));
      });

  @override
  Future<AppUser> updateProfile({String? name, String? email, XFile? avatar}) => guard(() async {
        final current = await profile();
        final patch = <String, dynamic>{};
        if (name != null && name.trim().isNotEmpty && name.trim() != current.name) patch['name'] = name.trim();
        if (avatar != null) {
          // users/{uid}/avatar/** is publicly readable (storage.rules); store the download URL.
          final up = await uploadUserImages('avatar', [avatar]);
          patch['avatar'] = up.first.url;
        }
        if (patch.isNotEmpty) {
          patch['updated_at'] = FieldValue.serverTimestamp();
          await _me.update(patch);
        }
        final e = email?.trim() ?? '';
        if (e.isNotEmpty && e.toLowerCase() != current.email.toLowerCase()) {
          if (current.email.isNotEmpty) {
            throw const AppException('Your email address cannot be changed here.', code: 'failed-precondition');
          }
          // Only the backend may set the email; syncProfile fills it when the profile has none.
          await syncProfile(email: e);
        }
        return profile();
      });

  @override
  Future<void> registerFcmToken(String token) => guard(() async {
        await _me.update({'fcm_tokens': FieldValue.arrayUnion([token]), 'updated_at': FieldValue.serverTimestamp()});
      });

  @override
  Future<void> logout({String? fcmToken}) async {
    if (fcmToken == null || fcmToken.isEmpty || Fb.auth.currentUser == null) return;
    try {
      await _me.update({'fcm_tokens': FieldValue.arrayRemove([fcmToken]), 'updated_at': FieldValue.serverTimestamp()});
    } catch (_) {}
  }

  @override
  Future<void> deleteAccount() => guard(() => Fb.call('deleteAccount'));

  // ------------------------------------------------------------------ addresses

  CollectionReference<Map<String, dynamic>> get _addresses => _me.collection('addresses');

  @override
  Future<List<Address>> addresses() => guard(() async {
        final snap = await _addresses.get();
        final list = snap.docs.map(docJson).map(Address.fromJson).toList()
          ..sort((a, b) => (b.isDefault ? 1 : 0).compareTo(a.isDefault ? 1 : 0));
        return list;
      });

  @override
  Future<Address> saveAddress(Address a) => guard(() async {
        if (a.lat == null || a.lng == null) {
          throw const AppException('Please pin the address on the map', code: 'invalid-argument');
        }
        final data = <String, dynamic>{
          'label': a.label,
          'name': a.name,
          'phone': a.phone,
          'address_line': a.addressLine,
          'landmark': a.landmark,
          'city': a.city,
          'state': a.state,
          'pincode': a.pincode,
          'lat': a.lat,
          'lng': a.lng,
          'is_default': a.isDefault,
          'updated_at': FieldValue.serverTimestamp(),
        };
        final ref = a.id.isEmpty ? _addresses.doc() : _addresses.doc(a.id);
        final batch = _db.batch();
        if (a.isDefault) {
          // Only one default address.
          final others = await _addresses.where('is_default', isEqualTo: true).get();
          for (final d in others.docs.where((d) => d.id != ref.id)) {
            batch.update(d.reference, {'is_default': false, 'updated_at': FieldValue.serverTimestamp()});
          }
        }
        if (a.id.isEmpty) {
          batch.set(ref, {...data, 'created_at': FieldValue.serverTimestamp()});
        } else {
          batch.set(ref, data, SetOptions(merge: true));
        }
        await batch.commit();
        return Address.fromJson(docJson(await ref.get()));
      });

  @override
  Future<void> deleteAddress(String id) => guard(() => _addresses.doc(id).delete());

  // ------------------------------------------------------------------ favourites

  CollectionReference<Map<String, dynamic>> get _favorites => _me.collection('favorites');

  @override
  Future<List<Product>> favorites() => guard(() async {
        final snap = await _favorites.orderBy('created_at', descending: true).limit(100).get();
        final s = scope();
        final docs = await Future.wait(snap.docs.map((f) => _db.doc('products/${f.id}').get().then<DocumentSnapshot<Map<String, dynamic>>?>(
            (d) => d,
            onError: (Object _) => null)));
        return docs
            .whereType<DocumentSnapshot<Map<String, dynamic>>>()
            .where((d) => d.exists)
            .map((d) => Product.fromJson({...productJson(d.id, docJson(d), lang: s.lang), 'is_favorite': true}))
            .toList();
      });

  @override
  Future<void> addFavorite(String productId) =>
      guard(() => _favorites.doc(productId).set({'created_at': FieldValue.serverTimestamp()}));

  @override
  Future<void> removeFavorite(String productId) => guard(() => _favorites.doc(productId).delete());

  // ------------------------------------------------------------------ wallet

  @override
  Future<WalletData> wallet() => guard(() async {
        final uid = Fb.uid;
        final results = await Future.wait([
          _me.get(),
          _me.collection('wallet_transactions').orderBy('created_at', descending: true).limit(100).get(),
          _db
              .collection('withdrawal_requests')
              .where('user_id', isEqualTo: uid)
              .orderBy('created_at', descending: true)
              .limit(20)
              .get(),
        ]);
        final user = results[0] as DocumentSnapshot<Map<String, dynamic>>;
        final txns = results[1] as QuerySnapshot<Map<String, dynamic>>;
        final withdrawals = results[2] as QuerySnapshot<Map<String, dynamic>>;
        return WalletData(
          balance: asDouble(user.data()?['wallet_balance']),
          transactions: txns.docs.map(docJson).map(WalletTxn.fromJson).toList(),
          withdrawals: withdrawals.docs.map(docJson).map(WithdrawalRequest.fromJson).toList(),
        );
      });

  @override
  Future<Map<String, dynamic>> rechargeWallet(double amount, String method) =>
      guard(() => Fb.callMap('walletRecharge', {'amount': amount, 'gateway': method}));

  @override
  Future<String> verifyRecharge(String rechargeId, Map<String, dynamic> payload) => guard(() async {
        final r = await Fb.callMap('verifyWalletRecharge', {'recharge_id': rechargeId, 'payload': payload});
        return asString(r['message'], 'Wallet recharged');
      });

  @override
  Future<String> withdraw(double amount, String message) => guard(() async {
        await Fb.call('walletWithdraw', {'amount': amount, 'message': message.isEmpty ? null : message});
        return 'Withdrawal request submitted';
      });

  // ------------------------------------------------------------------ referral

  @override
  Future<ReferralInfo> referral() => guard(() async {
        final results = await Future.wait([
          _me.get(),
          _db.doc('settings/public').get(),
          _db
              .collection('referrals')
              .where('referrer_id', isEqualTo: Fb.uid)
              .orderBy('created_at', descending: true)
              .limit(50)
              .get(),
        ]);
        final user = (results[0] as DocumentSnapshot<Map<String, dynamic>>).data() ?? const {};
        final cfg = asMap((results[1] as DocumentSnapshot<Map<String, dynamic>>).data()?['referral']);
        final refs = (results[2] as QuerySnapshot<Map<String, dynamic>>).docs.map(docJson).toList();
        final earned = refs
            .where((r) => r['status'] == 'credited')
            .fold<double>(0, (s, r) => s + asDouble(r['referrer_reward']));
        return ReferralInfo.fromJson({
          'code': user['referral_code'],
          'referrer_reward': cfg['referrer_reward'],
          'referred_reward': cfg['referred_reward'],
          'min_order': cfg['min_order'],
          'total_earned': earned,
          'referrals': refs.map((r) => {...r, 'name': r['referred_name']}).toList(),
        });
      });

  // ------------------------------------------------------------------ notifications

  CollectionReference<Map<String, dynamic>> get _notifications => _me.collection('notifications');

  @override
  Future<List<AppNotification>> notifications() => guard(() async {
        final snap = await _notifications.orderBy('created_at', descending: true).limit(50).get();
        return snap.docs.map(docJson).map(AppNotification.fromJson).toList();
      });

  @override
  Future<void> readAllNotifications() => guard(() async {
        // `read_at == null` docs among the latest ones (owner may only change read_at).
        final snap = await _notifications.where('read_at', isNull: true).limit(200).get();
        if (snap.docs.isEmpty) return;
        final batch = _db.batch();
        for (final d in snap.docs) {
          batch.update(d.reference, {'read_at': FieldValue.serverTimestamp()});
        }
        await batch.commit();
      });

  @override
  Future<void> readNotification(String id) =>
      guard(() => _notifications.doc(id).update({'read_at': FieldValue.serverTimestamp()}));
}
