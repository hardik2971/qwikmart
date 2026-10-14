import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shimmer/shimmer.dart';

import '../core/app_exception.dart';
import '../core/auth_service.dart';
import '../core/config.dart';
import '../core/l10n.dart';
import '../core/theme.dart';

/// QwikMart logo — full-colour on light backgrounds, white variant in dark mode or when [white] is set.
class BrandLogo extends StatelessWidget {
  const BrandLogo({super.key, this.height = 40, this.iconOnly = false, this.white});
  final double height;
  final bool iconOnly;
  final bool? white;

  @override
  Widget build(BuildContext context) {
    final useWhite = white ?? Theme.of(context).brightness == Brightness.dark;
    if (iconOnly) {
      return Image.asset(useWhite ? 'assets/brand/qwikmart-mark-white.png' : 'assets/brand/qwikmart-icon.png',
          height: height, width: height, semanticLabel: 'QwikMart');
    }
    return Image.asset(useWhite ? 'assets/brand/qwikmart-logo-white.png' : 'assets/brand/qwikmart-logo.png',
        height: height, fit: BoxFit.contain, semanticLabel: 'QwikMart');
  }
}

class AppCard extends StatelessWidget {
  const AppCard({super.key, required this.child, this.padding = const EdgeInsets.all(14), this.onTap, this.color, this.margin});
  final Widget child;
  final EdgeInsetsGeometry padding;
  final EdgeInsetsGeometry? margin;
  final VoidCallback? onTap;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: margin,
      decoration: BoxDecoration(
        color: color ?? context.cardColor,
        borderRadius: BorderRadius.circular(AppRadius.card),
        border: Border.all(color: context.borderColor),
        boxShadow: context.isDark
            ? null
            : const [BoxShadow(color: Color(0x0D101828), blurRadius: 2, offset: Offset(0, 1))],
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(AppRadius.card),
          onTap: onTap,
          child: Padding(padding: padding, child: child),
        ),
      ),
    );
  }
}

/// Colour for any order / return / withdrawal / cash status.
Color statusColor(String status) {
  switch (status) {
    case 'delivered':
    case 'approved':
    case 'success':
    case 'paid':
    case 'picked_up':
    case 'refund_completed':
    case 'credited':
      return AppColors.primary;
    case 'cancelled':
    case 'rejected':
    case 'failed':
    case 'returned':
      return AppColors.danger;
    case 'out_for_delivery':
      return AppColors.info;
    case 'ready_for_pickup':
    case 'pickup_assigned':
      return AppColors.purple;
    default:
      return AppColors.warning;
  }
}

class StatusPill extends StatelessWidget {
  const StatusPill(this.status, {super.key, this.label});
  final String status;
  final String? label;

  @override
  Widget build(BuildContext context) {
    final c = statusColor(status);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: c.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(AppRadius.pill)),
      child: Text(
        label ?? context.trStatus(status),
        style: TextStyle(color: c, fontSize: 11.5, fontWeight: FontWeight.w700),
      ),
    );
  }
}

class PaymentPill extends StatelessWidget {
  const PaymentPill({super.key, required this.isCod});
  final bool isCod;

  @override
  Widget build(BuildContext context) {
    final c = isCod ? AppColors.warning : AppColors.primary;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
      decoration: BoxDecoration(
        color: c.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(AppRadius.pill),
        border: Border.all(color: c.withValues(alpha: 0.35)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(isCod ? Icons.payments_outlined : Icons.verified_outlined, size: 13, color: c),
          const SizedBox(width: 4),
          Text(
            isCod ? context.tr('cod') : context.tr('prepaid'),
            style: TextStyle(color: c, fontSize: 11, fontWeight: FontWeight.w700),
          ),
        ],
      ),
    );
  }
}

/// Soft green full-width button ("Get Directions" in screenshot 28).
class SoftButton extends StatelessWidget {
  const SoftButton({super.key, required this.label, this.icon, this.onTap, this.expand = true});
  final String label;
  final IconData? icon;
  final VoidCallback? onTap;
  final bool expand;

  @override
  Widget build(BuildContext context) {
    final btn = Material(
      color: context.softGreen,
      borderRadius: BorderRadius.circular(8),
      child: InkWell(
        borderRadius: BorderRadius.circular(8),
        onTap: onTap,
        child: Container(
          height: 38,
          padding: const EdgeInsets.symmetric(horizontal: 12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: AppColors.primary.withValues(alpha: 0.25)),
          ),
          child: Row(
            mainAxisSize: expand ? MainAxisSize.max : MainAxisSize.min,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (icon != null) ...[Icon(icon, size: 16, color: AppColors.primary), const SizedBox(width: 6)],
              Flexible(
                child: Text(
                  label,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: AppColors.primary, fontWeight: FontWeight.w600, fontSize: 13),
                ),
              ),
            ],
          ),
        ),
      ),
    );
    return btn;
  }
}

/// Small rounded-square tinted icon button (call / chat in screenshot 28).
class TintIconButton extends StatelessWidget {
  const TintIconButton({super.key, required this.icon, this.onTap, this.tooltip, this.color = AppColors.primary});
  final IconData icon;
  final VoidCallback? onTap;
  final String? tooltip;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final w = Material(
      color: color.withValues(alpha: 0.1),
      borderRadius: BorderRadius.circular(8),
      child: InkWell(
        borderRadius: BorderRadius.circular(8),
        onTap: onTap,
        child: Container(
          width: 38,
          height: 38,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: color.withValues(alpha: 0.25)),
          ),
          child: Icon(icon, size: 18, color: color),
        ),
      ),
    );
    if (tooltip == null) return w;
    // Icon-only button: expose the tooltip as its accessible label (screen readers, UI tests).
    return Semantics(label: tooltip, child: Tooltip(message: tooltip!, excludeFromSemantics: true, child: w));
  }
}

class IconTile extends StatelessWidget {
  const IconTile({super.key, required this.icon, this.color = AppColors.primary, this.size = 40, this.solid = false});
  final IconData icon;
  final Color color;
  final double size;
  final bool solid;

  @override
  Widget build(BuildContext context) => Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          color: solid ? color : color.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(size * 0.28),
        ),
        child: Icon(icon, color: solid ? Colors.white : color, size: size * 0.5),
      );
}

class AppNetworkImage extends StatelessWidget {
  const AppNetworkImage(this.url, {super.key, this.size = 48, this.radius = 8});
  final String? url;
  final double size;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final placeholder = Container(
      width: size,
      height: size,
      color: context.softGreen,
      child: Icon(Icons.inventory_2_outlined, color: AppColors.primary, size: size * 0.45),
    );
    return ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: url == null || url!.isEmpty
          ? placeholder
          : CachedNetworkImage(
              imageUrl: url!,
              width: size,
              height: size,
              fit: BoxFit.cover,
              placeholder: (_, _) => placeholder,
              errorWidget: (_, _, _) => placeholder,
            ),
    );
  }
}

class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.title, this.subtitle, this.icon = Icons.inbox_outlined, this.action, this.image});
  final String title;
  /// Optional illustration asset (assets/images/empty/*.webp) shown instead of the icon circle.
  final String? image;
  final String? subtitle;
  final IconData icon;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (image != null)
              Image.asset(image!, width: 140, height: 140, fit: BoxFit.contain)
            else
              Container(
                width: 76,
                height: 76,
                decoration: BoxDecoration(color: context.softGreen, shape: BoxShape.circle),
                child: Icon(icon, size: 36, color: AppColors.primary),
              ),
            const SizedBox(height: 14),
            Text(title, textAlign: TextAlign.center, style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16, color: context.textColor)),
            if (subtitle != null) ...[
              const SizedBox(height: 6),
              Text(subtitle!, textAlign: TextAlign.center, style: TextStyle(color: context.mutedColor, fontSize: 13)),
            ],
            if (action != null) ...[const SizedBox(height: 16), action!],
          ],
        ),
      ),
    );
  }
}

class ErrorState extends StatelessWidget {
  const ErrorState({super.key, required this.error, this.onRetry});
  final Object error;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final msg = error is AppException ? (error as AppException).firstError : context.tr('something_wrong');
    return EmptyState(
      icon: Icons.wifi_off_rounded,
      title: context.tr('something_wrong'),
      subtitle: msg,
      action: onRetry == null
          ? null
          : SizedBox(width: 140, child: OutlinedButton(onPressed: onRetry, child: Text(context.tr('retry')))),
    );
  }
}

class ShimmerList extends StatelessWidget {
  const ShimmerList({super.key, this.count = 5, this.height = 96, this.padding = const EdgeInsets.all(16)});
  final int count;
  final double height;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    return Shimmer.fromColors(
      baseColor: context.isDark ? const Color(0xFF1F2A36) : const Color(0xFFE9EDF3),
      highlightColor: context.isDark ? const Color(0xFF2A3644) : const Color(0xFFF7F9FC),
      child: ListView.separated(
        physics: const NeverScrollableScrollPhysics(),
        padding: padding,
        itemCount: count,
        separatorBuilder: (_, _) => const SizedBox(height: 12),
        itemBuilder: (_, _) => Container(
          height: height,
          decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(AppRadius.card)),
        ),
      ),
    );
  }
}

/// Renders an [AsyncValue] with shimmer loading + retry error.
class AsyncView<T> extends StatelessWidget {
  const AsyncView({super.key, required this.value, required this.builder, this.onRetry, this.loading});
  final AsyncValue<T> value;
  final Widget Function(T data) builder;
  final VoidCallback? onRetry;
  final Widget? loading;

  @override
  Widget build(BuildContext context) {
    return value.when(
      skipLoadingOnRefresh: true,
      skipLoadingOnReload: true,
      data: builder,
      loading: () => loading ?? const ShimmerList(),
      error: (e, _) => ErrorState(error: e, onRetry: onRetry),
    );
  }
}

class DemoBanner extends StatelessWidget {
  const DemoBanner({super.key, this.onDark = false});

  /// Use on green headers (white translucent pill).
  final bool onDark;

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<bool>(
      valueListenable: DemoMode.active,
      builder: (context, on, _) {
        if (!on) return const SizedBox.shrink();
        if (onDark) {
          return Center(
            child: Container(
              margin: const EdgeInsets.only(top: 6),
              padding: const EdgeInsets.symmetric(vertical: 3, horizontal: 10),
              decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.18), borderRadius: BorderRadius.circular(999)),
              child: Text(
                context.tr('demo_banner'),
                style: const TextStyle(fontSize: 11, color: Colors.white, fontWeight: FontWeight.w600),
              ),
            ),
          );
        }
        return Container(
          width: double.infinity,
          margin: const EdgeInsets.only(bottom: 8),
          padding: const EdgeInsets.symmetric(vertical: 5, horizontal: 12),
          decoration: BoxDecoration(
            color: AppColors.warning.withValues(alpha: 0.14),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Text(
            context.tr('demo_banner'),
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 11.5, color: Color(0xFFB45309), fontWeight: FontWeight.w600),
          ),
        );
      },
    );
  }
}

class SectionTitle extends StatelessWidget {
  const SectionTitle(this.text, {super.key, this.trailing});
  final String text;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: Row(
          children: [
            Expanded(
              child: Text(text, style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15, color: context.textColor)),
            ),
            ?trailing,
          ],
        ),
      );
}

/// Sticky bottom container for the primary action.
class BottomActionBar extends StatelessWidget {
  const BottomActionBar({super.key, required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) => Container(
        decoration: BoxDecoration(
          color: context.cardColor,
          border: Border(top: BorderSide(color: context.borderColor)),
        ),
        padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
        child: SafeArea(top: false, child: child),
      );
}

class LoadingButton extends StatelessWidget {
  const LoadingButton({super.key, required this.label, required this.onPressed, this.loading = false, this.icon});
  final String label;
  final VoidCallback? onPressed;
  final bool loading;
  final IconData? icon;

  @override
  Widget build(BuildContext context) => ElevatedButton(
        onPressed: loading ? null : onPressed,
        child: loading
            ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white))
            : Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (icon != null) ...[Icon(icon, size: 20), const SizedBox(width: 8)],
                  Flexible(child: Text(label, overflow: TextOverflow.ellipsis)),
                ],
              ),
      );
}

void showSnack(BuildContext context, String message, {bool error = false}) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(
        backgroundColor: error ? AppColors.danger : AppColors.ink,
        content: Text(message, style: const TextStyle(color: Colors.white)),
      ),
    );
}

/// User-facing message for an exception ([AuthFailure] keys are localised).
String errorText(Object e) {
  if (e is AppException) return e.firstError;
  if (e is AuthFailure) {
    if (e.key == 'auth_failed' && e.detail != null) return e.detail!;
    if (e.key == 'account_rejected' && e.detail != null) return '${AppLocalizations.current.t(e.key)}\n${e.detail}';
    return AppLocalizations.current.t(e.key);
  }
  return e.toString();
}

Future<bool> confirmDialog(BuildContext context, String message, {String? confirmLabel, bool danger = false}) async {
  final r = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      content: Text(message),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(ctx.tr('cancel'))),
        TextButton(
          onPressed: () => Navigator.pop(ctx, true),
          style: TextButton.styleFrom(foregroundColor: danger ? AppColors.danger : AppColors.primary),
          child: Text(confirmLabel ?? ctx.tr('yes')),
        ),
      ],
    ),
  );
  return r ?? false;
}

class LabeledField extends StatelessWidget {
  const LabeledField({super.key, required this.label, required this.child, this.required = false});
  final String label;
  final Widget child;
  final bool required;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text.rich(
              TextSpan(
                text: label,
                children: [if (required) const TextSpan(text: ' *', style: TextStyle(color: AppColors.danger))],
              ),
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: context.bodyColor),
            ),
            const SizedBox(height: 6),
            child,
          ],
        ),
      );
}
