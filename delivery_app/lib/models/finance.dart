import '../core/format.dart';

class Earning {
  Earning({
    required this.id,
    required this.amount,
    required this.type,
    this.orderNumber,
    this.status = 'credited',
    this.date,
  });

  final String id;
  final double amount;
  final String type; // commission | bonus | salary
  final String? orderNumber;
  final String status;
  final DateTime? date;

  factory Earning.fromJson(Map<String, dynamic> j) => Earning(
        id: asString(j['id']),
        amount: asDouble(j['amount']),
        type: asString(j['type'], 'commission'),
        orderNumber: asStringOrNull(j['order_number'] ?? (j['order'] is Map ? j['order']['order_number'] : null)),
        status: asString(j['status'], 'credited'),
        date: asDate(j['created_at'] ?? j['date']),
      );
}

class EarningsSummary {
  EarningsSummary({
    required this.today,
    required this.week,
    required this.month,
    required this.total,
    required this.items,
  });

  final double today;
  final double week;
  final double month;
  final double total;
  final List<Earning> items;

  factory EarningsSummary.fromJson(Map<String, dynamic> j) {
    final s = asMap(j['summary']).isNotEmpty ? asMap(j['summary']) : j;
    return EarningsSummary(
      today: asDouble(s['today']),
      week: asDouble(s['week'] ?? s['this_week']),
      month: asDouble(s['month'] ?? s['this_month']),
      total: asDouble(s['total']),
      items: asMapList(j['items'] ?? j['list'] ?? j['earnings']).map(Earning.fromJson).toList(),
    );
  }
}

class CashCollection {
  CashCollection({
    required this.id,
    required this.amount,
    this.orderId,
    this.orderNumber,
    this.type = 'collected_from_customer',
    this.message = '',
    this.status = 'success',
    this.date,
    this.shortAmount = 0,
  });

  final String id;
  final String? orderId;
  final String? orderNumber;
  final double amount;
  final String type;
  final String message;
  final String status;
  final DateTime? date;

  /// Payable minus the cash actually received (`short_amount`, set when the rider collected less).
  final double shortAmount;

  factory CashCollection.fromJson(Map<String, dynamic> j) => CashCollection(
        id: asString(j['id']),
        orderId: asStringOrNull(j['order_id']),
        orderNumber: asStringOrNull(j['order_number']),
        amount: asDouble(j['amount']),
        type: asString(j['type'], 'collected_from_customer'),
        message: asString(j['message']),
        status: asString(j['status'], 'success'),
        date: asDate(j['created_at'] ?? j['date']),
        shortAmount: asDouble(j['short_amount']),
      );
}

class CashSummary {
  CashSummary({required this.cashInHand, required this.cashCollected, required this.items});
  final double cashInHand;
  final double cashCollected;
  final List<CashCollection> items;

  factory CashSummary.fromJson(Map<String, dynamic> j) => CashSummary(
        cashInHand: asDouble(j['cash_in_hand']),
        cashCollected: asDouble(j['cash_collected']),
        items: asMapList(j['items']).map(CashCollection.fromJson).toList(),
      );
}

class WalletTxn {
  WalletTxn({
    required this.id,
    required this.type,
    required this.amount,
    this.message = '',
    this.status = 'success',
    this.paymentType,
    this.date,
  });

  final String id;
  final String type; // credit | debit
  final double amount;
  final String message;
  final String status;
  final String? paymentType;
  final DateTime? date;

  bool get isCredit => type == 'credit';

  factory WalletTxn.fromJson(Map<String, dynamic> j) => WalletTxn(
        id: asString(j['id']),
        type: asString(j['type'], 'credit'),
        amount: asDouble(j['amount']),
        message: asString(j['message']),
        status: asString(j['status'], 'success'),
        paymentType: asStringOrNull(j['payment_type']),
        date: asDate(j['created_at']),
      );
}

class Withdrawal {
  Withdrawal({
    required this.id,
    required this.amount,
    this.message,
    this.status = 'pending',
    this.remark,
    this.date,
  });

  final String id;
  final double amount;
  final String? message;
  final String status;
  final String? remark;
  final DateTime? date;

  factory Withdrawal.fromJson(Map<String, dynamic> j) => Withdrawal(
        id: asString(j['id']),
        amount: asDouble(j['amount']),
        message: asStringOrNull(j['message']),
        status: asString(j['status'], 'pending'),
        remark: asStringOrNull(j['remark']),
        date: asDate(j['created_at']),
      );
}

class WalletSummary {
  WalletSummary({required this.balance, required this.withdrawals, required this.transactions});
  final double balance;
  final List<Withdrawal> withdrawals;
  final List<WalletTxn> transactions;

  factory WalletSummary.fromJson(Map<String, dynamic> j) => WalletSummary(
        balance: asDouble(j['balance'] ?? j['wallet_balance']),
        withdrawals: asMapList(j['withdrawals'] ?? j['requests']).map(Withdrawal.fromJson).toList(),
        transactions: asMapList(j['transactions']).map(WalletTxn.fromJson).toList(),
      );
}
