import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

class Launcher {
  Launcher._();

  /// `tel:` URI for a phone number (spaces, dashes and brackets removed, a leading + kept).
  static Uri? telUri(String? phone) {
    final p = (phone ?? '').replaceAll(RegExp(r'[^\d+]'), '');
    if (p.replaceAll('+', '').isEmpty) return null;
    return Uri(scheme: 'tel', path: p);
  }

  /// Google Maps turn-by-turn directions to [lat],[lng]; falls back to a search for [label].
  static Uri? directionsUri(double? lat, double? lng, {String? label}) {
    if (lat != null && lng != null) {
      return Uri.parse('https://www.google.com/maps/dir/?api=1&destination=$lat,$lng&travelmode=driving');
    }
    final q = (label ?? '').trim();
    if (q.isEmpty) return null;
    return Uri.parse('https://www.google.com/maps/search/?api=1&query=${Uri.encodeComponent(q)}');
  }

  static Future<void> call(BuildContext context, String? phone) async {
    final uri = telUri(phone);
    if (uri != null) await _open(context, uri);
  }

  static Future<void> email(BuildContext context, String email) =>
      _open(context, Uri(scheme: 'mailto', path: email));

  /// Opens Google Maps turn-by-turn directions (app if installed, else browser).
  static Future<void> directions(BuildContext context, double? lat, double? lng, {String? label}) async {
    final uri = directionsUri(lat, lng, label: label);
    if (uri != null) await _open(context, uri);
  }

  static Future<void> url(BuildContext context, String url) => _open(context, Uri.parse(url));

  static Future<void> _open(BuildContext context, Uri uri) async {
    final messenger = ScaffoldMessenger.maybeOf(context);
    try {
      final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
      if (!ok) messenger?.showSnackBar(SnackBar(content: Text('Could not open $uri')));
    } catch (_) {
      messenger?.showSnackBar(SnackBar(content: Text('Could not open $uri')));
    }
  }
}
