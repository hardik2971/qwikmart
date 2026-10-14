import 'catalog.dart';
import 'json.dart';

class HomeHeader {
  final String bgType; // color | image
  final String bgValue;
  final String textColor;
  const HomeHeader({this.bgType = 'color', this.bgValue = '', this.textColor = '#111827'});

  factory HomeHeader.fromJson(Map<String, dynamic> j) => HomeHeader(
        bgType: asString(j['bg_type'], 'color'),
        bgValue: asString(j['bg_value']),
        textColor: asString(j['text_color'], '#111827'),
      );
}

/// Banner (used by banner_slider, grid_banner and title_image sections).
/// Real API banners usually only carry `image`; the mock adds rich fields so banners
/// render nicely without network images.
class BannerItem {
  final String id;
  final String title;
  final String subtitle;
  final String image;
  final String linkType; // product | category | url | none
  final String linkValue;
  final String bgColor;
  final String bgColor2;
  final String accent;
  final String emoji;
  final String badge;
  final String cta;

  const BannerItem({
    required this.id,
    this.title = '',
    this.subtitle = '',
    this.image = '',
    this.linkType = 'none',
    this.linkValue = '',
    this.bgColor = '#E6F4E9',
    this.bgColor2 = '',
    this.accent = '#0E9623',
    this.emoji = '',
    this.badge = '',
    this.cta = '',
  });

  factory BannerItem.fromJson(Map<String, dynamic> j) => BannerItem(
        id: asId(j['id']),
        title: asText(j['title']),
        subtitle: asText(j['subtitle']),
        image: asString(j['image']),
        linkType: asString(j['link_type'], 'none'),
        linkValue: asString(j['link_value']),
        bgColor: asString(j['bg_color'], '#E6F4E9'),
        bgColor2: asString(j['bg_color2']),
        accent: asString(j['accent'], '#0E9623'),
        emoji: asString(j['emoji']),
        badge: asString(j['badge']),
        cta: asString(j['cta']),
      );
}

class HomeSection {
  final String id;
  final String type;
  final String title;
  final String subtitle;
  final Map<String, dynamic> settings;
  final List<Map<String, dynamic>> rawItems;

  const HomeSection({
    required this.id,
    required this.type,
    this.title = '',
    this.subtitle = '',
    this.settings = const {},
    this.rawItems = const [],
  });

  factory HomeSection.fromJson(Map<String, dynamic> j) {
    final settings = asMap(j['settings']);
    return HomeSection(
      id: asString(j['id']),
      type: asString(j['type']),
      title: asText(j['title']),
      subtitle: asText(j['subtitle'] ?? settings['subtitle']),
      settings: settings,
      rawItems: asMapList(j['items']),
    );
  }

  List<BannerItem> get banners => rawItems.map(BannerItem.fromJson).toList();
  List<Category> get categories => rawItems.map(Category.fromJson).toList();
  List<Product> get products => rawItems.map(Product.fromJson).toList();
  List<Brand> get brands => rawItems.map(Brand.fromJson).toList();
}

class HomeData {
  final HomeHeader header;
  final List<Category> categories;
  final List<HomeSection> sections;
  const HomeData({required this.header, required this.categories, required this.sections});

  factory HomeData.fromJson(Map<String, dynamic> j) => HomeData(
        header: HomeHeader.fromJson(asMap(j['header'])),
        categories: asMapList(j['categories']).map(Category.fromJson).toList(),
        sections: asMapList(j['sections']).map(HomeSection.fromJson).toList(),
      );
}
