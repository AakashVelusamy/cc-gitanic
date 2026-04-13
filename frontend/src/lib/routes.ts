// centralized application route manifest
// maps logical paths to url strings
// provides dynamic uri builders for resources
// handles encoding for repository and path names
// ensures type-safe navigation across the frontend
export const routes = {
  home: '/',
  login: '/login',
  dashboard: '/dashboard',
  signup: '/login?mode=signup',
  repo: (name: string) => `/repos/${encodeURIComponent(name)}`,
  repoTree: (repoName: string, path?: string) =>
    path
      ? `/repos/${encodeURIComponent(repoName)}/tree/${path}`
      : `/repos/${encodeURIComponent(repoName)}`,
  repoBlob: (repoName: string, path: string) =>
    `/repos/${encodeURIComponent(repoName)}/blob/${path}`,
  newRepo: '/repos/new',
} as const;
