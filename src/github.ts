export interface PullRequest {
  number: number;
  title: string;
  repo: string;
  url: string;
  mergedAt: string;
  firstCommitAt: string;
  additions: number;
  deletions: number;
}

function storageKey(start: string, end: string) {
  return `pkup-github:${start}..${end}`;
}

export function loadPRs(start: string, end: string): PullRequest[] | null {
  const raw = localStorage.getItem(storageKey(start, end));
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function savePRs(start: string, end: string, prs: PullRequest[]) {
  localStorage.setItem(storageKey(start, end), JSON.stringify(prs));
}

export async function fetchPRs(start: string, end: string): Promise<PullRequest[]> {
  const res = await fetch(`/api/github-prs?start=${start}&end=${end}`);
  const data = await res.json();

  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

  savePRs(start, end, data);
  return data as PullRequest[];
}
