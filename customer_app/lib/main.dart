import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app.dart';
import 'core/auth_service.dart';
import 'core/config.dart';
import 'core/push.dart';
import 'core/theme.dart';
import 'providers/providers.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Firebase (Auth, Firestore, Functions, Storage, FCM) is the only backend. USE_EMULATORS=true connects the
  // local Emulator Suite. The offline demo data is used ONLY with --dart-define=USE_MOCK=true: if Firebase cannot
  // start, the app shows an error screen with a retry button instead of silently switching to demo data.
  if (!AppConfig.useMock && !await AuthService.initFirebase()) {
    debugPrint('[main] Firebase unavailable — showing the startup error screen');
    runApp(const _StartupErrorApp());
    return;
  }
  await _startApp();
}

Future<void> _startApp() async {
  final prefs = await SharedPreferences.getInstance();
  final session = await SessionNotifier.load(prefs);

  final container = ProviderContainer(overrides: [
    prefsProvider.overrideWithValue(prefs),
    initialSessionProvider.overrideWithValue(session),
  ]);
  AuthSync(container).start();

  runApp(UncontrolledProviderScope(container: container, child: const QwikMartApp()));

  // Push / local notifications are optional: failures are logged, never fatal.
  unawaited(PushService.init());
}

/// Shown when Firebase cannot be initialised (no network on first start, unsupported/unregistered platform…).
class _StartupErrorApp extends StatefulWidget {
  const _StartupErrorApp();

  @override
  State<_StartupErrorApp> createState() => _StartupErrorAppState();
}

class _StartupErrorAppState extends State<_StartupErrorApp> {
  bool _busy = false;

  Future<void> _retry() async {
    setState(() => _busy = true);
    if (await AuthService.initFirebase()) {
      await _startApp();
      return;
    }
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: AppConfig.appName,
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      home: Scaffold(
        body: SafeArea(
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(32),
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                const Icon(Icons.cloud_off_rounded, size: 64, color: AppColors.primary),
                const SizedBox(height: 16),
                const Text('Unable to connect to QwikMart',
                    textAlign: TextAlign.center, style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
                const SizedBox(height: 8),
                const Text('Please check your internet connection and try again.', textAlign: TextAlign.center),
                const SizedBox(height: 24),
                FilledButton(
                  onPressed: _busy ? null : _retry,
                  child: _busy
                      ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Text('Retry'),
                ),
              ]),
            ),
          ),
        ),
      ),
    );
  }
}
