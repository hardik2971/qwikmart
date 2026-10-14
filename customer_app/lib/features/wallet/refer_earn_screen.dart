import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:share_plus/share_plus.dart';

import '../../core/l10n/app_localizations.dart';
import '../../core/theme.dart';
import '../../core/utils.dart';
import '../../providers/providers.dart';
import '../../widgets/common.dart';

/// Refer & Earn (screenshot 22).
class ReferEarnScreen extends ConsumerWidget {
  const ReferEarnScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final info = ref.watch(referralProvider);
    return Scaffold(
      appBar: AppBar(title: Text(context.tr('refer_earn'))),
      body: info.when(
        loading: () => const LoadingView(),
        error: (e, _) => ErrorView(error: e, onRetry: () => ref.invalidate(referralProvider)),
        data: (r) {
          final shareText = context.tr('referral_share_text', {'code': r.code, 'amount': Fmt.money(r.referredReward)});
          return ListView(padding: const EdgeInsets.all(16), children: [
            Container(
              padding: const EdgeInsets.all(22),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [Color(0xFF16A92E), AppColors.primary, AppColors.primaryDark],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.circular(16),
              ),
              child: Column(children: [
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.18), borderRadius: BorderRadius.circular(16)),
                  child: const Icon(Icons.card_giftcard_rounded, color: Colors.white, size: 34),
                ),
                const SizedBox(height: 14),
                Text(context.tr('invite_friends_earn'),
                    style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w800)),
                const SizedBox(height: 6),
                Text(
                  context.tr('invite_body', {'amount': Fmt.money(r.referrerReward)}),
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.white.withValues(alpha: 0.9), fontSize: 13),
                ),
              ]),
            ),
            const SizedBox(height: 14),
            AppCard(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(context.tr('your_referral_code'), style: const TextStyle(fontWeight: FontWeight.w700)),
                const SizedBox(height: 10),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  decoration: BoxDecoration(
                    color: AppColors.primary50.withValues(alpha: context.isDark ? 0.12 : 1),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: AppColors.primary.withValues(alpha: 0.5)),
                  ),
                  child: Row(children: [
                    Expanded(
                      child: Text(r.code,
                          style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800, letterSpacing: 3, color: AppColors.primaryDark)),
                    ),
                    IconButton(
                      icon: const Icon(Icons.copy_rounded, color: AppColors.primary),
                      onPressed: () {
                        Clipboard.setData(ClipboardData(text: r.code));
                        showSnack(context, context.tr('code_copied'));
                      },
                    ),
                  ]),
                ),
                const SizedBox(height: 12),
                AppButton(
                  label: context.tr('share_code'),
                  icon: Icons.share_outlined,
                  onPressed: () => SharePlus.instance.share(ShareParams(text: shareText)),
                ),
              ]),
            ),
            const SizedBox(height: 14),
            AppCard(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(context.tr('reward_details'), style: const TextStyle(fontWeight: FontWeight.w800)),
                const SizedBox(height: 10),
                Row(children: [
                  _tile(context, Fmt.money(r.minOrder), context.tr('min_order')),
                  const SizedBox(width: 8),
                  _tile(context, Fmt.money(r.referrerReward), context.tr('you_earn')),
                  const SizedBox(width: 8),
                  _tile(context, Fmt.money(r.referredReward), context.tr('friend_earns')),
                ]),
              ]),
            ),
            const SizedBox(height: 14),
            AppCard(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(context.tr('how_it_works'), style: const TextStyle(fontWeight: FontWeight.w800)),
                const SizedBox(height: 10),
                _step(context, 1, Icons.share_outlined, context.tr('how_1')),
                _step(context, 2, Icons.person_add_alt_outlined, context.tr('how_2', {'amount': Fmt.money(r.minOrder)})),
                _step(context, 3, Icons.account_balance_wallet_outlined, context.tr('how_3')),
              ]),
            ),
            const SizedBox(height: 14),
            AppCard(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Text(context.tr('your_referrals'), style: const TextStyle(fontWeight: FontWeight.w800)),
                  const Spacer(),
                  Text('${context.tr('total_earned')}: ${Fmt.money(r.totalEarned)}',
                      style: const TextStyle(color: AppColors.primary, fontWeight: FontWeight.w800, fontSize: 12.5)),
                ]),
                const SizedBox(height: 8),
                if (r.referrals.isEmpty)
                  Text(context.tr('no_referrals'), style: TextStyle(color: context.mutedText))
                else
                  for (final e in r.referrals)
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: CircleAvatar(
                        backgroundColor: tintFor(e.name),
                        child: Text(e.name[0], style: const TextStyle(fontWeight: FontWeight.w800, color: AppColors.primaryDark)),
                      ),
                      title: Text(e.name, style: const TextStyle(fontWeight: FontWeight.w700)),
                      subtitle: Text(Fmt.date(e.createdAt)),
                      trailing: Pill(
                        label: e.status == 'credited' ? '+${Fmt.money(e.reward)}' : context.tr('status_pending'),
                        color: e.status == 'credited' ? AppColors.primary : AppColors.warning,
                      ),
                    ),
              ]),
            ),
          ]);
        },
      ),
    );
  }

  Widget _tile(BuildContext context, String value, String label) => Expanded(
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 12),
          decoration: BoxDecoration(
            color: context.isDark ? AppColors.darkBg : const Color(0xFFF2F4F7),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Column(children: [
            Text(value, style: const TextStyle(fontWeight: FontWeight.w800, color: AppColors.primary, fontSize: 16)),
            const SizedBox(height: 2),
            Text(label, style: TextStyle(fontSize: 11, color: context.mutedText)),
          ]),
        ),
      );

  Widget _step(BuildContext context, int n, IconData icon, String text) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(children: [
          CircleAvatar(radius: 16, backgroundColor: AppColors.primary, child: Icon(icon, color: Colors.white, size: 16)),
          const SizedBox(width: 12),
          Expanded(child: Text(text, style: const TextStyle(fontSize: 13))),
        ]),
      );
}
