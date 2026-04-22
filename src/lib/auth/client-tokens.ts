const ACCESS_KEY = "vedioclipper:access";
const REFRESH_KEY = "vedioclipper:refresh";

function emitChange() {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new Event("vedioclipper:auth"));
}

export function setAuthTokens(accessToken: string, refreshToken: string): void {
  if (typeof window === "undefined") {
    return;
  }
  localStorage.setItem(ACCESS_KEY, accessToken);
  localStorage.setItem(REFRESH_KEY, refreshToken);
  emitChange();
}

export function clearAuthTokens(): void {
  if (typeof window === "undefined") {
    return;
  }
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  emitChange();
}

export function getAccessToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return localStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return localStorage.getItem(REFRESH_KEY);
}
