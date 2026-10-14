import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/errors.dart';
import '../../core/auth_service.dart';
import '../../core/config.dart';
import '../../core/l10n/app_localizations.dart';
import '../../core/theme.dart';
import '../../core/utils.dart';
import '../../providers/providers.dart';
import '../../widgets/common.dart';

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  Future<void> _editProfile(BuildContext context, WidgetRef ref) async {
    final user = ref.read(sessionProvider).user;
    if (user == null) return;
    final name = TextEditingController(text: user.name);
    final email = TextEditingController(text: user.email);
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) {
        var busy = false;
        return StatefulBuilder(
          builder: (ctx, set) => Padding(
            padding: EdgeInsets.fromLTRB(20, 0, 20, MediaQuery.of(ctx).viewInsets.bottom + 20),
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(ctx.tr('edit_profile'), style: ctx.text.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
              const SizedBox(height: 14),
              TextField(controller: name, decoration: InputDecoration(labelText: ctx.tr('full_name'))),
              const SizedBox(height: 10),
              TextField(
                controller: email,
                keyboardType: TextInputType.emailAddress,
                decoration: InputDecoration(labelText: ctx.tr('email')),
              ),
              const SizedBox(height: 16),
              AppButton(
                label: ctx.tr('save'),
                loading: busy,
                onPressed: () async {
                  set(() => busy = true);
                  try {
                    final u = await ref.read(accountRepoProvider).updateProfile(name: name.text.trim(), email: email.text.trim());
                    ref.read(sessionProvider.notifier).updateUser(u);
                    if (ctx.mounted) Navigator.pop(ctx);
                  } on AppException catch (e) {
                    if (ctx.mounted) showSnack(ctx, e.displayMessage, error: true);
                  } finally {
                    if (ctx.mounted) set(() => busy = false);
                  }
                },
              ),
            ]),
          ),
        );
      },
    );
  }

  /// Email/password users only: re-authenticate with the current password, then Firebase `updatePassword`.
  Future<void> _changePassword(BuildContext context, WidgetRef ref) async {
    final current = TextEditingController();
    final next = TextEditingController();
    final confirm = TextEditingController();
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) {
        var busy = false;
        return StatefulBuilder(
          builder: (ctx, set) => Padding(
            padding: EdgeInsets.fromLTRB(20, 0, 20, MediaQuery.of(ctx).viewInsets.bottom + 20),
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(ctx.tr('change_password'), style: ctx.text.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
              const SizedBox(height: 14),
              TextField(controller: current, obscureText: true, decoration: InputDecoration(labelText: ctx.tr('current_password'))),
              const SizedBox(height: 10),
              TextField(controller: next, obscureText: true, decoration: InputDecoration(labelText: ctx.tr('new_password'))),
              const SizedBox(height: 10),
              TextField(controller: confirm, obscureText: true, decoration: InputDecoration(labelText: ctx.tr('confirm_password'))),
              const SizedBox(height: 16),
              AppButton(
                label: ctx.tr('save'),
                loading: busy,
                onPressed: () async {
                  if (next.text.length < 6) return showSnack(ctx, ctx.tr('password_min'), error: true);
                  if (next.text != confirm.text) return showSnack(ctx, ctx.tr('passwords_dont_match'), error: true);
                  set(() => busy = true);
                  try {
                    await ref.read(authServiceProvider).changePassword(current.text, next.text);
                    if (ctx.mounted) {
                      Navigator.pop(ctx);
                      showSnack(context, ctx.tr('password_changed'));
                    }
                  } catch (e) {
                    if (ctx.mounted) showSnack(ctx, AuthService.message(e), error: true);
                  } finally {
                    if (ctx.mounted) set(() => busy = false);
                  }
                },
              ),
            ]),
          ),
        );
      },
    );
  }

  Future<void> _changeAvatar(BuildContext context, WidgetRef ref) async {
    try {
      final file = await ImagePicker().pickImage(source: ImageSource.gallery, imageQuality: 75, maxWidth: 600);
      if (file == null) return;
      final u = await ref.read(accountRepoProvider).updateProfile(avatar: file);
      ref.read(sessionProvider.notifier).updateUser(u);
      if (context.mounted) showSnack(context, context.tr('profile_updated'));
    } catch (e) {
      if (context.mounted) showSnack(context, '$e', error: true);
    }
  }

  Future<void> _language(BuildContext context, WidgetRef ref) async {
    final current = ref.read(sessionProvider).locale;
    final code = await showModalBottomSheet<String>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Text(ctx.tr('language'), style: ctx.text.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          for (final e in AppLocalizations.languages.entries)
            ListTile(
              title: Text(e.value, style: const TextStyle(fontWeight: FontWeight.w600)),
              subtitle: Text(e.key.toUpperCase()),
              trailing: e.key == current ? const Icon(Icons.check_circle_rounded, color: AppColors.primary) : null,
              onTap: () => Navigator.pop(ctx, e.key),
            ),
          const SizedBox(height: 8),
        ]),
      ),
    );
    if (code != null) ref.read(sessionProvider.notifier).setLocale(code);
  }

  Future<void> _theme(BuildContext context, WidgetRef ref) async {
    final current = ref.read(sessionProvider).themeMode;
    final mode = await showModalBottomSheet<ThemeMode>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Text(ctx.tr('theme'), style: ctx.text.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          for (final (m, icon) in [
            (ThemeMode.system, Icons.brightness_auto_outlined),
            (ThemeMode.light, Icons.light_mode_outlined),
            (ThemeMode.dark, Icons.dark_mode_outlined),
          ])
            ListTile(
              leading: Icon(icon),
              title: Text(ctx.tr('theme_${m.name}')),
              trailing: m == current ? const Icon(Icons.check_circle_rounded, color: AppColors.primary) : null,
              onTap: () => Navigator.pop(ctx, m),
            ),
          const SizedBox(height: 8),
        ]),
      ),
    );
    if (mode != null) ref.read(sessionProvider.notifier).setThemeMode(mode);
  }

  Future<void> _logout(BuildContext context, WidgetRef ref, {bool delete = false}) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(ctx.tr(delete ? 'delete_account' : 'logout')),
        content: Text(ctx.tr(delete ? 'delete_account_confirm' : 'logout_confirm')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(ctx.tr('cancel'))),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(ctx.tr(delete ? 'delete' : 'logout'), style: const TextStyle(color: AppColors.danger)),
          ),
        ],
      ),
    );
    if (ok != true) return;
    if (delete) {
      // DELETE /profile (backend also removes the Firebase user), then Firebase signOut().
      try {
        await ref.read(authActionsProvider).deleteAccount();
      } on AppException catch (e) {
        if (context.mounted) showSnack(context, e.displayMessage, error: true);
        return;
      }
    } else {
      await ref.read(authActionsProvider).logout(); // drops the FCM token, Firebase signOut() → new guest session
    }
    ref.read(appliedPromoProvider.notifier).state = null;
    if (context.mounted) showSnack(context, context.tr(delete ? 'account_deleted' : 'logged_out'));
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = ref.watch(sessionProvider);
    final user = s.user;
    final settings = ref.watch(appSettingsProvider).value;

    Widget item(IconData icon, String key, {VoidCallback? onTap, String? trailing, Color? color}) => ListTile(
          leading: Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: (color ?? AppColors.primary).withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, color: color ?? AppColors.primary, size: 20),
          ),
          title: Text(context.tr(key), style: TextStyle(fontWeight: FontWeight.w600, color: color)),
          trailing: Row(mainAxisSize: MainAxisSize.min, children: [
            if (trailing != null) Text(trailing, style: TextStyle(color: context.mutedText, fontSize: 12.5)),
            Icon(Icons.chevron_right_rounded, color: context.mutedText),
          ]),
          onTap: onTap,
        );

    Widget group(String title, List<Widget> children) => Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 14),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Padding(
              padding: const EdgeInsets.only(left: 4, bottom: 6),
              child: Text(title.toUpperCase(),
                  style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w800, color: context.mutedText, letterSpacing: .6)),
            ),
            AppCard(padding: const EdgeInsets.symmetric(vertical: 4), child: Column(children: children)),
          ]),
        );

    return Scaffold(
      appBar: AppBar(title: Text(context.tr('profile')), centerTitle: false),
      body: ListView(padding: const EdgeInsets.only(bottom: 30), children: [
        Padding(
          padding: const EdgeInsets.all(16),
          child: Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              gradient: LinearGradient(colors: AppColors.headerGradient(AppColors.quickGradient.first, dark: context.isDark)),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: context.borderColor),
            ),
            child: user == null
                ? Row(children: [
                    const CircleAvatar(radius: 30, backgroundColor: Colors.white, child: Icon(Icons.person_outline_rounded, size: 32, color: AppColors.primary)),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(context.tr('welcome_guest'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 17)),
                        Text(context.tr('login_for_orders'), style: TextStyle(fontSize: 12.5, color: context.mutedText)),
                      ]),
                    ),
                    AppButton(label: context.tr('login'), expand: false, height: 40, onPressed: () => context.push('/login?from=action')),
                  ])
                : Row(children: [
                    GestureDetector(
                      onTap: () => _changeAvatar(context, ref),
                      child: Stack(children: [
                        CircleAvatar(
                          radius: 32,
                          backgroundColor: AppColors.primary,
                          child: user.avatar.isNotEmpty
                              ? ClipOval(child: AppImage(url: user.avatar, name: user.name, width: 64, height: 64))
                              : Text(user.initials, style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w800)),
                        ),
                        Positioned(
                          right: 0,
                          bottom: 0,
                          child: Container(
                            padding: const EdgeInsets.all(4),
                            decoration: BoxDecoration(color: context.cardColor, shape: BoxShape.circle),
                            child: const Icon(Icons.camera_alt_rounded, size: 14, color: AppColors.primary),
                          ),
                        ),
                      ]),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(user.name, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
                        if (user.phone.isNotEmpty)
                          Text(user.displayPhone, textDirection: TextDirection.ltr, style: TextStyle(color: context.mutedText)),
                        if (user.email.isNotEmpty) Text(user.email, style: TextStyle(color: context.mutedText, fontSize: 12.5)),
                      ]),
                    ),
                    IconButton(
                      onPressed: () => _editProfile(context, ref),
                      tooltip: context.tr('edit_profile'),
                      icon: const Icon(Icons.edit_outlined),
                    ),
                  ]),
          ),
        ),
        if (user != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            child: Row(children: [
              _QuickTile(icon: Icons.receipt_long_outlined, label: context.tr('orders'), onTap: () => context.push('/orders')),
              const SizedBox(width: 10),
              _QuickTile(
                icon: Icons.account_balance_wallet_outlined,
                label: Fmt.money(user.walletBalance),
                onTap: () => context.push('/wallet'),
              ),
              const SizedBox(width: 10),
              _QuickTile(icon: Icons.headset_mic_outlined, label: context.tr('support'), onTap: () => context.push('/support')),
            ]),
          ),
        group(context.tr('your_account'), [
          item(Icons.receipt_long_outlined, 'my_orders', onTap: () => context.push('/orders')),
          item(Icons.account_balance_wallet_outlined, 'wallet', onTap: () => context.push('/wallet')),
          item(Icons.card_giftcard_outlined, 'refer_earn', onTap: () => context.push('/refer')),
          item(Icons.location_on_outlined, 'my_addresses', onTap: () => context.push('/addresses')),
          item(Icons.favorite_border_rounded, 'favourites', onTap: () => context.go('/favourites')),
          item(Icons.notifications_none_rounded, 'notifications', onTap: () => context.push('/notifications')),
        ]),
        group(context.tr('settings'), [
          item(Icons.translate_rounded, 'language',
              trailing: AppLocalizations.languages[s.locale], onTap: () => _language(context, ref)),
          item(Icons.dark_mode_outlined, 'theme', trailing: context.tr('theme_${s.themeMode.name}'), onTap: () => _theme(context, ref)),
          item(Icons.place_outlined, 'delivery_location', trailing: s.zoneName, onTap: () => context.push('/location?from=app')),
        ]),
        group(context.tr('help_info'), [
          item(Icons.headset_mic_outlined, 'support', onTap: () => context.push('/support')),
          item(Icons.call_outlined, 'call_us', onTap: () => launchUrl(Uri(scheme: 'tel', path: (settings?.supportPhone.isNotEmpty == true ? settings!.supportPhone : AppConfig.supportPhone).replaceAll(' ', '')))),
          item(Icons.article_outlined, 'blog', onTap: () => context.push('/blog')),
          item(Icons.help_outline_rounded, 'faq', onTap: () => context.push('/faq')),
          item(Icons.info_outline_rounded, 'about_us', onTap: () => context.push('/page/about')),
          item(Icons.privacy_tip_outlined, 'privacy_policy', onTap: () => context.push('/page/privacy')),
          item(Icons.description_outlined, 'terms', onTap: () => context.push('/page/terms')),
        ]),
        if (user != null)
          group(context.tr('account_actions'), [
            // Phone-only users have no password; mock sessions have no Firebase user.
            if (!s.isMockSession &&
                (ref.watch(firebaseUserProvider).value?.providerData.any((p) => p.providerId == 'password') ?? false))
              item(Icons.lock_reset_rounded, 'change_password', onTap: () => _changePassword(context, ref)),
            item(Icons.logout_rounded, 'logout', color: AppColors.danger, onTap: () => _logout(context, ref)),
            item(Icons.delete_outline_rounded, 'delete_account', color: AppColors.danger, onTap: () => _logout(context, ref, delete: true)),
          ]),
        Center(
          child: Column(children: [
            const BrandLogo(height: 26),
            const SizedBox(height: 6),
            Text('v1.0.0 · ${AppConfig.useMock ? context.tr('demo_data') : AppConfig.backendLabel}',
                style: TextStyle(fontSize: 11, color: context.mutedText)),
          ]),
        ),
      ]),
    );
  }
}

class _QuickTile extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  const _QuickTile({required this.icon, required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: AppCard(
        onTap: onTap,
        padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 8),
        child: Column(children: [
          Icon(icon, color: AppColors.primary),
          const SizedBox(height: 6),
          Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5)),
        ]),
      ),
    );
  }
}
