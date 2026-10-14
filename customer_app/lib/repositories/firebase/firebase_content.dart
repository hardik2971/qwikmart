import 'package:cloud_firestore/cloud_firestore.dart' hide Order;

import '../../core/errors.dart';
import '../../core/firebase.dart';
import '../../models/models.dart';
import '../repositories.dart';
import 'fs_json.dart';

/// Blogs / FAQs / CMS pages (public reads) and support chat (`chats` + `messages`, realtime).
class FirebaseContentRepository implements ContentRepository {
  final ScopeReader scope;
  FirebaseContentRepository(this.scope);

  FirebaseFirestore get _db => Fb.db;
  String get _lang => scope().lang;

  Map<String, dynamic> _blogJson(Map<String, dynamic> b, Map<String, Map<String, dynamic>> cats) {
    final cat = cats[asId(b['category_id'])];
    return {
      ...b,
      'title': asText(b['title'], _lang),
      'excerpt': asText(b['excerpt'], _lang),
      'content': asText(b['content'], _lang),
      if (cat != null) 'category': {...cat, 'name': asText(cat['name'], _lang)},
    };
  }

  Future<Map<String, Map<String, dynamic>>> _blogCats() async {
    final snap = await _db.collection('blog_categories').get();
    return {for (final d in snap.docs) d.id: docJson(d)};
  }

  @override
  Future<List<Blog>> blogs({String? categoryId}) => guard(() async {
        Query<Map<String, dynamic>> q = _db.collection('blogs');
        if (categoryId != null && categoryId.isNotEmpty) q = q.where('category_id', isEqualTo: categoryId);
        final snap = await q.where('status', isEqualTo: 'active').orderBy('published_at', descending: true).limit(50).get();
        final cats = await _blogCats();
        return snap.docs.map(docJson).map((b) => Blog.fromJson(_blogJson(b, cats))).toList();
      });

  @override
  Future<Blog> blog(String slug) => guard(() async {
        final snap = await _db.collection('blogs').where('slug', isEqualTo: slug).where('status', isEqualTo: 'active').limit(1).get();
        var doc = snap.docs.isEmpty ? null : docJson(snap.docs.first);
        if (doc == null) {
          final d = await _db.doc('blogs/$slug').get();
          if (d.exists) doc = docJson(d);
        }
        if (doc == null) throw const AppException('Article not found', code: 'not-found');
        return Blog.fromJson(_blogJson(doc, await _blogCats()));
      });

  @override
  Future<List<BlogCategory>> blogCategories() => guard(() async {
        final cats = await _blogCats();
        return cats.values.map((c) => BlogCategory.fromJson({...c, 'name': asText(c['name'], _lang)})).toList();
      });

  @override
  Future<List<Faq>> faqs() => guard(() async {
        final snap = await _db.collection('faqs').where('status', isEqualTo: 'active').get();
        final list = snap.docs.map(docJson).toList()..sort((a, b) => asInt(a['sort_order']).compareTo(asInt(b['sort_order'])));
        return list
            .map((f) => Faq.fromJson({...f, 'question': asText(f['question'], _lang), 'answer': asText(f['answer'], _lang)}))
            .toList();
      });

  @override
  Future<CmsPage> page(String slug) => guard(() async {
        final d = await _db.doc('pages/$slug').get();
        if (!d.exists) throw const AppException('Page not found', code: 'not-found');
        final j = docJson(d);
        return CmsPage.fromJson({...j, 'slug': slug, 'title': asText(j['title'], _lang), 'content': asText(j['content'], _lang)});
      });

  // ------------------------------------------------------------------ support chat

  @override
  Future<List<ChatThread>> chats() => guard(() async {
        final snap = await _db
            .collection('chats')
            .where('user_uid', isEqualTo: Fb.uid)
            .orderBy('last_message_at', descending: true)
            .limit(30)
            .get();
        return snap.docs.map(docJson).map(ChatThread.fromJson).toList();
      });

  Future<String> _myName() async {
    try {
      final d = await _db.doc('users/${Fb.uid}').get();
      final n = asString(d.data()?['name']);
      if (n.isNotEmpty) return n.length > 100 ? n.substring(0, 100) : n;
    } catch (_) {}
    return 'Customer';
  }

  @override
  Future<ChatThread> startChat({String subject = 'Support', String? orderId, String orderNumber = '', required String message}) =>
      guard(() async {
        final uid = Fb.uid;
        final name = await _myName();
        final ref = _db.collection('chats').doc();
        await ref.set({
          'user_id': uid,
          'user_uid': uid,
          'user_type': 'customer',
          'user_name': name,
          'order_id': orderId,
          'order_number': orderNumber.isEmpty ? null : orderNumber,
          'subject': subject.length > 200 ? subject.substring(0, 200) : subject,
          'status': 'open',
          'last_message': null,
          'last_message_at': FieldValue.serverTimestamp(),
          'unread_admin': 0,
          'unread_user': 0,
          'created_at': FieldValue.serverTimestamp(),
        });
        await _sendAs(ref.id, uid, name, message);
        return ChatThread.fromJson(docJson(await ref.get()));
      });

  Future<void> _sendAs(String chatId, String uid, String name, String message) async {
    await _db.collection('chats/$chatId/messages').add({
      'user_uid': uid,
      'sender_id': uid,
      'sender_type': 'customer',
      'sender_name': name,
      'message': message.length > 4000 ? message.substring(0, 4000) : message,
      'attachment': null,
      'read_at': null,
      'created_at': FieldValue.serverTimestamp(),
    });
  }

  @override
  Stream<List<ChatMessage>> messages(String chatId) {
    final uid = Fb.uid;
    // Rules only allow reading messages of the user's own threads: the query must filter user_uid.
    return _db
        .collection('chats/$chatId/messages')
        .where('user_uid', isEqualTo: uid)
        .snapshots()
        .map((snap) {
      final list = snap.docs.map((d) {
        final j = docJson(d);
        return ChatMessage.fromJson({
          ...j,
          // Pending server timestamps are null until the write lands.
          'created_at': j['created_at'] ?? DateTime.now().toIso8601String(),
          'chat_id': chatId,
          'is_mine': j['sender_id'] == uid,
        });
      }).toList()
        ..sort((a, b) => (a.createdAt ?? DateTime.now()).compareTo(b.createdAt ?? DateTime.now()));
      return list;
    }).handleError((Object e) => throw AppException.from(e));
  }

  @override
  Future<void> send(String chatId, String message) => guard(() async => _sendAs(chatId, Fb.uid, await _myName(), message));

  @override
  Future<void> markChatRead(String chatId) async {
    try {
      await _db.doc('chats/$chatId').update({'unread_user': 0, 'updated_at': FieldValue.serverTimestamp()});
    } catch (_) {}
  }
}
