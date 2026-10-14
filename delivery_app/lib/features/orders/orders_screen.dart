import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../core/l10n.dart';
import '../../core/theme.dart';
import '../../models/models.dart';
import '../../providers/data_providers.dart';
import '../../widgets/common.dart';
import 'widgets/order_card.dart';

/// Bottom-nav "Orders": delivery history with status filter + summary.
class OrdersScreen extends ConsumerStatefulWidget {
  const OrdersScreen({super.key});

  @override
  ConsumerState<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends ConsumerState<OrdersScreen> {
  String _filter = 'all';

  @override
  Widget build(BuildContext context) {
    final history = ref.watch(ordersProvider('history'));
    final active = ref.watch(ordersProvider('active'));
    final filters = ['all', 'active', OrderStatus.delivered, OrderStatus.cancelled];
    return Scaffold(
      appBar: AppBar(title: Text(context.tr('orders'))),
      body: Column(
        children: [
          const DemoBanner(),
          SizedBox(
            height: 52,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              children: [
                for (final f in filters)
                  Padding(
                    padding: const EdgeInsetsDirectional.only(end: 8),
                    child: ChoiceChip(
                      label: Text(f == 'all' ? context.tr('all') : (f == 'active' ? context.tr('active') : context.trStatus(f))),
                      selected: _filter == f,
                      showCheckmark: false,
                      selectedColor: AppColors.primary,
                      backgroundColor: context.cardColor,
                      side: BorderSide(color: _filter == f ? AppColors.primary : context.borderColor),
                      shape: const StadiumBorder(),
                      labelStyle: TextStyle(
                        color: _filter == f ? Colors.white : context.bodyColor,
                        fontWeight: FontWeight.w600,
                        fontSize: 12.5,
                      ),
                      onSelected: (_) => setState(() => _filter = f),
                    ),
                  ),
              ],
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              color: AppColors.primary,
              onRefresh: () async {
                ref.invalidate(ordersProvider('active'));
                ref.invalidate(ordersProvider('history'));
                await ref.read(ordersProvider('history').future);
              },
              child: AsyncView<List<DeliveryOrder>>(
                value: _filter == 'active' ? active : history,
                onRetry: () => ref.invalidate(ordersProvider),
                builder: (list) {
                  final items = _filter == 'all' || _filter == 'active' ? list : list.where((o) => o.status == _filter).toList();
                  final delivered = list.where((o) => o.isDelivered).toList();
                  return ListView(
                    padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
                    children: [
                      if (_filter == 'all' && delivered.isNotEmpty) ...[
                        AppCard(
                          color: context.softGreen,
                          child: Row(
                            children: [
                              const IconTile(icon: Icons.inventory_rounded, solid: true, size: 42),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text('${delivered.length} ${context.trStatus(OrderStatus.delivered)}',
                                        style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: context.textColor)),
                                    Text(
                                      '${context.tr('your_earning')}: ${Fmt.money(delivered.fold<double>(0, (s, o) => s + o.earning))}',
                                      style: TextStyle(color: context.bodyColor, fontSize: 12.5),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 12),
                      ],
                      if (items.isEmpty)
                        Padding(
                          padding: const EdgeInsets.only(top: 60),
                          child: EmptyState(title: context.tr('no_orders'), icon: Icons.receipt_long_outlined, image: 'assets/images/empty/empty-orders.webp'),
                        ),
                      for (final o in items) ...[OrderCard(order: o), const SizedBox(height: 12)],
                    ],
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }
}
