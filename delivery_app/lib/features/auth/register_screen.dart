import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';

import '../../core/auth_service.dart';
import '../../core/config.dart';
import '../../core/l10n.dart';
import '../../core/theme.dart';
import '../../models/models.dart';
import '../../providers/auth_provider.dart';
import '../../providers/data_providers.dart';
import '../../widgets/common.dart';
import 'auth_widgets.dart';

class RegisterScreen extends ConsumerStatefulWidget {
  const RegisterScreen({super.key});

  @override
  ConsumerState<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends ConsumerState<RegisterScreen> {
  final _data = RegistrationData()..countryId = '1';
  final _forms = List.generate(5, (_) => GlobalKey<FormState>());
  int _step = 0;
  bool _submitting = false;

  final _name = TextEditingController();
  final _email = TextEditingController();
  final _phone = TextEditingController();
  final _password = TextEditingController();
  final _confirm = TextEditingController();
  final _dob = TextEditingController();
  final _address = TextEditingController();
  final _vehicleNo = TextEditingController();
  final _bank = TextEditingController();
  final _account = TextEditingController();
  final _ifsc = TextEditingController();
  bool _obscure = true;
  String? _docError;

  /// E-mail of the Firebase user this registration is bound to: the signed-in user when coming
  /// from a login without rider account, or the account created by a failed submit. While set the
  /// e-mail is locked and no password is asked (the account already exists).
  String? _lockedEmail;

  /// A Firebase account was created by this screen but the registration is not submitted yet –
  /// it is deleted when the rider explicitly discards the registration.
  bool _accountCreated = false;

  @override
  void initState() {
    super.initState();
    final user = DemoMode.isOn ? null : FirebaseAuthService.currentUser;
    if (user?.email != null) {
      _lockedEmail = user!.email;
      _email.text = user.email!;
      _name.text = user.displayName ?? '';
    }
  }

  static const _vehicleTypes = <(String, IconData)>[
    ('Bike', Icons.two_wheeler_rounded),
    ('Scooter', Icons.electric_moped_rounded),
    ('Bicycle', Icons.pedal_bike_rounded),
    ('Car', Icons.directions_car_filled_outlined),
  ];

  @override
  void dispose() {
    for (final c in [_name, _email, _phone, _password, _confirm, _dob, _address, _vehicleNo, _bank, _account, _ifsc]) {
      c.dispose();
    }
    super.dispose();
  }

  List<String> _titles(BuildContext c) => [
    c.tr('personal_info'),
    c.tr('location'),
    c.tr('vehicle'),
    c.tr('documents'),
    c.tr('bank_details'),
  ];

  bool _validateStep() {
    final ok = _forms[_step].currentState?.validate() ?? true;
    if (_step == 3) {
      final docsOk = _data.drivingLicense != null && _data.idProof != null;
      setState(() => _docError = docsOk ? null : context.tr('required'));
      return ok && docsOk;
    }
    return ok;
  }

  void _collect() {
    _data
      ..name = _name.text.trim()
      ..email = (_lockedEmail ?? _email.text).trim()
      ..phone = _phone.text.trim()
      ..password = _lockedEmail == null ? _password.text : ''
      ..address = _address.text.trim()
      ..vehicleNumber = _vehicleNo.text.trim().toUpperCase()
      ..bankName = _bank.text.trim()
      ..bankAccount = _account.text.trim()
      ..ifsc = _ifsc.text.trim().toUpperCase();
  }

  Future<void> _next() async {
    if (!_validateStep()) return;
    if (_step < 4) {
      setState(() => _step++);
      return;
    }
    _collect();
    setState(() => _submitting = true);
    try {
      // Creates the Firebase account right before submitting (unless already bound to one),
      // then uploads the documents to Storage and calls registerDeliveryBoy.
      await ref.read(authProvider.notifier).register(_data, onAccountCreated: () => _accountCreated = true);
    } catch (e) {
      final user = DemoMode.isOn ? null : FirebaseAuthService.currentUser;
      if (mounted && user?.email != null) setState(() => _lockedEmail = user!.email);
      if (mounted) showSnack(context, errorText(e), error: true);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  void _back() {
    if (_step == 0) {
      _leave();
    } else {
      setState(() => _step--);
    }
  }

  /// Leaving the stepper: deletes a Firebase account created here (after confirmation) or signs
  /// out the Firebase user the registration was bound to.
  Future<void> _leave() async {
    final auth = ref.read(authProvider.notifier);
    if (_accountCreated) {
      final ok = await confirmDialog(
        context,
        context.tr('discard_registration'),
        confirmLabel: context.tr('discard'),
        danger: true,
      );
      if (!ok) return;
      await auth.cancelRegistration(deleteAccount: true);
    } else if (_lockedEmail != null) {
      await auth.cancelRegistration(deleteAccount: false);
    }
    if (mounted) context.canPop() ? context.pop() : context.go('/login');
  }

  Future<void> _pickDob() async {
    final now = DateTime.now();
    final d = await showDatePicker(
      context: context,
      initialDate: _data.dob ?? DateTime(now.year - 22),
      firstDate: DateTime(now.year - 70),
      lastDate: DateTime(now.year - 18, now.month, now.day),
    );
    if (d != null) {
      setState(() {
        _data.dob = d;
        _dob.text = DateFormat('dd/MM/yyyy').format(d);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final titles = _titles(context);
    return PopScope(
      canPop: _step == 0 && _lockedEmail == null,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _back();
      },
      child: Scaffold(
        backgroundColor: context.cardColor,
        appBar: AppBar(
          leading: IconButton(icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 20), onPressed: _back),
          title: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(context.tr('create_account')),
              Text(
                context.tr('sign_up_alert'),
                style: TextStyle(fontSize: 12, color: context.mutedColor, fontWeight: FontWeight.w500),
              ),
            ],
          ),
        ),
        body: Column(
          children: [
            _StepHeader(step: _step, titles: titles),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
                child: AnimatedSwitcher(
                  duration: const Duration(milliseconds: 220),
                  child: KeyedSubtree(key: ValueKey(_step), child: _buildStep(context)),
                ),
              ),
            ),
            BottomActionBar(
              child: Row(
                children: [
                  if (_step > 0) ...[
                    Expanded(
                      child: OutlinedButton(onPressed: _back, child: Text(context.tr('back'))),
                    ),
                    const SizedBox(width: 12),
                  ],
                  Expanded(
                    flex: 2,
                    child: LoadingButton(
                      label: _step == 4 ? context.tr('submit') : context.tr('next'),
                      loading: _submitting,
                      onPressed: _next,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStep(BuildContext context) {
    switch (_step) {
      case 0:
        return _personal(context);
      case 1:
        return _location(context);
      case 2:
        return _vehicle(context);
      case 3:
        return _documents(context);
      default:
        return _bankStep(context);
    }
  }

  Widget _personal(BuildContext context) {
    final countries = ref.watch(countriesProvider).value ?? const <Country>[];
    final codes = {for (final c in countries) c.dialCode, '+91'}.toList();
    return Form(
      key: _forms[0],
      child: Column(
        children: [
          Center(
            child: Container(
              width: 84,
              height: 84,
              margin: const EdgeInsets.only(bottom: 18, top: 6),
              decoration: BoxDecoration(color: context.softGreen, shape: BoxShape.circle),
              child: const Icon(Icons.person_add_alt_1_rounded, color: AppColors.primary, size: 42),
            ),
          ),
          LabeledField(
            label: context.tr('full_name'),
            required: true,
            child: TextFormField(
              controller: _name,
              textCapitalization: TextCapitalization.words,
              decoration: InputDecoration(hintText: context.tr('enter_full_name')),
              validator: (v) => validateRequired(context, v),
            ),
          ),
          LabeledField(
            label: context.tr('email'),
            required: true,
            child: TextFormField(
              controller: _email,
              readOnly: _lockedEmail != null,
              enabled: _lockedEmail == null,
              keyboardType: TextInputType.emailAddress,
              decoration: InputDecoration(hintText: context.tr('enter_email')),
              validator: (v) => validateEmail(context, v),
            ),
          ),
          LabeledField(
            label: context.tr('date_of_birth'),
            required: true,
            child: TextFormField(
              controller: _dob,
              readOnly: true,
              onTap: _pickDob,
              decoration: const InputDecoration(
                hintText: 'DD/MM/YYYY',
                suffixIcon: Icon(Icons.calendar_month_outlined),
              ),
              validator: (v) => validateRequired(context, v),
            ),
          ),
          LabeledField(
            label: context.tr('mobile_number'),
            required: true,
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SizedBox(
                  width: 96,
                  child: DropdownButtonFormField<String>(
                    initialValue: codes.contains(_data.countryCode) ? _data.countryCode : codes.first,
                    isExpanded: true,
                    items: codes.map((c) => DropdownMenuItem(value: c, child: Text(c))).toList(),
                    onChanged: (v) => _data.countryCode = v ?? '+91',
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: TextFormField(
                    controller: _phone,
                    keyboardType: TextInputType.phone,
                    inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(12)],
                    decoration: InputDecoration(hintText: context.tr('enter_mobile')),
                    validator: (v) => (v == null || v.trim().length < 7) ? context.tr('required') : null,
                  ),
                ),
              ],
            ),
          ),
          // The Firebase account exists already when the e-mail is locked – no password needed.
          if (_lockedEmail == null) ...[
            LabeledField(
              label: context.tr('password'),
              required: true,
              child: TextFormField(
                controller: _password,
                obscureText: _obscure,
                decoration: InputDecoration(
                  hintText: context.tr('enter_password'),
                  suffixIcon: IconButton(
                    icon: Icon(_obscure ? Icons.visibility_off_outlined : Icons.visibility_outlined, size: 20),
                    onPressed: () => setState(() => _obscure = !_obscure),
                  ),
                ),
                validator: (v) => (v == null || v.length < 6) ? context.tr('password_min') : null,
              ),
            ),
            LabeledField(
              label: context.tr('confirm_password'),
              required: true,
              child: TextFormField(
                controller: _confirm,
                obscureText: _obscure,
                decoration: InputDecoration(hintText: context.tr('confirm_password')),
                validator: (v) => v != _password.text ? context.tr('password_mismatch') : null,
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _location(BuildContext context) {
    final countries = ref.watch(countriesProvider);
    final zones = _data.countryId == null ? null : ref.watch(zonesProvider(_data.countryId!));
    return Form(
      key: _forms[1],
      child: Column(
        children: [
          _StepIntro(icon: Icons.public_rounded, text: '${context.tr('country')} & ${context.tr('zone')}'),
          LabeledField(
            label: context.tr('country'),
            required: true,
            child: DropdownButtonFormField<String>(
              initialValue: _data.countryId,
              isExpanded: true,
              hint: Text(context.tr('select')),
              items: (countries.value ?? const <Country>[])
                  .map((c) => DropdownMenuItem(value: c.id, child: Text('${c.flag}  ${c.name}'.trim())))
                  .toList(),
              onChanged: (v) => setState(() {
                _data.countryId = v;
                _data.zoneId = null;
              }),
              validator: (v) => v == null ? context.tr('required') : null,
            ),
          ),
          LabeledField(
            label: context.tr('zone'),
            required: true,
            child: DropdownButtonFormField<String>(
              key: ValueKey('zone-${_data.countryId}'),
              initialValue: _data.zoneId,
              isExpanded: true,
              hint: Text(context.tr('select')),
              items: (zones?.value ?? const <Zone>[])
                  .map((z) => DropdownMenuItem(value: z.id, child: Text(z.name)))
                  .toList(),
              onChanged: (v) => setState(() => _data.zoneId = v),
              validator: (v) => v == null ? context.tr('required') : null,
            ),
          ),
          LabeledField(
            label: context.tr('address'),
            required: true,
            child: TextFormField(
              controller: _address,
              maxLines: 3,
              decoration: InputDecoration(hintText: context.tr('enter_address')),
              validator: (v) => validateRequired(context, v),
            ),
          ),
        ],
      ),
    );
  }

  Widget _vehicle(BuildContext context) {
    return Form(
      key: _forms[2],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _StepIntro(icon: Icons.two_wheeler_rounded, text: context.tr('vehicle_details')),
          LabeledField(
            label: context.tr('vehicle_type'),
            required: true,
            child: GridView.count(
              crossAxisCount: 4,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              mainAxisSpacing: 10,
              crossAxisSpacing: 10,
              children: [
                for (final (name, icon) in _vehicleTypes)
                  _ChoiceTile(
                    icon: icon,
                    label: name,
                    selected: _data.vehicleType == name,
                    onTap: () => setState(() => _data.vehicleType = name),
                  ),
              ],
            ),
          ),
          LabeledField(
            label: context.tr('vehicle_number'),
            required: _data.vehicleType != 'Bicycle',
            child: TextFormField(
              controller: _vehicleNo,
              textCapitalization: TextCapitalization.characters,
              decoration: const InputDecoration(hintText: 'MH 02 AB 1234'),
              validator: (v) => _data.vehicleType == 'Bicycle' ? null : validateRequired(context, v),
            ),
          ),
        ],
      ),
    );
  }

  Widget _documents(BuildContext context) {
    return Form(
      key: _forms[3],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _StepIntro(icon: Icons.badge_outlined, text: context.tr('documents')),
          LabeledField(
            label: context.tr('driving_license'),
            required: true,
            child: _DocUpload(doc: _data.drivingLicense, onPicked: (d) => setState(() => _data.drivingLicense = d)),
          ),
          LabeledField(
            label: context.tr('id_proof'),
            required: true,
            child: _DocUpload(doc: _data.idProof, onPicked: (d) => setState(() => _data.idProof = d)),
          ),
          if (_docError != null && (_data.drivingLicense == null || _data.idProof == null))
            Text(_docError!, style: const TextStyle(color: AppColors.danger, fontSize: 12)),
        ],
      ),
    );
  }

  Widget _bankStep(BuildContext context) {
    return Form(
      key: _forms[4],
      child: Column(
        children: [
          _StepIntro(icon: Icons.account_balance_outlined, text: context.tr('bank_details')),
          if (_accountCreated)
            Padding(
              padding: const EdgeInsets.only(bottom: 14),
              child: AppCard(
                color: context.softGreen,
                child: Row(
                  children: [
                    const Icon(Icons.info_outline_rounded, color: AppColors.primary),
                    const SizedBox(width: 10),
                    Expanded(child: Text(context.tr('register_retry'), style: const TextStyle(fontSize: 13))),
                  ],
                ),
              ),
            ),
          LabeledField(
            label: context.tr('bank_name'),
            required: true,
            child: TextFormField(
              controller: _bank,
              decoration: const InputDecoration(hintText: 'HDFC Bank'),
              validator: (v) => validateRequired(context, v),
            ),
          ),
          LabeledField(
            label: context.tr('account_number'),
            required: true,
            child: TextFormField(
              controller: _account,
              keyboardType: TextInputType.number,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              decoration: const InputDecoration(hintText: '50100234567812'),
              validator: (v) => (v == null || v.length < 6) ? context.tr('required') : null,
            ),
          ),
          LabeledField(
            label: context.tr('ifsc'),
            required: true,
            child: TextFormField(
              controller: _ifsc,
              textCapitalization: TextCapitalization.characters,
              decoration: const InputDecoration(hintText: 'HDFC0000123'),
              validator: (v) => validateRequired(context, v),
            ),
          ),
        ],
      ),
    );
  }
}

class _StepHeader extends StatelessWidget {
  const _StepHeader({required this.step, required this.titles});
  final int step;
  final List<String> titles;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 14),
      decoration: BoxDecoration(
        border: Border(bottom: BorderSide(color: context.borderColor)),
      ),
      child: Column(
        children: [
          Row(
            children: [
              for (var i = 0; i < titles.length; i++) ...[
                _dot(context, i),
                if (i < titles.length - 1)
                  Expanded(child: Container(height: 2, color: i < step ? AppColors.primary : context.borderColor)),
              ],
            ],
          ),
          const SizedBox(height: 10),
          Text(
            '${context.tr('step')} ${step + 1} ${context.tr('of')} ${titles.length} · ${titles[step]}',
            style: TextStyle(fontWeight: FontWeight.w700, color: context.textColor, fontSize: 13.5),
          ),
        ],
      ),
    );
  }

  Widget _dot(BuildContext context, int i) {
    final done = i < step;
    final current = i == step;
    return AnimatedContainer(
      duration: const Duration(milliseconds: 200),
      width: 28,
      height: 28,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: done || current ? AppColors.primary : context.cardColor,
        border: Border.all(color: done || current ? AppColors.primary : context.borderColor, width: 2),
      ),
      alignment: Alignment.center,
      child: done
          ? const Icon(Icons.check_rounded, size: 16, color: Colors.white)
          : Text(
              '${i + 1}',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: current ? Colors.white : context.mutedColor,
              ),
            ),
    );
  }
}

class _StepIntro extends StatelessWidget {
  const _StepIntro({required this.icon, required this.text});
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 18, top: 8),
    child: Row(
      children: [
        IconTile(icon: icon, size: 44),
        const SizedBox(width: 12),
        Expanded(
          child: Text(
            text,
            style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16, color: context.textColor),
          ),
        ),
      ],
    ),
  );
}

class _ChoiceTile extends StatelessWidget {
  const _ChoiceTile({required this.icon, required this.label, required this.selected, required this.onTap});
  final IconData icon;
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => InkWell(
    onTap: onTap,
    borderRadius: BorderRadius.circular(12),
    child: AnimatedContainer(
      duration: const Duration(milliseconds: 150),
      decoration: BoxDecoration(
        color: selected ? context.softGreen : context.cardColor,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: selected ? AppColors.primary : context.borderColor, width: selected ? 1.6 : 1),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, color: selected ? AppColors.primary : context.mutedColor, size: 26),
          const SizedBox(height: 4),
          Text(
            label,
            style: TextStyle(
              fontSize: 11.5,
              fontWeight: FontWeight.w600,
              color: selected ? AppColors.primary : context.bodyColor,
            ),
          ),
        ],
      ),
    ),
  );
}

/// Upload tile with image / PDF preview. Uses image_picker for camera/gallery
/// and file_picker for PDFs; stores bytes so it works on web too.
class _DocUpload extends StatelessWidget {
  const _DocUpload({required this.doc, required this.onPicked});
  final PickedDoc? doc;
  final ValueChanged<PickedDoc> onPicked;

  Future<void> _choose(BuildContext context) async {
    final source = await showModalBottomSheet<String>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.photo_camera_outlined),
              title: Text(ctx.tr('camera')),
              onTap: () => Navigator.pop(ctx, 'camera'),
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: Text(ctx.tr('gallery')),
              onTap: () => Navigator.pop(ctx, 'gallery'),
            ),
            ListTile(
              leading: const Icon(Icons.picture_as_pdf_outlined),
              title: Text(ctx.tr('pdf_document')),
              onTap: () => Navigator.pop(ctx, 'pdf'),
            ),
          ],
        ),
      ),
    );
    if (source == null) return;
    try {
      if (source == 'pdf') {
        final files = await FilePicker.pickFiles(
          type: FileType.custom,
          allowedExtensions: ['pdf', 'jpg', 'jpeg', 'png'],
        );
        if (files.isEmpty) return;
        final f = files.first;
        onPicked(PickedDoc(name: f.name, bytes: await f.readAsBytes()));
      } else {
        final x = await ImagePicker().pickImage(
          source: source == 'camera' ? ImageSource.camera : ImageSource.gallery,
          maxWidth: 1600,
          imageQuality: 80,
        );
        if (x == null) return;
        onPicked(PickedDoc(name: x.name, bytes: await x.readAsBytes()));
      }
    } catch (e) {
      if (context.mounted) showSnack(context, 'Could not pick file: $e', error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final d = doc;
    return InkWell(
      onTap: () => _choose(context),
      borderRadius: BorderRadius.circular(12),
      child: Container(
        height: 132,
        width: double.infinity,
        decoration: BoxDecoration(
          color: d == null ? context.softGreen.withValues(alpha: 0.5) : context.cardColor,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: d == null ? AppColors.primary.withValues(alpha: 0.4) : context.borderColor),
        ),
        clipBehavior: Clip.antiAlias,
        child: d == null
            ? Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.cloud_upload_outlined, color: AppColors.primary, size: 32),
                  const SizedBox(height: 6),
                  Text(context.tr('tap_to_upload'), style: TextStyle(color: context.mutedColor, fontSize: 12.5)),
                ],
              )
            : Stack(
                fit: StackFit.expand,
                children: [
                  if (d.isPdf)
                    Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(Icons.picture_as_pdf_rounded, color: AppColors.danger, size: 40),
                        const SizedBox(height: 6),
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 12),
                          child: Text(d.name, maxLines: 1, overflow: TextOverflow.ellipsis),
                        ),
                      ],
                    )
                  else
                    Image.memory(Uint8List.fromList(d.bytes), fit: BoxFit.cover),
                  Positioned(
                    right: 8,
                    bottom: 8,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                      decoration: BoxDecoration(color: Colors.black54, borderRadius: BorderRadius.circular(999)),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.edit_outlined, color: Colors.white, size: 14),
                          const SizedBox(width: 4),
                          Text(context.tr('change'), style: const TextStyle(color: Colors.white, fontSize: 12)),
                        ],
                      ),
                    ),
                  ),
                  const Positioned(
                    left: 8,
                    top: 8,
                    child: CircleAvatar(
                      radius: 12,
                      backgroundColor: AppColors.primary,
                      child: Icon(Icons.check_rounded, color: Colors.white, size: 16),
                    ),
                  ),
                ],
              ),
      ),
    );
  }
}
