// Copies firebase/firestore.indexes.json into src/lib/firestoreIndexes.json so the query planner (src/lib/queryPlan.ts)
// knows which composite indexes are deployed. Runs before `npm run build`; keeps the committed copy when the
// firebase/ folder is not available (e.g. a build that only has admin/).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, '../../firebase/firestore.indexes.json');
const dst = resolve(here, '../src/lib/firestoreIndexes.json');
if (!existsSync(src)) {
  console.log(`[sync-indexes] ${src} not found — keeping ${dst}`);
  process.exit(0);
}
const j = JSON.parse(readFileSync(src, 'utf8'));
const out = JSON.stringify({ indexes: j.indexes || [], fieldOverrides: j.fieldOverrides || [] }, null, 1) + '\n';
const prev = existsSync(dst) ? readFileSync(dst, 'utf8') : '';
if (prev !== out) { writeFileSync(dst, out); console.log(`[sync-indexes] updated (${(j.indexes || []).length} composite indexes)`); }
else console.log('[sync-indexes] up to date');
