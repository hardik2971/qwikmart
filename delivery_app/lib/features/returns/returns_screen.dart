import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../core/l10n.dart';
import '../../core/launcher.dart';
import '../../core/theme.dart';
import '../../models/models.dart';
import '../../providers/core_providers.dart';
import '../../providers/data_providers.dart';
import '../../widgets/common.dart';

class ReturnsScreen extends ConsumerWidget {
  const ReturnsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(returnsProvider);
    return Scaffold(
      appBar: AppBar(title: Text(context.tr('return_pickups'))),
      body: RefreshIndicator(
        color: AppColors.primary,
        onRefresh: () => ref.refresh(returnsProvider.future),
        child: AsyncView<List<ReturnPickup>>(
          value: async,
          onRetry: () => ref.invalidate(returnsProvider),
          builder: (list) {
            if (list.isEmpty) {
              return ListView(children: [
                const SizedBox(height: 80),
                EmptyState(title: context.tr('no_data'), icon: Icons.assignment_return_outlined),
              ]);
            }
            return ListView.separated(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
              itemCount: list.length,
              separatorBuilder: (_, _) => const SizedBox(height: 12),
              itemBuilder: (_, i) => _ReturnCard(r: list[i]),
            );
          },
        ),
      ),
    );
  }
}

class _ReturnCard extends ConsumerStatefulWidget {
  const _ReturnCard({required this.r});
  final ReturnPickup r;

  @override
  ConsumerState<_ReturnCard> createState() => _ReturnCardState();
}

class _ReturnCardState extends ConsumerState<_ReturnCard> {
  bool _busy = false;

  Future<void> _markPicked() async {
    if (!await confirmDialog(context, '${context.tr('mark_return_picked')}?')) return;
    setState(() => _busy = true);
    try {
      await ref.read(repositoryProvider).markReturnPickedUp(widget.r.id);
      ref.invalidate(returnsProvider);
      if (mounted) showSnack(context, context.tr('return_picked'));
    } catch (e) {
      if (mounted) showSnack(context, errorText(e), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final r = widget.r;
    final c = r.customer;
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(r.returnNumber, style: TextStyle(fontWeight: FontWeight.w800, color: context.textColor)),
                    Text('${r.orderNumber} · ${Fmt.relative(r.date)}', style: TextStyle(fontSize: 11.5, color: context.mutedColor)),
                  ],
                ),
              ),
              StatusPill(r.status),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              AppNetworkImage(r.image, size: 52),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(r.productName, style: TextStyle(fontWeight: FontWeight.w600, color: context.textColor)),
                    Text('${context.tr('qty')}: ${r.qty} · ${context.tr('refund')}: ${Fmt.money(r.refundAmount)}',
                        style: TextStyle(fontSize: 12, color: context.mutedColor)),
                    Text('${context.tr('reason')}: ${r.reason}', style: TextStyle(fontSize: 12, color: context.bodyColor)),
                  ],
                ),
              ),
            ],
          ),
          Divider(height: 22, color: context.borderColor),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Icon(Icons.location_on_outlined, size: 18, color: AppColors.danger),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(c.name, style: TextStyle(fontWeight: FontWeight.w700, color: context.textColor)),
                    Text(c.address, style: TextStyle(fontSize: 12, color: context.mutedColor)),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              TintIconButton(icon: Icons.call_outlined, tooltip: context.tr('call'), onTap: () => Launcher.call(context, c.phone)),
              const SizedBox(width: 8),
              Expanded(
                child: SoftButton(
                  label: context.tr('get_directions'),
                  icon: Icons.navigation_outlined,
                  onTap: () => Launcher.directions(context, c.lat, c.lng, label: c.address),
                ),
              ),
            ],
          ),
          if (!r.isPickedUp) ...[
            const SizedBox(height: 10),
            LoadingButton(label: context.tr('mark_return_picked'), icon: Icons.inventory_2_outlined, loading: _busy, onPressed: _markPicked),
          ],
        ],
      ),
    );
  }
}
