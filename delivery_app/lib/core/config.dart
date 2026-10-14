import 'package:flutter/foundation.dart';

/// Global app configuration.
///
/// The app talks to Firebase only (Auth, Firestore, Cloud Functions, Storage – docs/FIREBASE_BACKEND.md).
/// Override at build/run time with `--dart-define`, e.g.
/// `flutter run --dart-define=USE_EMULATORS=true` or `--dart-define=USE_MOCK=true`.
class AppConfig {
  AppConfig._();

  static const String appName = 'QwikMart Delivery';

  /// Cloud Functions region (every callable runs in asia-south1).
  static const String functionsRegion = 'asia-south1';

  /// Connect to the local Firebase Emulator Suite instead of project `qwikmart-37299`.
  static const bool useEmulators = bool.fromEnvironment('USE_EMULATORS', defaultValue: false);

  /// Host running the emulators. Default: `10.0.2.2` (host machine seen from the Android emulator),
  /// `127.0.0.1` on web / desktop.
  static const String _emulatorHostDefine = String.fromEnvironment('EMULATOR_HOST');
  static String get emulatorHost {
    if (_emulatorHostDefine.isNotEmpty) return _emulatorHostDefine;
    if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) return '10.0.2.2';
    return '127.0.0.1';
  }

  static const int authEmulatorPort = int.fromEnvironment('AUTH_EMULATOR_PORT', defaultValue: 9099);
  static const int firestoreEmulatorPort = int.fromEnvironment('FIRESTORE_EMULATOR_PORT', defaultValue: 8080);
  static const int functionsEmulatorPort = int.fromEnvironment('FUNCTIONS_EMULATOR_PORT', defaultValue: 5001);
  static const int storageEmulatorPort = int.fromEnvironment('STORAGE_EMULATOR_PORT', defaultValue: 9199);

  /// When true every repository answers from the in-memory mock backend
  /// (`lib/data/mock`) – fully offline, Firebase is never touched.
  static const bool useMock = bool.fromEnvironment('USE_MOCK', defaultValue: false);

  /// Development only: when Firebase cannot be initialised or reached at sign-in, use the offline
  /// demo (mock data) instead of failing. Off by default – in production a network / sign-in error
  /// is always shown and the app never signs in to mock data.
  static const bool fallbackToMock = bool.fromEnvironment('FALLBACK_TO_MOCK', defaultValue: false);

  /// How often the rider location is written to `delivery_boys/{uid}.location` while online.
  static const Duration locationInterval = Duration(seconds: 10);

  /// Demo credentials (SPEC §3).
  static const String demoEmail = 'alex@gmail.com';
  static const String demoPassword = 'Alex@1234';
  static const String demoOtp = '123456';

  static const String supportPhone = '+919876500000';
  static const String supportEmail = 'support@qwikmart.app';
}

/// Tracks whether the app is currently serving mock data, either because
/// [AppConfig.useMock] is on or because Firebase was unreachable at sign-in.
class DemoMode {
  DemoMode._();
  static final ValueNotifier<bool> active = ValueNotifier<bool>(AppConfig.useMock);
  static bool get isOn => active.value;
  static void activate() {
    if (!active.value) active.value = true;
  }

  /// Back to the configured mode (after logout, so the next sign-in tries Firebase again).
  static void reset() {
    if (active.value != AppConfig.useMock) active.value = AppConfig.useMock;
  }
}
