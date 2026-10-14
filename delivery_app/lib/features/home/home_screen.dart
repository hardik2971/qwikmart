import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/format.dart';
import '../../core/l10n.dart';
import '../../core/theme.dart';
import '../../models/models.dart';
import '../../providers/auth_provider.dart';
import '../../providers/data_providers.dart';
import '../../providers/online_provider.dart';
import '../../widgets/common.dart';
import '../orders/widgets/order_card.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return DefaultTabController(
      length: 3,
      child: Scaffold(
        body: NestedScrollView(
          headerSliverBuilder: (context, _) => [
            const SliverToBoxAdapter(child: _Header()),
            const SliverToBoxAdapter(child: _Stats()),
            const SliverToBoxAdapter(child: _QuickLinks()),
            SliverPersistentHeader(pinned: true, delegate: _TabsDelegate(context)),
          ],
          body: const TabBarView(
            children: [
              _OrdersTab(type: 'available'),
              _OrdersTab(type: 'active'),
              _OrdersTab(type: 'history'),
            ],
          ),
        ),
      ),
    );
  }
}

class _Header extends ConsumerWidget {
  const _Header();

  String _greeting(BuildContext context) {
    final h = DateTime.now().hour;
    if (h < 12) return context.tr('good_morning');
    if (h < 17) return context.tr('good_afternoon');
    return context.tr('good_evening');
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile = ref.watch(profileProvider);
    final online = ref.watch(onlineProvider);
    final unread = ref.watch(notificationsProvider).value?.where((n) => !n.read).length ?? 0;
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [AppColors.primary, AppColors.primaryDark],
        ),
        borderRadius: BorderRadius.vertical(bottom: Radius.circular(24)),
      ),
      child: SafeArea(
        bottom: false,
        child: Column(
          children: [
            const DemoBanner(onDark: true),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 8, 0),
              child: Row(
                children: [
                  GestureDetector(
                    onTap: () => context.go('/profile'),
                    child: CircleAvatar(
                      radius: 22,
                      backgroundColor: Colors.white,
                      child: Text(
                        profile?.initials ?? '?',
                        style: const TextStyle(color: AppColors.primary, fontWeight: FontWeight.w800),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('${_greeting(context)},', style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontSize: 13)),
                        Text(
                          profile?.firstName ?? '',
                          style: const TextStyle(color: Colors.white, fontSize: 19, fontWeight: FontWeight.w800),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    onPressed: () => context.push('/notifications'),
                    icon: Badge(
                      isLabelVisible: unread > 0,
                      label: Text('$unread'),
                      backgroundColor: AppColors.danger,
                      child: const Icon(Icons.notifications_none_rounded, color: Colors.white, size: 26),
                    ),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 18),
              child: Container(
                padding: const EdgeInsets.fromLTRB(14, 8, 8, 8),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.14),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: Colors.white.withValues(alpha: 0.2)),
                ),
                child: Row(
                  children: [
                    AnimatedContainer(
                      duration: const Duration(milliseconds: 250),
                      width: 10,
                      height: 10,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: online ? const Color(0xFF86EFAC) : const Color(0xFFD0D5DD),
                        boxShadow: online ? const [BoxShadow(color: Color(0xFF86EFAC), blurRadius: 8)] : null,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            online ? context.tr('you_are_online') : context.tr('you_are_offline'),
                            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700),
                          ),
                          Text(
                            online ? context.tr('online_msg') : context.tr('offline_msg'),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(color: Colors.white.withValues(alpha: 0.8), fontSize: 11.5),
                          ),
                        ],
                      ),
                    ),
                    Switch(
                      value: online,
                      activeTrackColor: const Color(0xFF22C55E),
                      inactiveTrackColor: Colors.white.withValues(alpha: 0.35),
                      onChanged: (v) async {
                        try {
                          final located = await ref.read(onlineProvider.notifier).setOnline(v);
                          if (!located && context.mounted) showSnack(context, context.tr('location_required'), error: true);
                        } catch (e) {
                          if (context.mounted) showSnack(context, errorText(e), error: true);
                        }
                      },
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Stats extends ConsumerWidget {
  const _Stats();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final d = ref.watch(dashboardProvider).value;
    final tiles = [
      (context.tr('today_earnings'), d == null ? '—' : Fmt.money(d.todayEarnings), Icons.currency_rupee_rounded, AppColors.primary, '/earnings'),
      (context.tr('cash_in_hand'), d == null ? '—' : Fmt.money(d.cashInHand), Icons.payments_outlined, AppColors.warning, '/cash'),
      (context.tr('deliveries_today'), d == null ? '—' : '${d.deliveredToday}', Icons.local_shipping_outlined, AppColors.info, null),
      (context.tr('rating'), d == null ? '—' : d.rating.toStringAsFixed(1), Icons.star_rounded, AppColors.purple, null),
    ];
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
      child: GridView.count(
        crossAxisCount: 2,
        shrinkWrap: true,
        padding: EdgeInsets.zero,
        physics: const NeverScrollableScrollPhysics(),
        mainAxisSpacing: 12,
        crossAxisSpacing: 12,
        childAspectRatio: 2.15,
        children: [
          for (final (label, value, icon, color, route) in tiles)
            AppCard(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              onTap: route == null ? null : () => context.push(route),
              child: Row(
                children: [
                  IconTile(icon: icon, color: color, size: 40),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        FittedBox(
                          fit: BoxFit.scaleDown,
                          alignment: AlignmentDirectional.centerStart,
                          child: Text(value, style: TextStyle(fontWeight: FontWeight.w800, fontSize: 17, color: context.textColor)),
                        ),
                        Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 11.5, color: context.mutedColor)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _QuickLinks extends StatelessWidget {
  const _QuickLinks();

  @override
  Widget build(BuildContext context) {
    final links = [
      (Icons.assignment_return_outlined, context.tr('return_pickups'), '/returns', AppColors.warning),
      (Icons.payments_outlined, context.tr('cash_collection'), '/cash', AppColors.primary),
      (Icons.insights_rounded, context.tr('earnings'), '/earnings', AppColors.info),
      (Icons.support_agent_rounded, context.tr('chat_support'), '/support', AppColors.purple),
    ];
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 6),
      child: Row(
        children: [
          for (final (icon, label, route, color) in links)
            Expanded(
              child: InkWell(
                borderRadius: BorderRadius.circular(12),
                onTap: () => context.push(route),
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 6),
                  child: Column(
                    children: [
                      IconTile(icon: icon, color: color, size: 46),
                      const SizedBox(height: 6),
                      Text(
                        label,
                        maxLines: 2,
                        textAlign: TextAlign.center,
                        style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: context.bodyColor, height: 1.2),
                      ),
                    ],
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _TabsDelegate extends SliverPersistentHeaderDelegate {
  _TabsDelegate(this.ctx);
  final BuildContext ctx;

  @override
  double get minExtent => 48;
  @override
  double get maxExtent => 48;

  @override
  Widget build(BuildContext context, double shrinkOffset, bool overlapsContent) {
    return Container(
      color: Theme.of(context).scaffoldBackgroundColor,
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Container(
        decoration: BoxDecoration(border: Border(bottom: BorderSide(color: context.borderColor))),
        child: TabBar(
          dividerColor: Colors.transparent,
          tabs: [
            Tab(text: context.tr('available')),
            Tab(text: context.tr('active')),
            Tab(text: context.tr('history')),
          ],
        ),
      ),
    );
  }

  @override
  bool shouldRebuild(covariant _TabsDelegate old) => true;
}

class _OrdersTab extends ConsumerWidget {
  const _OrdersTab({required this.type});
  final String type;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final online = ref.watch(onlineProvider);
    final orders = ref.watch(ordersProvider(type));

    Future<void> refresh() async {
      ref.invalidate(dashboardProvider);
      return ref.refresh(ordersProvider(type).future).then((_) {});
    }

    if (type == 'available' && !online) {
      return EmptyState(
        icon: Icons.power_settings_new_rounded,
        title: context.tr('you_are_offline'),
        subtitle: context.tr('offline_msg'),
        action: SizedBox(
          width: 160,
          child: ElevatedButton(
            onPressed: () async {
              try {
                await ref.read(onlineProvider.notifier).setOnline(true);
              } catch (e) {
                if (context.mounted) showSnack(context, errorText(e), error: true);
              }
            },
            child: Text(context.tr('go_online')),
          ),
        ),
      );
    }

    return RefreshIndicator(
      color: AppColors.primary,
      onRefresh: refresh,
      child: AsyncView<List<DeliveryOrder>>(
        value: orders,
        onRetry: () => ref.invalidate(ordersProvider(type)),
        builder: (list) {
          if (list.isEmpty) {
            return ListView(
              children: [
                const SizedBox(height: 40),
                EmptyState(
                  icon: type == 'history' ? Icons.history_rounded : Icons.delivery_dining_outlined,
                  title: context.tr('no_orders'),
                ),
              ],
            );
          }
          return ListView.separated(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
            itemCount: list.length,
            separatorBuilder: (_, _) => const SizedBox(height: 12),
            itemBuilder: (_, i) => OrderCard(order: list[i], showActions: type == 'available'),
          );
        },
      ),
    );
  }
}
