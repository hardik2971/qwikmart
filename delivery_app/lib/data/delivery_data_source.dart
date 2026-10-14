import '../models/models.dart';

class DeliverResult {
  DeliverResult({required this.order, this.earning = 0, this.cashCollected = 0, this.cashInHand});
  final DeliveryOrder order;
  final double earning;
  final double cashCollected;
  final double? cashInHand;
}

/// Outcome of the post-sign-in profile sync (`syncProfile({app:'delivery'})` + `delivery_boys/{uid}`).
class SessionResult {
  SessionResult.registered(DeliveryProfile this.profile) : notRegistered = false;
  SessionResult.notRegistered() : profile = null, notRegistered = true;

  final DeliveryProfile? profile;

  /// Signed in, but there is no `delivery_boys/{uid}` document yet → registration stepper.
  final bool notRegistered;
}

/// Contract implemented by the Firebase backend ([FirebaseDataSource]) and the in-memory demo
/// backend ([MockDataSource]). Every "watch" stream is realtime (Firestore snapshots).
///
/// Sign-in, sign-up, password reset and password change happen in Firebase Authentication
/// (`core/auth_service.dart`); the data source then syncs the profile / registers the rider.
abstract class DeliveryDataSource {
  // auth
  /// Right after sign-in: `syncProfile({app:'delivery', fcm_token})`, refreshes the ID token
  /// (claims) and reads the rider profile. Throws [AppException] for blocked / panel accounts.
  Future<SessionResult> session({String? fcmToken});

  /// Uploads the documents and calls `registerDeliveryBoy` (the Firebase account already exists).
  Future<DeliveryProfile> register(RegistrationData data, {String? fcmToken});
  Future<void> logout({String? fcmToken});

  /// Permanently deletes the rider account (`deleteAccount` callable). Fails while orders are active or cash is unsettled.
  Future<void> deleteAccount();

  // profile
  Future<DeliveryProfile> getProfile();
  Stream<DeliveryProfile> watchProfile();
  Future<DeliveryProfile> updateProfile(Map<String, dynamic> fields);
  Future<List<Country>> getCountries();
  Future<List<Zone>> getZones(String countryId);

  // presence
  Future<void> setOnline(bool online);
  Future<void> sendLocation(double lat, double lng);
  Future<void> saveFcmToken(String token);

  // orders
  Stream<Dashboard> watchDashboard();

  /// `type` = available | active | history.
  Stream<List<DeliveryOrder>> watchOrders(String type);
  Stream<DeliveryOrder> watchOrder(String id);
  Future<DeliveryOrder> acceptOrder(String id);
  Future<void> rejectOrder(String id);
  Future<DeliveryOrder> updateStatus(String id, String status);
  Future<DeliverResult> deliver(String id, String otp, {double? cashCollected});

  /// URL of the invoice PDF (`getInvoiceUrl`); null when not available.
  Future<String?> invoiceUrl(String orderId);

  // returns
  Stream<List<ReturnPickup>> watchReturns();
  Future<void> markReturnPickedUp(String id);

  // money
  Stream<EarningsSummary> watchEarnings();
  Stream<CashSummary> watchCashCollections();
  Stream<WalletSummary> watchWallet();
  Future<void> withdraw(double amount, String? message);

  /// `settings/public.wallet.min_withdraw` (the `walletWithdraw` minimum, default 100).
  Future<double> minWithdraw();

  /// `settings/public.demo_mode` – the login screen offers the demo credentials only then.
  Future<bool> demoModeEnabled();

  // chat + notifications
  Future<ChatThread> openSupportChat();
  Future<ChatThread> openOrderChat(String orderId, String subject);
  Stream<List<ChatMessage>> watchMessages(String chatId);

  /// Sends [message] in [thread]; a draft thread is created first. Returns the thread id.
  Future<String> sendMessage(ChatThread thread, String message);
  Stream<List<AppNotification>> watchNotifications();
  Future<void> markAllNotificationsRead();
}
