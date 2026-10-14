import 'dart:async';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';

import 'firebase.dart';

/// Result of starting a phone sign-in.
///
/// - Android/iOS: [verificationId] + [resendToken] (from `codeSent`), or [credential] when the SMS was
///   auto-retrieved / instantly verified before the code screen was shown.
/// - Web: [confirmation] (`signInWithPhoneNumber` / `linkWithPhoneNumber` + invisible reCAPTCHA).
class PhoneVerification {
  final String? verificationId;
  final int? resendToken;
  final ConfirmationResult? confirmation;
  final UserCredential? credential;
  const PhoneVerification({this.verificationId, this.resendToken, this.confirmation, this.credential});

  bool get autoSignedIn => credential != null;
}

/// Firebase Authentication wrapper.
///
/// Guests are **anonymous** Firebase users (their cart lives in `users/{uid}/cart`). Signing in with a phone
/// credential links it to the anonymous user (`linkWithCredential`) so the uid — and the cart — is kept.
/// When the credential already belongs to an account, the app signs in to that account instead and remembers
/// the guest uid ([takeGuestUid]) so the caller can run `mergeGuestCart({guest_uid})`.
///
/// Every call is guarded by [available]: when Firebase failed to initialise the app runs on mock data.
class AuthService {
  /// Initialise Firebase (+ emulators). Never throws.
  static Future<bool> initFirebase() => Fb.init();

  FirebaseAuth get _auth => FirebaseAuth.instance;

  bool get available => Fb.ready;

  User? get currentUser => available ? _auth.currentUser : null;

  /// A real (non-anonymous) account is signed in.
  bool get hasAccount => currentUser != null && !currentUser!.isAnonymous;

  Stream<User?> authStateChanges() => available ? _auth.authStateChanges() : const Stream.empty();

  String? _guestUid;

  /// Anonymous uid replaced by the last sign-in (its cart must be merged), consumed once.
  String? takeGuestUid() {
    final g = _guestUid;
    _guestUid = null;
    return g;
  }

  Future<void>? _anon;

  /// Starts a guest session (anonymous auth) when nobody is signed in.
  Future<void> ensureGuest() {
    if (!available || _auth.currentUser != null) return Future.value();
    return _anon ??= _auth.signInAnonymously().then((_) {}).catchError((Object e) {
      debugPrint('[auth] anonymous sign-in failed: $e');
    }).whenComplete(() => _anon = null);
  }

  void _ensure() {
    if (!available) throw const AuthFailure('Sign-in is not available right now. Please try again later.');
  }

  static bool _alreadyInUse(FirebaseAuthException e) =>
      e.code == 'credential-already-in-use' || e.code == 'email-already-in-use' || e.code == 'account-exists-with-different-credential';

  /// Links [credential] to the anonymous guest (keeps uid + cart) or signs in normally.
  Future<UserCredential> _linkOrSignIn(AuthCredential credential) async {
    final u = _auth.currentUser;
    if (u != null && u.isAnonymous) {
      try {
        return await u.linkWithCredential(credential);
      } on FirebaseAuthException catch (e) {
        if (!_alreadyInUse(e)) rethrow;
        _guestUid = u.uid;
        return _auth.signInWithCredential(e.credential ?? credential);
      }
    }
    return _auth.signInWithCredential(credential);
  }

  // ------------------------------------------------------------------ phone

  /// Sends the OTP to [e164] (e.g. `+919876543210`).
  ///
  /// [onAutoSignIn] fires when Android auto-retrieves the SMS after the code screen is shown;
  /// [onLateError] reports errors that arrive after the future completed.
  Future<PhoneVerification> startPhoneSignIn(
    String e164, {
    int? resendToken,
    void Function(UserCredential credential)? onAutoSignIn,
    void Function(Object error)? onLateError,
  }) async {
    _ensure();
    if (kIsWeb) {
      // Web: plain sign-in (not linkWithPhoneNumber). FlutterFire web does not expose the credential of a
      // "credential-already-in-use" link error, so linking a number that already has an account could never
      // fall back to signing in. The guest cart is merged with mergeGuestCart instead (see confirmPhoneCode).
      final confirmation = await _auth.signInWithPhoneNumber(e164);
      return PhoneVerification(confirmation: confirmation);
    }

    final completer = Completer<PhoneVerification>();
    await _auth.verifyPhoneNumber(
      phoneNumber: e164,
      forceResendingToken: resendToken,
      timeout: const Duration(seconds: 60),
      verificationCompleted: (PhoneAuthCredential credential) async {
        try {
          final uc = await _linkOrSignIn(credential);
          if (!completer.isCompleted) {
            completer.complete(PhoneVerification(credential: uc));
          } else {
            onAutoSignIn?.call(uc);
          }
        } catch (e) {
          if (!completer.isCompleted) {
            completer.completeError(e);
          } else {
            onLateError?.call(e);
          }
        }
      },
      verificationFailed: (FirebaseAuthException e) {
        if (!completer.isCompleted) {
          completer.completeError(e);
        } else {
          onLateError?.call(e);
        }
      },
      codeSent: (String verificationId, int? token) {
        if (!completer.isCompleted) {
          completer.complete(PhoneVerification(verificationId: verificationId, resendToken: token ?? resendToken));
        }
      },
      codeAutoRetrievalTimeout: (_) {},
    );
    return completer.future;
  }

  Future<UserCredential> confirmPhoneCode(PhoneVerification v, String code) async {
    _ensure();
    if (v.credential != null) return v.credential!;
    if (v.confirmation != null) {
      final guest = _auth.currentUser;
      final uc = await v.confirmation!.confirm(code);
      // the anonymous guest was replaced by the phone account: its cart is merged after syncProfile
      if (guest != null && guest.isAnonymous && uc.user?.uid != guest.uid) _guestUid = guest.uid;
      return uc;
    }
    final credential = PhoneAuthProvider.credential(verificationId: v.verificationId ?? '', smsCode: code);
    return _linkOrSignIn(credential);
  }

  // ------------------------------------------------------------------ email

  /// Email/password login. Existing accounts (including users imported from MySQL with their BCRYPT password
  /// hashes) sign in directly. A guest's anonymous uid is remembered for `mergeGuestCart`; the email credential
  /// is not *linked* here because linking an unknown email would silently create a new account.
  Future<UserCredential> signInWithEmail(String email, String password) async {
    _ensure();
    final u = _auth.currentUser;
    final guest = u != null && u.isAnonymous ? u.uid : null;
    final cred = await _auth.signInWithEmailAndPassword(email: email, password: password);
    if (guest != null && cred.user?.uid != guest) _guestUid = guest;
    return cred;
  }

  /// Creates an email/password account — linked to the anonymous guest so the uid and cart are kept.
  Future<UserCredential> register(String email, String password, String name) async {
    _ensure();
    final u = _auth.currentUser;
    final UserCredential uc;
    if (u != null && u.isAnonymous) {
      uc = await u.linkWithCredential(EmailAuthProvider.credential(email: email, password: password));
    } else {
      uc = await _auth.createUserWithEmailAndPassword(email: email, password: password);
    }
    if (name.isNotEmpty) {
      try {
        await uc.user?.updateDisplayName(name);
      } catch (_) {}
    }
    return uc;
  }

  Future<void> sendPasswordReset(String email) async {
    _ensure();
    await _auth.sendPasswordResetEmail(email: email);
  }

  /// Re-authenticates with [currentPassword] then sets [newPassword] (email/password users only).
  Future<void> changePassword(String currentPassword, String newPassword) async {
    _ensure();
    final u = _auth.currentUser;
    final email = u?.email;
    if (u == null || email == null) throw const AuthFailure('Please log in again to change your password.');
    await u.reauthenticateWithCredential(EmailAuthProvider.credential(email: email, password: currentPassword));
    await u.updatePassword(newPassword);
  }

  Future<void> signOut() async {
    if (!available) return;
    try {
      await _auth.signOut();
    } catch (e) {
      debugPrint('[auth] signOut failed: $e');
    }
  }

  // ------------------------------------------------------------------ errors

  /// User-facing message for a Firebase Auth error.
  static String message(Object error) {
    if (error is AuthFailure) return error.message;
    if (error is! FirebaseAuthException) return error.toString();
    final raw = (error.message ?? '').toLowerCase();
    if (raw.contains('region')) {
      return 'SMS verification is not available for this region yet. Please log in with email for now.';
    }
    switch (error.code) {
      case 'invalid-verification-code':
        return 'The OTP you entered is incorrect.';
      case 'invalid-verification-id':
      case 'session-expired':
      case 'code-expired':
        return 'This OTP has expired. Please request a new one.';
      case 'invalid-phone-number':
        return 'Enter a valid phone number.';
      case 'too-many-requests':
        return 'Too many attempts. Please wait a while and try again.';
      case 'quota-exceeded':
        return 'SMS limit reached. Please try again later or log in with email.';
      case 'captcha-check-failed':
      case 'invalid-app-credential':
      case 'missing-client-identifier':
      case 'app-not-authorized':
        return 'Could not verify this device for phone sign-in. Please try again or log in with email.';
      case 'operation-not-allowed':
      case 'admin-restricted-operation':
        return 'This sign-in method is currently unavailable. Please use another method.';
      case 'invalid-credential':
      case 'invalid-login-credentials':
      case 'wrong-password':
      case 'user-not-found':
        return 'These credentials do not match our records.';
      case 'invalid-email':
        return 'Enter a valid email address.';
      case 'user-disabled':
        return 'Your account has been deactivated. Please contact support.';
      case 'email-already-in-use':
      case 'credential-already-in-use':
        return 'This email is already registered. Please log in instead.';
      case 'weak-password':
        return 'Password is too weak. Use at least 6 characters.';
      case 'requires-recent-login':
        return 'Please log in again to continue.';
      case 'network-request-failed':
        return 'No internet connection';
      default:
        return error.message ?? 'Authentication failed. Please try again.';
    }
  }
}

/// Client-side auth error with a ready-to-show message.
class AuthFailure implements Exception {
  final String message;
  const AuthFailure(this.message);
  @override
  String toString() => message;
}
