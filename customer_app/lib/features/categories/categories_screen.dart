import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/l10n/app_localizations.dart';
import '../../core/theme.dart';
import '../../core/utils.dart';
import '../../models/models.dart';
import '../../providers/providers.dart';
import '../../widgets/common.dart';
import '../home/section_renderer.dart';

/// Categories tab: left rail of top categories, right grid of subcategories.
class CategoriesScreen extends ConsumerStatefulWidget {
  const CategoriesScreen({super.key});
  @override
  ConsumerState<CategoriesScreen> createState() => _CategoriesScreenState();
}

class _CategoriesScreenState extends ConsumerState<CategoriesScreen> {
  String? _selected;

  @override
  Widget build(BuildContext context) {
    final tree = ref.watch(categoryTreeProvider);
    return Scaffold(
      appBar: AppBar(
        title: Text(context.tr('categories')),
        centerTitle: false,
        actions: [IconButton(icon: const Icon(Icons.search_rounded), onPressed: () => context.push('/search'))],
      ),
      body: tree.when(
        loading: () => const LoadingView(),
        error: (e, _) => ErrorView(error: e, onRetry: () => ref.invalidate(categoryTreeProvider)),
        data: (cats) {
          if (cats.isEmpty) return EmptyView(title: context.tr('no_categories'));
          final current = cats.firstWhere((c) => c.id == _selected, orElse: () => cats.first);
          return Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            CategoryRail(
              items: cats,
              selectedId: current.id,
              onSelect: (c) => setState(() => _selected = c.id),
            ),
            Expanded(
              child: ListView(padding: const EdgeInsets.fromLTRB(12, 12, 12, 24), children: [
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    gradient: LinearGradient(colors: AppColors.headerGradient(AppColors.fromHex(current.headerColor, AppColors.primary50), dark: context.isDark)),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Row(children: [
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(current.name, style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
                        const SizedBox(height: 4),
                        InkWell(
                          onTap: () => openCategory(context, current),
                          child: Text('${context.tr('view_all_products')} ›',
                              style: const TextStyle(color: AppColors.primary, fontWeight: FontWeight.w700, fontSize: 12.5)),
                        ),
                      ]),
                    ),
                    Text(emojiFor(current.name), style: const TextStyle(fontSize: 40)),
                  ]),
                ),
                const SizedBox(height: 14),
                GridView.builder(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 3,
                    mainAxisExtent: 118,
                    crossAxisSpacing: 8,
                    mainAxisSpacing: 4,
                  ),
                  itemCount: current.children.length,
                  itemBuilder: (_, i) => CategoryTile(category: current.children[i], size: 74),
                ),
              ]),
            ),
          ]);
        },
      ),
    );
  }
}

/// Vertical rail used by Categories and Category products (screenshot 25).
class CategoryRail extends StatelessWidget {
  final List<Category> items;
  final String? selectedId;
  final ValueChanged<Category> onSelect;
  const CategoryRail({super.key, required this.items, required this.selectedId, required this.onSelect});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 86,
      decoration: BoxDecoration(
        color: context.cardColor,
        border: BorderDirectional(end: BorderSide(color: context.borderColor)),
      ),
      child: ListView.builder(
        padding: const EdgeInsets.only(bottom: 90),
        itemCount: items.length,
        itemBuilder: (_, i) {
          final c = items[i];
          final active = c.id == selectedId;
          return InkWell(
            onTap: () => onSelect(c),
            child: Container(
              padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 6),
              decoration: BoxDecoration(
                color: active ? AppColors.primary50.withValues(alpha: context.isDark ? 0.12 : 1) : null,
                border: BorderDirectional(end: BorderSide(color: active ? AppColors.primary : Colors.transparent, width: 3)),
              ),
              child: Column(children: [
                Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    color: active ? context.cardColor : (context.isDark ? AppColors.darkBg : const Color(0xFFF2F4F7)),
                    shape: BoxShape.circle,
                  ),
                  alignment: Alignment.center,
                  child: c.image.isNotEmpty
                      ? ClipOval(child: AppImage(url: c.image, name: c.name, width: 48, height: 48))
                      : Text(emojiFor(c.name), style: const TextStyle(fontSize: 24)),
                ),
                const SizedBox(height: 5),
                Text(
                  c.name,
                  maxLines: 2,
                  textAlign: TextAlign.center,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 10.5,
                    height: 1.2,
                    fontWeight: active ? FontWeight.w800 : FontWeight.w500,
                    color: active ? AppColors.primary : null,
                  ),
                ),
              ]),
            ),
          );
        },
      ),
    );
  }
}
