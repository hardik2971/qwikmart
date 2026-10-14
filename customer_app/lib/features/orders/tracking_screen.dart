import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart';

import '../../core/l10n/app_localizations.dart';
import '../../core/theme.dart';
import '../../core/utils.dart';
import '../../models/models.dart';
import '../../providers/providers.dart';
import '../../widgets/common.dart';
import '../location/map_picker_screen.dart';
import 'order_detail_screen.dart';

/// Live tracking (screenshot 18): OSM map with store / rider / home markers + route,
/// rider card with call — live from the order document (Firestore snapshots).
class TrackingScreen extends ConsumerStatefulWidget {
  final String orderId;
  const TrackingScreen({super.key, required this.orderId});
  @override
  ConsumerState<TrackingScreen> createState() => _TrackingScreenState();
}

class _TrackingScreenState extends ConsumerState<TrackingScreen> {
  final _map = MapController();
  TrackInfo? _track;
  Object? _error;
  StreamSubscription<TrackInfo>? _sub;
  bool _fitted = false;
  bool _fittedWithRider = false;

  @override
  void initState() {
    super.initState();
    _subscribe();
  }

  /// Realtime: the order doc's `rider` field is updated by the backend as the rider moves.
  void _subscribe() {
    _sub?.cancel();
    _sub = ref.read(orderRepoProvider).track(widget.orderId).listen(_onTrack, onError: (Object e) {
      if (mounted) setState(() => _error = e);
    });
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }

  void _onTrack(TrackInfo t) {
    if (!mounted) return;
    setState(() {
      _track = t;
      _error = null;
    });
    // fit once, and again when the rider first appears (assigned after the screen opened) so all markers are visible
    final withRider = t.rider != null;
    if (!_fitted || (withRider && !_fittedWithRider)) {
      _fitted = true;
      _fittedWithRider = withRider;
      WidgetsBinding.instance.addPostFrameCallback((_) => _fit());
    }
    if (t.status == 'delivered') _sub?.cancel();
  }

  List<LatLng> get _points {
    final t = _track;
    if (t == null) return const [];
    return [
      if (t.store != null) LatLng(t.store!.lat, t.store!.lng),
      if (t.rider != null) LatLng(t.rider!.lat, t.rider!.lng),
      if (t.home != null) LatLng(t.home!.lat, t.home!.lng),
    ];
  }

  void _fit() {
    final pts = _points;
    if (pts.length < 2) return;
    try {
      _map.fitCamera(CameraFit.coordinates(coordinates: pts, padding: const EdgeInsets.fromLTRB(60, 80, 60, 90)));
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final order = ref.watch(orderDetailProvider(widget.orderId)).value;
    final t = _track;
    final route = t == null
        ? const <LatLng>[]
        : (t.route.isNotEmpty
            ? t.route.map((p) => LatLng(p.lat, p.lng)).toList()
            : [if (t.store != null) LatLng(t.store!.lat, t.store!.lng), if (t.home != null) LatLng(t.home!.lat, t.home!.lng)]);
    final center = _points.isNotEmpty ? _points.first : const LatLng(19.1100, 72.8950);
    final delivered = t?.status == 'delivered';

    return Scaffold(
      body: Column(children: [
        Container(
          color: AppColors.primary,
          child: SafeArea(
            bottom: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(4, 6, 16, 16),
              child: Row(children: [
                IconButton(
                  icon: Container(
                    padding: const EdgeInsets.all(4),
                    decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.2), shape: BoxShape.circle),
                    child: const Icon(Icons.arrow_back_rounded, color: Colors.white, size: 20),
                  ),
                  onPressed: () => context.pop(),
                ),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(
                      delivered
                          ? context.tr('order_delivered_title')
                          : context.tr('order_on_its_way', {'n': order?.orderNumber ?? widget.orderId}),
                      style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 17),
                    ),
                    Text(
                      delivered
                          ? context.tr('enjoy_order')
                          : (t != null && t.etaMinutes > 0
                              ? context.tr('arriving_in_n', {'n': t.etaMinutes})
                              : context.tr('reaching_soon')),
                      style: TextStyle(color: Colors.white.withValues(alpha: 0.9), fontSize: 12.5),
                    ),
                  ]),
                ),
              ]),
            ),
          ),
        ),
        Expanded(
          child: Stack(children: [
            FlutterMap(
              mapController: _map,
              options: MapOptions(initialCenter: center, initialZoom: 14.5),
              children: [
                osmTileLayer(),
                if (route.length > 1)
                  PolylineLayer(polylines: [
                    Polyline(points: route, strokeWidth: 5, color: AppColors.primary, borderStrokeWidth: 2, borderColor: Colors.white),
                  ]),
                MarkerLayer(markers: [
                  if (t?.store != null)
                    Marker(
                      point: LatLng(t!.store!.lat, t.store!.lng),
                      width: 44,
                      height: 44,
                      child: const _MapPin(icon: Icons.storefront_rounded, color: AppColors.ink),
                    ),
                  if (t?.home != null)
                    Marker(
                      point: LatLng(t!.home!.lat, t.home!.lng),
                      width: 44,
                      height: 44,
                      child: const _MapPin(icon: Icons.home_rounded, color: AppColors.info),
                    ),
                  if (t?.rider != null && !delivered)
                    Marker(
                      point: LatLng(t!.rider!.lat, t.rider!.lng),
                      width: 52,
                      height: 52,
                      child: const _MapPin(icon: Icons.delivery_dining_rounded, color: AppColors.primary, big: true),
                    ),
                ]),
              ],
            ),
            if (_error != null && t == null) ErrorView(error: _error, onRetry: _subscribe),
            PositionedDirectional(
              end: 12,
              top: 12,
              child: FloatingActionButton.small(
                heroTag: 'fit',
                backgroundColor: Colors.white,
                onPressed: _fit,
                child: const Icon(Icons.center_focus_strong_rounded, color: AppColors.primary),
              ),
            ),
          ]),
        ),
        Container(
          decoration: BoxDecoration(
            color: context.isDark ? AppColors.darkBg : AppColors.pageBg,
            boxShadow: AppShadows.card,
          ),
          child: SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 12),
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                if (order?.deliveryBoy != null && !delivered)
                  DeliveryPartnerCard(info: order!.deliveryBoy!)
                else if (t == null)
                  const ShimmerBox(height: 70),
                const SizedBox(height: 10),
                AppCard(
                  child: Row(children: [
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(color: AppColors.primary50, borderRadius: BorderRadius.circular(10)),
                      child: const Icon(Icons.location_on_outlined, color: AppColors.primary),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(context.tr('your_delivery_details'), style: const TextStyle(fontWeight: FontWeight.w800)),
                        Text(order?.address?.fullAddress ?? '',
                            maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12, color: context.mutedText)),
                      ]),
                    ),
                    if (order != null && order.deliveryOtp.isNotEmpty && !delivered)
                      Column(children: [
                        Text('OTP', style: TextStyle(fontSize: 10, color: context.mutedText, fontWeight: FontWeight.w700)),
                        Text(order.deliveryOtp,
                            style: const TextStyle(fontWeight: FontWeight.w800, color: AppColors.primary, letterSpacing: 1.5)),
                      ]),
                  ]),
                ),
                if (t?.updatedAt != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Text(context.tr('updated_at', {'time': Fmt.time(t!.updatedAt)}),
                        style: TextStyle(fontSize: 11, color: context.mutedText)),
                  ),
              ]),
            ),
          ),
        ),
      ]),
    );
  }
}

class _MapPin extends StatelessWidget {
  final IconData icon;
  final Color color;
  final bool big;
  const _MapPin({required this.icon, required this.color, this.big = false});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: color,
        shape: BoxShape.circle,
        border: Border.all(color: Colors.white, width: 3),
        boxShadow: [BoxShadow(color: color.withValues(alpha: 0.4), blurRadius: 10, spreadRadius: big ? 4 : 1)],
      ),
      child: Icon(icon, color: Colors.white, size: big ? 26 : 20),
    );
  }
}
