import 'package:deliveryboy/core/l10n.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const keys = [
    'login', 'account_rejected', 'account_inactive', 'online_msg', 'location_required', 'short_amount',
    'collected_less', 'min_withdraw', 'status_pickup_assigned', 'no_data', 'qty',
  ];
  test('Arabic and Hindi translate every checked key (no English fallback)', () {
    final en = AppLocalizations(const Locale('en'));
    for (final code in ['ar', 'hi']) {
      final l = AppLocalizations(Locale(code));
      for (final k in keys) {
        expect(l.t(k), isNot(k), reason: '$code:$k missing');
        expect(l.t(k), isNot(en.t(k)), reason: '$code:$k falls back to English');
      }
    }
  });
  test('Arabic is a supported (RTL) locale', () {
    expect(AppLocalizations.supportedLocales.map((l) => l.languageCode), containsAll(['en', 'ar', 'hi']));
  });
}
