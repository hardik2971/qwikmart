import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';

/// User-facing error raised by the data layer (Firebase callables / Firestore / Storage, or the offline mock).
///
/// [code] follows the Firebase error codes (`unauthenticated`, `permission-denied`, `invalid-argument`,
/// `failed-precondition`, `not-found`, `unavailable`, …).
class AppException implements Exception {
  final String message;
  final String code;
  final Map<String, dynamic> errors;
  const AppException(this.message, {this.code = 'unknown', this.errors = const {}});

  const AppException.unauthenticated([String message = 'Please login to continue'])
      : this(message, code: 'unauthenticated');

  bool get isUnauthorized => code == 'unauthenticated';

  /// First field message (mock validation errors), else the general message.
  String get displayMessage {
    for (final v in errors.values) {
      if (v is List && v.isNotEmpty) return v.first.toString();
      if (v is String && v.isNotEmpty) return v;
    }
    return message;
  }

  /// Maps any error thrown by the Firebase SDKs to an [AppException] with a readable message.
  static AppException from(Object e) {
    if (e is AppException) return e;
    if (e is FirebaseFunctionsException) {
      final details = e.details;
      final field = details is Map ? details['field']?.toString() : null;
      return AppException(
        _clean(e.message) ?? _byCode(e.code),
        code: e.code,
        errors: field == null ? const {} : {field: _clean(e.message) ?? ''},
      );
    }
    if (e is FirebaseAuthException) return AppException(e.message ?? _byCode(e.code), code: e.code);
    if (e is FirebaseException) {
      if (e.code == 'permission-denied') {
        return AppException('You do not have access to this. Please login again.', code: e.code);
      }
      return AppException(_clean(e.message) ?? _byCode(e.code), code: e.code);
    }
    return AppException(e.toString().replaceFirst('Exception: ', ''));
  }

  static String? _clean(String? m) {
    if (m == null || m.trim().isEmpty) return null;
    // The Functions JS SDK (Flutter web) appends the HTTP status to HttpsError messages: "… [400]".
    final t = m.trim().replaceFirst(RegExp(r'\s*\[\d{3}\]$'), '');
    if (t.isEmpty) return null;
    // Non-HttpsError failures surface as "INTERNAL" — keep those generic.
    if (t.toUpperCase() == 'INTERNAL') return null;
    return t;
  }

  static String _byCode(String code) {
    switch (code) {
      case 'unauthenticated':
        return 'Please login to continue';
      case 'permission-denied':
        return 'You do not have permission to do this';
      case 'not-found':
        return 'Not found';
      case 'unavailable':
      case 'deadline-exceeded':
        return 'The server is not reachable. Please try again';
      default:
        return 'Something went wrong. Please try again';
    }
  }

  @override
  String toString() => displayMessage;
}

/// Runs [op] and rethrows any failure as [AppException].
Future<T> guard<T>(Future<T> Function() op) async {
  try {
    return await op();
  } catch (e) {
    throw AppException.from(e);
  }
}
