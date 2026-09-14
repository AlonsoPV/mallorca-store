import { setAuthTokenGetter } from "@workspace/api-client-react";

export const LOCAL_DEV_AUTH_STORAGE_KEY = "mallorca_local_dev_auth";
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
  const flag = import.meta.env.VITE_LOCAL_DEV_AUTH;
  if (flag === "0" || flag === "false") return false;
  // Default on when Clerk publishable key is missing (local Windows).
  if (!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY) return true;
  return flag === "1" || flag === "true";
}

export function readLocalDevSignedIn(): boolean {
  if (typeof window === "undefined") return false;
  const stored = window.localStorage.getItem(LOCAL_DEV_AUTH_STORAGE_KEY);
  if (stored === "0") return false;
  if (stored === "1") return true;
  return isLocalDevAuthPreferred();
}

export function persistLocalDevSignedIn(signedIn: boolean): void {
  window.localStorage.setItem(
    LOCAL_DEV_AUTH_STORAGE_KEY,
    signedIn ? "1" : "0",
  );
}

export function attachLocalDevAuthToken(enabled: boolean): void {
  if (enabled) {
    setAuthTokenGetter(() => LOCAL_DEV_AUTH_TOKEN);
  } else {
    setAuthTokenGetter(null);
  }
}
