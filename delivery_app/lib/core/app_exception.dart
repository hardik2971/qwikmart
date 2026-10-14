import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_core/firebase_core.dart';

/// Error surfaced to the UI for every failed backend call (Firebase or the mock backend).
///
/// [code] follows the Firebase / `HttpsError` codes (`invalid-argument`, `failed-precondition`,
/// `permission-denied`, `not-found`, `unauthenticated`, `unavailable`, …).
class AppException implements Exception {
  AppException(this.message, {this.code = 'unknown', this.errors, this.isNetwork = false});

  final String message;
  final String code;

  /// Field errors, e.g. `{'otp': ['Invalid delivery OTP.']}`.
  final Map<String, dynamic>? errors;

  /// True when the backend could not be reached (offline, emulator down, deadline exceeded).
  final bool isNetwork;

  bool get isUnauthenticated => code == 'unauthenticated';
  bool get isNotFound => code == 'not-found';
  bool get isPermissionDenied => code == 'permission-denied';

  /// First validation message, if any.
  String get firstError {
    final e = errors;
    if (e != null && e.isNotEmpty) {
      final v = e.values.first;
      if (v is List && v.isNotEmpty) return v.first.toString();
      return v.toString();
    }
    return message;
  }

  @override
  String toString() => firstError;

  static const _networkCodes = {'unavailable', 'deadline-exceeded', 'network-request-failed'};

  /// Maps Firebase SDK errors (callables, Firestore, Storage) to [AppException].
  static AppException from(Object e) {
    if (e is AppException) return e;
    if (e is FirebaseFunctionsException) {
      final details = e.details;
      Map<String, dynamic>? errors;
      if (details is Map && details['field'] != null) {
        errors = {details['field'].toString(): [e.message ?? 'Invalid value']};
      }
      return AppException(e.message ?? 'Request failed', code: e.code, errors: errors, isNetwork: _networkCodes.contains(e.code));
    }
    if (e is FirebaseException) {
      final msg = switch (e.code) {
        'permission-denied' => 'You do not have access to this data.',
        'unavailable' => 'Unable to reach server. Check your connection.',
        _ => e.message ?? 'Request failed',
      };
      return AppException(msg, code: e.code, isNetwork: _networkCodes.contains(e.code));
    }
    return AppException(e.toString());
  }
}
