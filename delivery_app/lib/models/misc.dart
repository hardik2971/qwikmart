import '../core/format.dart';
import 'order.dart';

class ReturnPickup {
  ReturnPickup({
    required this.id,
    required this.returnNumber,
    required this.orderNumber,
    required this.productName,
    this.image,
    this.qty = 1,
    this.reason = '',
    this.status = 'pickup_assigned',
    required this.customer,
    this.storeName = '',
    this.refundAmount = 0,
    this.date,
  });

  final String id;
  final String returnNumber;
  final String orderNumber;
  final String productName;
  final String? image;
  final int qty;
  final String reason;
  String status;
  final Customer customer;
  final String storeName;
  final double refundAmount;
  final DateTime? date;

  bool get isPickedUp => status == 'picked_up' || status == 'refund_completed';

  factory ReturnPickup.fromJson(Map<String, dynamic> j) {
    final order = asMap(j['order']);
    final item = asMap(j['order_item'] ?? j['item']);
    final cust = {...asMap(order['address_snapshot']), ...asMap(j['customer'] ?? j['user'])};
    return ReturnPickup(
      id: asString(j['id']),
      returnNumber: asString(j['return_number'], 'RET-${j['id']}'),
      orderNumber: asString(j['order_number'] ?? order['order_number']),
      productName: asString(j['product_name'] ?? item['product_name'] ?? item['name'], 'Product'),
      image: asStringOrNull(j['image'] ?? item['image']),
      qty: asInt(j['qty'], 1),
      reason: asString(j['reason']),
      status: asString(j['status'], 'pickup_assigned'),
      customer: Customer.fromJson(cust),
      storeName: asString(j['store_name'] ?? asMap(order['store'])['name']),
      refundAmount: asDouble(j['refund_amount']),
      date: asDate(j['created_at']),
    );
  }
}

class ChatMessage {
  ChatMessage({
    required this.id,
    required this.message,
    required this.isMine,
    required this.createdAt,
    this.senderName,
    this.read = false,
    this.chatId,
  });

  /// Thread the message belongs to (Firestore chat id).
  final String? chatId;
  final String id;
  final String message;
  final bool isMine;
  final DateTime createdAt;
  final String? senderName;
  final bool read;

  factory ChatMessage.fromJson(Map<String, dynamic> j) => ChatMessage(
        id: asString(j['id']),
        message: asString(j['message']),
        isMine: j.containsKey('is_mine') ? asBool(j['is_mine']) : asString(j['sender_type']) == 'delivery_boy',
        createdAt: asDate(j['created_at']) ?? DateTime.now(),
        senderName: asStringOrNull(j['sender_name'] ?? asMap(j['sender'])['name']),
        chatId: asStringOrNull(j['chat_id']),
        read: j['read_at'] != null,
      );
}

class ChatThread {
  ChatThread({required this.id, required this.subject, this.orderId});

  /// Thread not created on the server yet (created in Firestore together with
  /// its first message); it gets its real id from the first sent message.
  ChatThread.draft({required this.subject, this.orderId}) : id = '';

  final String id;
  final String subject;
  final String? orderId;

  bool get isDraft => id.isEmpty;

  factory ChatThread.fromJson(Map<String, dynamic> j) => ChatThread(
        id: asString(j['id']),
        subject: asString(j['subject'], 'Support'),
        orderId: asStringOrNull(j['order_id']),
      );
}

class AppNotification {
  AppNotification({
    required this.id,
    required this.title,
    required this.message,
    this.type = 'default',
    this.createdAt,
    this.read = false,
    this.orderId,
  });

  final String id;
  final String title;
  final String message;
  final String type;
  final DateTime? createdAt;
  bool read;
  final String? orderId;

  factory AppNotification.fromJson(Map<String, dynamic> j) {
    final data = asMap(j['data']);
    return AppNotification(
      id: asString(j['id']),
      title: asString(j['title']),
      message: asString(j['message'] ?? j['body']),
      type: asString(data['type'] ?? j['type'], 'default'),
      createdAt: asDate(j['created_at']),
      read: j['read_at'] != null || asBool(j['read'] ?? j['is_read']),
      orderId: asStringOrNull(data['order_id'] ?? j['order_id']),
    );
  }
}
