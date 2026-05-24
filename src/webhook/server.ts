import 'dotenv/config';
import express from 'express';
import { createIssueProvider } from '@syntelo/core';
import { initRAG, reindexFiles } from '../indexer';
import { analyzeBug } from '../analyzer';
import { postComment } from '../commenter';
import type { RAGPipeline } from '@syntelo/core';

const PORT = process.env.PORT ?? '3000';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN!;
const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET!;

let ragPipeline: RAGPipeline;

const app = express();

app.use(express.raw({ type: 'application/json' }));

app.post('/webhook/issue', async (req, res) => {
  try {
    const rawBody = req.body.toString();
    const signature = req.headers['x-hub-signature-256'] as string;

    // webhookSecret is used by the implementation as the GitHub PAT for API calls
    const provider = createIssueProvider('github', { webhookSecret: GITHUB_TOKEN });

    const valid = provider.verifyWebhookSignature(rawBody, signature, WEBHOOK_SECRET);
    if (!valid) {
      console.warn(`[${new Date().toISOString()}] Invalid webhook signature`);
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const parsed = JSON.parse(rawBody);
    const issueEvent = await provider.parseWebhookPayload(parsed);

    if (!issueEvent) {
      return res.status(200).json({ ok: true });
    }

    const analysis = await analyzeBug(issueEvent, ragPipeline);
    await postComment(issueEvent, analysis);

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] /webhook/issue error:`, err);
    return res.status(200).json({ ok: true });
  }
});

app.post('/webhook/push', async (req, res) => {
  try {
    const rawBody = req.body.toString();
    const signature = req.headers['x-hub-signature-256'] as string;

    const provider = createIssueProvider('github', { webhookSecret: GITHUB_TOKEN });

    const valid = provider.verifyWebhookSignature(rawBody, signature, WEBHOOK_SECRET);
    if (!valid) {
      console.warn(`[${new Date().toISOString()}] Invalid webhook signature on push`);
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const body = JSON.parse(rawBody);

    if (body.ref !== 'refs/heads/main') {
      return res.status(200).json({ ok: true });
    }

    const relevantExtensions = ['.ts', '.tsx', '.js', '.jsx'];
    const changedFiles: string[] = [];

    for (const commit of body.commits ?? []) {
      for (const file of [
        ...(commit.added ?? []),
        ...(commit.modified ?? []),
        ...(commit.removed ?? []),
      ]) {
        if (relevantExtensions.some((ext: string) => (file as string).endsWith(ext))) {
          changedFiles.push(file as string);
        }
      }
    }

    await reindexFiles(changedFiles, ragPipeline);

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] /webhook/push error:`, err);
    return res.status(200).json({ ok: true });
  }
});

app.get('/health', (_req, res) => {
  res.status(200).json({ ok: true, agent: 'dev-hunter' });
});

async function main() {
  ragPipeline = await initRAG();
  app.listen(PORT, () => {
    console.log(`dev-hunter agent running on port ${PORT}`);
  });
}

main().catch(err => {
  console.error(`[${new Date().toISOString()}] Startup error:`, err);
  process.exit(1);
});
