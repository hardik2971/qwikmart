import 'package:cloud_firestore/cloud_firestore.dart' hide Order;

import '../../core/errors.dart';
import '../../core/firebase.dart';
import '../../models/models.dart';
import '../repositories.dart';
import 'fs_json.dart';

/// Catalog reads straight from Firestore (public collections) + the `getHome` callable.
///
/// Product queries always filter `status == 'active'` (required by the rules) and only use the composite
/// indexes declared in `firebase/firestore.indexes.json`:
/// - category listing: `category_ids array-contains` + status + sort field;
/// - quick mode (no category): `in_stock_store_ids array-contains zone.default_store_id` + status + sort field;
/// - search: `search_keywords array-contains <first term>` + status + `sold_count desc`, remaining terms,
///   brands, price and mode filtered on the client.
class FirebaseCatalogRepository implements CatalogRepository {
  final ScopeReader scope;
  FirebaseCatalogRepository(this.scope);

  FirebaseFirestore get _db => Fb.db;
  CollectionReference<Map<String, dynamic>> get _products => _db.collection('products');

  // ------------------------------------------------------------------ home

  @override
  Future<HomeData> home({String? categoryId}) => guard(() async {
        final s = scope();
        final r = await Fb.callMap('getHome', {
          'zone_id': s.zoneId,
          'mode': s.mode,
          if (categoryId != null && categoryId.isNotEmpty) 'category_id': categoryId,
          'lang': s.lang,
        });
        return HomeData.fromJson(r);
      });

  // ------------------------------------------------------------------ categories & brands

  List<Map<String, dynamic>>? _cats;
  String _catsKey = '';

  Future<List<Map<String, dynamic>>> _allCategories() async {
    final s = scope();
    final key = '${s.mode}|${s.lang}';
    if (_cats != null && _catsKey == key) return _cats!;
    final snap = await _db.collection('categories').where('status', isEqualTo: 'active').get();
    final list = snap.docs.map(docJson).where((c) {
      final flag = s.isQuick ? c['show_in_quick'] : c['show_in_ecommerce'];
      return flag != false;
    }).map((c) => {...c, 'name': asText(c['name'], s.lang)}).toList()
      ..sort((a, b) => asInt(a['sort_order']).compareTo(asInt(b['sort_order'])));
    _cats = list;
    _catsKey = key;
    return list;
  }

  @override
  Future<List<Category>> categoryTree() => guard(() async {
        final all = await _allCategories();
        List<Map<String, dynamic>> children(String id) =>
            all.where((c) => asId(c['parent_id']) == id).map((c) => {...c, 'children': children(c['id'] as String)}).toList();
        return all
            .where((c) => c['parent_id'] == null)
            .map((c) => Category.fromJson({...c, 'children': children(c['id'] as String)}))
            .toList();
      });

  @override
  Future<List<Category>> subcategories(String parentId) => guard(() async {
        final all = await _allCategories();
        return all.where((c) => asId(c['parent_id']) == parentId).map(Category.fromJson).toList();
      });

  @override
  Future<List<Brand>> brands() => guard(() async {
        final snap = await _db.collection('brands').where('status', isEqualTo: 'active').get();
        final list = snap.docs.map(docJson).toList()
          ..sort((a, b) => asInt(a['sort_order']).compareTo(asInt(b['sort_order'])));
        return list.map(Brand.fromJson).toList();
      });

  // ------------------------------------------------------------------ products

  static const _sortFields = <String, (String, bool)>{
    '': ('sold_count', true),
    'popular': ('sold_count', true),
    'price_asc': ('min_price', false),
    'price_desc': ('min_price', true),
    'newest': ('created_at', true),
    'rating': ('rating_avg', true),
    'discount': ('max_discount_percent', true),
  };

  /// Mode visibility: fulfillment type, and in quick mode the zone store must stock it.
  bool _visible(Map<String, dynamic> p, RepoScope s, {bool requireStock = true}) {
    if (!supportsMode(p['fulfillment_type'], s.mode)) return false;
    if (requireStock && s.isQuick && s.storeId.isNotEmpty && p['in_stock_store_ids'] is List) {
      return (p['in_stock_store_ids'] as List).map((e) => '$e').contains(s.storeId);
    }
    return true;
  }

  /// `store_stocks` of [storeId] for the variants of [products] (quick mode pricing / stock).
  Future<Map<String, Map<String, dynamic>>> _storeStocks(List<String> productIds, String storeId) async {
    final out = <String, Map<String, dynamic>>{};
    if (storeId.isEmpty || productIds.isEmpty) return out;
    final ids = productIds.toSet().toList();
    for (var i = 0; i < ids.length; i += 30) {
      final chunk = ids.sublist(i, i + 30 > ids.length ? ids.length : i + 30);
      final snap = await _db
          .collection('store_stocks')
          .where('store_id', isEqualTo: storeId)
          .where('product_id', whereIn: chunk)
          .get();
      for (final d in snap.docs) {
        out[asId(d.data()['variant_id'])] = d.data();
      }
    }
    return out;
  }

  /// Converts product docs to [Product]s with quick-mode store pricing applied.
  Future<List<Product>> _hydrate(List<Map<String, dynamic>> docs) async {
    final s = scope();
    final ss = s.isQuick ? await _storeStocks(docs.map((p) => p['id'] as String).toList(), s.storeId) : const <String, Map<String, dynamic>>{};
    return docs
        .map((p) => Product.fromJson(productJson(p['id'] as String, p,
            lang: s.lang, storeStocks: ss, deliveryMinutes: s.isQuick ? s.deliveryMinutes : 0)))
        .toList();
  }

  static List<String> _terms(String q) => q
      .toLowerCase()
      .split(RegExp(r'\s+'))
      .map((t) => t.replaceAll(RegExp(r'[^\p{L}\p{N}]', unicode: true), ''))
      .where((t) => t.length >= 2)
      .map((t) => t.length > 15 ? t.substring(0, 15) : t)
      .toList();

  @override
  Future<Paged<Product>> products(ProductQuery q) => guard(() async {
        final s = scope();
        final terms = _terms(q.q);
        final (field, desc) = _sortFields[q.sort] ?? _sortFields['']!;
        Query<Map<String, dynamic>> query = _products.where('status', isEqualTo: 'active');
        var limit = q.perPage * 2;
        var clientSort = false;
        if (terms.isNotEmpty) {
          // Search: one array-contains term server-side, everything else client-side.
          final first = terms.reduce((a, b) => b.length > a.length ? b : a);
          query = query.where('search_keywords', arrayContains: first).orderBy('sold_count', descending: true);
          limit = 100;
          clientSort = q.sort.isNotEmpty && q.sort != 'popular';
        } else if (q.categoryId != null && q.categoryId!.isNotEmpty) {
          query = query.where('category_ids', arrayContains: q.categoryId).orderBy(field, descending: desc);
          limit = 100;
        } else if (s.isQuick && s.storeId.isNotEmpty) {
          query = query.where('in_stock_store_ids', arrayContains: s.storeId).orderBy(field, descending: desc);
        } else {
          query = query.orderBy(field, descending: desc);
        }
        final snap = await query.limit(limit).get();
        var docs = snap.docs.map(docJson).where((p) => _visible(p, s)).where((p) {
          if (terms.length > 1) {
            final kw = asStringList(p['search_keywords']);
            if (!terms.every(kw.contains)) return false;
          }
          if (q.brandIds.isNotEmpty && !q.brandIds.contains(asId(p['brand_id']))) return false;
          if (q.categoryId != null && q.categoryId!.isNotEmpty && terms.isNotEmpty) {
            if (!asStringList(p['category_ids']).contains(q.categoryId)) return false;
          }
          return true;
        }).toList();
        var items = await _hydrate(docs);
        if (q.minPrice != null || q.maxPrice != null) {
          items = items.where((p) {
            final price = p.defaultVariant?.effectivePrice ?? 0;
            return (q.minPrice == null || price >= q.minPrice!) && (q.maxPrice == null || price <= q.maxPrice!);
          }).toList();
        }
        if (clientSort) _sortProducts(items, q.sort);
        items = items.take(q.perPage).toList();
        return Paged(items, total: items.length);
      });

  static void _sortProducts(List<Product> items, String sort) {
    double price(Product p) => p.defaultVariant?.effectivePrice ?? 0;
    switch (sort) {
      case 'price_asc':
        items.sort((a, b) => price(a).compareTo(price(b)));
      case 'price_desc':
        items.sort((a, b) => price(b).compareTo(price(a)));
      case 'rating':
        items.sort((a, b) => b.ratingAvg.compareTo(a.ratingAvg));
      case 'discount':
        items.sort((a, b) => (b.defaultVariant?.discountPercent ?? 0).compareTo(a.defaultVariant?.discountPercent ?? 0));
    }
  }

  /// Individual gets (rules only allow reading active products; inactive ids are skipped).
  Future<List<Map<String, dynamic>>> _byIds(Iterable<String> ids) async {
    final unique = ids.where((i) => i.isNotEmpty).toSet().take(20).toList();
    final snaps = await Future.wait(unique.map((id) => _products.doc(id).get().then<DocumentSnapshot<Map<String, dynamic>>?>((d) => d,
        onError: (Object _) => null)));
    return snaps.whereType<DocumentSnapshot<Map<String, dynamic>>>().where((d) => d.exists).map(docJson).toList();
  }

  @override
  Future<Product> product(String slug) => guard(() async {
        final s = scope();
        final bySlug = await _products.where('slug', isEqualTo: slug).where('status', isEqualTo: 'active').limit(1).get();
        Map<String, dynamic>? p = bySlug.docs.isEmpty ? null : docJson(bySlug.docs.first);
        p ??= (await _byIds([slug])).firstOrNull;
        if (p == null || p['status'] != 'active') throw const AppException('Product not found', code: 'not-found');
        final id = p['id'] as String;

        // Quick-mode store pricing for this product's variants.
        final ss = <String, Map<String, dynamic>>{};
        if (s.isQuick && s.storeId.isNotEmpty) {
          final refs = asMapList(p['variants']).map((v) => _db.doc('store_stocks/${s.storeId}_${asId(v['id'])}'));
          for (final d in await Future.wait(refs.map((r) => r.get()))) {
            if (d.exists) ss[asId(d.data()!['variant_id'])] = d.data()!;
          }
        }
        final cats = await _allCategories().catchError((Object _) => <Map<String, dynamic>>[]);
        final catName = asString(cats.where((c) => c['id'] == asId(p!['category_id'])).firstOrNull?['name']);

        final results = await Future.wait<Object?>([
          reviews(id).catchError((Object _) => <Review>[]),
          _byIds([...asStringList(p['cross_sell_ids']), ...asStringList(p['up_sell_ids'])]).catchError((Object _) => <Map<String, dynamic>>[]),
          _products
              .where('category_ids', arrayContains: asId(p['category_id']))
              .where('status', isEqualTo: 'active')
              .orderBy('sold_count', descending: true)
              .limit(13)
              .get()
              .then((q) => q.docs.map(docJson).toList(), onError: (Object _) => <Map<String, dynamic>>[]),
          _isFavorite(id),
        ]);
        final reviewList = results[0] as List<Review>;
        final also = (results[1] as List<Map<String, dynamic>>).where((x) => x['id'] != id && _visible(x, s)).toList();
        final similar =
            (results[2] as List<Map<String, dynamic>>).where((x) => x['id'] != id && _visible(x, s)).take(12).toList();
        final breakdown = <String, int>{};
        for (final r in reviewList) {
          breakdown['${r.rating}'] = (breakdown['${r.rating}'] ?? 0) + 1;
        }
        final json = productJson(id, p,
            lang: s.lang, storeStocks: ss, deliveryMinutes: s.isQuick ? s.deliveryMinutes : 0, categoryName: catName);
        final base = Product.fromJson({...json, 'is_favorite': results[3] == true, 'rating_breakdown': breakdown});
        final hydrated = await _hydrate([...also, ...similar]);
        return Product(
          id: base.id,
          name: base.name,
          slug: base.slug,
          shortDescription: base.shortDescription,
          description: base.description,
          images: base.images,
          thumbnail: base.thumbnail,
          categoryId: base.categoryId,
          categoryName: base.categoryName,
          brand: base.brand,
          ratingAvg: base.ratingAvg,
          ratingCount: base.ratingCount,
          isVeg: base.isVeg,
          variants: base.variants,
          deliveryMinutes: base.deliveryMinutes,
          isFavorite: base.isFavorite,
          returnAllowed: base.returnAllowed,
          returnDays: base.returnDays,
          cancelable: base.cancelable,
          codAllowed: base.codAllowed,
          maxQty: base.maxQty,
          ratingBreakdown: base.ratingBreakdown,
          reviews: reviewList.take(5).toList(),
          alsoBuy: hydrated.take(also.length).toList(),
          similar: hydrated.skip(also.length).toList(),
          storeName: base.storeName,
          fulfillmentType: base.fulfillmentType,
        );
      });

  Future<bool> _isFavorite(String productId) async {
    final u = Fb.auth.currentUser;
    if (u == null || u.isAnonymous) return false;
    try {
      return (await _db.doc('users/${u.uid}/favorites/$productId').get()).exists;
    } catch (_) {
      return false;
    }
  }

  @override
  Future<List<Review>> reviews(String productId) => guard(() async {
        final snap = await _db
            .collection('reviews')
            .where('product_id', isEqualTo: productId)
            .where('status', isEqualTo: 'active')
            .orderBy('created_at', descending: true)
            .limit(30)
            .get();
        return snap.docs.map(docJson).map(Review.fromJson).toList();
      });

  @override
  Future<SearchSuggestions> suggestions(String q) => guard(() async {
        final s = scope();
        final terms = _terms(q);
        if (terms.isEmpty) return const SearchSuggestions([], []);
        final snap = await _products
            .where('status', isEqualTo: 'active')
            .where('search_keywords', arrayContains: terms.first)
            .orderBy('sold_count', descending: true)
            .limit(15)
            .get();
        final products = snap.docs
            .map(docJson)
            .where((p) => _visible(p, s, requireStock: false))
            .where((p) => terms.every(asStringList(p['search_keywords']).contains))
            .take(8)
            .map((p) => (id: p['id'] as String, name: asText(p['name'], s.lang), slug: asString(p['slug'], p['id'] as String)))
            .toList();
        final lower = q.trim().toLowerCase();
        final cats = (await _allCategories())
            .where((c) => asString(c['name']).toLowerCase().contains(lower))
            .take(5)
            .map((c) => (id: c['id'] as String, name: asString(c['name'])))
            .toList();
        return SearchSuggestions(products, cats);
      });

  @override
  Future<List<String>> trending() => guard(() async {
        final settings = await _db.doc('settings/public').get();
        final hints = asStringList(settings.data()?['home_search_hints']);
        if (hints.isNotEmpty) return hints;
        final s = scope();
        final snap = await _products.where('status', isEqualTo: 'active').orderBy('sold_count', descending: true).limit(10).get();
        return snap.docs.map(docJson).where((p) => _visible(p, s, requireStock: false)).map((p) => asText(p['name'], s.lang)).take(8).toList();
      });
}
