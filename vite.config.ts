import { defineConfig, loadEnv } from 'vite';
import { execSync } from 'child_process';
import type { IncomingMessage, ServerResponse } from 'http';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const GITHUB_ORG      = env['VITE_GITHUB_ORG']  ?? 'aipoweredmarketer';
  const GITHUB_USERNAME = env['VITE_USERNAME']     ?? 'adam-smycz';

  return {
    server: {
      historyApiFallback: true,
    },
    plugins: [
      {
        name: 'github-prs',
        configureServer(server) {
          server.middlewares.use('/api/github-prs', (req: IncomingMessage, res: ServerResponse) => {
            const url = new URL(req.url!, 'http://localhost');
            const start = url.searchParams.get('start');
            const end   = url.searchParams.get('end');

            if (!start || !end) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'Brak parametrów start/end' }));
              return;
            }

            try {
              const raw = execSync(
                `gh search prs --author ${GITHUB_USERNAME} --owner ${GITHUB_ORG} --merged --merged-at ${start}..${end} --json number,title,url,repository,closedAt --limit 100`,
                { encoding: 'utf-8' }
              );

              type SearchItem = { number: number; title: string; url: string; repository: { name: string; nameWithOwner: string } };
              type CommitEntry = { committedDate: string };
              type PRDetail = { additions: number; deletions: number; mergedAt: string; commits: CommitEntry[] };

              const items: SearchItem[] = JSON.parse(raw);

              const prs = items.map(i => {
                const detail: PRDetail = JSON.parse(execSync(
                  `gh pr view ${i.number} --repo ${i.repository.nameWithOwner} --json additions,deletions,mergedAt,commits`,
                  { encoding: 'utf-8' }
                ));

                const firstCommitAt = detail.commits.length
                  ? detail.commits.reduce((min, c) => c.committedDate < min ? c.committedDate : min, detail.commits[0].committedDate)
                  : detail.mergedAt;

                return {
                  number:       i.number,
                  title:        i.title,
                  url:          i.url,
                  repo:         i.repository.name,
                  mergedAt:     detail.mergedAt,
                  firstCommitAt,
                  additions:    detail.additions,
                  deletions:    detail.deletions,
                };
              });

              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(prs));
            } catch (err) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: String(err) }));
            }
          });
        },
      },
    ],
  };
});
