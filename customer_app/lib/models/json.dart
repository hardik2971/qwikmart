/// Lenient JSON readers: Firestore docs, callable results and the offline mock all feed the same models.
int asInt(dynamic v, [int d = 0]) {
  if (v == null) return d;
  if (v is int) return v;
  if (v is num) return v.toInt();
  final s = v.toString();
  return int.tryParse(s) ?? double.tryParse(s)?.toInt() ?? d;
}

int? asIntOrNull(dynamic v) => v == null || v.toString().isEmpty ? null : asInt(v);

double asDouble(dynamic v, [double d = 0]) {
  if (v == null) return d;
  if (v is num) return v.toDouble();
  return double.tryParse(v.toString()) ?? d;
}

double? asDoubleOrNull(dynamic v) => v == null || v.toString().isEmpty ? null : asDouble(v);

String asString(dynamic v, [String d = '']) => v == null ? d : v.toString();

/// Document id (Firestore ids are strings; the mock uses ints).
String asId(dynamic v) => v == null ? '' : v.toString();

String? asIdOrNull(dynamic v) => v == null || v.toString().isEmpty ? null : v.toString();

bool asBool(dynamic v, [bool d = false]) {
  if (v == null) return d;
  if (v is bool) return v;
  if (v is num) return v != 0;
  final s = v.toString().toLowerCase();
  return s == '1' || s == 'true' || s == 'yes' || s == 'active';
}

bool? asBoolOrNull(dynamic v) => v == null ? null : asBool(v);

Map<String, dynamic> asMap(dynamic v) => v is Map ? Map<String, dynamic>.from(v) : <String, dynamic>{};

Map<String, dynamic>? asMapOrNull(dynamic v) => v is Map ? Map<String, dynamic>.from(v) : null;

List<Map<String, dynamic>> asMapList(dynamic v) {
  if (v is Map && v['data'] is List) v = v['data'];
  return v is List ? v.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList() : <Map<String, dynamic>>[];
}

List<String> asStringList(dynamic v) => v is List ? v.where((e) => e != null).map((e) => e.toString()).toList() : <String>[];

/// ISO strings, [DateTime], epoch millis and serialized Firestore timestamps (`{_seconds, _nanoseconds}`).
DateTime? asDate(dynamic v) {
  if (v == null) return null;
  if (v is DateTime) return v.toLocal();
  if (v is int) return DateTime.fromMillisecondsSinceEpoch(v).toLocal();
  if (v is Map) {
    final s = v['_seconds'] ?? v['seconds'];
    if (s is num) return DateTime.fromMillisecondsSinceEpoch((s * 1000).round()).toLocal();
    return null;
  }
  return DateTime.tryParse(v.toString())?.toLocal();
}

/// Reads a possibly-translatable field: plain string or `{"en": "...", "ar": "..."}`.
String asText(dynamic v, [String lang = 'en']) {
  if (v is Map) return asString(v[lang] ?? v['en'] ?? (v.values.isNotEmpty ? v.values.first : ''));
  return asString(v);
}
