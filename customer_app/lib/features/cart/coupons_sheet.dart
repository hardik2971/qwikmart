import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors.dart';
import '../../core/l10n/app_localizations.dart';
import '../../core/theme.dart';
import '../../core/utils.dart';
import '../../models/models.dart';
import '../../providers/providers.dart';
import '../../widgets/common.dart';

final couponsProvider = FutureProvider.autoDispose.family<List<Coupon>, double>((ref, subtotal) async {
  try {
    return await ref.watch(cartRepoProvider).coupons(subtotal: subtotal);
  } on AppException {
    return const [];
  }
});

/// Applies [code]; shows a snack with the result. Returns true on success.
Future<bool> applyCoupon(BuildContext context, WidgetRef ref, String code) async {
  try {
    final promo = await ref.read(cartRepoProvider).applyCoupon(code.trim().toUpperCase());
    ref.read(appliedPromoProvider.notifier).state = promo;
    if (context.mounted) {
      showSnack(context, promo.message.isNotEmpty ? promo.message : context.tr('coupon_applied'));
    }
    return true;
  } on AppException catch (e) {
    if (context.mounted) showSnack(context, e.displayMessage, error: true);
    return false;
  }
}

Future<void> showCouponsSheet(BuildContext context, double subtotal) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    builder: (_) => _CouponsSheet(subtotal: subtotal),
  );
}

class _CouponsSheet extends ConsumerStatefulWidget {
  final double subtotal;
  const _CouponsSheet({required this.subtotal});
  @override
  ConsumerState<_CouponsSheet> createState() => _CouponsSheetState();
}

class _CouponsSheetState extends ConsumerState<_CouponsSheet> {
  final _code = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  Future<void> _apply(String code) async {
    if (code.trim().isEmpty) return;
    setState(() => _busy = true);
    final ok = await applyCoupon(context, ref, code);
    if (!mounted) return;
    setState(() => _busy = false);
    if (ok) Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    final coupons = ref.watch(couponsProvider(widget.subtotal));
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.8,
      maxChildSize: 0.95,
      builder: (_, scroll) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
        child: ListView(controller: scroll, padding: const EdgeInsets.fromLTRB(16, 0, 16, 24), children: [
          Text(context.tr('apply_coupon'), style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: 12),
          Row(children: [
            Expanded(
              child: TextField(
                controller: _code,
                textCapitalization: TextCapitalization.characters,
                decoration: InputDecoration(hintText: context.tr('enter_coupon_code'), prefixIcon: const Icon(Icons.local_offer_outlined)),
                onSubmitted: _apply,
              ),
            ),
            const SizedBox(width: 10),
            AppButton(label: context.tr('apply'), expand: false, height: 50, loading: _busy, onPressed: () => _apply(_code.text)),
          ]),
          const SizedBox(height: 18),
          Text(context.tr('available_coupons'), style: const TextStyle(fontWeight: FontWeight.w800)),
          const SizedBox(height: 10),
          ...coupons.when(
            loading: () => [const Padding(padding: EdgeInsets.all(24), child: LoadingView())],
            error: (e, _) => [ErrorView(error: e)],
            data: (list) => list.isEmpty
                ? [Text(context.tr('no_coupons'), style: TextStyle(color: context.mutedText))]
                : [for (final c in list) CouponCard(coupon: c, onApply: () => _apply(c.code))],
          ),
        ]),
      ),
    );
  }
}

class CouponCard extends StatelessWidget {
  final Coupon coupon;
  final VoidCallback onApply;
  const CouponCard({super.key, required this.coupon, required this.onApply});

  @override
  Widget build(BuildContext context) {
    final c = coupon;
    final color = AppColors.fromHex(c.bannerColor);
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: context.cardColor,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: context.borderColor),
      ),
      child: IntrinsicHeight(
        child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Container(
            width: 44,
            decoration: BoxDecoration(
              color: color,
              borderRadius: const BorderRadiusDirectional.horizontal(start: Radius.circular(12)),
            ),
            alignment: Alignment.center,
            child: RotatedBox(
              quarterTurns: 3,
              child: Text(c.headline,
                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 12, letterSpacing: .5)),
            ),
          ),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      border: Border.all(color: color),
                      borderRadius: BorderRadius.circular(6),
                      color: color.withValues(alpha: 0.06),
                    ),
                    child: Text(c.code, style: TextStyle(fontWeight: FontWeight.w800, color: color, letterSpacing: 1)),
                  ),
                  const Spacer(),
                  TextButton(
                    onPressed: c.isApplicable ? onApply : null,
                    child: Text(context.tr('apply').toUpperCase()),
                  ),
                ]),
                const SizedBox(height: 4),
                Text(c.title, style: const TextStyle(fontWeight: FontWeight.w700)),
                if (c.description.isNotEmpty)
                  Text(c.description, style: TextStyle(fontSize: 12, color: context.mutedText)),
                if (!c.isApplicable && (c.remaining > 0 || c.message.isNotEmpty))
                  Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Text(
                        c.remaining > 0 ? context.tr('add_more_to_unlock', {'amount': Fmt.money(c.remaining)}) : c.message,
                        style: const TextStyle(fontSize: 12, color: AppColors.warning, fontWeight: FontWeight.w700)),
                  ),
              ]),
            ),
          ),
        ]),
      ),
    );
  }
}
