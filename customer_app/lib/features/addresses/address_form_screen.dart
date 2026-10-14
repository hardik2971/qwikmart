import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart';

import '../../core/errors.dart';
import '../../core/l10n/app_localizations.dart';
import '../../core/location.dart';
import '../../core/theme.dart';
import '../../core/utils.dart';
import '../../models/models.dart';
import '../../providers/providers.dart';
import '../../widgets/common.dart';
import '../location/map_picker_screen.dart';
import 'addresses_screen.dart';

/// Add / edit address with a map pin.
class AddressFormScreen extends ConsumerStatefulWidget {
  final Address? address;
  const AddressFormScreen({super.key, this.address});
  @override
  ConsumerState<AddressFormScreen> createState() => _AddressFormScreenState();
}

class _AddressFormScreenState extends ConsumerState<AddressFormScreen> {
  final _form = GlobalKey<FormState>();
  final _map = MapController();
  late String _label = widget.address?.label ?? 'Home';
  late final _name = TextEditingController(text: widget.address?.name ?? ref.read(sessionProvider).user?.name ?? '');
  late final _phone = TextEditingController(text: widget.address?.phone ?? ref.read(sessionProvider).user?.phone ?? '');
  late final _line = TextEditingController(text: widget.address?.addressLine ?? '');
  late final _landmark = TextEditingController(text: widget.address?.landmark ?? '');
  late final _city = TextEditingController(text: widget.address?.city ?? ref.read(sessionProvider).zoneName);
  late final _state = TextEditingController(text: widget.address?.state ?? '');
  late final _pincode = TextEditingController(text: widget.address?.pincode ?? '');
  late bool _default = widget.address?.isDefault ?? false;
  late LatLng _pin;
  String? _area;
  bool _saving = false;
  Timer? _debounce;

  @override
  void initState() {
    super.initState();
    final s = ref.read(sessionProvider);
    _pin = LatLng(widget.address?.lat ?? s.lat ?? 19.1176, widget.address?.lng ?? s.lng ?? 72.9060);
    _area = s.address;
  }

  @override
  void dispose() {
    _debounce?.cancel();
    for (final c in [_name, _phone, _line, _landmark, _city, _state, _pincode]) {
      c.dispose();
    }
    super.dispose();
  }

  void _onMove(MapCamera camera, bool gesture) {
    if (!gesture) return;
    _pin = camera.center;
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 700), () async {
      final a = await LocationService.addressFor(_pin.latitude, _pin.longitude);
      if (mounted && a != null) setState(() => _area = a);
    });
  }

  Future<void> _locate() async {
    try {
      final p = await LocationService.current();
      _pin = LatLng(p.latitude, p.longitude);
      _map.move(_pin, 16);
      final a = await LocationService.addressFor(_pin.latitude, _pin.longitude);
      if (mounted) setState(() => _area = a ?? _area);
    } catch (e) {
      if (mounted) showSnack(context, '$e', error: true);
    }
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    setState(() => _saving = true);
    try {
      await ref.read(addressesProvider.notifier).save(Address(
            id: widget.address?.id ?? '',
            label: _label,
            name: _name.text.trim(),
            phone: _phone.text.trim(),
            addressLine: _line.text.trim(),
            landmark: _landmark.text.trim(),
            city: _city.text.trim(),
            state: _state.text.trim(),
            pincode: _pincode.text.trim(),
            lat: _pin.latitude,
            lng: _pin.longitude,
            isDefault: _default,
          ));
      if (!mounted) return;
      showSnack(context, context.tr('address_saved'));
      context.pop(true);
    } on AppException catch (e) {
      if (mounted) showSnack(context, e.displayMessage, error: true);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  String? _required(String? v) => (v == null || v.trim().isEmpty) ? context.tr('required') : null;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(context.tr(widget.address == null ? 'add_new_address' : 'edit_address'))),
      body: Form(
        key: _form,
        child: ListView(padding: const EdgeInsets.only(bottom: 24), children: [
          SizedBox(
            height: 220,
            child: Stack(children: [
              FlutterMap(
                mapController: _map,
                options: MapOptions(initialCenter: _pin, initialZoom: 16, onPositionChanged: _onMove),
                children: [osmTileLayer()],
              ),
              const IgnorePointer(
                child: Center(
                  child: Padding(
                    padding: EdgeInsets.only(bottom: 36),
                    child: Icon(Icons.location_on_rounded, color: AppColors.primary, size: 42),
                  ),
                ),
              ),
              PositionedDirectional(
                end: 12,
                bottom: 12,
                child: FloatingActionButton.small(
                  heroTag: 'addr-locate',
                  backgroundColor: Colors.white,
                  onPressed: _locate,
                  child: const Icon(Icons.my_location_rounded, color: AppColors.primary),
                ),
              ),
            ]),
          ),
          if (_area != null && _area!.isNotEmpty)
            Container(
              color: AppColors.primary50.withValues(alpha: context.isDark ? 0.1 : 1),
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              child: Row(children: [
                const Icon(Icons.place_outlined, color: AppColors.primary, size: 18),
                const SizedBox(width: 8),
                Expanded(child: Text(_area!, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 12.5))),
              ]),
            ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(context.tr('save_as'), style: const TextStyle(fontWeight: FontWeight.w700)),
              const SizedBox(height: 8),
              Wrap(spacing: 8, children: [
                for (final l in ['Home', 'Work', 'Other'])
                  ChoiceChip(
                    avatar: Icon(labelIcon(l), size: 16),
                    label: Text(context.tr('label_${l.toLowerCase()}')),
                    selected: _label == l,
                    onSelected: (_) => setState(() => _label = l),
                  ),
              ]),
              const SizedBox(height: 14),
              TextFormField(controller: _line, validator: _required, decoration: InputDecoration(labelText: context.tr('house_flat_building'))),
              const SizedBox(height: 10),
              TextFormField(controller: _landmark, decoration: InputDecoration(labelText: context.tr('landmark_optional'))),
              const SizedBox(height: 10),
              Row(children: [
                Expanded(child: TextFormField(controller: _city, validator: _required, decoration: InputDecoration(labelText: context.tr('city')))),
                const SizedBox(width: 10),
                Expanded(child: TextFormField(controller: _state, decoration: InputDecoration(labelText: context.tr('state')))),
              ]),
              const SizedBox(height: 10),
              TextFormField(
                controller: _pincode,
                keyboardType: TextInputType.number,
                decoration: InputDecoration(labelText: context.tr('pincode')),
              ),
              const SizedBox(height: 18),
              Text(context.tr('receiver_details'), style: const TextStyle(fontWeight: FontWeight.w700)),
              const SizedBox(height: 8),
              TextFormField(controller: _name, validator: _required, decoration: InputDecoration(labelText: context.tr('full_name'))),
              const SizedBox(height: 10),
              TextFormField(
                controller: _phone,
                validator: _required,
                keyboardType: TextInputType.phone,
                decoration: InputDecoration(labelText: context.tr('phone_number')),
              ),
              const SizedBox(height: 6),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                value: _default,
                onChanged: (v) => setState(() => _default = v),
                title: Text(context.tr('make_default')),
              ),
            ]),
          ),
        ]),
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
          child: AppButton(label: context.tr('save_address'), loading: _saving, onPressed: _save),
        ),
      ),
    );
  }
}
