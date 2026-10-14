import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

/// Push notifications (FCM + local notifications).
///
/// Everything is wrapped in try/catch so the app runs without `google-services.json` /
/// `GoogleService-Info.plist`. See README → "Firebase setup".
class PushService {
  PushService._();

  static final FlutterLocalNotificationsPlugin _local = FlutterLocalNotificationsPlugin();
  static String? fcmToken;
  static bool firebaseReady = false;

  /// Called with notification `data` when a push is tapped / received (e.g. to refresh an order).
  static void Function(Map<String, dynamic> data)? onData;

  /// Called with the FCM token (first fetch + refreshes) — stored in `users/{uid}.fcm_tokens`.
  static void Function(String token)? onToken;

  static const _channel = AndroidNotificationChannel(
    'qwikmart_default',
    'QwikMart updates',
    description: 'Order updates, offers and support replies',
    importance: Importance.high,
  );

  static Future<void> init() async {
    if (!kIsWeb) {
      try {
        await _local.initialize(
          settings: const InitializationSettings(
            android: AndroidInitializationSettings('@mipmap/ic_launcher'),
            iOS: DarwinInitializationSettings(),
          ),
        );
        await _local
            .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
            ?.createNotificationChannel(_channel);
      } catch (e) {
        debugPrint('[push] local notifications unavailable: $e');
      }
    }

    // Firebase itself is initialised in main() (AuthService.initFirebase). FCM on web needs a service worker
    // (`web/firebase-messaging-sw.js`), so push stays mobile-only.
    if (kIsWeb || Firebase.apps.isEmpty) {
      debugPrint('[push] Firebase not configured for push on this platform — push disabled');
      return;
    }
    try {
      firebaseReady = true;
      final messaging = FirebaseMessaging.instance;
      await messaging.requestPermission();
      fcmToken = await messaging.getToken();
      debugPrint('[push] FCM token: $fcmToken');
      if (fcmToken != null) onToken?.call(fcmToken!);
      messaging.onTokenRefresh.listen((t) {
        fcmToken = t;
        onToken?.call(t);
      });
      FirebaseMessaging.onMessage.listen((m) {
        onData?.call(m.data);
        _showLocal(m);
      });
      FirebaseMessaging.onMessageOpenedApp.listen((m) => onData?.call(m.data));
    } catch (e) {
      debugPrint('[push] Firebase not configured — push disabled ($e)');
    }
  }

  static Future<void> _showLocal(RemoteMessage m) async {
    final n = m.notification;
    if (n == null || kIsWeb) return;
    try {
      await _local.show(
        id: n.hashCode,
        title: n.title,
        body: n.body,
        notificationDetails: NotificationDetails(
          android: AndroidNotificationDetails(_channel.id, _channel.name,
              channelDescription: _channel.description, importance: Importance.high, priority: Priority.high),
          iOS: const DarwinNotificationDetails(),
        ),
      );
    } catch (e) {
      debugPrint('[push] show failed: $e');
    }
  }
}
