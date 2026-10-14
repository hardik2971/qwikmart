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
  static const border = Color(0xFFE6EAF2);
  static const surface = Color(0xFFFFFFFF);
  static const ink = Color(0xFF111827);
  static const info = Color(0xFF3B82F6);
  static const success = Color(0xFF22C55E);
  static const warning = Color(0xFFF59E0B);
  static const danger = Color(0xFFEF4444);
  static const purple = Color(0xFF8B5CF6);
  static const chatReceived = Color(0xFFEDEFF3);
  static const scaffoldLight = Color(0xFFF6F8FB);

  // dark palette
  static const darkBg = Color(0xFF0F1419);
  static const darkSurface = Color(0xFF182029);
  static const darkBorder = Color(0xFF263241);
  static const darkText = Color(0xFFE6EAF2);
}

class AppRadius {
  AppRadius._();
  static const card = 12.0;
  static const button = 10.0;
  static const pill = 999.0;
}

/// Convenience accessors that adapt to light/dark.
extension ThemeX on BuildContext {
  ThemeData get theme => Theme.of(this);
  bool get isDark => Theme.of(this).brightness == Brightness.dark;
  Color get cardColor => isDark ? AppColors.darkSurface : AppColors.surface;
  Color get borderColor => isDark ? AppColors.darkBorder : AppColors.border;
  Color get textColor => isDark ? AppColors.darkText : AppColors.ink;
  Color get bodyColor => isDark ? const Color(0xFFB8C2D3) : AppColors.bodyText;
  Color get mutedColor => isDark ? const Color(0xFF8D9BB8) : AppColors.muted;
  Color get softGreen => isDark ? const Color(0xFF15361D) : AppColors.primary50;
}

class AppTheme {
  AppTheme._();

  static ThemeData light() => _build(Brightness.light);
  static ThemeData dark() => _build(Brightness.dark);

  static ThemeData _build(Brightness b) {
    final dark = b == Brightness.dark;
    final scheme = ColorScheme.fromSeed(
      seedColor: AppColors.primary,
      brightness: b,
    ).copyWith(
      primary: AppColors.primary,
      onPrimary: Colors.white,
      secondary: AppColors.primaryDark,
      surface: dark ? AppColors.darkSurface : AppColors.surface,
      onSurface: dark ? AppColors.darkText : AppColors.ink,
      error: AppColors.danger,
      outline: dark ? AppColors.darkBorder : AppColors.border,
    );
    final base = ThemeData(useMaterial3: true, brightness: b, colorScheme: scheme);
    final textTheme = GoogleFonts.plusJakartaSansTextTheme(base.textTheme).apply(
      bodyColor: dark ? AppColors.darkText : AppColors.bodyText,
      displayColor: dark ? AppColors.darkText : AppColors.ink,
    );
    final border = OutlineInputBorder(
      borderRadius: BorderRadius.circular(AppRadius.button),
      borderSide: BorderSide(color: dark ? AppColors.darkBorder : AppColors.border),
    );
    return base.copyWith(
      textTheme: textTheme,
      scaffoldBackgroundColor: dark ? AppColors.darkBg : AppColors.scaffoldLight,
      dividerColor: dark ? AppColors.darkBorder : AppColors.border,
      appBarTheme: AppBarTheme(
        backgroundColor: dark ? AppColors.darkSurface : AppColors.surface,
        foregroundColor: dark ? AppColors.darkText : AppColors.ink,
        elevation: 0,
        scrolledUnderElevation: 0.5,
        centerTitle: false,
        titleTextStyle: GoogleFonts.plusJakartaSans(
          fontSize: 17,
          fontWeight: FontWeight.w700,
          color: dark ? AppColors.darkText : AppColors.ink,
        ),
      ),
      cardTheme: CardThemeData(
        color: dark ? AppColors.darkSurface : AppColors.surface,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadius.card),
          side: BorderSide(color: dark ? AppColors.darkBorder : AppColors.border),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: dark ? AppColors.darkSurface : AppColors.surface,
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        hintStyle: TextStyle(color: dark ? const Color(0xFF6B7A94) : const Color(0xFF98A2B3), fontSize: 14),
        border: border,
        enabledBorder: border,
        focusedBorder: border.copyWith(borderSide: const BorderSide(color: AppColors.primary, width: 1.5)),
        errorBorder: border.copyWith(borderSide: const BorderSide(color: AppColors.danger)),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.primary,
          foregroundColor: Colors.white,
          disabledBackgroundColor: AppColors.primary.withValues(alpha: 0.4),
          disabledForegroundColor: Colors.white,
          elevation: 0,
          minimumSize: const Size.fromHeight(50),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.button)),
          textStyle: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700, fontSize: 15),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: AppColors.primary,
          minimumSize: const Size.fromHeight(48),
          side: const BorderSide(color: AppColors.primary),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.button)),
          textStyle: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w600, fontSize: 14),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: AppColors.primary,
          textStyle: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w600),
        ),
      ),
      switchTheme: SwitchThemeData(
        thumbColor: WidgetStateProperty.all(Colors.white),
        trackColor: WidgetStateProperty.resolveWith(
          (s) => s.contains(WidgetState.selected) ? AppColors.primary : const Color(0xFFD0D5DD),
        ),
        trackOutlineColor: WidgetStateProperty.all(Colors.transparent),
      ),
      tabBarTheme: TabBarThemeData(
        labelColor: AppColors.primary,
        unselectedLabelColor: dark ? const Color(0xFF8D9BB8) : AppColors.muted,
        indicatorColor: AppColors.primary,
        indicatorSize: TabBarIndicatorSize.tab,
        labelStyle: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700, fontSize: 14),
        unselectedLabelStyle: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w600, fontSize: 14),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: dark ? AppColors.darkSurface : AppColors.surface,
        indicatorColor: dark ? const Color(0xFF15361D) : AppColors.primary50,
        elevation: 0,
        height: 66,
        labelTextStyle: WidgetStateProperty.resolveWith(
          (s) => GoogleFonts.plusJakartaSans(
            fontSize: 12,
            fontWeight: s.contains(WidgetState.selected) ? FontWeight.w700 : FontWeight.w500,
            color: s.contains(WidgetState.selected)
                ? AppColors.primary
                : (dark ? const Color(0xFF8D9BB8) : AppColors.muted),
          ),
        ),
        iconTheme: WidgetStateProperty.resolveWith(
          (s) => IconThemeData(
            color: s.contains(WidgetState.selected)
                ? AppColors.primary
                : (dark ? const Color(0xFF8D9BB8) : AppColors.muted),
          ),
        ),
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: dark ? AppColors.darkSurface : AppColors.surface,
        showDragHandle: true,
        shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      ),
      snackBarTheme: const SnackBarThemeData(behavior: SnackBarBehavior.floating),
      dialogTheme: DialogThemeData(
        backgroundColor: dark ? AppColors.darkSurface : AppColors.surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      ),
    );
  }
}
