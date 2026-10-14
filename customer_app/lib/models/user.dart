import 'json.dart';

class AppUser {
  final String id;
  final String name;
  final String email;
  final String phone;
  final String countryCode;
  final String avatar;
  final String referralCode;
  final double walletBalance;

  const AppUser({
    required this.id,
    required this.name,
    this.email = '',
    this.phone = '',
    this.countryCode = '+91',
    this.avatar = '',
    this.referralCode = '',
    this.walletBalance = 0,
  });

  factory AppUser.fromJson(Map<String, dynamic> j) => AppUser(
        id: asId(j['id']),
        name: asString(j['name']),
        email: asString(j['email']),
        phone: asString(j['phone']),
        countryCode: asString(j['country_code'], '+91'),
        avatar: asString(j['avatar']),
        referralCode: asString(j['referral_code']),
        walletBalance: asDouble(j['wallet_balance']),
      );

  /// Phone for display: Firebase stores E.164 (`+919876543210`); legacy local numbers get the dial code.
  String get displayPhone => phone.isEmpty || phone.startsWith('+') ? phone : '$countryCode $phone';

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'email': email,
        'phone': phone,
        'country_code': countryCode,
        'avatar': avatar,
        'referral_code': referralCode,
        'wallet_balance': walletBalance,
      };

  String get initials {
    final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
    if (parts.isEmpty) return 'S';
    return parts.take(2).map((p) => p[0].toUpperCase()).join();
  }
}

class Address {
  final String id;
  final String label;
  final String name;
  final String phone;
  final String addressLine;
  final String landmark;
  final String city;
  final String state;
  final String pincode;
  final double? lat;
  final double? lng;
  final bool isDefault;

  const Address({
    required this.id,
    this.label = 'Home',
    this.name = '',
    this.phone = '',
    this.addressLine = '',
    this.landmark = '',
    this.city = '',
    this.state = '',
    this.pincode = '',
    this.lat,
    this.lng,
    this.isDefault = false,
  });

  factory Address.fromJson(Map<String, dynamic> j) => Address(
        id: asId(j['id']),
        label: asString(j['label'], 'Home'),
        name: asString(j['name']),
        phone: asString(j['phone']),
        addressLine: asString(j['address_line'] ?? j['address']),
        landmark: asString(j['landmark']),
        city: asString(j['city']),
        state: asString(j['state']),
        pincode: asString(j['pincode']),
        lat: asDoubleOrNull(j['lat']),
        lng: asDoubleOrNull(j['lng']),
        isDefault: asBool(j['is_default']),
      );

  Map<String, dynamic> toJson() => {
        'label': label,
        'name': name,
        'phone': phone,
        'address_line': addressLine,
        'landmark': landmark,
        'city': city,
        'state': state,
        'pincode': pincode,
        'lat': lat,
        'lng': lng,
        'is_default': isDefault,
      };

  String get fullAddress => [addressLine, landmark, city, state, pincode].where((s) => s.isNotEmpty).join(', ');
}

class Country {
  final String id;
  final String name;
  final String iso2;
  final String dialCode;
  final String currencyCode;
  final String currencySymbol;
  final String flag;
  final bool isDefault;

  const Country({
    required this.id,
    required this.name,
    this.iso2 = 'IN',
    this.dialCode = '+91',
    this.currencyCode = 'INR',
    this.currencySymbol = '₹',
    this.flag = '🇮🇳',
    this.isDefault = false,
  });

  factory Country.fromJson(Map<String, dynamic> j) => Country(
        id: asId(j['id']),
        name: asString(j['name']),
        iso2: asString(j['iso2'], 'IN'),
        dialCode: asString(j['dial_code'], '+91'),
        currencyCode: asString(j['currency_code'], 'INR'),
        currencySymbol: asString(j['currency_symbol'], '₹'),
        flag: asString(j['flag'], '🏳️'),
        isDefault: asBool(j['is_default']),
      );

  static const india = Country(id: '1', name: 'India', isDefault: true);
}

class Zone {
  final String id;
  final String name;
  final String city;
  final String address;
  final String countryId;
  /// Store that serves quick orders in this zone (`default_store_id`).
  final String defaultStoreId;
  final String fulfillmentType;
  final int deliveryMinutes;
  final double minOrder;
  final double? lat;
  final double? lng;

  const Zone({
    required this.id,
    required this.name,
    this.city = '',
    this.address = '',
    this.countryId = '1',
    this.defaultStoreId = '',
    this.fulfillmentType = 'both',
    this.deliveryMinutes = 8,
    this.minOrder = 0,
    this.lat,
    this.lng,
  });

  factory Zone.fromJson(Map<String, dynamic> j) => Zone(
        id: asId(j['id']),
        name: asString(j['name']),
        city: asString(j['city']),
        address: asString(j['address']),
        countryId: asString(j['country_id'], '1'),
        defaultStoreId: asId(j['default_store_id']),
        fulfillmentType: asString(j['fulfillment_type'], 'both'),
        deliveryMinutes: asInt(j['delivery_time_minutes'] ?? j['delivery_minutes'], 8),
        minOrder: asDouble(j['min_order']),
        lat: asDoubleOrNull(j['lat'] ?? j['center_lat'] ?? asMap(j['center'])['lat']),
        lng: asDoubleOrNull(j['lng'] ?? j['center_lng'] ?? asMap(j['center'])['lng']),
      );
}

class ZoneDetectResult {
  final Zone? zone;
  final String storeId;
  final String storeName;
  final double distanceKm;
  final int deliveryMinutes;
  final bool deliverable;

  const ZoneDetectResult({
    this.zone,
    this.storeId = '',
    this.storeName = '',
    this.distanceKm = 0,
    this.deliveryMinutes = 0,
    this.deliverable = false,
  });

  factory ZoneDetectResult.fromJson(Map<String, dynamic> j) {
    final z = asMapOrNull(j['zone']);
    return ZoneDetectResult(
      zone: z == null ? null : Zone.fromJson(z),
      storeId: asId(asMap(j['store'])['id']),
      storeName: asString(asMap(j['store'])['name']),
      distanceKm: asDouble(j['distance_km']),
      deliveryMinutes: asInt(j['delivery_minutes'], 8),
      deliverable: asBool(j['deliverable']),
    );
  }
}

class PaymentGateway {
  final String key;
  final String name;
  final bool enabled;
  final String publicKey;
  const PaymentGateway({required this.key, required this.name, this.enabled = true, this.publicKey = ''});

  factory PaymentGateway.fromJson(Map<String, dynamic> j) => PaymentGateway(
        key: asString(j['key']),
        name: asString(j['name']),
        enabled: asBool(j['enabled'], true),
        publicKey: asString(j['public_key'] ?? asMap(j['config'])['public_key'] ?? asMap(j['config'])['key']),
      );
}

class AppSettings {
  final String appName;
  final String currencySymbol;
  final bool demoMode;
  final String supportPhone;
  final String supportEmail;
  final List<PaymentGateway> paymentGateways;
  final List<Country> countries;
  final double referrerReward;
  final double referredReward;
  final double referralMinOrder;
  final bool referralEnabled;
  final List<String> searchHints;
  final String defaultZoneId;

  const AppSettings({
    this.referralMinOrder = 0,
    this.referralEnabled = true,
    this.searchHints = const [],
    this.defaultZoneId = '',
    this.appName = 'QwikMart',
    this.currencySymbol = '₹',
    this.demoMode = false,
    this.supportPhone = '',
    this.supportEmail = '',
    this.paymentGateways = const [],
    this.countries = const [],
    this.referrerReward = 50,
    this.referredReward = 100,
  });

  factory AppSettings.fromJson(Map<String, dynamic> j) {
    final referral = asMap(j['referral']);
    var gateways = j['payment_methods'] ?? j['payment_gateways'];
    List<PaymentGateway> parsed;
    if (gateways is Map) {
      parsed = gateways.entries
          .map((e) => PaymentGateway.fromJson({'key': e.key, ...asMap(e.value)}))
          .toList();
    } else {
      parsed = asMapList(gateways).map(PaymentGateway.fromJson).toList();
    }
    return AppSettings(
      appName: asString(j['app_name'], 'QwikMart'),
      currencySymbol: asString(j['currency_symbol'] ?? asMap(j['currency'])['symbol'], '₹'),
      demoMode: asBool(j['demo_mode'], false),
      supportPhone: asString(j['support_phone'] ?? asMap(j['support'])['phone']),
      supportEmail: asString(j['support_email'] ?? asMap(j['support'])['email']),
      paymentGateways: parsed.where((g) => g.enabled).toList(),
      countries: asMapList(j['countries']).map(Country.fromJson).toList(),
      referrerReward: asDouble(referral['referrer_reward'], 50),
      referredReward: asDouble(referral['referred_reward'], 100),
      referralMinOrder: asDouble(referral['min_order']),
      referralEnabled: asBool(referral['enabled'], true),
      searchHints: asStringList(j['home_search_hints']),
      defaultZoneId: asId(j['default_zone_id']),
    );
  }
}
