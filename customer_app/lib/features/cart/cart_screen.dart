import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/errors.dart';
import '../../core/razorpay_checkout.dart';
import '../../core/l10n/app_localizations.dart';
import '../../core/theme.dart';
import '../../core/utils.dart';
import '../../models/models.dart';
import '../../providers/providers.dart';
import '../../widgets/common.dart';
import '../../widgets/product_card.dart';
import 'coupons_sheet.dart';
import 'payment_methods_screen.dart';

/// Cart + checkout (screenshots 16 / 17).
class CartScreen extends ConsumerStatefulWidget {
  const CartScreen({super.key});
  @override
  ConsumerState<CartScreen> createState() => _CartScreenState();
}

class _CartScreenState extends ConsumerState<CartScreen> {
  String _deliveryType = 'delivery';
  bool _useWallet = false;
  String _payment = 'cod';
  Address? _address;
  bool _placing = false;
  final _notes = TextEditingController();

  @override
  void dispose() {
    _notes.dispose();
    super.dispose();
  }

  Address? _effectiveAddress(List<Address> list) {
    if (_address != null && list.any((a) => a.id == _address!.id)) {
      return _address;
    }
    return list.where((a) => a.isDefault).firstOrNull ?? list.firstOrNull;
  }

  Future<void> _pickAddress() async {
    final a = await context.push<Address>('/addresses?select=1');
    if (a != null) setState(() => _address = a);
  }

  /// Prices the summary for the selected delivery address (same inputs as placeOrder).
  void _syncPricingAddress(String? id) {
    if (ref.read(checkoutAddressIdProvider) == id) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && ref.read(checkoutAddressIdProvider) != id) {
        ref.read(checkoutAddressIdProvider.notifier).state = id;
      }
    });
  }

  Widget _issuesCard(Cart cart) {
    final lines = [
      if (cart.minOrderRemaining > 0 &&
          !cart.issues.any((i) => i.toLowerCase().contains('minimum order')))
        context.tr('min_order_remaining', {
          'amount': Fmt.money(cart.minOrderRemaining),
          'min': Fmt.money(cart.minOrder),
        }),
      ...cart.issues,
    ];
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFFFF7E6),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(
            Icons.warning_amber_rounded,
            color: Color(0xFFB54708),
            size: 20,
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                for (final l in lines)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 1),
                    child: Text(
                      l,
                      style: const TextStyle(
                        color: Color(0xFFB54708),
                        fontWeight: FontWeight.w600,
                        fontSize: 12.5,
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _pickPayment() async {
    final key = await context.push<String>(
      '/payment-methods?selected=$_payment',
    );
    if (key != null) setState(() => _payment = key);
  }

  Future<void> _placeOrder(_Bill bill, Address? address) async {
    if (!await ensureLoggedIn(context, ref)) return;
    if (!mounted) return;
    if (_deliveryType == 'delivery' && address == null) {
      final addrs = await ref.read(addressesProvider.future);
      if (!mounted) return;
      if (addrs.isEmpty) {
        showSnack(context, context.tr('add_address_first'));
        await context.push('/addresses/form');
      } else {
        await _pickAddress();
      }
      return;
    }
    if (_payment == 'wallet' && bill.walletBalance < bill.payableBeforeWallet) {
      showSnack(context, context.tr('insufficient_wallet'), error: true);
      return;
    }
    setState(() => _placing = true);
    try {
      final promo = ref.read(appliedPromoProvider);
      final r = await ref
          .read(orderRepoProvider)
          .place(
            addressId: _deliveryType == 'delivery' ? address?.id : null,
            deliveryType: _deliveryType,
            paymentMethod: _payment,
            promoCode: promo?.code,
            useWallet: _useWallet || _payment == 'wallet',
            notes: _notes.text.trim().isEmpty ? null : _notes.text.trim(),
          );
      if (r.needsPayment) await _completeGatewayPayment(r.orderId, r.payment!);
      ref.read(appliedPromoProvider.notifier).state = null;
      ref.invalidate(cartProvider);
      ref.invalidate(walletProvider);
      ref.invalidate(ordersProvider);
      ref.invalidate(notificationsProvider);
      if (mounted) context.go('/order-success/${r.orderId}');
    } on AppException catch (e) {
      if (mounted) showSnack(context, e.displayMessage, error: true);
    } finally {
      if (mounted) setState(() => _placing = false);
    }
  }

  /// Online gateways: opens the hosted checkout (`redirect_url` from `placeOrder`) and then calls
  /// `verifyPayment`. Native SDK flows (Razorpay/Stripe sheets using `gateway_order_id` / `client_secret` /
  /// `public_key`) can be plugged in here. The order stays `payment_pending` until verified.
  Future<void> _completeGatewayPayment(
    String orderId,
    Map<String, dynamic> payment,
  ) async {
    // Razorpay: native checkout sheet on Android / iOS, verified automatically (no "I have paid" step).
    if (RazorpayCheckout.supports(payment)) {
      try {
        final result = await RazorpayCheckout.pay(
          payment,
          description: 'Order payment',
        );
        if (result == null) {
          if (mounted) showSnack(context, context.tr('payment_pending_retry'));
          return;
        }
        await ref
            .read(orderRepoProvider)
            .verifyPayment(orderId, 'razorpay', result);
      } on RazorpayCheckoutException catch (e) {
        if (mounted) showSnack(context, e.message, error: true);
      } catch (e) {
        if (mounted) showSnack(context, '$e', error: true);
      }
      return;
    }
    final url = asString(
      payment['redirect_url'] ?? payment['url'] ?? payment['payment_url'],
    );
    if (url.isNotEmpty) {
      await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
    }
    if (!mounted) return;
    final ok = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        title: Text(ctx.tr('complete_payment')),
        content: Text(
          ctx.tr('complete_payment_body', {
            'gateway': Fmt.titleCase(_payment),
            'amount': Fmt.money(asDouble(payment['amount'])),
          }),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text(ctx.tr('pay_later')),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(ctx.tr('i_have_paid')),
          ),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await ref
          .read(orderRepoProvider)
          .verifyPayment(orderId, asString(payment['gateway'], _payment), {
            'reference': payment['reference'],
            'gateway_order_id': payment['gateway_order_id'],
            ...asMap(payment['extra']),
          });
    } catch (e) {
      if (mounted) showSnack(context, '$e', error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cartAsync = ref.watch(cartProvider);
    final session = ref.watch(sessionProvider);
    final promo = ref.watch(appliedPromoProvider);
    final addresses = session.isLoggedIn
        ? (ref.watch(addressesProvider).value ?? const <Address>[])
        : const <Address>[];
    final settings = ref.watch(appSettingsProvider).value;
    final gateways = settings?.paymentGateways.isNotEmpty == true
        ? settings!.paymentGateways
        : defaultGateways;

    // Re-validate the applied coupon whenever the cart total changes.
    ref.listen(cartProvider.select((c) => c.value?.subtotal), (
      prev,
      next,
    ) async {
      final p = ref.read(appliedPromoProvider);
      if (p == null || prev == next || next == null) return;
      try {
        ref.read(appliedPromoProvider.notifier).state = await ref
            .read(cartRepoProvider)
            .applyCoupon(p.code);
      } on AppException catch (e) {
        ref.read(appliedPromoProvider.notifier).state = null;
        if (context.mounted) showSnack(context, e.displayMessage, error: true);
      }
    });

    return Scaffold(
      appBar: AppBar(title: Text(context.tr('checkout'))),
      body: cartAsync.when(
        skipLoadingOnReload: true,
        loading: () => const LoadingView(),
        error: (e, _) =>
            ErrorView(error: e, onRetry: () => ref.invalidate(cartProvider)),
        data: (cart) {
          if (cart.isEmpty) {
            return EmptyView(
              emoji: '🛒',
              image: 'assets/images/empty/empty-cart.webp',
              title: context.tr('cart_empty'),
              message: context.tr('cart_empty_body'),
              actionLabel: context.tr('start_shopping'),
              onAction: () => context.go('/home'),
            );
          }
          final address = _effectiveAddress(addresses);
          _syncPricingAddress(_deliveryType == 'delivery' ? address?.id : null);
          final balance = math.max(
            cart.walletBalance,
            session.user?.walletBalance ?? 0,
          );
          final bill = _Bill(
            cart,
            promo,
            _deliveryType,
            _useWallet || _payment == 'wallet',
            balance,
          );
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
            children: [
              if (cart.isBlocked) ...[
                _issuesCard(cart),
                const SizedBox(height: 12),
              ],
              _itemsCard(cart, session),
              if (cart.freeDeliveryRemaining > 0 &&
                  _deliveryType == 'delivery') ...[
                const SizedBox(height: 12),
                _freeDeliveryBanner(cart),
              ],
              const SizedBox(height: 12),
              _couponCard(cart, promo),
              const SizedBox(height: 12),
              _deliveryTypeCard(),
              const SizedBox(height: 12),
              if (_deliveryType == 'delivery')
                _addressCard(address, session.isLoggedIn)
              else
                _pickupCard(),
              if (session.isLoggedIn) ...[
                const SizedBox(height: 12),
                _walletCard(balance),
              ],
              const SizedBox(height: 12),
              _billCard(bill),
              const SizedBox(height: 12),
              TextField(
                controller: _notes,
                maxLines: 2,
                decoration: InputDecoration(
                  hintText: context.tr('delivery_instructions'),
                  prefixIcon: const Icon(Icons.edit_note_rounded),
                ),
              ),
              const SizedBox(height: 14),
              Text(
                context.tr('cancellation_policy'),
                style: TextStyle(
                  fontSize: 11.5,
                  color: context.mutedText,
                  height: 1.4,
                ),
              ),
            ],
          );
        },
      ),
      bottomNavigationBar: cartAsync.value == null || cartAsync.value!.isEmpty
          ? null
          : _bottomBar(cartAsync.value!, session, promo, addresses, gateways),
    );
  }

  Widget _itemsCard(Cart cart, SessionState session) {
    final notifier = ref.read(cartProvider.notifier);
    return AppCard(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 4),
      child: Column(
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: AppColors.primary50,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(
                  session.isQuick
                      ? Icons.timer_outlined
                      : Icons.local_shipping_outlined,
                  color: AppColors.primary,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      session.isQuick
                          ? context.tr('delivery_in_n_minutes', {
                              'n': session.deliveryMinutes,
                            })
                          : context.tr('delivery'),
                      style: const TextStyle(
                        fontWeight: FontWeight.w800,
                        fontSize: 15,
                      ),
                    ),
                    Text(
                      context.tr('shipment_of_n', {'n': cart.itemCount}),
                      style: TextStyle(fontSize: 12, color: context.mutedText),
                    ),
                  ],
                ),
              ),
              TextButton.icon(
                onPressed: () async {
                  final ok = await showDialog<bool>(
                    context: context,
                    builder: (ctx) => AlertDialog(
                      title: Text(ctx.tr('clear_cart')),
                      content: Text(ctx.tr('clear_cart_confirm')),
                      actions: [
                        TextButton(
                          onPressed: () => Navigator.pop(ctx, false),
                          child: Text(ctx.tr('cancel')),
                        ),
                        TextButton(
                          onPressed: () => Navigator.pop(ctx, true),
                          child: Text(
                            ctx.tr('clear'),
                            style: const TextStyle(color: AppColors.danger),
                          ),
                        ),
                      ],
                    ),
                  );
                  if (ok == true) await notifier.clear();
                },
                icon: const Icon(
                  Icons.delete_outline_rounded,
                  color: AppColors.danger,
                  size: 18,
                ),
                label: Text(
                  context.tr('clear_cart'),
                  style: const TextStyle(color: AppColors.danger),
                ),
              ),
            ],
          ),
          const Divider(height: 20),
          for (final item in cart.items)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  InkWell(
                    onTap: () => context.push(
                      '/product/${item.productSlug.isEmpty ? item.productId : item.productSlug}',
                    ),
                    child: Container(
                      width: 60,
                      height: 60,
                      decoration: BoxDecoration(
                        border: Border.all(color: context.borderColor),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: AppImage(
                        url: item.image,
                        name: item.productName,
                        radius: BorderRadius.circular(9),
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          item.productName,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontWeight: FontWeight.w700,
                            fontSize: 13,
                          ),
                        ),
                        if (item.variantName.isNotEmpty)
                          Text(
                            item.variantName,
                            style: TextStyle(
                              fontSize: 11.5,
                              color: context.mutedText,
                            ),
                          ),
                        const SizedBox(height: 4),
                        PriceRow(
                          price: item.lineTotal,
                          mrp: item.lineMrp,
                          fontSize: 13.5,
                        ),
                      ],
                    ),
                  ),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      InkWell(
                        onTap: () => notifier.setQty(item.variantId, 0),
                        child: Icon(
                          Icons.close_rounded,
                          size: 18,
                          color: context.mutedText,
                        ),
                      ),
                      const SizedBox(height: 10),
                      QtyStepper(
                        qty: item.qty,
                        height: 30,
                        width: 82,
                        onMinus: () => notifier.decrement(item.variantId),
                        canIncrement: item.qty < item.limit,
                        onPlus: () async {
                          try {
                            await notifier.increment(item.variantId);
                          } on AppException catch (e) {
                            if (mounted) {
                              showSnack(context, e.displayMessage, error: true);
                            }
                          }
                        },
                      ),
                    ],
                  ),
                ],
              ),
            ),
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: TextButton.icon(
              onPressed: () => context.go('/home'),
              icon: const Icon(Icons.add_rounded, size: 18),
              label: Text(context.tr('add_more_items')),
            ),
          ),
        ],
      ),
    );
  }

  Widget _freeDeliveryBanner(Cart cart) {
    final total = cart.subtotal + cart.freeDeliveryRemaining;
    return AppCard(
      color: const Color(0xFFFFF8E6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Text('🛵', style: TextStyle(fontSize: 20)),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  context.tr('add_more_free_delivery', {
                    'amount': Fmt.money(cart.freeDeliveryRemaining),
                  }),
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    color: Color(0xFF8A5A14),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          ClipRRect(
            borderRadius: BorderRadius.circular(6),
            child: LinearProgressIndicator(
              value: total <= 0 ? 0 : cart.subtotal / total,
              minHeight: 6,
              backgroundColor: const Color(0xFFFCE7B8),
              color: AppColors.warning,
            ),
          ),
        ],
      ),
    );
  }

  Widget _couponCard(Cart cart, AppliedPromo? promo) {
    if (promo != null) {
      return AppCard(
        color: AppColors.primary50,
        child: Row(
          children: [
            const Icon(Icons.verified_rounded, color: AppColors.primary),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    context.tr('code_applied', {'code': promo.code}),
                    style: const TextStyle(
                      fontWeight: FontWeight.w800,
                      color: AppColors.primaryDark,
                    ),
                  ),
                  Text(
                    promo.isCashback && promo.message.isNotEmpty
                        ? promo.message
                        : context.tr('you_saved', {
                            'amount': Fmt.money(promo.discount),
                          }),
                    style: const TextStyle(
                      fontSize: 12,
                      color: AppColors.primaryDark,
                    ),
                  ),
                ],
              ),
            ),
            TextButton(
              onPressed: () =>
                  ref.read(appliedPromoProvider.notifier).state = null,
              child: Text(
                context.tr('remove'),
                style: const TextStyle(color: AppColors.danger),
              ),
            ),
          ],
        ),
      );
    }
    final coupons =
        ref.watch(couponsProvider(cart.subtotal)).value ?? const <Coupon>[];
    final best =
        coupons.where((c) => c.isApplicable).firstOrNull ??
        (coupons.where((c) => c.remaining > 0).toList()
              ..sort((a, b) => a.remaining.compareTo(b.remaining)))
            .firstOrNull;
    return AppCard(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 4),
      child: Column(
        children: [
          if (best != null)
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: const BoxDecoration(
                    color: AppColors.primary50,
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(
                    Icons.percent_rounded,
                    color: AppColors.primary,
                    size: 18,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        best.isApplicable
                            ? context.tr('save_with', {'code': best.code})
                            : context.tr('unlock_code', {'code': best.code}),
                        style: const TextStyle(fontWeight: FontWeight.w800),
                      ),
                      Text(
                        best.isApplicable
                            ? best.title
                            : context.tr('add_more_to_unlock', {
                                'amount': Fmt.money(best.remaining),
                              }),
                        style: TextStyle(
                          fontSize: 12,
                          color: context.mutedText,
                        ),
                      ),
                    ],
                  ),
                ),
                SizedBox(
                  height: 34,
                  child: ElevatedButton(
                    onPressed: best.isApplicable
                        ? () => applyCoupon(context, ref, best.code)
                        : null,
                    style: ElevatedButton.styleFrom(
                      minimumSize: const Size(70, 34),
                      padding: const EdgeInsets.symmetric(horizontal: 14),
                    ),
                    child: Text(
                      context.tr('apply').toUpperCase(),
                      style: const TextStyle(fontSize: 12),
                    ),
                  ),
                ),
              ],
            ),
          InkWell(
            onTap: () => showCouponsSheet(context, cart.subtotal),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 10),
              child: Row(
                children: [
                  Text(
                    context.tr('view_all_coupons'),
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                  const Spacer(),
                  const Icon(Icons.chevron_right_rounded),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _deliveryTypeCard() {
    Widget seg(String value, IconData icon, String label) {
      final active = _deliveryType == value;
      return Expanded(
        child: InkWell(
          borderRadius: BorderRadius.circular(10),
          onTap: () => setState(() => _deliveryType = value),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 200),
            padding: const EdgeInsets.symmetric(vertical: 12),
            decoration: BoxDecoration(
              color: active
                  ? AppColors.primary50.withValues(
                      alpha: context.isDark ? 0.15 : 1,
                    )
                  : context.cardColor,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(
                color: active ? AppColors.primary : context.borderColor,
              ),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  icon,
                  size: 18,
                  color: active ? AppColors.primary : context.mutedText,
                ),
                const SizedBox(width: 6),
                Flexible(
                  child: Text(
                    label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontWeight: FontWeight.w700,
                      color: active ? AppColors.primary : null,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    }

    return Row(
      children: [
        seg(
          'delivery',
          Icons.delivery_dining_outlined,
          context.tr('home_delivery'),
        ),
        const SizedBox(width: 10),
        seg(
          'self_pickup',
          Icons.storefront_outlined,
          context.tr('self_pickup'),
        ),
      ],
    );
  }

  Widget _addressCard(Address? a, bool loggedIn) {
    return AppCard(
      onTap: loggedIn ? _pickAddress : () => ensureLoggedIn(context, ref),
      child: Row(
        children: [
          const Icon(Icons.location_on_outlined, color: AppColors.primary),
          const SizedBox(width: 10),
          Expanded(
            child: a == null
                ? Text(
                    loggedIn
                        ? context.tr('add_delivery_address')
                        : context.tr('login_to_select_address'),
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  )
                : Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Text(
                            context.tr('delivering_to_label', {
                              'label': a.label,
                            }),
                            style: const TextStyle(fontWeight: FontWeight.w800),
                          ),
                          if (a.isDefault) ...[
                            const SizedBox(width: 6),
                            Pill(label: context.tr('default'), fontSize: 10),
                          ],
                        ],
                      ),
                      const SizedBox(height: 2),
                      Text(
                        a.fullAddress,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 12,
                          color: context.mutedText,
                        ),
                      ),
                    ],
                  ),
          ),
          Text(
            a == null ? context.tr('add') : context.tr('change'),
            style: const TextStyle(
              color: AppColors.primary,
              fontWeight: FontWeight.w800,
            ),
          ),
        ],
      ),
    );
  }

  Widget _pickupCard() {
    final s = ref.watch(sessionProvider);
    return AppCard(
      child: Row(
        children: [
          const Icon(Icons.storefront_outlined, color: AppColors.primary),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  context.tr('pickup_from', {
                    'store':
                        '${s.zoneName.isEmpty ? 'QwikMart' : s.zoneName} Store',
                  }),
                  style: const TextStyle(fontWeight: FontWeight.w800),
                ),
                Text(
                  context.tr('pickup_note'),
                  style: TextStyle(fontSize: 12, color: context.mutedText),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _walletCard(double balance) {
    return AppCard(
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: AppColors.primary50,
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Icon(
              Icons.account_balance_wallet_outlined,
              color: AppColors.primary,
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  context.tr('use_wallet_balance'),
                  style: const TextStyle(fontWeight: FontWeight.w800),
                ),
                Text(
                  Fmt.money(balance),
                  style: TextStyle(fontSize: 12.5, color: context.mutedText),
                ),
              ],
            ),
          ),
          Switch(
            value: _useWallet || _payment == 'wallet',
            onChanged: balance <= 0 || _payment == 'wallet'
                ? null
                : (v) => setState(() => _useWallet = v),
          ),
        ],
      ),
    );
  }

  Widget _billCard(_Bill b) {
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            context.tr('bill_details'),
            style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
          ),
          const SizedBox(height: 6),
          KeyValueRow(
            label: context.tr('items_total_mrp'),
            value: Fmt.money(b.cart.mrpTotal),
          ),
          if (b.cart.savings > 0)
            KeyValueRow(
              label: context.tr('product_discount'),
              value: '-${Fmt.money(b.cart.savings)}',
              valueColor: AppColors.primary,
            ),
          KeyValueRow(
            label: context.tr('delivery_charge'),
            value: b.delivery == 0 ? context.tr('free') : Fmt.money(b.delivery),
            valueColor: b.delivery == 0 ? AppColors.primary : null,
          ),
          if (b.surge > 0)
            KeyValueRow(
              label: context.tr('surge_charge'),
              value: Fmt.money(b.surge),
            ),
          if (b.extra > 0)
            KeyValueRow(label: 'Other charges', value: Fmt.money(b.extra)),
          if (b.cart.tax > 0)
            KeyValueRow(
              label: b.cart.taxInclusive
                  ? '${context.tr('taxes')} (incl.)'
                  : context.tr('taxes'),
              value: Fmt.money(b.cart.tax),
            ),
          if (b.promo > 0)
            KeyValueRow(
              label: context.tr('coupon_discount'),
              value: '-${Fmt.money(b.promo)}',
              valueColor: AppColors.primary,
            ),
          if (b.cashback > 0)
            KeyValueRow(
              label: context.tr('cashback_after_delivery'),
              value: '+${Fmt.money(b.cashback)}',
              valueColor: AppColors.primary,
            ),
          if (b.walletUsed > 0)
            KeyValueRow(
              label: context.tr('wallet_used'),
              value: '-${Fmt.money(b.walletUsed)}',
              valueColor: AppColors.primary,
            ),
          const Divider(height: 18),
          KeyValueRow(
            label: context.tr('to_pay'),
            value: Fmt.money(b.toPay),
            bold: true,
          ),
          if (b.totalSavings > 0)
            Container(
              margin: const EdgeInsets.only(top: 8),
              width: double.infinity,
              padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 10),
              decoration: BoxDecoration(
                color: AppColors.primary50,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                '🎉 ${context.tr('you_saved_order', {'amount': Fmt.money(b.totalSavings)})}',
                style: const TextStyle(
                  color: AppColors.primaryDark,
                  fontWeight: FontWeight.w700,
                  fontSize: 12.5,
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _bottomBar(
    Cart cart,
    SessionState session,
    AppliedPromo? promo,
    List<Address> addresses,
    List<PaymentGateway> gateways,
  ) {
    final balance = math.max(
      cart.walletBalance,
      session.user?.walletBalance ?? 0,
    );
    final bill = _Bill(
      cart,
      promo,
      _deliveryType,
      _useWallet || _payment == 'wallet',
      balance,
    );
    final address = _effectiveAddress(addresses);
    return Container(
      decoration: BoxDecoration(
        color: context.cardColor,
        border: Border(top: BorderSide(color: context.borderColor)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
          child: Row(
            children: [
              Expanded(
                child: InkWell(
                  onTap: _pickPayment,
                  child: Row(
                    children: [
                      GatewayLogo(keyName: _payment, size: 34),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Flexible(
                                  child: Text(
                                    context.tr('pay_using'),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(
                                      fontSize: 10.5,
                                      color: context.mutedText,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                ),
                                Icon(
                                  Icons.keyboard_arrow_up_rounded,
                                  size: 16,
                                  color: context.mutedText,
                                ),
                              ],
                            ),
                            Text(
                              gatewayName(context, _payment, gateways),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontWeight: FontWeight.w800,
                                fontSize: 13,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 10),
              SizedBox(
                height: 50,
                child: ElevatedButton(
                  onPressed: _placing || cart.isBlocked
                      ? null
                      : () => _placeOrder(bill, address),
                  style: ElevatedButton.styleFrom(
                    minimumSize: const Size(170, 50),
                  ),
                  child: _placing
                      ? const SizedBox(
                          width: 22,
                          height: 22,
                          child: CircularProgressIndicator(
                            strokeWidth: 2.4,
                            color: Colors.white,
                          ),
                        )
                      : Column(
                          mainAxisSize: MainAxisSize.min,
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              Fmt.money(bill.toPay),
                              style: const TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                            Text(
                              session.isLoggedIn
                                  ? '${context.tr('place_order')} ›'
                                  : '${context.tr('login_to_continue')} ›',
                              style: const TextStyle(
                                fontSize: 11.5,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Client-side bill computation (server is the source of truth at order placement).
class _Bill {
  final Cart cart;
  final double delivery;
  final double surge;

  /// Zone surcharges (delivery orders only).
  final double extra;
  final double promo;
  final double walletBalance;
  final double payableBeforeWallet;
  final double walletUsed;
  final double toPay;

  factory _Bill(
    Cart cart,
    AppliedPromo? p,
    String deliveryType,
    bool useWallet,
    double balance,
  ) {
    final pickup = deliveryType == 'self_pickup';
    final delivery = pickup || (p?.freeDelivery ?? false)
        ? 0.0
        : cart.deliveryCharge;
    final surge = pickup ? 0.0 : cart.surgeCharge;
    final extra = pickup ? 0.0 : cart.additionalCharges;
    // Cashback coupons are credited after delivery; they do not reduce what is paid now.
    final promo = p?.instantDiscount ?? 0;
    // Prices are tax-inclusive by default, so tax is only added when the backend says otherwise.
    final before = math.max(
      0.0,
      cart.subtotal + delivery + surge + extra + cart.extraTax - promo,
    );
    final wallet = useWallet ? math.min(balance, before) : 0.0;
    return _Bill._(
      cart,
      delivery,
      surge,
      extra,
      promo,
      balance,
      before,
      wallet,
      before - wallet,
      p != null && p.isCashback ? p.discount : 0,
    );
  }

  const _Bill._(
    this.cart,
    this.delivery,
    this.surge,
    this.extra,
    this.promo,
    this.walletBalance,
    this.payableBeforeWallet,
    this.walletUsed,
    this.toPay,
    this.cashback,
  );

  final double cashback;

  double get totalSavings =>
      cart.savings +
      promo +
      (cart.deliveryCharge > 0 && delivery == 0 ? cart.deliveryCharge : 0);
}
