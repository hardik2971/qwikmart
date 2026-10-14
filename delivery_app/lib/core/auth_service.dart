import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter/foundation.dart';

import '../firebase_options.dart';
import 'app_exception.dart';
import 'config.dart';
import 'emulator/web_auth_reset.dart';

/// Initialises the default Firebase app with [DefaultFirebaseOptions] before `runApp`
/// (and connects the Emulator Suite with `--dart-define=USE_EMULATORS=true`).
/// Never throws: on unsupported platforms (iOS is not registered yet) or any other error the app
/// still starts, [ready] stays false and sign-in falls back to the offline demo when allowed.
class FirebaseInit {
  FirebaseInit._();

  static bool ready = false;
  static Object? error;
  static bool _emulatorsConnected = false;

  static Future<void> init() async {
    try {
      // Emulator builds on the web must never reuse a persisted session: it would be validated against
      // production before the Auth emulator is connected (see web_auth_reset.dart).
      if (AppConfig.useEmulators && kIsWeb) await clearPersistedWebAuth();
      if (Firebase.apps.isEmpty) {
        await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform)
            .timeout(const Duration(seconds: 10));
      }
      if (AppConfig.useEmulators) await _connectEmulators();
      ready = true;
    } catch (e) {
      error = e;
      debugPrint('[firebase] not available – sign-in disabled ($e)');
    }
  }

  /// Auth, Firestore, Functions and Storage → local Emulator Suite
  /// (`EMULATOR_HOST`, default 10.0.2.2 on Android / 127.0.0.1 elsewhere).
  static Future<void> _connectEmulators() async {
    if (_emulatorsConnected) return;
    final host = AppConfig.emulatorHost;
    // Any failure here propagates to [init] (ready = false, sign-in disabled): an emulator build must
    // never fall through to the production project.
    await FirebaseAuth.instance.useAuthEmulator(host, AppConfig.authEmulatorPort);
    FirebaseFirestore.instance.useFirestoreEmulator(host, AppConfig.firestoreEmulatorPort);
    FirebaseFunctions.instanceFor(region: AppConfig.functionsRegion)
        .useFunctionsEmulator(host, AppConfig.functionsEmulatorPort);
    await FirebaseStorage.instance.useStorageEmulator(host, AppConfig.storageEmulatorPort);
    _emulatorsConnected = true;
    debugPrint('[firebase] using emulators on $host');
  }
}

/// A sign-in / account error whose [key] is an l10n key (see `core/l10n.dart`).
class AuthFailure implements Exception {
  AuthFailure(this.key, [this.detail]);
  final String key;
  final String? detail;

  @override
  String toString() => detail ?? key;
}

/// Thin wrapper around [FirebaseAuth] (email/password) used by the delivery app.
class FirebaseAuthService {
  FirebaseAuthService._();

  static FirebaseAuth get _auth => FirebaseAuth.instance;

  static bool get available => FirebaseInit.ready;

  static User? get currentUser => available ? _auth.currentUser : null;

  /// Waits for the persisted session to be restored (async on web) and returns the user.
  static Future<User?> restoredUser() async {
    if (!available) return null;
    try {
      return await _auth.authStateChanges().first.timeout(const Duration(seconds: 5));
    } catch (_) {
      return _auth.currentUser;
    }
  }

  /// Firebase ID token; [forceRefresh] after a callable changed the custom claims
  /// (`syncProfile`, `registerDeliveryBoy`) so Firestore rules see the new `role` / `zone_id`.
  static Future<String?> idToken({bool forceRefresh = false}) async {
    final u = currentUser;
    if (u == null) return null;
    try {
      return await u.getIdToken(forceRefresh);
    } on FirebaseAuthException catch (e) {
      throw _map(e);
    }
  }

  /// Current custom claims (`role`, `zone_id`) of the signed-in user.
  static Future<Map<String, dynamic>> claims({bool forceRefresh = false}) async {
    final u = currentUser;
    if (u == null) return const {};
    try {
      return (await u.getIdTokenResult(forceRefresh)).claims ?? const {};
    } on FirebaseAuthException catch (e) {
      throw _map(e);
    }
  }

  static const _badCredentialCodes = {
    'invalid-credential',
    'user-not-found',
    'wrong-password',
    'invalid-login-credentials',
    'INVALID_LOGIN_CREDENTIALS',
  };

  /// `signInWithEmailAndPassword`. Riders imported from MySQL keep their password (BCRYPT hashes
  /// were imported into Firebase Auth), so there is no separate legacy flow any more.
  static Future<User> signIn(String email, String password) async {
    _ensure();
    try {
      return (await _auth.signInWithEmailAndPassword(email: email, password: password)).user!;
    } on FirebaseAuthException catch (e) {
      throw _map(e);
    }
  }

  /// `createUserWithEmailAndPassword` + display name. If the e-mail already has a Firebase account
  /// with this password (e.g. an earlier attempt), signs in to it instead. Returns whether a new
  /// account was created (only such an account may be deleted when the registration is abandoned).
  static Future<bool> createAccount(String email, String password, String name) async {
    _ensure();
    User user;
    var created = false;
    try {
      user = (await _auth.createUserWithEmailAndPassword(email: email, password: password)).user!;
      created = true;
    } on FirebaseAuthException catch (e) {
      if (e.code != 'email-already-in-use') throw _map(e);
      try {
        user = (await _auth.signInWithEmailAndPassword(email: email, password: password)).user!;
      } on FirebaseAuthException {
        throw AuthFailure('auth_email_in_use');
      }
    }
    if (created && name.isNotEmpty) {
      try {
        await user.updateDisplayName(name);
      } catch (_) {}
    }
    return created;
  }

  static Future<void> sendPasswordReset(String email) async {
    _ensure();
    try {
      await _auth.sendPasswordResetEmail(email: email);
    } on FirebaseAuthException catch (e) {
      // Do not reveal whether an account exists.
      if (e.code == 'user-not-found') return;
      throw _map(e);
    }
  }

  /// Re-authenticates with [current] and sets [newPassword].
  static Future<void> changePassword(String current, String newPassword) async {
    _ensure();
    final u = _auth.currentUser;
    if (u == null || u.email == null) throw AuthFailure('auth_failed');
    try {
      await u.reauthenticateWithCredential(EmailAuthProvider.credential(email: u.email!, password: current));
    } on FirebaseAuthException catch (e) {
      if (_badCredentialCodes.contains(e.code)) throw AuthFailure('auth_wrong_current_password');
      throw _map(e);
    }
    try {
      await u.updatePassword(newPassword);
    } on FirebaseAuthException catch (e) {
      throw _map(e);
    }
  }

  static Future<void> signOut() async {
    if (!available) return;
    try {
      await _auth.signOut();
    } catch (e) {
      debugPrint('[auth] signOut failed: $e');
    }
  }

  /// Deletes the signed-in Firebase account (used when a registration is abandoned).
  static Future<void> deleteCurrentUser() async {
    final u = currentUser;
    if (u == null) return;
    try {
      await u.delete();
    } catch (e) {
      debugPrint('[auth] delete failed: $e');
      await signOut();
    }
  }

  static void _ensure() {
    if (!available) throw AuthFailure('firebase_unavailable');
  }

  static Exception _map(FirebaseAuthException e) {
    switch (e.code) {
      case 'network-request-failed':
        return AppException('Unable to reach server. Check your connection.', code: e.code, isNetwork: true);
      case 'invalid-credential':
      case 'user-not-found':
      case 'wrong-password':
      case 'invalid-login-credentials':
      case 'INVALID_LOGIN_CREDENTIALS':
        return AuthFailure('auth_invalid_credentials');
      case 'invalid-email':
        return AuthFailure('invalid_email');
      case 'email-already-in-use':
        return AuthFailure('auth_email_in_use');
      case 'weak-password':
        return AuthFailure('auth_weak_password');
      case 'too-many-requests':
        return AuthFailure('auth_too_many');
      case 'user-disabled':
        return AuthFailure('auth_user_disabled');
      case 'requires-recent-login':
        return AuthFailure('auth_recent_login');
      case 'operation-not-allowed':
        return AuthFailure('auth_not_enabled');
      default:
        return AuthFailure('auth_failed', e.message);
    }
  }
}
