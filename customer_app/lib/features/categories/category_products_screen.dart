import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/l10n/app_localizations.dart';
import '../../models/models.dart';
import '../../providers/providers.dart';
import '../../repositories/repositories.dart';
import '../../widgets/cart_bar.dart';
import '../../widgets/common.dart';
import '../../widgets/product_card.dart';
import '../search/filter_sheet.dart';
import 'categories_screen.dart';

/// Left rail of subcategories + right product grid (screenshot 25).
class CategoryProductsScreen extends ConsumerStatefulWidget {
  final String categoryId;
  final String title;
  final String? selectedSubId;
  const CategoryProductsScreen({super.key, required this.categoryId, this.title = '', this.selectedSubId});
  @override
  ConsumerState<CategoryProductsScreen> createState() => _CategoryProductsScreenState();
}

class _CategoryProductsScreenState extends ConsumerState<CategoryProductsScreen> {
  late String _selected = widget.selectedSubId ?? widget.categoryId;
  late ProductQuery _query = ProductQuery(categoryId: _selected, perPage: 40);

  @override
  Widget build(BuildContext context) {
    final subs = ref.watch(subcategoriesProvider(widget.categoryId));
    final tree = ref.watch(categoryTreeProvider).value ?? const <Category>[];
    final parent = tree.where((c) => c.id == widget.categoryId).firstOrNull;
    final subList = subs.value ?? const <Category>[];
    final isSubcategory = parent == null && subList.isEmpty && subs.hasValue;
    final title = parent?.name ?? (widget.title.isNotEmpty ? widget.title : context.tr('products'));

    final rail = <Category>[
      if (!isSubcategory) Category(id: widget.categoryId, name: context.tr('all'), headerColor: parent?.headerColor ?? ''),
      ...subList,
    ];
    final products = ref.watch(productsProvider(_query));

    return Scaffold(
      appBar: AppBar(
        title: Text(title),
        actions: [IconButton(icon: const Icon(Icons.search_rounded), onPressed: () => context.push('/search'))],
      ),
      body: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        if (rail.length > 1)
          CategoryRail(
            items: rail,
            selectedId: _selected,
            onSelect: (c) => setState(() {
              _selected = c.id;
              _query = _query.copyWith(categoryId: c.id, page: 1);
            }),
          ),
        Expanded(
          child: Column(children: [
            SortFilterBar(
              query: _query,
              showCategories: false,
              leading: products.value == null ? null : context.tr('n_products', {'n': products.value!.total}),
              onChanged: (q) => setState(() => _query = q.copyWith(categoryId: _selected)),
            ),
            Expanded(
              child: products.when(
                loading: () => const ProductGridShimmer(),
                error: (e, _) => ErrorView(error: e, onRetry: () => ref.invalidate(productsProvider(_query))),
                data: (page) => page.items.isEmpty
                    ? EmptyView(emoji: '🔍', title: context.tr('no_products'), message: context.tr('no_products_body'))
                    : ProductGrid(
                        products: page.items,
                        padding: const EdgeInsets.fromLTRB(10, 6, 10, 24),
                      ),
              ),
            ),
          ]),
        ),
      ]),
      bottomNavigationBar: const SafeArea(top: false, child: FloatingCartBar()),
    );
  }
}
