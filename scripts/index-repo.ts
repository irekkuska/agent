import 'dotenv/config';
import { indexFullRepo, initRAG } from '../src/indexer';

async function main() {
  if (!process.env.TARGET_REPO_URL) {
    console.error('❌ TARGET_REPO_URL not set in .env');
    console.error('Set it to the repo you want to analyze, then run again.');
    process.exit(1);
  }
  console.log('🔍 Initializing RAG pipeline...');
  const rag = await initRAG();
  console.log('📦 Indexing repository:', process.env.TARGET_REPO_URL);
  await indexFullRepo(rag);
  console.log('✅ Done! Agent is ready to analyze bugs.');
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Index failed:', err.message);
  process.exit(1);
});
