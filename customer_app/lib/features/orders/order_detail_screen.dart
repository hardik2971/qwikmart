import 'dart:async';

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/errors.dart';
import '../../core/l10n/app_localizations.dart';
import '../../core/theme.dart';
import '../../core/utils.dart';
import '../../models/models.dart';
import '../../providers/providers.dart';
import '../../widgets/common.dart';
import '../cart/payment_methods_screen.dart' show gatewayName;
import 'order_sheets.dart';
import 'orders_screen.dart';

class OrderDetailScreen extends ConsumerStatefulWidget {
  final String orderId;
  const OrderDetailScreen({super.key, required this.orderId});
  @override
  ConsumerState<OrderDetailScreen> createState() => _OrderDetailScreenState();
}

/// Order detail — realtime (Firestore `onSnapshot` on `orders/{id}`) with the delivery OTP from
/// `orders/{id}/secret/otp` while the order is active.
class _OrderDetailScreenState extends ConsumerState<OrderDetailScreen> {
  bool _invoiceBusy = false;

  Future<void> _reorder(Order o) async {
    try {
      final msg = await ref.read(orderRepoProvider).reorder(o.id);
      await ref.read(cartProvider.notifier).refresh();
      if (!mounted) return;
      showSnack(context, msg.isEmpty ? context.tr('items_added_to_cart') : msg);
      context.push('/cart');
    } on AppException catch (e) {
      if (mounted) showSnack(context, e.displayMessage, error: true);
    }
  }

  /// `getInvoiceUrl` (PDF generated on first request); falls back to the in-app summary sheet.
  Future<void> _invoice(Order o) async {
    if (_invoiceBusy) return;
    var url = o.invoiceUrl;
    if (url.isEmpty && o.status != 'payment_pending' && !o.isCancelled) {
      setState(() => _invoiceBusy = true);
      try {
        url = await ref.read(orderRepoProvider).invoiceUrl(o.id);
      } catch (e) {
        if (mounted) showSnack(context, '$e', error: true);
      } finally {
        if (mounted) setState(() => _invoiceBusy = false);
      }
    }
    if (url.isNotEmpty) {
      // Web: the PDF can take a while on first request, after which a new-tab popup is blocked (no user
      // activation left) — open it in the same tab instead.
      await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication, webOnlyWindowName: kIsWeb ? '_self' : null);
      return;
    }
    if (!mounted) return;
    await showModalBottomSheet<void>(context: context, isScrollControlled: true, builder: (_) => _InvoiceSheet(order: o));
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(orderDetailProvider(widget.orderId));
    return Scaffold(
      appBar: AppBar(
        title: Text(context.tr('order_detail')),
        actions: [
          Padding(
            padding: const EdgeInsetsDirectional.only(end: 12),
            child: OutlinedButton.icon(
              onPressed: () => context.push('/support?order_id=${widget.orderId}'),
              style: OutlinedButton.styleFrom(
                minimumSize: const Size(0, 34),
                padding: const EdgeInsets.symmetric(horizontal: 12),
                foregroundColor: context.isDark ? Colors.white : AppColors.ink,
                side: BorderSide(color: context.borderColor),
                shape: const StadiumBorder(),
              ),
              icon: const Icon(Icons.headset_mic_outlined, size: 16),
              label: Text(context.tr('help')),
            ),
          ),
        ],
      ),
      body: async.when(
        skipLoadingOnRefresh: true,
        skipLoadingOnReload: true,
        loading: () => const LoadingView(),
        error: (e, _) => ErrorView(error: e, onRetry: () => ref.invalidate(orderDetailProvider(widget.orderId))),
        data: (o) => RefreshIndicator(
          onRefresh: () => ref.refresh(orderDetailProvider(widget.orderId).future),
          child: ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 32), children: [
            _statusCard(o),
            if (o.isActive && o.deliveryOtp.isNotEmpty) ...[const SizedBox(height: 12), _OtpCard(order: o)],
            if (o.isTrackable) ...[
              const SizedBox(height: 12),
              AppButton(
                label: context.tr('track_order_live'),
                icon: Icons.near_me_rounded,
                onPressed: () => context.push('/orders/${o.id}/track'),
              ),
            ],
            if (o.deliveryBoy != null && o.isActive) ...[const SizedBox(height: 12), DeliveryPartnerCard(info: o.deliveryBoy!)],
            const SizedBox(height: 12),
            _itemsCard(o),
            const SizedBox(height: 12),
            _detailCard(o),
            const SizedBox(height: 12),
            _timelineCard(o),
            const SizedBox(height: 12),
            _billCard(o),
            const SizedBox(height: 16),
            if (o.canCancel)
              AppButton(
                label: context.tr('cancel_order'),
                outlined: true,
                color: AppColors.danger,
                onPressed: () async {
                  if (await showCancelSheet(context, ref, o)) {
                    // The detail screen updates itself (realtime); refresh the lists.
                    ref.invalidate(ordersProvider);
                    ref.invalidate(walletProvider);
                  }
                },
              ),
            const SizedBox(height: 10),
            Row(children: [
              Expanded(
                child: AppButton(
                  label: context.tr('invoice'),
                  icon: Icons.receipt_long_outlined,
                  outlined: true,
                  loading: _invoiceBusy,
                  onPressed: () => _invoice(o),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: AppButton(label: context.tr('reorder'), icon: Icons.replay_rounded, onPressed: () => _reorder(o)),
              ),
            ]),
          ]),
        ),
      ),
    );
  }

  Widget _statusCard(Order o) {
    final color = o.isCancelled ? AppColors.danger : AppColors.primary;
    return Material(
      color: color,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: o.isTrackable ? () => context.push('/orders/${o.id}/track') : null,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(children: [
            Container(
              padding: const EdgeInsets.all(9),
              decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.2), shape: BoxShape.circle),
              child: Icon(o.isCancelled ? Icons.close_rounded : Icons.shopping_bag_outlined, color: Colors.white),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(statusLabel(context, o.status),
                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 16)),
                Text(
                  o.timeline.isNotEmpty
                      ? context.tr('on_date', {'date': Fmt.dateTime(o.timeline.last.createdAt)})
                      : context.tr('on_date', {'date': Fmt.dateTime(o.createdAt)}),
                  style: TextStyle(color: Colors.white.withValues(alpha: 0.88), fontSize: 12),
                ),
                if (o.isCancelled && o.cancelReason.isNotEmpty)
                  Text(o.cancelReason, style: TextStyle(color: Colors.white.withValues(alpha: 0.88), fontSize: 12)),
              ]),
            ),
            if (o.isTrackable) const Icon(Icons.chevron_right_rounded, color: Colors.white),
          ]),
        ),
      ),
    );
  }

  Widget _itemsCard(Order o) {
    return AppCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(context.tr('items_n', {'n': o.items.length}), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
        const SizedBox(height: 10),
        for (final it in o.items)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Column(children: [
              Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                InkWell(
                  onTap: () => context.push('/product/${it.productSlug.isEmpty ? it.productId : it.productSlug}'),
                  child: Container(
                    width: 52,
                    height: 52,
                    decoration: BoxDecoration(border: Border.all(color: context.borderColor), borderRadius: BorderRadius.circular(10)),
                    child: AppImage(url: it.image, name: it.productName, radius: BorderRadius.circular(9)),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('${it.qty} × ${it.productName}', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
                    if (it.variantName.isNotEmpty)
                      Text('${context.tr('pack_size')}: ${it.variantName}', style: TextStyle(fontSize: 11.5, color: context.mutedText)),
                    if (it.status == 'return_requested')
                      Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Pill(label: context.tr('status_return_requested'), color: AppColors.warning, fontSize: 10),
                      ),
                  ]),
                ),
                Text(Fmt.money(it.total), style: const TextStyle(fontWeight: FontWeight.w800)),
              ]),
              if (it.canReview || it.canReturn)
                Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Row(mainAxisAlignment: MainAxisAlignment.end, children: [
                    if (it.canReturn)
                      TextButton.icon(
                        onPressed: () async {
                          if (await showReturnSheet(context, ref, it)) ref.invalidate(orderDetailProvider(o.id));
                        },
                        icon: const Icon(Icons.assignment_return_outlined, size: 16),
                        label: Text(context.tr('return')),
                      ),
                    if (it.canReview)
                      TextButton.icon(
                        onPressed: () async {
                          final ok = await context.push<bool>('/review', extra: it);
                          if (ok == true) ref.invalidate(orderDetailProvider(o.id));
                        },
                        icon: const Icon(Icons.star_outline_rounded, size: 16),
                        label: Text(context.tr('rate_product')),
                      ),
                  ]),
                ),
            ]),
          ),
      ]),
    );
  }

  Widget _detailCard(Order o) {
    Widget row(String label, String value, {Widget? trailing}) => Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(label, style: TextStyle(fontSize: 11.5, color: context.mutedText)),
                const SizedBox(height: 2),
                Text(value, style: const TextStyle(fontWeight: FontWeight.w700)),
              ]),
            ),
            ?trailing,
          ]),
        );
    return AppCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(context.tr('order_detail'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
        const SizedBox(height: 10),
        row(
          context.tr('order_id'),
          o.orderNumber,
          trailing: InkWell(
            onTap: () {
              Clipboard.setData(ClipboardData(text: o.orderNumber));
              showSnack(context, context.tr('copied'));
            },
            child: Icon(Icons.copy_rounded, size: 18, color: context.mutedText),
          ),
        ),
        row(context.tr('payment_method'),
            '${gatewayName(context, o.paymentMethod, const [])} · ${Fmt.titleCase(o.paymentStatus)}'),
        if (o.customerName.isNotEmpty) row(context.tr('customer_info'), '${o.customerName} · ${o.customerPhone}'),
        if (o.deliveryType == 'self_pickup')
          row(context.tr('pickup_store'), o.store?.name ?? '-')
        else if (o.address != null)
          row(context.tr('delivery_address'), o.address!.fullAddress),
        row(context.tr('order_placed_on'), Fmt.dateTime(o.createdAt)),
        row(context.tr('mode'), o.mode == 'ecommerce' ? context.tr('ecommerce') : context.tr('quick')),
      ]),
    );
  }

  Widget _timelineCard(Order o) {
    final List<String> flow;
    if (o.isCancelled) {
      flow = ['received', 'cancelled'];
    } else if (o.deliveryType == 'self_pickup') {
      flow = ['received', 'processed', 'ready_for_pickup', 'delivered'];
    } else if (o.mode == 'ecommerce') {
      flow = ['received', 'processed', 'shipped', 'out_for_delivery', 'delivered'];
    } else {
      flow = ['received', 'processed', 'picked_up', 'out_for_delivery', 'delivered'];
    }
    final done = {for (final t in o.timeline) t.status: t};
    var reached = flow.indexOf(o.status);
    if (reached < 0) reached = done.isEmpty ? 0 : flow.lastIndexWhere(done.containsKey);
    return AppCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(context.tr('track_order'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
        const SizedBox(height: 12),
        for (var i = 0; i < flow.length; i++)
          IntrinsicHeight(
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Column(children: [
                Container(
                  width: 24,
                  height: 24,
                  decoration: BoxDecoration(
                    color: i <= reached ? (flow[i] == 'cancelled' ? AppColors.danger : AppColors.primary) : context.borderColor,
                    shape: BoxShape.circle,
                  ),
                  child: Icon(flow[i] == 'cancelled' ? Icons.close_rounded : Icons.check_rounded, size: 15, color: Colors.white),
                ),
                if (i < flow.length - 1)
                  Expanded(
                    child: Container(
                      width: 2,
                      margin: const EdgeInsets.symmetric(vertical: 2),
                      color: i < reached ? AppColors.primary : context.borderColor,
                    ),
                  ),
              ]),
              const SizedBox(width: 12),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.only(bottom: 16),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(context.tr('timeline_${flow[i]}'),
                        style: TextStyle(fontWeight: FontWeight.w700, color: i <= reached ? null : context.mutedText)),
                    if (done[flow[i]]?.createdAt != null)
                      Text(Fmt.dateTime(done[flow[i]]!.createdAt), style: TextStyle(fontSize: 11.5, color: context.mutedText)),
                  ]),
                ),
              ),
            ]),
          ),
      ]),
    );
  }

  Widget _billCard(Order o) {
    return AppCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(context.tr('bill_details'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
        const SizedBox(height: 6),
        KeyValueRow(label: context.tr('subtotal'), value: Fmt.money(o.subtotal)),
        KeyValueRow(
          label: context.tr('delivery_charge'),
          value: o.deliveryCharge == 0 ? context.tr('free') : Fmt.money(o.deliveryCharge),
          valueColor: o.deliveryCharge == 0 ? AppColors.primary : null,
        ),
        if (o.surgeCharge > 0) KeyValueRow(label: context.tr('surge_charge'), value: Fmt.money(o.surgeCharge)),
        if (o.additionalCharges > 0) KeyValueRow(label: context.tr('other_charges'), value: Fmt.money(o.additionalCharges)),
        if (o.taxAmount > 0) KeyValueRow(label: context.tr('taxes'), value: Fmt.money(o.taxAmount)),
        if (o.promoDiscount > 0)
          KeyValueRow(
            label: '${context.tr(o.promoIsCashback ? 'cashback_after_delivery' : 'coupon_discount')}'
                '${o.promoCode.isNotEmpty ? ' (${o.promoCode})' : ''}',
            value: '${o.promoIsCashback ? '+' : '-'}${Fmt.money(o.promoDiscount)}',
            valueColor: AppColors.primary,
          ),
        if (o.walletUsed > 0)
          KeyValueRow(label: context.tr('wallet_used'), value: '-${Fmt.money(o.walletUsed)}', valueColor: AppColors.primary),
        const Divider(height: 18),
        KeyValueRow(label: context.tr('total_amount'), value: Fmt.money(o.total), bold: true),
        if (o.discount > 0)
          Container(
            margin: const EdgeInsets.only(top: 8),
            width: double.infinity,
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(color: AppColors.primary50, borderRadius: BorderRadius.circular(8)),
            child: Text('🎉 ${context.tr('you_saved_order', {'amount': Fmt.money(o.discount + o.promoDiscount)})}',
                textAlign: TextAlign.center,
                style: const TextStyle(color: AppColors.primaryDark, fontWeight: FontWeight.w700, fontSize: 12.5)),
          ),
      ]),
    );
  }
}

/// "Delivery Verification" OTP card with Copy / Share (screenshot 20).
class _OtpCard extends StatelessWidget {
  final Order order;
  const _OtpCard({required this.order});

  @override
  Widget build(BuildContext context) {
    final pickup = order.deliveryType == 'self_pickup';
    return AppCard(
      child: Column(children: [
        Align(
          alignment: AlignmentDirectional.centerStart,
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(context.tr(pickup ? 'pickup_verification' : 'delivery_verification'),
                style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
            Text(context.tr(pickup ? 'show_otp_store' : 'share_otp_partner'),
                style: TextStyle(fontSize: 12, color: context.mutedText)),
          ]),
        ),
        const SizedBox(height: 12),
        Text(
          order.deliveryOtp.split('').join(' '),
          style: const TextStyle(fontSize: 30, fontWeight: FontWeight.w800, color: AppColors.primary, letterSpacing: 4),
        ),
        const SizedBox(height: 10),
        const Divider(height: 1),
        Row(children: [
          Expanded(
            child: TextButton.icon(
              onPressed: () {
                Clipboard.setData(ClipboardData(text: order.deliveryOtp));
                showSnack(context, context.tr('otp_copied'));
              },
              icon: const Icon(Icons.copy_rounded, size: 18),
              label: Text(context.tr('copy_otp')),
            ),
          ),
          Container(width: 1, height: 26, color: context.borderColor),
          Expanded(
            child: TextButton.icon(
              onPressed: () => SharePlus.instance.share(ShareParams(
                text: 'QwikMart delivery OTP for ${order.orderNumber}: ${order.deliveryOtp}',
              )),
              icon: const Icon(Icons.share_outlined, size: 18),
              label: Text(context.tr('share_otp')),
            ),
          ),
        ]),
      ]),
    );
  }
}

/// "I'm Abhay, your delivery partner" card with a call button.
class DeliveryPartnerCard extends StatelessWidget {
  final DeliveryBoyInfo info;
  const DeliveryPartnerCard({super.key, required this.info});

  @override
  Widget build(BuildContext context) {
    return AppCard(
      child: Row(children: [
        CircleAvatar(
          radius: 22,
          backgroundColor: AppColors.primary50,
          child: info.avatar.isNotEmpty
              ? ClipOval(child: AppImage(url: info.avatar, name: info.name, width: 44, height: 44))
              : const Icon(Icons.person_outline_rounded, color: AppColors.primary),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(context.tr('im_your_partner', {'name': info.name}), style: const TextStyle(fontWeight: FontWeight.w800)),
            Text(context.tr('partner_safety_note'), style: TextStyle(fontSize: 11.5, color: context.mutedText)),
          ]),
        ),
        if (info.phone.isNotEmpty)
          Material(
            color: AppColors.primary,
            shape: const CircleBorder(),
            child: InkWell(
              customBorder: const CircleBorder(),
              onTap: () => launchUrl(Uri(scheme: 'tel', path: info.phone)),
              child: const Padding(padding: EdgeInsets.all(10), child: Icon(Icons.call_rounded, color: Colors.white, size: 20)),
            ),
          ),
      ]),
    );
  }
}

class _InvoiceSheet extends StatelessWidget {
  final Order order;
  const _InvoiceSheet({required this.order});

  String _text() {
    final b = StringBuffer()
      ..writeln('QwikMart — Tax Invoice')
      ..writeln('Order: ${order.orderNumber}')
      ..writeln('Date: ${Fmt.dateTime(order.createdAt)}')
      ..writeln('');
    for (final i in order.items) {
      b.writeln('${i.qty} x ${i.productName} (${i.variantName})  ${Fmt.money(i.total)}');
    }
    b
      ..writeln('')
      ..writeln('Subtotal: ${Fmt.money(order.subtotal)}')
      ..writeln('Delivery: ${Fmt.money(order.deliveryCharge)}')
      ..writeln('Discount: -${Fmt.money(order.promoDiscount)}')
      ..writeln('Wallet: -${Fmt.money(order.walletUsed)}')
      ..writeln('Total: ${Fmt.money(order.total)}');
    return b.toString();
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            const BrandLogo(height: 28),
            const Spacer(),
            Text(context.tr('invoice'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
          ]),
          const SizedBox(height: 12),
          Text(order.orderNumber, style: const TextStyle(fontWeight: FontWeight.w700)),
          Text(Fmt.dateTime(order.createdAt), style: TextStyle(color: context.mutedText, fontSize: 12)),
          const Divider(height: 20),
          for (final i in order.items)
            KeyValueRow(label: '${i.qty} × ${i.productName}', value: Fmt.money(i.total)),
          const Divider(height: 20),
          KeyValueRow(label: context.tr('subtotal'), value: Fmt.money(order.subtotal)),
          KeyValueRow(label: context.tr('delivery_charge'), value: Fmt.money(order.deliveryCharge)),
          if (order.promoDiscount > 0) KeyValueRow(label: context.tr('coupon_discount'), value: '-${Fmt.money(order.promoDiscount)}'),
          if (order.walletUsed > 0) KeyValueRow(label: context.tr('wallet_used'), value: '-${Fmt.money(order.walletUsed)}'),
          KeyValueRow(label: context.tr('total_amount'), value: Fmt.money(order.total), bold: true),
          const SizedBox(height: 14),
          AppButton(
            label: context.tr('share_invoice'),
            icon: Icons.share_outlined,
            onPressed: () => SharePlus.instance.share(ShareParams(text: _text(), subject: 'Invoice ${order.orderNumber}')),
          ),
        ]),
      ),
    );
  }
}
