import { setAuthTokenGetter } from "@workspace/api-client-react";

export const LOCAL_DEV_AUTH_STORAGE_KEY = "mallorca_local_dev_auth";
export const LOCAL_DEV_TOKEN_STORAGE_KEY = "mallorca_local_dev_token";
export const LOCAL_DEV_AUTH_TOKEN = "local-dev";

/** Stable dummy identity used as a Clerk stand-in on localhost. */
export const LOCAL_DEV_USER = {
  id: "user_local_dev_admin",
  firstName: "Admin",
  lastName: "Local",
  primaryEmailAddress: {
    emailAddress: "alpeva96@gmail.com",
  },
} as const;

export function isLocalDevAuthPreferred(): boolean {
  if (!import.meta.env.DEV) return false;
  const flag = import.meta.env.VITE_LOCAL_DEV_AUTH;
  if (flag === "0" || flag === "false") return false;
  // Default on when Clerk publishable key is missing (local Windows).
  if (!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY) return true;
  return flag === "1" || flag === "true";
}

export function readLocalDevSignedIn(): boolean {
  if (typeof window === "undefined") return false;
  if (!import.meta.env.DEV) return false;
  const stored = window.localStorage.getItem(LOCAL_DEV_AUTH_STORAGE_KEY);
  if (stored === "0") return false;
  if (stored === "1") return true;
  return isLocalDevAuthPreferred();
}

export function persistLocalDevSignedIn(signedIn: boolean, token = LOCAL_DEV_AUTH_TOKEN): void {
  window.localStorage.setItem(
    LOCAL_DEV_AUTH_STORAGE_KEY,
    signedIn ? "1" : "0",
  );
  if (signedIn) {
    window.localStorage.setItem(LOCAL_DEV_TOKEN_STORAGE_KEY, token);
  } else {
    window.localStorage.removeItem(LOCAL_DEV_TOKEN_STORAGE_KEY);
  }
}

export function readLocalDevToken(): string | null {
  if (typeof window === "undefined") return null;
  if (!readLocalDevSignedIn()) return null;
  return window.localStorage.getItem(LOCAL_DEV_TOKEN_STORAGE_KEY) || LOCAL_DEV_AUTH_TOKEN;
}

export function attachLocalDevAuthToken(enabled: boolean, token = LOCAL_DEV_AUTH_TOKEN): void {
  if (enabled) {
    setAuthTokenGetter(() => readLocalDevToken() || token);
  } else {
    setAuthTokenGetter(null);
  }
}
