import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/config.dart';
import '../models/models.dart';
import 'auth_provider.dart';
import 'core_providers.dart';

/// Realtime data (Firestore snapshots / mock change streams). Every provider is keyed on the
/// signed-in rider so the listeners restart after a new sign-in and stop on logout.
String? _session(Ref ref) => ref.watch(authProvider.select((s) => s.status == AuthStatus.authenticated ? s.profile?.id : null));

Stream<T> _whenSignedIn<T>(Ref ref, Stream<T> Function() open) {
  if (_session(ref) == null) return const Stream.empty();
  return open();
}

final dashboardProvider = StreamProvider.autoDispose<Dashboard>(
  (ref) => _whenSignedIn(ref, () => ref.watch(repositoryProvider).watchDashboard()),
);

/// `type` = available | active | history
final ordersProvider = StreamProvider.autoDispose.family<List<DeliveryOrder>, String>(
  (ref, type) => _whenSignedIn(ref, () => ref.watch(repositoryProvider).watchOrders(type)),
);

final orderDetailProvider = StreamProvider.autoDispose.family<DeliveryOrder, String>(
  (ref, id) => _whenSignedIn(ref, () => ref.watch(repositoryProvider).watchOrder(id)),
);

final returnsProvider = StreamProvider.autoDispose<List<ReturnPickup>>(
  (ref) => _whenSignedIn(ref, () => ref.watch(repositoryProvider).watchReturns()),
);

final earningsProvider = StreamProvider.autoDispose<EarningsSummary>(
  (ref) => _whenSignedIn(ref, () => ref.watch(repositoryProvider).watchEarnings()),
);

final cashProvider = StreamProvider.autoDispose<CashSummary>(
  (ref) => _whenSignedIn(ref, () => ref.watch(repositoryProvider).watchCashCollections()),
);

final walletProvider = StreamProvider.autoDispose<WalletSummary>(
  (ref) => _whenSignedIn(ref, () => ref.watch(repositoryProvider).watchWallet()),
);

final notificationsProvider = StreamProvider.autoDispose<List<AppNotification>>(
  (ref) => _whenSignedIn(ref, () => ref.watch(repositoryProvider).watchNotifications()),
);

final chatMessagesProvider = StreamProvider.autoDispose.family<List<ChatMessage>, String>(
  (ref, chatId) => ref.watch(repositoryProvider).watchMessages(chatId),
);

final countriesProvider = FutureProvider<List<Country>>((ref) => ref.watch(repositoryProvider).getCountries());

final zonesProvider = FutureProvider.family<List<Zone>, String>((ref, countryId) => ref.watch(repositoryProvider).getZones(countryId));

/// Realtime streams update themselves; this only restarts them (pull-to-refresh, after a push).
void refreshOrderData(void Function(ProviderOrFamily p) invalidate) {
  invalidate(dashboardProvider);
  invalidate(ordersProvider);
  invalidate(orderDetailProvider);
  invalidate(cashProvider);
  invalidate(earningsProvider);
  invalidate(notificationsProvider);
}

/// Minimum withdrawal amount (`settings/public.wallet.min_withdraw`).
final minWithdrawProvider = FutureProvider.autoDispose<double>((ref) => ref.watch(repositoryProvider).minWithdraw());

/// Demo credentials are offered on the login screen only in the offline demo or when the backend
/// runs in demo mode (`settings/public.demo_mode`).
final demoModeProvider = FutureProvider.autoDispose<bool>((ref) async {
  if (DemoMode.isOn) return true;
  return ref.watch(repositoryProvider).demoModeEnabled();
});
