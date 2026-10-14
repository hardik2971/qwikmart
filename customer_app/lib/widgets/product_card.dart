import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/errors.dart';
import '../core/l10n/app_localizations.dart';
import '../core/theme.dart';
import '../core/utils.dart';
import '../models/models.dart';
import '../providers/providers.dart';
import 'common.dart';

/// Pushes the login screen when needed. Returns true when the user is (now) logged in.
Future<bool> ensureLoggedIn(BuildContext context, WidgetRef ref) async {
  if (ref.read(sessionProvider).isLoggedIn) return true;
  await context.push('/login?from=action');
  return ref.read(sessionProvider).isLoggedIn;
}

Future<void> toggleFavorite(BuildContext context, WidgetRef ref, Product p) async {
  try {
    final fav = await ref.read(favoritesProvider.notifier).toggle(p);
    if (context.mounted) showSnack(context, context.tr(fav ? 'added_to_favourites' : 'removed_from_favourites'));
  } on AppException catch (e) {
    if (!context.mounted) return;
    if (e.isUnauthorized) {
      if (await ensureLoggedIn(context, ref)) {
        if (context.mounted) await toggleFavorite(context, ref, p);
      }
    } else {
      showSnack(context, e.displayMessage, error: true);
    }
  }
}

/// Outlined green "ADD" that turns into a `− qty +` stepper.
class AddToCartButton extends ConsumerWidget {
  final Product product;
  final Variant? variant;
  final double width;
  final double height;
  const AddToCartButton({super.key, required this.product, this.variant, this.width = 72, this.height = 32});

  Future<void> _guard(BuildContext context, Future<void> Function() op) async {
    try {
      await op();
    } on AppException catch (e) {
      if (context.mounted) showSnack(context, e.displayMessage, error: true);
    } catch (e) {
      if (context.mounted) showSnack(context, '$e', error: true);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final v = variant ?? product.defaultVariant;
    if (v == null) return const SizedBox.shrink();
    final cart = ref.watch(cartProvider).value ?? Cart.empty;
    final multi = variant == null && product.variants.length > 1;
    final qty = multi
        ? product.variants.fold<int>(0, (s, x) => s + cart.qtyForVariant(x.id))
        : cart.qtyForVariant(v.id);
    final notifier = ref.read(cartProvider.notifier);

    if (!product.variants.any((x) => x.inStock)) {
      return Container(
        width: width,
        height: height,
        alignment: Alignment.center,
        decoration: BoxDecoration(color: context.borderColor, borderRadius: BorderRadius.circular(8)),
        child: Text(context.tr('out_of_stock'),
            textAlign: TextAlign.center, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: context.mutedText)),
      );
    }

    if (qty > 0) {
      return QtyStepper(
        qty: qty,
        width: width + 12,
        height: height,
        onMinus: () => multi ? showVariantSheet(context, product) : _guard(context, () => notifier.decrement(v.id)),
        onPlus: () => multi ? showVariantSheet(context, product) : _guard(context, () => notifier.increment(v.id, productId: product.id)),
      );
    }
    return Column(mainAxisSize: MainAxisSize.min, children: [
      SizedBox(
        width: width,
        height: height,
        child: OutlinedButton(
          onPressed: () => multi ? showVariantSheet(context, product) : _guard(context, () => notifier.add(product.id, v.id)),
          style: OutlinedButton.styleFrom(
            padding: EdgeInsets.zero,
            minimumSize: Size(width, height),
            backgroundColor: context.cardColor,
            side: const BorderSide(color: AppColors.primary, width: 1.2),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
          ),
          child: Text(context.tr('add'),
              style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13, color: AppColors.primary)),
        ),
      ),
      if (multi)
        Padding(
          padding: const EdgeInsets.only(top: 2),
          child: Text(context.tr('n_options', {'n': product.variants.length}),
              style: TextStyle(fontSize: 9.5, color: context.mutedText, fontWeight: FontWeight.w600)),
        ),
    ]);
  }
}

Future<void> showVariantSheet(BuildContext context, Product product) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    builder: (ctx) => SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(product.name, style: ctx.text.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: 12),
          for (final v in product.variants)
            Container(
              margin: const EdgeInsets.only(bottom: 10),
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                border: Border.all(color: ctx.borderColor),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(children: [
                AppImage(url: v.image.isNotEmpty ? v.image : product.image, name: product.name, width: 48, height: 48,
                    radius: BorderRadius.circular(8)),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(v.name, style: const TextStyle(fontWeight: FontWeight.w700)),
                    const SizedBox(height: 2),
                    PriceRow(price: v.effectivePrice, mrp: v.price, fontSize: 13, showOff: true),
                  ]),
                ),
                AddToCartButton(product: product, variant: v),
              ]),
            ),
        ]),
      ),
    ),
  );
}

/// Grid / slider product card (screenshot 15 / 23).
class ProductCard extends ConsumerWidget {
  final Product product;
  final double? width;
  const ProductCard({super.key, required this.product, this.width});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final p = product;
    final v = p.defaultVariant;
    final fav = ref.watch(favoriteIdsProvider).contains(p.id);
    final isQuick = ref.watch(sessionProvider.select((s) => s.isQuick));
    final off = v?.discountPercent ?? 0;

    return SizedBox(
      width: width,
      child: Material(
        color: context.cardColor,
        borderRadius: BorderRadius.circular(AppRadius.card),
        child: InkWell(
          borderRadius: BorderRadius.circular(AppRadius.card),
          onTap: () => context.push('/product/${p.slug}'),
          child: Container(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(AppRadius.card),
              border: Border.all(color: context.borderColor),
            ),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Stack(clipBehavior: Clip.none, children: [
                AspectRatio(
                  aspectRatio: 1,
                  child: Padding(
                    padding: const EdgeInsets.all(6),
                    child: AppImage(url: p.image, name: p.name, radius: BorderRadius.circular(10), emojiScale: 0.48),
                  ),
                ),
                if (off > 0)
                  Positioned(
                    left: 0,
                    top: 0,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
                      decoration: const BoxDecoration(
                        color: AppColors.primary,
                        borderRadius: BorderRadiusDirectional.only(
                          topStart: Radius.circular(AppRadius.card),
                          bottomEnd: Radius.circular(10),
                        ),
                      ),
                      child: Text('$off%\nOFF',
                          textAlign: TextAlign.center,
                          style: const TextStyle(color: Colors.white, fontSize: 9.5, height: 1.05, fontWeight: FontWeight.w800)),
                    ),
                  ),
                Positioned(
                  right: 4,
                  top: 4,
                  child: InkWell(
                    onTap: () => toggleFavorite(context, ref, p),
                    customBorder: const CircleBorder(),
                    child: Container(
                      padding: const EdgeInsets.all(5),
                      decoration: BoxDecoration(color: context.cardColor.withValues(alpha: 0.9), shape: BoxShape.circle),
                      child: Icon(fav ? Icons.favorite_rounded : Icons.favorite_border_rounded,
                          size: 16, color: fav ? AppColors.danger : context.mutedText),
                    ),
                  ),
                ),
                if (v != null && v.name.isNotEmpty)
                  PositionedDirectional(
                    start: 10,
                    bottom: 10,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: context.cardColor.withValues(alpha: 0.92),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(v.name, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: context.mutedText)),
                    ),
                  ),
                PositionedDirectional(end: 8, bottom: -6, child: AddToCartButton(product: p, width: 64, height: 30)),
              ]),
              Padding(
                padding: const EdgeInsets.fromLTRB(10, 10, 10, 10),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  if (v != null) PriceRow(price: v.effectivePrice, mrp: v.price, fontSize: 14),
                  if (off > 0)
                    Text('$off% OFF',
                        style: const TextStyle(color: AppColors.primary, fontSize: 11, fontWeight: FontWeight.w800)),
                  const SizedBox(height: 3),
                  Text(p.name,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, height: 1.25)),
                  const SizedBox(height: 4),
                  if (isQuick && p.deliveryMinutes > 0)
                    Row(children: [
                      Icon(Icons.timer_outlined, size: 12, color: context.mutedText),
                      const SizedBox(width: 3),
                      Text(context.tr('n_mins', {'n': p.deliveryMinutes}),
                          style: TextStyle(fontSize: 10.5, color: context.mutedText, fontWeight: FontWeight.w600)),
                    ])
                  else if (p.ratingCount > 0)
                    Row(children: [
                      RatingStars(rating: p.ratingAvg, size: 11),
                      const SizedBox(width: 3),
                      Text('(${p.ratingCount})', style: TextStyle(fontSize: 10, color: context.mutedText)),
                    ]),
                ]),
              ),
            ]),
          ),
        ),
      ),
    );
  }
}

/// Grid of product cards used by search / category / favourites.
class ProductGrid extends StatelessWidget {
  final List<Product> products;
  final EdgeInsetsGeometry padding;
  final int columns;
  final ScrollController? controller;
  final bool shrinkWrap;
  const ProductGrid({
    super.key,
    required this.products,
    this.padding = const EdgeInsets.fromLTRB(12, 12, 12, 100),
    this.columns = 2,
    this.controller,
    this.shrinkWrap = false,
  });

  @override
  Widget build(BuildContext context) {
    return GridView.builder(
      controller: controller,
      padding: padding,
      shrinkWrap: shrinkWrap,
      physics: shrinkWrap ? const NeverScrollableScrollPhysics() : null,
      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: columns,
        mainAxisSpacing: 10,
        crossAxisSpacing: 10,
        mainAxisExtent: columns >= 3 ? 248 : 292,
      ),
      itemCount: products.length,
      itemBuilder: (_, i) => ProductCard(product: products[i]),
    );
  }
}
