# dev-hunter

AI-powered bug triage agent by [Syntelo](https://github.com/Syntelo). When a GitHub Issue is opened, dev-hunter searches your codebase semantically, identifies the root cause, and posts a structured analysis comment — automatically, in seconds, fully self-hosted.

## Architecture

```
GitHub Issue / Push
       │
       ▼
 Express Server (POST /webhook/issue, /webhook/push)
       │
       ├─ verifyWebhookSignature (HMAC)
       ├─ parseWebhookPayload → IssueEvent
       │
       ▼
  sanitizeBugReport()
       │
       ▼
  Qdrant (RAG) ◄─── Ollama nomic-embed-text (local embeddings)
  top 8 chunks
       │
       ▼
  Groq API — Llama 3.3 70B
       │
       ▼
  validateAgentOutput() — Zod
       │
       ▼
  GitHub Issue Comment ✅
```

## Quick start

```bash
# 1. Clone and install
git clone git@github.com:Syntelo/agent.git
cd agent
cp .env.example .env
# edit .env — fill GITHUB_TOKEN, GITHUB_WEBHOOK_SECRET, GROQ_API_KEY
npm install

# 2. Start infrastructure
docker-compose up -d qdrant ollama

# 3. Pull embedding model (once)
docker exec syntelo-agent-ollama-1 ollama pull nomic-embed-text

# 4. Add target repo to .env, then index it
# TARGET_REPO_URL=https://github.com/your-org/your-repo
npm run index

# 5. Start the agent
npm run dev

# 6. Expose via ngrok
ngrok http 3000
```

## Adding a GitHub webhook

1. Go to your target repo → **Settings → Webhooks → Add webhook**
2. **Payload URL**: `https://your-ngrok-url/webhook/issue`
3. **Content type**: `application/json`
4. **Secret**: value of `GITHUB_WEBHOOK_SECRET` from `.env`
5. **Events**: check **Issues** and **Pushes**

The agent will receive events for both new issues and pushes to `main` (for re-indexing).

## Switching LLM provider

One line in [`src/analyzer/index.ts`](src/analyzer/index.ts):

```typescript
createLLMProvider('groq', { apiKey: GROQ_API_KEY })       // demo — free tier
createLLMProvider('anthropic', { apiKey: ANTHROPIC_KEY }) // production
createLLMProvider('ollama', { baseUrl: OLLAMA_URL })      // fully self-hosted
```

## Environment variables

| Variable | Description |
|---|---|
| `GITHUB_TOKEN` | Classic PAT with `repo` + `read:packages` scopes |
| `GITHUB_WEBHOOK_SECRET` | Random string — must match GitHub webhook config |
| `GROQ_API_KEY` | Free at [console.groq.com](https://console.groq.com) |
| `TARGET_REPO_URL` | Repo to analyze — set when ready, then run `npm run index` |
| `TARGET_REPO_BRANCH` | Branch to index (default: `main`) |
| `QDRANT_URL` | Vector DB URL (default: `http://qdrant:6333`) |
| `OLLAMA_URL` | Embeddings URL (default: `http://ollama:11434`) |
| `COLLECTION_NAME` | Qdrant collection name (default: `code_chunks`) |
| `PORT` | Server port (default: `3000`) |

## Health check

```
GET /health → { ok: true, agent: "dev-hunter" }
```
