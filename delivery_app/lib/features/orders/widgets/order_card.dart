import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/format.dart';
import '../../../core/l10n.dart';
import '../../../core/theme.dart';
import '../../../models/models.dart';
import '../../../providers/core_providers.dart';
import '../../../providers/data_providers.dart';
import '../../../widgets/common.dart';

class OrderCard extends ConsumerStatefulWidget {
  const OrderCard({super.key, required this.order, this.showActions = false});
  final DeliveryOrder order;
  final bool showActions;

  @override
  ConsumerState<OrderCard> createState() => _OrderCardState();
}

class _OrderCardState extends ConsumerState<OrderCard> {
  bool _busy = false;

  // The realtime Available list drops this card as soon as the order is taken (often before the
  // callable returns), so everything needed afterwards is captured before awaiting.
  Future<void> _accept() async {
    final router = GoRouter.of(context);
    final messenger = ScaffoldMessenger.of(context);
    final acceptedMsg = context.tr('order_accepted');
    final container = ProviderScope.containerOf(context, listen: false);
    final id = widget.order.id;
    setState(() => _busy = true);
    try {
      await ref.read(repositoryProvider).acceptOrder(id);
      refreshOrderData(container.invalidate);
      messenger.showSnackBar(SnackBar(content: Text(acceptedMsg), behavior: SnackBarBehavior.floating));
      router.push('/order/$id');
    } catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(errorText(e)), backgroundColor: AppColors.danger, behavior: SnackBarBehavior.floating));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _reject() async {
    if (!await confirmDialog(context, context.tr('reject_confirm'), confirmLabel: context.tr('reject'), danger: true)) return;
    if (!mounted) return;
    final messenger = ScaffoldMessenger.of(context);
    final rejectedMsg = context.tr('order_rejected');
    final container = ProviderScope.containerOf(context, listen: false);
    setState(() => _busy = true);
    try {
      await ref.read(repositoryProvider).rejectOrder(widget.order.id);
      refreshOrderData(container.invalidate);
      messenger.showSnackBar(SnackBar(content: Text(rejectedMsg), behavior: SnackBarBehavior.floating));
    } catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(errorText(e)), backgroundColor: AppColors.danger, behavior: SnackBarBehavior.floating));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final o = widget.order;
    return AppCard(
      padding: EdgeInsets.zero,
      onTap: () => context.push('/order/${o.id}'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 0),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(o.orderNumber, style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15, color: context.textColor)),
                      const SizedBox(height: 2),
                      Text(
                        Fmt.relative(o.isFinished ? (o.deliveredAt ?? o.createdAt) : o.createdAt),
                        style: TextStyle(fontSize: 11.5, color: context.mutedColor),
                      ),
                    ],
                  ),
                ),
                if (o.mode == 'ecommerce') ...[
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    margin: const EdgeInsetsDirectional.only(end: 6),
                    decoration: BoxDecoration(
                      color: const Color(0xFFFDE2D6),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: const Text('eCom', style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700, color: Color(0xFFC2410C))),
                  ),
                ],
                StatusPill(o.status),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 0),
            child: _RouteLines(order: o),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
            child: Row(
              children: [
                Text(Fmt.money(o.total), style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: context.textColor)),
                const SizedBox(width: 8),
                PaymentPill(isCod: o.isCod),
                const Spacer(),
                Icon(Icons.shopping_bag_outlined, size: 15, color: context.mutedColor),
                const SizedBox(width: 3),
                Text('${o.itemCount} ${context.tr('items')}', style: TextStyle(fontSize: 12, color: context.mutedColor)),
              ],
            ),
          ),
          if (widget.showActions) ...[
            Divider(height: 1, color: context.borderColor),
            Padding(
              padding: const EdgeInsets.all(10),
              child: Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: _busy ? null : _reject,
                      style: OutlinedButton.styleFrom(
                        foregroundColor: AppColors.danger,
                        side: const BorderSide(color: AppColors.danger),
                        minimumSize: const Size.fromHeight(42),
                      ),
                      child: Text(context.tr('reject')),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: ElevatedButton(
                      onPressed: _busy ? null : _accept,
                      style: ElevatedButton.styleFrom(minimumSize: const Size.fromHeight(42)),
                      child: _busy
                          ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                          : Text(context.tr('accept')),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _RouteLines extends StatelessWidget {
  const _RouteLines({required this.order});
  final DeliveryOrder order;

  @override
  Widget build(BuildContext context) {
    Widget line(IconData icon, Color color, String title, String sub, {String? trailing}) => Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 26,
              height: 26,
              decoration: BoxDecoration(color: color.withValues(alpha: 0.12), shape: BoxShape.circle),
              child: Icon(icon, size: 14, color: color),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: context.textColor)),
                  Text(sub, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12, color: context.mutedColor)),
                ],
              ),
            ),
            if (trailing != null)
              Text(trailing, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.primary)),
          ],
        );
    return Column(
      children: [
        line(Icons.storefront_outlined, AppColors.primary, order.store.name, order.store.city.isEmpty ? order.store.address : order.store.city,
            trailing: order.distanceKm == null ? null : Fmt.km(order.distanceKm)),
        Padding(
          padding: const EdgeInsetsDirectional.only(start: 12),
          child: Align(
            alignment: AlignmentDirectional.centerStart,
            child: Container(width: 2, height: 10, color: context.borderColor),
          ),
        ),
        line(Icons.location_on_outlined, AppColors.danger, order.customer.name, order.customer.address),
      ],
    );
  }
}
