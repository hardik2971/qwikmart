import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart';

import '../../core/l10n/app_localizations.dart';
import '../../core/location.dart';
import '../../core/theme.dart';
import '../../core/utils.dart';
import '../../providers/providers.dart';
import '../../widgets/common.dart';

class MapPickResult {
  final double lat;
  final double lng;
  final String? address;
  const MapPickResult(this.lat, this.lng, [this.address]);
}

/// Set to false to disable flutter_map's on-disk tile cache (used by tests).
bool osmTileCache = true;

/// Shared OSM tile layer.
TileLayer osmTileLayer() => TileLayer(
      urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      userAgentPackageName: 'com.qwikmartapp.customer',
      maxZoom: 19,
      tileProvider: osmTileCache ? null : NetworkTileProvider(cachingProvider: const DisabledMapCachingProvider()),
    );

/// Full screen map with a fixed centre pin. Pops a [MapPickResult].
class MapPickerScreen extends ConsumerStatefulWidget {
  final MapPickResult? initial;
  const MapPickerScreen({super.key, this.initial});
  @override
  ConsumerState<MapPickerScreen> createState() => _MapPickerScreenState();
}

class _MapPickerScreenState extends ConsumerState<MapPickerScreen> {
  final _map = MapController();
  late LatLng _center;
  String? _address;
  bool _resolving = false;
  bool _locating = false;
  Timer? _debounce;

  @override
  void initState() {
    super.initState();
    final s = ref.read(sessionProvider);
    _center = widget.initial != null
        ? LatLng(widget.initial!.lat, widget.initial!.lng)
        : LatLng(s.lat ?? 19.1176, s.lng ?? 72.9060);
    _resolve();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    super.dispose();
  }

  void _onMove(MapCamera camera, bool gesture) {
    _center = camera.center;
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 600), _resolve);
  }

  Future<void> _resolve() async {
    setState(() => _resolving = true);
    final a = await LocationService.addressFor(_center.latitude, _center.longitude);
    if (!mounted) return;
    setState(() {
      _address = a;
      _resolving = false;
    });
  }

  Future<void> _locate() async {
    setState(() => _locating = true);
    try {
      final p = await LocationService.current();
      _center = LatLng(p.latitude, p.longitude);
      _map.move(_center, 16);
      _resolve();
    } catch (e) {
      if (mounted) showSnack(context, '$e', error: true);
    } finally {
      if (mounted) setState(() => _locating = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final coords = '${_center.latitude.toStringAsFixed(5)}, ${_center.longitude.toStringAsFixed(5)}';
    return Scaffold(
      appBar: AppBar(title: Text(context.tr('pick_location'))),
      body: Stack(children: [
        FlutterMap(
          mapController: _map,
          options: MapOptions(initialCenter: _center, initialZoom: 15.5, onPositionChanged: _onMove),
          children: [osmTileLayer()],
        ),
        IgnorePointer(
          child: Center(
            child: Padding(
              padding: const EdgeInsets.only(bottom: 44),
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(color: AppColors.ink, borderRadius: BorderRadius.circular(8)),
                  child: Text(context.tr('order_will_be_delivered_here'),
                      style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w700)),
                ),
                const Icon(Icons.location_on_rounded, size: 48, color: AppColors.primary),
              ]),
            ),
          ),
        ),
        PositionedDirectional(
          end: 16,
          bottom: 190,
          child: FloatingActionButton.small(
            heroTag: 'locate',
            backgroundColor: Colors.white,
            onPressed: _locating ? null : _locate,
            child: _locating
                ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                : const Icon(Icons.my_location_rounded, color: AppColors.primary),
          ),
        ),
        Positioned(
          left: 0,
          right: 0,
          bottom: 0,
          child: Container(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
            decoration: BoxDecoration(
              color: context.cardColor,
              borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
              boxShadow: AppShadows.card,
            ),
            child: SafeArea(
              top: false,
              child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(context.tr('delivering_to'), style: context.text.bodySmall?.copyWith(color: context.mutedText)),
                const SizedBox(height: 6),
                Row(children: [
                  const Icon(Icons.location_on_outlined, color: AppColors.primary),
                  const SizedBox(width: 8),
                  Expanded(
                    child: _resolving
                        ? const ShimmerBox(height: 18, width: 180, radius: 6)
                        : Text(_address ?? coords,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
                  ),
                ]),
                const SizedBox(height: 14),
                AppButton(
                  label: context.tr('confirm_location'),
                  onPressed: () => context.pop(MapPickResult(_center.latitude, _center.longitude, _address)),
                ),
              ]),
            ),
          ),
        ),
      ]),
    );
  }
}
