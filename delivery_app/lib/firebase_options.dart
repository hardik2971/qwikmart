// Firebase configuration for project `qwikmart-37299` (equivalent of `flutterfire configure`).
// Android app: com.qwikmart.delivery. Web app: qwikmart web. iOS is not registered yet.
import 'package:firebase_core/firebase_core.dart' show FirebaseOptions;
import 'package:flutter/foundation.dart' show defaultTargetPlatform, kIsWeb, TargetPlatform;

class DefaultFirebaseOptions {
  DefaultFirebaseOptions._();

  static FirebaseOptions get currentPlatform {
    if (kIsWeb) return web;
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return android;
      case TargetPlatform.iOS:
      case TargetPlatform.macOS:
        throw UnsupportedError(
          'Firebase is not configured for iOS/macOS yet: register an iOS app (bundle id) in the Firebase '
          'project qwikmart-37299, add GoogleService-Info.plist and re-run `flutterfire configure`.',
        );
      default:
        throw UnsupportedError('Firebase is not configured for $defaultTargetPlatform.');
    }
  }

  static const FirebaseOptions android = FirebaseOptions(
    apiKey: 'AIzaSyCX22CmmydUiwiTtMJ6VGHnEhNm7vxNdYQ',
    appId: '1:1054065019133:android:d97cfa2b36fcc09a4a9694',
    messagingSenderId: '1054065019133',
    projectId: 'qwikmart-37299',
    storageBucket: 'qwikmart-37299.firebasestorage.app',
  );

  static const FirebaseOptions web = FirebaseOptions(
    apiKey: 'AIzaSyC39HUD-GT9zC2wtKBkz4mRgXspm40Vzvw',
    appId: '1:1054065019133:web:c7bbf751cf29d67a4a9694',
    messagingSenderId: '1054065019133',
    projectId: 'qwikmart-37299',
    authDomain: 'qwikmart-37299.firebaseapp.com',
    storageBucket: 'qwikmart-37299.firebasestorage.app',
  );
}
