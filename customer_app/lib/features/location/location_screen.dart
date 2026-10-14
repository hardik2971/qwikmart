import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/l10n/app_localizations.dart';
import '../../core/location.dart';
import '../../core/theme.dart';
import '../../core/utils.dart';
import '../../models/models.dart';
import '../../providers/providers.dart';
import '../../widgets/common.dart';
import 'map_picker_screen.dart';

final _zonesProvider = FutureProvider.autoDispose<List<Zone>>((ref) => ref.watch(accountRepoProvider).zones());
final _countriesProvider = FutureProvider.autoDispose<List<Country>>((ref) => ref.watch(accountRepoProvider).countries());

/// Location permission → current location / map pin → `detectZone` callable, or choose a zone.
class LocationScreen extends ConsumerStatefulWidget {
  /// True when opened from inside the app (address tap) rather than first-run.
  final bool fromApp;
  const LocationScreen({super.key, this.fromApp = false});
  @override
  ConsumerState<LocationScreen> createState() => _LocationScreenState();
}

class _LocationScreenState extends ConsumerState<LocationScreen> {
  bool _busy = false;
  bool _notServiceable = false;

  Future<void> _detect(double lat, double lng, {String? address}) async {
    setState(() {
      _busy = true;
      _notServiceable = false;
    });
    try {
      final r = await ref.read(accountRepoProvider).detectZone(lat, lng);
      if (!r.deliverable || r.zone == null) {
        setState(() => _notServiceable = true);
        return;
      }
      final addr = address ?? await LocationService.addressFor(lat, lng) ?? r.zone!.address;
      _apply(r.zone!, addr.isEmpty ? r.zone!.name : addr, lat, lng, r.distanceKm, r.deliveryMinutes, storeId: r.storeId);
    } catch (e) {
      if (mounted) showSnack(context, '$e', error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _apply(Zone zone, String address, double? lat, double? lng, double distance, int minutes, {String storeId = ''}) {
    ref.read(sessionProvider.notifier).setLocation(
          zoneId: zone.id,
          // Quick orders are served by the zone's default store (detectZone returns it).
          storeId: storeId.isNotEmpty ? storeId : zone.defaultStoreId,
          zoneName: zone.name,
          address: address,
          lat: lat,
          lng: lng,
          distanceKm: distance,
          deliveryMinutes: minutes,
          countryId: zone.countryId,
        );
    final countries = ref.read(_countriesProvider).value ?? const <Country>[];
    final c = countries.where((c) => c.id == zone.countryId).firstOrNull;
    if (c != null) ref.read(sessionProvider.notifier).setCurrency(c.currencySymbol);
    if (widget.fromApp && context.canPop()) {
      context.pop();
    } else if (ref.read(sessionProvider).isLoggedIn) {
      context.go('/home');
    } else {
      context.go('/login?from=onboarding');
    }
  }

  Future<void> _useCurrent() async {
    setState(() => _busy = true);
    try {
      final p = await LocationService.current();
      await _detect(p.latitude, p.longitude);
    } catch (e) {
      if (mounted) {
        setState(() => _busy = false);
        showSnack(context, '$e', error: true);
      }
    }
  }

  Future<void> _pickOnMap() async {
    final s = ref.read(sessionProvider);
    final r = await context.push<MapPickResult>(
      '/location/map',
      extra: s.lat != null ? MapPickResult(s.lat!, s.lng!) : null,
    );
    if (r != null) await _detect(r.lat, r.lng, address: r.address);
  }

  @override
  Widget build(BuildContext context) {
    final zones = ref.watch(_zonesProvider);
    final countries = ref.watch(_countriesProvider).value ?? const <Country>[];
    return Scaffold(
      appBar: widget.fromApp ? AppBar(title: Text(context.tr('select_location'))) : null,
      body: SafeArea(
        child: ListView(padding: const EdgeInsets.fromLTRB(20, 20, 20, 24), children: [
          if (!widget.fromApp) ...[
            const Align(alignment: AlignmentDirectional.centerStart, child: BrandLogo(height: 30)),
            const SizedBox(height: 28),
          ],
          Center(
            child: Container(
              width: 150,
              height: 150,
              decoration: const BoxDecoration(
                shape: BoxShape.circle,
                gradient: RadialGradient(colors: [Color(0xFFE6F4E9), Color(0xFFF6FBF7)]),
              ),
              child: const Stack(alignment: Alignment.center, children: [
                Text('🗺️', style: TextStyle(fontSize: 70)),
                Positioned(top: 22, right: 30, child: Text('📍', style: TextStyle(fontSize: 40))),
              ]),
            ),
          ),
          const SizedBox(height: 22),
          Text(context.tr('where_deliver'),
              textAlign: TextAlign.center, style: context.text.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          Text(context.tr('location_subtitle'),
              textAlign: TextAlign.center, style: context.text.bodyMedium?.copyWith(color: context.mutedText)),
          const SizedBox(height: 24),
          AppButton(
            label: context.tr('use_current_location'),
            icon: Icons.my_location_rounded,
            loading: _busy,
            onPressed: _useCurrent,
          ),
          const SizedBox(height: 12),
          AppButton(
            label: context.tr('pick_on_map'),
            icon: Icons.map_outlined,
            outlined: true,
            onPressed: _busy ? null : _pickOnMap,
          ),
          if (_notServiceable) ...[
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: const Color(0xFFFFF4E5),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: const Color(0xFFFCD9A8)),
              ),
              child: Row(children: [
                const Text('🚧', style: TextStyle(fontSize: 26)),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(context.tr('not_serviceable'),
                        style: const TextStyle(fontWeight: FontWeight.w800, color: AppColors.ink)),
                    const SizedBox(height: 2),
                    Text(context.tr('not_serviceable_body'),
                        style: const TextStyle(fontSize: 12, color: Color(0xFF8A5A14))),
                  ]),
                ),
              ]),
            ),
          ],
          const SizedBox(height: 26),
          Row(children: [
            Expanded(child: Divider(color: context.borderColor)),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Text(context.tr('or_choose_city'), style: context.text.bodySmall?.copyWith(color: context.mutedText)),
            ),
            Expanded(child: Divider(color: context.borderColor)),
          ]),
          const SizedBox(height: 14),
          zones.when(
            loading: () => const Padding(padding: EdgeInsets.all(20), child: LoadingView()),
            error: (e, _) => ErrorView(error: e, onRetry: () => ref.invalidate(_zonesProvider)),
            data: (list) => Wrap(spacing: 10, runSpacing: 10, children: [
              for (final z in list)
                ActionChip(
                  avatar: Text(countries.where((c) => c.id == z.countryId).firstOrNull?.flag ?? '📍'),
                  label: Text(z.name),
                  onPressed: _busy
                      ? null
                      : () => _apply(z, z.address.isEmpty ? z.name : z.address, z.lat, z.lng, 2.48, z.deliveryMinutes),
                ),
            ]),
          ),
          const SizedBox(height: 18),
          AppCard(
            color: AppColors.primary50,
            child: Row(children: [
              const Icon(Icons.info_outline_rounded, color: AppColors.primary),
              const SizedBox(width: 10),
              Expanded(
                child: Text(context.tr('dont_see_area'),
                    style: const TextStyle(fontSize: 12.5, color: AppColors.primaryDark, fontWeight: FontWeight.w600)),
              ),
            ]),
          ),
        ]),
      ),
    );
  }
}
