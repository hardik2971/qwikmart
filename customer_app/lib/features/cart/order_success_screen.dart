import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/l10n/app_localizations.dart';
import '../../core/theme.dart';
import '../../core/utils.dart';
import '../../providers/providers.dart';
import '../../widgets/common.dart';
import 'payment_methods_screen.dart' show gatewayName;

class OrderSuccessScreen extends ConsumerStatefulWidget {
  final String orderId;
  const OrderSuccessScreen({super.key, required this.orderId});
  @override
  ConsumerState<OrderSuccessScreen> createState() => _OrderSuccessScreenState();
}

class _OrderSuccessScreenState extends ConsumerState<OrderSuccessScreen> with SingleTickerProviderStateMixin {
  late final _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 700))..forward();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final order = ref.watch(orderDetailProvider(widget.orderId)).value;
    final quick = order?.mode != 'ecommerce';
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) context.go('/home');
      },
      child: Scaffold(
        body: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(children: [
              const Spacer(),
              ScaleTransition(
                scale: CurvedAnimation(parent: _c, curve: Curves.elasticOut),
                child: Container(
                  width: 120,
                  height: 120,
                  decoration: BoxDecoration(
                    color: AppColors.primary,
                    shape: BoxShape.circle,
                    boxShadow: [BoxShadow(color: AppColors.primary.withValues(alpha: 0.35), blurRadius: 30, spreadRadius: 6)],
                  ),
                  child: const Icon(Icons.check_rounded, color: Colors.white, size: 70),
                ),
              ),
              const SizedBox(height: 28),
              Text(context.tr('order_placed'),
                  textAlign: TextAlign.center, style: context.text.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
              const SizedBox(height: 8),
              if (order != null) ...[
                Text(order.orderNumber, style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.primary)),
                const SizedBox(height: 16),
                AppCard(
                  child: Column(children: [
                    KeyValueRow(
                      label: quick ? context.tr('arriving_in') : context.tr('expected_by'),
                      value: quick
                          ? context.tr('n_minutes', {'n': ref.watch(sessionProvider).deliveryMinutes})
                          : Fmt.date(order.estimatedDeliveryAt),
                    ),
                    KeyValueRow(label: context.tr('items'), value: '${order.itemsCount}'),
                    KeyValueRow(label: context.tr('payment_method'), value: gatewayName(context, order.paymentMethod, const [])),
                    KeyValueRow(label: context.tr('total_amount'), value: Fmt.money(order.total), bold: true),
                  ]),
                ),
              ] else
                const Padding(padding: EdgeInsets.all(16), child: CircularProgressIndicator()),
              const Spacer(),
              AppButton(label: context.tr('track_order'), onPressed: () {
                  context.go('/home');
                  context.push('/orders/${widget.orderId}');
                }),
              const SizedBox(height: 10),
              AppButton(label: context.tr('continue_shopping'), outlined: true, onPressed: () => context.go('/home')),
            ]),
          ),
        ),
      ),
    );
  }
}
