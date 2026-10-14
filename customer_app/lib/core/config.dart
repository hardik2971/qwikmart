import 'package:flutter/foundation.dart';

/// Global app configuration. The backend is Firebase only (Auth, Firestore, Cloud Functions, Storage).
///
/// Override at build/run time with `--dart-define`, e.g.
/// `flutter run --dart-define=USE_EMULATORS=true --dart-define=EMULATOR_HOST=192.168.1.10`
/// or the offline demo: `flutter run --dart-define=USE_MOCK=true`.
class AppConfig {
  AppConfig._();

  static const String appName = 'QwikMart';

  /// Serve every read/write from the in-app mock data source (`lib/data/mock`) — no Firebase calls.
  /// Also switched on at runtime when Firebase cannot be initialised on this platform.
  static bool useMock = const bool.fromEnvironment('USE_MOCK', defaultValue: false);

  /// Cloud Functions region (all callables are deployed to `asia-south1`).
  static const String functionsRegion = 'asia-south1';

  // ------------------------------------------------------------------ Firebase Emulator Suite

  /// Connect Auth / Firestore / Functions / Storage to the local emulators.
  static const bool useEmulators = bool.fromEnvironment('USE_EMULATORS', defaultValue: false);

  static const String _emulatorHost = String.fromEnvironment('EMULATOR_HOST');

  /// Emulator host: `EMULATOR_HOST`, else `10.0.2.2` (host machine from the Android emulator), `127.0.0.1` on web/desktop.
  static String get emulatorHost {
    if (_emulatorHost.isNotEmpty) return _emulatorHost;
    if (kIsWeb) return '127.0.0.1';
    return defaultTargetPlatform == TargetPlatform.android ? '10.0.2.2' : '127.0.0.1';
  }

  static const int authPort = int.fromEnvironment('AUTH_PORT', defaultValue: 9099);
  static const int firestorePort = int.fromEnvironment('FIRESTORE_PORT', defaultValue: 8080);
  static const int functionsPort = int.fromEnvironment('FUNCTIONS_PORT', defaultValue: 5001);
  static const int storagePort = int.fromEnvironment('STORAGE_PORT', defaultValue: 9199);

  /// Demo OTP accepted by the mock data source (and the Auth emulator's test numbers if configured).
  static const String demoOtp = '123456';

  /// Polling interval used only by the offline mock (Firebase screens are realtime via snapshots).
  static const Duration pollInterval = Duration(seconds: 5);

  static const String supportPhone = '+919876500000';
  static const String supportEmail = 'support@qwikmart.app';

  /// Short label shown in the profile footer.
  static String get backendLabel {
    if (useMock) return 'demo data';
    if (useEmulators) return 'Firebase emulators @ $emulatorHost';
    return 'Firebase';
  }
}
