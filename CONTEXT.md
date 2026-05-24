# dev-hunter Agent — Project Context

## What is Syntelo?
Syntelo is an AI consulting company building self-hosted
developer agents for software teams.
Business model: per-implementation consulting + support retainer.
Code never leaves client infrastructure — fully self-hosted.

## Repositories
Agent:   git@github.com:Syntelo/agent.git  (this repo)
Core:    https://github.com/Syntelo/core
Package: @syntelo/core on GitHub Packages

## Architecture
```
@syntelo/core (npm package — GitHub Packages)
  providers: Git, Issues, LLM, RAG, Parser, Security

@syntelo/agent (this repo)
  imports @syntelo/core
  adds: Express webhook server, prompts, Docker
```

## Full flow

On new GitHub Issue:
```
GitHub Issue created
  → POST /webhook/issue
  → verify HMAC signature
  → parseWebhookPayload → IssueEvent
  → sanitizeBugReport()
  → RAG: embed text → Qdrant similarity search → top 8 chunks
  → get git log for found files
  → build prompt → Groq API (Llama 3.3 70B)
  → validateAgentOutput() — Zod validation
  → post markdown comment to GitHub Issue
```

On push to main:
```
Push to main
  → POST /webhook/push
  → get changed .ts .tsx .js .jsx files
  → re-index only changed files in Qdrant
  → index always in sync with main
```

## File structure
```
src/
  webhook/server.ts    — Express server, startup, two endpoints
  indexer/index.ts     — initRAG, indexFullRepo, reindexFiles
  analyzer/index.ts    — RAG retrieval + Groq + validation
  commenter/index.ts   — format + post GitHub comment
scripts/
  index-repo.ts        — manual full re-index trigger
docker-compose.yml     — qdrant + ollama + agent
Dockerfile             — node:20-alpine
.env.example           — all required vars documented
```

## Environment variables
```bash
GITHUB_TOKEN=            # classic PAT: repo + read:packages
GITHUB_WEBHOOK_SECRET=   # random string, set same in GitHub webhook
GROQ_API_KEY=            # console.groq.com — free tier
TARGET_REPO_URL=         # fill when target repo is ready
TARGET_REPO_BRANCH=main
QDRANT_URL=http://qdrant:6333
OLLAMA_URL=http://ollama:11434
COLLECTION_NAME=code_chunks
PORT=3000
```

## Local setup (when target repo is ready)
```bash
# 1. Install
git clone git@github.com:Syntelo/agent.git
cd agent
cp .env.example .env
# fill .env — all fields except TARGET_REPO_URL (add later)
npm install

# 2. Start infrastructure
docker-compose up -d qdrant ollama

# 3. Pull embedding model (once)
docker exec syntelo-agent-ollama-1 ollama pull nomic-embed-text

# 4. When target repo ready — add to .env then:
npm run index

# 5. Start agent
npm run dev

# 6. Expose via ngrok
ngrok http 3000

# 7. Add webhook in target repo
# GitHub repo → Settings → Webhooks → Add webhook
# Payload URL:  https://your-ngrok-url/webhook/issue
# Content type: application/json
# Secret:       value of GITHUB_WEBHOOK_SECRET
# Events:       ✅ Issues  ✅ Pushes
```

## Switching LLM provider
One line in src/analyzer/index.ts:
```typescript
createLLMProvider('groq', { apiKey: GROQ_API_KEY })       // demo, free
createLLMProvider('anthropic', { apiKey: ANTHROPIC_KEY }) // production
createLLMProvider('ollama', { baseUrl: OLLAMA_URL })      // self-hosted
```

## Deploying at client
```bash
git clone git@github.com:Syntelo/agent.git
cd agent
cp .env.example .env
# fill with client credentials + their repo URL
docker-compose up -d
docker exec agent-ollama-1 ollama pull nomic-embed-text
npm run index
# add webhook in client GitHub/GitLab
# done in 30-60 minutes
```

## What still needs to be done
- [ ] Create test React + NestJS repo with intentional bugs
- [ ] Fill TARGET_REPO_URL in .env
- [ ] Run npm run index
- [ ] Run first end-to-end test
- [ ] Tune prompt if needed
- [ ] Add metrics/logging (future)
- [ ] Build demo dashboard (future)

## Key decisions
```
RAG chunking:   tree-sitter (function/method/class level)
Re-indexing:    only changed files on push to main
Embeddings:     Ollama nomic-embed-text, 768d, local
Vector store:   Qdrant Docker, persistent volume
Security:       sanitize input + validate output (Zod)
Webhooks:       always return 200 (prevents GitHub disabling)
Target repo:    unknown at build time — set via .env
```

## Cost
```
Demo (local):   $0
Production:     ~$100/mc GCP VM + ~$0.15/mc Groq API
```

## Status
- [x] @syntelo/core published to GitHub Packages
- [x] @syntelo/agent scaffolded
- [ ] Target repo created and added to .env
- [ ] First index completed
- [ ] End-to-end test passing
- [ ] Demo presented
