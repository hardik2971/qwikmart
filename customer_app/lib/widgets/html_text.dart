import 'package:flutter/material.dart';

import '../core/theme.dart';

/// Minimal HTML renderer for product/blog descriptions: paragraphs, headings, list items, line breaks.
class HtmlText extends StatelessWidget {
  final String html;
  final TextStyle? style;
  const HtmlText(this.html, {super.key, this.style});

  static String _clean(String s) => s
      .replaceAll(RegExp(r'<[^>]+>'), '')
      .replaceAll('&amp;', '&')
      .replaceAll('&nbsp;', ' ')
      .replaceAll('&quot;', '"')
      .replaceAll('&#39;', "'")
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>')
      .trim();

  @override
  Widget build(BuildContext context) {
    final base = style ?? context.text.bodyMedium?.copyWith(height: 1.55, color: context.isDark ? Colors.white70 : AppColors.bodyText);
    final blocks = <Widget>[];
    final normalized = html
        .replaceAll(RegExp(r'<br\s*/?>', caseSensitive: false), '\n')
        .replaceAll(RegExp(r'</(p|div|ul|ol)>', caseSensitive: false), '\n\n');
    final tokens = RegExp(r'<(h[1-6]|li)[^>]*>(.*?)</\1>', caseSensitive: false, dotAll: true);
    var last = 0;
    void addText(String raw) {
      for (final para in raw.split(RegExp(r'\n{2,}'))) {
        final t = _clean(para);
        if (t.isNotEmpty) blocks.add(Padding(padding: const EdgeInsets.only(bottom: 8), child: Text(t, style: base)));
      }
    }

    for (final m in tokens.allMatches(normalized)) {
      addText(normalized.substring(last, m.start));
      final tag = m.group(1)!.toLowerCase();
      final text = _clean(m.group(2) ?? '');
      if (tag == 'li') {
        blocks.add(Padding(
          padding: const EdgeInsets.only(bottom: 4, left: 4),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('•  ', style: base?.copyWith(color: AppColors.primary, fontWeight: FontWeight.w800)),
            Expanded(child: Text(text, style: base)),
          ]),
        ));
      } else {
        blocks.add(Padding(
          padding: const EdgeInsets.only(top: 6, bottom: 6),
          child: Text(text, style: base?.copyWith(fontWeight: FontWeight.w800, fontSize: 16, color: context.isDark ? Colors.white : AppColors.ink)),
        ));
      }
      last = m.end;
    }
    addText(normalized.substring(last));
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: blocks);
  }
}
