import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/l10n/app_localizations.dart';
import '../../core/theme.dart';
import '../../core/utils.dart';
import '../../models/models.dart';
import '../../providers/providers.dart';
import '../../widgets/common.dart';

String statusLabel(BuildContext context, String status) => context.tr('status_$status');

class OrdersScreen extends ConsumerWidget {
  const OrdersScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tabs = [
      ('', context.tr('all')),
      ('active', context.tr('active')),
      ('delivered', context.tr('status_delivered')),
      ('cancelled', context.tr('status_cancelled')),
    ];
    return DefaultTabController(
      length: tabs.length,
      child: Scaffold(
        appBar: AppBar(
          title: Text(context.tr('my_orders')),
          bottom: TabBar(
            isScrollable: true,
            tabAlignment: TabAlignment.start,
            tabs: [for (final t in tabs) Tab(text: t.$2)],
          ),
        ),
        body: TabBarView(children: [for (final t in tabs) _OrderList(status: t.$1)]),
      ),
    );
  }
}

class _OrderList extends ConsumerWidget {
  final String status;
  const _OrderList({required this.status});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final orders = ref.watch(ordersProvider(status));
    return RefreshIndicator(
      onRefresh: () => ref.refresh(ordersProvider(status).future),
      child: orders.when(
        loading: () => const LoadingView(),
        error: (e, _) => ErrorView(error: e, onRetry: () => ref.invalidate(ordersProvider(status))),
        data: (list) => list.isEmpty
            ? ListView(children: [
                const SizedBox(height: 80),
                EmptyView(
                  emoji: '📦',
                  image: 'assets/images/empty/empty-orders.webp',
                  title: context.tr('no_orders'),
                  message: context.tr('no_orders_body'),
                  actionLabel: context.tr('start_shopping'),
                  onAction: () => context.go('/home'),
                ),
              ])
            : ListView.separated(
                padding: const EdgeInsets.all(16),
                itemCount: list.length,
                separatorBuilder: (_, _) => const SizedBox(height: 12),
                itemBuilder: (_, i) => OrderCard(order: list[i]),
              ),
      ),
    );
  }
}

class OrderCard extends StatelessWidget {
  final Order order;
  const OrderCard({super.key, required this.order});

  @override
  Widget build(BuildContext context) {
    final o = order;
    final color = statusColor(o.status);
    return AppCard(
      onTap: () => context.push('/orders/${o.id}'),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(color: color.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(10)),
            child: Icon(o.isDelivered ? Icons.check_circle_outline_rounded : (o.isCancelled ? Icons.cancel_outlined : Icons.inventory_2_outlined),
                color: color),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(o.orderNumber, style: const TextStyle(fontWeight: FontWeight.w800)),
              Text(Fmt.dateTime(o.createdAt), style: TextStyle(fontSize: 11.5, color: context.mutedText)),
            ]),
          ),
          Pill(label: statusLabel(context, o.status), color: color),
        ]),
        const Divider(height: 20),
        SizedBox(
          height: 44,
          child: Row(children: [
            for (final it in o.items.take(4))
              Container(
                width: 44,
                height: 44,
                margin: const EdgeInsetsDirectional.only(end: 6),
                decoration: BoxDecoration(border: Border.all(color: context.borderColor), borderRadius: BorderRadius.circular(8)),
                child: AppImage(url: it.image, name: it.productName, radius: BorderRadius.circular(7)),
              ),
            if (o.items.length > 4)
              Text('+${o.items.length - 4}', style: TextStyle(color: context.mutedText, fontWeight: FontWeight.w700)),
            const Spacer(),
            Column(crossAxisAlignment: CrossAxisAlignment.end, mainAxisAlignment: MainAxisAlignment.center, children: [
              Text(Fmt.money(o.total), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
              Text(context.tr('n_items', {'n': o.itemsCount}), style: TextStyle(fontSize: 11, color: context.mutedText)),
            ]),
          ]),
        ),
        if (o.isTrackable) ...[
          const SizedBox(height: 10),
          AppButton(
            label: context.tr('track_order'),
            icon: Icons.near_me_outlined,
            height: 40,
            soft: true,
            onPressed: () => context.push('/orders/${o.id}/track'),
          ),
        ],
      ]),
    );
  }
}
