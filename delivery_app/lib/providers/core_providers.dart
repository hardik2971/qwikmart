import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/storage.dart';
import '../repositories/delivery_repository.dart';

final repositoryProvider = Provider<DeliveryRepository>((ref) => DeliveryRepository());

class LocaleNotifier extends Notifier<Locale> {
  @override
  Locale build() => Locale(AppStorage.instance.locale ?? 'en');

  Future<void> set(String code) async {
    state = Locale(code);
    await AppStorage.instance.setLocale(code);
  }
}

final localeProvider = NotifierProvider<LocaleNotifier, Locale>(LocaleNotifier.new);

class ThemeModeNotifier extends Notifier<ThemeMode> {
  @override
  ThemeMode build() {
    switch (AppStorage.instance.themeMode) {
      case 'light':
        return ThemeMode.light;
      case 'dark':
        return ThemeMode.dark;
      default:
        return ThemeMode.system;
    }
  }

  Future<void> set(ThemeMode mode) async {
    state = mode;
    await AppStorage.instance.setThemeMode(mode.name);
  }
}

final themeModeProvider = NotifierProvider<ThemeModeNotifier, ThemeMode>(ThemeModeNotifier.new);
