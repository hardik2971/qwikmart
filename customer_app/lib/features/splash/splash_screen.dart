import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/l10n/app_localizations.dart';
import '../../providers/providers.dart';

class SplashScreen extends ConsumerStatefulWidget {
  const SplashScreen({super.key});
  @override
  ConsumerState<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends ConsumerState<SplashScreen> with SingleTickerProviderStateMixin {
  late final AnimationController _c =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 900))..forward();

  @override
  void initState() {
    super.initState();
    _boot();
  }

  Future<void> _boot() async {
    final started = DateTime.now();
    try {
      final settings = await ref.read(appSettingsProvider.future).timeout(const Duration(seconds: 4));
      ref.read(sessionProvider.notifier).setCurrency(settings.currencySymbol);
    } catch (_) {}
    final wait = const Duration(milliseconds: 1500) - DateTime.now().difference(started);
    if (wait > Duration.zero) await Future<void>.delayed(wait);
    if (!mounted) return;
    final s = ref.read(sessionProvider);
    if (!s.onboarded) {
      context.go('/onboarding');
    } else if (!s.hasLocation) {
      context.go('/location');
    } else {
      context.go('/home');
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      // QwikMart brand blue — matches the native splash (flutter_native_splash.yaml).
      backgroundColor: const Color(0xFF033EAB),
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            colors: [Color(0xFF0A4FCC), Color(0xFF033EAB), Color(0xFF022C7A)],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
        ),
        child: Center(
          child: FadeTransition(
            opacity: CurvedAnimation(parent: _c, curve: Curves.easeOut),
            child: ScaleTransition(
              scale: Tween(begin: 0.85, end: 1.0).animate(CurvedAnimation(parent: _c, curve: Curves.easeOutBack)),
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                Image.asset('assets/brand/qwikmart-mark-white.png', width: 120, height: 120, semanticLabel: 'QwikMart'),
                const SizedBox(height: 14),
                const Text('QwikMart',
                    style: TextStyle(color: Colors.white, fontSize: 34, fontWeight: FontWeight.w800, letterSpacing: -0.5)),
                const SizedBox(height: 6),
                Text(context.tr('splash_tagline'),
                    style: TextStyle(color: Colors.white.withValues(alpha: 0.88), fontSize: 14, fontWeight: FontWeight.w500)),
              ]),
            ),
          ),
        ),
      ),
    );
  }
}
