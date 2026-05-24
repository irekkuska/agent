import { createIssueProvider } from '@syntelo/core';
import type { IssueEvent, AgentAnalysis } from '@syntelo/core';

export async function postComment(issue: IssueEvent, analysis: AgentAnalysis): Promise<void> {
  const affectedFilesSection =
    analysis.affected_files.length > 0
      ? analysis.affected_files.map(f => `- \`${f}\``).join('\n')
      : '- Could not determine affected files';

  const confidencePct = `${Math.round(analysis.confidence * 100)}%`;

  const comment = `## 🤖 agent analysis

**Root cause**
${analysis.root_cause}

**Affected files**
${affectedFilesSection}

**Suggested fix**
\`\`\`typescript
${analysis.fix_suggestion}
\`\`\`

**Reasoning**
${analysis.reasoning ?? 'N/A'}

---
| Risk | Confidence | Needs human review |
|------|------------|-------------------|
| ${analysis.risk} | ${confidencePct} | ${analysis.needs_human_review ? '⚠️ Yes' : '✅ No'} |

---
*Powered by [Syntelo](https://github.com/Syntelo)`;

  const provider = createIssueProvider('github', {
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET!,
    token: process.env.GITHUB_TOKEN!,
  });

  await provider.postComment(issue.id, issue.repoName, comment);
  console.log(`✅ Comment posted to issue #${issue.id} in ${issue.repoName}`);
}
