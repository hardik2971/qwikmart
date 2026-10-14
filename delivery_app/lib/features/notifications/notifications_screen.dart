import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/format.dart';
import '../../core/l10n.dart';
import '../../core/theme.dart';
import '../../models/models.dart';
import '../../providers/core_providers.dart';
import '../../providers/data_providers.dart';
import '../../widgets/common.dart';

class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(notificationsProvider);
    return Scaffold(
      appBar: AppBar(
        title: Text(context.tr('notifications')),
        actions: [
          TextButton(
            onPressed: () async {
              try {
                await ref.read(repositoryProvider).markAllNotificationsRead();
                ref.invalidate(notificationsProvider);
              } catch (e) {
                if (context.mounted) showSnack(context, errorText(e), error: true);
              }
            },
            child: Text(context.tr('mark_all_read')),
          ),
        ],
      ),
      body: RefreshIndicator(
        color: AppColors.primary,
        onRefresh: () => ref.refresh(notificationsProvider.future),
        child: AsyncView<List<AppNotification>>(
          value: async,
          onRetry: () => ref.invalidate(notificationsProvider),
          builder: (list) {
            if (list.isEmpty) {
              return ListView(children: [
                const SizedBox(height: 80),
                EmptyState(title: context.tr('no_notifications'), icon: Icons.notifications_none_rounded),
              ]);
            }
            return ListView.separated(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
              itemCount: list.length,
              separatorBuilder: (_, _) => const SizedBox(height: 10),
              itemBuilder: (_, i) {
                final n = list[i];
                final (icon, color) = switch (n.type) {
                  'order' => (Icons.delivery_dining_rounded, AppColors.primary),
                  'promotion' => (Icons.local_offer_outlined, AppColors.warning),
                  _ => (Icons.notifications_none_rounded, AppColors.info),
                };
                return AppCard(
                  color: n.read ? null : context.softGreen.withValues(alpha: 0.6),
                  onTap: n.orderId == null ? null : () => context.push('/order/${n.orderId}'),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      IconTile(icon: icon, color: color, size: 40),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Expanded(
                                  child: Text(n.title, style: TextStyle(fontWeight: FontWeight.w700, color: context.textColor)),
                                ),
                                if (!n.read)
                                  Container(width: 8, height: 8, decoration: const BoxDecoration(color: AppColors.primary, shape: BoxShape.circle)),
                              ],
                            ),
                            const SizedBox(height: 2),
                            Text(n.message, style: TextStyle(fontSize: 12.5, color: context.bodyColor)),
                            const SizedBox(height: 4),
                            Text(Fmt.relative(n.createdAt), style: TextStyle(fontSize: 11, color: context.mutedColor)),
                          ],
                        ),
                      ),
                    ],
                  ),
                );
              },
            );
          },
        ),
      ),
    );
  }
}
