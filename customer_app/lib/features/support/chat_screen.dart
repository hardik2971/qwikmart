import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors.dart';
import '../../core/l10n/app_localizations.dart';
import '../../core/theme.dart';
import '../../core/utils.dart';
import '../../models/models.dart';
import '../../providers/providers.dart';
import '../../widgets/common.dart';

/// Chat with Support (screenshot 24). Realtime: `chats/{id}/messages` snapshots.
class ChatScreen extends ConsumerStatefulWidget {
  final String? orderId;
  const ChatScreen({super.key, this.orderId});
  @override
  ConsumerState<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends ConsumerState<ChatScreen> {
  ChatThread? _thread;
  List<ChatMessage> _messages = [];
  Object? _error;
  bool _loading = true;
  bool _sending = false;
  StreamSubscription<List<ChatMessage>>? _sub;
  final _input = TextEditingController();
  final _scroll = ScrollController();

  @override
  void initState() {
    super.initState();
    _init();
  }

  @override
  void dispose() {
    _sub?.cancel();
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _init() async {
    try {
      final repo = ref.read(contentRepoProvider);
      // Reuse the open thread (for this order, if any). A new thread is only created when the
      // first message is sent.
      final threads = await repo.chats();
      _thread = threads
          .where((t) => t.status == 'open' && (widget.orderId == null ? t.orderId == null : t.orderId == widget.orderId))
          .firstOrNull;
      if (_thread != null) _listen();
    } catch (e) {
      if (mounted) setState(() => _error = e);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _listen() {
    final t = _thread;
    if (t == null) return;
    _sub?.cancel();
    final repo = ref.read(contentRepoProvider);
    _sub = repo.messages(t.id).listen((msgs) {
      if (!mounted) return;
      final grew = msgs.length != _messages.length;
      setState(() => _messages = msgs);
      if (grew) {
        _toBottom();
        repo.markChatRead(t.id);
      }
    }, onError: (Object e) {
      if (mounted && _messages.isEmpty) setState(() => _error = e);
    });
  }

  void _toBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) {
        _scroll.animateTo(_scroll.position.maxScrollExtent, duration: const Duration(milliseconds: 250), curve: Curves.easeOut);
      }
    });
  }

  Future<void> _send() async {
    final text = _input.text.trim();
    if (text.isEmpty || _sending) return;
    setState(() => _sending = true);
    try {
      final repo = ref.read(contentRepoProvider);
      final t = _thread;
      if (t == null) {
        String orderNumber = '';
        if (widget.orderId != null) {
          orderNumber = ref.read(orderDetailProvider(widget.orderId!)).value?.orderNumber ?? '';
        }
        _thread = await repo.startChat(
          subject: widget.orderId != null ? 'Order ${orderNumber.isEmpty ? '#${widget.orderId}' : orderNumber}' : 'Support',
          orderId: widget.orderId,
          orderNumber: orderNumber,
          message: text,
        );
        _input.clear();
        _listen();
        return;
      }
      await repo.send(t.id, text);
      _input.clear();
      _toBottom();
    } on AppException catch (e) {
      if (mounted) showSnack(context, e.displayMessage, error: true);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final dark = context.isDark;
    return Scaffold(
      backgroundColor: dark ? AppColors.darkBg : const Color(0xFFF2F4F7),
      appBar: AppBar(
        title: Column(children: [
          Text(context.tr('chat_with_support')),
          if (_thread?.orderId != null)
            Text(context.tr('order_id_n', {'n': _thread!.orderNumber.isNotEmpty ? _thread!.orderNumber : _thread!.orderId}), style: TextStyle(fontSize: 11.5, color: context.mutedText)),
        ]),
      ),
      body: _loading
          ? const LoadingView()
          : _error != null
              ? ErrorView(error: _error, onRetry: () {
                  setState(() {
                    _loading = true;
                    _error = null;
                  });
                  _init();
                })
              : Column(children: [
                  Expanded(
                    child: ListView.builder(
                      controller: _scroll,
                      padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
                      itemCount: _messages.length,
                      itemBuilder: (_, i) {
                        final m = _messages[i];
                        final prev = i > 0 ? _messages[i - 1] : null;
                        final newDay = prev == null ||
                            prev.createdAt == null ||
                            m.createdAt == null ||
                            !DateUtils.isSameDay(prev.createdAt, m.createdAt);
                        return Column(children: [
                          if (newDay) _DayChip(date: m.createdAt),
                          _Bubble(message: m),
                        ]);
                      },
                    ),
                  ),
                  Container(
                    color: context.cardColor,
                    child: SafeArea(
                      top: false,
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(8, 8, 8, 8),
                        child: Row(children: [
                          IconButton(
                            icon: Icon(Icons.attach_file_rounded, color: context.mutedText),
                            onPressed: () => showSnack(context, context.tr('attachments_soon')),
                          ),
                          Expanded(
                            child: TextField(
                              controller: _input,
                              minLines: 1,
                              maxLines: 4,
                              textInputAction: TextInputAction.send,
                              onSubmitted: (_) => _send(),
                              decoration: InputDecoration(
                                hintText: context.tr('type_message'),
                                isDense: true,
                                border: OutlineInputBorder(borderRadius: BorderRadius.circular(24), borderSide: BorderSide(color: context.borderColor)),
                                enabledBorder: OutlineInputBorder(
                                    borderRadius: BorderRadius.circular(24), borderSide: BorderSide(color: context.borderColor)),
                                focusedBorder: OutlineInputBorder(
                                    borderRadius: BorderRadius.circular(24), borderSide: const BorderSide(color: AppColors.primary)),
                              ),
                            ),
                          ),
                          const SizedBox(width: 6),
                          Material(
                            color: AppColors.primary,
                            shape: const CircleBorder(),
                            child: InkWell(
                              customBorder: const CircleBorder(),
                              onTap: _send,
                              child: Padding(
                                padding: const EdgeInsets.all(11),
                                child: _sending
                                    ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                                    : const Icon(Icons.send_rounded, color: Colors.white, size: 20),
                              ),
                            ),
                          ),
                        ]),
                      ),
                    ),
                  ),
                ]),
    );
  }
}

class _DayChip extends StatelessWidget {
  final DateTime? date;
  const _DayChip({this.date});

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final label = date == null
        ? ''
        : DateUtils.isSameDay(date, now)
            ? context.tr('today')
            : DateUtils.isSameDay(date, now.subtract(const Duration(days: 1)))
                ? context.tr('yesterday')
                : Fmt.date(date);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Text(label, style: TextStyle(fontSize: 12, color: context.mutedText, fontWeight: FontWeight.w600)),
    );
  }
}

class _Bubble extends StatelessWidget {
  final ChatMessage message;
  const _Bubble({required this.message});

  @override
  Widget build(BuildContext context) {
    final mine = message.isMine;
    final dark = context.isDark;
    return Align(
      alignment: mine ? AlignmentDirectional.centerEnd : AlignmentDirectional.centerStart,
      child: Container(
        constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.72),
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.fromLTRB(12, 9, 12, 7),
        decoration: BoxDecoration(
          color: mine ? AppColors.primary : (dark ? AppColors.darkSurface : const Color(0xFFE4E7EC)),
          borderRadius: BorderRadiusDirectional.only(
            topStart: const Radius.circular(14),
            topEnd: const Radius.circular(14),
            bottomStart: Radius.circular(mine ? 14 : 4),
            bottomEnd: Radius.circular(mine ? 4 : 14),
          ),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: Text(message.message,
                style: TextStyle(color: mine ? Colors.white : (dark ? Colors.white : AppColors.ink), height: 1.35)),
          ),
          const SizedBox(height: 3),
          Row(mainAxisSize: MainAxisSize.min, children: [
            Text(Fmt.time(message.createdAt),
                style: TextStyle(fontSize: 10, color: mine ? Colors.white70 : context.mutedText)),
            if (mine) ...[
              const SizedBox(width: 3),
              Icon(message.readAt != null ? Icons.done_all_rounded : Icons.done_rounded, size: 13, color: Colors.white70),
            ],
          ]),
        ]),
      ),
    );
  }
}
