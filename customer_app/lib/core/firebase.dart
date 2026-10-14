import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter/foundation.dart';

import '../firebase_options.dart';
import 'config.dart';
import 'errors.dart';
import 'web_auth_reset_stub.dart' if (dart.library.js_interop) 'web_auth_reset_web.dart';

/// Firebase bootstrap + SDK accessors (project `qwikmart-37299`, functions in `asia-south1`).
class Fb {
  Fb._();

  static bool ready = false;

  /// Initialises Firebase (and connects the emulators when `USE_EMULATORS=true`). Never throws.
  static Future<bool> init() async {
    if (ready) return true;
    try {
      // Emulator web builds: start without a persisted Auth session, otherwise FlutterFire restores it against the
      // PRODUCTION Auth endpoint before the emulator can be connected (see web_auth_reset_web.dart). Dev only —
      // in emulator mode a web reload therefore starts a new guest session.
      if (kIsWeb && AppConfig.useEmulators && Firebase.apps.isEmpty) await clearPersistedAuth();
      if (Firebase.apps.isEmpty) {
        await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
      }
      // Must complete before any Auth/Firestore use: otherwise (web) the persisted session is restored and
      // anonymous guests are created against the PRODUCTION Auth service instead of the emulator.
      if (AppConfig.useEmulators) await _connectEmulators();
      ready = true;
    } catch (e) {
      ready = false;
      debugPrint('[firebase] not available on this platform/build ($e)');
    }
    return ready;
  }

  static Future<void> _connectEmulators() async {
    final host = AppConfig.emulatorHost;
    debugPrint('[firebase] using emulators on $host '
        '(auth ${AppConfig.authPort}, firestore ${AppConfig.firestorePort}, functions ${AppConfig.functionsPort}, '
        'storage ${AppConfig.storagePort})');
    await FirebaseAuth.instance.useAuthEmulator(host, AppConfig.authPort);
    FirebaseFirestore.instance.useFirestoreEmulator(host, AppConfig.firestorePort);
    functions.useFunctionsEmulator(host, AppConfig.functionsPort);
    FirebaseStorage.instance.useStorageEmulator(host, AppConfig.storagePort);
  }

  static FirebaseAuth get auth => FirebaseAuth.instance;
  static FirebaseFirestore get db => FirebaseFirestore.instance;
  static FirebaseFunctions get functions => FirebaseFunctions.instanceFor(region: AppConfig.functionsRegion);
  static FirebaseStorage get storage => FirebaseStorage.instance;

  /// Signed-in uid (anonymous guests included). Throws `unauthenticated` when nobody is signed in.
  static String get uid {
    final u = auth.currentUser;
    if (u == null) throw const AppException.unauthenticated();
    return u.uid;
  }

  /// Calls the `asia-south1` callable [name] and returns its JSON result (maps/lists made mutable).
  static Future<dynamic> call(String name, [Map<String, dynamic>? data]) => guard(() async {
        final res = await functions
            .httpsCallable(name, options: HttpsCallableOptions(timeout: const Duration(seconds: 60)))
            .call<dynamic>(_clean(data ?? const {}));
        return _deep(res.data);
      });

  static Future<Map<String, dynamic>> callMap(String name, [Map<String, dynamic>? data]) async {
    final r = await call(name, data);
    return r is Map<String, dynamic> ? r : <String, dynamic>{};
  }

  static Map<String, dynamic> _clean(Map<String, dynamic> m) =>
      Map.fromEntries(m.entries.where((e) => e.value != null));

  static dynamic _deep(dynamic v) {
    if (v is Map) return v.map((k, x) => MapEntry(k.toString(), _deep(x)));
    if (v is List) return v.map(_deep).toList();
    return v;
  }
}
