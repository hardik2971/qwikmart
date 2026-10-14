import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/l10n/app_localizations.dart';
import '../../providers/providers.dart';
import '../../widgets/common.dart';
import '../../widgets/product_card.dart';

class FavouritesScreen extends ConsumerWidget {
  const FavouritesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final favs = ref.watch(favoritesProvider);
    return Scaffold(
      appBar: AppBar(title: Text(context.tr('favourites')), centerTitle: false),
      body: favs.when(
        loading: () => const ProductGridShimmer(),
        error: (e, _) => ErrorView(error: e, onRetry: () => ref.invalidate(favoritesProvider)),
        data: (list) => list.isEmpty
            ? EmptyView(
                emoji: '💚',
                title: context.tr('no_favourites'),
                message: context.tr('no_favourites_body'),
                actionLabel: context.tr('start_shopping'),
                onAction: () => context.go('/home'),
              )
            : RefreshIndicator(
                onRefresh: () => ref.refresh(favoritesProvider.future),
                child: ProductGrid(products: list, padding: const EdgeInsets.fromLTRB(12, 12, 12, 24)),
              ),
      ),
    );
  }
}
