/** mail_queue/{id} (written by sendBulkEmail): { to: string[], subject, body, template, status } → SMTP with limited concurrency. */
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { now, REGION } from '../shared/firebase';
import { sendEmail } from '../services/notify';
import { firstDelivery } from './orders';

const CONCURRENCY = 5;

export const onMailQueued = onDocumentCreated({ document: 'mail_queue/{id}', region: REGION, timeoutSeconds: 540, memory: '512MiB', maxInstances: 5 }, async (event) => {
  const snap = event.data;
  const job = snap?.data();
  if (!snap || !job || job.status !== 'pending') return;
  if (!(await firstDelivery(event.id, 'mail'))) return;
  const to = (Array.isArray(job.to) ? job.to : []).map(String).filter(Boolean);
  await snap.ref.update({ status: 'sending', started_at: now() });
  let sent = 0, failed = 0, i = 0;
  const worker = async () => {
    while (i < to.length) {
      const addr = to[i++];
      (await sendEmail(addr, String(job.subject ?? ''), String(job.body ?? ''), { template: String(job.template ?? 'bulk') })) ? sent++ : failed++;
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, to.length) }, worker));
  await snap.ref.update({ status: failed && !sent ? 'failed' : 'done', sent, failed, finished_at: now() });
});
