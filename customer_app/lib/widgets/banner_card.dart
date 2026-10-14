import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../core/theme.dart';
import '../core/utils.dart';
import '../models/models.dart';

/// Handles banner taps based on `link_type` (product | category | url | none).
void openBannerLink(BuildContext context, BannerItem b) {
  switch (b.linkType) {
    case 'product':
      if (b.linkValue.isNotEmpty) context.push('/product/${b.linkValue}');
    case 'category':
      if (b.linkValue.isNotEmpty) context.push('/category/${b.linkValue}?name=${Uri.encodeComponent(b.title.replaceAll('\n', ' '))}');
    case 'url':
      if (b.linkValue.isNotEmpty) context.push('/search?q=${Uri.encodeComponent(b.linkValue)}');
  }
}

/// Promotional banner. Uses the image when the API provides one, otherwise composes a
/// gradient card with title / subtitle / CTA and an emoji cluster (mock data).
class BannerCard extends StatelessWidget {
  final BannerItem banner;
  final double height;
  final EdgeInsetsGeometry margin;
  const BannerCard({super.key, required this.banner, this.height = 168, this.margin = EdgeInsets.zero});

  @override
  Widget build(BuildContext context) {
    final b = banner;
    final composed = _Composed(banner: b, height: height);
    return Padding(
      padding: margin,
      child: GestureDetector(
        onTap: () => openBannerLink(context, b),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(16),
          child: SizedBox(
            height: height,
            width: double.infinity,
            child: b.image.isEmpty
                ? composed
                : CachedNetworkImage(
                    imageUrl: b.image,
                    fit: BoxFit.cover,
                    placeholder: (_, _) => composed,
                    errorWidget: (_, _, _) => composed,
                  ),
          ),
        ),
      ),
    );
  }
}

class _Composed extends StatelessWidget {
  final BannerItem banner;
  final double height;
  const _Composed({required this.banner, required this.height});

  @override
  Widget build(BuildContext context) {
    final b = banner;
    final bg = AppColors.fromHex(b.bgColor, AppColors.primary50);
    final bg2 = b.bgColor2.isEmpty ? Color.lerp(bg, Colors.white, 0.65)! : AppColors.fromHex(b.bgColor2);
    final accent = AppColors.fromHex(b.accent);
    final lines = b.title.split('\n');
    final emojis = (b.emoji.isEmpty ? emojiFor(b.title) : b.emoji).characters.where((c) => c.trim().isNotEmpty).toList();
    final dark = context.isDark;
    final scale = (height / 168).clamp(0.6, 1.3);

    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: dark ? [Color.lerp(bg, AppColors.darkSurface, 0.7)!, AppColors.darkSurface] : [bg, bg2],
          begin: AlignmentDirectional.centerStart,
          end: AlignmentDirectional.centerEnd,
        ),
      ),
      child: Stack(children: [
        PositionedDirectional(
          end: -30,
          top: -30,
          child: Container(
            width: height * 1.1,
            height: height * 1.1,
            decoration: BoxDecoration(shape: BoxShape.circle, color: accent.withValues(alpha: 0.07)),
          ),
        ),
        Padding(
          padding: EdgeInsets.fromLTRB(16 * scale, 14 * scale, 12 * scale, 14 * scale),
          child: Row(children: [
            Expanded(
              flex: 6,
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.center, children: [
                if (b.badge.isNotEmpty)
                  Container(
                    margin: const EdgeInsets.only(bottom: 6),
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(color: accent, borderRadius: BorderRadius.circular(999)),
                    child: Text(b.badge,
                        style: TextStyle(color: Colors.white, fontSize: 9 * scale, fontWeight: FontWeight.w800, letterSpacing: .4)),
                  ),
                for (var i = 0; i < lines.length; i++)
                  Text(
                    lines[i],
                    // API banners carry one long title line: let it wrap instead of truncating.
                    maxLines: lines.length == 1 ? 3 : 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: (lines.length > 2 ? 17 : 21) * scale,
                      height: 1.12,
                      fontWeight: FontWeight.w800,
                      color: i == 0 ? (dark ? Colors.white : AppColors.ink) : accent,
                    ),
                  ),
                if (b.subtitle.isNotEmpty) ...[
                  SizedBox(height: 5 * scale),
                  Text(b.subtitle,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                          fontSize: 10.5 * scale, color: dark ? Colors.white70 : const Color(0xFF475467), height: 1.3)),
                ],
                if (b.cta.isNotEmpty) ...[
                  SizedBox(height: 8 * scale),
                  Container(
                    padding: EdgeInsets.symmetric(horizontal: 12 * scale, vertical: 5 * scale),
                    decoration: BoxDecoration(color: accent, borderRadius: BorderRadius.circular(999)),
                    child: Text(b.cta,
                        style: TextStyle(color: Colors.white, fontSize: 10.5 * scale, fontWeight: FontWeight.w700)),
                  ),
                ],
              ]),
            ),
            Expanded(
              flex: 4,
              child: emojis.isEmpty
                  ? const SizedBox()
                  : Center(
                      child: Wrap(
                        alignment: WrapAlignment.center,
                        runAlignment: WrapAlignment.center,
                        spacing: 2,
                        runSpacing: 0,
                        children: [
                          for (var i = 0; i < emojis.length; i++)
                            Transform.rotate(
                              angle: (i.isEven ? -0.12 : 0.1),
                              child: Text(emojis[i],
                                  style: TextStyle(fontSize: (emojis.length == 1 ? 72 : (i == 0 ? 52 : 40)) * scale)),
                            ),
                        ],
                      ),
                    ),
            ),
          ]),
        ),
      ]),
    );
  }
}
