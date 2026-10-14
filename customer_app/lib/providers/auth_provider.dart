import 'dart:async';

import 'package:firebase_auth/firebase_auth.dart' show User;
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/config.dart';
import '../core/errors.dart';
import '../core/push.dart';
import '../repositories/repositories.dart';
import 'providers.dart';

/// Glue between Firebase Authentication, `syncProfile` / `mergeGuestCart` and [sessionProvider].
///
/// Guests are anonymous Firebase users; a real sign-in either links to the guest (same uid, cart kept) or
/// replaces it, in which case the guest cart is merged with `mergeGuestCart({guest_uid})`.
class AuthActions {
  final Ref ref;
  AuthActions(this.ref);

  /// True when sign-in must use the offline mock data source (no Firebase calls).
  bool get useMock => AppConfig.useMock;

  /// After any successful Firebase sign-in: merge the guest cart (if the uid changed), run `syncProfile`
  /// and store the profile. On failure the Firebase user is signed out so no half session remains.
  Future<AuthResult> completeFirebaseSignIn({String? name, String? email, String? referralCode}) async {
    final auth = ref.read(authServiceProvider);
    final repo = ref.read(accountRepoProvider);
    final guestUid = auth.takeGuestUid();
    try {
      final r = await repo.syncProfile(
        name: (name?.isEmpty ?? true) ? null : name,
        email: (email?.isEmpty ?? true) ? null : email,
        referralCode: (referralCode?.isEmpty ?? true) ? null : referralCode,
        fcmToken: PushService.fcmToken,
        language: ref.read(sessionProvider).locale,
      );
      if (r.blocked) throw const AppException('Your account has been deactivated. Please contact support.', code: 'permission-denied');
      if (guestUid != null && guestUid != auth.currentUser?.uid) {
        try {
          await repo.mergeGuestCart(guestUid);
        } catch (e) {
          debugPrint('[auth] mergeGuestCart failed: $e');
        }
      }
      await ref.read(sessionProvider.notifier).signIn(r.user);
      unawaited(ref.read(cartProvider.notifier).refresh());
      // An account created by linking a guest is reported as existing by syncProfile: ask for the name then.
      return AuthResult(r.user, isNew: r.isNew || r.user.name.trim().isEmpty);
    } catch (_) {
      await auth.signOut();
      rethrow;
    }
  }

  /// Offline demo login result (mock data source).
  Future<void> completeMockSignIn(AuthResult r) async {
    final guest = ref.read(sessionProvider).guestToken;
    await ref.read(sessionProvider.notifier).signIn(r.user, mockToken: r.mockToken);
    final cart = ref.read(cartRepoProvider);
    if (cart is MockCartRepository) {
      try {
        await cart.syncGuest(guest);
      } catch (_) {}
    }
    await ref.read(cartProvider.notifier).refresh();
  }

  /// Drops this device's FCM token, signs out; [AuthSync] then starts a fresh guest session.
  Future<void> logout() async {
    try {
      await ref.read(accountRepoProvider).logout(fcmToken: PushService.fcmToken);
    } catch (_) {}
    await _localSignOut();
  }

  /// `deleteAccount` callable (also deletes the Firebase user) then sign out. Throws if refused.
  Future<void> deleteAccount() async {
    await ref.read(accountRepoProvider).deleteAccount();
    await _localSignOut();
  }

  Future<void> _localSignOut() async {
    ref.read(appliedPromoProvider.notifier).state = null;
    await ref.read(sessionProvider.notifier).signOut();
    if (!useMock) await ref.read(authServiceProvider).signOut();
  }
}

final authActionsProvider = Provider<AuthActions>((ref) => AuthActions(ref));

/// Current Firebase user (null when signed out / Firebase unavailable). On web it is restored asynchronously.
final firebaseUserProvider = StreamProvider<User?>((ref) => ref.watch(authServiceProvider).authStateChanges());

/// Reconciles the session with FirebaseAuth at start-up and on `authStateChanges`:
/// - nobody signed in → anonymous guest session (cart works for guests);
/// - anonymous user → guest (a cached profile is dropped);
/// - restored account at start-up → `syncProfile` (refreshes the profile, last login, claims).
class AuthSync {
  final ProviderContainer c;
  StreamSubscription<Object?>? _sub;
  AuthSync(this.c);

  void start() {
    final auth = c.read(authServiceProvider);
    final s = c.read(sessionProvider);
    if (AppConfig.useMock) return; // offline demo: mock sessions only
    if (!auth.available) {
      if (s.isLoggedIn && !s.isMockSession) c.read(sessionProvider.notifier).signOut();
      return;
    }
    if (s.isMockSession) c.read(sessionProvider.notifier).signOut();
    var first = true;
    PushService.onToken = (token) {
      if (c.read(sessionProvider).isLoggedIn && auth.hasAccount) {
        unawaited(c.read(accountRepoProvider).registerFcmToken(token).catchError((Object _) {}));
      }
    };
    _sub = auth.authStateChanges().listen((user) async {
      final isFirst = first;
      first = false;
      final session = c.read(sessionProvider);
      if (user == null) {
        if (session.isLoggedIn) await c.read(sessionProvider.notifier).signOut();
        await auth.ensureGuest();
        return;
      }
      if (user.isAnonymous) {
        if (session.isLoggedIn) await c.read(sessionProvider.notifier).signOut();
        return;
      }
      if (!isFirst) return; // interactive sign-ins are completed by the login flow
      try {
        if (session.isLoggedIn && session.user?.id == user.uid) {
          final r = await c.read(accountRepoProvider).syncProfile(fcmToken: PushService.fcmToken);
          if (r.blocked) {
            await c.read(authActionsProvider).logout();
            return;
          }
          c.read(sessionProvider.notifier).updateUser(r.user);
        } else {
          // Firebase signed in but the profile was never synced (e.g. app killed mid-login).
          await c.read(authActionsProvider).completeFirebaseSignIn();
        }
      } catch (e) {
        debugPrint('[auth] session restore failed: $e');
      }
    });
  }

  void dispose() => _sub?.cancel();
}
