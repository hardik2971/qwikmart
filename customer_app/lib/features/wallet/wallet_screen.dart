import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/errors.dart';
import '../../core/razorpay_checkout.dart';
import '../../core/l10n/app_localizations.dart';
import '../../core/theme.dart';
import '../../core/utils.dart';
import '../../models/models.dart';
import '../../providers/providers.dart';
import '../../widgets/common.dart';
import '../cart/payment_methods_screen.dart';

/// Wallet history (screenshot 21): balance, add money, withdraw, transactions.
class WalletScreen extends ConsumerStatefulWidget {
  const WalletScreen({super.key});
  @override
  ConsumerState<WalletScreen> createState() => _WalletScreenState();
}

class _WalletScreenState extends ConsumerState<WalletScreen> {
  String _filter = 'all';
  String _search = '';
  bool _searching = false;

  Future<void> _refreshUser(double balance) async {
    final u = ref.read(sessionProvider).user;
    if (u == null) return;
    ref
        .read(sessionProvider.notifier)
        .updateUser(
          AppUser.fromJson({...u.toJson(), 'wallet_balance': balance}),
        );
  }

  @override
  Widget build(BuildContext context) {
    final wallet = ref.watch(walletProvider);
    ref.listen(walletProvider, (_, next) {
      final b = next.value?.balance;
      if (b != null) _refreshUser(b);
    });
    return Scaffold(
      appBar: AppBar(
        title: _searching
            ? TextField(
                autofocus: true,
                decoration: InputDecoration(
                  hintText: context.tr('search_transactions'),
                  isDense: true,
                ),
                onChanged: (v) => setState(() => _search = v.toLowerCase()),
              )
            : Text(context.tr('wallet_history')),
        actions: [
          IconButton(
            icon: Icon(_searching ? Icons.close_rounded : Icons.search_rounded),
            onPressed: () => setState(() {
              _searching = !_searching;
              _search = '';
            }),
          ),
          PopupMenuButton<String>(
            icon: const Icon(Icons.filter_list_rounded),
            onSelected: (v) => setState(() => _filter = v),
            itemBuilder: (_) => [
              for (final f in ['all', 'credit', 'debit'])
                CheckedPopupMenuItem(
                  value: f,
                  checked: _filter == f,
                  child: Text(context.tr('txn_$f')),
                ),
            ],
          ),
        ],
      ),
      body: wallet.when(
        loading: () => const LoadingView(),
        error: (e, _) =>
            ErrorView(error: e, onRetry: () => ref.invalidate(walletProvider)),
        data: (w) {
          final txns = w.transactions.where((t) {
            if (_filter != 'all' && t.type != _filter) return false;
            if (_search.isEmpty) return true;
            return '${t.paymentType} ${t.message} ${t.txnId} ${t.orderId ?? ''}'
                .toLowerCase()
                .contains(_search);
          }).toList();
          return RefreshIndicator(
            onRefresh: () => ref.refresh(walletProvider.future),
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                _BalanceCard(
                  balance: w.balance,
                  onAdd: () => _addMoney(context),
                  onWithdraw: () => _withdraw(context, w.balance),
                ),
                if (w.withdrawals.isNotEmpty) ...[
                  const SizedBox(height: 16),
                  _WithdrawalsCard(items: w.withdrawals),
                ],
                const SizedBox(height: 16),
                if (txns.isEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 40),
                    child: EmptyView(
                      emoji: '👛',
                      title: context.tr('no_transactions'),
                    ),
                  )
                else
                  for (final t in txns) _TxnCard(txn: t),
              ],
            ),
          );
        },
      ),
    );
  }

  Future<void> _addMoney(BuildContext context) async {
    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (_) => const _AddMoneySheet(),
    );
    if (ok == true) ref.invalidate(walletProvider);
  }

  Future<void> _withdraw(BuildContext context, double balance) async {
    final amount = TextEditingController();
    final note = TextEditingController();
    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) {
        var busy = false;
        return StatefulBuilder(
          builder: (ctx, set) => Padding(
            padding: EdgeInsets.fromLTRB(
              20,
              0,
              20,
              MediaQuery.of(ctx).viewInsets.bottom + 20,
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  ctx.tr('withdraw_money'),
                  style: ctx.text.titleLarge?.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
                ),
                Text(
                  ctx.tr('available_balance_n', {'amount': Fmt.money(balance)}),
                  style: TextStyle(color: ctx.mutedText),
                ),
                const SizedBox(height: 14),
                TextField(
                  controller: amount,
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                  inputFormatters: [
                    FilteringTextInputFormatter.allow(RegExp(r'[0-9.]')),
                  ],
                  decoration: InputDecoration(
                    hintText: ctx.tr('amount'),
                    prefixText: '${Fmt.currencySymbol} ',
                  ),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: note,
                  maxLines: 2,
                  decoration: InputDecoration(
                    hintText: ctx.tr('withdraw_note_hint'),
                  ),
                ),
                const SizedBox(height: 16),
                AppButton(
                  label: ctx.tr('request_withdrawal'),
                  loading: busy,
                  onPressed: () async {
                    final v = double.tryParse(amount.text) ?? 0;
                    if (v <= 0) return;
                    set(() => busy = true);
                    try {
                      final msg = await ref
                          .read(accountRepoProvider)
                          .withdraw(v, note.text.trim());
                      if (ctx.mounted) {
                        showSnack(ctx, msg);
                        Navigator.pop(ctx, true);
                      }
                    } on AppException catch (e) {
                      if (ctx.mounted) {
                        showSnack(ctx, e.displayMessage, error: true);
                      }
                    } finally {
                      if (ctx.mounted) set(() => busy = false);
                    }
                  },
                ),
              ],
            ),
          ),
        );
      },
    );
    if (ok == true) ref.invalidate(walletProvider);
  }
}

class _BalanceCard extends StatelessWidget {
  final double balance;
  final VoidCallback onAdd;
  final VoidCallback onWithdraw;
  const _BalanceCard({
    required this.balance,
    required this.onAdd,
    required this.onWithdraw,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: context.isDark ? AppColors.darkSurface : AppColors.primary50,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.primary.withValues(alpha: 0.25)),
      ),
      child: Column(
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: AppColors.primary,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(
                  Icons.account_balance_wallet_rounded,
                  color: Colors.white,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      context.tr('available_balance'),
                      style: TextStyle(fontSize: 12, color: context.mutedText),
                    ),
                    Text(
                      Fmt.money(balance),
                      style: const TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ],
                ),
              ),
              ElevatedButton(
                onPressed: onAdd,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.ink,
                  minimumSize: const Size(0, 40),
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  shape: const StadiumBorder(),
                ),
                child: Text(context.tr('add_money')),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Align(
            alignment: AlignmentDirectional.centerEnd,
            child: TextButton.icon(
              onPressed: onWithdraw,
              icon: const Icon(Icons.account_balance_outlined, size: 18),
              label: Text(context.tr('withdraw')),
            ),
          ),
        ],
      ),
    );
  }
}

class _TxnCard extends StatelessWidget {
  final WalletTxn txn;
  const _TxnCard({required this.txn});

  @override
  Widget build(BuildContext context) {
    final t = txn;
    final color = t.isCredit ? AppColors.primary : AppColors.danger;
    final pending = t.status == 'pending';
    return AppCard(
      margin: const EdgeInsets.only(bottom: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              GatewayLogo(keyName: t.paymentType, size: 38),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      Fmt.titleCase(
                        t.paymentType.isEmpty ? 'wallet' : t.paymentType,
                      ),
                      style: const TextStyle(fontWeight: FontWeight.w800),
                    ),
                    Text(
                      t.orderId != null
                          ? context.tr('order_id_n', {'n': t.orderId})
                          : (t.txnId.isNotEmpty ? 'TXN ID: ${t.txnId}' : ''),
                      style: TextStyle(
                        fontSize: 11.5,
                        color: context.mutedText,
                      ),
                    ),
                  ],
                ),
              ),
              Text(
                pending
                    ? context.tr('status_pending')
                    : context.tr(t.isCredit ? 'credit' : 'debit'),
                style: TextStyle(
                  color: pending ? AppColors.warning : color,
                  fontWeight: FontWeight.w800,
                  fontSize: 12.5,
                ),
              ),
            ],
          ),
          const Divider(height: 18),
          Text(
            t.message,
            style: TextStyle(fontSize: 12.5, color: context.mutedText),
          ),
          const SizedBox(height: 6),
          Row(
            children: [
              Expanded(
                child: Text(
                  Fmt.dateTime(t.createdAt),
                  style: TextStyle(fontSize: 11.5, color: context.mutedText),
                ),
              ),
              Text(
                '${t.isCredit ? '+' : '-'}${Fmt.money(t.amount)}',
                style: TextStyle(
                  color: color,
                  fontWeight: FontWeight.w800,
                  fontSize: 15,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _AddMoneySheet extends ConsumerStatefulWidget {
  const _AddMoneySheet();
  @override
  ConsumerState<_AddMoneySheet> createState() => _AddMoneySheetState();
}

class _AddMoneySheetState extends ConsumerState<_AddMoneySheet> {
  final _amount = TextEditingController(text: '500');
  String _method = 'razorpay';
  bool _busy = false;

  @override
  void dispose() {
    _amount.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final v = double.tryParse(_amount.text) ?? 0;
    if (v <= 0) return;
    setState(() => _busy = true);
    try {
      final repo = ref.read(accountRepoProvider);
      // walletRecharge → gateway payload (+ recharge_id); hosted checkout, then verifyWalletRecharge.
      final r = await repo.rechargeWallet(v, _method);
      // Razorpay: native checkout sheet, then verifyWalletRecharge with the signed payment.
      if (RazorpayCheckout.supports(r) &&
          asString(r['recharge_id']).isNotEmpty) {
        final result = await RazorpayCheckout.pay(
          r,
          description: 'Wallet top-up',
        );
        if (result == null) return;
        final msg = await repo.verifyRecharge(
          asString(r['recharge_id']),
          result,
        );
        if (!mounted) return;
        showSnack(context, msg.isEmpty ? context.tr('wallet_recharged') : msg);
        Navigator.pop(context, true);
        return;
      }
      final url = asString(r['redirect_url'] ?? r['payment_url']);
      if (url.isNotEmpty) {
        await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
      }
      if (!mounted) return;
      var message = asString(r['message']);
      final rechargeId = asString(r['recharge_id']);
      if (rechargeId.isNotEmpty) {
        final paid = await showDialog<bool>(
          context: context,
          barrierDismissible: false,
          builder: (ctx) => AlertDialog(
            title: Text(ctx.tr('complete_payment')),
            content: Text(
              ctx.tr('complete_payment_body', {
                'gateway': Fmt.titleCase(_method),
                'amount': Fmt.money(v),
              }),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(ctx, false),
                child: Text(ctx.tr('pay_later')),
              ),
              ElevatedButton(
                onPressed: () => Navigator.pop(ctx, true),
                child: Text(ctx.tr('i_have_paid')),
              ),
            ],
          ),
        );
        if (paid != true) return;
        message = await repo.verifyRecharge(rechargeId, {
          'reference': r['reference'],
          'gateway_order_id': r['gateway_order_id'],
          ...asMap(r['extra']),
        });
        if (!mounted) return;
      }
      showSnack(
        context,
        message.isEmpty ? context.tr('wallet_recharged') : message,
      );
      Navigator.pop(context, true);
    } on AppException catch (e) {
      if (mounted) showSnack(context, e.displayMessage, error: true);
    } on RazorpayCheckoutException catch (e) {
      if (mounted) showSnack(context, e.message, error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final gateways =
        (ref.watch(appSettingsProvider).value?.paymentGateways ??
                defaultGateways)
            .where((g) => g.key != 'cod' && g.key != 'wallet')
            .toList();
    // only gateways the admin enabled; none → recharge is unavailable (no silent attempt with a disabled one)
    if (gateways.isNotEmpty && !gateways.any((g) => g.key == _method)) {
      _method = gateways.first.key;
    }
    return Padding(
      padding: EdgeInsets.fromLTRB(
        20,
        0,
        20,
        MediaQuery.of(context).viewInsets.bottom + 20,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              context.tr('add_money'),
              style: context.text.titleLarge?.copyWith(
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 14),
            TextField(
              controller: _amount,
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
              decoration: InputDecoration(prefixText: '${Fmt.currencySymbol} '),
            ),
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              children: [
                for (final a in [100, 200, 500, 1000, 2000])
                  ActionChip(
                    label: Text('+${Fmt.money(a)}'),
                    onPressed: () => setState(() => _amount.text = '$a'),
                  ),
              ],
            ),
            const SizedBox(height: 16),
            Text(
              context.tr('pay_using'),
              style: const TextStyle(fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 8),
            for (final g in gateways)
              InkWell(
                onTap: () => setState(() => _method = g.key),
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 6),
                  child: Row(
                    children: [
                      GatewayLogo(keyName: g.key, size: 34),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          g.name,
                          style: const TextStyle(fontWeight: FontWeight.w600),
                        ),
                      ),
                      Icon(
                        _method == g.key
                            ? Icons.radio_button_checked_rounded
                            : Icons.radio_button_off_rounded,
                        color: _method == g.key
                            ? AppColors.primary
                            : context.mutedText,
                      ),
                    ],
                  ),
                ),
              ),
            if (gateways.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Text(
                  context.tr('no_online_payment'),
                  style: TextStyle(color: context.mutedText),
                ),
              ),
            const SizedBox(height: 14),
            AppButton(
              label: context.tr('proceed_to_pay'),
              loading: _busy,
              onPressed: gateways.isEmpty ? null : _submit,
            ),
          ],
        ),
      ),
    );
  }
}

/// Pending / processed `withdrawal_requests` of the user.
class _WithdrawalsCard extends StatelessWidget {
  final List<WithdrawalRequest> items;
  const _WithdrawalsCard({required this.items});

  @override
  Widget build(BuildContext context) {
    Color color(String s) => s == 'approved'
        ? AppColors.primary
        : s == 'rejected'
        ? AppColors.danger
        : AppColors.warning;
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Withdrawal requests',
            style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
          ),
          const SizedBox(height: 6),
          for (final w in items.take(5))
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          Fmt.money(w.amount),
                          style: const TextStyle(fontWeight: FontWeight.w700),
                        ),
                        Text(
                          [
                            Fmt.dateTime(w.createdAt),
                            if (w.remark.isNotEmpty) w.remark,
                          ].join(' · '),
                          style: TextStyle(
                            fontSize: 11.5,
                            color: context.mutedText,
                          ),
                        ),
                      ],
                    ),
                  ),
                  Text(
                    Fmt.titleCase(w.status),
                    style: TextStyle(
                      color: color(w.status),
                      fontWeight: FontWeight.w800,
                      fontSize: 12.5,
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
