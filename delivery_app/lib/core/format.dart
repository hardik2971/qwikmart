import 'package:intl/intl.dart';

class Fmt {
  Fmt._();

  static String currencySymbol = '₹';

  static String money(num? v, {bool decimals = true}) {
    final value = (v ?? 0).toDouble();
    final f = NumberFormat.currency(
      locale: 'en_IN',
      symbol: currencySymbol,
      decimalDigits: decimals && value != value.roundToDouble() ? 2 : 0,
    );
    return f.format(value);
  }

  /// Plain "₹1669.82" style used in the reference screens (no grouping).
  static String moneyPlain(num? v) {
    final value = (v ?? 0).toDouble();
    final s = value == value.roundToDouble() ? value.toStringAsFixed(0) : value.toStringAsFixed(2);
    return '$currencySymbol$s';
  }

  static String dateTime(DateTime? d) => d == null ? '' : DateFormat('dd-MM-yyyy hh:mm a').format(d.toLocal());
  static String date(DateTime? d) => d == null ? '' : DateFormat('dd-MM-yyyy').format(d.toLocal());
  static String dateLong(DateTime? d) => d == null ? '' : DateFormat('d MMM yyyy').format(d.toLocal());
  static String time(DateTime? d) => d == null ? '' : DateFormat('hh:mm a').format(d.toLocal());

  static String relative(DateTime? d) {
    if (d == null) return '';
    final diff = DateTime.now().difference(d);
    if (diff.inMinutes < 1) return 'just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    if (diff.inDays < 7) return '${diff.inDays}d ago';
    return date(d);
  }

  /// Short display form of a Firestore auto id (numeric ids are kept).
  static String shortId(String id) => id.length <= 8 ? id : id.substring(0, 8).toUpperCase();

  static String km(double? v) => v == null ? '-' : '${v.toStringAsFixed(1)} km';

  static String titleCase(String s) => s
      .replaceAll('_', ' ')
      .split(' ')
      .where((w) => w.isNotEmpty)
      .map((w) => w[0].toUpperCase() + w.substring(1))
      .join(' ');

  static String maskAccount(String? acc) {
    if (acc == null || acc.length < 4) return acc ?? '';
    return '•••• ${acc.substring(acc.length - 4)}';
  }
}

/// Tolerant JSON readers – the backend is being built concurrently.
double asDouble(dynamic v, [double fallback = 0]) {
  if (v == null) return fallback;
  if (v is num) return v.toDouble();
  return double.tryParse(v.toString()) ?? fallback;
}

double? asDoubleOrNull(dynamic v) {
  if (v == null) return null;
  if (v is num) return v.toDouble();
  return double.tryParse(v.toString());
}

int asInt(dynamic v, [int fallback = 0]) {
  if (v == null) return fallback;
  if (v is int) return v;
  if (v is num) return v.toInt();
  return int.tryParse(v.toString()) ?? fallback;
}

String asString(dynamic v, [String fallback = '']) => v == null ? fallback : v.toString();

String? asStringOrNull(dynamic v) => v?.toString();

bool asBool(dynamic v, [bool fallback = false]) {
  if (v == null) return fallback;
  if (v is bool) return v;
  if (v is num) return v != 0;
  final s = v.toString().toLowerCase();
  return s == 'true' || s == '1' || s == 'yes';
}

DateTime? asDate(dynamic v) {
  if (v == null) return null;
  if (v is DateTime) return v;
  // API sends ISO-8601 with an offset (parsed as UTC) – show in device time.
  return DateTime.tryParse(v.toString())?.toLocal();
}

Map<String, dynamic> asMap(dynamic v) => v is Map ? Map<String, dynamic>.from(v) : <String, dynamic>{};

List<Map<String, dynamic>> asMapList(dynamic v) {
  if (v is Map && v['data'] is List) v = v['data'];
  if (v is Map && v['items'] is List) v = v['items'];
  if (v is! List) return const [];
  return v.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
}
