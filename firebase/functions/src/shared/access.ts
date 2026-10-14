/** Panel access checks used by callables (mirrors the rules: admin all; staff by role; store scoped). */
import { cached, Ctx, db, denied, IS_EMULATOR } from './firebase';
import { hasPermission } from './permissions';

export interface PanelActor {
  kind: 'admin' | 'staff' | 'store';
  uid: string;
  storeId: string | null;
  permissions: string[] | '*';
}

async function rolePermissions(roleId: string): Promise<string[]> {
  return cached(`role/${roleId}`, IS_EMULATOR ? 0 : 30_000, async () => {
    const snap = await db.doc(`roles/${roleId}`).get();
    return (snap.get('permissions') as string[] | undefined) ?? [];
  });
}

/** Require a panel user that holds `permission` (any of the given keys). */
export async function requirePanel(ctx: Ctx, ...permissions: string[]): Promise<PanelActor> {
  const role = ctx.role;
  if (role === 'admin') return { kind: 'admin', uid: ctx.uid, storeId: null, permissions: '*' };
  if (role !== 'staff' && role !== 'store') denied();
  const roleId = (ctx.token.role_id as string | undefined) || null;
  const storeId = role === 'store' ? ((ctx.token.store_id as string | undefined) || null) : null;
  if (role === 'store' && !storeId) denied('Your account is not linked to a store.');
  let perms: string[] | '*' = '*';
  if (roleId) perms = await rolePermissions(roleId);
  else if (role === 'staff') perms = [];
  if (permissions.length && perms !== '*' && !permissions.some((p) => hasPermission(perms as string[], p))) denied();
  return { kind: role as 'staff' | 'store', uid: ctx.uid, storeId, permissions: perms };
}

/** Store users may only touch documents of their own store. */
export function assertScope(actor: PanelActor, storeId: string | null | undefined, message = 'This record belongs to another store.') {
  if (actor.kind === 'store' && (storeId ?? null) !== actor.storeId) denied(message);
}

export function actorLabel(actor: PanelActor): 'admin' | 'store' {
  return actor.kind === 'store' ? 'store' : 'admin';
}
