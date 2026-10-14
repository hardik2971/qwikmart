import '../core/format.dart';

class DeliveryProfile {
  DeliveryProfile({
    required this.id,
    required this.name,
    required this.email,
    this.phone,
    this.countryCode = '+91',
    this.avatar,
    this.dob,
    this.address,
    this.country,
    this.zone,
    this.vehicleType,
    this.vehicleNumber,
    this.drivingLicense,
    this.idProof,
    this.bankName,
    this.bankAccount,
    this.ifsc,
    this.approvalStatus = 'approved',
    this.isOnline = false,
    this.rating = 0,
    this.joinedAt,
    this.zoneId,
    this.approvalRemark,
    this.status = 'active',
    this.commissionType = 'fixed',
    this.commissionValue = 0,
    this.cashInHand = 0,
    this.walletBalance = 0,
  });

  final String id;
  final String name;
  final String email;
  final String? phone;
  final String countryCode;
  final String? avatar;
  final DateTime? dob;
  final String? address;
  final String? country;
  final String? zone;
  final String? vehicleType;
  final String? vehicleNumber;
  final String? drivingLicense;
  final String? idProof;
  final String? bankName;
  final String? bankAccount;
  final String? ifsc;
  final String approvalStatus;
  final bool isOnline;
  final double rating;
  final DateTime? joinedAt;
  final String? zoneId;
  final String? approvalRemark;

  /// `delivery_boys.status`: active | inactive.
  final String status;

  /// `percent` of the order total or a `fixed` amount per delivery (delivery_boys.commission_*).
  final String commissionType;
  final double commissionValue;
  final double cashInHand;
  final double walletBalance;

  bool get isRejected => approvalStatus == 'rejected';
  bool get isActive => status != 'inactive';

  /// Commission the rider earns for an order (mirrors functions `commissionFor`).
  double commissionFor(double orderTotal) {
    final v = commissionType == 'percent' ? orderTotal * commissionValue / 100 : commissionValue;
    return (v * 100).roundToDouble() / 100;
  }

  bool get isApproved => approvalStatus == 'approved';
  String get firstName => name.split(' ').first;
  String get initials {
    final p = name.trim().split(RegExp(r'\s+'));
    if (p.isEmpty || p.first.isEmpty) return '?';
    return (p.first[0] + (p.length > 1 ? p.last[0] : '')).toUpperCase();
  }

  DeliveryProfile copyWith({String? name, String? phone, String? address, String? vehicleType, String? vehicleNumber}) =>
      DeliveryProfile(
        id: id,
        name: name ?? this.name,
        email: email,
        phone: phone ?? this.phone,
        countryCode: countryCode,
        avatar: avatar,
        dob: dob,
        address: address ?? this.address,
        country: country,
        zone: zone,
        vehicleType: vehicleType ?? this.vehicleType,
        vehicleNumber: vehicleNumber ?? this.vehicleNumber,
        drivingLicense: drivingLicense,
        idProof: idProof,
        bankName: bankName,
        bankAccount: bankAccount,
        ifsc: ifsc,
        approvalStatus: approvalStatus,
        isOnline: isOnline,
        rating: rating,
        joinedAt: joinedAt,
        zoneId: zoneId,
        approvalRemark: approvalRemark,
        status: status,
        commissionType: commissionType,
        commissionValue: commissionValue,
        cashInHand: cashInHand,
        walletBalance: walletBalance,
      );

  /// Accepts either a flat object or `{user:{...}, delivery_boy:{...}}`.
  factory DeliveryProfile.fromJson(Map<String, dynamic> j) {
    final user = asMap(j['user']).isNotEmpty ? asMap(j['user']) : j;
    final db = asMap(j['delivery_boy'] ?? user['delivery_boy'] ?? j['profile']);
    final m = {...user, ...db};
    String? nameOf(dynamic v) => v is Map ? asStringOrNull(v['name']) : asStringOrNull(v);
    return DeliveryProfile(
      id: asString(user['id'] ?? user['uid']),
      name: asString(user['name'], 'Rider'),
      email: asString(user['email']),
      phone: asStringOrNull(user['phone']),
      countryCode: asString(user['country_code'], '+91'),
      avatar: asStringOrNull(user['avatar']),
      dob: asDate(m['dob']),
      address: asStringOrNull(m['address']),
      country: nameOf(m['country'] ?? m['country_name']),
      zone: nameOf(m['zone'] ?? m['zone_name']),
      vehicleType: asStringOrNull(m['vehicle_type']),
      vehicleNumber: asStringOrNull(m['vehicle_number']),
      drivingLicense: asStringOrNull(m['driving_license']),
      idProof: asStringOrNull(m['id_proof']),
      bankName: asStringOrNull(m['bank_name'] ?? asMap(m['bank'])['name']),
      bankAccount: asStringOrNull(m['bank_account'] ?? asMap(m['bank'])['account']),
      ifsc: asStringOrNull(m['ifsc'] ?? asMap(m['bank'])['ifsc']),
      approvalStatus: asString(m['approval_status'], 'approved'),
      isOnline: asBool(m['is_online']),
      rating: asDouble(m['rating'] ?? m['rating_avg']),
      joinedAt: asDate(user['created_at']),
      zoneId: asStringOrNull(m['zone_id']),
      approvalRemark: asStringOrNull(m['approval_remark']),
      status: asString(db['status'], 'active'),
      commissionType: asString(m['commission_type'], 'fixed'),
      commissionValue: asDouble(m['commission_value']),
      cashInHand: asDouble(m['cash_in_hand']),
      walletBalance: asDouble(user['wallet_balance']),
    );
  }
}

class Dashboard {
  Dashboard({
    required this.todayEarnings,
    required this.cashInHand,
    required this.deliveredToday,
    required this.rating,
    this.pending = 0,
    this.active = 0,
    this.isOnline = false,
  });

  final double todayEarnings;
  final double cashInHand;
  final int deliveredToday;
  final double rating;
  final int pending;
  final int active;
  final bool isOnline;

  factory Dashboard.fromJson(Map<String, dynamic> j) => Dashboard(
        todayEarnings: asDouble(j['today_earnings'] ?? j['today_earning']),
        cashInHand: asDouble(j['cash_in_hand']),
        deliveredToday: asInt(j['delivered_today'] ?? j['delivered_count'] ?? j['deliveries_today'] ?? j['delivered']),
        rating: asDouble(j['rating'], 4.8),
        pending: asInt(j['available_count'] ?? j['pending_count'] ?? j['pending']),
        active: asInt(j['active_count'] ?? j['active']),
        isOnline: asBool(j['is_online']),
      );
}

class Country {
  Country({required this.id, required this.name, this.dialCode = '+91', this.flag = ''});
  final String id;
  final String name;
  final String dialCode;
  final String flag;

  factory Country.fromJson(Map<String, dynamic> j) => Country(
        id: asString(j['id']),
        name: asString(j['name']),
        dialCode: asString(j['dial_code'], '+91'),
        flag: asString(j['flag']),
      );
}

class Zone {
  Zone({required this.id, required this.name, required this.countryId, this.city = ''});
  final String id;
  final String name;
  final String countryId;
  final String city;

  factory Zone.fromJson(Map<String, dynamic> j) => Zone(
        id: asString(j['id']),
        name: asString(j['name']),
        countryId: asString(j['country_id']),
        city: asString(j['city']),
      );
}

/// A picked document (bytes so it works on web + mobile).
class PickedDoc {
  PickedDoc({required this.name, required this.bytes});
  final String name;
  final List<int> bytes;
  bool get isPdf => name.toLowerCase().endsWith('.pdf');
}

/// Data collected by the Create Account stepper (→ Storage `delivery_docs/{uid}/…` + `registerDeliveryBoy`).
class RegistrationData {
  String name = '';
  String email = '';
  String phone = '';
  String countryCode = '+91';
  String password = '';
  DateTime? dob;
  String? countryId;
  String? zoneId;
  String address = '';
  String vehicleType = 'Bike';
  String vehicleNumber = '';
  PickedDoc? drivingLicense;
  PickedDoc? idProof;
  String bankName = '';
  String bankAccount = '';
  String ifsc = '';
}
