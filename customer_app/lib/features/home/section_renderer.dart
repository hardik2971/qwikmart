import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/l10n/app_localizations.dart';
import '../../core/theme.dart';
import '../../models/models.dart';
import '../../widgets/banner_card.dart';
import '../../widgets/common.dart';
import '../../widgets/product_card.dart';

void openCategory(BuildContext context, Category c) {
  final name = Uri.encodeComponent(c.name);
  if (c.parentId != null && c.parentId!.isNotEmpty) {
    context.push('/category/${c.parentId}?sub=${c.id}&name=$name');
  } else {
    context.push('/category/${c.id}?name=$name');
  }
}

/// Renders one `/home` section by type
/// (banner_slider, category_section, product_slider, top_brands, grid_banner, title_image, heading_text).
class HomeSectionView extends StatelessWidget {
  final HomeSection section;
  final bool isFirst;
  const HomeSectionView({super.key, required this.section, this.isFirst = false});

  @override
  Widget build(BuildContext context) {
    final s = section;
    switch (s.type) {
      case 'banner_slider':
        if (s.rawItems.isEmpty) return const SizedBox.shrink();
        return Padding(
          padding: EdgeInsets.only(top: isFirst ? 4 : 12),
          child: BannerSlider(banners: s.banners, height: asDouble(s.settings['height'], 168)),
        );
      case 'category_section':
        return _CategorySection(section: s);
      case 'product_slider':
        return _ProductSlider(section: s);
      case 'top_brands':
        return _TopBrands(section: s);
      case 'grid_banner':
        return _GridBanner(section: s);
      case 'title_image':
        if (s.rawItems.isEmpty) return const SizedBox.shrink();
        return Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
          child: BannerCard(banner: s.banners.first, height: 150),
        );
      case 'heading_text':
        return Padding(
          padding: const EdgeInsets.fromLTRB(20, 28, 20, 12),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(s.title,
                style: TextStyle(
                  fontSize: 34,
                  height: 1.1,
                  fontWeight: FontWeight.w800,
                  color: context.isDark ? Colors.white24 : const Color(0xFFCBD2DC),
                )),
            if (s.subtitle.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(s.subtitle, style: TextStyle(color: context.mutedText, fontWeight: FontWeight.w600)),
            ],
          ]),
        );
    }
    return const SizedBox.shrink();
  }
}

class BannerSlider extends StatefulWidget {
  final List<BannerItem> banners;
  final double height;
  const BannerSlider({super.key, required this.banners, this.height = 168});
  @override
  State<BannerSlider> createState() => _BannerSliderState();
}

class _BannerSliderState extends State<BannerSlider> {
  final _page = PageController();
  int _index = 0;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    if (widget.banners.length > 1) {
      _timer = Timer.periodic(const Duration(seconds: 4), (_) {
        if (!mounted || !_page.hasClients) return;
        final next = (_index + 1) % widget.banners.length;
        _page.animateToPage(next, duration: const Duration(milliseconds: 450), curve: Curves.easeOutCubic);
      });
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    _page.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Column(children: [
      SizedBox(
        height: widget.height,
        child: PageView.builder(
          controller: _page,
          itemCount: widget.banners.length,
          onPageChanged: (i) => setState(() => _index = i),
          itemBuilder: (_, i) => BannerCard(
            banner: widget.banners[i],
            height: widget.height,
            margin: const EdgeInsets.symmetric(horizontal: 16),
          ),
        ),
      ),
      if (widget.banners.length > 1)
        Padding(
          padding: const EdgeInsets.only(top: 10),
          child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            for (var i = 0; i < widget.banners.length; i++)
              AnimatedContainer(
                duration: const Duration(milliseconds: 250),
                margin: const EdgeInsets.symmetric(horizontal: 2.5),
                width: i == _index ? 18 : 6,
                height: 6,
                decoration: BoxDecoration(
                  color: i == _index ? (context.isDark ? Colors.white : AppColors.ink) : context.borderColor,
                  borderRadius: BorderRadius.circular(6),
                ),
              ),
          ]),
        ),
    ]);
  }
}

class CategoryTile extends StatelessWidget {
  final Category category;
  final double size;
  const CategoryTile({super.key, required this.category, this.size = 70});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: () => openCategory(context, category),
      child: Column(children: [
        Container(
          width: size,
          height: size,
          decoration: BoxDecoration(
            color: context.isDark ? AppColors.darkSurface : const Color(0xFFEFF6F8),
            borderRadius: BorderRadius.circular(14),
          ),
          child: AppImage(
            url: category.image,
            name: category.name,
            radius: BorderRadius.circular(14),
            background: Colors.transparent,
            emojiScale: 0.52,
            fit: BoxFit.contain,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          category.name,
          maxLines: 2,
          textAlign: TextAlign.center,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600, height: 1.2),
        ),
      ]),
    );
  }
}

class _CategorySection extends StatelessWidget {
  final HomeSection section;
  const _CategorySection({required this.section});

  @override
  Widget build(BuildContext context) {
    final cats = section.categories;
    if (cats.isEmpty) return const SizedBox.shrink();
    final grid = asString(section.settings['style']) == 'grid';
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      SectionHeader(title: section.title, subtitle: section.subtitle),
      if (grid)
        GridView.builder(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 4,
            mainAxisExtent: 112,
            crossAxisSpacing: 6,
          ),
          itemCount: cats.length,
          itemBuilder: (_, i) => CategoryTile(category: cats[i]),
        )
      else
        SizedBox(
          height: 112,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 12),
            itemCount: cats.length,
            separatorBuilder: (_, _) => const SizedBox(width: 6),
            itemBuilder: (_, i) => SizedBox(width: 80, child: CategoryTile(category: cats[i])),
          ),
        ),
    ]);
  }
}

class _ProductSlider extends StatelessWidget {
  final HomeSection section;
  const _ProductSlider({required this.section});

  @override
  Widget build(BuildContext context) {
    final products = section.products;
    if (products.isEmpty) return const SizedBox.shrink();
    final catId = asIdOrNull(section.settings['category_id']);
    final sort = asString(section.settings['sort']);
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      SectionHeader(
        title: section.title,
        subtitle: section.subtitle,
        onSeeAll: () {
          if (catId != null) {
            context.push('/category/$catId?name=${Uri.encodeComponent(section.title)}');
          } else {
            context.push('/search?sort=$sort&q=');
          }
        },
      ),
      SizedBox(
        height: 296,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 16),
          itemCount: products.length,
          separatorBuilder: (_, _) => const SizedBox(width: 10),
          itemBuilder: (_, i) => ProductCard(product: products[i], width: 150),
        ),
      ),
    ]);
  }
}

class _TopBrands extends StatelessWidget {
  final HomeSection section;
  const _TopBrands({required this.section});

  static const _palette = [
    Color(0xFF0E9623), Color(0xFFD9480F), Color(0xFF1D4ED8), Color(0xFF7C3AED),
    Color(0xFFBE185D), Color(0xFF0F766E), Color(0xFFB45309), Color(0xFF111827),
  ];

  @override
  Widget build(BuildContext context) {
    final brands = section.brands;
    if (brands.isEmpty) return const SizedBox.shrink();
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      SectionHeader(title: section.title.isEmpty ? context.tr('top_brands') : section.title),
      SizedBox(
        height: 64,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 16),
          itemCount: brands.length,
          separatorBuilder: (_, _) => const SizedBox(width: 10),
          itemBuilder: (_, i) {
            final b = brands[i];
            final color = _palette[b.name.hashCode.abs() % _palette.length];
            return InkWell(
              borderRadius: BorderRadius.circular(12),
              onTap: () => context.push('/search?q=${Uri.encodeComponent(b.name)}'),
              child: Container(
                width: 104,
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: context.cardColor,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: context.borderColor),
                ),
                alignment: Alignment.center,
                child: b.logo.isNotEmpty
                    ? AppImage(url: b.logo, name: b.name, fit: BoxFit.contain, background: Colors.transparent)
                    : Text(
                        b.name,
                        maxLines: 2,
                        textAlign: TextAlign.center,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(color: color, fontWeight: FontWeight.w800, fontSize: 13, letterSpacing: -0.2),
                      ),
              ),
            );
          },
        ),
      ),
    ]);
  }
}

class _GridBanner extends StatelessWidget {
  final HomeSection section;
  const _GridBanner({required this.section});

  @override
  Widget build(BuildContext context) {
    final items = section.banners;
    if (items.isEmpty) return const SizedBox.shrink();
    final cols = asInt(section.settings['columns'], 2).clamp(2, 4);
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      if (section.title.isNotEmpty) SectionHeader(title: section.title, subtitle: section.subtitle),
      GridView.builder(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: cols,
          crossAxisSpacing: 10,
          mainAxisSpacing: 10,
          childAspectRatio: cols == 2 ? 1.55 : 0.78,
        ),
        itemCount: items.length,
        itemBuilder: (_, i) {
          final b = items[i];
          final bg = AppColors.fromHex(b.bgColor, AppColors.primary50);
          return InkWell(
            borderRadius: BorderRadius.circular(14),
            onTap: () => openBannerLink(context, b),
            child: Container(
              decoration: BoxDecoration(
                color: context.isDark ? Color.lerp(bg, AppColors.darkSurface, 0.75) : bg,
                borderRadius: BorderRadius.circular(14),
              ),
              padding: const EdgeInsets.all(10),
              child: b.image.isNotEmpty
                  ? AppImage(url: b.image, name: b.title, radius: BorderRadius.circular(10))
                  : cols == 2
                      ? Row(children: [
                          Expanded(
                            child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.center, children: [
                              Text(b.title, maxLines: 2, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
                              const SizedBox(height: 4),
                              Text(b.subtitle,
                                  style: const TextStyle(fontSize: 11, color: AppColors.primaryDark, fontWeight: FontWeight.w700)),
                            ]),
                          ),
                          Text(b.emoji.isEmpty ? '🛍️' : b.emoji, style: const TextStyle(fontSize: 40)),
                        ])
                      : Column(children: [
                          Expanded(
                            child: Container(
                              width: double.infinity,
                              decoration: BoxDecoration(
                                color: context.cardColor.withValues(alpha: 0.7),
                                borderRadius: BorderRadius.circular(10),
                              ),
                              alignment: Alignment.center,
                              child: Text(b.emoji.isEmpty ? '🛍️' : b.emoji, style: const TextStyle(fontSize: 44)),
                            ),
                          ),
                          const SizedBox(height: 6),
                          Text(b.title,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12)),
                          Text(b.subtitle,
                              maxLines: 1,
                              style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 11, color: AppColors.ink)),
                          if (b.cta.isNotEmpty)
                            Text(b.cta, style: const TextStyle(fontSize: 10, color: AppColors.primaryDark, fontWeight: FontWeight.w700)),
                        ]),
            ),
          );
        },
      ),
    ]);
  }
}
