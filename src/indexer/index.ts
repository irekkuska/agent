import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { createGitProvider, RAGPipeline, CodeParser } from '@syntelo/core';
import type { CodeChunk } from '@syntelo/core';

const REPO_PATH = '/tmp/syntelo-target-repo';

export async function initRAG(): Promise<RAGPipeline> {
  const ragPipeline = new RAGPipeline({
    ollamaUrl: process.env.OLLAMA_URL!,
    qdrantUrl: process.env.QDRANT_URL!,
    collectionName: process.env.COLLECTION_NAME!,
  });
  await ragPipeline.initialize();
  console.log('RAG pipeline initialized');
  return ragPipeline;
}

function walkDir(dir: string, extensions: string[], excludes: string[]): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!excludes.includes(entry.name)) {
        results.push(...walkDir(fullPath, extensions, excludes));
      }
    } else if (extensions.some(ext => entry.name.endsWith(ext))) {
      results.push(fullPath);
    }
  }
  return results;
}

export async function indexFullRepo(ragPipeline: RAGPipeline): Promise<void> {
  const targetUrl = process.env.TARGET_REPO_URL;
  if (!targetUrl) {
    throw new Error('TARGET_REPO_URL not configured. Set it in .env and run npm run index');
  }

  const branch = process.env.TARGET_REPO_BRANCH ?? 'main';
  const token = process.env.GITHUB_TOKEN!;

  console.log(`Starting full repo index: ${targetUrl}`);

  const provider = createGitProvider('github', { token });
  // cloneRepo signature: (url, branch, targetPath)
  await provider.cloneRepo(targetUrl, branch, REPO_PATH);

  const excludes = ['node_modules', 'dist', '.next', 'build', 'coverage', '__tests__'];
  const extensions = ['.ts', '.tsx', '.js', '.jsx'];
  const files = walkDir(REPO_PATH, extensions, excludes);

  const parser = new CodeParser();
  let chunkCount = 0;

  for (const filePath of files) {
    const relativePath = path.relative(REPO_PATH, filePath);
    const content = fs.readFileSync(filePath, 'utf-8');

    // parseFile is async and returns ParsedChunk[]; map to CodeChunk[] by adding file field
    const parsed = await parser.parseFile(filePath, content);
    const chunks: CodeChunk[] = parsed.map(p => ({ ...p, file: relativePath }));

    const commits = await provider.getGitLog(REPO_PATH, relativePath, 5);
    const gitInfo = {
      lastCommit: commits[0]?.hash,
      lastAuthor: commits[0]?.author,
    };

    await ragPipeline.indexFile(relativePath, chunks, gitInfo);
    chunkCount += chunks.length;
  }

  console.log(`Indexed ${files.length} files, ${chunkCount} total chunks`);
}

export async function reindexFiles(filePaths: string[], ragPipeline: RAGPipeline): Promise<void> {
  if (filePaths.length === 0) return;

  if (!fs.existsSync(REPO_PATH)) {
    await indexFullRepo(ragPipeline);
    return;
  }

  console.log(`Re-indexing ${filePaths.length} changed files`);

  execSync('git pull', { cwd: REPO_PATH, stdio: 'inherit' });

  const provider = createGitProvider('github', { token: process.env.GITHUB_TOKEN! });
  const parser = new CodeParser();

  for (const filePath of filePaths) {
    const fullPath = path.join(REPO_PATH, filePath);
    if (!fs.existsSync(fullPath)) {
      await ragPipeline.removeFile(filePath);
    } else {
      const content = fs.readFileSync(fullPath, 'utf-8');
      const parsed = await parser.parseFile(fullPath, content);
      const chunks: CodeChunk[] = parsed.map(p => ({ ...p, file: filePath }));

      const commits = await provider.getGitLog(REPO_PATH, filePath, 5);
      const gitInfo = {
        lastCommit: commits[0]?.hash,
        lastAuthor: commits[0]?.author,
      };
      await ragPipeline.indexFile(filePath, chunks, gitInfo);
    }
  }

  console.log('Re-index complete');
}
