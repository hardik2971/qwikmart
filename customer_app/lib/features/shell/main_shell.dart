import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/l10n/app_localizations.dart';
import '../../core/theme.dart';
import '../../widgets/cart_bar.dart';

/// Bottom navigation shell (Home, Categories, Favourites, Profile) + floating cart bar.
class MainShell extends ConsumerWidget {
  final StatefulNavigationShell shell;
  const MainShell({super.key, required this.shell});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final items = [
      (Icons.home_outlined, Icons.home_rounded, context.tr('home')),
      (Icons.grid_view_outlined, Icons.grid_view_rounded, context.tr('categories')),
      (Icons.favorite_border_rounded, Icons.favorite_rounded, context.tr('favourites')),
      (Icons.person_outline_rounded, Icons.person_rounded, context.tr('profile')),
    ];
    return PopScope(
      canPop: shell.currentIndex == 0,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) shell.goBranch(0);
      },
      child: Scaffold(
        body: shell,
        bottomNavigationBar: Column(mainAxisSize: MainAxisSize.min, children: [
          if (shell.currentIndex != 3) const FloatingCartBar(),
          Container(
            decoration: BoxDecoration(
              color: context.cardColor,
              border: Border(top: BorderSide(color: context.borderColor)),
            ),
            child: SafeArea(
              top: false,
              child: SizedBox(
                height: 64,
                child: Row(children: [
                  for (var i = 0; i < items.length; i++)
                    Expanded(
                      child: InkWell(
                        onTap: () => shell.goBranch(i, initialLocation: i == shell.currentIndex),
                        child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                          AnimatedContainer(
                            duration: const Duration(milliseconds: 200),
                            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 2),
                            decoration: BoxDecoration(
                              color: i == shell.currentIndex ? AppColors.primary50 : Colors.transparent,
                              borderRadius: BorderRadius.circular(999),
                            ),
                            child: Icon(
                              i == shell.currentIndex ? items[i].$2 : items[i].$1,
                              color: i == shell.currentIndex ? AppColors.primary : context.mutedText,
                              size: 24,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            items[i].$3,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontSize: 11.5,
                              fontWeight: i == shell.currentIndex ? FontWeight.w800 : FontWeight.w500,
                              color: i == shell.currentIndex ? AppColors.primary : context.mutedText,
                            ),
                          ),
                        ]),
                      ),
                    ),
                ]),
              ),
            ),
          ),
        ]),
      ),
    );
  }
}
