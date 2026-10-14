import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/errors.dart';
import '../../core/l10n/app_localizations.dart';
import '../../core/theme.dart';
import '../../core/utils.dart';
import '../../models/models.dart';
import '../../providers/providers.dart';
import '../../widgets/common.dart';

const _cancelReasons = [
  'reason_changed_mind',
  'reason_wrong_address',
  'reason_ordered_by_mistake',
  'reason_delivery_too_late',
  'reason_found_cheaper',
  'reason_other',
];

const _returnReasons = [
  'reason_damaged',
  'reason_wrong_item',
  'reason_expired',
  'reason_quality',
  'reason_missing_parts',
  'reason_other',
];

/// Cancel order sheet (screenshot 19). Returns true when cancelled.
Future<bool> showCancelSheet(BuildContext context, WidgetRef ref, Order order) async {
  final result = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    builder: (_) => _ReasonSheet(
      titleKey: 'cancel_order',
      reasons: _cancelReasons,
      submitKey: 'cancel_order',
      danger: true,
      onSubmit: (reason, _, _) async {
        await ref.read(orderRepoProvider).cancel(order.id, reason);
        return 'order_cancelled';
      },
    ),
  );
  return result == true;
}

/// Item-level return request with qty, reason and photos.
Future<bool> showReturnSheet(BuildContext context, WidgetRef ref, OrderItem item) async {
  final result = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    builder: (_) => _ReasonSheet(
      titleKey: 'return_item',
      subtitle: item.productName,
      reasons: _returnReasons,
      submitKey: 'submit_return',
      maxQty: item.qty,
      allowImages: true,
      onSubmit: (reason, qty, images) async {
        final msg = await ref.read(orderRepoProvider).requestReturn(
              orderId: item.orderId,
              variantId: item.variantId,
              qty: qty,
              reason: reason,
              images: images,
            );
        return msg;
      },
    ),
  );
  return result == true;
}

class _ReasonSheet extends StatefulWidget {
  final String titleKey;
  final String? subtitle;
  final List<String> reasons;
  final String submitKey;
  final bool danger;
  final int maxQty;
  final bool allowImages;
  final Future<String> Function(String reason, int qty, List<XFile> images) onSubmit;

  const _ReasonSheet({
    required this.titleKey,
    this.subtitle,
    required this.reasons,
    required this.submitKey,
    required this.onSubmit,
    this.danger = false,
    this.maxQty = 0,
    this.allowImages = false,
  });

  @override
  State<_ReasonSheet> createState() => _ReasonSheetState();
}

class _ReasonSheetState extends State<_ReasonSheet> {
  String? _reason;
  final _text = TextEditingController();
  int _qty = 1;
  final List<XFile> _images = [];
  bool _busy = false;

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  Future<void> _pick() async {
    try {
      final files = await ImagePicker().pickMultiImage(imageQuality: 70, limit: 4);
      if (files.isNotEmpty) setState(() => _images..clear()..addAll(files.take(4)));
    } catch (e) {
      if (mounted) showSnack(context, '$e', error: true);
    }
  }

  Future<void> _submit() async {
    final reasonText = _reason == null
        ? _text.text.trim()
        : [context.tr(_reason!), if (_text.text.trim().isNotEmpty) _text.text.trim()].join(' — ');
    if (reasonText.isEmpty) {
      showSnack(context, context.tr('select_reason'), error: true);
      return;
    }
    setState(() => _busy = true);
    try {
      final msg = await widget.onSubmit(reasonText, _qty, _images);
      if (!mounted) return;
      showSnack(context, msg.contains('_') ? context.tr(msg) : msg);
      Navigator.pop(context, true);
    } on AppException catch (e) {
      if (mounted) showSnack(context, e.displayMessage, error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 0, 20, MediaQuery.of(context).viewInsets.bottom + 20),
      child: SingleChildScrollView(
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(context.tr(widget.titleKey), style: context.text.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
          if (widget.subtitle != null)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(widget.subtitle!, style: TextStyle(color: context.mutedText)),
            ),
          const SizedBox(height: 14),
          Wrap(spacing: 8, runSpacing: 8, children: [
            for (final r in widget.reasons)
              ChoiceChip(
                label: Text(context.tr(r)),
                selected: _reason == r,
                onSelected: (v) => setState(() => _reason = v ? r : null),
              ),
          ]),
          const SizedBox(height: 14),
          Text('${context.tr('reason')} *', style: const TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 6),
          TextField(
            controller: _text,
            maxLines: 3,
            decoration: InputDecoration(hintText: context.tr('write_reason')),
          ),
          if (widget.maxQty > 1) ...[
            const SizedBox(height: 14),
            Row(children: [
              Text(context.tr('quantity'), style: const TextStyle(fontWeight: FontWeight.w700)),
              const Spacer(),
              QtyStepper(
                qty: _qty,
                onMinus: () => setState(() => _qty = (_qty - 1).clamp(1, widget.maxQty)),
                onPlus: () => setState(() => _qty = (_qty + 1).clamp(1, widget.maxQty)),
              ),
            ]),
          ],
          if (widget.allowImages) ...[
            const SizedBox(height: 14),
            Wrap(spacing: 8, runSpacing: 8, children: [
              for (final _ in _images)
                Container(
                  width: 56,
                  height: 56,
                  decoration: BoxDecoration(color: AppColors.primary50, borderRadius: BorderRadius.circular(8)),
                  child: const Icon(Icons.image_outlined, color: AppColors.primary),
                ),
              InkWell(
                onTap: _pick,
                child: Container(
                  width: 56,
                  height: 56,
                  decoration: BoxDecoration(border: Border.all(color: context.borderColor), borderRadius: BorderRadius.circular(8)),
                  child: Icon(Icons.add_a_photo_outlined, semanticLabel: context.tr('add_photos')),
                ),
              ),
            ]),
          ],
          const SizedBox(height: 18),
          AppButton(
            label: context.tr(widget.submitKey),
            loading: _busy,
            color: widget.danger ? AppColors.danger : null,
            onPressed: _submit,
          ),
        ]),
      ),
    );
  }
}
