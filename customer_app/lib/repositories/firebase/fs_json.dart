import 'package:cloud_firestore/cloud_firestore.dart' hide Order;

import '../../models/models.dart';

/// Converts Firestore values to plain JSON (Timestamp → ISO string, GeoPoint → {lat,lng}, refs → path).
dynamic plain(dynamic v) {
  if (v is Timestamp) return v.toDate().toIso8601String();
  if (v is DateTime) return v.toIso8601String();
  if (v is GeoPoint) return {'lat': v.latitude, 'lng': v.longitude};
  if (v is DocumentReference) return v.path;
  if (v is Map) return v.map((k, x) => MapEntry(k.toString(), plain(x)));
  if (v is List) return v.map(plain).toList();
  return v;
}

/// `{id, ...data}` of a document with plain JSON values.
Map<String, dynamic> docJson(DocumentSnapshot<Map<String, dynamic>> d) =>
    {...(plain(d.data() ?? const <String, dynamic>{}) as Map<String, dynamic>), 'id': d.id};

bool _isOn(dynamic status) => status == null || status == true || status == 'active';

/// Whether a product with [fulfillment] is sold in [mode] (`quick` | `ecommerce`).
bool supportsMode(dynamic fulfillment, String mode) {
  final f = asString(fulfillment, 'both');
  return f.isEmpty || f == 'both' || f == mode;
}

/// Variant pricing with an optional store-level override — same rule as the backend `pricingFor`.
Map<String, dynamic> variantPricing(Map<String, dynamic> v, Map<String, dynamic>? ss) {
  final hasStorePrice = ss != null && ss['price'] != null;
  final price = asDouble(hasStorePrice ? ss['price'] : v['price']);
  double? sale = hasStorePrice ? asDoubleOrNull(ss['sale_price']) : asDoubleOrNull(ss?['sale_price'] ?? v['sale_price']);
  if (sale != null && (sale <= 0 || sale >= price)) sale = null;
  final stock = ss != null ? asInt(ss['stock']) : asInt(v['stock']);
  return {'price': price, 'sale_price': sale, 'stock': stock < 0 ? 0 : stock};
}

/// Product JSON for [Product.fromJson] from a `products/{id}` doc.
///
/// [storeStocks] maps variant id → `store_stocks/{store}_{variant}` data (quick mode store pricing/stock).
Map<String, dynamic> productJson(
  String id,
  Map<String, dynamic> p, {
  String lang = 'en',
  Map<String, Map<String, dynamic>> storeStocks = const {},
  int deliveryMinutes = 0,
  String categoryName = '',
}) {
  final variants = asMapList(p['variants']).where((v) => _isOn(v['status'])).map((v) {
    final vid = asId(v['id']);
    return {
      'id': vid,
      'name': asString(v['name']),
      'sku': asString(v['sku']),
      'image': asString(v['image'] ?? p['thumbnail']),
      ...variantPricing(v, storeStocks[vid]),
    };
  }).toList();
  final images = asStringList(p['images']);
  return {
    'id': id,
    'name': asText(p['name'], lang),
    'slug': asString(p['slug'], id),
    'short_description': asText(p['short_description'], lang),
    'description': asText(p['description'], lang),
    'images': images,
    'thumbnail': asString(p['thumbnail'] ?? (images.isEmpty ? null : images.first)),
    'category_id': asId(p['category_id']),
    if (categoryName.isNotEmpty) 'category': {'id': asId(p['category_id']), 'name': categoryName},
    'brand': p['brand_id'] == null ? null : {'id': asId(p['brand_id']), 'name': asString(p['brand_name'])},
    'rating_avg': p['rating_avg'] ?? 0,
    'rating_count': p['rating_count'] ?? 0,
    'is_veg': p['is_veg'],
    'variants': variants,
    'delivery_minutes': deliveryMinutes,
    'return_allowed': p['return_allowed'] ?? false,
    'return_days': p['return_days'] ?? 0,
    'cancelable': p['cancelable'] ?? true,
    'cod_allowed': p['cod_allowed'] ?? true,
    'max_qty_per_order': (asInt(p['max_qty_per_order']) > 0) ? p['max_qty_per_order'] : 10,
    'fulfillment_type': asString(p['fulfillment_type'], 'both'),
  };
}
