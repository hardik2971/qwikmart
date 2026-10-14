import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../core/l10n.dart';
import '../../core/theme.dart';
import '../../models/models.dart';
import '../../providers/core_providers.dart';
import '../../providers/data_providers.dart';
import '../../widgets/common.dart';

/// Chat with Support (screenshot 30) or about an order. Realtime: Firestore
/// `chats/{id}/messages` snapshots; the thread is created with the first message.
class ChatScreen extends ConsumerStatefulWidget {
  const ChatScreen({super.key, this.orderId, this.title});
  final String? orderId;
  final String? title;

  @override
  ConsumerState<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends ConsumerState<ChatScreen> {
  final _input = TextEditingController();
  final _scroll = ScrollController();
  ChatThread? _thread;
  Object? _error;
  bool _loading = true;
  bool _sending = false;
  int _lastCount = 0;

  @override
  void initState() {
    super.initState();
    _open();
  }

  @override
  void dispose() {
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _open() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final repo = ref.read(repositoryProvider);
      _thread = widget.orderId == null
          ? await repo.openSupportChat()
          : await repo.openOrderChat(widget.orderId!, widget.title ?? 'Order');
    } catch (e) {
      _error = e;
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _scrollToEnd() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) {
        _scroll.animateTo(_scroll.position.maxScrollExtent, duration: const Duration(milliseconds: 250), curve: Curves.easeOut);
      }
    });
  }

  Future<void> _send() async {
    final text = _input.text.trim();
    final t = _thread;
    if (text.isEmpty || t == null || _sending) return;
    setState(() => _sending = true);
    try {
      final chatId = await ref.read(repositoryProvider).sendMessage(t, text);
      _input.clear();
      // A draft thread now exists on the server: switch to its real id (starts the listener).
      if (t.isDraft && mounted) {
        setState(() => _thread = ChatThread(id: chatId, subject: t.subject, orderId: t.orderId));
      }
      _scrollToEnd();
    } catch (e) {
      if (mounted) showSnack(context, errorText(e), error: true);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  String _dayLabel(DateTime d) {
    final now = DateTime.now();
    if (d.year == now.year && d.month == now.month && d.day == now.day) return context.tr('today');
    return Fmt.dateLong(d);
  }

  @override
  Widget build(BuildContext context) {
    final title = widget.title ?? context.tr('chat_support');
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        title: Row(
          children: [
            CircleAvatar(
              radius: 18,
              backgroundColor: context.softGreen,
              child: const Icon(Icons.support_agent_rounded, color: AppColors.primary, size: 20),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, overflow: TextOverflow.ellipsis),
                  Text(
                    widget.orderId == null ? 'QwikMart Support' : (_thread?.subject ?? ''),
                    style: TextStyle(fontSize: 11.5, color: context.mutedColor, fontWeight: FontWeight.w500),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
      body: Column(
        children: [
          const DemoBanner(),
          Expanded(child: _body(context)),
          _composer(context),
        ],
      ),
    );
  }

  Widget _body(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator(color: AppColors.primary));
    if (_error != null) return ErrorState(error: _error!, onRetry: _open);
    final t = _thread;
    if (t == null || t.isDraft) {
      return EmptyState(icon: Icons.chat_bubble_outline_rounded, title: context.tr('no_data'));
    }
    final async = ref.watch(chatMessagesProvider(t.id));
    final messages = async.value ?? const <ChatMessage>[];
    if (async.hasError && messages.isEmpty) {
      return ErrorState(error: async.error!, onRetry: () => ref.invalidate(chatMessagesProvider(t.id)));
    }
    if (async.isLoading && messages.isEmpty) return const Center(child: CircularProgressIndicator(color: AppColors.primary));
    if (messages.isEmpty) return EmptyState(icon: Icons.chat_bubble_outline_rounded, title: context.tr('no_data'));
    if (messages.length != _lastCount) {
      _lastCount = messages.length;
      _scrollToEnd();
    }
    final children = <Widget>[];
    DateTime? lastDay;
    for (final m in messages) {
      final day = DateTime(m.createdAt.year, m.createdAt.month, m.createdAt.day);
      if (lastDay == null || day != lastDay) {
        children.add(
          Center(
            child: Container(
              margin: const EdgeInsets.symmetric(vertical: 10),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
              decoration: BoxDecoration(
                color: context.isDark ? AppColors.darkSurface : AppColors.chatReceived,
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text(_dayLabel(m.createdAt), style: TextStyle(fontSize: 11.5, color: context.mutedColor)),
            ),
          ),
        );
        lastDay = day;
      }
      children.add(_Bubble(m: m));
    }
    return ListView(controller: _scroll, padding: const EdgeInsets.fromLTRB(12, 4, 12, 12), children: children);
  }

  Widget _composer(BuildContext context) {
    return Container(
      decoration: BoxDecoration(color: context.cardColor, border: Border(top: BorderSide(color: context.borderColor))),
      padding: const EdgeInsets.fromLTRB(12, 8, 8, 8),
      child: SafeArea(
        top: false,
        child: Row(
          children: [
            Expanded(
              child: TextField(
                controller: _input,
                minLines: 1,
                maxLines: 4,
                textInputAction: TextInputAction.send,
                onSubmitted: (_) => _send(),
                decoration: InputDecoration(
                  hintText: context.tr('type_message'),
                  contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(24), borderSide: BorderSide(color: context.borderColor)),
                  enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(24), borderSide: BorderSide(color: context.borderColor)),
                  focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(24), borderSide: const BorderSide(color: AppColors.primary)),
                ),
              ),
            ),
            const SizedBox(width: 8),
            Material(
              color: AppColors.primary,
              shape: const CircleBorder(),
              child: InkWell(
                customBorder: const CircleBorder(),
                onTap: _send,
                child: SizedBox(
                  width: 46,
                  height: 46,
                  child: _sending
                      ? const Padding(
                          padding: EdgeInsets.all(13),
                          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                        )
                      : const Icon(Icons.send_rounded, color: Colors.white, size: 20),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Bubble extends StatelessWidget {
  const _Bubble({required this.m});
  final ChatMessage m;

  @override
  Widget build(BuildContext context) {
    final mine = m.isMine;
    final bg = mine ? AppColors.primary : (context.isDark ? AppColors.darkSurface : AppColors.chatReceived);
    final fg = mine ? Colors.white : context.textColor;
    return Align(
      alignment: mine ? AlignmentDirectional.centerEnd : AlignmentDirectional.centerStart,
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.75),
        child: Container(
          margin: const EdgeInsets.symmetric(vertical: 4),
          padding: const EdgeInsets.fromLTRB(12, 9, 12, 6),
          decoration: BoxDecoration(
            color: bg,
            borderRadius: BorderRadiusDirectional.only(
              topStart: const Radius.circular(14),
              topEnd: const Radius.circular(14),
              bottomStart: Radius.circular(mine ? 14 : 4),
              bottomEnd: Radius.circular(mine ? 4 : 14),
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(m.message, style: TextStyle(color: fg, fontSize: 14, height: 1.35)),
              const SizedBox(height: 3),
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    Fmt.time(m.createdAt),
                    style: TextStyle(fontSize: 10, color: mine ? Colors.white.withValues(alpha: 0.8) : context.mutedColor),
                  ),
                  if (mine) ...[
                    const SizedBox(width: 3),
                    Icon(Icons.done_all_rounded, size: 13, color: Colors.white.withValues(alpha: 0.85)),
                  ],
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
