import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart';

import '../../core/format.dart';
import '../../core/l10n.dart';
import '../../core/launcher.dart';
import '../../core/theme.dart';
import '../../models/models.dart';
import '../../providers/core_providers.dart';
import '../../providers/data_providers.dart';
import '../../widgets/common.dart';
import 'delivered_screen.dart';
import 'widgets/order_map.dart';
import 'widgets/otp_sheet.dart';

/// Guided delivery workflow (screenshot 28).
class OrderDetailScreen extends ConsumerStatefulWidget {
  const OrderDetailScreen({super.key, required this.orderId});
  final String orderId;

  @override
  ConsumerState<OrderDetailScreen> createState() => _OrderDetailScreenState();
}

class _OrderDetailScreenState extends ConsumerState<OrderDetailScreen> {
  bool _busy = false;

  Future<void> _runStep(DeliveryOrder o) async {
    final repo = ref.read(repositoryProvider);
    switch (o.nextStep) {
      case DeliveryStep.done:
        return;
      case DeliveryStep.deliver:
        final res = await showDeliverOtpSheet(context, o);
        if (res == null || !mounted) return;
        refreshOrderData(ref.invalidate);
        context.pushReplacement(
          '/order/${o.id}/delivered',
          extra: DeliveredInfo(
            orderNumber: o.orderNumber,
            earning: res.earning,
            cashCollected: res.cashCollected,
            shortAmount: o.isCod && o.amountToCollect > res.cashCollected ? o.amountToCollect - res.cashCollected : 0,
            customerName: o.customer.name,
          ),
        );
        return;
      default:
        break;
    }
    final acceptedMsg = context.tr('order_accepted');
    final updatedMsg = context.tr('status_updated');
    setState(() => _busy = true);
    try {
      String msg = updatedMsg;
      switch (o.nextStep) {
        case DeliveryStep.accept:
          await repo.acceptOrder(o.id);
          msg = acceptedMsg;
          break;
        case DeliveryStep.pickUp:
          await repo.updateStatus(o.id, OrderStatus.pickedUp);
          break;
        default:
          await repo.updateStatus(o.id, OrderStatus.outForDelivery);
      }
      refreshOrderData(ref.invalidate);
      if (mounted) showSnack(context, msg);
    } catch (e) {
      if (mounted) showSnack(context, errorText(e), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  String _stepLabel(BuildContext context, DeliveryOrder o) {
    switch (o.nextStep) {
      case DeliveryStep.accept:
        return context.tr('accept_order');
      case DeliveryStep.pickUp:
        return context.tr('mark_picked_up');
      case DeliveryStep.outForDelivery:
        return context.tr('start_delivery');
      case DeliveryStep.deliver:
        return o.isCod && o.amountToCollect > 0 ? '${context.tr('deliver_order')} · ${context.tr('collect_cash')} ${Fmt.money(o.amountToCollect)}' : context.tr('deliver_order');
      case DeliveryStep.done:
        return context.trStatus(o.status);
    }
  }

  IconData _stepIcon(DeliveryStep s) {
    switch (s) {
      case DeliveryStep.accept:
        return Icons.check_circle_outline_rounded;
      case DeliveryStep.pickUp:
        return Icons.inventory_2_outlined;
      case DeliveryStep.outForDelivery:
        return Icons.delivery_dining_rounded;
      case DeliveryStep.deliver:
        return Icons.lock_open_rounded;
      case DeliveryStep.done:
        return Icons.verified_rounded;
    }
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(orderDetailProvider(widget.orderId));
    final o = async.value;
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 20), onPressed: () => context.canPop() ? context.pop() : context.go('/home')),
        titleSpacing: 0,
        title: o == null
            ? null
            : Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(context.trStatus(o.status)),
                  Text(o.orderNumber, style: TextStyle(fontSize: 12, color: context.mutedColor, fontWeight: FontWeight.w500)),
                ],
              ),
        actions: [
          if (o != null) ...[
            IconButton(
              tooltip: context.tr('chat_support'),
              icon: const Icon(Icons.support_agent_rounded),
              onPressed: () => context.push('/support'),
            ),
            IconButton(
              tooltip: context.tr('view_invoice'),
              icon: const Icon(Icons.receipt_long_outlined),
              onPressed: () => context.push('/order/${o.id}/invoice'),
            ),
          ],
        ],
      ),
      body: AsyncView<DeliveryOrder>(
        value: async,
        onRetry: () => ref.invalidate(orderDetailProvider(widget.orderId)),
        loading: const ShimmerList(count: 4, height: 140),
        builder: (o) => RefreshIndicator(
          color: AppColors.primary,
          onRefresh: () => ref.refresh(orderDetailProvider(widget.orderId).future),
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
            children: [
              const DemoBanner(),
              _InfoCard(order: o),
              const SizedBox(height: 12),
              _MapCard(order: o),
              const SizedBox(height: 12),
              _PaymentCard(order: o),
              const SizedBox(height: 12),
              _TrackCard(order: o),
              const SizedBox(height: 12),
              _ItemsCard(order: o),
              if (o.notes != null && o.notes!.isNotEmpty) ...[
                const SizedBox(height: 12),
                AppCard(
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Icon(Icons.sticky_note_2_outlined, color: AppColors.warning, size: 20),
                      const SizedBox(width: 10),
                      Expanded(child: Text('${context.tr('notes')}: ${o.notes}')),
                    ],
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
      bottomNavigationBar: o == null || o.isCancelled
          ? null
          : BottomActionBar(
              child: o.nextStep == DeliveryStep.done
                  ? OutlinedButton.icon(
                      onPressed: null,
                      icon: const Icon(Icons.verified_rounded, color: AppColors.primary),
                      label: Text(context.trStatus(o.status), style: const TextStyle(color: AppColors.primary)),
                    )
                  : LoadingButton(
                      label: _stepLabel(context, o),
                      icon: _stepIcon(o.nextStep),
                      loading: _busy,
                      onPressed: () => _runStep(o),
                    ),
            ),
    );
  }
}

/// Pickup Info + Delivery Info card with a connecting rail (screenshot 28).
class _InfoCard extends StatelessWidget {
  const _InfoCard({required this.order});
  final DeliveryOrder order;

  @override
  Widget build(BuildContext context) {
    final s = order.store;
    final c = order.customer;
    final muted = TextStyle(color: context.mutedColor, fontSize: 12.5, height: 1.4);
    return AppCard(
      padding: const EdgeInsets.fromLTRB(12, 14, 14, 14),
      child: IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Column(
              children: [
                const _RailIcon(icon: Icons.storefront_outlined),
                Expanded(child: Container(width: 2, margin: const EdgeInsets.symmetric(vertical: 4), color: AppColors.primary.withValues(alpha: 0.35))),
                const _RailIcon(icon: Icons.location_on_outlined),
                const Spacer(),
              ],
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(context.tr('pickup_info'), style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15, color: context.textColor)),
                  const SizedBox(height: 6),
                  Text(s.name, style: TextStyle(fontWeight: FontWeight.w600, color: context.textColor)),
                  Text(s.city.isEmpty ? s.address : s.city, style: muted),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      Expanded(
                        child: SoftButton(
                          label: context.tr('get_directions'),
                          icon: Icons.navigation_outlined,
                          onTap: () => Launcher.directions(context, s.lat, s.lng, label: '${s.name} ${s.address}'),
                        ),
                      ),
                      if (s.phone != null) ...[
                        const SizedBox(width: 8),
                        TintIconButton(icon: Icons.call_outlined, tooltip: context.tr('call'), onTap: () => Launcher.call(context, s.phone)),
                      ],
                    ],
                  ),
                  const SizedBox(height: 18),
                  Text(context.tr('delivery_info'), style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15, color: context.textColor)),
                  const SizedBox(height: 6),
                  Text(c.name, style: TextStyle(fontWeight: FontWeight.w600, color: context.textColor)),
                  if (c.phone != null) Text('${context.tr('mobile')}: ${c.phone}', style: muted),
                  Text(c.address, style: muted),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      TintIconButton(icon: Icons.call_outlined, tooltip: context.tr('call'), onTap: () => Launcher.call(context, c.phone)),
                      const SizedBox(width: 8),
                      TintIconButton(
                        icon: Icons.chat_bubble_outline_rounded,
                        // Chats are rider ↔ QwikMart support (there is no rider ↔ customer channel).
                        tooltip: context.tr('order_chat'),
                        onTap: () => context.push('/order/${order.id}/chat'),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: SoftButton(
                          label: context.tr('get_directions'),
                          icon: Icons.navigation_outlined,
                          onTap: () => Launcher.directions(context, c.lat, c.lng, label: c.address),
                        ),
                      ),
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

class _RailIcon extends StatelessWidget {
  const _RailIcon({required this.icon});
  final IconData icon;

  @override
  Widget build(BuildContext context) => Container(
        width: 32,
        height: 32,
        decoration: BoxDecoration(color: context.softGreen, shape: BoxShape.circle),
        child: Icon(icon, size: 18, color: AppColors.primary),
      );
}

class _MapCard extends StatelessWidget {
  const _MapCard({required this.order});
  final DeliveryOrder order;

  LatLng? _p(double? lat, double? lng) => lat == null || lng == null ? null : LatLng(lat, lng);

  @override
  Widget build(BuildContext context) {
    final store = _p(order.store.lat, order.store.lng);
    final cust = _p(order.customer.lat, order.customer.lng);
    if (store == null && cust == null) return const SizedBox.shrink();
    return AppCard(
      padding: EdgeInsets.zero,
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 10, 4, 6),
            child: Row(
              children: [
                const Icon(Icons.route_outlined, size: 18, color: AppColors.primary),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(context.tr('live_map'), style: TextStyle(fontWeight: FontWeight.w700, color: context.textColor)),
                ),
                if (order.distanceKm != null)
                  Text(Fmt.km(order.distanceKm), style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.primary, fontSize: 12.5)),
                IconButton(
                  icon: const Icon(Icons.open_in_full_rounded, size: 18),
                  onPressed: () => Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => OrderMapPage(title: order.orderNumber, store: store, customer: cust),
                    ),
                  ),
                ),
              ],
            ),
          ),
          ClipRRect(
            borderRadius: const BorderRadius.vertical(bottom: Radius.circular(AppRadius.card)),
            child: OrderMap(store: store, customer: cust),
          ),
        ],
      ),
    );
  }
}

class _PaymentCard extends StatelessWidget {
  const _PaymentCard({required this.order});
  final DeliveryOrder order;

  @override
  Widget build(BuildContext context) {
    final cod = order.isCod;
    return AppCard(
      child: Row(
        children: [
          IconTile(icon: cod ? Icons.payments_outlined : Icons.verified_outlined, color: cod ? AppColors.warning : AppColors.primary, size: 44),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(context.tr('payment'), style: TextStyle(color: context.mutedColor, fontSize: 12.5)),
                    const SizedBox(width: 8),
                    PaymentPill(isCod: cod),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  cod ? '${context.tr('amount_to_collect')}: ${Fmt.money(order.amountToCollect)}' : '${Fmt.titleCase(order.paymentMethod)} · ${context.trStatus(order.paymentStatus)}',
                  style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15, color: context.textColor),
                ),
              ],
            ),
          ),
          if (order.earning > 0)
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(context.tr('your_earning'), style: TextStyle(color: context.mutedColor, fontSize: 11.5)),
                Text(Fmt.money(order.earning), style: const TextStyle(color: AppColors.primary, fontWeight: FontWeight.w800, fontSize: 15)),
              ],
            ),
        ],
      ),
    );
  }
}

/// Track Order timeline with See More (screenshot 28).
class _TrackCard extends StatefulWidget {
  const _TrackCard({required this.order});
  final DeliveryOrder order;

  @override
  State<_TrackCard> createState() => _TrackCardState();
}

class _TrackCardState extends State<_TrackCard> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final o = widget.order;
    final reached = {for (final t in o.timeline) t.status: t};
    final steps = <(String, TimelineEntry?)>[];
    if (o.isCancelled) {
      for (final t in o.timeline) {
        steps.add((t.status, t));
      }
    } else {
      final currentIdx = OrderStatus.flow.indexOf(o.status);
      for (var i = 0; i < OrderStatus.flow.length; i++) {
        final s = OrderStatus.flow[i];
        final entry = reached[s] ?? (i <= currentIdx ? TimelineEntry(status: s) : null);
        steps.add((s, entry));
      }
    }
    final doneSteps = steps.where((s) => s.$2 != null).toList();
    final visible = _expanded ? steps : doneSteps.sublist(doneSteps.length > 2 ? doneSteps.length - 2 : 0);

    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(context.tr('track_order'), style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15, color: context.textColor)),
          const SizedBox(height: 12),
          for (var i = 0; i < visible.length; i++)
            _TimelineRow(
              status: visible[i].$1,
              entry: visible[i].$2,
              isCurrent: visible[i].$1 == o.status,
              isLast: i == visible.length - 1,
            ),
          Center(
            child: TextButton(
              onPressed: () => setState(() => _expanded = !_expanded),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(_expanded ? context.tr('see_less') : context.tr('see_more')),
                  Icon(_expanded ? Icons.keyboard_arrow_up_rounded : Icons.keyboard_arrow_down_rounded, size: 20),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _TimelineRow extends StatelessWidget {
  const _TimelineRow({required this.status, required this.entry, required this.isCurrent, required this.isLast});
  final String status;
  final TimelineEntry? entry;
  final bool isCurrent;
  final bool isLast;

  IconData get _icon {
    switch (status) {
      case OrderStatus.received:
        return Icons.receipt_long_outlined;
      case OrderStatus.processed:
        return Icons.soup_kitchen_outlined;
      case OrderStatus.readyForPickup:
        return Icons.shopping_bag_outlined;
      case OrderStatus.pickedUp:
        return Icons.inventory_2_outlined;
      case OrderStatus.outForDelivery:
        return Icons.delivery_dining_outlined;
      case OrderStatus.delivered:
        return Icons.verified_outlined;
      case OrderStatus.cancelled:
        return Icons.cancel_outlined;
      default:
        return Icons.circle_outlined;
    }
  }

  @override
  Widget build(BuildContext context) {
    final done = entry != null;
    final color = status == OrderStatus.cancelled ? AppColors.danger : (done ? AppColors.primary : context.mutedColor);
    final content = Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Column(
          children: [
            Container(
              width: 34,
              height: 34,
              decoration: BoxDecoration(
                color: isCurrent ? color : color.withValues(alpha: done ? 0.12 : 0.08),
                shape: BoxShape.circle,
              ),
              child: Icon(_icon, size: 17, color: isCurrent ? Colors.white : color),
            ),
            if (!isLast)
              Container(width: 2, height: 22, color: done ? AppColors.primary.withValues(alpha: 0.4) : context.borderColor),
          ],
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  context.trStatus(status),
                  style: TextStyle(
                    fontWeight: isCurrent ? FontWeight.w800 : FontWeight.w600,
                    color: done ? context.textColor : context.mutedColor,
                  ),
                ),
                if (entry?.at != null)
                  Text(Fmt.dateTime(entry!.at), style: TextStyle(fontSize: 11.5, color: context.mutedColor)),
              ],
            ),
          ),
        ),
      ],
    );
    if (!isCurrent) return content;
    return Container(
      padding: const EdgeInsets.fromLTRB(6, 6, 6, 0),
      margin: const EdgeInsets.only(bottom: 2),
      decoration: BoxDecoration(color: context.softGreen, borderRadius: BorderRadius.circular(10)),
      child: content,
    );
  }
}

class _ItemsCard extends StatelessWidget {
  const _ItemsCard({required this.order});
  final DeliveryOrder order;

  @override
  Widget build(BuildContext context) {
    Widget row(String l, String v, {bool bold = false, Color? color}) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 3),
          child: Row(
            children: [
              Expanded(child: Text(l, style: TextStyle(color: bold ? context.textColor : context.bodyColor, fontWeight: bold ? FontWeight.w800 : FontWeight.w500))),
              Text(v, style: TextStyle(fontWeight: bold ? FontWeight.w800 : FontWeight.w600, color: color ?? context.textColor)),
            ],
          ),
        );
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SectionTitle(
            '${context.tr('order_items')} (${order.itemCount})',
            trailing: TextButton.icon(
              onPressed: () => context.push('/order/${order.id}/invoice'),
              icon: const Icon(Icons.receipt_long_outlined, size: 16),
              label: Text(context.tr('view_invoice')),
            ),
          ),
          for (final it in order.items)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Row(
                children: [
                  AppNetworkImage(it.image, size: 44),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(it.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontWeight: FontWeight.w600, color: context.textColor)),
                        Text('${it.variant ?? ''}  ·  ${it.qty} × ${Fmt.money(it.price)}', style: TextStyle(fontSize: 12, color: context.mutedColor)),
                      ],
                    ),
                  ),
                  Text(Fmt.money(it.total), style: TextStyle(fontWeight: FontWeight.w700, color: context.textColor)),
                ],
              ),
            ),
          Divider(color: context.borderColor),
          row(context.tr('subtotal'), Fmt.money(order.subtotal)),
          row(context.tr('delivery_charge'), Fmt.money(order.deliveryCharge)),
          if (order.tax > 0) row(context.tr('tax'), Fmt.money(order.tax)),
          if (order.discount > 0) row(context.tr('discount'), '- ${Fmt.money(order.discount)}', color: AppColors.primary),
          const SizedBox(height: 4),
          row(context.tr('total'), Fmt.money(order.total), bold: true),
        ],
      ),
    );
  }
}
