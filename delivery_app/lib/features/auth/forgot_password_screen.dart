import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/l10n.dart';
import '../../core/theme.dart';
import '../../providers/auth_provider.dart';
import '../../widgets/common.dart';
import 'auth_widgets.dart';

/// Forgot password: Firebase `sendPasswordResetEmail` – the rider resets the password from the
/// e-mailed link and logs in again.
class ForgotPasswordScreen extends ConsumerStatefulWidget {
  const ForgotPasswordScreen({super.key, this.initialEmail});
  final String? initialEmail;

  @override
  ConsumerState<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends ConsumerState<ForgotPasswordScreen> {
  final _form = GlobalKey<FormState>();
  late final _email = TextEditingController(text: widget.initialEmail);
  bool _loading = false;
  bool _sent = false;

  @override
  void dispose() {
    _email.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    if (!_form.currentState!.validate()) return;
    setState(() => _loading = true);
    try {
      await ref.read(authProvider.notifier).sendPasswordReset(_email.text.trim());
      if (mounted) setState(() => _sent = true);
    } catch (e) {
      if (mounted) showSnack(context, errorText(e), error: true);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(),
      backgroundColor: context.cardColor,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Form(
            key: _form,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Align(alignment: AlignmentDirectional.centerStart, child: IconTile(icon: Icons.lock_reset_rounded, size: 56)),
                const SizedBox(height: 18),
                Text(context.tr('reset_password'),
                    style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: context.textColor)),
                const SizedBox(height: 6),
                Text(context.tr('reset_desc'), style: TextStyle(color: context.mutedColor, height: 1.4)),
                const SizedBox(height: 24),
                LabeledField(
                  label: context.tr('email'),
                  required: true,
                  child: TextFormField(
                    controller: _email,
                    enabled: !_sent,
                    keyboardType: TextInputType.emailAddress,
                    autofillHints: const [AutofillHints.email],
                    onFieldSubmitted: (_) => _send(),
                    decoration: InputDecoration(
                      hintText: context.tr('enter_email'),
                      prefixIcon: const Icon(Icons.mail_outline_rounded, size: 20),
                    ),
                    validator: (v) => validateEmail(context, v),
                  ),
                ),
                const SizedBox(height: 8),
                if (!_sent)
                  LoadingButton(label: context.tr('send_reset_link'), loading: _loading, onPressed: _send)
                else ...[
                  AppCard(
                    color: context.softGreen,
                    child: Row(
                      children: [
                        const Icon(Icons.mark_email_read_outlined, color: AppColors.primary),
                        const SizedBox(width: 12),
                        Expanded(child: Text(context.tr('reset_sent'))),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  LoadingButton(label: context.tr('back_to_login'), loading: false, onPressed: () => context.canPop() ? context.pop() : context.go('/login')),
                  TextButton(onPressed: _loading ? null : _send, child: Text(context.tr('resend_link'))),
                ],
                if (!_sent) ...[
                  const SizedBox(height: 16),
                  TextButton(onPressed: () => context.canPop() ? context.pop() : context.go('/login'), child: Text(context.tr('back_to_login'))),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
