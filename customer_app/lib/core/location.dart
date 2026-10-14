import 'package:flutter/foundation.dart';
import 'package:geocoding/geocoding.dart' as geo;
import 'package:geolocator/geolocator.dart';

class LocationException implements Exception {
  final String message;
  LocationException(this.message);
  @override
  String toString() => message;
}

class LocationService {
  LocationService._();

  /// Asks for permission (if needed) and returns the current position.
  static Future<Position> current() async {
    if (!await Geolocator.isLocationServiceEnabled()) {
      throw LocationException('Location services are turned off. Please enable GPS.');
    }
    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.denied) {
      throw LocationException('Location permission denied');
    }
    if (permission == LocationPermission.deniedForever) {
      throw LocationException('Location permission permanently denied. Enable it from Settings.');
    }
    return Geolocator.getCurrentPosition(
      locationSettings: const LocationSettings(accuracy: LocationAccuracy.high, timeLimit: Duration(seconds: 20)),
    );
  }

  /// Best-effort reverse geocoding (not available on web). Returns null when unavailable.
  static Future<String?> addressFor(double lat, double lng) async {
    if (kIsWeb) return null;
    try {
      final marks = await geo.Geocoding().placemarkFromCoordinates(lat, lng);
      if (marks.isEmpty) return null;
      final p = marks.first;
      final parts = [p.subLocality, p.locality, p.administrativeArea, p.country]
          .whereType<String>()
          .where((s) => s.trim().isNotEmpty)
          .toList();
      return parts.isEmpty ? null : parts.join(', ');
    } catch (e) {
      debugPrint('[location] reverse geocode failed: $e');
      return null;
    }
  }
}
