import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/l10n/app_localizations.dart';
import '../core/theme.dart';
import '../core/utils.dart';
import '../models/models.dart';
import '../providers/providers.dart';
import 'common.dart';

/// Floating "2 items · ₹482 → View cart" bar shown when the cart is not empty.
class FloatingCartBar extends ConsumerWidget {
  final EdgeInsetsGeometry margin;
  const FloatingCartBar({super.key, this.margin = const EdgeInsets.fromLTRB(12, 0, 12, 10)});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cart = ref.watch(cartProvider).value ?? Cart.empty;
    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 220),
      transitionBuilder: (c, a) => SizeTransition(sizeFactor: a, axisAlignment: 1, child: FadeTransition(opacity: a, child: c)),
      child: cart.isEmpty
          ? const SizedBox(width: double.infinity)
          : Padding(
              key: const ValueKey('bar'),
              padding: margin,
              child: Material(
                color: AppColors.primary,
                borderRadius: BorderRadius.circular(14),
                elevation: 4,
                shadowColor: AppColors.primary.withValues(alpha: 0.4),
                child: InkWell(
                  borderRadius: BorderRadius.circular(14),
                  onTap: () => context.push('/cart'),
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(8, 8, 14, 8),
                    child: Row(children: [
                      SizedBox(
                        width: 40.0 + (cart.items.length.clamp(1, 3) - 1) * 14,
                        height: 40,
                        child: Stack(children: [
                          for (var i = 0; i < cart.items.length.clamp(1, 3); i++)
                            PositionedDirectional(
                              start: i * 14.0,
                              child: Container(
                                width: 40,
                                height: 40,
                                decoration: BoxDecoration(
                                  color: Colors.white,
                                  borderRadius: BorderRadius.circular(10),
                                  border: Border.all(color: AppColors.primary, width: 1.5),
                                ),
                                child: AppImage(
                                  url: cart.items[i].image,
                                  name: cart.items[i].productName,
                                  radius: BorderRadius.circular(9),
                                  background: Colors.white,
                                ),
                              ),
                            ),
                        ]),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
                          Text(context.tr('n_items', {'n': cart.itemCount}),
                              style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 14)),
                          Text(Fmt.money(cart.subtotal),
                              style: TextStyle(color: Colors.white.withValues(alpha: 0.9), fontSize: 12, fontWeight: FontWeight.w600)),
                        ]),
                      ),
                      Text(context.tr('view_cart'),
                          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 15)),
                      const Icon(Icons.chevron_right_rounded, color: Colors.white),
                    ]),
                  ),
                ),
              ),
            ),
    );
  }
}
