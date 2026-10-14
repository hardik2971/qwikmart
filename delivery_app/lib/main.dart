import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/auth_service.dart';
import 'core/config.dart';
import 'core/l10n.dart';
import 'core/push_service.dart';
import 'core/router.dart';
import 'core/storage.dart';
import 'core/theme.dart';
import 'providers/core_providers.dart';
import 'providers/data_providers.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await AppStorage.init();
  // Firebase Authentication is the identity provider; never blocks or crashes startup
  // (e.g. iOS is not registered yet → the offline demo login is used instead).
  await FirebaseInit.init();

  final container = ProviderContainer();

  // Push: refresh order data on "new order" pushes, deep-link on tap.
  PushService.onMessage = (data) => refreshOrderData(container.invalidate);
  PushService.onOpen = (data) {
    refreshOrderData(container.invalidate);
    final id = data['order_id']?.toString() ?? '';
    if (id.isNotEmpty) container.read(routerProvider).push('/order/$id');
  };
  // Fire and forget – never block startup on Firebase.
  PushService.init();

  runApp(UncontrolledProviderScope(container: container, child: const DeliveryApp()));
}

class DeliveryApp extends ConsumerWidget {
  const DeliveryApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);
    final locale = ref.watch(localeProvider);
    final themeMode = ref.watch(themeModeProvider);
    return MaterialApp.router(
      title: AppConfig.appName,
      debugShowCheckedModeBanner: false,
      scaffoldMessengerKey: scaffoldMessengerKey,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: themeMode,
      locale: locale,
      supportedLocales: AppLocalizations.supportedLocales,
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      routerConfig: router,
    );
  }
}
