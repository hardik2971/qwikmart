// Firebase configuration for project `qwikmart-infidec` (equivalent of `flutterfire configure`).
// Android app: com.qwikmartapp.delivery. Web app: qwikmart web. iOS is not registered yet.
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
          'project qwikmart-infidec, add GoogleService-Info.plist and re-run `flutterfire configure`.',
        );
      default:
        throw UnsupportedError('Firebase is not configured for $defaultTargetPlatform.');
    }
  }

  static const FirebaseOptions android = FirebaseOptions(
    apiKey: 'AIzaSyBljd_v_mHszTxa_Bj4TUFeJgC9Rjo-w2Y',
    appId: '1:751479275108:android:1c13e29dff5f85b0f7a971',
    messagingSenderId: '751479275108',
    projectId: 'qwikmart-infidec',
    storageBucket: 'qwikmart-infidec.firebasestorage.app',
  );

  static const FirebaseOptions web = FirebaseOptions(
    apiKey: 'AIzaSyABX9YfiY7lP4uka4QHj2IYkRm9NnK-V3A',
    appId: '1:751479275108:web:65f01d7c5cf842b2f7a971',
    messagingSenderId: '751479275108',
    projectId: 'qwikmart-infidec',
    authDomain: 'qwikmart-infidec.firebaseapp.com',
    storageBucket: 'qwikmart-infidec.firebasestorage.app',
  );
}
