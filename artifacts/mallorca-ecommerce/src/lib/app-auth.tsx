import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  useAuth as useClerkAuth,
  useUser as useClerkUser,
  useClerk as useClerkInstance,
} from "@clerk/react";
import {
  attachLocalDevAuthToken,
  LOCAL_DEV_USER,
  persistLocalDevSignedIn,
  readLocalDevSignedIn,
} from "@/lib/local-dev-user";

type AppUser = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  primaryEmailAddress?: { emailAddress: string } | null;
} | null;

export type AppAuthState = {
  isLoaded: boolean;
  isSignedIn: boolean;
  user: AppUser;
  signOut: (options?: { redirectUrl?: string }) => Promise<void>;
  signInLocalDev: () => void;
  addListener:
    | ((listener: (payload: { user: AppUser }) => void) => () => void)
    | null;
};

const AppAuthContext = createContext<AppAuthState | null>(null);

/** Clerk stand-in for localhost when publishable keys are missing. */
export function LocalAuthProvider({ children }: { children: ReactNode }) {
  const [isSignedIn, setIsSignedIn] = useState(readLocalDevSignedIn);

  // Attach before children mount so the first /api/me fetch is authorized.
  attachLocalDevAuthToken(isSignedIn);

  useEffect(() => {
    return () => attachLocalDevAuthToken(false);
  }, []);

  const value = useMemo<AppAuthState>(
    () => ({
      isLoaded: true,
      isSignedIn,
      user: isSignedIn
        ? {
            id: LOCAL_DEV_USER.id,
            firstName: LOCAL_DEV_USER.firstName,
            lastName: LOCAL_DEV_USER.lastName,
            primaryEmailAddress: LOCAL_DEV_USER.primaryEmailAddress,
          }
        : null,
      signInLocalDev: () => {
        persistLocalDevSignedIn(true);
        attachLocalDevAuthToken(true);
        setIsSignedIn(true);
      },
      signOut: async (options) => {
        persistLocalDevSignedIn(false);
        attachLocalDevAuthToken(false);
        setIsSignedIn(false);
        if (options?.redirectUrl) {
          window.location.assign(options.redirectUrl);
        }
      },
      addListener: null,
    }),
    [isSignedIn],
  );

  return (
    <AppAuthContext.Provider value={value}>{children}</AppAuthContext.Provider>
  );
}

/** Bridges Clerk session state into AppAuthContext. */
export function ClerkAuthBridge({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useClerkAuth();
  const { user } = useClerkUser();
  const clerk = useClerkInstance();

  return (
    <AppAuthContext.Provider
      value={{
        isLoaded: !!isLoaded,
        isSignedIn: !!isSignedIn,
        user: user
          ? {
              id: user.id,
              firstName: user.firstName,
              lastName: user.lastName,
              primaryEmailAddress: user.primaryEmailAddress,
            }
          : null,
        signInLocalDev: () => {},
        signOut: (options) => clerk.signOut(options),
        addListener: (listener) =>
          clerk.addListener(({ user: nextUser }) => {
            listener({
              user: nextUser
                ? {
                    id: nextUser.id,
                    firstName: nextUser.firstName,
                    lastName: nextUser.lastName,
                    primaryEmailAddress: nextUser.primaryEmailAddress,
                  }
                : null,
            });
          }),
      }}
    >
      {children}
    </AppAuthContext.Provider>
  );
}

function useAppAuthContext(): AppAuthState {
  const ctx = useContext(AppAuthContext);
  if (!ctx) {
    throw new Error(
      "useAppAuth must be used within LocalAuthProvider or ClerkAuthBridge",
    );
  }
  return ctx;
}

export function useAppAuth(): Pick<AppAuthState, "isLoaded" | "isSignedIn"> {
  const { isLoaded, isSignedIn } = useAppAuthContext();
  return { isLoaded, isSignedIn };
}

export function useAppUser() {
  const { isLoaded, isSignedIn, user } = useAppAuthContext();
  return { isLoaded, isSignedIn, user };
}

export function useAppClerkListener() {
  return useAppAuthContext().addListener;
}

export function useAppSignOut() {
  return useAppAuthContext().signOut;
}

export function useAppSignInLocalDev() {
  return useAppAuthContext().signInLocalDev;
}

export function AuthShow({
  when,
  children,
}: {
  when: "signed-in" | "signed-out";
  children: ReactNode;
}) {
  const { isLoaded, isSignedIn } = useAppAuth();
  if (!isLoaded) return null;
  if (when === "signed-in") return isSignedIn ? <>{children}</> : null;
  return !isSignedIn ? <>{children}</> : null;
}
