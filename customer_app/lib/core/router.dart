import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../features/addresses/address_form_screen.dart';
import '../features/addresses/addresses_screen.dart';
import '../features/auth/login_screen.dart';
import '../features/cart/cart_screen.dart';
import '../features/cart/order_success_screen.dart';
import '../features/cart/payment_methods_screen.dart';
import '../features/categories/categories_screen.dart';
import '../features/categories/category_products_screen.dart';
import '../features/content/blog_screens.dart';
import '../features/content/faq_screen.dart';
import '../features/content/cms_page_screen.dart';
import '../features/favourites/favourites_screen.dart';
import '../features/home/home_screen.dart';
import '../features/location/location_screen.dart';
import '../features/location/map_picker_screen.dart';
import '../features/notifications/notifications_screen.dart';
import '../features/onboarding/onboarding_screen.dart';
import '../features/orders/order_detail_screen.dart';
import '../features/orders/orders_screen.dart';
import '../features/orders/tracking_screen.dart';
import '../features/orders/write_review_screen.dart';
import '../features/product/product_detail_screen.dart';
import '../features/profile/profile_screen.dart';
import '../features/search/search_screen.dart';
import '../features/shell/main_shell.dart';
import '../features/splash/splash_screen.dart';
import '../features/support/chat_screen.dart';
import '../features/wallet/refer_earn_screen.dart';
import '../features/wallet/wallet_screen.dart';
import '../models/models.dart';
import '../providers/providers.dart';

final rootNavigatorKey = GlobalKey<NavigatorState>();

/// Routes that need an authenticated user.
const _protected = ['/orders', '/wallet', '/refer', '/support', '/notifications', '/addresses', '/review'];

final routerProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    navigatorKey: rootNavigatorKey,
    initialLocation: '/',
    redirect: (context, state) {
      final loc = state.matchedLocation;
      final loggedIn = ref.read(sessionProvider).isLoggedIn;
      if (!loggedIn && _protected.any((p) => loc == p || loc.startsWith('$p/'))) {
        return '/login?from=${Uri.encodeComponent(state.uri.toString())}';
      }
      return null;
    },
    routes: [
      GoRoute(path: '/', builder: (_, _) => const SplashScreen()),
      GoRoute(path: '/onboarding', builder: (_, _) => const OnboardingScreen()),
      GoRoute(path: '/location', builder: (_, s) => LocationScreen(fromApp: s.uri.queryParameters['from'] == 'app')),
      GoRoute(
        path: '/location/map',
        builder: (_, s) => MapPickerScreen(initial: s.extra is MapPickResult ? s.extra as MapPickResult : null),
      ),
      GoRoute(path: '/login', builder: (_, s) => LoginScreen(from: s.uri.queryParameters['from'])),
      StatefulShellRoute.indexedStack(
        builder: (_, _, shell) => MainShell(shell: shell),
        branches: [
          StatefulShellBranch(routes: [GoRoute(path: '/home', builder: (_, _) => const HomeScreen())]),
          StatefulShellBranch(routes: [GoRoute(path: '/categories', builder: (_, _) => const CategoriesScreen())]),
          StatefulShellBranch(routes: [GoRoute(path: '/favourites', builder: (_, _) => const FavouritesScreen())]),
          StatefulShellBranch(routes: [GoRoute(path: '/profile', builder: (_, _) => const ProfileScreen())]),
        ],
      ),
      GoRoute(
        path: '/category/:id',
        builder: (_, s) => CategoryProductsScreen(
          categoryId: s.pathParameters['id'] ?? '',
          title: s.uri.queryParameters['name'] ?? '',
          selectedSubId: s.uri.queryParameters['sub'],
        ),
      ),
      GoRoute(
        path: '/search',
        builder: (_, s) => SearchScreen(
          initialQuery: s.uri.queryParameters['q'] ?? '',
          initialSort: s.uri.queryParameters['sort'] ?? '',
        ),
      ),
      GoRoute(path: '/product/:slug', builder: (_, s) => ProductDetailScreen(slug: s.pathParameters['slug']!)),
      GoRoute(path: '/cart', builder: (_, _) => const CartScreen()),
      GoRoute(
        path: '/payment-methods',
        builder: (_, s) => PaymentMethodsScreen(selected: s.uri.queryParameters['selected'] ?? 'cod'),
      ),
      GoRoute(
        path: '/order-success/:id',
        builder: (_, s) => OrderSuccessScreen(orderId: s.pathParameters['id'] ?? ''),
      ),
      GoRoute(path: '/orders', builder: (_, _) => const OrdersScreen()),
      GoRoute(
        path: '/orders/:id',
        builder: (_, s) => OrderDetailScreen(orderId: s.pathParameters['id'] ?? ''),
      ),
      GoRoute(
        path: '/orders/:id/track',
        builder: (_, s) => TrackingScreen(orderId: s.pathParameters['id'] ?? ''),
      ),
      GoRoute(
        path: '/review',
        builder: (_, s) => WriteReviewScreen(item: s.extra is OrderItem ? s.extra as OrderItem : null),
      ),
      GoRoute(path: '/wallet', builder: (_, _) => const WalletScreen()),
      GoRoute(path: '/refer', builder: (_, _) => const ReferEarnScreen()),
      GoRoute(
        path: '/support',
        builder: (_, s) => ChatScreen(orderId: s.uri.queryParameters['order_id']),
      ),
      GoRoute(path: '/notifications', builder: (_, _) => const NotificationsScreen()),
      GoRoute(
        path: '/addresses',
        builder: (_, s) => AddressesScreen(selectMode: s.uri.queryParameters['select'] == '1'),
      ),
      GoRoute(
        path: '/addresses/form',
        builder: (_, s) => AddressFormScreen(address: s.extra is Address ? s.extra as Address : null),
      ),
      GoRoute(path: '/blog', builder: (_, _) => const BlogListScreen()),
      GoRoute(path: '/blog/:slug', builder: (_, s) => BlogDetailScreen(slug: s.pathParameters['slug']!)),
      GoRoute(path: '/faq', builder: (_, _) => const FaqScreen()),
      GoRoute(path: '/page/:slug', builder: (_, s) => CmsPageScreen(slug: s.pathParameters['slug']!)),
    ],
  );
});
