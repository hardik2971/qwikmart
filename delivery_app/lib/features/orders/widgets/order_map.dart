import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../../../core/l10n.dart';
import '../../../core/location_service.dart';
import '../../../core/theme.dart';

/// OSM map with store / customer / rider markers (flutter_map, no API key).
class OrderMap extends StatelessWidget {
  const OrderMap({super.key, this.store, this.customer, this.height = 190, this.interactive = false, this.showLegend = true});

  final LatLng? store;
  final LatLng? customer;
  final double height;
  final bool interactive;
  final bool showLegend;

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<LatLng?>(
      valueListenable: LocationService.lastPosition,
      builder: (context, riderPos, _) {
        final rider = riderPos ?? _fallbackRider();
        final points = [?store, ?customer, ?rider];
        if (points.isEmpty) {
          return SizedBox(height: height, child: const Center(child: Icon(Icons.map_outlined)));
        }
        final fit = points.length == 1
            ? null
            : CameraFit.bounds(bounds: LatLngBounds.fromPoints(points), padding: const EdgeInsets.all(36));
        return SizedBox(
          height: height,
          child: Stack(
            children: [
              FlutterMap(
                options: MapOptions(
                  initialCenter: points.first,
                  initialZoom: 14,
                  initialCameraFit: fit,
                  interactionOptions: InteractionOptions(
                    flags: interactive ? InteractiveFlag.all & ~InteractiveFlag.rotate : InteractiveFlag.none,
                  ),
                ),
                children: [
                  TileLayer(
                    urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                    userAgentPackageName: 'com.qwikmartapp.delivery',
                  ),
                  PolylineLayer(
                    polylines: [
                      if (rider != null && store != null)
                        Polyline(points: [rider, store!], color: AppColors.info.withValues(alpha: 0.7), strokeWidth: 3, pattern: StrokePattern.dashed(segments: const [8, 6])),
                      if (store != null && customer != null)
                        Polyline(points: [store!, customer!], color: AppColors.primary, strokeWidth: 4),
                    ],
                  ),
                  MarkerLayer(
                    markers: [
                      if (store != null) _marker(store!, Icons.storefront_rounded, AppColors.primary),
                      if (customer != null) _marker(customer!, Icons.home_rounded, AppColors.danger),
                      if (rider != null) _marker(rider, Icons.delivery_dining_rounded, AppColors.info),
                    ],
                  ),
                  const SimpleAttributionWidget(source: Text('OpenStreetMap contributors', style: TextStyle(fontSize: 10))),
                ],
              ),
              if (showLegend)
                Positioned(
                  left: 8,
                  top: 8,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.92),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        _legend(AppColors.primary, context.tr('store')),
                        _legend(AppColors.danger, context.tr('customer')),
                        _legend(AppColors.info, context.tr('you')),
                      ],
                    ),
                  ),
                ),
            ],
          ),
        );
      },
    );
  }

  LatLng? _fallbackRider() {
    final s = store;
    if (s == null) return null;
    return LatLng(s.latitude - 0.004, s.longitude - 0.006);
  }

  Widget _legend(Color c, String label) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 4),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(width: 8, height: 8, decoration: BoxDecoration(color: c, shape: BoxShape.circle)),
            const SizedBox(width: 4),
            Text(label, style: const TextStyle(fontSize: 10.5, color: AppColors.ink, fontWeight: FontWeight.w600)),
          ],
        ),
      );

  Marker _marker(LatLng p, IconData icon, Color color) => Marker(
        point: p,
        width: 36,
        height: 36,
        child: Container(
          decoration: BoxDecoration(
            color: color,
            shape: BoxShape.circle,
            border: Border.all(color: Colors.white, width: 2.5),
            boxShadow: const [BoxShadow(color: Color(0x40000000), blurRadius: 6, offset: Offset(0, 2))],
          ),
          child: Icon(icon, color: Colors.white, size: 18),
        ),
      );
}

/// Full-screen interactive map.
class OrderMapPage extends StatelessWidget {
  const OrderMapPage({super.key, required this.title, this.store, this.customer});
  final String title;
  final LatLng? store;
  final LatLng? customer;

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: Text(title)),
        body: LayoutBuilder(
          builder: (context, c) => OrderMap(store: store, customer: customer, height: c.maxHeight, interactive: true),
        ),
      );
}
