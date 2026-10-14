import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/errors.dart';
import '../../core/l10n/app_localizations.dart';
import '../../core/theme.dart';
import '../../core/utils.dart';
import '../../models/models.dart';
import '../../providers/providers.dart';
import '../../widgets/common.dart';

IconData labelIcon(String label) {
  switch (label.toLowerCase()) {
    case 'home':
      return Icons.home_outlined;
    case 'work':
      return Icons.work_outline_rounded;
    default:
      return Icons.location_on_outlined;
  }
}

/// Saved addresses. In select mode, tapping an address pops it.
class AddressesScreen extends ConsumerWidget {
  final bool selectMode;
  const AddressesScreen({super.key, this.selectMode = false});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final list = ref.watch(addressesProvider);
    return Scaffold(
      appBar: AppBar(title: Text(context.tr(selectMode ? 'select_address' : 'my_addresses'))),
      body: list.when(
        loading: () => const LoadingView(),
        error: (e, _) => ErrorView(error: e, onRetry: () => ref.invalidate(addressesProvider)),
        data: (items) => items.isEmpty
            ? EmptyView(
                emoji: '🏠',
                title: context.tr('no_addresses'),
                message: context.tr('no_addresses_body'),
                actionLabel: context.tr('add_new_address'),
                onAction: () => context.push('/addresses/form'),
              )
            : ListView.separated(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
                itemCount: items.length,
                separatorBuilder: (_, _) => const SizedBox(height: 10),
                itemBuilder: (_, i) {
                  final a = items[i];
                  return AppCard(
                    onTap: selectMode ? () => context.pop(a) : null,
                    child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(color: AppColors.primary50, borderRadius: BorderRadius.circular(10)),
                        child: Icon(labelIcon(a.label), color: AppColors.primary),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Row(children: [
                            Text(a.label, style: const TextStyle(fontWeight: FontWeight.w800)),
                            if (a.isDefault) ...[const SizedBox(width: 6), Pill(label: context.tr('default'), fontSize: 10)],
                          ]),
                          const SizedBox(height: 3),
                          Text(a.fullAddress, style: TextStyle(fontSize: 12.5, color: context.mutedText, height: 1.35)),
                          if (a.name.isNotEmpty || a.phone.isNotEmpty)
                            Padding(
                              padding: const EdgeInsets.only(top: 4),
                              child: Text('${a.name} · ${a.phone}', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                            ),
                        ]),
                      ),
                      PopupMenuButton<String>(
                        onSelected: (v) async {
                          if (v == 'edit') {
                            context.push('/addresses/form', extra: a);
                          } else if (v == 'delete') {
                            try {
                              await ref.read(addressesProvider.notifier).remove(a.id);
                            } on AppException catch (e) {
                              if (context.mounted) showSnack(context, e.displayMessage, error: true);
                            }
                          } else if (v == 'default') {
                            await ref.read(addressesProvider.notifier).save(Address.fromJson({...a.toJson(), 'id': a.id, 'is_default': true}));
                          }
                        },
                        itemBuilder: (_) => [
                          PopupMenuItem(value: 'edit', child: Text(context.tr('edit'))),
                          if (!a.isDefault) PopupMenuItem(value: 'default', child: Text(context.tr('set_default'))),
                          PopupMenuItem(value: 'delete', child: Text(context.tr('delete'), style: const TextStyle(color: AppColors.danger))),
                        ],
                      ),
                    ]),
                  );
                },
              ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        onPressed: () => context.push('/addresses/form'),
        icon: const Icon(Icons.add_rounded),
        label: Text(context.tr('add_new_address')),
      ),
    );
  }
}
