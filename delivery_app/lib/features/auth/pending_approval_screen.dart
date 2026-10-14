import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/l10n.dart';
import '../../core/theme.dart';
import '../../providers/auth_provider.dart';
import '../../widgets/common.dart';

class PendingApprovalScreen extends ConsumerStatefulWidget {
  const PendingApprovalScreen({super.key});

  @override
  ConsumerState<PendingApprovalScreen> createState() => _PendingApprovalScreenState();
}

class _PendingApprovalScreenState extends ConsumerState<PendingApprovalScreen> {
  bool _checking = false;

  Future<void> _check() async {
    setState(() => _checking = true);
    try {
      await ref.read(authProvider.notifier).refreshProfile();
      if (mounted && ref.read(authProvider).status == AuthStatus.pending) {
        showSnack(context, context.tr('pending_title'));
      }
    } catch (e) {
      if (mounted) showSnack(context, errorText(e), error: true);
    } finally {
      if (mounted) setState(() => _checking = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final profile = ref.watch(profileProvider);
    final steps = [
      (Icons.how_to_reg_rounded, context.tr('step_submitted'), true),
      (Icons.fact_check_outlined, context.tr('step_verification'), false),
      (Icons.verified_user_outlined, context.tr('step_activation'), false),
    ];
    return Scaffold(
      backgroundColor: context.cardColor,
      body: SafeArea(
        child: Column(
          children: [
            const DemoBanner(),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(24),
                child: Column(
                  children: [
                    const SizedBox(height: 16),
                    const BrandLogo(height: 34),
                    const SizedBox(height: 36),
                    Container(
                      width: 120,
                      height: 120,
                      decoration: BoxDecoration(color: context.softGreen, shape: BoxShape.circle),
                      child: const Icon(Icons.hourglass_top_rounded, size: 56, color: AppColors.primary),
                    ),
                    const SizedBox(height: 24),
                    Text(
                      context.tr('pending_title'),
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: context.textColor),
                    ),
                    if (profile != null) ...[
                      const SizedBox(height: 6),
                      Text(profile.email, style: TextStyle(color: context.mutedColor)),
                    ],
                    const SizedBox(height: 12),
                    Text(
                      context.tr('pending_desc'),
                      textAlign: TextAlign.center,
                      style: TextStyle(color: context.bodyColor, height: 1.5),
                    ),
                    const SizedBox(height: 28),
                    AppCard(
                      child: Column(
                        children: [
                          for (final (icon, label, done) in steps)
                            Padding(
                              padding: const EdgeInsets.symmetric(vertical: 8),
                              child: Row(
                                children: [
                                  IconTile(icon: icon, color: done ? AppColors.primary : AppColors.warning, size: 36),
                                  const SizedBox(width: 12),
                                  Expanded(child: Text(label, style: const TextStyle(fontWeight: FontWeight.w600))),
                                  StatusPill(done ? 'success' : 'pending'),
                                ],
                              ),
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
              child: Column(
                children: [
                  LoadingButton(label: context.tr('check_status'), loading: _checking, onPressed: _check, icon: Icons.refresh_rounded),
                  const SizedBox(height: 8),
                  TextButton.icon(
                    onPressed: () => ref.read(authProvider.notifier).logout(),
                    icon: const Icon(Icons.logout_rounded, size: 18),
                    label: Text(context.tr('logout')),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
