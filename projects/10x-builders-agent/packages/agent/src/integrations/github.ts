/**
 * Minimal GitHub REST client used by the agent's tools. Keeps the surface area
 * small on purpose: we only implement the four operations the product exposes
 * (list repos, list issues, create issue, create repo) and let any other use
 * case be added explicitly.
 *
 * All methods take an access token argument instead of reading from env so the
 * caller can scope the client to the end-user's OAuth token.
 */

const GITHUB_API = "https://api.github.com";

async function ghFetch<T>(
  accessToken: string,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${GITHUB_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "10x-builders-agent",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    throw new Error(
      `GitHub API error ${res.status} on ${init.method ?? "GET"} ${path}: ${bodyText.slice(0, 200)}`
    );
  }
  return (await res.json()) as T;
}

export interface GithubRepoSummary {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
  description: string | null;
  default_branch: string;
  updated_at: string;
}

export async function listRepositories(
  accessToken: string,
  opts: { perPage?: number } = {}
): Promise<GithubRepoSummary[]> {
  const perPage = Math.max(1, Math.min(opts.perPage ?? 10, 30));
  const repos = await ghFetch<GithubRepoSummary[]>(
    accessToken,
    `/user/repos?per_page=${perPage}&sort=updated&affiliation=owner,collaborator`
  );
  return repos.map((r) => ({
    id: r.id,
    name: r.name,
    full_name: r.full_name,
    private: r.private,
    html_url: r.html_url,
    description: r.description,
    default_branch: r.default_branch,
    updated_at: r.updated_at,
  }));
}

export interface GithubIssueSummary {
  number: number;
  title: string;
  state: "open" | "closed";
  html_url: string;
  user_login: string;
  created_at: string;
}

export async function listIssues(
  accessToken: string,
  params: { owner: string; repo: string; state?: "open" | "closed" | "all"; perPage?: number }
): Promise<GithubIssueSummary[]> {
  const state = params.state ?? "open";
  const perPage = Math.max(1, Math.min(params.perPage ?? 20, 50));
  // Filter out pull requests by hand: the /issues endpoint includes PRs and we
  // only care about issues here.
  interface RawIssue {
    number: number;
    title: string;
    state: "open" | "closed";
    html_url: string;
    user: { login: string };
    created_at: string;
    pull_request?: unknown;
  }
  const raw = await ghFetch<RawIssue[]>(
    accessToken,
    `/repos/${encodeURIComponent(params.owner)}/${encodeURIComponent(params.repo)}/issues?state=${state}&per_page=${perPage}`
  );
  return raw
    .filter((i) => !i.pull_request)
    .map((i) => ({
      number: i.number,
      title: i.title,
      state: i.state,
      html_url: i.html_url,
      user_login: i.user.login,
      created_at: i.created_at,
    }));
}

export interface GithubCreatedIssue {
  number: number;
  html_url: string;
  title: string;
}

export async function createIssue(
  accessToken: string,
  params: { owner: string; repo: string; title: string; body?: string }
): Promise<GithubCreatedIssue> {
  interface RawIssue {
    number: number;
    html_url: string;
    title: string;
  }
  const created = await ghFetch<RawIssue>(
    accessToken,
    `/repos/${encodeURIComponent(params.owner)}/${encodeURIComponent(params.repo)}/issues`,
    {
      method: "POST",
      body: JSON.stringify({
        title: params.title,
        body: params.body ?? "",
      }),
    }
  );
  return { number: created.number, html_url: created.html_url, title: created.title };
}

export interface GithubCreatedRepo {
  name: string;
  full_name: string;
  html_url: string;
  private: boolean;
}

export async function createRepository(
  accessToken: string,
  params: { name: string; description?: string; private?: boolean; auto_init?: boolean }
): Promise<GithubCreatedRepo> {
  interface RawRepo {
    name: string;
    full_name: string;
    html_url: string;
    private: boolean;
  }
  const created = await ghFetch<RawRepo>(accessToken, `/user/repos`, {
    method: "POST",
    body: JSON.stringify({
      name: params.name,
      description: params.description ?? "",
      private: params.private ?? true,
      auto_init: params.auto_init ?? true,
    }),
  });
  return {
    name: created.name,
    full_name: created.full_name,
    html_url: created.html_url,
    private: created.private,
  };
}
