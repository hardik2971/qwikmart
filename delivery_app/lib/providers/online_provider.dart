import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/app_exception.dart';
import '../core/config.dart';
import '../core/l10n.dart';
import '../core/location_service.dart';
import '../core/push_service.dart';
import 'auth_provider.dart';
import 'core_providers.dart';
import 'data_providers.dart';

/// Online/offline duty status. While online, the rider location is streamed
/// and written to `delivery_boys/{uid}.location` every ~10 s.
class OnlineNotifier extends Notifier<bool> {
  LocationService? _location;
  Timer? _demoOrderTimer;
  bool _toggling = false;

  @override
  bool build() {
    ref.listen(authProvider, (prev, next) {
      if (next.status != AuthStatus.authenticated) {
        if (state) _stopTracking();
        state = false;
        return;
      }
      // Signed in (another rider, approval, session restore): adopt the server's duty status so
      // a rider who is still `is_online` keeps sending its location.
      if (prev?.status != AuthStatus.authenticated || prev?.profile?.id != next.profile?.id) {
        final online = next.profile?.isOnline ?? false;
        state = online;
        if (online) {
          Future.microtask(_resumeTracking);
        } else {
          _stopTracking();
        }
      }
      // Same rider: follow the server flag when it changes outside a toggle in flight (admin set the
      // rider offline, or a slow setOnline call finished after the app had given up on it).
      else if (!_toggling && prev?.profile?.isOnline != next.profile?.isOnline) {
        final online = next.profile?.isOnline ?? false;
        if (online != state) {
          state = online;
          if (online) {
            Future.microtask(_resumeTracking);
          } else {
            _stopTracking();
          }
        }
      }
    });
    ref.onDispose(_stopTracking);
    final initial = ref.read(authProvider).profile?.isOnline ?? false;
    if (initial) Future.microtask(_resumeTracking);
    return initial;
  }

  /// Going online needs location access (riders are assigned by distance and tracked by the
  /// customer): without it an [AppException] (`location_required`) is thrown and the rider stays
  /// offline. Returns false only if tracking could not start after all.
  Future<bool> setOnline(bool online) async {
    final repo = ref.read(repositoryProvider);
    if (online && !DemoMode.isOn && !await LocationService.ensurePermission()) {
      throw AppException(AppLocalizations.current.t('location_required'), code: 'location_required');
    }
    final previous = state;
    state = online; // optimistic
    _toggling = true;
    try {
      await repo.setOnline(online);
    } catch (e) {
      state = previous;
      rethrow;
    } finally {
      _toggling = false;
    }
    var located = true;
    if (online) {
      located = await _startTracking();
      _scheduleDemoOrder();
    } else {
      await _stopTracking();
    }
    ref.invalidate(dashboardProvider);
    ref.invalidate(ordersProvider);
    return located;
  }

  /// Session restore / sign-in while still `is_online`: without location access go offline
  /// instead of staying online without sharing a position.
  Future<void> _resumeTracking() async {
    if (await _startTracking()) return;
    try {
      await ref.read(repositoryProvider).setOnline(false);
    } catch (_) {}
    await _stopTracking();
    state = false;
  }

  Future<bool> _startTracking() async {
    final repo = ref.read(repositoryProvider);
    _location ??= LocationService(onTick: repo.sendLocation);
    return _location!.start();
  }

  Future<void> _stopTracking() async {
    _demoOrderTimer?.cancel();
    _demoOrderTimer = null;
    await _location?.stop();
  }

  /// In demo mode simulate an FCM "new order" push shortly after going online.
  void _scheduleDemoOrder() {
    final repo = ref.read(repositoryProvider);
    if (!repo.usingMock) return;
    _demoOrderTimer?.cancel();
    _demoOrderTimer = Timer(const Duration(seconds: 12), () {
      if (!state) return;
      final o = repo.mock.simulateIncomingOrder();
      PushService.show(
        'New delivery request',
        '${o.orderNumber} · ${o.store.name} · ${o.distanceKm} km',
        payload: o.id.toString(),
      );
      refreshOrderData(ref.invalidate);
    });
  }
}

final onlineProvider = NotifierProvider<OnlineNotifier, bool>(OnlineNotifier.new);
