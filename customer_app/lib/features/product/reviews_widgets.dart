import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/l10n/app_localizations.dart';
import '../../core/theme.dart';
import '../../core/utils.dart';
import '../../models/models.dart';
import '../../providers/providers.dart';
import '../../widgets/common.dart';

final _allReviewsProvider = FutureProvider.autoDispose.family<List<Review>, String>(
  (ref, productId) => ref.watch(catalogRepoProvider).reviews(productId),
);

/// "Ratings & Reviews" block: big average, 5→1 bars, latest reviews (screenshot 23).
class RatingsSection extends StatelessWidget {
  final Product product;
  const RatingsSection({super.key, required this.product});

  @override
  Widget build(BuildContext context) {
    final p = product;
    final breakdown = p.ratingBreakdown;
    final total = math.max(1, breakdown.values.fold<int>(0, (s, v) => s + v));
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(context.tr('ratings_reviews'), style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
        const SizedBox(height: 12),
        Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
          SizedBox(
            width: 100,
            child: Column(children: [
              Text(p.ratingAvg.toStringAsFixed(1), style: const TextStyle(fontSize: 38, fontWeight: FontWeight.w800, height: 1)),
              const SizedBox(height: 6),
              RatingStars(rating: p.ratingAvg, size: 15),
              const SizedBox(height: 4),
              Text(context.tr('n_ratings', {'n': p.ratingCount}), style: TextStyle(fontSize: 11.5, color: context.mutedText)),
            ]),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(children: [
              for (var star = 5; star >= 1; star--)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 2.5),
                  child: Row(children: [
                    SizedBox(width: 22, child: Text('$star★', style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700))),
                    Expanded(
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(6),
                        child: LinearProgressIndicator(
                          value: (breakdown[star] ?? 0) / total,
                          minHeight: 7,
                          backgroundColor: context.borderColor,
                          color: star >= 3 ? AppColors.primary : (star == 2 ? AppColors.warning : AppColors.danger),
                        ),
                      ),
                    ),
                    SizedBox(
                      width: 44,
                      child: Text('${breakdown[star] ?? 0}',
                          textAlign: TextAlign.end, style: TextStyle(fontSize: 11, color: context.mutedText)),
                    ),
                  ]),
                ),
            ]),
          ),
        ]),
        const SizedBox(height: 12),
        for (final r in p.reviews.take(3)) ReviewTile(review: r),
        if (p.reviews.isNotEmpty)
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: TextButton(
              onPressed: () => showModalBottomSheet<void>(
                context: context,
                isScrollControlled: true,
                builder: (_) => _AllReviews(product: p),
              ),
              child: Text('${context.tr('see_all_reviews')} ›'),
            ),
          )
        else
          Text(context.tr('no_reviews_yet'), style: TextStyle(color: context.mutedText)),
      ]),
    );
  }
}

class ReviewTile extends StatelessWidget {
  final Review review;
  const ReviewTile({super.key, required this.review});

  @override
  Widget build(BuildContext context) {
    final r = review;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        CircleAvatar(
          radius: 18,
          backgroundColor: tintFor(r.userName),
          child: Text(r.userName.isEmpty ? '?' : r.userName[0].toUpperCase(),
              style: const TextStyle(fontWeight: FontWeight.w800, color: AppColors.primaryDark)),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(r.userName, style: const TextStyle(fontWeight: FontWeight.w700)),
                  Text(Fmt.dateTime(r.createdAt), style: TextStyle(fontSize: 11, color: context.mutedText)),
                ]),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(color: AppColors.primary, borderRadius: BorderRadius.circular(6)),
                child: Text('${r.rating}.0 ★',
                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 11.5)),
              ),
            ]),
            if (r.comment.isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(r.comment, style: const TextStyle(height: 1.4)),
            ],
          ]),
        ),
      ]),
    );
  }
}

class _AllReviews extends ConsumerWidget {
  final Product product;
  const _AllReviews({required this.product});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final reviews = ref.watch(_allReviewsProvider(product.id));
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.8,
      builder: (_, scroll) => reviews.when(
        loading: () => const LoadingView(),
        error: (e, _) => ErrorView(error: e),
        data: (list) => ListView(controller: scroll, padding: const EdgeInsets.fromLTRB(16, 0, 16, 24), children: [
          Text(context.tr('ratings_reviews'), style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          for (final r in list) ReviewTile(review: r),
        ]),
      ),
    );
  }
}
