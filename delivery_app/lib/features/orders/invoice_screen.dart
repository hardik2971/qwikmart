import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../core/l10n.dart';
import '../../core/launcher.dart';
import '../../core/theme.dart';
import '../../models/models.dart';
import '../../providers/core_providers.dart';
import '../../providers/data_providers.dart';
import '../../widgets/common.dart';

/// In-app invoice view; "Open PDF" asks the `getInvoiceUrl` callable for the generated PDF.
class InvoiceScreen extends ConsumerStatefulWidget {
  const InvoiceScreen({super.key, required this.orderId});
  final String orderId;

  @override
  ConsumerState<InvoiceScreen> createState() => _InvoiceScreenState();
}

class _InvoiceScreenState extends ConsumerState<InvoiceScreen> {
  bool _opening = false;

  String get orderId => widget.orderId;

  Future<void> _openPdf() async {
    setState(() => _opening = true);
    try {
      final url = await ref.read(repositoryProvider).invoiceUrl(orderId);
      if (!mounted) return;
      if (url == null) {
        showSnack(context, context.tr('something_wrong'), error: true);
      } else {
        await Launcher.url(context, url);
      }
    } catch (e) {
      if (mounted) showSnack(context, errorText(e), error: true);
    } finally {
      if (mounted) setState(() => _opening = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(orderDetailProvider(orderId));
    return Scaffold(
      appBar: AppBar(
        title: Text(context.tr('invoice')),
        actions: [
          if (async.value != null && !ref.read(repositoryProvider).usingMock)
            TextButton.icon(
              onPressed: _opening ? null : _openPdf,
              icon: _opening
                  ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.picture_as_pdf_outlined, size: 18),
              label: Text(context.tr('open_pdf')),
            ),
        ],
      ),
      body: AsyncView<DeliveryOrder>(
        value: async,
        onRetry: () => ref.invalidate(orderDetailProvider(orderId)),
        builder: (o) => ListView(
          padding: const EdgeInsets.all(16),
          children: [
            AppCard(
              padding: const EdgeInsets.all(18),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const BrandLogo(height: 30),
                      const Spacer(),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Text('TAX INVOICE', style: TextStyle(fontWeight: FontWeight.w800, color: context.textColor, letterSpacing: 1)),
                          Text(o.orderNumber, style: TextStyle(color: context.mutedColor, fontSize: 12)),
                          Text(Fmt.dateTime(o.createdAt), style: TextStyle(color: context.mutedColor, fontSize: 12)),
                        ],
                      ),
                    ],
                  ),
                  Divider(height: 28, color: context.borderColor),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(child: _party(context, 'Sold by', o.store.name, '${o.store.address}\n${o.store.city}')),
                      const SizedBox(width: 12),
                      Expanded(child: _party(context, 'Deliver to', o.customer.name, o.customer.address)),
                    ],
                  ),
                  const SizedBox(height: 18),
                  Container(
                    padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 10),
                    decoration: BoxDecoration(color: context.softGreen, borderRadius: BorderRadius.circular(8)),
                    child: Row(
                      children: [
                        Expanded(flex: 5, child: Text(context.tr('item'), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12))),
                        Expanded(child: Text(context.tr('qty'), textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12))),
                        Expanded(flex: 2, child: Text(context.tr('amount'), textAlign: TextAlign.end, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12))),
                      ],
                    ),
                  ),
                  for (final it in o.items)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 10),
                      child: Row(
                        children: [
                          Expanded(
                            flex: 5,
                            child: Text('${it.name}${it.variant == null ? '' : ' (${it.variant})'}', style: const TextStyle(fontSize: 12.5)),
                          ),
                          Expanded(child: Text('${it.qty}', textAlign: TextAlign.center)),
                          Expanded(flex: 2, child: Text(Fmt.money(it.total), textAlign: TextAlign.end)),
                        ],
                      ),
                    ),
                  Divider(color: context.borderColor),
                  _sum(context, context.tr('subtotal'), Fmt.money(o.subtotal)),
                  _sum(context, context.tr('delivery_charge'), Fmt.money(o.deliveryCharge)),
                  _sum(context, context.tr('tax'), Fmt.money(o.tax)),
                  if (o.discount > 0) _sum(context, context.tr('discount'), '- ${Fmt.money(o.discount)}'),
                  Divider(color: context.borderColor),
                  _sum(context, context.tr('total'), Fmt.money(o.total), bold: true),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Text('${context.tr('payment')}: ', style: TextStyle(color: context.mutedColor)),
                      Text(Fmt.titleCase(o.paymentMethod == 'cod' ? 'Cash on Delivery' : o.paymentMethod),
                          style: const TextStyle(fontWeight: FontWeight.w700)),
                      const Spacer(),
                      StatusPill(o.paymentStatus),
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

  Widget _party(BuildContext context, String label, String name, String address) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label.toUpperCase(), style: TextStyle(fontSize: 10.5, color: context.mutedColor, fontWeight: FontWeight.w700, letterSpacing: 0.8)),
          const SizedBox(height: 4),
          Text(name, style: TextStyle(fontWeight: FontWeight.w700, color: context.textColor)),
          Text(address, style: TextStyle(fontSize: 12, color: context.bodyColor, height: 1.4)),
        ],
      );

  Widget _sum(BuildContext context, String l, String v, {bool bold = false}) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 3, horizontal: 10),
        child: Row(
          children: [
            Expanded(child: Text(l, style: TextStyle(fontWeight: bold ? FontWeight.w800 : FontWeight.w500))),
            Text(v, style: TextStyle(fontWeight: bold ? FontWeight.w800 : FontWeight.w600, fontSize: bold ? 16 : 14, color: bold ? AppColors.primary : null)),
          ],
        ),
      );
}
