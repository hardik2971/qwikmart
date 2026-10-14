import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/format.dart';
import '../../core/l10n.dart';
import '../../core/theme.dart';
import '../../widgets/common.dart';

class DeliveredInfo {
  DeliveredInfo({required this.orderNumber, this.earning = 0, this.cashCollected = 0, this.shortAmount = 0, this.customerName});
  final String orderNumber;
  final double earning;
  final double cashCollected;

  /// COD: payable minus the cash actually received (recorded as `short_amount`).
  final double shortAmount;
  final String? customerName;
}

class DeliveredScreen extends StatelessWidget {
  const DeliveredScreen({super.key, required this.orderId, this.info});
  final String orderId;
  final DeliveredInfo? info;

  @override
  Widget build(BuildContext context) {
    final i = info;
    return Scaffold(
      backgroundColor: context.cardColor,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            children: [
              const Spacer(),
              TweenAnimationBuilder<double>(
                tween: Tween(begin: 0, end: 1),
                duration: const Duration(milliseconds: 650),
                curve: Curves.elasticOut,
                builder: (context, v, child) => Transform.scale(scale: v, child: child),
                child: Container(
                  width: 128,
                  height: 128,
                  decoration: BoxDecoration(
                    color: context.softGreen,
                    shape: BoxShape.circle,
                  ),
                  child: Center(
                    child: Container(
                      width: 92,
                      height: 92,
                      decoration: const BoxDecoration(color: AppColors.primary, shape: BoxShape.circle),
                      child: const Icon(Icons.check_rounded, color: Colors.white, size: 56),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 28),
              Text(
                context.tr('order_delivered'),
                style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800, color: context.textColor),
              ),
              const SizedBox(height: 8),
              Text(
                [if (i != null) i.orderNumber, if (i?.customerName != null) i!.customerName!].join(' · '),
                style: TextStyle(color: context.mutedColor, fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 10),
              Text(
                context.tr('delivered_desc'),
                textAlign: TextAlign.center,
                style: TextStyle(color: context.bodyColor),
              ),
              const SizedBox(height: 28),
              if (i != null && (i.earning > 0 || i.cashCollected > 0 || i.shortAmount > 0))
                AppCard(
                  child: Column(
                    children: [
                      if (i.earning > 0)
                        _line(context, Icons.trending_up_rounded, AppColors.primary, '+${Fmt.money(i.earning)}', context.tr('added_to_earnings')),
                      if (i.earning > 0 && i.cashCollected > 0) Divider(height: 20, color: context.borderColor),
                      if (i.cashCollected > 0)
                        _line(context, Icons.payments_outlined, AppColors.warning, Fmt.money(i.cashCollected), context.tr('added_to_cash')),
                      if (i.shortAmount > 0) ...[
                        Divider(height: 20, color: context.borderColor),
                        _line(context, Icons.money_off_rounded, AppColors.danger, Fmt.money(i.shortAmount), context.tr('short_amount')),
                      ],
                    ],
                  ),
                ),
              const Spacer(flex: 2),
              ElevatedButton(onPressed: () => context.go('/home'), child: Text(context.tr('back_to_home'))),
              const SizedBox(height: 8),
              TextButton(
                onPressed: () => context.push('/order/$orderId/invoice'),
                child: Text(context.tr('view_invoice')),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _line(BuildContext context, IconData icon, Color color, String value, String label) => Row(
        children: [
          IconTile(icon: icon, color: color, size: 40),
          const SizedBox(width: 12),
          Text(value, style: TextStyle(fontWeight: FontWeight.w800, fontSize: 17, color: context.textColor)),
          const SizedBox(width: 6),
          Expanded(child: Text(label, style: TextStyle(color: context.mutedColor))),
        ],
      );
}
