/** users/{uid}/favorites/{productId} — owner create/delete. */
import { collection, deleteDoc, doc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore';
import { fb } from '../firebase';
import type { Id } from '../types';
import { customerUid, guard } from './core';

let favs: { uid: string; ids: Promise<Set<string>> } | null = null;

/** Favourite product ids of the signed-in customer (empty for guests). */
export async function favoriteIds(): Promise<Set<string>> {
  const { auth, db } = fb();
  await auth.authStateReady();
  const u = auth.currentUser;
  if (!u || u.isAnonymous) return new Set();
  if (!favs || favs.uid !== u.uid) {
    favs = {
      uid: u.uid,
      ids: guard(async () => new Set((await getDocs(collection(db, 'users', u.uid, 'favorites'))).docs.map((d) => d.id))).catch((e) => {
        favs = null;
        throw e;
      }),
    };
  }
  return favs.ids;
}

export async function addFavorite(productId: Id) {
  const id = await customerUid();
  await guard(() => setDoc(doc(fb().db, 'users', id, 'favorites', String(productId)), { created_at: serverTimestamp() }));
  favs = null;
}

export async function removeFavorite(productId: Id) {
  const id = await customerUid();
  await guard(() => deleteDoc(doc(fb().db, 'users', id, 'favorites', String(productId))));
  favs = null;
}

export function resetFavorites() {
  favs = null;
}
