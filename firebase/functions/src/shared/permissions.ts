/** Permission keys — same as Laravel `Role::MODULES` ("module.action"). */
export const MODULES: Record<string, string[]> = {
  dashboard: ['view'],
  order: ['list', 'view', 'update', 'delete'],
  return: ['list', 'update'],
  chat: ['list', 'reply'],
  home_builder: ['list', 'update'],
  banner: ['list', 'create', 'update', 'delete'],
  category: ['list', 'create', 'update', 'delete'],
  product: ['list', 'create', 'update', 'delete', 'approve'],
  brand: ['list', 'create', 'update', 'delete'],
  attribute: ['list', 'create', 'update', 'delete'],
  tax: ['list', 'create', 'update', 'delete'],
  stock: ['list', 'update'],
  country: ['list', 'create', 'update', 'delete'],
  zone: ['list', 'create', 'update', 'delete'],
  store: ['list', 'create', 'update', 'delete'],
  delivery_boy: ['list', 'create', 'update', 'delete'],
  customer: ['list', 'update', 'delete'],
  wallet: ['list', 'update'],
  withdrawal: ['list', 'update'],
  promo_code: ['list', 'create', 'update', 'delete'],
  notification: ['list', 'create', 'delete'],
  email: ['list', 'create'],
  blog: ['list', 'create', 'update', 'delete'],
  faq: ['list', 'create', 'update', 'delete'],
  report: ['view'],
  staff: ['list', 'create', 'update', 'delete'],
  role: ['list', 'create', 'update', 'delete'],
  setting: ['view', 'update'],
  language: ['list', 'create', 'update', 'delete'],
  page: ['list', 'update'],
};

export function allPermissionKeys(): string[] {
  return Object.entries(MODULES).flatMap(([m, actions]) => actions.map((a) => `${m}.${a}`));
}

/** `*`, exact key, or `module.*` grant the permission (Laravel Role::hasPermission). */
export function hasPermission(perms: string[] | null | undefined, key: string): boolean {
  const list = perms ?? [];
  const [module] = key.split('.');
  return list.includes('*') || list.includes(key) || list.includes(`${module}.*`);
}
