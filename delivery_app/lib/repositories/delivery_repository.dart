import '../core/config.dart';
import '../data/delivery_data_source.dart';
import '../data/firebase/firebase_data_source.dart';
import '../data/mock/mock_data_source.dart';
import '../models/models.dart';

/// Single entry point used by providers. Routes every call to Firebase ([FirebaseDataSource]) or,
/// in the offline demo ([DemoMode] – `USE_MOCK=true`, or Firebase unreachable at sign-in with
/// `FALLBACK_TO_MOCK`), to the in-memory mock backend.
class DeliveryRepository {
  DeliveryRepository({FirebaseDataSource? firebase, MockDataSource? mock})
      : firebase = firebase ?? FirebaseDataSource(),
        mock = mock ?? MockDataSource();

  final FirebaseDataSource firebase;
  final MockDataSource mock;

  bool get usingMock => DemoMode.isOn;

  DeliveryDataSource get _s => DemoMode.isOn ? mock : firebase;

  // auth
  Future<SessionResult> session({String? fcmToken}) => _s.session(fcmToken: fcmToken);
  Future<DeliveryProfile> register(RegistrationData d, {String? fcmToken}) => _s.register(d, fcmToken: fcmToken);
  Future<DeliveryProfile> demoLogin(String email, String password) => mock.login(email, password);
  Future<void> logout({String? fcmToken}) => _s.logout(fcmToken: fcmToken);
  Future<void> deleteAccount() => _s.deleteAccount();

  // profile
  Future<DeliveryProfile> getProfile() => _s.getProfile();
  Stream<DeliveryProfile> watchProfile() => _s.watchProfile();
  Future<DeliveryProfile> updateProfile(Map<String, dynamic> f) => _s.updateProfile(f);
  Future<List<Country>> getCountries() => _s.getCountries();
  Future<List<Zone>> getZones(String countryId) => _s.getZones(countryId);

  // presence
  Future<void> setOnline(bool v) => _s.setOnline(v);
  Future<void> sendLocation(double lat, double lng) => _s.sendLocation(lat, lng);
  Future<void> saveFcmToken(String token) => _s.saveFcmToken(token);

  // orders
  Stream<Dashboard> watchDashboard() => _s.watchDashboard();
  Stream<List<DeliveryOrder>> watchOrders(String type) => _s.watchOrders(type);
  Stream<DeliveryOrder> watchOrder(String id) => _s.watchOrder(id);
  Future<DeliveryOrder> acceptOrder(String id) => _s.acceptOrder(id);
  Future<void> rejectOrder(String id) => _s.rejectOrder(id);
  Future<DeliveryOrder> updateStatus(String id, String status) => _s.updateStatus(id, status);
  Future<DeliverResult> deliver(String id, String otp, {double? cashCollected}) =>
      _s.deliver(id, otp, cashCollected: cashCollected);
  Future<String?> invoiceUrl(String orderId) => _s.invoiceUrl(orderId);

  // returns
  Stream<List<ReturnPickup>> watchReturns() => _s.watchReturns();
  Future<void> markReturnPickedUp(String id) => _s.markReturnPickedUp(id);

  // money
  Stream<EarningsSummary> watchEarnings() => _s.watchEarnings();
  Stream<CashSummary> watchCashCollections() => _s.watchCashCollections();
  Stream<WalletSummary> watchWallet() => _s.watchWallet();
  Future<void> withdraw(double amount, String? message) => _s.withdraw(amount, message);
  Future<double> minWithdraw() => _s.minWithdraw();
  Future<bool> demoModeEnabled() => _s.demoModeEnabled();

  // chat / notifications
  Future<ChatThread> openSupportChat() => _s.openSupportChat();
  Future<ChatThread> openOrderChat(String orderId, String subject) => _s.openOrderChat(orderId, subject);
  Stream<List<ChatMessage>> watchMessages(String chatId) => _s.watchMessages(chatId);
  Future<String> sendMessage(ChatThread thread, String msg) => _s.sendMessage(thread, msg);
  Stream<List<AppNotification>> watchNotifications() => _s.watchNotifications();
  Future<void> markAllNotificationsRead() => _s.markAllNotificationsRead();
}
