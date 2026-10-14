// Firebase configuration for project `qwikmart-37299` (same shape as `flutterfire configure` output).
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
          '(bundle id) in Firebase project qwikmart-37299, add GoogleService-Info.plist and '
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
    apiKey: 'AIzaSyC39HUD-GT9zC2wtKBkz4mRgXspm40Vzvw',
    appId: '1:1054065019133:web:c7bbf751cf29d67a4a9694',
    messagingSenderId: '1054065019133',
    projectId: 'qwikmart-37299',
    authDomain: 'qwikmart-37299.firebaseapp.com',
    storageBucket: 'qwikmart-37299.firebasestorage.app',
  );

  static const FirebaseOptions android = FirebaseOptions(
    apiKey: 'AIzaSyCX22CmmydUiwiTtMJ6VGHnEhNm7vxNdYQ',
    appId: '1:1054065019133:android:3204c8da083a43c94a9694',
    messagingSenderId: '1054065019133',
    projectId: 'qwikmart-37299',
    storageBucket: 'qwikmart-37299.firebasestorage.app',
  );
}
