import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme.dart';
import '../../providers/providers.dart';
import '../../widgets/common.dart';
import '../../widgets/html_text.dart';

/// About / Privacy / Terms / Refund pages from `/pages/{slug}`.
class CmsPageScreen extends ConsumerWidget {
  final String slug;
  const CmsPageScreen({super.key, required this.slug});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final page = ref.watch(cmsPageProvider(slug));
    return Scaffold(
      appBar: AppBar(title: Text(page.value?.title ?? '')),
      body: page.when(
        loading: () => const LoadingView(),
        error: (e, _) => ErrorView(error: e, onRetry: () => ref.invalidate(cmsPageProvider(slug))),
        data: (p) => ListView(padding: const EdgeInsets.all(20), children: [
          if (slug == 'about') ...[
            const Center(child: BrandLogo(height: 44)),
            const SizedBox(height: 20),
          ],
          Text(p.title, style: context.text.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: 14),
          HtmlText(p.content.contains('<') ? p.content : p.content.split('\n\n').map((s) => '<p>$s</p>').join()),
        ]),
      ),
    );
  }
}
