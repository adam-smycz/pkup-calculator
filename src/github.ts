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

export interface GithubUser {
  login: string;
}

function storageKey(username: string, start: string, end: string) {
  return `pkup-github:${username}:${start}..${end}`;
}

export function loadPRs(username: string, start: string, end: string): PullRequest[] | null {
  const raw = localStorage.getItem(storageKey(username, start, end));
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function savePRs(username: string, start: string, end: string, prs: PullRequest[]) {
  localStorage.setItem(storageKey(username, start, end), JSON.stringify(prs));
}

export async function fetchPRs(username: string, start: string, end: string): Promise<PullRequest[]> {
  const res = await fetch(`/api/github-prs?username=${encodeURIComponent(username)}&start=${start}&end=${end}`);
  const data = await res.json();

  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

  savePRs(username, start, end, data);
  return data as PullRequest[];
}

let usersCache: GithubUser[] | null = null;

export async function fetchUsers(): Promise<GithubUser[]> {
  if (usersCache) return usersCache;
  const res = await fetch('/api/github-users');
  if (!res.ok) return [];
  usersCache = await res.json();
  return usersCache!;
}
