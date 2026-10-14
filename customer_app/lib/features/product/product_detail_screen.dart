import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:share_plus/share_plus.dart';

import '../../core/l10n/app_localizations.dart';
import '../../core/theme.dart';
import '../../core/utils.dart';
import '../../models/models.dart';
import '../../providers/providers.dart';
import '../../widgets/common.dart';
import '../../widgets/html_text.dart';
import '../../widgets/product_card.dart';
import 'reviews_widgets.dart';

class ProductDetailScreen extends ConsumerStatefulWidget {
  final String slug;
  const ProductDetailScreen({super.key, required this.slug});
  @override
  ConsumerState<ProductDetailScreen> createState() => _ProductDetailScreenState();
}

class _ProductDetailScreenState extends ConsumerState<ProductDetailScreen> {
  String? _variantId;
  int _image = 0;

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(productDetailProvider(widget.slug));
    return async.when(
      loading: () => Scaffold(appBar: AppBar(), body: const LoadingView()),
      error: (e, _) => Scaffold(
        appBar: AppBar(),
        body: ErrorView(error: e, onRetry: () => ref.invalidate(productDetailProvider(widget.slug))),
      ),
      data: (p) {
        final variant = p.variants.where((v) => v.id == _variantId).firstOrNull ?? p.defaultVariant;
        final fav = ref.watch(favoriteIdsProvider).contains(p.id);
        final isQuick = ref.watch(sessionProvider.select((s) => s.isQuick));
        return Scaffold(
          backgroundColor: context.isDark ? AppColors.darkBg : Colors.white,
          appBar: AppBar(
            title: Text(p.name, maxLines: 1, overflow: TextOverflow.ellipsis),
            actions: [
              IconButton(
                icon: const Icon(Icons.share_outlined),
                onPressed: () => SharePlus.instance.share(ShareParams(
                  text: '${p.name} — ${Fmt.money(variant?.effectivePrice)} on QwikMart\nhttps://qwikmart.app/product/${p.slug}',
                )),
              ),
              IconButton(
                icon: Icon(fav ? Icons.favorite_rounded : Icons.favorite_border_rounded,
                    color: fav ? AppColors.danger : null),
                onPressed: () => toggleFavorite(context, ref, p),
              ),
            ],
          ),
          body: ListView(padding: const EdgeInsets.only(bottom: 24), children: [
            _gallery(p, variant),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                if (p.brand != null)
                  InkWell(
                    onTap: () => context.push('/search?q=${Uri.encodeComponent(p.brand!.name)}'),
                    child: Text('${p.brand!.name} ›',
                        style: const TextStyle(color: AppColors.primary, fontWeight: FontWeight.w700, fontSize: 13)),
                  ),
                const SizedBox(height: 4),
                Text(p.name, style: context.text.titleLarge?.copyWith(fontWeight: FontWeight.w800, height: 1.25)),
                const SizedBox(height: 8),
                Wrap(spacing: 10, runSpacing: 6, crossAxisAlignment: WrapCrossAlignment.center, children: [
                  if (p.ratingCount > 0)
                    Row(mainAxisSize: MainAxisSize.min, children: [
                      Pill(label: '${p.ratingAvg.toStringAsFixed(1)} ★', color: AppColors.primary),
                      const SizedBox(width: 6),
                      Text(context.tr('n_ratings', {'n': p.ratingCount}),
                          style: TextStyle(color: context.mutedText, fontSize: 12)),
                    ]),
                  if (isQuick && p.deliveryMinutes > 0)
                    Pill(label: context.tr('delivery_in_mins', {'n': p.deliveryMinutes}), color: AppColors.info, icon: Icons.bolt_rounded),
                  if (p.isVeg != null)
                    Pill(
                      label: context.tr(p.isVeg! ? 'veg' : 'non_veg'),
                      color: p.isVeg! ? AppColors.primary : AppColors.danger,
                      icon: Icons.circle,
                    ),
                ]),
                const SizedBox(height: 14),
                if (variant != null) ...[
                  PriceRow(price: variant.effectivePrice, mrp: variant.price, fontSize: 22, showOff: true),
                  Text(context.tr('inclusive_taxes'), style: TextStyle(color: context.mutedText, fontSize: 11.5)),
                ],
                if (p.variants.length > 1) ...[
                  const SizedBox(height: 16),
                  Text(context.tr('select_unit'), style: const TextStyle(fontWeight: FontWeight.w800)),
                  const SizedBox(height: 10),
                  SizedBox(
                    height: 80,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      itemCount: p.variants.length,
                      separatorBuilder: (_, _) => const SizedBox(width: 10),
                      itemBuilder: (_, i) {
                        final v = p.variants[i];
                        final sel = v.id == variant?.id;
                        return InkWell(
                          borderRadius: BorderRadius.circular(12),
                          onTap: () => setState(() => _variantId = v.id),
                          child: Container(
                            width: 108,
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                            decoration: BoxDecoration(
                              color: sel ? AppColors.primary50.withValues(alpha: context.isDark ? 0.15 : 1) : context.cardColor,
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(color: sel ? AppColors.primary : context.borderColor, width: sel ? 1.6 : 1),
                            ),
                            child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.center, children: [
                              Text(v.name, style: const TextStyle(fontWeight: FontWeight.w800)),
                              const SizedBox(height: 2),
                              Text(Fmt.money(v.effectivePrice), style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600)),
                              if (v.discountPercent > 0)
                                Text('${v.discountPercent}% OFF',
                                    style: const TextStyle(fontSize: 10.5, color: AppColors.primary, fontWeight: FontWeight.w800)),
                            ]),
                          ),
                        );
                      },
                    ),
                  ),
                ],
                const SizedBox(height: 16),
                Row(children: [
                  _feature(Icons.assignment_return_outlined,
                      p.returnAllowed ? context.tr('n_days_return', {'n': p.returnDays}) : context.tr('no_return')),
                  const SizedBox(width: 8),
                  _feature(Icons.payments_outlined, context.tr(p.codAllowed ? 'cod_available' : 'prepaid_only')),
                  const SizedBox(width: 8),
                  _feature(Icons.verified_outlined, context.tr('genuine_product')),
                ]),
              ]),
            ),
            const _Divider(),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(context.tr('product_details'), style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
                const SizedBox(height: 8),
                if (p.shortDescription.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Text(p.shortDescription, style: const TextStyle(fontWeight: FontWeight.w600)),
                  ),
                if (p.description.isNotEmpty) HtmlText(p.description),
                if (p.storeName.isNotEmpty)
                  Text('${context.tr('sold_by')}: ${p.storeName}', style: TextStyle(color: context.mutedText, fontSize: 12.5)),
              ]),
            ),
            const _Divider(),
            RatingsSection(product: p),
            if (p.alsoBuy.isNotEmpty) ...[
              const _Divider(),
              SectionHeader(title: context.tr('frequently_bought_together'), padding: const EdgeInsets.fromLTRB(16, 0, 16, 10)),
              SizedBox(
                height: 296,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  itemCount: p.alsoBuy.length,
                  separatorBuilder: (_, _) => const SizedBox(width: 10),
                  itemBuilder: (_, i) => ProductCard(product: p.alsoBuy[i], width: 150),
                ),
              ),
            ],
            if (p.similar.isNotEmpty) ...[
              const _Divider(),
              SectionHeader(title: context.tr('similar_products'), padding: const EdgeInsets.fromLTRB(16, 0, 16, 10)),
              SizedBox(
                height: 296,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  itemCount: p.similar.length,
                  separatorBuilder: (_, _) => const SizedBox(width: 10),
                  itemBuilder: (_, i) => ProductCard(product: p.similar[i], width: 150),
                ),
              ),
            ],
          ]),
          bottomNavigationBar: variant == null ? null : _BottomBar(product: p, variant: variant),
        );
      },
    );
  }

  Widget _gallery(Product p, Variant? v) {
    final images = v != null && v.image.isNotEmpty ? [v.image, ...p.gallery] : p.gallery;
    return Column(children: [
      SizedBox(
        height: 300,
        child: Stack(children: [
          PageView.builder(
            itemCount: images.length,
            onPageChanged: (i) => setState(() => _image = i),
            itemBuilder: (_, i) => Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: AppImage(url: images[i], name: p.name, radius: BorderRadius.circular(16), fit: BoxFit.contain, emojiScale: 0.45),
            ),
          ),
          if ((v?.discountPercent ?? 0) > 0)
            PositionedDirectional(
              start: 26,
              top: 10,
              child: Pill(label: '${v!.discountPercent}% OFF', color: AppColors.primary, fontSize: 12),
            ),
        ]),
      ),
      if (images.length > 1)
        Padding(
          padding: const EdgeInsets.only(top: 8),
          child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            for (var i = 0; i < images.length; i++)
              Container(
                margin: const EdgeInsets.symmetric(horizontal: 2),
                width: i == _image ? 16 : 6,
                height: 6,
                decoration: BoxDecoration(
                  color: i == _image ? AppColors.primary : context.borderColor,
                  borderRadius: BorderRadius.circular(6),
                ),
              ),
          ]),
        ),
    ]);
  }

  Widget _feature(IconData icon, String label) => Expanded(
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 6),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: context.borderColor),
          ),
          child: Column(children: [
            Icon(icon, color: AppColors.primary, size: 22),
            const SizedBox(height: 4),
            Text(label, textAlign: TextAlign.center, style: const TextStyle(fontSize: 10.5, fontWeight: FontWeight.w600)),
          ]),
        ),
      );
}

class _Divider extends StatelessWidget {
  const _Divider();
  @override
  Widget build(BuildContext context) =>
      Container(height: 8, margin: const EdgeInsets.symmetric(vertical: 16), color: context.isDark ? Colors.black26 : const Color(0xFFF5F7FA));
}

class _BottomBar extends ConsumerWidget {
  final Product product;
  final Variant variant;
  const _BottomBar({required this.product, required this.variant});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final qty = ref.watch(cartProvider).value?.qtyForVariant(variant.id) ?? 0;
    return Container(
      decoration: BoxDecoration(
        color: context.cardColor,
        border: Border(top: BorderSide(color: context.borderColor)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
          child: Row(children: [
            Expanded(
              child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(variant.name, style: TextStyle(color: context.mutedText, fontSize: 12)),
                PriceRow(price: variant.effectivePrice, mrp: variant.price, fontSize: 17),
              ]),
            ),
            if (qty > 0) ...[
              AddToCartButton(product: product, variant: variant, width: 92, height: 46),
              const SizedBox(width: 10),
              SizedBox(
                height: 46,
                child: ElevatedButton(
                  onPressed: () => context.push('/cart'),
                  style: ElevatedButton.styleFrom(minimumSize: const Size(100, 46)),
                  child: Text(context.tr('go_to_cart')),
                ),
              ),
            ] else
              SizedBox(
                width: 170,
                height: 48,
                child: ElevatedButton.icon(
                  onPressed: !variant.inStock
                      ? null
                      : () async {
                          try {
                            await ref.read(cartProvider.notifier).add(product.id, variant.id);
                          } catch (e) {
                            if (context.mounted) showSnack(context, '$e', error: true);
                          }
                        },
                  icon: const Icon(Icons.shopping_bag_outlined, size: 20),
                  label: Text(context.tr(variant.inStock ? 'add_to_cart' : 'out_of_stock')),
                ),
              ),
          ]),
        ),
      ),
    );
  }
}
