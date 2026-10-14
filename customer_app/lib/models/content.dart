import 'json.dart';

class BlogCategory {
  final String id;
  final String name;
  final String slug;
  const BlogCategory({required this.id, required this.name, this.slug = ''});
  factory BlogCategory.fromJson(Map<String, dynamic> j) =>
      BlogCategory(id: asId(j['id']), name: asText(j['name']), slug: asString(j['slug']));
}

class Blog {
  final String id;
  final String title;
  final String slug;
  final String image;
  final String excerpt;
  final String content;
  final int readMinutes;
  final int views;
  final BlogCategory? category;
  final DateTime? createdAt;

  const Blog({
    required this.id,
    required this.title,
    this.slug = '',
    this.image = '',
    this.excerpt = '',
    this.content = '',
    this.readMinutes = 2,
    this.views = 0,
    this.category,
    this.createdAt,
  });

  factory Blog.fromJson(Map<String, dynamic> j) {
    final c = asMapOrNull(j['category']);
    return Blog(
      id: asId(j['id']),
      title: asText(j['title']),
      slug: asString(j['slug']),
      image: asString(j['image']),
      excerpt: asText(j['excerpt']),
      content: asText(j['content']),
      readMinutes: asInt(j['read_minutes'], 2),
      views: asInt(j['views']),
      category: c == null ? null : BlogCategory.fromJson(c),
      createdAt: asDate(j['published_at'] ?? j['created_at']),
    );
  }
}

class Faq {
  final String id;
  final String question;
  final String answer;
  const Faq({required this.id, required this.question, required this.answer});
  factory Faq.fromJson(Map<String, dynamic> j) =>
      Faq(id: asId(j['id']), question: asText(j['question']), answer: asText(j['answer']));
}

class CmsPage {
  final String slug;
  final String title;
  final String content;
  const CmsPage({required this.slug, required this.title, required this.content});
  factory CmsPage.fromJson(Map<String, dynamic> j) =>
      CmsPage(slug: asString(j['slug']), title: asText(j['title']), content: asText(j['content']));
}

class AppNotification {
  final String id;
  final String title;
  final String message;
  final String type;
  final String image;
  final Map<String, dynamic> data;
  final DateTime? readAt;
  final DateTime? createdAt;

  const AppNotification({
    required this.id,
    required this.title,
    this.message = '',
    this.type = 'default',
    this.image = '',
    this.data = const {},
    this.readAt,
    this.createdAt,
  });

  factory AppNotification.fromJson(Map<String, dynamic> j) {
    final data = asMap(j['data']);
    return AppNotification(
      id: asId(j['id']),
      title: asString(j['title']),
      message: asString(j['message']),
      type: asString(j['type'] ?? data['type'], 'default'),
      image: asString(j['image']),
      data: data,
      readAt: asDate(j['read_at']) ?? (asBool(j['is_read']) ? asDate(j['created_at']) ?? DateTime.now() : null),
      createdAt: asDate(j['created_at']),
    );
  }

  bool get isRead => readAt != null;
}

class ChatThread {
  final String id;
  final String subject;
  final String? orderId;
  final String orderNumber;
  final int unread;
  final String status;
  final String lastMessage;
  final DateTime? lastMessageAt;

  const ChatThread({
    required this.id,
    this.subject = '',
    this.orderId,
    this.orderNumber = '',
    this.unread = 0,
    this.status = 'open',
    this.lastMessage = '',
    this.lastMessageAt,
  });

  factory ChatThread.fromJson(Map<String, dynamic> j) => ChatThread(
        id: asId(j['id']),
        subject: asString(j['subject']),
        orderId: asIdOrNull(j['order_id']),
        orderNumber: asString(j['order_number']),
        unread: asInt(j['unread_user']),
        status: asString(j['status'], 'open'),
        lastMessage: asString(j['last_message'] is Map ? (j['last_message']['text'] ?? j['last_message']['message']) : j['last_message']),
        lastMessageAt: asDate(j['last_message_at']),
      );
}

class ChatMessage {
  final String id;
  final String chatId;
  final String senderName;
  final String senderType; // admin | customer | delivery_boy | store
  final String message;
  final String attachment;
  final DateTime? createdAt;
  final DateTime? readAt;
  final bool? _mine;

  const ChatMessage({
    required this.id,
    this.chatId = '',
    this.senderName = '',
    required this.senderType,
    required this.message,
    this.attachment = '',
    this.createdAt,
    this.readAt,
    bool? mine,
  }) : _mine = mine;

  factory ChatMessage.fromJson(Map<String, dynamic> j) => ChatMessage(
        id: asId(j['id']),
        chatId: asId(j['chat_id']),
        senderName: asString(j['sender_name']),
        senderType: asString(j['sender_type'], 'admin'),
        message: asString(j['message']),
        attachment: asString(j['attachment']),
        createdAt: asDate(j['created_at']),
        readAt: asDate(j['read_at']),
        mine: asBoolOrNull(j['is_mine']),
      );

  bool get isMine => _mine ?? senderType == 'customer';
}
