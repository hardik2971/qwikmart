import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../core/l10n.dart';
import '../../core/theme.dart';
import '../../models/models.dart';
import '../../providers/data_providers.dart';
import '../../widgets/common.dart';

class EarningsScreen extends ConsumerStatefulWidget {
  const EarningsScreen({super.key});

  @override
  ConsumerState<EarningsScreen> createState() => _EarningsScreenState();
}

class _EarningsScreenState extends ConsumerState<EarningsScreen> {
  String _type = 'all';

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(earningsProvider);
    return Scaffold(
      appBar: AppBar(title: Text(context.tr('earnings'))),
      body: RefreshIndicator(
        color: AppColors.primary,
        onRefresh: () => ref.refresh(earningsProvider.future),
        child: AsyncView<EarningsSummary>(
          value: async,
          onRetry: () => ref.invalidate(earningsProvider),
          builder: (s) {
            final items = _type == 'all' ? s.items : s.items.where((e) => e.type == _type).toList();
            return ListView(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
              children: [
                const DemoBanner(),
                Container(
                  padding: const EdgeInsets.all(18),
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(colors: [AppColors.primary, AppColors.primaryDark]),
                    borderRadius: BorderRadius.circular(AppRadius.card),
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(context.tr('total_earned'), style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontSize: 13)),
                            const SizedBox(height: 4),
                            Text(Fmt.money(s.total), style: const TextStyle(color: Colors.white, fontSize: 26, fontWeight: FontWeight.w800)),
                          ],
                        ),
                      ),
                      Container(
                        width: 52,
                        height: 52,
                        decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.18), borderRadius: BorderRadius.circular(14)),
                        child: const Icon(Icons.savings_outlined, color: Colors.white, size: 28),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(child: _PeriodCard(label: context.tr('today'), value: s.today, color: AppColors.primary, icon: Icons.today_outlined)),
                    const SizedBox(width: 10),
                    Expanded(child: _PeriodCard(label: context.tr('this_week'), value: s.week, color: AppColors.info, icon: Icons.date_range_outlined)),
                    const SizedBox(width: 10),
                    Expanded(child: _PeriodCard(label: context.tr('this_month'), value: s.month, color: AppColors.purple, icon: Icons.calendar_month_outlined)),
                  ],
                ),
                const SizedBox(height: 18),
                SectionTitle(context.tr('earning_history')),
                Wrap(
                  spacing: 8,
                  children: [
                    for (final t in ['all', 'commission', 'bonus', 'salary'])
                      ChoiceChip(
                        label: Text(context.tr(t)),
                        selected: _type == t,
                        showCheckmark: false,
                        selectedColor: context.softGreen,
                        labelStyle: TextStyle(color: _type == t ? AppColors.primary : context.bodyColor, fontWeight: FontWeight.w600, fontSize: 12.5),
                        side: BorderSide(color: _type == t ? AppColors.primary : context.borderColor),
                        shape: const StadiumBorder(),
                        onSelected: (_) => setState(() => _type = t),
                      ),
                  ],
                ),
                const SizedBox(height: 10),
                if (items.isEmpty) EmptyState(title: context.tr('no_data'), icon: Icons.savings_outlined),
                for (final e in items) ...[_EarningTile(e: e), const SizedBox(height: 10)],
              ],
            );
          },
        ),
      ),
    );
  }
}

class _PeriodCard extends StatelessWidget {
  const _PeriodCard({required this.label, required this.value, required this.color, required this.icon});
  final String label;
  final double value;
  final Color color;
  final IconData icon;

  @override
  Widget build(BuildContext context) => AppCard(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            IconTile(icon: icon, color: color, size: 32),
            const SizedBox(height: 8),
            FittedBox(
              fit: BoxFit.scaleDown,
              child: Text(Fmt.money(value), style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: context.textColor)),
            ),
            Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 11.5, color: context.mutedColor)),
          ],
        ),
      );
}

class _EarningTile extends StatelessWidget {
  const _EarningTile({required this.e});
  final Earning e;

  @override
  Widget build(BuildContext context) {
    final (icon, color) = switch (e.type) {
      'bonus' => (Icons.card_giftcard_rounded, AppColors.warning),
      'salary' => (Icons.account_balance_outlined, AppColors.purple),
      _ => (Icons.delivery_dining_rounded, AppColors.primary),
    };
    return AppCard(
      child: Row(
        children: [
          IconTile(icon: icon, color: color, size: 40),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  e.orderNumber == null ? context.tr(e.type) : '${context.tr(e.type)} · ${e.orderNumber}',
                  style: TextStyle(fontWeight: FontWeight.w700, color: context.textColor),
                ),
                Text(Fmt.dateTime(e.date), style: TextStyle(fontSize: 11.5, color: context.mutedColor)),
              ],
            ),
          ),
          Text('+${Fmt.money(e.amount)}', style: const TextStyle(fontWeight: FontWeight.w800, color: AppColors.primary)),
        ],
      ),
    );
  }
}
