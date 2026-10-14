import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/config.dart';
import '../../core/format.dart';
import '../../core/l10n.dart';
import '../../core/launcher.dart';
import '../../core/theme.dart';
import '../../models/models.dart';
import '../../providers/auth_provider.dart';
import '../../providers/core_providers.dart';
import '../../widgets/common.dart';

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final p = ref.watch(profileProvider);
    final locale = ref.watch(localeProvider);
    final theme = ref.watch(themeModeProvider);
    if (p == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    return Scaffold(
      appBar: AppBar(title: Text(context.tr('profile'))),
      body: RefreshIndicator(
        color: AppColors.primary,
        onRefresh: () => ref.read(authProvider.notifier).refreshProfile(),
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
          children: [
            const DemoBanner(),
            _HeaderCard(p: p),
            const SizedBox(height: 16),
            _Section(
              title: context.tr('personal_details'),
              icon: Icons.person_outline_rounded,
              rows: [
                (context.tr('email'), p.email),
                (
                  context.tr('phone'),
                  p.phone == null ? '-' : '${p.countryCode} ${p.phone}',
                ),
                (
                  context.tr('date_of_birth'),
                  p.dob == null ? '-' : Fmt.date(p.dob),
                ),
                (
                  context.tr('zone'),
                  [p.zone, p.country].whereType<String>().join(', '),
                ),
                (context.tr('address'), p.address ?? '-'),
              ],
            ),
            const SizedBox(height: 12),
            _Section(
              title: context.tr('vehicle_details'),
              icon: Icons.two_wheeler_rounded,
              rows: [
                (context.tr('vehicle_type'), p.vehicleType ?? '-'),
                (context.tr('vehicle_number'), p.vehicleNumber ?? '-'),
              ],
            ),
            const SizedBox(height: 12),
            AppCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _SectionHead(
                    title: context.tr('documents'),
                    icon: Icons.badge_outlined,
                  ),
                  Row(
                    children: [
                      Expanded(
                        child: _DocTile(
                          label: context.tr('driving_license'),
                          url: p.drivingLicense,
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: _DocTile(
                          label: context.tr('id_proof'),
                          url: p.idProof,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            _Section(
              title: context.tr('bank_details'),
              icon: Icons.account_balance_outlined,
              rows: [
                (context.tr('bank_name'), p.bankName ?? '-'),
                (context.tr('account_number'), Fmt.maskAccount(p.bankAccount)),
                (context.tr('ifsc'), p.ifsc ?? '-'),
              ],
            ),
            const SizedBox(height: 12),
            AppCard(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Column(
                children: [
                  _NavTile(
                    icon: Icons.translate_rounded,
                    label: context.tr('language'),
                    value: AppLocalizations.languageNames[locale.languageCode],
                    onTap: () => _languageSheet(context, ref),
                  ),
                  _NavTile(
                    icon: Icons.dark_mode_outlined,
                    label: context.tr('theme'),
                    value: context.tr(
                      'theme_${theme == ThemeMode.system ? 'system' : theme.name}',
                    ),
                    onTap: () => _themeSheet(context, ref),
                  ),
                  _NavTile(
                    icon: Icons.insights_rounded,
                    label: context.tr('earnings'),
                    onTap: () => context.push('/earnings'),
                  ),
                  _NavTile(
                    icon: Icons.payments_outlined,
                    label: context.tr('cash_collection'),
                    onTap: () => context.push('/cash'),
                  ),
                  _NavTile(
                    icon: Icons.assignment_return_outlined,
                    label: context.tr('return_pickups'),
                    onTap: () => context.push('/returns'),
                  ),
                  _NavTile(
                    icon: Icons.notifications_none_rounded,
                    label: context.tr('notifications'),
                    onTap: () => context.push('/notifications'),
                  ),
                  _NavTile(
                    icon: Icons.help_outline_rounded,
                    label: context.tr('help_support'),
                    onTap: () => _helpSheet(context),
                  ),
                  _NavTile(
                    icon: Icons.lock_outline_rounded,
                    label: context.tr('change_password'),
                    onTap: () => showModalBottomSheet<void>(
                      context: context,
                      isScrollControlled: true,
                      builder: (_) => const _ChangePasswordSheet(),
                    ),
                  ),
                  _NavTile(
                    icon: Icons.logout_rounded,
                    label: context.tr('logout'),
                    color: AppColors.danger,
                    showChevron: false,
                    onTap: () async {
                      if (await confirmDialog(
                        context,
                        context.tr('logout_confirm'),
                        confirmLabel: context.tr('logout'),
                        danger: true,
                      )) {
                        await ref.read(authProvider.notifier).logout();
                      }
                    },
                  ),
                  _NavTile(
                    icon: Icons.delete_forever_outlined,
                    label: context.tr('delete_account'),
                    color: AppColors.danger,
                    showChevron: false,
                    onTap: () async {
                      if (!await confirmDialog(
                        context,
                        context.tr('delete_account_confirm'),
                        confirmLabel: context.tr('delete_account'),
                        danger: true,
                      )) {
                        return;
                      }
                      try {
                        await ref.read(authProvider.notifier).deleteAccount();
                      } catch (e) {
                        if (context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(
                              content: Text(
                                e.toString().replaceFirst('Exception: ', ''),
                              ),
                            ),
                          );
                        }
                      }
                    },
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            Center(
              child: Text(
                '${AppConfig.appName} · v1.0.0',
                style: TextStyle(fontSize: 12, color: context.mutedColor),
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _languageSheet(BuildContext context, WidgetRef ref) {
    final current = ref.read(localeProvider).languageCode;
    showModalBottomSheet<void>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (final e in AppLocalizations.languageNames.entries)
              ListTile(
                title: Text(e.value),
                subtitle: Text(e.key.toUpperCase()),
                trailing: current == e.key
                    ? const Icon(
                        Icons.check_circle_rounded,
                        color: AppColors.primary,
                      )
                    : null,
                onTap: () {
                  ref.read(localeProvider.notifier).set(e.key);
                  Navigator.pop(ctx);
                },
              ),
          ],
        ),
      ),
    );
  }

  void _themeSheet(BuildContext context, WidgetRef ref) {
    final current = ref.read(themeModeProvider);
    showModalBottomSheet<void>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (final (mode, icon) in [
              (ThemeMode.system, Icons.brightness_auto_outlined),
              (ThemeMode.light, Icons.light_mode_outlined),
              (ThemeMode.dark, Icons.dark_mode_outlined),
            ])
              ListTile(
                leading: Icon(icon),
                title: Text(
                  ctx.tr(
                    'theme_${mode == ThemeMode.system ? 'system' : mode.name}',
                  ),
                ),
                trailing: current == mode
                    ? const Icon(
                        Icons.check_circle_rounded,
                        color: AppColors.primary,
                      )
                    : null,
                onTap: () {
                  ref.read(themeModeProvider.notifier).set(mode);
                  Navigator.pop(ctx);
                },
              ),
          ],
        ),
      ),
    );
  }

  void _helpSheet(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const IconTile(
                icon: Icons.support_agent_rounded,
                size: 38,
              ),
              title: Text(ctx.tr('chat_support')),
              onTap: () {
                Navigator.pop(ctx);
                context.push('/support');
              },
            ),
            ListTile(
              leading: const IconTile(
                icon: Icons.call_outlined,
                size: 38,
                color: AppColors.info,
              ),
              title: Text(ctx.tr('call_support')),
              subtitle: const Text(AppConfig.supportPhone),
              onTap: () => Launcher.call(ctx, AppConfig.supportPhone),
            ),
            ListTile(
              leading: const IconTile(
                icon: Icons.mail_outline_rounded,
                size: 38,
                color: AppColors.purple,
              ),
              title: Text(ctx.tr('email_support')),
              subtitle: const Text(AppConfig.supportEmail),
              onTap: () => Launcher.email(ctx, AppConfig.supportEmail),
            ),
          ],
        ),
      ),
    );
  }
}

class _HeaderCard extends ConsumerWidget {
  const _HeaderCard({required this.p});
  final DeliveryProfile p;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [AppColors.primary, AppColors.primaryDark],
        ),
        borderRadius: BorderRadius.circular(AppRadius.card),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(3),
            decoration: const BoxDecoration(
              color: Colors.white,
              shape: BoxShape.circle,
            ),
            child: CircleAvatar(
              radius: 32,
              backgroundColor: AppColors.primary50,
              backgroundImage: p.avatar == null
                  ? null
                  : NetworkImage(p.avatar!),
              child: p.avatar == null
                  ? Text(
                      p.initials,
                      style: const TextStyle(
                        color: AppColors.primary,
                        fontSize: 22,
                        fontWeight: FontWeight.w800,
                      ),
                    )
                  : null,
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  p.name,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                Text(
                  p.email,
                  style: TextStyle(
                    color: Colors.white.withValues(alpha: 0.85),
                    fontSize: 12.5,
                  ),
                ),
                const SizedBox(height: 6),
                Row(
                  children: [
                    const Icon(
                      Icons.star_rounded,
                      color: Color(0xFFFDE047),
                      size: 16,
                    ),
                    const SizedBox(width: 3),
                    Text(
                      p.rating.toStringAsFixed(1),
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 2,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.2),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(
                            Icons.verified_rounded,
                            color: Colors.white,
                            size: 13,
                          ),
                          const SizedBox(width: 3),
                          Text(
                            context.tr('verified'),
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          IconButton(
            tooltip: context.tr('edit_profile'),
            onPressed: () => showModalBottomSheet<void>(
              context: context,
              isScrollControlled: true,
              builder: (_) => _EditProfileSheet(p: p),
            ),
            icon: const Icon(Icons.edit_outlined, color: Colors.white),
          ),
        ],
      ),
    );
  }
}

class _SectionHead extends StatelessWidget {
  const _SectionHead({required this.title, required this.icon});
  final String title;
  final IconData icon;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 10),
    child: Row(
      children: [
        Icon(icon, size: 18, color: AppColors.primary),
        const SizedBox(width: 8),
        Text(
          title,
          style: TextStyle(
            fontWeight: FontWeight.w800,
            color: context.textColor,
          ),
        ),
      ],
    ),
  );
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.icon, required this.rows});
  final String title;
  final IconData icon;
  final List<(String, String)> rows;

  @override
  Widget build(BuildContext context) => AppCard(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _SectionHead(title: title, icon: icon),
        for (final (l, v) in rows)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 5),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SizedBox(
                  width: 120,
                  child: Text(
                    l,
                    style: TextStyle(color: context.mutedColor, fontSize: 13),
                  ),
                ),
                Expanded(
                  child: Text(
                    v.isEmpty ? '-' : v,
                    style: TextStyle(
                      color: context.textColor,
                      fontWeight: FontWeight.w600,
                      fontSize: 13,
                    ),
                  ),
                ),
              ],
            ),
          ),
      ],
    ),
  );
}

class _DocTile extends StatelessWidget {
  const _DocTile({required this.label, this.url});
  final String label;
  final String? url;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(10),
    decoration: BoxDecoration(
      border: Border.all(color: context.borderColor),
      borderRadius: BorderRadius.circular(10),
    ),
    child: Row(
      children: [
        // Storage paths (delivery_docs/…) and PDFs cannot be shown as an image – icon placeholder.
        AppNetworkImage(
          url != null &&
                  url!.startsWith('http') &&
                  !url!.toLowerCase().contains('.pdf')
              ? url
              : null,
          size: 40,
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: context.textColor,
                ),
              ),
              const SizedBox(height: 2),
              StatusPill(
                url == null ? 'pending' : 'approved',
                label: url == null ? null : context.tr('verified'),
              ),
            ],
          ),
        ),
      ],
    ),
  );
}

class _NavTile extends StatelessWidget {
  const _NavTile({
    required this.icon,
    required this.label,
    this.value,
    this.onTap,
    this.color,
    this.showChevron = true,
  });
  final IconData icon;
  final String label;
  final String? value;
  final VoidCallback? onTap;
  final Color? color;
  final bool showChevron;

  @override
  Widget build(BuildContext context) => ListTile(
    onTap: onTap,
    leading: Icon(icon, color: color ?? context.bodyColor),
    title: Text(
      label,
      style: TextStyle(
        fontWeight: FontWeight.w600,
        color: color ?? context.textColor,
        fontSize: 14,
      ),
    ),
    trailing: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (value != null)
          Text(
            value!,
            style: TextStyle(color: context.mutedColor, fontSize: 13),
          ),
        if (showChevron)
          Icon(Icons.chevron_right_rounded, color: context.mutedColor),
      ],
    ),
  );
}

class _EditProfileSheet extends ConsumerStatefulWidget {
  const _EditProfileSheet({required this.p});
  final DeliveryProfile p;

  @override
  ConsumerState<_EditProfileSheet> createState() => _EditProfileSheetState();
}

class _EditProfileSheetState extends ConsumerState<_EditProfileSheet> {
  late final _name = TextEditingController(text: widget.p.name);
  late final _phone = TextEditingController(text: widget.p.phone);
  late final _address = TextEditingController(text: widget.p.address);
  late final _vehicleNo = TextEditingController(text: widget.p.vehicleNumber);
  bool _saving = false;

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    _address.dispose();
    _vehicleNo.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      await ref.read(authProvider.notifier).updateProfile({
        'name': _name.text.trim(),
        'address': _address.text.trim(),
        'vehicle_number': _vehicleNo.text.trim(),
      });
      if (mounted) {
        Navigator.pop(context);
        showSnack(context, context.tr('saved'));
      }
    } catch (e) {
      if (mounted) showSnack(context, errorText(e), error: true);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) => Padding(
    padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
    child: SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              context.tr('edit_profile'),
              style: TextStyle(
                fontSize: 19,
                fontWeight: FontWeight.w800,
                color: context.textColor,
              ),
            ),
            const SizedBox(height: 16),
            LabeledField(
              label: context.tr('full_name'),
              child: TextField(controller: _name),
            ),
            // Firestore rules let the rider change only the name; phone / address / vehicle are managed by the admin panel.
            LabeledField(
              label: context.tr('mobile_number'),
              child: TextField(controller: _phone, enabled: false),
            ),
            LabeledField(
              label: context.tr('address'),
              child: TextField(
                controller: _address,
                maxLines: 2,
                enabled: DemoMode.isOn,
              ),
            ),
            LabeledField(
              label: context.tr('vehicle_number'),
              child: TextField(controller: _vehicleNo, enabled: DemoMode.isOn),
            ),
            LoadingButton(
              label: context.tr('save'),
              loading: _saving,
              onPressed: _save,
            ),
          ],
        ),
      ),
    ),
  );
}

/// Firebase Authentication: re-authenticate with the current password, then `updatePassword`.
class _ChangePasswordSheet extends ConsumerStatefulWidget {
  const _ChangePasswordSheet();

  @override
  ConsumerState<_ChangePasswordSheet> createState() =>
      _ChangePasswordSheetState();
}

class _ChangePasswordSheetState extends ConsumerState<_ChangePasswordSheet> {
  final _form = GlobalKey<FormState>();
  final _current = TextEditingController();
  final _new = TextEditingController();
  final _confirm = TextEditingController();
  bool _obscure = true;
  bool _saving = false;

  @override
  void dispose() {
    _current.dispose();
    _new.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    setState(() => _saving = true);
    try {
      await ref
          .read(authProvider.notifier)
          .changePassword(_current.text, _new.text);
      if (mounted) {
        Navigator.pop(context);
        showSnack(context, context.tr('password_changed'));
      }
    } catch (e) {
      if (mounted) showSnack(context, errorText(e), error: true);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final toggle = IconButton(
      icon: Icon(
        _obscure ? Icons.visibility_off_outlined : Icons.visibility_outlined,
        size: 20,
      ),
      onPressed: () => setState(() => _obscure = !_obscure),
    );
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
                Text(
                  context.tr('change_password'),
                  style: TextStyle(
                    fontSize: 19,
                    fontWeight: FontWeight.w800,
                    color: context.textColor,
                  ),
                ),
                const SizedBox(height: 16),
                LabeledField(
                  label: context.tr('current_password'),
                  required: true,
                  child: TextFormField(
                    controller: _current,
                    obscureText: _obscure,
                    autofillHints: const [AutofillHints.password],
                    decoration: InputDecoration(suffixIcon: toggle),
                    validator: (v) => (v == null || v.isEmpty)
                        ? context.tr('required')
                        : null,
                  ),
                ),
                LabeledField(
                  label: context.tr('new_password'),
                  required: true,
                  child: TextFormField(
                    controller: _new,
                    obscureText: _obscure,
                    autofillHints: const [AutofillHints.newPassword],
                    validator: (v) => (v == null || v.length < 6)
                        ? context.tr('password_min')
                        : null,
                  ),
                ),
                LabeledField(
                  label: context.tr('confirm_password'),
                  required: true,
                  child: TextFormField(
                    controller: _confirm,
                    obscureText: _obscure,
                    validator: (v) =>
                        v != _new.text ? context.tr('password_mismatch') : null,
                  ),
                ),
                LoadingButton(
                  label: context.tr('save'),
                  loading: _saving,
                  onPressed: _save,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
