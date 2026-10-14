import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/l10n/app_localizations.dart';
import '../../core/theme.dart';
import '../../core/utils.dart';
import '../../models/models.dart';
import '../../providers/providers.dart';
import '../../widgets/common.dart';

class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  static (IconData, Color) _style(String type) {
    switch (type) {
      case 'order':
        return (Icons.local_shipping_outlined, AppColors.info);
      case 'promotion':
        return (Icons.local_offer_outlined, AppColors.warning);
      case 'product':
        return (Icons.shopping_basket_outlined, AppColors.purple);
      case 'category':
        return (Icons.category_outlined, AppColors.purple);
      default:
        return (Icons.notifications_none_rounded, AppColors.primary);
    }
  }

  void _open(BuildContext context, WidgetRef ref, AppNotification n) {
    if (!n.isRead) {
      // users/{uid}/notifications/{id}: the owner may only set read_at.
      ref.read(accountRepoProvider).readNotification(n.id).then((_) => ref.invalidate(notificationsProvider), onError: (Object _) {});
    }
    final orderId = asIdOrNull(n.data['order_id']);
    final slug = asString(n.data['slug']);
    final categoryId = asIdOrNull(n.data['category_id']);
    if (orderId != null) {
      context.push('/orders/$orderId');
    } else if (slug.isNotEmpty) {
      context.push('/product/$slug');
    } else if (categoryId != null) {
      context.push('/category/$categoryId');
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final list = ref.watch(notificationsProvider);
    return Scaffold(
      appBar: AppBar(
        title: Text(context.tr('notifications')),
        actions: [
          TextButton(
            onPressed: () async {
              await ref.read(accountRepoProvider).readAllNotifications();
              ref.invalidate(notificationsProvider);
            },
            child: Text(context.tr('mark_all_read')),
          ),
        ],
      ),
      body: list.when(
        loading: () => const LoadingView(),
        error: (e, _) => ErrorView(error: e, onRetry: () => ref.invalidate(notificationsProvider)),
        data: (items) => items.isEmpty
            ? EmptyView(emoji: '🔔', title: context.tr('no_notifications'), message: context.tr('no_notifications_body'))
            : RefreshIndicator(
                onRefresh: () => ref.refresh(notificationsProvider.future),
                child: ListView.separated(
                  padding: const EdgeInsets.all(16),
                  itemCount: items.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 10),
                  itemBuilder: (_, i) {
                    final n = items[i];
                    final (icon, color) = _style(n.type);
                    return AppCard(
                      color: n.isRead ? null : AppColors.primary50.withValues(alpha: context.isDark ? 0.1 : 0.55),
                      onTap: () => _open(context, ref, n),
                      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Container(
                          padding: const EdgeInsets.all(9),
                          decoration: BoxDecoration(color: color.withValues(alpha: 0.12), shape: BoxShape.circle),
                          child: Icon(icon, color: color, size: 20),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Row(children: [
                              Expanded(child: Text(n.title, style: const TextStyle(fontWeight: FontWeight.w800))),
                              if (!n.isRead)
                                Container(width: 8, height: 8, decoration: const BoxDecoration(color: AppColors.primary, shape: BoxShape.circle)),
                            ]),
                            const SizedBox(height: 3),
                            Text(n.message, style: TextStyle(fontSize: 12.5, color: context.mutedText, height: 1.35)),
                            const SizedBox(height: 6),
                            Text(Fmt.relative(n.createdAt), style: TextStyle(fontSize: 11, color: context.mutedText)),
                          ]),
                        ),
                      ]),
                    );
                  },
                ),
              ),
      ),
    );
  }
}
