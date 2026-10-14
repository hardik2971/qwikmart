import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:share_plus/share_plus.dart';

import '../../core/l10n/app_localizations.dart';
import '../../core/theme.dart';
import '../../core/utils.dart';
import '../../models/models.dart';
import '../../providers/providers.dart';
import '../../widgets/common.dart';
import '../../widgets/html_text.dart';

/// Blog cover: network image or a branded gradient card (mock data).
class BlogCover extends StatelessWidget {
  final Blog blog;
  final double height;
  const BlogCover({super.key, required this.blog, this.height = 170});

  @override
  Widget build(BuildContext context) {
    if (blog.image.isNotEmpty) {
      return AppImage(url: blog.image, name: blog.title, height: height, width: double.infinity, radius: BorderRadius.circular(12));
    }
    final palette = [
      [const Color(0xFF0E9623), const Color(0xFF6BCB77)],
      [const Color(0xFF0B7A6E), const Color(0xFF5CC8B8)],
      [const Color(0xFF1D4ED8), const Color(0xFF7BA4F7)],
      [const Color(0xFFD9480F), const Color(0xFFFFA26B)],
      [const Color(0xFF7C3AED), const Color(0xFFB794F6)],
    ][blog.id.hashCode.abs() % 5];
    return Container(
      height: height,
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: LinearGradient(colors: palette, begin: Alignment.topLeft, end: Alignment.bottomRight),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(children: [
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.center, children: [
            const BrandLogo(height: 22, wordColor: Colors.white),
            const SizedBox(height: 10),
            Text(blog.title,
                maxLines: 3,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 15, height: 1.25)),
          ]),
        ),
        Text(emojiFor(blog.category?.name ?? blog.title) == '🛍️' ? '📰' : emojiFor(blog.category?.name ?? blog.title),
            style: const TextStyle(fontSize: 54)),
      ]),
    );
  }
}

class BlogListScreen extends ConsumerStatefulWidget {
  const BlogListScreen({super.key});
  @override
  ConsumerState<BlogListScreen> createState() => _BlogListScreenState();
}

class _BlogListScreenState extends ConsumerState<BlogListScreen> {
  String? _category;

  @override
  Widget build(BuildContext context) {
    final cats = ref.watch(blogCategoriesProvider).value ?? const <BlogCategory>[];
    final blogs = ref.watch(blogsProvider(_category));
    return Scaffold(
      appBar: AppBar(title: Text(context.tr('blog'))),
      body: Column(children: [
        SizedBox(
          height: 52,
          child: ListView(scrollDirection: Axis.horizontal, padding: const EdgeInsets.fromLTRB(12, 8, 12, 8), children: [
            for (final (id, name) in [(null, context.tr('all')), ...cats.map((c) => (c.id, c.name))])
              Padding(
                padding: const EdgeInsetsDirectional.only(end: 8),
                child: ChoiceChip(
                  label: Text(name),
                  selected: _category == id,
                  selectedColor: AppColors.primary,
                  labelStyle: TextStyle(color: _category == id ? Colors.white : null, fontWeight: FontWeight.w600),
                  showCheckmark: false,
                  onSelected: (_) => setState(() => _category = id),
                ),
              ),
          ]),
        ),
        Expanded(
          child: blogs.when(
            loading: () => const LoadingView(),
            error: (e, _) => ErrorView(error: e, onRetry: () => ref.invalidate(blogsProvider(_category))),
            data: (list) => list.isEmpty
                ? EmptyView(emoji: '📰', title: context.tr('no_blogs'))
                : ListView.separated(
                    padding: const EdgeInsets.all(16),
                    itemCount: list.length,
                    separatorBuilder: (_, _) => const SizedBox(height: 14),
                    itemBuilder: (_, i) {
                      final b = list[i];
                      return AppCard(
                        padding: const EdgeInsets.all(10),
                        onTap: () => context.push('/blog/${b.slug.isEmpty ? b.id : b.slug}'),
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          BlogCover(blog: b),
                          const SizedBox(height: 10),
                          if (b.category != null) Pill(label: b.category!.name),
                          const SizedBox(height: 6),
                          Text(b.title, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15, height: 1.3)),
                          const SizedBox(height: 4),
                          Text(b.excerpt, maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(color: context.mutedText, fontSize: 12.5)),
                          const SizedBox(height: 8),
                          Row(children: [
                            Icon(Icons.schedule_rounded, size: 14, color: context.mutedText),
                            const SizedBox(width: 4),
                            Text(context.tr('n_min_read', {'n': b.readMinutes}), style: TextStyle(fontSize: 11.5, color: context.mutedText)),
                            const SizedBox(width: 12),
                            Icon(Icons.visibility_outlined, size: 14, color: context.mutedText),
                            const SizedBox(width: 4),
                            Text(context.tr('n_views', {'n': b.views}), style: TextStyle(fontSize: 11.5, color: context.mutedText)),
                          ]),
                        ]),
                      );
                    },
                  ),
          ),
        ),
      ]),
    );
  }
}

class BlogDetailScreen extends ConsumerWidget {
  final String slug;
  const BlogDetailScreen({super.key, required this.slug});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final blog = ref.watch(blogProvider(slug));
    return Scaffold(
      appBar: AppBar(
        title: Text(context.tr('blog')),
        actions: [
          if (blog.value != null)
            IconButton(
              icon: const Icon(Icons.share_outlined),
              onPressed: () => SharePlus.instance.share(ShareParams(text: '${blog.value!.title}\nhttps://qwikmart.app/blog/$slug')),
            ),
        ],
      ),
      body: blog.when(
        loading: () => const LoadingView(),
        error: (e, _) => ErrorView(error: e, onRetry: () => ref.invalidate(blogProvider(slug))),
        data: (b) => ListView(padding: const EdgeInsets.all(16), children: [
          BlogCover(blog: b, height: 200),
          const SizedBox(height: 14),
          if (b.category != null) Align(alignment: AlignmentDirectional.centerStart, child: Pill(label: b.category!.name)),
          const SizedBox(height: 8),
          Text(b.title, style: context.text.headlineSmall?.copyWith(fontWeight: FontWeight.w800, height: 1.25)),
          const SizedBox(height: 8),
          Text('${Fmt.date(b.createdAt)} · ${context.tr('n_min_read', {'n': b.readMinutes})} · ${context.tr('n_views', {'n': b.views})}',
              style: TextStyle(color: context.mutedText, fontSize: 12)),
          const Divider(height: 28),
          HtmlText(b.content.isEmpty ? b.excerpt : b.content),
        ]),
      ),
    );
  }
}
