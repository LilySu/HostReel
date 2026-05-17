import 'server-only';
import { LocalStorageProvider } from './local';
import { R2StorageProvider } from './r2';
import type { StorageProvider } from './provider';

const providerName = (process.env.STORAGE_PROVIDER ?? 'local').toLowerCase();

/**
 * The active StorageProvider for this app. Gated by STORAGE_PROVIDER:
 *   'local' (default) → LocalStorageProvider (dev; on-disk under ./storage)
 *   'r2'              → R2StorageProvider (production; browser→R2 presigned)
 *
 * R2 env reads are lazy (see r2.ts), so importing this module never fails
 * when STORAGE_PROVIDER=local.
 */
export const storage: StorageProvider =
  providerName === 'r2' ? new R2StorageProvider() : new LocalStorageProvider();

export const isR2: boolean = providerName === 'r2';

export type { StorageProvider } from './provider';
