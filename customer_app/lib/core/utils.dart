import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

/// Money / date formatting helpers.
class Fmt {
  Fmt._();
  static String currencySymbol = '₹';

  static String money(num? v, {bool decimals = true}) {
    final value = (v ?? 0).toDouble();
    final hasFraction = value != value.roundToDouble();
    final f = NumberFormat.currency(
      locale: 'en_IN',
      symbol: currencySymbol,
      decimalDigits: (decimals && hasFraction) ? 2 : 0,
    );
    return f.format(value);
  }

  static String date(DateTime? d) => d == null ? '' : DateFormat('dd MMM yyyy').format(d);
  static String dateTime(DateTime? d) => d == null ? '' : DateFormat('dd-MM-yyyy hh:mm a').format(d);
  static String time(DateTime? d) => d == null ? '' : DateFormat('hh:mm a').format(d);

  static String relative(DateTime? d) {
    if (d == null) return '';
    final diff = DateTime.now().difference(d);
    if (diff.inMinutes < 1) return 'just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    if (diff.inDays < 7) return '${diff.inDays}d ago';
    return date(d);
  }

  static String km(double v) => '${v.toStringAsFixed(2)} km';

  static String titleCase(String s) => s
      .replaceAll('_', ' ')
      .split(' ')
      .where((w) => w.isNotEmpty)
      .map((w) => w[0].toUpperCase() + w.substring(1))
      .join(' ');
}

/// Emoji used as an offline-friendly visual for products / categories without images.
String emojiFor(String name) {
  final n = name.toLowerCase();
  if (n == 'all') return '🛍️';
  const map = <String, String>{
    'grocery': '🛒', 'beauty': '💄', 'pharmacy': '💊', 'kids': '🧸', 'summer': '☀️',
    'electronic': '🎧', 'fashion': '👕', 'mobile': '📱', 'snack': '🍿', 'fresh': '🥬', 'home': '🏠',
    'pet': '🐾', 'dal': '🫘', 'pulse': '🫘', 'atta': '🌾', 'rice': '🍚', 'flour': '🌾', 'oil': '🫒',
    'masala': '🌶️', 'spice': '🌶️', 'dairy': '🥛', 'milk': '🥛', 'egg': '🥚', 'bakery': '🍞', 'bread': '🍞',
    'biscuit': '🍪', 'cookie': '🍪', 'dry fruit': '🥜', 'almond': '🥜', 'cashew': '🥜', 'tea': '🍵',
    'coffee': '☕', 'chip': '🥔', 'namkeen': '🥨', 'bhujia': '🥨', 'wafer': '🧇', 'chocolate': '🍫',
    'cold drink': '🥤', 'cola': '🥤', 'juice': '🧃', 'vegetable': '🥦', 'fruit': '🍎', 'herb': '🌿',
    'tomato': '🍅', 'onion': '🧅', 'potato': '🥔', 'banana': '🍌', 'mango': '🥭', 'apple': '🍎',
    'lemon': '🍋', 'coriander': '🌿', 'curry leaves': '🌿', 'skin': '🧴', 'hair': '💆', 'makeup': '💄',
    'lipstick': '💄', 'fragrance': '🌸', 'perfume': '🌸', 'cough': '🤧', 'acidity': '🫗', 'pain': '🩹',
    'health drink': '🥤', 'nutrition': '💪', 'diaper': '👶', 'baby': '🍼', 'toy': '🧸', 'sunscreen': '🧴',
    'ice cream': '🍦', 'audio': '🎧', 'earbud': '🎧', 'airdopes': '🎧', 'power bank': '🔋', 'watch': '⌚',
    'women': '👗', 'men': '👔', 'footwear': '👟', 'sneaker': '👟', 'smartphone': '📱', 'accessor': '🔌',
    'cookware': '🍳', 'cooker': '🍳', 'storage': '🫙', 'bottle': '🍶', 'clean': '🧽', 'dog': '🐕',
    'cat': '🐈', 'butter': '🧈', 'curd': '🥣', 'paneer': '🧀', 'cheese': '🧀', 'noodle': '🍜', 'maggi': '🍜',
    'jam': '🍓', 'honey': '🍯', 'salt': '🧂', 'sugar': '🍬', 'soap': '🧼', 'toothpaste': '🪥',
    'face wash': '🧴', 'shampoo': '🧴', 'detergent': '🧺', 'tablet': '💊', 'syrup': '🧪', 'bulb': '💡',
    't-shirt': '👕', 'kurta': '👘', 'saree': '🥻', 'handbag': '👜', 'charger': '🔌', 'cable': '🔌',
  };
  for (final e in map.entries) {
    if (n.contains(e.key)) return e.value;
  }
  return '🛍️';
}

/// Soft background tint for an emoji tile, stable per name.
Color tintFor(String name) {
  const tints = [
    Color(0xFFE6F4E9), Color(0xFFFFF4E5), Color(0xFFFDECEC), Color(0xFFEAF2FF),
    Color(0xFFF3EDFF), Color(0xFFFFF9DB), Color(0xFFE8F8F5), Color(0xFFFDEFF7),
  ];
  return tints[name.hashCode.abs() % tints.length];
}

void showSnack(BuildContext context, String message, {bool error = false}) {
  // Inside a bottom sheet / dialog the Scaffold's SnackBar is drawn underneath the sheet and never seen:
  // show the message as a toast on the root overlay instead.
  if (ModalRoute.of(context) is PopupRoute) {
    _showOverlayToast(context, message, error: error);
    return;
  }
  final m = ScaffoldMessenger.maybeOf(context);
  if (m == null) return;
  m
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(
      content: Text(message),
      backgroundColor: error ? const Color(0xFFB42318) : null,
      duration: const Duration(seconds: 2),
    ));
}

OverlayEntry? _toast;

void _showOverlayToast(BuildContext context, String message, {bool error = false}) {
  final overlay = Overlay.maybeOf(context, rootOverlay: true);
  if (overlay == null) return;
  _toast?.remove();
  final entry = OverlayEntry(
    builder: (ctx) => Positioned(
      left: 16,
      right: 16,
      top: MediaQuery.of(ctx).padding.top + 12,
      child: Material(
        elevation: 6,
        borderRadius: BorderRadius.circular(10),
        color: error ? const Color(0xFFB42318) : const Color(0xFF323232),
        child: Semantics(
          liveRegion: true,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            child: Text(message, style: const TextStyle(color: Colors.white, fontSize: 14)),
          ),
        ),
      ),
    ),
  );
  _toast = entry;
  overlay.insert(entry);
  Future.delayed(const Duration(seconds: 3), () {
    if (_toast == entry) _toast = null;
    if (entry.mounted) entry.remove();
  });
}
