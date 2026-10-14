import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:pin_code_fields/pin_code_fields.dart';

import '../../../core/config.dart';
import '../../../core/format.dart';
import '../../../core/l10n.dart';
import '../../../core/theme.dart';
import '../../../data/delivery_data_source.dart';
import '../../../models/models.dart';
import '../../../providers/core_providers.dart';
import '../../../widgets/common.dart';

/// Bottom sheet: 6-box OTP + COD cash confirmation → `deliverOrder` callable.
Future<DeliverResult?> showDeliverOtpSheet(BuildContext context, DeliveryOrder order) {
  return showModalBottomSheet<DeliverResult>(
    context: context,
    isScrollControlled: true,
    builder: (_) => _OtpSheet(order: order),
  );
}

class _OtpSheet extends ConsumerStatefulWidget {
  const _OtpSheet({required this.order});
  final DeliveryOrder order;

  @override
  ConsumerState<_OtpSheet> createState() => _OtpSheetState();
}

class _OtpSheetState extends ConsumerState<_OtpSheet> {
  final _pin = PinInputController();
  final _cash = TextEditingController();
  String _otp = '';
  bool _cashConfirmed = false;

  /// The customer paid less than the payable amount: the rider enters what was actually received
  /// (`deliverOrder.cash_collected`, recorded with `expected_amount` / `short_amount`).
  bool _partial = false;
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _pin.dispose();
    _cash.dispose();
    super.dispose();
  }

  bool get _collectsCash => widget.order.isCod && widget.order.amountToCollect > 0;

  /// Entered partial amount, null when invalid (must be 0 ≤ x < payable).
  double? get _partialAmount {
    final v = double.tryParse(_cash.text.trim());
    if (v == null || v < 0 || v >= widget.order.amountToCollect) return null;
    return double.parse(v.toStringAsFixed(2));
  }

  bool get _cashOk => !_collectsCash || (_partial ? _partialAmount != null : _cashConfirmed);

  bool get _canSubmit => _otp.length == 6 && _cashOk && !_loading;

  Future<void> _submit() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final o = widget.order;
      final cash = _collectsCash ? (_partial ? _partialAmount : o.amountToCollect) : null;
      final r = await ref.read(repositoryProvider).deliver(o.id, _otp, cashCollected: cash);
      if (mounted) Navigator.pop(context, r);
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = errorText(e));
      _pin.triggerError();
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final o = widget.order;
    final amount = Fmt.money(o.amountToCollect);
    final usingMock = ref.read(repositoryProvider).usingMock || DemoMode.isOn;
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Center(child: IconTile(icon: Icons.lock_open_rounded, size: 56)),
              const SizedBox(height: 14),
              Text(
                context.tr('enter_otp'),
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 19, fontWeight: FontWeight.w800, color: context.textColor),
              ),
              const SizedBox(height: 6),
              Text(
                '${context.tr('otp_desc')}\n${o.orderNumber} · ${o.customer.name}',
                textAlign: TextAlign.center,
                style: TextStyle(color: context.mutedColor, fontSize: 13, height: 1.45),
              ),
              const SizedBox(height: 20),
              LayoutBuilder(
                builder: (context, c) {
                  final cell = ((c.maxWidth - 5 * 8) / 6).clamp(36.0, 52.0);
                  return MaterialPinField(
                    length: 6,
                    pinController: _pin,
                    autoFocus: true,
                    keyboardType: TextInputType.number,
                    onChanged: (v) => setState(() {
                      _otp = v;
                      _error = null;
                    }),
                    onCompleted: (v) => setState(() => _otp = v),
                    theme: MaterialPinTheme(
                      shape: MaterialPinShape.outlined,
                      cellSize: Size(cell, cell + 6),
                      spacing: 8,
                      borderRadius: BorderRadius.circular(10),
                      borderColor: context.borderColor,
                      focusedBorderColor: AppColors.primary,
                      filledBorderColor: AppColors.primary,
                      fillColor: context.cardColor,
                      filledFillColor: context.softGreen,
                      cursorColor: AppColors.primary,
                      errorColor: AppColors.danger,
                      textStyle: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: context.textColor),
                    ),
                  );
                },
              ),
              if (_error != null) ...[
                const SizedBox(height: 10),
                Text(_error!, textAlign: TextAlign.center, style: const TextStyle(color: AppColors.danger, fontSize: 12.5)),
              ],
              if (usingMock) ...[
                const SizedBox(height: 10),
                Text(
                  'Demo OTP: ${AppConfig.demoOtp}',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: context.mutedColor, fontSize: 12),
                ),
              ],
              if (_collectsCash) ...[
                const SizedBox(height: 18),
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: AppColors.warning.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: AppColors.warning.withValues(alpha: 0.4)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          const Icon(Icons.payments_rounded, color: AppColors.warning),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              '${context.tr('collect_cash')} $amount',
                              style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: context.textColor),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(context.tr('collect_cash_desc'), style: TextStyle(fontSize: 12.5, color: context.bodyColor)),
                      const SizedBox(height: 6),
                      if (!_partial)
                        InkWell(
                          onTap: () => setState(() => _cashConfirmed = !_cashConfirmed),
                          child: Row(
                            children: [
                              Checkbox(
                                key: const ValueKey('cash-confirm'),
                                value: _cashConfirmed,
                                activeColor: AppColors.primary,
                                onChanged: (v) => setState(() => _cashConfirmed = v ?? false),
                              ),
                              Expanded(
                                child: Text(
                                  '${context.tr('cash_collected_confirm')} $amount',
                                  style: const TextStyle(fontWeight: FontWeight.w600),
                                ),
                              ),
                            ],
                          ),
                        )
                      else ...[
                        const SizedBox(height: 8),
                        TextField(
                          key: const ValueKey('cash-partial'),
                          controller: _cash,
                          autofocus: true,
                          keyboardType: const TextInputType.numberWithOptions(decimal: true),
                          inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'^\d*\.?\d{0,2}'))],
                          onChanged: (_) => setState(() {}),
                          decoration: InputDecoration(
                            labelText: context.tr('cash_received'),
                            prefixText: '${Fmt.currencySymbol} ',
                            errorText: _cash.text.isNotEmpty && _partialAmount == null ? '${context.tr('cash_less_than')} $amount' : null,
                          ),
                        ),
                        if (_partialAmount != null) ...[
                          const SizedBox(height: 6),
                          Text(
                            '${context.tr('short_amount')}: ${Fmt.money(o.amountToCollect - _partialAmount!)}',
                            style: const TextStyle(color: AppColors.danger, fontWeight: FontWeight.w700, fontSize: 12.5),
                          ),
                        ],
                      ],
                      Align(
                        alignment: AlignmentDirectional.centerStart,
                        child: TextButton(
                          onPressed: () => setState(() {
                            _partial = !_partial;
                            _cashConfirmed = false;
                            _cash.clear();
                          }),
                          child: Text(_partial ? context.tr('collected_full') : context.tr('collected_less')),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
              const SizedBox(height: 20),
              LoadingButton(
                label: context.tr('verify_deliver'),
                icon: Icons.verified_rounded,
                loading: _loading,
                onPressed: _canSubmit ? _submit : null,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
