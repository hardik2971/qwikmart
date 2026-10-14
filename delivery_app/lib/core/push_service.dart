import 'dart:async';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import 'auth_service.dart';
import 'config.dart';

/// Global messenger so services can surface in-app banners.
final GlobalKey<ScaffoldMessengerState> scaffoldMessengerKey = GlobalKey<ScaffoldMessengerState>();

@pragma('vm:entry-point')
Future<void> firebaseBackgroundHandler(RemoteMessage message) async {
  // System tray shows notification payloads automatically in background.
}

/// FCM + local notifications. Everything is wrapped in try/catch so the app
/// runs without `google-services.json` / `GoogleService-Info.plist`.
class PushService {
  PushService._();

  static final FlutterLocalNotificationsPlugin _local = FlutterLocalNotificationsPlugin();
  static bool _localReady = false;
  static bool firebaseReady = false;
  static String? fcmToken;

  /// Called whenever a push arrives (foreground). `data['type'] == 'new_order'`
  /// triggers an order list refresh.
  static void Function(Map<String, dynamic> data)? onMessage;

  /// Called with a new / refreshed FCM token (saved to `users/{uid}.fcm_tokens`).
  static void Function(String token)? onToken;

  /// Called when the user taps a notification.
  static void Function(Map<String, dynamic> data)? onOpen;

  static const _channel = AndroidNotificationChannel(
    'qwikmart_orders',
    'Orders',
    description: 'New delivery requests and order updates',
    importance: Importance.high,
  );

  static Future<void> init() async {
    await _initLocal();
    await _initFirebase();
  }

  static Future<void> _initLocal() async {
    if (kIsWeb) return;
    try {
      await _local.initialize(
        settings: const InitializationSettings(
          android: AndroidInitializationSettings('@mipmap/ic_launcher'),
          iOS: DarwinInitializationSettings(),
        ),
        onDidReceiveNotificationResponse: (r) {
          final p = r.payload;
          if (p != null && p.isNotEmpty) onOpen?.call({'order_id': p});
        },
      );
      final android = _local.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
      await android?.createNotificationChannel(_channel);
      await android?.requestNotificationsPermission();
      _localReady = true;
    } catch (e) {
      debugPrint('[push] local notifications unavailable: $e');
    }
  }

  static Future<void> _initFirebase() async {
    // Firebase itself is initialised in main() (FirebaseInit) with DefaultFirebaseOptions.
    if (!FirebaseInit.ready) {
      debugPrint('[push] Firebase not configured – push disabled');
      return;
    }
    firebaseReady = true;
    // Web push needs a VAPID key + firebase-messaging-sw.js – not set up, so FCM is mobile-only.
    // Emulator builds never register with the production FCM / Installations backends.
    if (kIsWeb || AppConfig.useEmulators) return;
    try {
      final fm = FirebaseMessaging.instance;
      FirebaseMessaging.onBackgroundMessage(firebaseBackgroundHandler);
      await fm.requestPermission();
      fcmToken = await fm.getToken().timeout(const Duration(seconds: 5), onTimeout: () => null);
      final t = fcmToken;
      if (t != null) onToken?.call(t);
      fm.onTokenRefresh.listen((t) {
        fcmToken = t;
        onToken?.call(t);
      });
      FirebaseMessaging.onMessage.listen((m) {
        final data = Map<String, dynamic>.from(m.data);
        final title = m.notification?.title ?? data['title']?.toString() ?? 'QwikMart';
        final body = m.notification?.body ?? data['body']?.toString() ?? '';
        show(title, body, payload: data['order_id']?.toString());
        onMessage?.call(data);
      });
      FirebaseMessaging.onMessageOpenedApp.listen((m) => onOpen?.call(Map<String, dynamic>.from(m.data)));
      final initial = await fm.getInitialMessage();
      if (initial != null) {
        scheduleMicrotask(() => onOpen?.call(Map<String, dynamic>.from(initial.data)));
      }
    } catch (e) {
      debugPrint('[push] messaging setup failed: $e');
    }
  }

  /// Shows a system notification (mobile) or an in-app banner (web / fallback).
  static Future<void> show(String title, String body, {String? payload}) async {
    if (_localReady) {
      try {
        await _local.show(
          id: DateTime.now().millisecondsSinceEpoch ~/ 1000 % 100000,
          title: title,
          body: body,
          payload: payload,
          notificationDetails: NotificationDetails(
            android: AndroidNotificationDetails(
              _channel.id,
              _channel.name,
              channelDescription: _channel.description,
              importance: Importance.high,
              priority: Priority.high,
              color: const Color(0xFF0E9623),
            ),
            iOS: const DarwinNotificationDetails(presentAlert: true, presentSound: true),
          ),
        );
      } catch (e) {
        debugPrint('[push] show failed: $e');
      }
    }
    scaffoldMessengerKey.currentState?.showSnackBar(
      SnackBar(
        backgroundColor: const Color(0xFF0E9623),
        content: Text('$title\n$body', style: const TextStyle(color: Colors.white)),
        duration: const Duration(seconds: 4),
        action: payload == null
            ? null
            : SnackBarAction(
                label: 'VIEW',
                textColor: Colors.white,
                onPressed: () => onOpen?.call({'order_id': payload}),
              ),
      ),
    );
  }
}
