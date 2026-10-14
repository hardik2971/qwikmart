import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/l10n/app_localizations.dart';
import '../../core/theme.dart';
import '../../models/models.dart';
import '../../providers/providers.dart';
import '../../widgets/common.dart';

const defaultGateways = [
  PaymentGateway(key: 'cod', name: 'Cash on Delivery'),
  PaymentGateway(key: 'wallet', name: 'QwikMart Wallet'),
  PaymentGateway(key: 'razorpay', name: 'Razorpay'),
  PaymentGateway(key: 'stripe', name: 'Stripe'),
];

String gatewayName(BuildContext context, String key, List<PaymentGateway> gateways) {
  final g = gateways.where((g) => g.key == key).firstOrNull;
  if (g != null) return g.name;
  if (key == 'cod') return context.tr('cash_on_delivery');
  if (key == 'wallet') return context.tr('wallet');
  return key[0].toUpperCase() + key.substring(1);
}

/// Small brand-like logo tile for a payment gateway.
class GatewayLogo extends StatelessWidget {
  final String keyName;
  final double size;
  const GatewayLogo({super.key, required this.keyName, this.size = 40});

  static const _styles = <String, (Color, String)>{
    'cod': (Color(0xFF0E9623), '₹'),
    'wallet': (Color(0xFF0B7A1C), 'W'),
    'phonepe': (Color(0xFF5F259F), 'Pe'),
    'midtrans': (Color(0xFF0B3B8C), 'M'),
    'paystack': (Color(0xFF00C3F7), 'ps'),
    'stripe': (Color(0xFF635BFF), 'stripe'),
    'paypal': (Color(0xFF003087), 'P'),
    'razorpay': (Color(0xFF0C2451), 'R'),
    'cashfree': (Color(0xFF6933D3), 'cf'),
    'paytabs': (Color(0xFF1E88E5), 'PT'),
  };

  @override
  Widget build(BuildContext context) {
    final s = _styles[keyName] ?? (AppColors.muted, keyName.isEmpty ? '?' : keyName[0].toUpperCase());
    final icon = keyName == 'cod'
        ? Icons.payments_outlined
        : keyName == 'wallet'
            ? Icons.account_balance_wallet_outlined
            : null;
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(color: s.$1.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(10)),
      alignment: Alignment.center,
      child: icon != null
          ? Icon(icon, color: s.$1, size: size * 0.55)
          : Text(s.$2,
              style: TextStyle(color: s.$1, fontWeight: FontWeight.w900, fontSize: s.$2.length > 3 ? size * 0.24 : size * 0.38)),
    );
  }
}

/// Payment method list (screenshot 17). Pops the selected gateway key.
class PaymentMethodsScreen extends ConsumerStatefulWidget {
  final String selected;
  const PaymentMethodsScreen({super.key, this.selected = 'cod'});
  @override
  ConsumerState<PaymentMethodsScreen> createState() => _PaymentMethodsScreenState();
}

class _PaymentMethodsScreenState extends ConsumerState<PaymentMethodsScreen> {
  late String _selected = widget.selected;

  @override
  Widget build(BuildContext context) {
    final settings = ref.watch(appSettingsProvider);
    final gateways = settings.value?.paymentGateways.isNotEmpty == true ? settings.value!.paymentGateways : defaultGateways;
    return Scaffold(
      appBar: AppBar(title: Text(context.tr('payment_method'))),
      body: settings.isLoading
          ? const LoadingView()
          : ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: gateways.length,
              separatorBuilder: (_, _) => const SizedBox(height: 10),
              itemBuilder: (_, i) {
                final g = gateways[i];
                final sel = g.key == _selected;
                return InkWell(
                  borderRadius: BorderRadius.circular(12),
                  onTap: () => setState(() => _selected = g.key),
                  child: Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: context.cardColor,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: sel ? AppColors.primary : context.borderColor, width: sel ? 1.6 : 1),
                    ),
                    child: Row(children: [
                      GatewayLogo(keyName: g.key),
                      const SizedBox(width: 12),
                      Expanded(child: Text(g.name, style: const TextStyle(fontWeight: FontWeight.w700))),
                      Icon(sel ? Icons.radio_button_checked_rounded : Icons.radio_button_off_rounded,
                          color: sel ? AppColors.primary : context.mutedText),
                    ]),
                  ),
                );
              },
            ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
          child: AppButton(label: context.tr('continue'), onPressed: () => context.pop(_selected)),
        ),
      ),
    );
  }
}
