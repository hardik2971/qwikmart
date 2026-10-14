import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/app_exception.dart';
import '../core/auth_service.dart';
import '../core/config.dart';
import '../core/l10n.dart';
import '../core/push_service.dart';
import '../core/storage.dart';
import '../data/delivery_data_source.dart';
import '../models/models.dart';
import 'core_providers.dart';

enum AuthStatus { unknown, unauthenticated, pending, authenticated }

class AuthState {
  const AuthState(this.status, [this.profile]);
  final AuthStatus status;
  final DeliveryProfile? profile;
}

/// Firebase sign-in worked but there is no `delivery_boys/{uid}` document yet.
/// The Firebase user stays signed in so the registration can reuse it.
class NoRiderAccount implements Exception {
  NoRiderAccount(this.email);
  final String? email;
}

/// Session handling:
///  * Firebase: Firebase Auth (email/password) → `syncProfile({app:'delivery'})` → ID token refresh
///    (claims) → realtime `users/{uid}` + `delivery_boys/{uid}`;
///  * offline demo (`USE_MOCK=true`, or Firebase unreachable with `FALLBACK_TO_MOCK`):
///    demo login against the mock backend, no Firebase involved.
class AuthNotifier extends Notifier<AuthState> {
  StreamSubscription<DeliveryProfile>? _profileSub;

  @override
  AuthState build() {
    ref.onDispose(() => _profileSub?.cancel());
    PushService.onToken = (token) {
      if (state.status == AuthStatus.authenticated || state.status == AuthStatus.pending) {
        ref.read(repositoryProvider).saveFcmToken(token).catchError((Object e) => debugPrint('[auth] token save failed: $e'));
      }
    };
    Future.microtask(_restore);
    return const AuthState(AuthStatus.unknown);
  }

  AuthState _stateFor(DeliveryProfile p) =>
      AuthState(p.isApproved ? AuthStatus.authenticated : AuthStatus.pending, p);

  AppStorage get _store => AppStorage.instance;

  bool get _useDemo => DemoMode.isOn || (!FirebaseAuthService.available && AppConfig.fallbackToMock);

  /// Applies a profile and keeps it in sync (approval, online flag, cash in hand…).
  void _signedIn(DeliveryProfile p) {
    state = _stateFor(p);
    _profileSub?.cancel();
    _profileSub = ref.read(repositoryProvider).watchProfile().listen((next) async {
      if (state.status == AuthStatus.unauthenticated) return;
      final wasApproved = state.profile?.isApproved ?? false;
      if (!next.isActive || next.isRejected) {
        await _clear();
        // Rejected / blocked while signed in (e.g. on the Pending Approval screen): tell the rider why.
        final l = AppLocalizations.current;
        final msg = next.isRejected
            ? [l.t('account_rejected'), if ((next.approvalRemark ?? '').isNotEmpty) next.approvalRemark!].join('\n')
            : l.t('account_inactive');
        scaffoldMessengerKey.currentState?.showSnackBar(SnackBar(
          content: Text(msg),
          backgroundColor: const Color(0xFFD92D20),
          behavior: SnackBarBehavior.floating,
          duration: const Duration(seconds: 8),
        ));
        return;
      }
      // Approved while waiting: refresh the ID token so the `zone_id` claim reaches the rules.
      if (next.isApproved && !wasApproved && !DemoMode.isOn) {
        try {
          await ref.read(repositoryProvider).session(fcmToken: PushService.fcmToken);
        } catch (_) {}
      }
      state = _stateFor(next);
    }, onError: (Object e) => debugPrint('[auth] profile stream: $e'));
  }

  Future<void> _restore() async {
    final minSplash = Future<void>.delayed(const Duration(milliseconds: 1600));
    DeliveryProfile? profile;
    try {
      final user = DemoMode.isOn ? null : await FirebaseAuthService.restoredUser();
      if (user != null) {
        try {
          final r = await ref.read(repositoryProvider).session(fcmToken: PushService.fcmToken);
          final p = r.profile;
          if (p != null && !p.isRejected) {
            profile = p;
            await _store.setDemoSession(false);
          } else {
            await FirebaseAuthService.signOut(); // not registered / rejected → login screen
          }
        } on AppException catch (e) {
          if (e.isNetwork && AppConfig.fallbackToMock && _store.demoSession) {
            DemoMode.activate();
            profile = await ref.read(repositoryProvider).getProfile();
          } else if (!e.isNetwork) {
            await FirebaseAuthService.signOut();
          }
        }
      } else if (_store.demoSession && (AppConfig.useMock || AppConfig.fallbackToMock)) {
        DemoMode.activate();
        profile = await ref.read(repositoryProvider).getProfile();
      }
    } catch (e) {
      debugPrint('[auth] restore failed: $e');
    }
    await minSplash;
    if (profile != null) {
      _signedIn(profile);
    } else {
      state = const AuthState(AuthStatus.unauthenticated);
    }
  }

  /// Firebase `signInWithEmailAndPassword` → `syncProfile` → rider profile.
  /// Throws [NoRiderAccount] when the login has no rider account yet.
  Future<void> login(String email, String password) async {
    email = email.trim();
    if (_useDemo) return _demoLogin(email, password);
    if (!FirebaseAuthService.available) throw AuthFailure('firebase_unavailable');
    try {
      await FirebaseAuthService.signIn(email, password);
    } on AppException catch (e) {
      if (e.isNetwork && AppConfig.fallbackToMock) return _demoLogin(email, password);
      rethrow;
    }
    final SessionResult r;
    try {
      r = await ref.read(repositoryProvider).session(fcmToken: PushService.fcmToken);
    } catch (e) {
      await FirebaseAuthService.signOut();
      rethrow; // blocked / panel account / network
    }
    final p = r.profile;
    if (p == null) throw NoRiderAccount(FirebaseAuthService.currentUser?.email ?? email);
    if (p.isRejected) {
      await FirebaseAuthService.signOut();
      throw AuthFailure('account_rejected', p.approvalRemark == null ? null : '${p.approvalRemark}');
    }
    await _store.setDemoSession(false);
    _signedIn(p);
  }

  Future<void> _demoLogin(String email, String password) async {
    DemoMode.activate();
    final p = await ref.read(repositoryProvider).demoLogin(email, password);
    await _store.setDemoSession(true);
    _signedIn(p);
  }

  /// Creates the Firebase account (unless the signed-in Firebase user already has this e-mail –
  /// a retry, or a login without rider account), uploads the documents to Storage and calls
  /// `registerDeliveryBoy`. When that fails the Firebase user stays signed in so the submission can
  /// be retried. [onAccountCreated] fires when a new Firebase account was created by this call.
  Future<void> register(RegistrationData data, {VoidCallback? onAccountCreated}) async {
    final repo = ref.read(repositoryProvider);
    if (_useDemo) {
      DemoMode.activate();
      final p = await repo.register(data);
      await _store.setDemoSession(true);
      _signedIn(p);
      return;
    }
    if (!FirebaseAuthService.available) throw AuthFailure('firebase_unavailable');
    final email = data.email.trim();
    final current = FirebaseAuthService.currentUser;
    if (current == null || (current.email ?? '').toLowerCase() != email.toLowerCase()) {
      if (current != null) await FirebaseAuthService.signOut();
      if (await FirebaseAuthService.createAccount(email, data.password, data.name)) {
        onAccountCreated?.call();
      } else {
        // Signed in to an existing account with this e-mail/password: never convert a customer or
        // panel account into a rider, and an existing rider just signs in.
        final SessionResult r;
        try {
          r = await repo.session(fcmToken: PushService.fcmToken);
        } catch (e) {
          await FirebaseAuthService.signOut();
          rethrow;
        }
        final existing = r.profile;
        if (existing != null && !existing.isRejected) {
          await _store.setDemoSession(false);
          _signedIn(existing);
          return;
        }
      }
    }
    final p = await repo.register(data, fcmToken: PushService.fcmToken);
    await _store.setDemoSession(false);
    _signedIn(p);
  }

  /// Leaves an unfinished registration: deletes the Firebase account created for it
  /// ([deleteAccount]) or just signs out.
  Future<void> cancelRegistration({required bool deleteAccount}) async {
    if (state.status != AuthStatus.unauthenticated || DemoMode.isOn) return;
    if (deleteAccount) {
      await FirebaseAuthService.deleteCurrentUser();
    } else {
      await FirebaseAuthService.signOut();
    }
  }

  /// Firebase password reset e-mail (simulated in the offline demo).
  Future<void> sendPasswordReset(String email) async {
    if (_useDemo) {
      await Future<void>.delayed(const Duration(milliseconds: 700));
      return;
    }
    await FirebaseAuthService.sendPasswordReset(email.trim());
  }

  /// Re-authenticates and changes the Firebase password (simulated in the offline demo).
  Future<void> changePassword(String current, String newPassword) async {
    if (DemoMode.isOn) {
      await Future<void>.delayed(const Duration(milliseconds: 600));
      if (_store.mockUser == 'alex' && current != AppConfig.demoPassword) {
        throw AuthFailure('auth_wrong_current_password');
      }
      return;
    }
    await FirebaseAuthService.changePassword(current, newPassword);
  }

  /// Re-reads the profile (Pending Approval "Check status", pull-to-refresh); re-syncs the claims.
  Future<void> refreshProfile() async {
    final repo = ref.read(repositoryProvider);
    if (!DemoMode.isOn && state.status == AuthStatus.pending) {
      final r = await repo.session(fcmToken: PushService.fcmToken);
      if (r.profile != null) state = _stateFor(r.profile!);
      return;
    }
    state = _stateFor(await repo.getProfile());
  }

  Future<void> updateProfile(Map<String, dynamic> fields) async {
    final p = await ref.read(repositoryProvider).updateProfile(fields);
    state = _stateFor(p);
  }

  /// Goes offline, removes this device's FCM token from `users/{uid}.fcm_tokens`, then Firebase `signOut()`.
  Future<void> logout() async {
    try {
      await ref.read(repositoryProvider).logout(fcmToken: PushService.fcmToken);
    } catch (_) {}
    await _clear();
  }

  /// Deletes the account on the server (Firebase Auth user + personal data), then clears the local session.
  /// Errors (active orders, unsettled cash) are rethrown so the UI can show them.
  Future<void> deleteAccount() async {
    await ref.read(repositoryProvider).deleteAccount();
    await _clear();
  }

  Future<void> _clear() async {
    await _profileSub?.cancel();
    _profileSub = null;
    await FirebaseAuthService.signOut();
    await _store.setDemoSession(false);
    DemoMode.reset();
    state = const AuthState(AuthStatus.unauthenticated);
  }
}

final authProvider = NotifierProvider<AuthNotifier, AuthState>(AuthNotifier.new);

/// Convenience: the signed-in profile (null when logged out).
final profileProvider = Provider<DeliveryProfile?>((ref) => ref.watch(authProvider).profile);
