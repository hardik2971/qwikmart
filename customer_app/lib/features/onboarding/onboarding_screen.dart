import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/l10n/app_localizations.dart';
import '../../core/theme.dart';
import '../../providers/providers.dart';
import '../../widgets/common.dart';

class OnboardingScreen extends ConsumerStatefulWidget {
  const OnboardingScreen({super.key});
  @override
  ConsumerState<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _Slide {
  final List<String> emojis;
  final String titleKey;
  final String bodyKey;
  final List<Color> colors;
  final String image;
  const _Slide(this.emojis, this.titleKey, this.bodyKey, this.colors, this.image);
}

class _OnboardingScreenState extends ConsumerState<OnboardingScreen> {
  final _page = PageController();
  int _index = 0;

  static const _slides = [
    _Slide(['🛒', '⚡', '🥛'], 'onb_title_1', 'onb_body_1', AppColors.quickGradient, 'assets/images/onboarding/onboarding-1.webp'),
    _Slide(['📱', '👟', '💄'], 'onb_title_2', 'onb_body_2', AppColors.ecommerceGradient, 'assets/images/onboarding/onboarding-3.webp'),
    _Slide(['🛵', '📍', '💳'], 'onb_title_3', 'onb_body_3', [Color(0xFFD7F0DC), Color(0xFFF1FAF3), Colors.white], 'assets/images/onboarding/onboarding-2.webp'),
  ];

  void _finish() {
    ref.read(sessionProvider.notifier).completeOnboarding();
    context.go(ref.read(sessionProvider).hasLocation ? '/home' : '/location');
  }

  @override
  void dispose() {
    _page.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final last = _index == _slides.length - 1;
    return Scaffold(
      backgroundColor: context.isDark ? AppColors.darkBg : Colors.white,
      body: SafeArea(
        child: Column(children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 8, 0),
            child: Row(children: [
              const BrandLogo(height: 30),
              const Spacer(),
              if (!last) TextButton(onPressed: _finish, child: Text(context.tr('skip'))),
            ]),
          ),
          Expanded(
            child: PageView.builder(
              controller: _page,
              itemCount: _slides.length,
              onPageChanged: (i) => setState(() => _index = i),
              itemBuilder: (_, i) {
                final s = _slides[i];
                return Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 28),
                  child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                    Container(
                      width: 260,
                      height: 260,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        gradient: RadialGradient(colors: context.isDark ? [AppColors.darkSurface, AppColors.darkBg] : s.colors),
                      ),
                      // photo illustration (firebase/tools/assets/ui); emoji cluster as fallback
                      child: Image.asset(
                        s.image,
                        fit: BoxFit.contain,
                        errorBuilder: (_, _, _) => Stack(alignment: Alignment.center, children: [
                          Text(s.emojis[0], style: const TextStyle(fontSize: 110)),
                          Positioned(top: 34, right: 34, child: Text(s.emojis[1], style: const TextStyle(fontSize: 48))),
                          Positioned(bottom: 30, left: 30, child: Text(s.emojis[2], style: const TextStyle(fontSize: 52))),
                        ]),
                      ),
                    ),
                    const SizedBox(height: 40),
                    Text(context.tr(s.titleKey),
                        textAlign: TextAlign.center,
                        style: context.text.headlineSmall?.copyWith(fontWeight: FontWeight.w800, height: 1.2)),
                    const SizedBox(height: 12),
                    Text(context.tr(s.bodyKey),
                        textAlign: TextAlign.center,
                        style: context.text.bodyLarge?.copyWith(color: context.mutedText, height: 1.45)),
                  ]),
                );
              },
            ),
          ),
          Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            for (var i = 0; i < _slides.length; i++)
              AnimatedContainer(
                duration: const Duration(milliseconds: 250),
                margin: const EdgeInsets.symmetric(horizontal: 3),
                width: i == _index ? 22 : 8,
                height: 8,
                decoration: BoxDecoration(
                  color: i == _index ? AppColors.primary : context.borderColor,
                  borderRadius: BorderRadius.circular(8),
                ),
              ),
          ]),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 24, 20, 20),
            child: AppButton(
              label: context.tr(last ? 'get_started' : 'next'),
              onPressed: () => last
                  ? _finish()
                  : _page.nextPage(duration: const Duration(milliseconds: 320), curve: Curves.easeOutCubic),
            ),
          ),
        ]),
      ),
    );
  }
}
