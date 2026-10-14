import 'json.dart';

class WalletTxn {
  final String id;
  final String type; // credit | debit
  final double amount;
  final double balanceAfter;
  final String paymentType;
  final String txnId;
  final String? orderId;
  final String message;
  final String status;
  final DateTime? createdAt;

  const WalletTxn({
    required this.id,
    required this.type,
    required this.amount,
    this.balanceAfter = 0,
    this.paymentType = '',
    this.txnId = '',
    this.orderId,
    this.message = '',
    this.status = 'success',
    this.createdAt,
  });

  factory WalletTxn.fromJson(Map<String, dynamic> j) => WalletTxn(
        id: asId(j['id']),
        type: asString(j['type'], 'credit'),
        amount: asDouble(j['amount']),
        balanceAfter: asDouble(j['balance_after']),
        paymentType: asString(j['payment_type']),
        txnId: asString(j['txn_id']),
        orderId: asIdOrNull(j['order_id']),
        message: asString(j['message']),
        status: asString(j['status'], 'success'),
        createdAt: asDate(j['created_at']),
      );

  bool get isCredit => type == 'credit';
}

/// A `withdrawal_requests` doc of the current user.
class WithdrawalRequest {
  final String id;
  final double amount;
  final String status; // pending | approved | rejected
  final String message;
  final String remark;
  final DateTime? createdAt;
  const WithdrawalRequest({required this.id, required this.amount, this.status = 'pending', this.message = '', this.remark = '', this.createdAt});

  factory WithdrawalRequest.fromJson(Map<String, dynamic> j) => WithdrawalRequest(
        id: asId(j['id']),
        amount: asDouble(j['amount']),
        status: asString(j['status'], 'pending'),
        message: asString(j['message']),
        remark: asString(j['remark']),
        createdAt: asDate(j['created_at']),
      );
}

class WalletData {
  final double balance;
  final List<WalletTxn> transactions;
  final List<WithdrawalRequest> withdrawals;
  const WalletData({required this.balance, required this.transactions, this.withdrawals = const []});

  factory WalletData.fromJson(Map<String, dynamic> j) => WalletData(
        balance: asDouble(j['balance']),
        transactions: asMapList(j['transactions']).map(WalletTxn.fromJson).toList(),
      );

  /// Real API shape: `data` = paginated transactions, `meta.balance`.
  factory WalletData.fromList(List<Map<String, dynamic>> txns, Map<String, dynamic>? meta) => WalletData(
        balance: asDouble(meta?['balance']),
        transactions: txns.map(WalletTxn.fromJson).toList(),
      );
}

class ReferralEntry {
  final String name;
  final String status;
  final double reward;
  final DateTime? createdAt;
  const ReferralEntry({required this.name, this.status = 'pending', this.reward = 0, this.createdAt});

  factory ReferralEntry.fromJson(Map<String, dynamic> j) => ReferralEntry(
        name: asString(j['name'] ?? asMap(j['referred'])['name'], 'Friend'),
        status: asString(j['status'], 'pending'),
        reward: asDouble(j['reward'] ?? j['referrer_reward']),
        createdAt: asDate(j['joined_at'] ?? j['created_at']),
      );
}

class ReferralInfo {
  final String code;
  final double referrerReward;
  final double referredReward;
  final double minOrder;
  final double totalEarned;
  final List<ReferralEntry> referrals;

  const ReferralInfo({
    required this.code,
    this.referrerReward = 50,
    this.referredReward = 100,
    this.minOrder = 100,
    this.totalEarned = 0,
    this.referrals = const [],
  });

  factory ReferralInfo.fromJson(Map<String, dynamic> j) => ReferralInfo(
        code: asString(j['code']),
        referrerReward: asDouble(j['referrer_reward'], 50),
        referredReward: asDouble(j['referred_reward'], 100),
        minOrder: asDouble(j['min_order'], 100),
        totalEarned: asDouble(j['total_earned']),
        referrals: asMapList(j['referrals']).map(ReferralEntry.fromJson).toList(),
      );
}
