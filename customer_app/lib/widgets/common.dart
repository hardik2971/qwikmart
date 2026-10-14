import 'dart:math' as math;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:shimmer/shimmer.dart';

import '../core/l10n/app_localizations.dart';
import '../core/theme.dart';
import '../core/utils.dart';

/// Network image with an emoji-tile fallback (works offline / with mock data).
class AppImage extends StatelessWidget {
  final String url;
  final String name;
  final double? width;
  final double? height;
  final BoxFit fit;
  final BorderRadius? radius;
  final Color? background;
  final double emojiScale;

  const AppImage({
    super.key,
    required this.url,
    required this.name,
    this.width,
    this.height,
    this.fit = BoxFit.cover,
    this.radius,
    this.background,
    this.emojiScale = 0.5,
  });

  Widget _fallback(BuildContext context) => Container(
        width: width,
        height: height,
        color: background ?? (context.isDark ? AppColors.darkBorder : tintFor(name)),
        alignment: Alignment.center,
        child: LayoutBuilder(builder: (context, c) {
          final side = math.min(
            c.maxWidth.isFinite ? c.maxWidth : 80.0,
            c.maxHeight.isFinite ? c.maxHeight : 80.0,
          );
          return Text(emojiFor(name), style: TextStyle(fontSize: math.max(12, side * emojiScale)));
        }),
      );

  @override
  Widget build(BuildContext context) {
    final child = url.isEmpty
        ? _fallback(context)
        : CachedNetworkImage(
            imageUrl: url,
            width: width,
            height: height,
            fit: fit,
            placeholder: (_, _) => _fallback(context),
            errorWidget: (_, _, _) => _fallback(context),
          );
    return radius == null ? child : ClipRRect(borderRadius: radius!, child: child);
  }
}

/// QwikMart logo. Full-colour on light backgrounds; the white variant in dark mode or when [wordColor] is white
/// (e.g. on the brand-blue splash / coloured headers).
class BrandLogo extends StatelessWidget {
  final double height;
  final bool iconOnly;
  final Color? wordColor;
  const BrandLogo({super.key, this.height = 36, this.iconOnly = false, this.wordColor});

  @override
  Widget build(BuildContext context) {
    final white = wordColor == Colors.white || (wordColor == null && context.isDark);
    if (iconOnly) {
      return Image.asset(white ? 'assets/brand/qwikmart-mark-white.png' : 'assets/brand/qwikmart-icon.png',
          height: height, width: height, semanticLabel: 'QwikMart');
    }
    return Image.asset(white ? 'assets/brand/qwikmart-logo-white.png' : 'assets/brand/qwikmart-logo.png',
        height: height, fit: BoxFit.contain, semanticLabel: 'QwikMart');
  }
}

class AppButton extends StatelessWidget {
  final String label;
  final VoidCallback? onPressed;
  final bool loading;
  final bool outlined;
  final bool soft;
  final IconData? icon;
  final Color? color;
  final double height;
  final bool expand;

  const AppButton({
    super.key,
    required this.label,
    this.onPressed,
    this.loading = false,
    this.outlined = false,
    this.soft = false,
    this.icon,
    this.color,
    this.height = 50,
    this.expand = true,
  });

  @override
  Widget build(BuildContext context) {
    final fg = outlined || soft ? (color ?? AppColors.primary) : Colors.white;
    final content = loading
        ? SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.4, color: fg))
        : Row(mainAxisSize: MainAxisSize.min, children: [
            if (icon != null) ...[Icon(icon, size: 18, color: fg), const SizedBox(width: 8)],
            Flexible(child: Text(label, overflow: TextOverflow.ellipsis)),
          ]);
    final size = Size(expand ? double.infinity : 64, height);
    if (outlined) {
      return OutlinedButton(
        onPressed: loading ? null : onPressed,
        style: OutlinedButton.styleFrom(
          minimumSize: size,
          foregroundColor: fg,
          side: BorderSide(color: color ?? AppColors.primary),
        ),
        child: content,
      );
    }
    return ElevatedButton(
      onPressed: loading ? null : onPressed,
      style: ElevatedButton.styleFrom(
        minimumSize: size,
        backgroundColor: soft ? AppColors.primary50 : (color ?? AppColors.primary),
        foregroundColor: fg,
        disabledBackgroundColor: (soft ? AppColors.primary50 : (color ?? AppColors.primary)).withValues(alpha: 0.5),
      ),
      child: content,
    );
  }
}

class SectionHeader extends StatelessWidget {
  final String title;
  final String? subtitle;
  final VoidCallback? onSeeAll;
  final EdgeInsetsGeometry padding;
  const SectionHeader({
    super.key,
    required this.title,
    this.subtitle,
    this.onSeeAll,
    this.padding = const EdgeInsets.fromLTRB(16, 18, 8, 10),
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: padding,
      child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(title, style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w800, fontSize: 17)),
            if (subtitle != null && subtitle!.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Text(subtitle!, style: context.text.bodySmall?.copyWith(color: context.mutedText)),
              ),
          ]),
        ),
        if (onSeeAll != null)
          TextButton(
            onPressed: onSeeAll,
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              Text(context.tr('see_all')),
              const Icon(Icons.chevron_right_rounded, size: 18),
            ]),
          ),
      ]),
    );
  }
}

class LoadingView extends StatelessWidget {
  const LoadingView({super.key});
  @override
  Widget build(BuildContext context) => const Center(child: CircularProgressIndicator());
}

class ErrorView extends StatelessWidget {
  final Object? error;
  final VoidCallback? onRetry;
  const ErrorView({super.key, this.error, this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const Text('😕', style: TextStyle(fontSize: 48)),
          const SizedBox(height: 12),
          Text(context.tr('something_went_wrong'),
              style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: 6),
          Text('${error ?? ''}', textAlign: TextAlign.center, style: context.text.bodySmall?.copyWith(color: context.mutedText)),
          if (onRetry != null) ...[
            const SizedBox(height: 16),
            AppButton(label: context.tr('retry'), onPressed: onRetry, expand: false, height: 44),
          ],
        ]),
      ),
    );
  }
}

class EmptyView extends StatelessWidget {
  final String emoji;
  /// Optional illustration asset (assets/images/empty/*.webp) shown instead of the emoji circle.
  final String? image;
  final String title;
  final String? message;
  final String? actionLabel;
  final VoidCallback? onAction;
  const EmptyView({super.key, this.emoji = '🛍️', this.image, required this.title, this.message, this.actionLabel, this.onAction});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          if (image != null)
            Image.asset(image!, width: 160, height: 160, fit: BoxFit.contain)
          else
            Container(
              width: 110,
              height: 110,
              decoration: const BoxDecoration(color: AppColors.primary50, shape: BoxShape.circle),
              alignment: Alignment.center,
              child: Text(emoji, style: const TextStyle(fontSize: 50)),
            ),
          const SizedBox(height: 18),
          Text(title, textAlign: TextAlign.center, style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
          if (message != null) ...[
            const SizedBox(height: 6),
            Text(message!, textAlign: TextAlign.center, style: context.text.bodyMedium?.copyWith(color: context.mutedText)),
          ],
          if (actionLabel != null) ...[
            const SizedBox(height: 20),
            AppButton(label: actionLabel!, onPressed: onAction, expand: false, height: 46),
          ],
        ]),
      ),
    );
  }
}

class ShimmerBox extends StatelessWidget {
  final double? width;
  final double height;
  final double radius;
  const ShimmerBox({super.key, this.width, required this.height, this.radius = 12});

  @override
  Widget build(BuildContext context) {
    final dark = context.isDark;
    return Shimmer.fromColors(
      baseColor: dark ? AppColors.darkSurface : const Color(0xFFEDEFF3),
      highlightColor: dark ? AppColors.darkBorder : const Color(0xFFF8F9FB),
      child: Container(
        width: width,
        height: height,
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(radius)),
      ),
    );
  }
}

class ProductGridShimmer extends StatelessWidget {
  final int count;
  const ProductGridShimmer({super.key, this.count = 6});

  @override
  Widget build(BuildContext context) {
    return GridView.builder(
      padding: const EdgeInsets.all(12),
      physics: const NeverScrollableScrollPhysics(),
      shrinkWrap: true,
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        mainAxisSpacing: 10,
        crossAxisSpacing: 10,
        childAspectRatio: 0.58,
      ),
      itemCount: count,
      itemBuilder: (_, _) => const ShimmerBox(height: 260),
    );
  }
}

class RatingStars extends StatelessWidget {
  final double rating;
  final double size;
  final Color color;
  const RatingStars({super.key, required this.rating, this.size = 14, this.color = const Color(0xFFF5A524)});

  @override
  Widget build(BuildContext context) {
    return Row(mainAxisSize: MainAxisSize.min, children: [
      for (var i = 1; i <= 5; i++)
        Icon(
          rating >= i ? Icons.star_rounded : (rating >= i - 0.5 ? Icons.star_half_rounded : Icons.star_outline_rounded),
          size: size,
          color: color,
        ),
    ]);
  }
}

class PriceRow extends StatelessWidget {
  final double price;
  final double? mrp;
  final double fontSize;
  final bool showOff;
  const PriceRow({super.key, required this.price, this.mrp, this.fontSize = 14, this.showOff = false});

  @override
  Widget build(BuildContext context) {
    final hasMrp = mrp != null && mrp! > price;
    final off = hasMrp ? ((mrp! - price) / mrp! * 100).round() : 0;
    return Wrap(crossAxisAlignment: WrapCrossAlignment.center, spacing: 6, children: [
      Text(Fmt.money(price), style: TextStyle(fontSize: fontSize, fontWeight: FontWeight.w800)),
      if (hasMrp)
        Text(
          Fmt.money(mrp),
          style: TextStyle(
            fontSize: fontSize - 3,
            color: context.mutedText,
            decoration: TextDecoration.lineThrough,
          ),
        ),
      if (showOff && off > 0)
        Text('$off% OFF',
            style: TextStyle(fontSize: fontSize - 3, color: AppColors.primary, fontWeight: FontWeight.w800)),
    ]);
  }
}

class QtyStepper extends StatelessWidget {
  final int qty;
  final VoidCallback onMinus;
  final VoidCallback onPlus;
  final double height;
  final double width;
  /// False at max_qty_per_order / stock: the + button is dimmed and disabled.
  final bool canIncrement;
  const QtyStepper({
    super.key,
    required this.qty,
    required this.onMinus,
    required this.onPlus,
    this.height = 32,
    this.width = 84,
    this.canIncrement = true,
  });

  @override
  Widget build(BuildContext context) {
    Widget btn(IconData icon, VoidCallback? onTap, String label) => Semantics(
          button: true,
          label: label,
          child: InkWell(
            onTap: onTap,
            borderRadius: BorderRadius.circular(8),
            child: SizedBox(
              width: height,
              height: height,
              child: Icon(icon, color: onTap == null ? Colors.white54 : Colors.white, size: height * 0.5),
            ),
          ),
        );
    return Container(
      height: height,
      width: width,
      decoration: BoxDecoration(color: AppColors.primary, borderRadius: BorderRadius.circular(8)),
      child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
        btn(Icons.remove_rounded, onMinus, 'Decrease'),
        Text('$qty', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 14)),
        btn(Icons.add_rounded, canIncrement ? onPlus : null, 'Increase'),
      ]),
    );
  }
}

/// White rounded card with a soft border.
class AppCard extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;
  final EdgeInsetsGeometry margin;
  final VoidCallback? onTap;
  final Color? color;
  const AppCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(14),
    this.margin = EdgeInsets.zero,
    this.onTap,
    this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: margin,
      child: Material(
        color: color ?? context.cardColor,
        borderRadius: BorderRadius.circular(AppRadius.card),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(AppRadius.card),
          child: Container(
            padding: padding,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(AppRadius.card),
              border: Border.all(color: context.borderColor),
            ),
            child: child,
          ),
        ),
      ),
    );
  }
}

/// Soft colored pill (status badges etc.).
class Pill extends StatelessWidget {
  final String label;
  final Color color;
  final IconData? icon;
  final double fontSize;
  const Pill({super.key, required this.label, this.color = AppColors.primary, this.icon, this.fontSize = 11});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(AppRadius.pill)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        if (icon != null) ...[Icon(icon, size: fontSize + 2, color: color), const SizedBox(width: 4)],
        Text(label, style: TextStyle(color: color, fontSize: fontSize, fontWeight: FontWeight.w700)),
      ]),
    );
  }
}

Color statusColor(String status) {
  switch (status) {
    case 'delivered':
      return AppColors.primary;
    case 'cancelled':
    case 'returned':
    case 'failed':
      return AppColors.danger;
    case 'payment_pending':
    case 'pending':
      return AppColors.warning;
    case 'out_for_delivery':
    case 'shipped':
    case 'picked_up':
      return AppColors.info;
    default:
      return AppColors.purple;
  }
}

/// Horizontal label/value row used in bill details.
class KeyValueRow extends StatelessWidget {
  final String label;
  final String value;
  final bool bold;
  final Color? valueColor;
  final Widget? leading;
  const KeyValueRow({super.key, required this.label, required this.value, this.bold = false, this.valueColor, this.leading});

  @override
  Widget build(BuildContext context) {
    final style = bold
        ? context.text.titleSmall?.copyWith(fontWeight: FontWeight.w800)
        : context.text.bodyMedium?.copyWith(color: context.mutedText);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(children: [
        if (leading != null) ...[leading!, const SizedBox(width: 8)],
        Expanded(child: Text(label, style: style)),
        Text(value,
            style: (bold ? style : context.text.bodyMedium?.copyWith(fontWeight: FontWeight.w600))
                ?.copyWith(color: valueColor)),
      ]),
    );
  }
}
