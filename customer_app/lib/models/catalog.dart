import 'json.dart';

class Category {
  final String id;
  final String? parentId;
  final String name;
  final String slug;
  final String image;
  final String icon;
  final String headerColor;
  final int productCount;
  final List<Category> children;

  const Category({
    required this.id,
    this.parentId,
    required this.name,
    this.slug = '',
    this.image = '',
    this.icon = '',
    this.headerColor = '',
    this.productCount = 0,
    this.children = const [],
  });

  factory Category.fromJson(Map<String, dynamic> j) => Category(
        id: asId(j['id']),
        parentId: asIdOrNull(j['parent_id']),
        name: asText(j['name']),
        slug: asString(j['slug']),
        image: asString(j['image']),
        icon: asString(j['icon']),
        headerColor: asString(j['header_color']),
        productCount: asInt(j['product_count'] ?? j['products_count']),
        children: asMapList(j['children']).map(Category.fromJson).toList(),
      );

  /// Pseudo category for the "All" home tab.
  static const all = Category(id: '', name: 'All', slug: 'all');
}

class Brand {
  final String id;
  final String name;
  final String slug;
  final String logo;
  const Brand({required this.id, required this.name, this.slug = '', this.logo = ''});

  factory Brand.fromJson(Map<String, dynamic> j) => Brand(
        id: asId(j['id']),
        name: asText(j['name']),
        slug: asString(j['slug']),
        logo: asString(j['logo']),
      );
}

class Variant {
  final String id;
  final String name;
  final String sku;
  final double price; // MRP
  final double? salePrice;
  final int stock;
  final String image;

  const Variant({
    required this.id,
    required this.name,
    this.sku = '',
    required this.price,
    this.salePrice,
    this.stock = 0,
    this.image = '',
  });

  factory Variant.fromJson(Map<String, dynamic> j) => Variant(
        id: asId(j['id']),
        name: asString(j['name']),
        sku: asString(j['sku']),
        price: asDouble(j['price']),
        salePrice: asDoubleOrNull(j['sale_price']),
        stock: asInt(j['stock'], 99),
        image: asString(j['image']),
      );

  double get effectivePrice =>
      (salePrice != null && salePrice! > 0 && salePrice! < price) ? salePrice! : price;
  double get mrp => price;
  bool get hasDiscount => effectivePrice < price;
  int get discountPercent => price > 0 && hasDiscount ? ((price - effectivePrice) / price * 100).round() : 0;
  bool get inStock => stock > 0;
}

class Review {
  final String id;
  final String userName;
  final String userAvatar;
  final int rating;
  final String comment;
  final List<String> images;
  final DateTime? createdAt;

  const Review({
    required this.id,
    required this.userName,
    this.userAvatar = '',
    required this.rating,
    this.comment = '',
    this.images = const [],
    this.createdAt,
  });

  factory Review.fromJson(Map<String, dynamic> j) {
    final u = asMap(j['user']);
    return Review(
      id: asId(j['id']),
      userName: asString(u['name'] ?? j['user_name'], 'Customer'),
      userAvatar: asString(u['avatar']),
      rating: asInt(j['rating']),
      comment: asString(j['comment']),
      images: asStringList(j['images']),
      createdAt: asDate(j['created_at']),
    );
  }
}

class Product {
  final String id;
  final String name;
  final String slug;
  final String shortDescription;
  final String description;
  final List<String> images;
  final String thumbnail;
  final String categoryId;
  final String categoryName;
  final Brand? brand;
  final double ratingAvg;
  final int ratingCount;
  final bool? isVeg;
  final List<Variant> variants;
  final int deliveryMinutes;
  final bool isFavorite;
  final bool returnAllowed;
  final int returnDays;
  final bool cancelable;
  final bool codAllowed;
  final int maxQty;
  final Map<int, int> ratingBreakdown;
  final List<Review> reviews;
  final List<Product> similar;
  /// Cross-sell + up-sell products ("Frequently bought together").
  final List<Product> alsoBuy;
  final String storeName;
  final String fulfillmentType;

  const Product({
    required this.id,
    required this.name,
    this.slug = '',
    this.shortDescription = '',
    this.description = '',
    this.images = const [],
    this.thumbnail = '',
    this.categoryId = '',
    this.categoryName = '',
    this.brand,
    this.ratingAvg = 0,
    this.ratingCount = 0,
    this.isVeg,
    this.variants = const [],
    this.deliveryMinutes = 0,
    this.isFavorite = false,
    this.returnAllowed = false,
    this.returnDays = 0,
    this.cancelable = true,
    this.codAllowed = true,
    this.maxQty = 10,
    this.ratingBreakdown = const {},
    this.reviews = const [],
    this.similar = const [],
    this.alsoBuy = const [],
    this.storeName = '',
    this.fulfillmentType = 'both',
  });

  factory Product.fromJson(Map<String, dynamic> j) {
    final cat = asMapOrNull(j['category']);
    final brand = asMapOrNull(j['brand']);
    final breakdownRaw = asMap(j['rating_breakdown']);
    final breakdown = <int, int>{};
    breakdownRaw.forEach((k, v) => breakdown[asInt(k)] = asInt(v));
    var variants = asMapList(j['variants']).map(Variant.fromJson).toList();
    if (variants.isEmpty && j['price'] != null) {
      variants = [
        Variant(
          id: asId(j['variant_id'] ?? j['id']),
          name: asString(j['unit'] ?? j['variant_name']),
          price: asDouble(j['price']),
          salePrice: asDoubleOrNull(j['sale_price']),
          stock: asInt(j['stock'], 99),
        ),
      ];
    }
    return Product(
      id: asId(j['id']),
      name: asText(j['name']),
      slug: asString(j['slug'], asString(j['id'])),
      shortDescription: asText(j['short_description']),
      description: asText(j['description']),
      images: asStringList(j['images']),
      thumbnail: asString(j['thumbnail'] ?? j['image']),
      categoryId: asId(j['category_id'] ?? cat?['id']),
      categoryName: asText(cat?['name'] ?? j['category_name']),
      brand: brand == null ? null : Brand.fromJson(brand),
      ratingAvg: asDouble(j['rating_avg']),
      ratingCount: asInt(j['rating_count']),
      isVeg: asBoolOrNull(j['is_veg']),
      variants: variants,
      deliveryMinutes: asInt(j['delivery_minutes']),
      isFavorite: asBool(j['is_favorite']),
      returnAllowed: asBool(j['return_allowed']),
      returnDays: asInt(j['return_days']),
      cancelable: asBool(j['cancelable'], true),
      codAllowed: asBool(j['cod_allowed'], true),
      maxQty: asInt(j['max_qty_per_order'], 10),
      ratingBreakdown: breakdown,
      reviews: asMapList(j['reviews']).map(Review.fromJson).toList(),
      similar: asMapList(j['similar']).map(Product.fromJson).toList(),
      alsoBuy: asMapList(j['also_buy']).map(Product.fromJson).toList(),
      storeName: asString(asMap(j['store'])['name']),
      fulfillmentType: asString(j['fulfillment_type'], 'both'),
    );
  }

  Variant? get defaultVariant =>
      variants.isEmpty ? null : variants.firstWhere((v) => v.inStock, orElse: () => variants.first);

  String get image => thumbnail.isNotEmpty ? thumbnail : (images.isNotEmpty ? images.first : '');
  List<String> get gallery => images.isNotEmpty ? images : [image];
}

/// `GET /products/filters`.
class ProductFilters {
  final double minPrice;
  final double maxPrice;
  final List<Brand> brands;
  final List<({String key, String name, List<({String id, String value, String colorHex})> values})> attributes;
  final List<({String key, String label})> sorts;

  const ProductFilters({
    this.minPrice = 0,
    this.maxPrice = 0,
    this.brands = const [],
    this.attributes = const [],
    this.sorts = const [],
  });

  factory ProductFilters.fromJson(Map<String, dynamic> j) {
    final price = asMap(j['price']);
    return ProductFilters(
      minPrice: asDouble(price['min']),
      maxPrice: asDouble(price['max']),
      brands: asMapList(j['brands']).map(Brand.fromJson).toList(),
      attributes: asMapList(j['attributes'])
          .map((a) => (
                key: asString(a['key']),
                name: asText(a['name']),
                values: asMapList(a['values'])
                    .map((v) => (id: asId(v['id']), value: asString(v['value']), colorHex: asString(v['color_hex'])))
                    .toList(),
              ))
          .toList(),
      sorts: asMapList(j['sorts']).map((s) => (key: asString(s['key']), label: asText(s['label']))).toList(),
    );
  }
}
