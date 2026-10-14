import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../core/l10n.dart';
import '../../core/theme.dart';
import '../../models/models.dart';
import '../../providers/data_providers.dart';
import '../../widgets/common.dart';

/// Cash Collection (screenshot 29).
class CashCollectionScreen extends ConsumerStatefulWidget {
  const CashCollectionScreen({super.key});

  @override
  ConsumerState<CashCollectionScreen> createState() => _CashCollectionScreenState();
}

class _CashCollectionScreenState extends ConsumerState<CashCollectionScreen> {
  bool _searching = false;
  String _query = '';
  DateTimeRange? _range;

  Future<void> _pickRange() async {
    final now = DateTime.now();
    final r = await showDateRangePicker(
      context: context,
      firstDate: DateTime(now.year - 2),
      lastDate: now,
      initialDateRange: _range,
    );
    setState(() => _range = r);
  }

  List<CashCollection> _filter(List<CashCollection> items) => items.where((c) {
        if (_query.isNotEmpty && !'${c.orderNumber ?? c.orderId ?? ''} ${c.message}'.toLowerCase().contains(_query.toLowerCase())) return false;
        final r = _range;
        if (r != null && c.date != null) {
          final d = c.date!;
          if (d.isBefore(r.start) || d.isAfter(r.end.add(const Duration(days: 1)))) return false;
        }
        return true;
      }).toList();

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(cashProvider);
    return Scaffold(
      appBar: AppBar(
        title: _searching
            ? TextField(
                autofocus: true,
                decoration: InputDecoration(
                  hintText: '${context.tr('order_id')}…',
                  border: InputBorder.none,
                  enabledBorder: InputBorder.none,
                  focusedBorder: InputBorder.none,
                  filled: false,
                ),
                onChanged: (v) => setState(() => _query = v),
              )
            : Text(context.tr('cash_collection')),
        actions: [
          IconButton(
            icon: Icon(_searching ? Icons.close_rounded : Icons.search_rounded),
            onPressed: () => setState(() {
              _searching = !_searching;
              if (!_searching) _query = '';
            }),
          ),
          IconButton(
            icon: Icon(_range == null ? Icons.calendar_month_outlined : Icons.event_busy_outlined),
            onPressed: _range == null ? _pickRange : () => setState(() => _range = null),
          ),
        ],
      ),
      body: RefreshIndicator(
        color: AppColors.primary,
        onRefresh: () => ref.refresh(cashProvider.future),
        child: AsyncView<CashSummary>(
          value: async,
          onRetry: () => ref.invalidate(cashProvider),
          builder: (s) {
            final items = _filter(s.items);
            return ListView(
              padding: const EdgeInsets.fromLTRB(14, 12, 14, 24),
              children: [
                const DemoBanner(),
                AppCard(
                  padding: const EdgeInsets.all(12),
                  child: Row(
                    children: [
                      Expanded(child: _SummaryTile(icon: Icons.account_balance_wallet_outlined, label: context.tr('cash_in_hand'), value: Fmt.moneyPlain(s.cashInHand))),
                      const SizedBox(width: 10),
                      Expanded(child: _SummaryTile(icon: Icons.payments_outlined, label: context.tr('cash_collected'), value: Fmt.moneyPlain(s.cashCollected))),
                    ],
                  ),
                ),
                if (_range != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 10),
                    child: Text('${Fmt.date(_range!.start)} → ${Fmt.date(_range!.end)}', style: TextStyle(color: context.mutedColor, fontSize: 12)),
                  ),
                const SizedBox(height: 12),
                if (items.isEmpty) EmptyState(title: context.tr('no_data'), icon: Icons.payments_outlined),
                for (final c in items) ...[_CashTile(item: c), const SizedBox(height: 10)],
              ],
            );
          },
        ),
      ),
    );
  }
}

class _SummaryTile extends StatelessWidget {
  const _SummaryTile({required this.icon, required this.label, required this.value});
  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Row(
        children: [
          IconTile(icon: icon, solid: true, size: 38),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 11, color: context.mutedColor)),
                FittedBox(
                  fit: BoxFit.scaleDown,
                  alignment: AlignmentDirectional.centerStart,
                  child: Text(value, style: TextStyle(fontWeight: FontWeight.w800, fontSize: 17, color: context.textColor)),
                ),
              ],
            ),
          ),
        ],
      );
}

class _CashTile extends StatelessWidget {
  const _CashTile({required this.item});
  final CashCollection item;

  @override
  Widget build(BuildContext context) {
    final submitted = item.type == 'submitted_to_admin';
    return AppCard(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      item.orderId == null ? 'Submission #${Fmt.shortId(item.id)}' : '${context.tr('order_id')} ${item.orderNumber ?? '#${Fmt.shortId(item.orderId!)}'}',
                      style: TextStyle(fontWeight: FontWeight.w700, color: context.textColor),
                    ),
                    Text(Fmt.dateTime(item.date), style: TextStyle(fontSize: 11, color: context.mutedColor)),
                  ],
                ),
              ),
              Text(
                context.trStatus(item.status),
                style: TextStyle(color: statusColor(item.status), fontWeight: FontWeight.w700, fontSize: 12.5),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(context.tr('message'), style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5, color: context.textColor)),
          Text(item.message, style: TextStyle(fontSize: 12, color: context.mutedColor)),
          Divider(height: 18, color: context.borderColor),
          Row(
            children: [
              Text(context.tr('amount'), style: TextStyle(fontWeight: FontWeight.w700, color: context.textColor)),
              const Spacer(),
              Text(
                '${submitted ? '- ' : ''}${Fmt.moneyPlain(item.amount)}',
                style: TextStyle(color: submitted ? AppColors.danger : context.bodyColor, fontWeight: FontWeight.w600),
              ),
            ],
          ),
          if (item.shortAmount > 0) ...[
            const SizedBox(height: 4),
            Row(
              children: [
                Text(context.tr('short_amount'), style: const TextStyle(fontSize: 12, color: AppColors.danger)),
                const Spacer(),
                Text(Fmt.moneyPlain(item.shortAmount), style: const TextStyle(fontSize: 12, color: AppColors.danger, fontWeight: FontWeight.w700)),
              ],
            ),
          ],
        ],
      ),
    );
  }
}
