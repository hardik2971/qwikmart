import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/l10n/app_localizations.dart';
import '../../core/theme.dart';
import '../../providers/providers.dart';
import '../../widgets/common.dart';

class FaqScreen extends ConsumerWidget {
  const FaqScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final faqs = ref.watch(faqsProvider);
    return Scaffold(
      appBar: AppBar(title: Text(context.tr('faq'))),
      body: faqs.when(
        loading: () => const LoadingView(),
        error: (e, _) => ErrorView(error: e, onRetry: () => ref.invalidate(faqsProvider)),
        data: (list) => ListView(padding: const EdgeInsets.all(16), children: [
          for (final f in list)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: AppCard(
                padding: EdgeInsets.zero,
                child: Theme(
                  data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
                  child: ExpansionTile(
                    shape: const RoundedRectangleBorder(),
                    iconColor: AppColors.primary,
                    title: Text(f.question, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                    childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 14),
                    expandedCrossAxisAlignment: CrossAxisAlignment.start,
                    children: [Text(f.answer, style: TextStyle(color: context.mutedText, height: 1.45))],
                  ),
                ),
              ),
            ),
          const SizedBox(height: 10),
          AppCard(
            color: AppColors.primary50,
            onTap: () => context.push('/support'),
            child: Row(children: [
              const Icon(Icons.headset_mic_outlined, color: AppColors.primary),
              const SizedBox(width: 12),
              Expanded(
                child: Text(context.tr('still_need_help'),
                    style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.primaryDark)),
              ),
              const Icon(Icons.chevron_right_rounded, color: AppColors.primary),
            ]),
          ),
        ]),
      ),
    );
  }
}
