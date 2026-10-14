import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:go_router/go_router.dart';

import '../../core/config.dart';
import '../../core/l10n.dart';
import '../../core/theme.dart';
import '../../providers/auth_provider.dart';
import '../../providers/data_providers.dart';
import '../../widgets/common.dart';
import 'auth_widgets.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _form = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _obscure = true;
  bool _loading = false;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    setState(() => _loading = true);
    try {
      await ref.read(authProvider.notifier).login(_email.text, _password.text);
    } on NoRiderAccount {
      if (mounted) await _offerRegistration();
    } catch (e) {
      if (mounted) showSnack(context, errorText(e), error: true);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  /// Firebase sign-in worked but there is no rider account (no `delivery_boys/{uid}` doc):
  /// continue to the registration stepper with the signed-in user, or sign out.
  Future<void> _offerRegistration() async {
    final register = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(ctx.tr('no_rider_title')),
        content: Text(ctx.tr('no_rider_desc')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(ctx.tr('cancel'))),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: Text(ctx.tr('register_now'))),
        ],
      ),
    );
    if (register == true && mounted) {
      context.push('/register');
    } else {
      await ref.read(authProvider.notifier).cancelRegistration(deleteAccount: false);
    }
  }

  void _fillDemo() {
    _email.text = AppConfig.demoEmail;
    _password.text = AppConfig.demoPassword;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.cardColor,
      body: Column(
        children: [
          Expanded(
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Illustration header (screenshot 28)
                  Container(
                    color: AppColors.primary50,
                    child: SafeArea(
                      bottom: false,
                      child: Stack(
                        children: [
                          AspectRatio(
                            aspectRatio: 360 / 240,
                            child: SvgPicture.asset('assets/illustrations/scooter.svg', fit: BoxFit.cover),
                          ),
                          const Positioned(top: 12, left: 16, child: BrandLogo(height: 30)),
                        ],
                      ),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(20, 22, 20, 24),
                    child: Form(
                      key: _form,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          const DemoBanner(),
                          Text(
                            context.tr('login_title'),
                            style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: context.textColor),
                          ),
                          const SizedBox(height: 4),
                          Text(context.tr('login_sub'), style: TextStyle(color: context.mutedColor, fontSize: 13.5)),
                          const SizedBox(height: 22),
                          LabeledField(
                            label: context.tr('email'),
                            required: true,
                            child: TextFormField(
                              controller: _email,
                              keyboardType: TextInputType.emailAddress,
                              textInputAction: TextInputAction.next,
                              autofillHints: const [AutofillHints.email],
                              decoration: InputDecoration(
                                hintText: context.tr('enter_email'),
                                prefixIcon: const Icon(Icons.mail_outline_rounded, size: 20),
                              ),
                              validator: (v) => validateEmail(context, v),
                            ),
                          ),
                          LabeledField(
                            label: context.tr('password'),
                            required: true,
                            child: TextFormField(
                              controller: _password,
                              obscureText: _obscure,
                              textInputAction: TextInputAction.done,
                              onFieldSubmitted: (_) => _submit(),
                              autofillHints: const [AutofillHints.password],
                              decoration: InputDecoration(
                                hintText: context.tr('enter_password'),
                                prefixIcon: const Icon(Icons.lock_outline_rounded, size: 20),
                                suffixIcon: IconButton(
                                  icon: Icon(
                                    _obscure ? Icons.visibility_off_outlined : Icons.visibility_outlined,
                                    size: 20,
                                  ),
                                  onPressed: () => setState(() => _obscure = !_obscure),
                                ),
                              ),
                              validator: (v) => (v == null || v.isEmpty) ? context.tr('required') : null,
                            ),
                          ),
                          Align(
                            alignment: AlignmentDirectional.centerEnd,
                            child: TextButton(
                              onPressed: () => context.push('/forgot-password', extra: _email.text.trim()),
                              child: Text(context.tr('forgot_password')),
                            ),
                          ),
                          const SizedBox(height: 6),
                          LoadingButton(label: context.tr('login'), loading: _loading, onPressed: _submit),
                          if (ref.watch(demoModeProvider).value ?? false) ...[
                            const SizedBox(height: 14),
                            Center(
                              child: ActionChip(
                                avatar: const Icon(Icons.bolt_rounded, size: 16, color: AppColors.primary),
                                label: Text(context.tr('use_demo')),
                                labelStyle: const TextStyle(
                                  color: AppColors.primary,
                                  fontWeight: FontWeight.w600,
                                  fontSize: 12.5,
                                ),
                                backgroundColor: context.softGreen,
                                side: BorderSide.none,
                                shape: const StadiumBorder(),
                                onPressed: _fillDemo,
                              ),
                            ),
                          ],
                          const SizedBox(height: 18),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Text(context.tr('no_account'), style: TextStyle(color: context.mutedColor)),
                              TextButton(
                                onPressed: () => context.push('/register'),
                                child: Text(context.tr('create_account')),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
