'use client';
import { getDownloadURL, ref, uploadBytes, deleteObject } from 'firebase/storage';
import { storage } from './firebase';

/** Upload a file to Cloud Storage and return its download URL (stored in Firestore image fields). */
export async function uploadFile(file: File | Blob, folder: string, name?: string): Promise<{ url: string; path: string }> {
  const ext = (file as File).name?.split('.').pop()?.toLowerCase() || 'bin';
  const base = name || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const path = `${folder.replace(/\/+$/, '')}/${base}.${ext}`;
  const r = ref(storage(), path);
  await uploadBytes(r, file, { contentType: (file as File).type || undefined });
  const url = await getDownloadURL(r);
  return { url, path };
}

/** Upload a CSV (or any file) and return only the storage path — used by callables like bulkImportProducts. */
export async function uploadForFunction(file: File, folder = 'imports'): Promise<string> {
  const { path } = await uploadFile(file, folder);
  return path;
}

export async function deleteByUrlOrPath(v: string) {
  try { await deleteObject(ref(storage(), v)); } catch { /* ignore */ }
}

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
