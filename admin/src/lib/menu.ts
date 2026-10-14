// Sidebar menus — ported from backend/app/View/Menu.php (labels, icons, order, sections identical).
// `href` is relative to the panel base (/admin, /store, /delivery). `active` = extra path prefixes that mark the item active.
import {
  LayoutGrid, ShoppingCart, PackageOpen, RotateCcw, MessagesSquare, LayoutTemplate, Package, Tag, Boxes, Globe, Map, Store, Bike, Users,
  Ticket, Bell, Mail, Newspaper, CircleHelp, ChartColumn, UserCog, ShieldCheck, Settings, Languages, FileText, ShoppingBag, Banknote,
  TrendingUp, Wallet, UserRound, type LucideIcon,
} from 'lucide-react';
import type { Panel } from './auth';

export interface MenuChild { label: string; href: string; active?: string[]; perm?: string; exact?: boolean }
export interface MenuItem { label: string; icon: LucideIcon; href?: string; active?: string[]; perm?: string; children?: MenuChild[] }
export type Menu = { section: string; items: MenuItem[] }[];

const reportChildren = (store = false): MenuChild[] => [
  { label: 'Sales Report', href: '/reports/sales' },
  { label: 'Product Sales', href: '/reports/products' },
  ...(store ? [] : [{ label: 'Store Report', href: '/reports/stores' }]),
  { label: 'Delivery Boy Report', href: '/reports/delivery-boys' },
  { label: 'Tax Report', href: '/reports/tax' },
  { label: 'Quick vs eCommerce', href: '/reports/modes' },
];

const MAIN = (store: boolean): MenuItem[] => [
  { label: 'Dashboard', icon: LayoutGrid, href: '/dashboard', perm: 'dashboard.view' },
  { label: 'Orders', icon: ShoppingCart, href: '/orders', perm: 'order.list' },
  { label: 'Self Pickup', icon: PackageOpen, href: '/self-pickup', perm: 'order.list' },
  { label: 'Return Requests', icon: RotateCcw, href: '/returns', perm: 'return.list' },
  { label: 'Chat', icon: MessagesSquare, href: '/chat', perm: 'chat.list' },
  {
    label: 'Home Builder', icon: LayoutTemplate, perm: 'home_builder.list', active: ['/home-builder', '/banners'], children: [
      { label: 'Quick Layouts', href: '/home-builder/quick' },
      { label: 'eCommerce Layouts', href: '/home-builder/ecommerce' },
      ...(store ? [] : [{ label: 'Banners', href: '/banners', perm: 'banner.list' }]),
    ],
  },
];

export function adminMenu(): Menu {
  return [
    { section: 'MAIN', items: MAIN(false) },
    {
      section: 'CATALOG', items: [
        {
          label: 'Categories', icon: LayoutGrid, perm: 'category.list', active: ['/categories'], children: [
            { label: 'Add Category', href: '/categories/new', perm: 'category.create', exact: true },
            { label: 'Manage Categories', href: '/categories', exact: true, active: ['/categories/edit'] },
            { label: 'Category Order', href: '/categories/order', exact: true },
          ],
        },
        {
          label: 'Products', icon: Package, perm: 'product.list', active: ['/products', '/attributes', '/taxes', '/media', '/reviews'], children: [
            { label: 'Add Product', href: '/products/new', perm: 'product.create', exact: true },
            { label: 'Manage Products', href: '/products', exact: true, active: ['/products/edit', '/products/view'] },
            { label: 'Product Ratings', href: '/reviews' },
            { label: 'Approve Requests', href: '/products/approvals', perm: 'product.approve', exact: true },
            { label: 'Attributes', href: '/attributes', perm: 'attribute.list' },
            { label: 'Taxes', href: '/taxes', perm: 'tax.list' },
            { label: 'Media', href: '/media' },
            { label: 'Bulk Upload', href: '/products/bulk-upload', perm: 'product.create', exact: true },
            { label: 'Bulk Update', href: '/products/bulk-update', perm: 'product.update', exact: true },
          ],
        },
        { label: 'Brands', icon: Tag, href: '/brands', perm: 'brand.list' },
        { label: 'Stock Management', icon: Boxes, href: '/stock', perm: 'stock.list' },
      ],
    },
    {
      section: 'LOCATIONS', items: [
        { label: 'Countries', icon: Globe, href: '/countries', perm: 'country.list' },
        {
          label: 'Zones', icon: Map, perm: 'zone.list', active: ['/zones'], children: [
            { label: 'Add Zone', href: '/zones/new', perm: 'zone.create', exact: true },
            { label: 'Manage Zones', href: '/zones', exact: true, active: ['/zones/edit'] },
          ],
        },
        {
          label: 'Stores', icon: Store, perm: 'store.list', active: ['/stores'], children: [
            { label: 'Add Store', href: '/stores/new', perm: 'store.create', exact: true },
            { label: 'Manage Stores', href: '/stores', exact: true, active: ['/stores/edit', '/stores/view'] },
          ],
        },
      ],
    },
    {
      section: 'DELIVERY', items: [
        {
          label: 'Delivery Boys', icon: Bike, perm: 'delivery_boy.list', active: ['/delivery-boys', '/cash-collections', '/delivery-earnings', '/withdrawals?type=delivery_boy'], children: [
            { label: 'Manage', href: '/delivery-boys', exact: true, active: ['/delivery-boys/edit', '/delivery-boys/view', '/delivery-boys/new'] },
            { label: 'Pending Approvals', href: '/delivery-boys/approvals', exact: true },
            { label: 'Cash Collection', href: '/cash-collections' },
            { label: 'Earnings/Payouts', href: '/delivery-earnings' },
            { label: 'Withdrawal Requests', href: '/withdrawals?type=delivery_boy', perm: 'withdrawal.list' },
          ],
        },
      ],
    },
    {
      section: 'CUSTOMERS', items: [
        {
          label: 'Customers', icon: Users, perm: 'customer.list', active: ['/customers', '/wallet-transactions', '/referrals', '/withdrawals?type=customer'], children: [
            { label: 'Manage Customers', href: '/customers' },
            { label: 'Wallet Transactions', href: '/wallet-transactions', perm: 'wallet.list' },
            { label: 'Withdrawal Requests', href: '/withdrawals?type=customer', perm: 'withdrawal.list' },
            { label: 'Referrals', href: '/referrals' },
          ],
        },
      ],
    },
    {
      section: 'MARKETING', items: [
        {
          label: 'Promo Code', icon: Ticket, perm: 'promo_code.list', active: ['/promo-codes'], children: [
            { label: 'Add Promo Code', href: '/promo-codes/new', perm: 'promo_code.create', exact: true },
            { label: 'Manage Promo Codes', href: '/promo-codes', exact: true, active: ['/promo-codes/edit'] },
          ],
        },
        { label: 'Notifications', icon: Bell, href: '/notifications', perm: 'notification.list' },
        { label: 'Email', icon: Mail, href: '/email', perm: 'email.list' },
        {
          label: 'Blog', icon: Newspaper, perm: 'blog.list', active: ['/blogs', '/blog-categories'], children: [
            { label: 'Posts', href: '/blogs' },
            { label: 'Categories', href: '/blog-categories' },
          ],
        },
        { label: 'FAQs', icon: CircleHelp, href: '/faqs', perm: 'faq.list' },
      ],
    },
    { section: 'REPORTS', items: [{ label: 'Reports', icon: ChartColumn, perm: 'report.view', active: ['/reports'], children: reportChildren() }] },
    {
      section: 'STAFF', items: [
        { label: 'Staff Users', icon: UserCog, href: '/staff', perm: 'staff.list' },
        { label: 'Roles', icon: ShieldCheck, href: '/roles', perm: 'role.list' },
      ],
    },
    {
      section: 'SETTINGS', items: [
        { label: 'System Settings', icon: Settings, href: '/settings', perm: 'setting.view' },
        { label: 'Languages', icon: Languages, href: '/languages', perm: 'language.list' },
        { label: 'Pages', icon: FileText, href: '/pages', perm: 'page.list' },
      ],
    },
  ];
}

export function storeMenu(): Menu {
  return [
    { section: 'MAIN', items: MAIN(true) },
    {
      section: 'CATALOG', items: [
        { label: 'Categories', icon: LayoutGrid, href: '/categories', perm: 'category.list' },
        {
          label: 'Products', icon: Package, perm: 'product.list', active: ['/products', '/reviews'], children: [
            { label: 'Add Product', href: '/products/new', perm: 'product.create', exact: true },
            { label: 'Manage Products', href: '/products', exact: true, active: ['/products/edit', '/products/view'] },
            { label: 'Product Ratings', href: '/reviews' },
            { label: 'Bulk Upload', href: '/products/bulk-upload', perm: 'product.create', exact: true },
          ],
        },
        { label: 'Brands', icon: Tag, href: '/brands', perm: 'brand.list' },
        { label: 'Stock Management', icon: Boxes, href: '/stock', perm: 'stock.list' },
      ],
    },
    {
      section: 'DELIVERY', items: [
        {
          label: 'Delivery Boys', icon: Bike, perm: 'delivery_boy.list', active: ['/delivery-boys', '/cash-collections'], children: [
            { label: 'Manage', href: '/delivery-boys', exact: true, active: ['/delivery-boys/view'] },
            { label: 'Cash Collection', href: '/cash-collections' },
          ],
        },
      ],
    },
    { section: 'CUSTOMERS', items: [{ label: 'Customers', icon: Users, perm: 'customer.list', active: ['/customers'], children: [{ label: 'Manage Customers', href: '/customers' }] }] },
    {
      section: 'MARKETING', items: [
        {
          label: 'Promo Code', icon: Ticket, perm: 'promo_code.list', active: ['/promo-codes'], children: [
            { label: 'Add Promo Code', href: '/promo-codes/new', perm: 'promo_code.create', exact: true },
            { label: 'Manage Promo Codes', href: '/promo-codes', exact: true, active: ['/promo-codes/edit'] },
          ],
        },
        { label: 'Notifications', icon: Bell, href: '/notifications', perm: 'notification.list' },
        { label: 'Email', icon: Mail, href: '/email', perm: 'email.list' },
      ],
    },
    { section: 'REPORTS', items: [{ label: 'Reports', icon: ChartColumn, perm: 'report.view', active: ['/reports'], children: reportChildren(true) }] },
    {
      section: 'STORE PANEL', items: [
        { label: 'Store Users', icon: UserCog, href: '/staff', perm: 'staff.list' },
        { label: 'Store Roles', icon: ShieldCheck, href: '/roles', perm: 'role.list' },
      ],
    },
  ];
}

export function deliveryMenu(): Menu {
  return [
    {
      section: 'MAIN', items: [
        { label: 'Dashboard', icon: LayoutGrid, href: '/dashboard' },
        { label: 'My Orders', icon: ShoppingBag, href: '/orders' },
        { label: 'Return Pickups', icon: RotateCcw, href: '/returns' },
      ],
    },
    {
      section: 'FINANCE', items: [
        { label: 'Cash Collection', icon: Banknote, href: '/cash' },
        { label: 'Earnings', icon: TrendingUp, href: '/earnings' },
        { label: 'Wallet & Withdrawals', icon: Wallet, href: '/wallet' },
      ],
    },
    {
      section: 'SUPPORT', items: [
        { label: 'Chat with Support', icon: MessagesSquare, href: '/chat' },
        { label: 'Profile', icon: UserRound, href: '/profile' },
      ],
    },
  ];
}

export function menuFor(panel: Panel): Menu {
  return panel === 'store' ? storeMenu() : panel === 'delivery' ? deliveryMenu() : adminMenu();
}

/** All permission keys (Laravel Role::MODULES) — used by the role permission matrix. */
export const PERMISSION_MODULES: Record<string, string[]> = {
  dashboard: ['view'], order: ['list', 'view', 'update', 'delete'], return: ['list', 'update'], chat: ['list', 'reply'],
  home_builder: ['list', 'update'], banner: ['list', 'create', 'update', 'delete'], category: ['list', 'create', 'update', 'delete'],
  product: ['list', 'create', 'update', 'delete', 'approve'], brand: ['list', 'create', 'update', 'delete'], attribute: ['list', 'create', 'update', 'delete'],
  tax: ['list', 'create', 'update', 'delete'], stock: ['list', 'update'], country: ['list', 'create', 'update', 'delete'], zone: ['list', 'create', 'update', 'delete'],
  store: ['list', 'create', 'update', 'delete'], delivery_boy: ['list', 'create', 'update', 'delete'], customer: ['list', 'update', 'delete'],
  wallet: ['list', 'update'], withdrawal: ['list', 'update'], promo_code: ['list', 'create', 'update', 'delete'], notification: ['list', 'create', 'delete'],
  email: ['list', 'create'], blog: ['list', 'create', 'update', 'delete'], faq: ['list', 'create', 'update', 'delete'], report: ['view'],
  staff: ['list', 'create', 'update', 'delete'], role: ['list', 'create', 'update', 'delete'], setting: ['view', 'update'],
  language: ['list', 'create', 'update', 'delete'], page: ['list', 'update'],
};
/** Modules available to store roles. */
export const STORE_PERMISSION_MODULES = ['dashboard', 'order', 'return', 'chat', 'home_builder', 'category', 'product', 'brand', 'stock', 'delivery_boy', 'customer', 'promo_code', 'notification', 'email', 'report', 'staff', 'role'];

/** Extra route → permission rules for pages that are not menu entries (detail / edit / create screens). */
const ROUTE_PERMS: [string, string][] = [
  ['/orders/view', 'order.view'], ['/returns/view', 'return.list'],
  ['/banners/new', 'banner.create'], ['/banners/edit', 'banner.update'], ['/banners', 'banner.list'],
  ['/categories/edit', 'category.update'], ['/products/edit', 'product.update'], ['/products/view', 'product.list'],
  ['/zones/edit', 'zone.update'], ['/stores/edit', 'store.update'], ['/stores/view', 'store.list'],
  ['/delivery-boys/new', 'delivery_boy.create'], ['/delivery-boys/edit', 'delivery_boy.update'], ['/delivery-boys/view', 'delivery_boy.list'],
  ['/customers/view', 'customer.list'], ['/promo-codes/edit', 'promo_code.update'],
  ['/blogs/new', 'blog.create'], ['/blogs/edit', 'blog.update'], ['/pages/edit', 'page.update'],
  ['/email/templates', 'email.list'], ['/languages', 'language.list'], ['/withdrawals', 'withdrawal.list'],
  ['/reports', 'report.view'], ['/home-builder', 'home_builder.list'], ['/categories', 'category.list'], ['/products', 'product.list'],
  ['/zones', 'zone.list'], ['/stores', 'store.list'], ['/promo-codes', 'promo_code.list'], ['/customers', 'customer.list'],
  ['/delivery-boys', 'delivery_boy.list'], ['/blogs', 'blog.list'], ['/pages', 'page.list'],
];

/**
 * Permission needed to open a panel route (null = any signed-in panel user), derived from the sidebar menu (child entries inherit
 * their parent's permission) plus ROUTE_PERMS. Longest matching prefix wins.
 */
export function routePermission(panel: Panel, pathname: string): string | null {
  if (panel === 'delivery') return null;
  const base = `/${panel}`;
  let path = pathname.startsWith(base) ? pathname.slice(base.length) || '/' : pathname;
  path = path.split('?')[0].replace(/\/+$/, '') || '/';
  const rules: [string, string | null][] = [...ROUTE_PERMS];
  for (const s of menuFor(panel)) for (const i of s.items) {
    if (i.href) rules.push([i.href.split('?')[0], i.perm ?? null]);
    for (const c of i.children ?? []) rules.push([c.href.split('?')[0], c.perm ?? i.perm ?? null]);
  }
  let best: [string, string | null] | null = null;
  for (const r of rules) {
    if ((path === r[0] || path.startsWith(r[0] + '/')) && (!best || r[0].length > best[0].length)) best = r;
  }
  return best ? best[1] : null;
}

/** First menu route the user may open (used when the dashboard is not permitted). */
export function firstAllowedRoute(panel: Panel, can: (perm?: string | null) => boolean): string | null {
  for (const s of menuFor(panel)) for (const i of s.items) {
    if (!can(i.perm)) continue;
    if (i.href) return i.href;
    const c = (i.children ?? []).find((ch) => can(ch.perm));
    if (c) return c.href;
  }
  return null;
}
