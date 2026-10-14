import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../features/auth/forgot_password_screen.dart';
import '../features/auth/login_screen.dart';
import '../features/auth/pending_approval_screen.dart';
import '../features/auth/register_screen.dart';
import '../features/cash/cash_collection_screen.dart';
import '../features/chat/chat_screen.dart';
import '../features/earnings/earnings_screen.dart';
import '../features/home/home_screen.dart';
import '../features/notifications/notifications_screen.dart';
import '../features/orders/delivered_screen.dart';
import '../features/orders/invoice_screen.dart';
import '../features/orders/order_detail_screen.dart';
import '../features/orders/orders_screen.dart';
import '../features/profile/profile_screen.dart';
import '../features/returns/returns_screen.dart';
import '../features/shell/main_shell.dart';
import '../features/splash/splash_screen.dart';
import '../features/wallet/wallet_screen.dart';
import '../providers/auth_provider.dart';

final rootNavigatorKey = GlobalKey<NavigatorState>();

/// Bridges Riverpod auth state into GoRouter's refreshListenable.
class _RouterRefresh extends ChangeNotifier {
  _RouterRefresh(Ref ref) {
    ref.listen<AuthState>(authProvider, (_, _) => notifyListeners());
  }
}

const _authRoutes = {'/login', '/forgot-password', '/register'};

final routerProvider = Provider<GoRouter>((ref) {
  final refresh = _RouterRefresh(ref);
  ref.onDispose(refresh.dispose);

  return GoRouter(
    navigatorKey: rootNavigatorKey,
    initialLocation: '/splash',
    refreshListenable: refresh,
    redirect: (context, state) {
      final status = ref.read(authProvider).status;
      final loc = state.matchedLocation;
      switch (status) {
        case AuthStatus.unknown:
          // Keep the requested page (deep link / notification tap on a cold start) until the session
          // is restored.
          if (loc == '/splash') return null;
          return state.uri.path == '/' ? '/splash' : '/splash?from=${Uri.encodeComponent(state.uri.toString())}';
        case AuthStatus.unauthenticated:
          return _authRoutes.contains(loc) ? null : '/login';
        case AuthStatus.pending:
          return loc == '/pending' ? null : '/pending';
        case AuthStatus.authenticated:
          if (loc == '/splash') {
            final from = state.uri.queryParameters['from'];
            final ok = from != null && from.startsWith('/') && !from.startsWith('/splash') && !_authRoutes.contains(from) && from != '/pending';
            return ok ? from : '/home';
          }
          if (loc == '/pending' || _authRoutes.contains(loc)) return '/home';
          return null;
      }
    },
    routes: [
      GoRoute(path: '/splash', builder: (_, _) => const SplashScreen()),
      GoRoute(path: '/login', builder: (_, _) => const LoginScreen()),
      GoRoute(
        path: '/forgot-password',
        builder: (_, s) => ForgotPasswordScreen(initialEmail: s.extra is String ? s.extra as String : null),
      ),
      GoRoute(path: '/register', builder: (_, _) => const RegisterScreen()),
      GoRoute(path: '/pending', builder: (_, _) => const PendingApprovalScreen()),
      StatefulShellRoute.indexedStack(
        builder: (context, state, shell) => MainShell(shell: shell),
        branches: [
          StatefulShellBranch(routes: [GoRoute(path: '/home', builder: (_, _) => const HomeScreen())]),
          StatefulShellBranch(routes: [GoRoute(path: '/orders', builder: (_, _) => const OrdersScreen())]),
          StatefulShellBranch(routes: [GoRoute(path: '/wallet', builder: (_, _) => const WalletScreen())]),
          StatefulShellBranch(routes: [GoRoute(path: '/profile', builder: (_, _) => const ProfileScreen())]),
        ],
      ),
      GoRoute(
        path: '/order/:id',
        builder: (_, s) => OrderDetailScreen(orderId: s.pathParameters['id']!),
        routes: [
          GoRoute(
            path: 'delivered',
            builder: (_, s) => DeliveredScreen(
              orderId: s.pathParameters['id']!,
              info: s.extra is DeliveredInfo ? s.extra as DeliveredInfo : null,
            ),
          ),
          GoRoute(path: 'invoice', builder: (_, s) => InvoiceScreen(orderId: s.pathParameters['id']!)),
          GoRoute(
            path: 'chat',
            builder: (_, s) => ChatScreen(
              orderId: s.pathParameters['id']!,
              title: s.uri.queryParameters['name'],
            ),
          ),
        ],
      ),
      GoRoute(path: '/returns', builder: (_, _) => const ReturnsScreen()),
      GoRoute(path: '/cash', builder: (_, _) => const CashCollectionScreen()),
      GoRoute(path: '/earnings', builder: (_, _) => const EarningsScreen()),
      GoRoute(path: '/support', builder: (_, _) => const ChatScreen()),
      GoRoute(path: '/notifications', builder: (_, _) => const NotificationsScreen()),
    ],
  );
});
