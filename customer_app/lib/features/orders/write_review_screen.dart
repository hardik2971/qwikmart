import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/errors.dart';
import '../../core/l10n/app_localizations.dart';
import '../../core/theme.dart';
import '../../core/utils.dart';
import '../../models/models.dart';
import '../../providers/providers.dart';
import '../../widgets/common.dart';

class WriteReviewScreen extends ConsumerStatefulWidget {
  final OrderItem? item;
  const WriteReviewScreen({super.key, this.item});
  @override
  ConsumerState<WriteReviewScreen> createState() => _WriteReviewScreenState();
}

class _WriteReviewScreenState extends ConsumerState<WriteReviewScreen> {
  int _rating = 0;
  final _comment = TextEditingController();
  final List<(XFile, Uint8List)> _images = [];
  bool _busy = false;

  static const _labels = ['', 'rating_1', 'rating_2', 'rating_3', 'rating_4', 'rating_5'];

  @override
  void dispose() {
    _comment.dispose();
    super.dispose();
  }

  Future<void> _pick() async {
    try {
      final files = await ImagePicker().pickMultiImage(imageQuality: 70, limit: 4);
      for (final f in files.take(4 - _images.length)) {
        _images.add((f, await f.readAsBytes()));
      }
      if (mounted) setState(() {});
    } catch (e) {
      if (mounted) showSnack(context, '$e', error: true);
    }
  }

  Future<void> _submit() async {
    final item = widget.item;
    if (item == null) return;
    if (_rating == 0) {
      showSnack(context, context.tr('select_rating'), error: true);
      return;
    }
    setState(() => _busy = true);
    try {
      final msg = await ref.read(orderRepoProvider).review(
            orderId: item.orderId,
            variantId: item.variantId,
            productId: item.productId,
            rating: _rating,
            comment: _comment.text.trim(),
            images: _images.map((e) => e.$1).toList(),
          );
      if (!mounted) return;
      showSnack(context, msg.isEmpty ? context.tr('thanks_review') : msg);
      context.pop(true);
    } on AppException catch (e) {
      if (mounted) showSnack(context, e.displayMessage, error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final item = widget.item;
    return Scaffold(
      appBar: AppBar(title: Text(context.tr('write_review'))),
      body: item == null
          ? EmptyView(title: context.tr('nothing_to_review'))
          : ListView(padding: const EdgeInsets.all(16), children: [
              AppCard(
                child: Row(children: [
                  AppImage(url: item.image, name: item.productName, width: 56, height: 56, radius: BorderRadius.circular(10)),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(item.productName, style: const TextStyle(fontWeight: FontWeight.w700)),
                      Text(item.variantName, style: TextStyle(color: context.mutedText, fontSize: 12)),
                    ]),
                  ),
                ]),
              ),
              const SizedBox(height: 24),
              Center(child: Text(context.tr('how_was_product'), style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w800))),
              const SizedBox(height: 12),
              Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                for (var i = 1; i <= 5; i++)
                  IconButton(
                    iconSize: 42,
                    onPressed: () => setState(() => _rating = i),
                    icon: Icon(i <= _rating ? Icons.star_rounded : Icons.star_outline_rounded,
                        color: i <= _rating ? const Color(0xFFF5A524) : context.mutedText),
                  ),
              ]),
              if (_rating > 0)
                Center(
                  child: Text(context.tr(_labels[_rating]),
                      style: const TextStyle(color: AppColors.primary, fontWeight: FontWeight.w800)),
                ),
              const SizedBox(height: 20),
              TextField(
                controller: _comment,
                maxLines: 5,
                maxLength: 500,
                decoration: InputDecoration(hintText: context.tr('review_hint')),
              ),
              const SizedBox(height: 8),
              Text(context.tr('add_photos'), style: const TextStyle(fontWeight: FontWeight.w700)),
              const SizedBox(height: 8),
              Wrap(spacing: 8, runSpacing: 8, children: [
                for (final (i, img) in _images.indexed)
                  Stack(children: [
                    ClipRRect(
                      borderRadius: BorderRadius.circular(10),
                      child: Image.memory(img.$2, width: 72, height: 72, fit: BoxFit.cover),
                    ),
                    Positioned(
                      right: 2,
                      top: 2,
                      child: InkWell(
                        onTap: () => setState(() => _images.removeAt(i)),
                        child: const CircleAvatar(radius: 10, backgroundColor: Colors.black54, child: Icon(Icons.close, size: 12, color: Colors.white)),
                      ),
                    ),
                  ]),
                if (_images.length < 4)
                  InkWell(
                    onTap: _pick,
                    borderRadius: BorderRadius.circular(10),
                    child: Container(
                      width: 72,
                      height: 72,
                      decoration: BoxDecoration(
                        border: Border.all(color: context.borderColor),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Icon(Icons.add_a_photo_outlined, color: AppColors.primary, semanticLabel: context.tr('add_photos')),
                    ),
                  ),
              ]),
            ]),
      bottomNavigationBar: item == null
          ? null
          : SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                child: AppButton(label: context.tr('submit_review'), loading: _busy, onPressed: _submit),
              ),
            ),
    );
  }
}
