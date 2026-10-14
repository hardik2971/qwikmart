import 'dart:convert';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/utils.dart';
import '../models/models.dart';

/// Overridden in `main()` with the loaded instance.
final prefsProvider = Provider<SharedPreferences>((ref) => throw UnimplementedError('prefsProvider not overridden'));

/// Initial session loaded before `runApp`.
final initialSessionProvider = Provider<SessionState>((ref) => const SessionState());

class SessionState {
  /// Only for offline mock-mode logins (in-app mock data). Real sessions are Firebase Auth users.
  final String? mockToken;
  final AppUser? user;
  final bool onboarded;
  final String? zoneId;
  /// Store serving quick orders in the zone (zone `default_store_id` / detectZone store).
  final String storeId;
  final String zoneName;
  final String address;
  final double? lat;
  final double? lng;
  final double distanceKm;
  final int deliveryMinutes;
  final String mode; // quick | ecommerce
  final String locale;
  final ThemeMode themeMode;
  final String guestToken;
  final String countryId;
  final String currencySymbol;

  const SessionState({
    this.mockToken,
    this.user,
    this.onboarded = false,
    this.zoneId,
    this.storeId = '',
    this.zoneName = '',
    this.address = '',
    this.lat,
    this.lng,
    this.distanceKm = 0,
    this.deliveryMinutes = 8,
    this.mode = 'quick',
    this.locale = 'en',
    this.themeMode = ThemeMode.light,
    this.guestToken = '',
    this.countryId = '1',
    this.currencySymbol = '₹',
  });

  bool get isLoggedIn => user != null;
  bool get isMockSession => mockToken != null;
  bool get hasLocation => zoneId != null;
  bool get isQuick => mode == 'quick';

  /// Request context for the offline mock data source.
  Map<String, String> get headers => {
        if (mockToken != null) 'Authorization': 'Bearer $mockToken',
        'Accept-Language': locale,
        if (zoneId != null) 'X-Zone-Id': '$zoneId',
        'X-Mode': mode,
        'X-Platform': 'app',
        'X-Country-Id': countryId,
        if (guestToken.isNotEmpty) 'X-Guest-Token': guestToken,
      };

  SessionState copyWith({
    String? mockToken,
    AppUser? user,
    bool? onboarded,
    String? zoneId,
    String? storeId,
    String? zoneName,
    String? address,
    double? lat,
    double? lng,
    double? distanceKm,
    int? deliveryMinutes,
    String? mode,
    String? locale,
    ThemeMode? themeMode,
    String? guestToken,
    String? countryId,
    String? currencySymbol,
  }) =>
      SessionState(
        mockToken: mockToken ?? this.mockToken,
        user: user ?? this.user,
        onboarded: onboarded ?? this.onboarded,
        zoneId: zoneId ?? this.zoneId,
        storeId: storeId ?? this.storeId,
        zoneName: zoneName ?? this.zoneName,
        address: address ?? this.address,
        lat: lat ?? this.lat,
        lng: lng ?? this.lng,
        distanceKm: distanceKm ?? this.distanceKm,
        deliveryMinutes: deliveryMinutes ?? this.deliveryMinutes,
        mode: mode ?? this.mode,
        locale: locale ?? this.locale,
        themeMode: themeMode ?? this.themeMode,
        guestToken: guestToken ?? this.guestToken,
        countryId: countryId ?? this.countryId,
        currencySymbol: currencySymbol ?? this.currencySymbol,
      );

  SessionState signedOut() => SessionState(
        onboarded: onboarded,
        zoneId: zoneId,
        storeId: storeId,
        zoneName: zoneName,
        address: address,
        lat: lat,
        lng: lng,
        distanceKm: distanceKm,
        deliveryMinutes: deliveryMinutes,
        mode: mode,
        locale: locale,
        themeMode: themeMode,
        guestToken: guestToken,
        countryId: countryId,
        currencySymbol: currencySymbol,
      );

  Map<String, dynamic> toPrefs() => {
        // Only Firebase sessions are cached (restored at start when FirebaseAuth still has a user).
        'user': mockToken == null ? user?.toJson() : null,
        'onboarded': onboarded,
        'zone_id': zoneId,
        'store_id': storeId,
        'zone_name': zoneName,
        'address': address,
        'lat': lat,
        'lng': lng,
        'distance_km': distanceKm,
        'delivery_minutes': deliveryMinutes,
        'mode': mode,
        'locale': locale,
        'theme': themeMode.name,
        'guest_token': guestToken,
        'country_id': countryId,
        'currency_symbol': currencySymbol,
      };

  factory SessionState.fromPrefs(Map<String, dynamic> j) {
    final user = asMapOrNull(j['user']);
    return SessionState(
      user: user == null ? null : AppUser.fromJson(user),
      onboarded: asBool(j['onboarded']),
      zoneId: asIdOrNull(j['zone_id']),
      storeId: asString(j['store_id']),
      zoneName: asString(j['zone_name']),
      address: asString(j['address']),
      lat: asDoubleOrNull(j['lat']),
      lng: asDoubleOrNull(j['lng']),
      distanceKm: asDouble(j['distance_km']),
      deliveryMinutes: asInt(j['delivery_minutes'], 8),
      mode: asString(j['mode'], 'quick'),
      locale: asString(j['locale'], 'en'),
      themeMode: ThemeMode.values.firstWhere((t) => t.name == j['theme'], orElse: () => ThemeMode.light),
      guestToken: asString(j['guest_token']),
      countryId: asString(j['country_id'], '1'),
      currencySymbol: asString(j['currency_symbol'], '₹'),
    );
  }
}

class SessionNotifier extends StateNotifier<SessionState> {
  final SharedPreferences prefs;
  SessionNotifier(super.initial, this.prefs) {
    if (state.guestToken.isEmpty) {
      final r = Random.secure();
      final token = List.generate(24, (_) => r.nextInt(16).toRadixString(16)).join();
      state = state.copyWith(guestToken: 'g_$token');
      _persist();
    }
    Fmt.currencySymbol = state.currencySymbol;
  }

  static const _prefsKey = 'session_v1';

  /// Loads the cached session. A cached user is only a hint: [AuthSync] keeps it only while
  /// FirebaseAuth still has a signed-in user (the ID token is never stored by the app).
  static Future<SessionState> load(SharedPreferences prefs) async {
    await prefs.remove('auth_token'); // pre-Firebase Sanctum token (no longer used)
    final raw = prefs.getString(_prefsKey);
    if (raw == null) return const SessionState();
    try {
      return SessionState.fromPrefs(Map<String, dynamic>.from(json.decode(raw) as Map));
    } catch (_) {
      return const SessionState();
    }
  }

  void _persist() => prefs.setString(_prefsKey, json.encode(state.toPrefs()));

  void _set(SessionState s) {
    state = s;
    _persist();
  }

  void completeOnboarding() => _set(state.copyWith(onboarded: true));

  void setLocation({
    required String zoneId,
    String storeId = '',
    required String zoneName,
    required String address,
    double? lat,
    double? lng,
    double distanceKm = 0,
    int deliveryMinutes = 8,
    String? countryId,
  }) {
    _set(state.copyWith(
      zoneId: zoneId,
      storeId: storeId,
      zoneName: zoneName,
      address: address,
      lat: lat,
      lng: lng,
      distanceKm: distanceKm,
      deliveryMinutes: deliveryMinutes,
      countryId: countryId,
    ));
  }

  void setMode(String mode) => _set(state.copyWith(mode: mode));
  void setLocale(String code) => _set(state.copyWith(locale: code));
  void setThemeMode(ThemeMode m) => _set(state.copyWith(themeMode: m));

  void setCurrency(String symbol) {
    Fmt.currencySymbol = symbol;
    _set(state.copyWith(currencySymbol: symbol));
  }

  /// Stores the profile after a successful Firebase sign-in (+ `syncProfile`).
  /// [mockToken] is only set for offline mock-mode logins.
  Future<void> signIn(AppUser user, {String? mockToken}) async {
    _set(state.signedOut().copyWith(user: user, mockToken: mockToken));
  }

  void updateUser(AppUser user) => _set(state.copyWith(user: user));

  Future<void> signOut() async => _set(state.signedOut());
}

final sessionProvider = StateNotifierProvider<SessionNotifier, SessionState>(
  (ref) => SessionNotifier(ref.read(initialSessionProvider), ref.read(prefsProvider)),
);
