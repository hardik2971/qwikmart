import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../core/l10n.dart';
import '../../core/theme.dart';
import '../../models/models.dart';
import '../../providers/core_providers.dart';
import '../../providers/data_providers.dart';
import '../../widgets/common.dart';

/// Wallet (screenshot 29): balance + black Withdraw pill + request list.
class WalletScreen extends ConsumerStatefulWidget {
  const WalletScreen({super.key});

  @override
  ConsumerState<WalletScreen> createState() => _WalletScreenState();
}

class _WalletScreenState extends ConsumerState<WalletScreen> {
  int _tab = 0; // 0 requests, 1 transactions
  String _status = 'all';

  Future<void> _withdraw(double balance, int pending) async {
    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _WithdrawSheet(balance: balance, pending: pending),
    );
    if (ok == true && mounted) {
      ref.invalidate(walletProvider);
      showSnack(context, context.tr('withdraw_sent'));
    }
  }

  void _filterSheet() {
    showModalBottomSheet<void>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (final s in ['all', 'pending', 'approved', 'rejected'])
              ListTile(
                title: Text(s == 'all' ? ctx.tr('all') : ctx.trStatus(s)),
                trailing: _status == s ? const Icon(Icons.check_rounded, color: AppColors.primary) : null,
                onTap: () {
                  setState(() => _status = s);
                  Navigator.pop(ctx);
                },
              ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(walletProvider);
    return Scaffold(
      appBar: AppBar(
        title: Text(context.tr('wallet')),
        actions: [
          IconButton(icon: const Icon(Icons.filter_list_rounded), onPressed: _filterSheet),
        ],
      ),
      body: RefreshIndicator(
        color: AppColors.primary,
        onRefresh: () => ref.refresh(walletProvider.future),
        child: AsyncView<WalletSummary>(
          value: async,
          onRetry: () => ref.invalidate(walletProvider),
          builder: (w) {
            final requests = _status == 'all' ? w.withdrawals : w.withdrawals.where((r) => r.status == _status).toList();
            return ListView(
              padding: const EdgeInsets.fromLTRB(14, 12, 14, 24),
              children: [
                const DemoBanner(),
                AppCard(
                  padding: const EdgeInsets.all(14),
                  child: Row(
                    children: [
                      const IconTile(icon: Icons.account_balance_wallet_rounded, solid: true, size: 46),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(context.tr('available_balance'), style: TextStyle(fontSize: 12, color: context.mutedColor)),
                            Text(Fmt.moneyPlain(w.balance), style: TextStyle(fontWeight: FontWeight.w800, fontSize: 22, color: context.textColor)),
                          ],
                        ),
                      ),
                      FilledButton(
                        onPressed: () => _withdraw(w.balance, w.withdrawals.where((r) => r.status == 'pending').length),
                        style: FilledButton.styleFrom(
                          backgroundColor: context.isDark ? Colors.white : const Color(0xFF111111),
                          foregroundColor: context.isDark ? Colors.black : Colors.white,
                          shape: const StadiumBorder(),
                          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                        ),
                        child: Text(context.tr('withdraw')),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 14),
                SegmentedButton<int>(
                  segments: [
                    ButtonSegment(value: 0, label: Text(context.tr('requests')), icon: const Icon(Icons.outbox_outlined, size: 18)),
                    ButtonSegment(value: 1, label: Text(context.tr('transactions')), icon: const Icon(Icons.swap_vert_rounded, size: 18)),
                  ],
                  selected: {_tab},
                  showSelectedIcon: false,
                  style: SegmentedButton.styleFrom(
                    selectedBackgroundColor: context.softGreen,
                    selectedForegroundColor: AppColors.primary,
                  ),
                  onSelectionChanged: (s) => setState(() => _tab = s.first),
                ),
                const SizedBox(height: 12),
                if (_tab == 0) ...[
                  if (requests.isEmpty) EmptyState(title: context.tr('no_data'), icon: Icons.outbox_outlined),
                  for (final r in requests) ...[_RequestTile(r: r), const SizedBox(height: 10)],
                ] else ...[
                  if (w.transactions.isEmpty) EmptyState(title: context.tr('no_data'), icon: Icons.swap_vert_rounded),
                  for (final t in w.transactions) ...[_TxnTile(t: t), const SizedBox(height: 10)],
                ],
              ],
            );
          },
        ),
      ),
    );
  }
}

class _RequestTile extends StatelessWidget {
  const _RequestTile({required this.r});
  final Withdrawal r;

  @override
  Widget build(BuildContext context) => AppCard(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('${context.tr('request_id')} #${Fmt.shortId(r.id)}', style: TextStyle(fontWeight: FontWeight.w600, color: context.bodyColor)),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      Text(Fmt.moneyPlain(r.amount), style: TextStyle(fontWeight: FontWeight.w800, fontSize: 17, color: context.textColor)),
                      const SizedBox(width: 8),
                      Text(context.trStatus(r.status), style: TextStyle(color: statusColor(r.status), fontWeight: FontWeight.w700, fontSize: 12.5)),
                    ],
                  ),
                  if ((r.message ?? '').isNotEmpty || (r.remark ?? '').isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Text(
                      [if ((r.message ?? '').isNotEmpty) r.message!, if ((r.remark ?? '').isNotEmpty) 'Remark: ${r.remark}'].join(' · '),
                      style: TextStyle(fontSize: 12, color: context.mutedColor),
                    ),
                  ],
                ],
              ),
            ),
            Text(Fmt.date(r.date), style: TextStyle(fontSize: 11.5, color: context.mutedColor)),
          ],
        ),
      );
}

class _TxnTile extends StatelessWidget {
  const _TxnTile({required this.t});
  final WalletTxn t;

  @override
  Widget build(BuildContext context) => AppCard(
        child: Row(
          children: [
            IconTile(
              icon: t.isCredit ? Icons.south_west_rounded : Icons.north_east_rounded,
              color: t.isCredit ? AppColors.primary : AppColors.danger,
              size: 38,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(t.message.isEmpty ? Fmt.titleCase(t.paymentType ?? t.type) : t.message,
                      style: TextStyle(fontWeight: FontWeight.w600, color: context.textColor)),
                  Text(Fmt.dateTime(t.date), style: TextStyle(fontSize: 11.5, color: context.mutedColor)),
                ],
              ),
            ),
            Text(
              '${t.isCredit ? '+' : '-'}${Fmt.money(t.amount)}',
              style: TextStyle(fontWeight: FontWeight.w800, color: t.isCredit ? AppColors.primary : AppColors.danger),
            ),
          ],
        ),
      );
}

class _WithdrawSheet extends ConsumerStatefulWidget {
  const _WithdrawSheet({required this.balance, this.pending = 0});
  final double balance;

  /// Pending requests of this rider – `walletWithdraw` allows at most 3.
  final int pending;

  @override
  ConsumerState<_WithdrawSheet> createState() => _WithdrawSheetState();
}

class _WithdrawSheetState extends ConsumerState<_WithdrawSheet> {
  final _form = GlobalKey<FormState>();
  final _amount = TextEditingController();
  final _message = TextEditingController();
  bool _loading = false;

  @override
  void dispose() {
    _amount.dispose();
    _message.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    setState(() => _loading = true);
    try {
      await ref.read(repositoryProvider).withdraw(double.parse(_amount.text), _message.text.trim());
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) showSnack(context, errorText(e), error: true);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final min = ref.watch(minWithdrawProvider).value ?? 0;
    final limitReached = widget.pending >= 3;
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
          child: Form(
            key: _form,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(context.tr('withdraw_request'), style: TextStyle(fontSize: 19, fontWeight: FontWeight.w800, color: context.textColor)),
                const SizedBox(height: 4),
                Text('${context.tr('available_balance')}: ${Fmt.moneyPlain(widget.balance)}', style: TextStyle(color: context.mutedColor)),
                if (min > 0)
                  Text('${context.tr('min_withdraw')}: ${Fmt.moneyPlain(min)}', style: TextStyle(color: context.mutedColor, fontSize: 12.5)),
                if (widget.pending > 0)
                  Text('${context.tr('pending_requests')}: ${widget.pending}/3', style: TextStyle(color: context.mutedColor, fontSize: 12.5)),
                if (limitReached) ...[
                  const SizedBox(height: 8),
                  Text(context.tr('withdraw_pending_limit'), style: const TextStyle(color: AppColors.danger, fontWeight: FontWeight.w600)),
                ],
                const SizedBox(height: 18),
                LabeledField(
                  label: context.tr('amount'),
                  required: true,
                  child: TextFormField(
                    controller: _amount,
                    autofocus: true,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'^\d*\.?\d{0,2}'))],
                    decoration: InputDecoration(hintText: context.tr('enter_amount'), prefixText: '${Fmt.currencySymbol} '),
                    validator: (v) {
                      final a = double.tryParse(v ?? '');
                      if (a == null || a <= 0) return context.tr('invalid_amount');
                      if (a > widget.balance) return context.tr('insufficient');
                      if (a < min) return '${context.tr('min_withdraw')}: ${Fmt.moneyPlain(min)}';
                      return null;
                    },
                  ),
                ),
                Wrap(
                  spacing: 8,
                  children: [
                    for (final pct in [0.25, 0.5, 1.0])
                      ActionChip(
                        label: Text(pct == 1 ? 'Max' : '${(pct * 100).toInt()}%'),
                        onPressed: () => _amount.text = (widget.balance * pct).toStringAsFixed(widget.balance * pct % 1 == 0 ? 0 : 2),
                      ),
                  ],
                ),
                const SizedBox(height: 10),
                LabeledField(
                  label: context.tr('message_optional'),
                  child: TextFormField(controller: _message, maxLines: 3, decoration: const InputDecoration(hintText: 'e.g. Weekly payout')),
                ),
                LoadingButton(label: context.tr('submit'), loading: _loading, onPressed: limitReached ? null : _submit),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
