import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/l10n/app_localizations.dart';
import '../../core/theme.dart';
import '../../core/utils.dart';
import '../../models/models.dart';
import '../../providers/providers.dart';
import '../../widgets/common.dart';
import 'section_renderer.dart';

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});
  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  String _categoryId = '';
  List<Category> _tabs = const [];
  String _lastMode = '';

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(sessionProvider);
    if (_lastMode != session.mode) {
      _lastMode = session.mode;
      _categoryId = '';
      _tabs = const [];
    }
    final home = ref.watch(homeProvider(_categoryId));
    final data = home.value;
    if (data != null &&
        data.categories.isNotEmpty &&
        (_categoryId.isEmpty || _tabs.isEmpty)) {
      // getHome returns only real top-level categories; the "All" tab (empty id) is client-side.
      _tabs = data.categories.any((c) => c.id.isEmpty)
          ? data.categories
          : [Category.all, ...data.categories];
    }

    // A selected category tints the category strip with its admin colour (header_color), as on the website.
    final selectedTab = _tabs.where((c) => c.id == _categoryId).firstOrNull;
    final tint = _categoryId.isNotEmpty && (selectedTab?.headerColor.isNotEmpty ?? false)
        ? AppColors.fromHex(selectedTab!.headerColor)
        : null;
    // Category pages carry their own search block (the hero with its search only shows on "All").
    final all = _categoryId.isEmpty;

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: context.isDark
          ? SystemUiOverlayStyle.light
          : SystemUiOverlayStyle.dark,
      child: Scaffold(
        backgroundColor: context.isDark ? AppColors.darkBg : AppColors.pageBg,
        body: RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(homeProvider(_categoryId));
            ref.invalidate(cartProvider);
            await ref.read(homeProvider(_categoryId).future);
          },
          child: CustomScrollView(
            slivers: [
              SliverToBoxAdapter(
                child: _HomeHeader(
                  tint: tint,
                  tabs: _tabs,
                  selectedId: _categoryId,
                  onTab: (id) => setState(() => _categoryId = id),
                ),
              ),
              SliverToBoxAdapter(
                child: all
                    ? const _Hero()
                    : const Padding(
                        padding: EdgeInsets.fromLTRB(16, 14, 16, 2),
                        child: _SearchBar(),
                      ),
              ),
              ...home.when(
                skipLoadingOnRefresh: true,
                loading: () => [
                  const SliverToBoxAdapter(child: _HomeSkeleton()),
                ],
                error: (e, _) => [
                  SliverFillRemaining(
                    hasScrollBody: false,
                    child: ErrorView(
                      error: e,
                      onRetry: () => ref.invalidate(homeProvider(_categoryId)),
                    ),
                  ),
                ],
                data: (d) => [
                  SliverList.builder(
                    itemCount: d.sections.length,
                    itemBuilder: (_, i) => HomeSectionView(
                      section: d.sections[i],
                      isFirst: i == 0,
                    ),
                  ),
                  const SliverToBoxAdapter(child: SizedBox(height: 24)),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _HomeSkeleton extends StatelessWidget {
  const _HomeSkeleton();
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const ShimmerBox(height: 168, radius: 16),
          const SizedBox(height: 20),
          const ShimmerBox(height: 18, width: 180, radius: 6),
          const SizedBox(height: 12),
          Row(
            children: [
              for (var i = 0; i < 4; i++)
                const Expanded(
                  child: Padding(
                    padding: EdgeInsets.all(4),
                    child: ShimmerBox(height: 90),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 20),
          Row(
            children: [
              for (var i = 0; i < 3; i++)
                const Expanded(
                  child: Padding(
                    padding: EdgeInsets.all(4),
                    child: ShimmerBox(height: 220),
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

/// White top bar (as on the website): logo + notifications, delivery pill + Quick/eCommerce switch, category tiles.
class _HomeHeader extends ConsumerWidget {
  final Color? tint;
  final List<Category> tabs;
  final String selectedId;
  final ValueChanged<String> onTab;
  const _HomeHeader({
    required this.tint,
    required this.tabs,
    required this.selectedId,
    required this.onTab,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = ref.watch(sessionProvider);
    final dark = context.isDark;
    final unread = ref.watch(unreadCountProvider);
    final surface = dark ? AppColors.darkSurface : Colors.white;
    final stripBg = tint == null || dark ? surface : Color.lerp(tint, Colors.white, 0.84)!;

    return Container(
      color: surface,
      child: SafeArea(
        bottom: false,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // logo · mode switch · notifications; the delivery pill gets its own full-width row so it never truncates
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 6, 0),
              child: Row(
                children: [
                  const BrandLogo(height: 26),
                  const Spacer(),
                  Flexible(
                    flex: 0,
                    child: _ModeToggle(
                      mode: s.mode,
                      onChanged: (m) => ref.read(sessionProvider.notifier).setMode(m),
                    ),
                  ),
                  const SizedBox(width: 2),
                  _CircleIconButton(
                    icon: Icons.notifications_none_rounded,
                    badge: unread,
                    onTap: () => context.push('/notifications'),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 6, 16, 10),
              child: _DeliveryPill(session: s),
            ),
            if (tabs.isNotEmpty)
              AnimatedContainer(
                duration: const Duration(milliseconds: 300),
                height: 92,
                decoration: BoxDecoration(
                  color: stripBg,
                  border: Border(
                    top: BorderSide(color: context.borderColor),
                    bottom: BorderSide(color: context.borderColor),
                  ),
                ),
                child: ListView.builder(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
                  itemCount: tabs.length,
                  itemBuilder: (_, i) {
                    final c = tabs[i];
                    return _CategoryTab(category: c, active: c.id == selectedId, onTap: () => onTab(c.id));
                  },
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// Orange speed badge + "Delivery in 8 minutes" + address (opens the location screen).
class _DeliveryPill extends StatelessWidget {
  final SessionState session;
  const _DeliveryPill({required this.session});

  @override
  Widget build(BuildContext context) {
    final s = session;
    final title = !s.hasLocation
        ? context.tr('set_location')
        : s.isQuick
        ? '${context.tr('delivery_in')} ${context.tr('n_minutes', {'n': s.deliveryMinutes})}'
        : context.tr('delivery_in_days');
    final place = s.address.isNotEmpty ? s.address : (s.zoneName.isNotEmpty ? s.zoneName : context.tr('set_location'));
    final sub = s.isQuick && s.distanceKm > 0 ? '$place · ${s.distanceKm.toStringAsFixed(1)} km' : place;
    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: () => context.push('/location?from=app'),
      child: Padding(
        padding: const EdgeInsets.all(4),
        child: Row(
          children: [
            Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(
                color: context.isDark ? Colors.white10 : AppColors.accent50,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(
                s.isQuick && s.hasLocation ? Icons.bolt_rounded : Icons.place_outlined,
                color: AppColors.accentInk,
                size: 22,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: displayStyle(
                      size: 15.5,
                      weight: FontWeight.w700,
                      color: context.isDark ? Colors.white : AppColors.ink,
                      letterSpacing: -0.2,
                    ),
                  ),
                  Row(
                    children: [
                      Flexible(
                        child: Text(
                          sub,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(fontSize: 12, color: context.mutedText, fontWeight: FontWeight.w500),
                        ),
                      ),
                      Icon(Icons.keyboard_arrow_down_rounded, size: 16, color: context.mutedText),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Category tile: icon on a rounded tile; active = blue ring + bold blue label.
class _CategoryTab extends StatelessWidget {
  final Category category;
  final bool active;
  final VoidCallback onTap;
  const _CategoryTab({required this.category, required this.active, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final c = category;
    final dark = context.isDark;
    final Widget icon;
    if (c.id.isEmpty) {
      // "All" uses the bundled 3D shopping-bags icon (same set as the category icons).
      icon = Image.asset('assets/images/icons/all.png', width: 28, height: 28);
    } else if (c.icon.isNotEmpty || c.image.isNotEmpty) {
      icon = AppImage(
        url: c.icon.isNotEmpty ? c.icon : c.image,
        name: c.name,
        width: 28,
        height: 28,
        fit: BoxFit.contain,
        background: Colors.transparent,
      );
    } else {
      icon = Text(emojiFor(c.name), style: const TextStyle(fontSize: 22));
    }
    final label = c.name == 'Fresh Fruits & Vegetables' ? 'Fresh' : c.name;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: SizedBox(
        width: 72,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              width: 48,
              height: 48,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: active
                    ? (dark ? AppColors.primary.withValues(alpha: 0.18) : AppColors.primary50)
                    : (dark ? Colors.white10 : AppColors.soft),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: active ? AppColors.primary : Colors.transparent, width: 2),
              ),
              child: icon,
            ),
            const SizedBox(height: 5),
            Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 11.5,
                color: active ? AppColors.primary : (dark ? Colors.white70 : AppColors.bodyText),
                fontWeight: active ? FontWeight.w800 : FontWeight.w500,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Segmented Quick / eCommerce switch: navy pill for the active mode, bolt icon on Quick.
class _ModeToggle extends StatelessWidget {
  final String mode;
  final ValueChanged<String> onChanged;
  const _ModeToggle({required this.mode, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    final dark = context.isDark;
    Widget seg(String value, String label) {
      final active = mode == value;
      final fg = active ? Colors.white : (dark ? Colors.white70 : AppColors.bodyText);
      return GestureDetector(
        onTap: () => onChanged(value),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 220),
          height: 34,
          padding: const EdgeInsets.symmetric(horizontal: 11),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: active ? AppColors.night : Colors.transparent,
            borderRadius: BorderRadius.circular(999),
          ),
          // long labels (e.g. Arabic "eCommerce") shrink instead of squeezing the delivery pill
          child: FittedBox(
            fit: BoxFit.scaleDown,
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (value == 'quick') ...[
                  Icon(Icons.bolt_rounded, size: 15, color: active ? AppColors.accent : fg),
                  const SizedBox(width: 2),
                ],
                Text(label, style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5, color: fg)),
              ],
            ),
          ),
        ),
      );
    }

    return ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 190),
      child: Container(
        padding: const EdgeInsets.all(3),
        decoration: BoxDecoration(
          color: dark ? Colors.white10 : AppColors.soft,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: context.borderColor),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Flexible(child: seg('quick', context.tr('quick'))),
            Flexible(child: seg('ecommerce', context.tr('ecommerce'))),
          ],
        ),
      ),
    );
  }
}

/// The logo's three orange "speed lines".
class _SpeedLines extends StatelessWidget {
  const _SpeedLines();
  @override
  Widget build(BuildContext context) {
    Widget line(double w, double a) => Container(
      width: w,
      height: 3,
      margin: const EdgeInsets.only(bottom: 3),
      decoration: BoxDecoration(color: AppColors.accent.withValues(alpha: a), borderRadius: BorderRadius.circular(3)),
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.end,
      mainAxisSize: MainAxisSize.min,
      children: [line(22, 1), line(15, 0.8), line(9, 0.6)],
    );
  }
}

/// Navy brand hero (the website's home hero): location chip, delivery promise, big search, browse link.
class _Hero extends ConsumerWidget {
  const _Hero();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = ref.watch(sessionProvider);
    final place = s.zoneName.isNotEmpty ? s.zoneName : s.address;
    final String chip;
    if (!s.hasLocation || place.isEmpty) {
      chip = context.tr('hero_set_location');
    } else if (s.isQuick && s.deliveryMinutes > 0) {
      chip = context.tr('hero_eta_to', {'mins': s.deliveryMinutes, 'place': place});
    } else {
      chip = context.tr('hero_delivering_to', {'place': place});
    }
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 4),
      child: Container(
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(color: AppColors.night, borderRadius: BorderRadius.circular(AppRadius.hero)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Material(
              color: Colors.white.withValues(alpha: 0.10),
              shape: StadiumBorder(side: BorderSide(color: Colors.white.withValues(alpha: 0.15))),
              child: InkWell(
                customBorder: const StadiumBorder(),
                onTap: () => context.push('/location?from=app'),
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(6, 5, 10, 5),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        width: 24,
                        height: 24,
                        decoration: const BoxDecoration(color: AppColors.accent, shape: BoxShape.circle),
                        child: const Icon(Icons.place_rounded, size: 14, color: Colors.white),
                      ),
                      const SizedBox(width: 8),
                      Flexible(
                        child: Text(
                          chip,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w600),
                        ),
                      ),
                      const Icon(Icons.keyboard_arrow_down_rounded, size: 18, color: Colors.white70),
                    ],
                  ),
                ),
              ),
            ),
            const SizedBox(height: 16),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Padding(padding: EdgeInsets.only(top: 9), child: _SpeedLines()),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    context.tr(s.isQuick ? 'hero_quick_title' : 'hero_ecom_title'),
                    style: displayStyle(size: 27, weight: FontWeight.w800, color: Colors.white, height: 1.06, letterSpacing: -0.8),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Text(
              context.tr(s.isQuick ? 'hero_quick_sub' : 'hero_ecom_sub'),
              style: TextStyle(color: Colors.white.withValues(alpha: 0.75), fontSize: 14, height: 1.5),
            ),
            const SizedBox(height: 16),
            const _SearchBar(large: true),
            const SizedBox(height: 12),
            InkWell(
              onTap: () => context.go('/categories'),
              child: Text(
                context.tr('hero_browse'),
                style: TextStyle(
                  color: Colors.white.withValues(alpha: 0.85),
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  decoration: TextDecoration.underline,
                  decorationColor: Colors.white.withValues(alpha: 0.35),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CircleIconButton extends StatelessWidget {
  final IconData icon;
  final int badge;
  final VoidCallback onTap;
  const _CircleIconButton({
    required this.icon,
    this.badge = 0,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Stack(
      clipBehavior: Clip.none,
      children: [
        Material(
          color: context.cardColor,
          shape: const CircleBorder(),
          child: InkWell(
            customBorder: const CircleBorder(),
            onTap: onTap,
            child: Padding(
              padding: const EdgeInsets.all(9),
              child: Icon(icon, size: 22),
            ),
          ),
        ),
        if (badge > 0)
          Positioned(
            right: -2,
            top: -2,
            child: Container(
              padding: const EdgeInsets.all(4),
              constraints: const BoxConstraints(minWidth: 18),
              decoration: const BoxDecoration(
                color: AppColors.danger,
                shape: BoxShape.circle,
              ),
              child: Text(
                '$badge',
                textAlign: TextAlign.center,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 10,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
          ),
      ],
    );
  }
}

/// Search box with a rotating `Search "product"` hint and mic icon.
class _SearchBar extends StatefulWidget {
  /// Large white search inside the navy hero (as on the website); compact soft field elsewhere.
  final bool large;
  const _SearchBar({this.large = false});
  @override
  State<_SearchBar> createState() => _SearchBarState();
}

class _SearchBarState extends State<_SearchBar> {
  static const _hints = [
    'Amul Taaza Toned Milk',
    'Cesaro Organics Tea Tree Oil',
    'Safal Sweet Corn',
    'Aashirvaad Atta',
    "Lay's Magic Masala",
    'MINARA 60 Color Matte Lipstick',
    'boAt Airdopes 141',
  ];
  int _i = 0;
  Timer? _t;

  @override
  void initState() {
    super.initState();
    _t = Timer.periodic(const Duration(milliseconds: 2600), (_) {
      if (mounted) setState(() => _i = (_i + 1) % _hints.length);
    });
  }

  @override
  void dispose() {
    _t?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final large = widget.large;
    final radius = BorderRadius.circular(large ? 16 : 12);
    return Material(
      color: large ? Colors.white : (context.isDark ? context.cardColor : AppColors.soft),
      borderRadius: radius,
      child: InkWell(
        borderRadius: radius,
        onTap: () => context.push('/search'),
        child: Container(
          height: large ? 54 : 48,
          padding: const EdgeInsets.symmetric(horizontal: 14),
          decoration: BoxDecoration(
            borderRadius: radius,
            border: large ? null : Border.all(color: context.borderColor),
            boxShadow: large ? AppShadows.pop : null,
          ),
          child: Row(
            children: [
              Icon(Icons.search_rounded, color: large ? AppColors.primary : context.mutedText),
              const SizedBox(width: 8),
              Expanded(
                child: ClipRect(
                  child: AnimatedSwitcher(
                    duration: const Duration(milliseconds: 350),
                    transitionBuilder: (c, a) => SlideTransition(
                      position: Tween(
                        begin: const Offset(0, 0.6),
                        end: Offset.zero,
                      ).animate(a),
                      child: FadeTransition(opacity: a, child: c),
                    ),
                    child: Align(
                      key: ValueKey(_i),
                      alignment: AlignmentDirectional.centerStart,
                      child: Text(
                        context.tr('search_hint', {'q': _hints[_i]}),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: large ? AppColors.muted : context.mutedText,
                          fontSize: large ? 14.5 : 13.5,
                        ),
                      ),
                    ),
                  ),
                ),
              ),
              Container(width: 1, height: 22, color: large ? AppColors.border : context.borderColor),
              const SizedBox(width: 10),
              InkWell(
                onTap: () => context.push('/search?voice=1'),
                child: Icon(Icons.mic_none_rounded, color: large ? AppColors.primary : context.mutedText),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
