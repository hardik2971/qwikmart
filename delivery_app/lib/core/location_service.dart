import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';

import 'config.dart';

/// Streams the rider's position while online and invokes [onTick] every
/// [AppConfig.locationInterval] with the latest fix (→ `delivery_boys/{uid}.location`).
///
/// Only real GPS fixes are uploaded: without permission (or before the first fix) nothing is
/// written, so auto-assign and customer tracking never see a made-up position. The offline demo
/// ([DemoMode]) uses a fixed position near the demo store instead.
class LocationService {
  LocationService({required this.onTick});

  final Future<void> Function(double lat, double lng) onTick;

  /// Last known position, also used for the rider marker on maps.
  static final ValueNotifier<LatLng?> lastPosition = ValueNotifier<LatLng?>(null);

  /// Demo position near the mock "Mumbai Store".
  static const demoPosition = LatLng(19.1112, 72.8641);

  StreamSubscription<Position>? _sub;
  Timer? _timer;
  bool _hasFix = false;

  bool get isRunning => _timer != null;

  static Future<bool> ensurePermission() async {
    try {
      if (!await Geolocator.isLocationServiceEnabled()) return false;
      var p = await Geolocator.checkPermission();
      if (p == LocationPermission.denied) p = await Geolocator.requestPermission();
      return p == LocationPermission.always || p == LocationPermission.whileInUse;
    } catch (e) {
      debugPrint('[location] permission check failed: $e');
      return false;
    }
  }

  /// Keeps updates flowing while the app is in the background during a shift: an Android foreground
  /// service with a persistent notification, iOS background location updates (UIBackgroundModes).
  static LocationSettings _settings() {
    if (kIsWeb) return const LocationSettings(accuracy: LocationAccuracy.high, distanceFilter: 10);
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return AndroidSettings(
          accuracy: LocationAccuracy.high,
          distanceFilter: 10,
          intervalDuration: AppConfig.locationInterval,
          foregroundNotificationConfig: const ForegroundNotificationConfig(
            notificationTitle: 'QwikMart Delivery – you are online',
            notificationText: 'Your location is shared with the store and customers for active deliveries.',
            notificationChannelName: 'Online status',
            enableWakeLock: true,
            setOngoing: true,
          ),
        );
      case TargetPlatform.iOS:
        return AppleSettings(
          accuracy: LocationAccuracy.high,
          distanceFilter: 10,
          activityType: ActivityType.automotiveNavigation,
          pauseLocationUpdatesAutomatically: false,
          allowBackgroundLocationUpdates: true,
          showBackgroundLocationIndicator: true,
        );
      default:
        return const LocationSettings(accuracy: LocationAccuracy.high, distanceFilter: 10);
    }
  }

  void _fix(double lat, double lng) {
    _hasFix = true;
    lastPosition.value = LatLng(lat, lng);
  }

  /// Starts tracking; returns false when location permission / services are unavailable (the caller
  /// then keeps / puts the rider offline) or when [stop] was called meanwhile.
  Future<bool> start() async {
    final gen = _generation;
    final r = await (_starting ??= _start().whenComplete(() => _starting = null));
    if (r != null) return r;
    if (gen != _generation) return false; // stopped after this call
    return start(); // an older, cancelled start – start again
  }

  Future<bool?>? _starting;

  /// Bumped by [stop] so a start that is still waiting for permission / the first fix gives up.
  int _generation = 0;

  /// null = cancelled by [stop] before tracking began.
  Future<bool?> _start() async {
    if (isRunning) return true;
    final gen = _generation;
    final ok = await ensurePermission();
    if (ok) {
      try {
        final first = await Geolocator.getCurrentPosition().timeout(const Duration(seconds: 8));
        _fix(first.latitude, first.longitude);
      } catch (_) {}
      if (gen != _generation) return null; // went offline meanwhile
      try {
        _sub = Geolocator.getPositionStream(locationSettings: _settings()).listen(
          (p) => _fix(p.latitude, p.longitude),
          onError: (Object e) => debugPrint('[location] stream error: $e'),
        );
      } catch (e) {
        debugPrint('[location] stream unavailable: $e');
      }
    }
    if (DemoMode.isOn && !_hasFix) _fix(demoPosition.latitude, demoPosition.longitude);
    _timer = Timer.periodic(AppConfig.locationInterval, (_) => _push());
    _push();
    return ok || DemoMode.isOn;
  }

  Future<void> _push() async {
    final p = lastPosition.value;
    if (p == null || !_hasFix) return;
    try {
      await onTick(p.latitude, p.longitude);
    } catch (e) {
      debugPrint('[location] upload failed: $e');
    }
  }

  Future<void> stop() async {
    _generation++;
    _timer?.cancel();
    _timer = null;
    await _sub?.cancel();
    _sub = null;
  }
}
