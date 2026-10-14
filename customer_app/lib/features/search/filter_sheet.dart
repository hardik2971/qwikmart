import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/l10n/app_localizations.dart';
import '../../core/theme.dart';
import '../../core/utils.dart';
import '../../models/models.dart';
import '../../providers/providers.dart';
import '../../repositories/repositories.dart';
import '../../widgets/common.dart';

const sortOptions = <String, String>{
  '': 'sort_relevance',
  'popular': 'sort_popular',
  'price_asc': 'sort_price_asc',
  'price_desc': 'sort_price_desc',
  'discount': 'sort_discount',
  'rating': 'sort_rating',
  'newest': 'sort_newest',
};

Future<String?> showSortSheet(BuildContext context, String current) {
  return showModalBottomSheet<String>(
    context: context,
    builder: (ctx) => SafeArea(
      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
          child: Text(ctx.tr('sort_by'), style: ctx.text.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
        ),
        for (final e in sortOptions.entries)
          ListTile(
            title: Text(ctx.tr(e.value)),
            trailing: e.key == current
                ? const Icon(Icons.check_circle_rounded, color: AppColors.primary)
                : Icon(Icons.circle_outlined, color: ctx.borderColor),
            onTap: () => Navigator.pop(ctx, e.key),
          ),
        const SizedBox(height: 8),
      ]),
    ),
  );
}

/// Filter bottom sheet: category, brands, price range. Returns the updated query.
Future<ProductQuery?> showFilterSheet(BuildContext context, ProductQuery query, {bool showCategories = true}) {
  return showModalBottomSheet<ProductQuery>(
    context: context,
    isScrollControlled: true,
    builder: (ctx) => _FilterSheet(query: query, showCategories: showCategories),
  );
}

class _FilterSheet extends ConsumerStatefulWidget {
  final ProductQuery query;
  final bool showCategories;
  const _FilterSheet({required this.query, required this.showCategories});
  @override
  ConsumerState<_FilterSheet> createState() => _FilterSheetState();
}

class _FilterSheetState extends ConsumerState<_FilterSheet> {
  late String? _category = widget.query.categoryId;
  late Set<String> _brands = {...widget.query.brandIds};
  late RangeValues _price = RangeValues(widget.query.minPrice ?? 0, widget.query.maxPrice ?? _maxPrice);
  static const _maxPrice = 5000.0;

  @override
  Widget build(BuildContext context) {
    final cats = ref.watch(categoryTreeProvider).value ?? const <Category>[];
    final brands = ref.watch(brandsProvider).value ?? const <Brand>[];
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.75,
      maxChildSize: 0.95,
      builder: (ctx, scroll) => Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 12, 4),
          child: Row(children: [
            Text(context.tr('filters'), style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
            const Spacer(),
            TextButton(
              onPressed: () => setState(() {
                _category = null;
                _brands = {};
                _price = const RangeValues(0, _maxPrice);
              }),
              child: Text(context.tr('clear_all'), style: const TextStyle(color: AppColors.danger)),
            ),
          ]),
        ),
        Expanded(
          child: ListView(controller: scroll, padding: const EdgeInsets.fromLTRB(20, 0, 20, 20), children: [
            if (widget.showCategories && cats.isNotEmpty) ...[
              _title(context.tr('categories')),
              Wrap(spacing: 8, runSpacing: 8, children: [
                for (final c in cats)
                  ChoiceChip(
                    label: Text(c.name),
                    selected: _category == c.id,
                    onSelected: (v) => setState(() => _category = v ? c.id : null),
                  ),
              ]),
            ],
            _title(context.tr('price')),
            RangeSlider(
              values: _price,
              min: 0,
              max: _maxPrice,
              divisions: 50,
              activeColor: AppColors.primary,
              labels: RangeLabels(Fmt.money(_price.start), Fmt.money(_price.end)),
              onChanged: (v) => setState(() => _price = v),
            ),
            Row(children: [
              Text(Fmt.money(_price.start), style: const TextStyle(fontWeight: FontWeight.w700)),
              const Spacer(),
              Text(_price.end >= _maxPrice ? '${Fmt.money(_maxPrice)}+' : Fmt.money(_price.end),
                  style: const TextStyle(fontWeight: FontWeight.w700)),
            ]),
            if (brands.isNotEmpty) ...[
              _title(context.tr('brands')),
              Wrap(spacing: 8, runSpacing: 8, children: [
                for (final b in brands)
                  FilterChip(
                    label: Text(b.name),
                    selected: _brands.contains(b.id),
                    checkmarkColor: AppColors.primary,
                    onSelected: (v) => setState(() => v ? _brands.add(b.id) : _brands.remove(b.id)),
                  ),
              ]),
            ],
          ]),
        ),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
            child: AppButton(
              label: context.tr('apply_filters'),
              onPressed: () => Navigator.pop(
                context,
                ProductQuery(
                  q: widget.query.q,
                  sort: widget.query.sort,
                  categoryId: _category,
                  brandIds: _brands,
                  minPrice: _price.start > 0 ? _price.start : null,
                  maxPrice: _price.end < _maxPrice ? _price.end : null,
                  perPage: widget.query.perPage,
                ),
              ),
            ),
          ),
        ),
      ]),
    );
  }

  Widget _title(String t) => Padding(
        padding: const EdgeInsets.only(top: 18, bottom: 10),
        child: Text(t, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
      );
}

/// Sort + filter chips row.
class SortFilterBar extends StatelessWidget {
  final ProductQuery query;
  final ValueChanged<ProductQuery> onChanged;
  final bool showCategories;
  final String? leading;
  const SortFilterBar({super.key, required this.query, required this.onChanged, this.showCategories = true, this.leading});

  @override
  Widget build(BuildContext context) {
    Widget chip(IconData icon, String label, VoidCallback onTap, {bool active = false}) => Padding(
          padding: const EdgeInsetsDirectional.only(end: 8),
          child: InkWell(
            borderRadius: BorderRadius.circular(999),
            onTap: onTap,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
              decoration: BoxDecoration(
                color: active ? AppColors.primary50 : context.cardColor,
                borderRadius: BorderRadius.circular(999),
                border: Border.all(color: active ? AppColors.primary : context.borderColor),
              ),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                Icon(icon, size: 16, color: active ? AppColors.primary : null),
                const SizedBox(width: 6),
                Text(label, style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: active ? AppColors.primary : null)),
                const Icon(Icons.keyboard_arrow_down_rounded, size: 16),
              ]),
            ),
          ),
        );
    return SizedBox(
      height: 48,
      child: ListView(scrollDirection: Axis.horizontal, padding: const EdgeInsets.fromLTRB(12, 8, 12, 6), children: [
        if (leading != null)
          Padding(
            padding: const EdgeInsetsDirectional.only(end: 10),
            child: Center(child: Text(leading!, style: TextStyle(color: context.mutedText, fontWeight: FontWeight.w600, fontSize: 12.5))),
          ),
        chip(Icons.swap_vert_rounded, query.sort.isEmpty ? context.tr('sort') : context.tr(sortOptions[query.sort] ?? 'sort'),
            () async {
          final s = await showSortSheet(context, query.sort);
          if (s != null) onChanged(query.copyWith(sort: s, page: 1));
        }, active: query.sort.isNotEmpty),
        chip(
          Icons.tune_rounded,
          query.activeFilters > 0 ? '${context.tr('filter')} (${query.activeFilters})' : context.tr('filter'),
          () async {
            final q = await showFilterSheet(context, query, showCategories: showCategories);
            if (q != null) onChanged(q);
          },
          active: query.activeFilters > 0,
        ),
        chip(Icons.local_offer_outlined, context.tr('sort_discount'), () => onChanged(query.copyWith(sort: 'discount', page: 1)),
            active: query.sort == 'discount'),
      ]),
    );
  }
}
