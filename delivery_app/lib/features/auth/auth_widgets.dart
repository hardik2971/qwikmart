import 'package:flutter/material.dart';

import '../../core/l10n.dart';

final _emailRe = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$');

String? validateEmail(BuildContext context, String? v) {
  if (v == null || v.trim().isEmpty) return context.tr('required');
  if (!_emailRe.hasMatch(v.trim())) return context.tr('invalid_email');
  return null;
}

String? validateRequired(BuildContext context, String? v) =>
    (v == null || v.trim().isEmpty) ? context.tr('required') : null;
