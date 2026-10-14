import 'dart:async';

import 'package:firebase_auth/firebase_auth.dart' show FirebaseAuthException;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:pin_code_fields/pin_code_fields.dart';

import '../../core/errors.dart';
import '../../core/auth_service.dart';
import '../../core/config.dart';
import '../../core/l10n/app_localizations.dart';
import '../../core/theme.dart';
import '../../core/utils.dart';
import '../../models/models.dart';
import '../../providers/providers.dart';
import '../../repositories/repositories.dart';
import '../../widgets/common.dart';

final _loginCountriesProvider = FutureProvider.autoDispose<List<Country>>((ref) async {
  try {
    final list = await ref.watch(accountRepoProvider).countries();
    return list.isEmpty ? const [Country.india] : list;
  } catch (_) {
    return const [Country.india];
  }
});

class LoginScreen extends ConsumerStatefulWidget {
  /// `onboarding` (first run), `action` (pushed to gate an action) or a location to continue to.
  final String? from;
  const LoginScreen({super.key, this.from});
  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  bool _emailMode = false;
  bool _otpStep = false;
  bool _busy = false;
  Country _country = Country.india;
  final _phone = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _otp = PinInputController();
  String _otpValue = '';
  int _resendIn = 0;
  Timer? _timer;
  bool _obscure = true;
  PhoneVerification? _verification;
  bool _completing = false;

  @override
  void dispose() {
    _timer?.cancel();
    _phone.dispose();
    _email.dispose();
    _password.dispose();
    _otp.dispose();
    super.dispose();
  }

  void _startTimer() {
    _timer?.cancel();
    setState(() => _resendIn = 30);
    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) return t.cancel();
      setState(() => _resendIn--);
      if (_resendIn <= 0) t.cancel();
    });
  }

  AuthActions get _actions => ref.read(authActionsProvider);
  AuthService get _auth => ref.read(authServiceProvider);
  AccountRepository get _repo => ref.read(accountRepoProvider);

  /// Offline demo (USE_MOCK or API unreachable): mock login, no Firebase calls.
  bool get _mock => _actions.useMock;

  String get _phoneDigits => _phone.text.replaceAll(RegExp(r'\D'), '');

  void _showError(Object e) {
    if (!mounted) return;
    if (e is AppException) {
      showSnack(context, e.displayMessage, error: true);
      if (e.errors.containsKey('otp')) _otp.triggerError();
    } else if (e is FirebaseAuthException || e is AuthFailure) {
      showSnack(context, AuthService.message(e), error: true);
      if (e is FirebaseAuthException && e.code == 'invalid-verification-code') _otp.triggerError();
    } else {
      showSnack(context, '$e', error: true);
    }
  }

  Future<void> _run(Future<void> Function() op) async {
    setState(() => _busy = true);
    try {
      await op();
    } catch (e) {
      _showError(e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _sendOtp() async {
    final phone = _phoneDigits;
    if (phone.length < 6) {
      showSnack(context, context.tr('enter_valid_phone'), error: true);
      return;
    }
    await _run(() async {
      if (_mock) {
        await _repo.mockSendOtp(phone, _country.dialCode);
      } else {
        final v = await _auth.startPhoneSignIn(
          '${_country.dialCode}$phone',
          // forceResendingToken only when resending from the OTP step.
          resendToken: _otpStep ? _verification?.resendToken : null,
          onAutoSignIn: (_) => _run(_afterFirebaseSignIn), // Android SMS auto-retrieval
          onLateError: _showError,
        );
        if (v.autoSignedIn) return _afterFirebaseSignIn();
        _verification = v;
      }
      if (!mounted) return;
      setState(() => _otpStep = true);
      _startTimer();
    });
  }

  Future<void> _verifyOtp() async {
    if (_otpValue.length != 6 || _busy) return;
    await _run(() async {
      if (_mock) {
        final r = await _repo.mockVerifyOtp(_phoneDigits, _country.dialCode, _otpValue);
        await _completeMock(r);
        return;
      }
      final v = _verification;
      if (v == null) throw const AuthFailure('Please request a new OTP.');
      await _auth.confirmPhoneCode(v, _otpValue);
      await _afterFirebaseSignIn();
    });
  }

  Future<void> _emailLogin() async {
    final email = _email.text.trim();
    if (email.isEmpty || _password.text.isEmpty) {
      showSnack(context, context.tr('enter_email_password'), error: true);
      return;
    }
    await _run(() async {
      if (_mock) {
        await _completeMock(await _repo.mockLogin(email, _password.text));
        return;
      }
      // Migrated accounts already exist in Firebase Auth with their original (BCRYPT-imported) passwords.
      await _auth.signInWithEmail(email, _password.text);
      await _afterFirebaseSignIn(email: email);
    });
  }

  Future<void> _forgotPassword() async {
    final ctrl = TextEditingController(text: _email.text.trim());
    final email = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(ctx.tr('forgot_password')),
        content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(ctx.tr('reset_password_hint'), style: TextStyle(color: ctx.mutedText)),
          const SizedBox(height: 12),
          TextField(
            controller: ctrl,
            autofocus: true,
            keyboardType: TextInputType.emailAddress,
            decoration: InputDecoration(hintText: ctx.tr('email'), prefixIcon: const Icon(Icons.mail_outline_rounded)),
          ),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: Text(ctx.tr('cancel'))),
          TextButton(onPressed: () => Navigator.pop(ctx, ctrl.text.trim()), child: Text(ctx.tr('send_reset_link'))),
        ],
      ),
    );
    if (email == null || !mounted) return;
    if (!email.contains('@')) {
      showSnack(context, context.tr('enter_valid_email'), error: true);
      return;
    }
    if (_mock) {
      showSnack(context, context.tr('not_available_demo'), error: true);
      return;
    }
    await _run(() async {
      await _auth.sendPasswordReset(email);
      if (mounted) showSnack(context, context.tr('reset_link_sent', {'email': email}));
    });
  }

  Future<void> _completeMock(AuthResult r) async {
    await _actions.completeMockSignIn(r);
    await _finish(r.isNew);
  }

  /// After any successful Firebase sign-in → `mergeGuestCart` (if needed) + `syncProfile`.
  Future<AuthResult?> _firebaseSession({String? name, String? email, String? referralCode}) async {
    if (_completing) return null; // e.g. SMS auto-retrieval racing a manual "Verify"
    _completing = true;
    try {
      return await _actions.completeFirebaseSignIn(
        name: name,
        email: email,
        referralCode: referralCode,
      );
    } finally {
      _completing = false;
    }
  }

  Future<void> _afterFirebaseSignIn({String? email}) async {
    final r = await _firebaseSession(email: email);
    if (r != null) await _finish(r.isNew);
  }

  Future<void> _finish(bool askName) async {
    if (!mounted) return;
    if (askName) await _askName();
    if (!mounted) return;
    showSnack(context, context.tr('welcome_user', {'name': ref.read(sessionProvider).user?.name ?? ''}));
    _leave();
  }

  void _leave() {
    final from = widget.from;
    if (from == 'action' && context.canPop()) {
      context.pop(true);
    } else if (from != null && from.startsWith('/')) {
      context.go(from);
    } else {
      context.go('/home');
    }
  }

  Future<void> _askName() async {
    final ctrl = TextEditingController();
    final name = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      isDismissible: false,
      builder: (ctx) => Padding(
        padding: EdgeInsets.fromLTRB(20, 0, 20, MediaQuery.of(ctx).viewInsets.bottom + 20),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(ctx.tr('whats_your_name'), style: ctx.text.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: 14),
          TextField(
            controller: ctrl,
            autofocus: true,
            textCapitalization: TextCapitalization.words,
            decoration: InputDecoration(hintText: ctx.tr('full_name')),
          ),
          const SizedBox(height: 16),
          AppButton(label: ctx.tr('continue'), onPressed: () => Navigator.pop(ctx, ctrl.text.trim())),
        ]),
      ),
    );
    if (name != null && name.isNotEmpty) {
      try {
        final u = await ref.read(accountRepoProvider).updateProfile(name: name);
        ref.read(sessionProvider.notifier).updateUser(u);
      } catch (_) {}
    }
  }

  Future<void> _register() async {
    final name = TextEditingController();
    final email = TextEditingController();
    final pass = TextEditingController();
    final referral = TextEditingController();
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) {
        var busy = false;
        return StatefulBuilder(builder: (ctx, setSheet) {
          return Padding(
            padding: EdgeInsets.fromLTRB(20, 0, 20, MediaQuery.of(ctx).viewInsets.bottom + 20),
            child: SingleChildScrollView(
              child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(ctx.tr('create_account'), style: ctx.text.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
                const SizedBox(height: 14),
                TextField(controller: name, decoration: InputDecoration(hintText: ctx.tr('full_name'))),
                const SizedBox(height: 10),
                TextField(
                    controller: email,
                    keyboardType: TextInputType.emailAddress,
                    decoration: InputDecoration(hintText: ctx.tr('email'))),
                const SizedBox(height: 10),
                TextField(controller: pass, obscureText: true, decoration: InputDecoration(hintText: ctx.tr('password'))),
                const SizedBox(height: 10),
                TextField(controller: referral, decoration: InputDecoration(hintText: ctx.tr('referral_code_optional'))),
                const SizedBox(height: 16),
                AppButton(
                  label: ctx.tr('create_account'),
                  loading: busy,
                  onPressed: () async {
                    final n = name.text.trim(), e = email.text.trim(), r = referral.text.trim();
                    if (n.isEmpty || !e.contains('@')) {
                      showSnack(ctx, ctx.tr(n.isEmpty ? 'enter_name' : 'enter_valid_email'), error: true);
                      return;
                    }
                    if (pass.text.length < 6) {
                      showSnack(ctx, ctx.tr('password_min'), error: true);
                      return;
                    }
                    setSheet(() => busy = true);
                    try {
                      if (_mock) {
                        final res = await _repo.mockRegister(name: n, email: e, password: pass.text);
                        if (ctx.mounted) Navigator.pop(ctx);
                        await _completeMock(res);
                      } else {
                        await _auth.register(e, pass.text, n);
                        final res = await _firebaseSession(name: n, email: e, referralCode: r);
                        if (ctx.mounted) Navigator.pop(ctx);
                        if (res != null) await _finish(false);
                      }
                    } catch (err) {
                      if (ctx.mounted) {
                        showSnack(ctx, err is AppException ? err.displayMessage : AuthService.message(err), error: true);
                      }
                    } finally {
                      if (ctx.mounted) setSheet(() => busy = false);
                    }
                  },
                ),
              ]),
            ),
          );
        });
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final countries = ref.watch(_loginCountriesProvider).value ?? const [Country.india];
    final demo = AppConfig.useMock || (ref.watch(appSettingsProvider).value?.demoMode ?? false);
    final dark = context.isDark;

    return Scaffold(
      backgroundColor: dark ? AppColors.darkBg : Colors.white,
      body: Column(children: [
        Container(
          width: double.infinity,
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: AppColors.headerGradient(AppColors.quickGradient.first, dark: dark),
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
            ),
          ),
          child: SafeArea(
            bottom: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(8, 4, 8, 20),
              child: Column(children: [
                Row(children: [
                  if (context.canPop())
                    IconButton(
                      icon: const Icon(Icons.arrow_back_rounded),
                      onPressed: () => _otpStep ? setState(() => _otpStep = false) : context.pop(),
                    )
                  else if (_otpStep)
                    IconButton(icon: const Icon(Icons.arrow_back_rounded), onPressed: () => setState(() => _otpStep = false))
                  else
                    const SizedBox(width: 48),
                  const Spacer(),
                  TextButton(onPressed: () => context.go('/home'), child: Text(context.tr('skip'))),
                ]),
                const BrandLogo(height: 44),
                const SizedBox(height: 10),
                Text(context.tr('login_tagline'),
                    style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                const SizedBox(height: 14),
                const Text('🛒  🥛  🍎  ⚡', style: TextStyle(fontSize: 34)),
              ]),
            ),
          ),
        ),
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
            child: AnimatedSwitcher(
              duration: const Duration(milliseconds: 250),
              child: _otpStep ? _otpView(demo) : _formView(countries),
            ),
          ),
        ),
      ]),
    );
  }

  Widget _formView(List<Country> countries) {
    return Column(key: const ValueKey('form'), crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Text(context.tr('login_or_signup'),
          textAlign: TextAlign.center, style: context.text.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
      const SizedBox(height: 16),
      Container(
        padding: const EdgeInsets.all(4),
        decoration: BoxDecoration(color: context.isDark ? AppColors.darkSurface : const Color(0xFFF2F4F7), borderRadius: BorderRadius.circular(12)),
        child: Row(children: [
          for (final (i, label) in [context.tr('phone'), context.tr('email')].indexed)
            Expanded(
              child: GestureDetector(
                onTap: () => setState(() => _emailMode = i == 1),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  padding: const EdgeInsets.symmetric(vertical: 10),
                  decoration: BoxDecoration(
                    color: (_emailMode == (i == 1)) ? context.cardColor : Colors.transparent,
                    borderRadius: BorderRadius.circular(10),
                    boxShadow: (_emailMode == (i == 1)) ? AppShadows.soft : null,
                  ),
                  alignment: Alignment.center,
                  child: Text(label, style: const TextStyle(fontWeight: FontWeight.w700)),
                ),
              ),
            ),
        ]),
      ),
      const SizedBox(height: 18),
      if (!_emailMode) ...[
        Row(children: [
          Container(
            height: 52,
            padding: const EdgeInsets.symmetric(horizontal: 8),
            decoration: BoxDecoration(
              border: Border.all(color: context.borderColor),
              borderRadius: BorderRadius.circular(AppRadius.button),
              color: context.cardColor,
            ),
            child: DropdownButtonHideUnderline(
              child: DropdownButton<Country>(
                value: countries.where((c) => c.dialCode == _country.dialCode && c.iso2 == _country.iso2).firstOrNull ??
                    countries.first,
                items: [
                  for (final c in countries)
                    DropdownMenuItem(value: c, child: Text('${c.flag} ${c.dialCode}', style: const TextStyle(fontWeight: FontWeight.w600))),
                ],
                onChanged: (c) => setState(() => _country = c ?? _country),
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: TextField(
              controller: _phone,
              keyboardType: TextInputType.phone,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(12)],
              decoration: InputDecoration(hintText: context.tr('enter_mobile_number')),
              onSubmitted: (_) => _sendOtp(),
            ),
          ),
        ]),
        const SizedBox(height: 16),
        AppButton(label: context.tr('continue'), loading: _busy, onPressed: _sendOtp),
      ] else ...[
        TextField(
          controller: _email,
          keyboardType: TextInputType.emailAddress,
          decoration: InputDecoration(hintText: context.tr('email'), prefixIcon: const Icon(Icons.mail_outline_rounded)),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _password,
          obscureText: _obscure,
          decoration: InputDecoration(
            hintText: context.tr('password'),
            prefixIcon: const Icon(Icons.lock_outline_rounded),
            suffixIcon: IconButton(
              icon: Icon(_obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined),
              onPressed: () => setState(() => _obscure = !_obscure),
            ),
          ),
          onSubmitted: (_) => _emailLogin(),
        ),
        Align(
          alignment: AlignmentDirectional.centerEnd,
          child: TextButton(onPressed: _busy ? null : _forgotPassword, child: Text(context.tr('forgot_password'))),
        ),
        const SizedBox(height: 4),
        AppButton(label: context.tr('login'), loading: _busy, onPressed: _emailLogin),
        const SizedBox(height: 8),
        TextButton(onPressed: _register, child: Text(context.tr('new_here_create_account'))),
      ],
      const SizedBox(height: 18),
      Text(context.tr('terms_agree'),
          textAlign: TextAlign.center, style: context.text.bodySmall?.copyWith(color: context.mutedText)),
      if (AppConfig.useMock || (ref.watch(appSettingsProvider).value?.demoMode ?? false)) ...[
        const SizedBox(height: 14),
        Text(
          'Demo: +91 9876543210 · OTP 123456\ncustomer@gmail.com / 123456',
          textAlign: TextAlign.center,
          style: context.text.bodySmall?.copyWith(color: AppColors.primary, fontWeight: FontWeight.w600),
        ),
      ],
    ]);
  }

  Widget _otpView(bool demo) {
    return Column(key: const ValueKey('otp'), crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Text(context.tr('verify_otp'),
          textAlign: TextAlign.center, style: context.text.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
      const SizedBox(height: 6),
      Text(context.tr('otp_sent_to', {'phone': '${_country.dialCode} ${_phone.text}'}),
          textAlign: TextAlign.center, style: context.text.bodyMedium?.copyWith(color: context.mutedText)),
      const SizedBox(height: 22),
      Center(
        child: MaterialPinField(
          length: 6,
          pinController: _otp,
          autoFocus: true,
          keyboardType: TextInputType.number,
          theme: MaterialPinTheme(
            shape: MaterialPinShape.outlined,
            cellSize: const Size(46, 54),
            spacing: 8,
            borderRadius: BorderRadius.circular(10),
            borderColor: context.borderColor,
            focusedBorderColor: AppColors.primary,
            filledBorderColor: AppColors.primary,
            fillColor: context.cardColor,
            textStyle: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
          ),
          onChanged: (v) => _otpValue = v,
          onCompleted: (v) {
            _otpValue = v;
            _verifyOtp();
          },
        ),
      ),
      if (demo) ...[
        const SizedBox(height: 12),
        Text(context.tr('demo_otp_hint', {'otp': AppConfig.demoOtp}),
            textAlign: TextAlign.center, style: const TextStyle(color: AppColors.primary, fontWeight: FontWeight.w700)),
      ],
      const SizedBox(height: 22),
      AppButton(label: context.tr('verify'), loading: _busy, onPressed: _verifyOtp),
      const SizedBox(height: 10),
      Center(
        child: _resendIn > 0
            ? Text(context.tr('resend_in', {'s': _resendIn}), style: TextStyle(color: context.mutedText))
            : TextButton(onPressed: _busy ? null : _sendOtp, child: Text(context.tr('resend_otp'))),
      ),
    ]);
  }
}
