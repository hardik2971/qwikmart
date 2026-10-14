import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/l10n/app_localizations.dart';
import '../../core/theme.dart';
import '../../core/utils.dart';
import '../../providers/providers.dart';
import '../../repositories/repositories.dart';
import '../../widgets/cart_bar.dart';
import '../../widgets/common.dart';
import '../../widgets/product_card.dart';
import 'filter_sheet.dart';

const _recentKey = 'recent_searches';

class SearchScreen extends ConsumerStatefulWidget {
  final String initialQuery;
  final String initialSort;
  const SearchScreen({super.key, this.initialQuery = '', this.initialSort = ''});
  @override
  ConsumerState<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends ConsumerState<SearchScreen> {
  late final _ctrl = TextEditingController(text: widget.initialQuery);
  final _focus = FocusNode();
  Timer? _debounce;
  Timer? _hintTimer;
  int _hint = 0;
  ProductQuery? _query;
  SearchSuggestions? _suggestions;
  List<String> _recent = [];

  static const _hints = ['milk', 'atta', 'chips', 'paneer', 'shampoo', 'earbuds', 'mango', 'detergent'];

  @override
  void initState() {
    super.initState();
    _recent = ref.read(prefsProvider).getStringList(_recentKey) ?? [];
    if (widget.initialQuery.isNotEmpty || widget.initialSort.isNotEmpty) {
      _query = ProductQuery(q: widget.initialQuery, sort: widget.initialSort, perPage: 40);
    } else {
      WidgetsBinding.instance.addPostFrameCallback((_) => _focus.requestFocus());
    }
    _hintTimer = Timer.periodic(const Duration(milliseconds: 2200), (_) {
      if (mounted && _ctrl.text.isEmpty) setState(() => _hint = (_hint + 1) % _hints.length);
    });
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _hintTimer?.cancel();
    _ctrl.dispose();
    _focus.dispose();
    super.dispose();
  }

  void _onChanged(String v) {
    setState(() => _query = null);
    _debounce?.cancel();
    if (v.trim().isEmpty) {
      setState(() => _suggestions = null);
      return;
    }
    _debounce = Timer(const Duration(milliseconds: 300), () async {
      try {
        final s = await ref.read(catalogRepoProvider).suggestions(v.trim());
        if (mounted && _ctrl.text.trim() == v.trim()) setState(() => _suggestions = s);
      } catch (_) {}
    });
  }

  void _submit(String q) {
    final term = q.trim();
    if (term.isEmpty) return;
    _ctrl.text = term;
    _focus.unfocus();
    _recent = [term, ..._recent.where((r) => r.toLowerCase() != term.toLowerCase())].take(8).toList();
    ref.read(prefsProvider).setStringList(_recentKey, _recent);
    setState(() {
      _suggestions = null;
      _query = ProductQuery(q: term, sort: _query?.sort ?? '', perPage: 40);
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        title: Padding(
          padding: const EdgeInsetsDirectional.only(end: 12),
          child: TextField(
            controller: _ctrl,
            focusNode: _focus,
            textInputAction: TextInputAction.search,
            onChanged: _onChanged,
            onSubmitted: _submit,
            decoration: InputDecoration(
              isDense: true,
              hintText: context.tr('search_hint', {'q': _hints[_hint]}),
              prefixIcon: const Icon(Icons.search_rounded),
              suffixIcon: _ctrl.text.isEmpty
                  ? IconButton(
                      icon: const Icon(Icons.mic_none_rounded),
                      onPressed: () => showSnack(context, context.tr('voice_search_soon')),
                    )
                  : IconButton(
                      icon: const Icon(Icons.close_rounded),
                      onPressed: () {
                        _ctrl.clear();
                        _onChanged('');
                        _focus.requestFocus();
                      },
                    ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: const BorderSide(color: AppColors.primary, width: 1.5),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: context.borderColor),
              ),
            ),
          ),
        ),
      ),
      body: _query != null
          ? _Results(query: _query!, onQuery: (q) => setState(() => _query = q))
          : _suggestions != null
              ? _suggestionList()
              : _idle(),
      bottomNavigationBar: const SafeArea(top: false, child: FloatingCartBar()),
    );
  }

  Widget _suggestionList() {
    final s = _suggestions!;
    return ListView(children: [
      for (final c in s.categories)
        ListTile(
          leading: Text(emojiFor(c.name), style: const TextStyle(fontSize: 22)),
          title: Text(c.name, style: const TextStyle(fontWeight: FontWeight.w600)),
          subtitle: Text(context.tr('in_categories')),
          onTap: () => context.push('/category/${c.id}?name=${Uri.encodeComponent(c.name)}'),
        ),
      for (final p in s.products)
        ListTile(
          leading: const Icon(Icons.search_rounded),
          title: Text(p.name),
          trailing: const Icon(Icons.north_west_rounded, size: 18),
          onTap: () => context.push('/product/${p.slug}'),
        ),
      if (s.products.isEmpty && s.categories.isEmpty)
        ListTile(
          leading: const Icon(Icons.search_rounded),
          title: Text(context.tr('search_for', {'q': _ctrl.text})),
          onTap: () => _submit(_ctrl.text),
        ),
    ]);
  }

  Widget _idle() {
    final trending = ref.watch(trendingProvider).value ?? const <String>[];
    final cats = ref.watch(categoryTreeProvider).value ?? const [];
    return ListView(padding: const EdgeInsets.all(16), children: [
      if (_recent.isNotEmpty) ...[
        Row(children: [
          Text(context.tr('recent_searches'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
          const Spacer(),
          TextButton(
            onPressed: () {
              ref.read(prefsProvider).remove(_recentKey);
              setState(() => _recent = []);
            },
            child: Text(context.tr('clear')),
          ),
        ]),
        Wrap(spacing: 8, runSpacing: 8, children: [
          for (final r in _recent)
            ActionChip(avatar: const Icon(Icons.history_rounded, size: 16), label: Text(r), onPressed: () => _submit(r)),
        ]),
        const SizedBox(height: 20),
      ],
      if (trending.isNotEmpty) ...[
        Text(context.tr('trending_searches'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
        const SizedBox(height: 10),
        Wrap(spacing: 8, runSpacing: 8, children: [
          for (final t in trending)
            ActionChip(
              avatar: const Icon(Icons.trending_up_rounded, size: 16, color: AppColors.primary),
              label: Text(t),
              onPressed: () => _submit(t),
            ),
        ]),
        const SizedBox(height: 20),
      ],
      if (cats.isNotEmpty) ...[
        Text(context.tr('popular_categories'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
        const SizedBox(height: 10),
        GridView.count(
          crossAxisCount: 4,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          childAspectRatio: 0.8,
          children: [
            for (final c in cats.take(8))
              InkWell(
                onTap: () => context.push('/category/${c.id}?name=${Uri.encodeComponent(c.name)}'),
                child: Column(children: [
                  Container(
                    width: 56,
                    height: 56,
                    decoration: BoxDecoration(color: tintFor(c.name), borderRadius: BorderRadius.circular(14)),
                    alignment: Alignment.center,
                    child: Text(emojiFor(c.name), style: const TextStyle(fontSize: 26)),
                  ),
                  const SizedBox(height: 6),
                  Text(c.name, maxLines: 2, textAlign: TextAlign.center, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600)),
                ]),
              ),
          ],
        ),
      ],
    ]);
  }
}

class _Results extends ConsumerWidget {
  final ProductQuery query;
  final ValueChanged<ProductQuery> onQuery;
  const _Results({required this.query, required this.onQuery});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final res = ref.watch(productsProvider(query));
    return Column(children: [
      SortFilterBar(
        query: query,
        onChanged: onQuery,
        leading: res.value == null ? null : context.tr(res.value!.total == 1 ? 'n_product_found' : 'n_products_found', {'n': res.value!.total}),
      ),
      Expanded(
        child: res.when(
          loading: () => const ProductGridShimmer(),
          error: (e, _) => ErrorView(error: e, onRetry: () => ref.invalidate(productsProvider(query))),
          data: (page) => page.items.isEmpty
              ? EmptyView(
                  emoji: '🔍',
                  image: 'assets/images/empty/empty-search.webp',
                  title: context.tr('no_results', {'q': query.q}),
                  message: context.tr('no_results_body'),
                )
              : ProductGrid(products: page.items, padding: const EdgeInsets.fromLTRB(12, 6, 12, 24)),
        ),
      ),
    ]);
  }
}
