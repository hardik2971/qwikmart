import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Design tokens from SPEC §2.
class AppColors {
  AppColors._();
  static const primary = Color(0xFF0E9623);
  static const primaryDark = Color(0xFF0B7A1C);
  static const primary50 = Color(0xFFE6F4E9);
  static const adminBg = Color(0xFFF2F7FF);
  static const navy = Color(0xFF25396F);
  static const muted = Color(0xFF7C8DB5);
  static const bodyText = Color(0xFF344054);
  static const ink = Color(0xFF111827);
  static const border = Color(0xFFE6EAF2);
  static const surface = Color(0xFFFFFFFF);
  static const pageBg = Color(0xFFF5F7FA);
  static const info = Color(0xFF3B82F6);
  static const success = Color(0xFF22C55E);
  static const warning = Color(0xFFF59E0B);
  static const danger = Color(0xFFEF4444);
  static const purple = Color(0xFF8B5CF6);
  static const grey = Color(0xFF98A2B3);

  // Dark palette
  static const darkBg = Color(0xFF0F1412);
  static const darkSurface = Color(0xFF1A201D);
  static const darkBorder = Color(0xFF2A322E);
  static const darkText = Color(0xFFE7ECE9);

  /// "Quick" mode header gradient (yellow-green).
  static const quickGradient = [Color(0xFFEBEC8D), Color(0xFFF8F9E9), Color(0xFFFFFFFF)];

  /// "eCommerce" mode header gradient (peach).
  static const ecommerceGradient = [Color(0xFFFDE2D6), Color(0xFFFFF4EE), Color(0xFFFFFFFF)];

  static Color fromHex(String? hex, [Color fallback = primary]) {
    if (hex == null || hex.isEmpty) return fallback;
    var h = hex.replaceAll('#', '').trim();
    if (h.length == 3) h = h.split('').map((c) => '$c$c').join();
    if (h.length == 6) h = 'FF$h';
    final v = int.tryParse(h, radix: 16);
    return v == null ? fallback : Color(v);
  }

  /// Builds the 3-stop header gradient used on Home from a category `header_color`.
  static List<Color> headerGradient(Color base, {bool dark = false}) {
    if (dark) {
      return [
        Color.lerp(base, darkBg, 0.72)!,
        Color.lerp(base, darkBg, 0.86)!,
        darkBg,
      ];
    }
    return [base, Color.lerp(base, Colors.white, 0.6)!, Colors.white];
  }
}

class AppRadius {
  AppRadius._();
  static const card = 12.0;
  static const button = 10.0;
  static const pill = 999.0;
}

class AppShadows {
  AppShadows._();
  static const soft = [BoxShadow(color: Color(0x0D101828), blurRadius: 2, offset: Offset(0, 1))];
  static const card = [BoxShadow(color: Color(0x14101828), blurRadius: 12, offset: Offset(0, 4))];
}

class AppTheme {
  AppTheme._();

  /// Set to false in tests (no network font fetching).
  static bool useGoogleFonts = true;

  static ThemeData light() => _build(Brightness.light);
  static ThemeData dark() => _build(Brightness.dark);

  static ThemeData _build(Brightness b) {
    final isDark = b == Brightness.dark;
    final scheme = ColorScheme.fromSeed(seedColor: AppColors.primary, brightness: b).copyWith(
      primary: AppColors.primary,
      onPrimary: Colors.white,
      secondary: AppColors.primaryDark,
      surface: isDark ? AppColors.darkSurface : AppColors.surface,
      onSurface: isDark ? AppColors.darkText : AppColors.ink,
      error: AppColors.danger,
      outline: isDark ? AppColors.darkBorder : AppColors.border,
      outlineVariant: isDark ? AppColors.darkBorder : AppColors.border,
    );
    final base = ThemeData(useMaterial3: true, brightness: b, colorScheme: scheme);
    final textTheme = _textTheme(base.textTheme, isDark);
    final borderColor = isDark ? AppColors.darkBorder : AppColors.border;

    return base.copyWith(
      scaffoldBackgroundColor: isDark ? AppColors.darkBg : AppColors.pageBg,
      textTheme: textTheme,
      primaryColor: AppColors.primary,
      dividerColor: borderColor,
      dividerTheme: DividerThemeData(color: borderColor, thickness: 1, space: 1),
      appBarTheme: AppBarTheme(
        backgroundColor: isDark ? AppColors.darkSurface : Colors.white,
        foregroundColor: isDark ? AppColors.darkText : AppColors.ink,
        elevation: 0,
        scrolledUnderElevation: 0.5,
        centerTitle: true,
        titleTextStyle: textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700, fontSize: 18),
      ),
      cardTheme: CardThemeData(
        color: isDark ? AppColors.darkSurface : Colors.white,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadius.card),
          side: BorderSide(color: borderColor),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.primary,
          foregroundColor: Colors.white,
          disabledBackgroundColor: AppColors.primary.withValues(alpha: 0.4),
          disabledForegroundColor: Colors.white,
          elevation: 0,
          minimumSize: const Size(64, 50),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.button)),
          textStyle: textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700, fontSize: 15),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: AppColors.primary,
          side: const BorderSide(color: AppColors.primary),
          minimumSize: const Size(64, 48),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.button)),
          textStyle: textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: AppColors.primary,
          textStyle: textTheme.labelLarge?.copyWith(fontWeight: FontWeight.w700),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: isDark ? AppColors.darkBg : Colors.white,
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        hintStyle: textTheme.bodyMedium?.copyWith(color: AppColors.grey),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadius.button),
          borderSide: BorderSide(color: borderColor),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadius.button),
          borderSide: BorderSide(color: borderColor),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadius.button),
          borderSide: const BorderSide(color: AppColors.primary, width: 1.5),
        ),
      ),
      chipTheme: base.chipTheme.copyWith(
        backgroundColor: isDark ? AppColors.darkSurface : Colors.white,
        selectedColor: AppColors.primary50,
        side: BorderSide(color: borderColor),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.pill)),
        labelStyle: textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w600),
      ),
      switchTheme: SwitchThemeData(
        thumbColor: WidgetStateProperty.resolveWith((s) => Colors.white),
        trackColor: WidgetStateProperty.resolveWith(
          (s) => s.contains(WidgetState.selected) ? AppColors.primary : (isDark ? AppColors.darkBorder : AppColors.border),
        ),
        trackOutlineColor: WidgetStateProperty.all(Colors.transparent),
      ),
      checkboxTheme: CheckboxThemeData(
        fillColor: WidgetStateProperty.resolveWith(
          (s) => s.contains(WidgetState.selected) ? AppColors.primary : Colors.transparent,
        ),
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: isDark ? AppColors.darkSurface : Colors.white,
        showDragHandle: true,
        shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: isDark ? AppColors.darkText : AppColors.ink,
        contentTextStyle: textTheme.bodyMedium?.copyWith(color: isDark ? AppColors.ink : Colors.white),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.button)),
      ),
      progressIndicatorTheme: const ProgressIndicatorThemeData(color: AppColors.primary),
      tabBarTheme: TabBarThemeData(
        labelColor: AppColors.primary,
        unselectedLabelColor: AppColors.muted,
        indicatorColor: AppColors.primary,
        labelStyle: textTheme.labelLarge?.copyWith(fontWeight: FontWeight.w700),
      ),
    );
  }

  static TextTheme _textTheme(TextTheme base, bool isDark) {
    final color = isDark ? AppColors.darkText : AppColors.ink;
    TextTheme t;
    try {
      t = useGoogleFonts ? GoogleFonts.plusJakartaSansTextTheme(base) : base;
    } catch (_) {
      t = base;
    }
    return t.apply(bodyColor: color, displayColor: color);
  }
}

extension ThemeX on BuildContext {
  ThemeData get theme => Theme.of(this);
  TextTheme get text => Theme.of(this).textTheme;
  bool get isDark => Theme.of(this).brightness == Brightness.dark;
  Color get cardColor => isDark ? AppColors.darkSurface : Colors.white;
  Color get borderColor => isDark ? AppColors.darkBorder : AppColors.border;
  Color get mutedText => isDark ? const Color(0xFF9AA6B2) : const Color(0xFF667085);
}
