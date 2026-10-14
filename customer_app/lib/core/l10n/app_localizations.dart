import 'dart:convert';

import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';

/// JSON-backed localizations. Strings live in `assets/l10n/<lang>.json` (en, ar, hi).
/// Missing keys fall back to English, then to the key itself.
class AppLocalizations {
  final Locale locale;
  final Map<String, String> _strings;
  final Map<String, String> _fallback;

  AppLocalizations(this.locale, this._strings, this._fallback);

  static const supportedLocales = [Locale('en'), Locale('ar'), Locale('hi')];
  static const rtlLanguages = {'ar'};

  static const languages = <String, String>{'en': 'English', 'ar': 'العربية', 'hi': 'हिन्दी'};

  static const LocalizationsDelegate<AppLocalizations> delegate = _AppLocalizationsDelegate();

  static AppLocalizations of(BuildContext context) =>
      Localizations.of<AppLocalizations>(context, AppLocalizations) ?? AppLocalizations(const Locale('en'), const {}, const {});

  bool get isRtl => rtlLanguages.contains(locale.languageCode);

  String t(String key, [Map<String, Object?>? args]) {
    var s = _strings[key] ?? _fallback[key] ?? key;
    if (args != null) {
      args.forEach((k, v) => s = s.replaceAll('{$k}', '${v ?? ''}'));
    }
    return s;
  }

  static final Map<String, Map<String, String>> _cache = {};

  static Future<Map<String, String>> _loadJson(String code) async {
    if (_cache.containsKey(code)) return _cache[code]!;
    try {
      final raw = await rootBundle.loadString('assets/l10n/$code.json');
      final map = (json.decode(raw) as Map).map((k, v) => MapEntry(k.toString(), v.toString()));
      return _cache[code] = map;
    } catch (e) {
      debugPrint('[l10n] failed to load $code: $e');
      return _cache[code] = {};
    }
  }

  static Future<AppLocalizations> load(Locale locale) async {
    final fallback = await _loadJson('en');
    final strings = locale.languageCode == 'en' ? fallback : await _loadJson(locale.languageCode);
    return AppLocalizations(locale, strings, fallback);
  }
}

class _AppLocalizationsDelegate extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  bool isSupported(Locale locale) =>
      AppLocalizations.supportedLocales.any((l) => l.languageCode == locale.languageCode);

  @override
  Future<AppLocalizations> load(Locale locale) => AppLocalizations.load(locale);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

extension TrX on BuildContext {
  String tr(String key, [Map<String, Object?>? args]) => AppLocalizations.of(this).t(key, args);
}
