import { getAccessToken } from "@/lib/auth/client-tokens";

export function apiUrl(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  return path.startsWith("/") ? path : `/${path}`;
}

export async function apiFetch(
  path: string,
  init?: RequestInit
): Promise<Response> {
  const token = getAccessToken();
  const headers = new Headers(init?.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return fetch(apiUrl(path), { ...init, headers });
}
