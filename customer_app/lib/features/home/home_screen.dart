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

    final selectedTab = _tabs.where((c) => c.id == _categoryId).firstOrNull;
    final fallback = session.isQuick
        ? AppColors.quickGradient.first
        : AppColors.ecommerceGradient.first;
    final headerColor = AppColors.fromHex(
      data?.header.bgValue.isNotEmpty == true && !home.isLoading
          ? data!.header.bgValue
          : selectedTab?.headerColor,
      fallback,
    );

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: context.isDark
          ? SystemUiOverlayStyle.light
          : SystemUiOverlayStyle.dark,
      child: Scaffold(
        backgroundColor: context.isDark ? AppColors.darkBg : Colors.white,
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
                  color: headerColor,
                  tabs: _tabs,
                  selectedId: _categoryId,
                  onTab: (id) => setState(() => _categoryId = id),
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

/// Gradient top: Quick/eCommerce toggle, delivery ETA, address, bell, search, category tabs.
class _HomeHeader extends ConsumerWidget {
  final Color color;
  final List<Category> tabs;
  final String selectedId;
  final ValueChanged<String> onTab;
  const _HomeHeader({
    required this.color,
    required this.tabs,
    required this.selectedId,
    required this.onTab,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = ref.watch(sessionProvider);
    final dark = context.isDark;
    final unread = ref.watch(unreadCountProvider);
    final ink = dark ? Colors.white : AppColors.ink;

    return AnimatedContainer(
      duration: const Duration(milliseconds: 350),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: AppColors.headerGradient(color, dark: dark),
          stops: const [0, 0.62, 1],
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
        ),
      ),
      child: SafeArea(
        bottom: false,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
              child: _ModeToggle(
                mode: s.mode,
                tint: color,
                onChanged: (m) => ref.read(sessionProvider.notifier).setMode(m),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 12, 0),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: InkWell(
                      onTap: () => context.push('/location?from=app'),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          if (s.isQuick) ...[
                            Text(
                              context.tr('delivery_in'),
                              style: TextStyle(
                                fontSize: 12.5,
                                fontWeight: FontWeight.w600,
                                color: ink.withValues(alpha: 0.8),
                              ),
                            ),
                            Wrap(
                              crossAxisAlignment: WrapCrossAlignment.center,
                              spacing: 8,
                              runSpacing: 2,
                              children: [
                                Text(
                                  context.tr('n_minutes', {
                                    'n': s.deliveryMinutes,
                                  }),
                                  style: TextStyle(
                                    fontSize: 26,
                                    height: 1.15,
                                    fontWeight: FontWeight.w800,
                                    color: ink,
                                    letterSpacing: -0.5,
                                  ),
                                ),
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 8,
                                    vertical: 3,
                                  ),
                                  decoration: BoxDecoration(
                                    color: dark
                                        ? Colors.white12
                                        : Color.lerp(color, Colors.black, 0.08),
                                    borderRadius: BorderRadius.circular(999),
                                  ),
                                  child: Text(
                                    '⚡ ${context.tr('km_away', {'km': s.distanceKm.toStringAsFixed(2)})}',
                                    style: TextStyle(
                                      fontSize: 11,
                                      fontWeight: FontWeight.w700,
                                      color: ink,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ] else
                            Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(
                                  s.zoneName.isEmpty ? 'QwikMart' : s.zoneName,
                                  style: TextStyle(
                                    fontSize: 22,
                                    fontWeight: FontWeight.w800,
                                    color: ink,
                                  ),
                                ),
                                Icon(
                                  Icons.keyboard_arrow_down_rounded,
                                  color: ink,
                                ),
                              ],
                            ),
                          const SizedBox(height: 2),
                          Row(
                            children: [
                              Flexible(
                                child: Text(
                                  s.address.isEmpty
                                      ? context.tr('set_location')
                                      : s.address,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(
                                    fontSize: 12,
                                    color: ink.withValues(alpha: 0.75),
                                    fontWeight: FontWeight.w500,
                                  ),
                                ),
                              ),
                              if (s.isQuick)
                                Icon(
                                  Icons.keyboard_arrow_down_rounded,
                                  size: 18,
                                  color: ink.withValues(alpha: 0.75),
                                ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                  _CircleIconButton(
                    icon: Icons.notifications_none_rounded,
                    badge: unread,
                    onTap: () => context.push('/notifications'),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 6),
              child: const _SearchBar(),
            ),
            if (tabs.isNotEmpty)
              SizedBox(
                height: 66,
                child: ListView.builder(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  itemCount: tabs.length,
                  itemBuilder: (_, i) {
                    final c = tabs[i];
                    final active = c.id == selectedId;
                    return InkWell(
                      onTap: () => onTab(c.id),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10),
                        decoration: BoxDecoration(
                          border: Border(
                            bottom: BorderSide(
                              color: active ? ink : Colors.transparent,
                              width: 3,
                            ),
                          ),
                        ),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            SizedBox(
                              height: 26,
                              // "All" uses the bundled 3D shopping-bags icon (same set as the category icons).
                              child: c.id.isEmpty
                                  ? Image.asset(
                                      'assets/images/icons/all.png',
                                      width: 26,
                                      height: 26,
                                    )
                                  : c.icon.isNotEmpty || c.image.isNotEmpty
                                  ? AppImage(
                                      url: c.icon.isNotEmpty ? c.icon : c.image,
                                      name: c.name,
                                      width: 26,
                                      height: 26,
                                      fit: BoxFit.contain,
                                      background: Colors.transparent,
                                    )
                                  : Text(
                                      emojiFor(c.name),
                                      style: const TextStyle(fontSize: 21),
                                    ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              c.name == 'Fresh Fruits & Vegetables'
                                  ? 'Fresh'
                                  : c.name,
                              style: TextStyle(
                                fontSize: 12,
                                color: ink,
                                fontWeight: active
                                    ? FontWeight.w800
                                    : FontWeight.w500,
                              ),
                            ),
                          ],
                        ),
                      ),
                    );
                  },
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _ModeToggle extends StatelessWidget {
  final String mode;
  final Color tint;
  final ValueChanged<String> onChanged;
  const _ModeToggle({
    required this.mode,
    required this.tint,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    final dark = context.isDark;
    Widget seg(String value, String label) {
      final active = mode == value;
      return Expanded(
        child: GestureDetector(
          onTap: () => onChanged(value),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 220),
            height: 42,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: active
                  ? (dark ? AppColors.darkSurface : Colors.white)
                  : (dark
                        ? Colors.white10
                        : Color.lerp(
                            tint,
                            Colors.black,
                            0.1,
                          )!.withValues(alpha: 0.55)),
              borderRadius: BorderRadius.circular(12),
              boxShadow: active ? AppShadows.card : null,
            ),
            child: Text(
              label,
              style: TextStyle(
                fontWeight: FontWeight.w700,
                fontSize: 15,
                color: active
                    ? (dark ? Colors.white : AppColors.ink)
                    : (dark ? Colors.white60 : Colors.white),
              ),
            ),
          ),
        ),
      );
    }

    return Row(
      children: [
        seg('quick', context.tr('quick')),
        const SizedBox(width: 10),
        seg('ecommerce', context.tr('ecommerce')),
      ],
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
  const _SearchBar();
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
    return Material(
      color: context.cardColor,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => context.push('/search'),
        child: Container(
          height: 48,
          padding: const EdgeInsets.symmetric(horizontal: 12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: context.borderColor),
          ),
          child: Row(
            children: [
              Icon(Icons.search_rounded, color: context.mutedText),
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
                          color: context.mutedText,
                          fontSize: 13.5,
                        ),
                      ),
                    ),
                  ),
                ),
              ),
              Container(width: 1, height: 22, color: context.borderColor),
              const SizedBox(width: 10),
              InkWell(
                onTap: () => context.push('/search?voice=1'),
                child: Icon(Icons.mic_none_rounded, color: context.mutedText),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
