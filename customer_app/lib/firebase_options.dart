// Firebase configuration for project `qwikmart-infidec` (same shape as `flutterfire configure` output).
// ignore_for_file: lines_longer_than_80_chars
import 'package:firebase_core/firebase_core.dart' show FirebaseOptions;
import 'package:flutter/foundation.dart' show defaultTargetPlatform, kIsWeb, TargetPlatform;

/// Default [FirebaseOptions] for use with your Firebase apps.
///
/// ```dart
/// await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
/// ```
class DefaultFirebaseOptions {
  DefaultFirebaseOptions._();

  static FirebaseOptions get currentPlatform {
    if (kIsWeb) return web;
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return android;
      case TargetPlatform.iOS:
        throw UnsupportedError(
          'DefaultFirebaseOptions have not been configured for iOS - register the iOS app '
          '(bundle id) in Firebase project qwikmart-infidec, add GoogleService-Info.plist and '
          'reconfigure by running `flutterfire configure`.',
        );
      case TargetPlatform.macOS:
        throw UnsupportedError(
          'DefaultFirebaseOptions have not been configured for macOS - '
          'you can reconfigure this by running `flutterfire configure`.',
        );
      case TargetPlatform.windows:
        throw UnsupportedError(
          'DefaultFirebaseOptions have not been configured for windows - '
          'you can reconfigure this by running `flutterfire configure`.',
        );
      case TargetPlatform.linux:
        throw UnsupportedError(
          'DefaultFirebaseOptions have not been configured for linux - '
          'you can reconfigure this by running `flutterfire configure`.',
        );
      default:
        throw UnsupportedError('DefaultFirebaseOptions are not supported for this platform.');
    }
  }

  static const FirebaseOptions web = FirebaseOptions(
    apiKey: 'AIzaSyABX9YfiY7lP4uka4QHj2IYkRm9NnK-V3A',
    appId: '1:751479275108:web:65f01d7c5cf842b2f7a971',
    messagingSenderId: '751479275108',
    projectId: 'qwikmart-infidec',
    authDomain: 'qwikmart-infidec.firebaseapp.com',
    storageBucket: 'qwikmart-infidec.firebasestorage.app',
  );

  static const FirebaseOptions android = FirebaseOptions(
    apiKey: 'AIzaSyBljd_v_mHszTxa_Bj4TUFeJgC9Rjo-w2Y',
    appId: '1:751479275108:android:9ad4efd91fed5970f7a971',
    messagingSenderId: '751479275108',
    projectId: 'qwikmart-infidec',
    storageBucket: 'qwikmart-infidec.firebasestorage.app',
  );
}
