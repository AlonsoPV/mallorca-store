export function isLocalDevAuthFlagOn(env: NodeJS.ProcessEnv = process.env): boolean {
  const flag = env.LOCAL_DEV_AUTH?.trim().toLowerCase();
  return flag === "1" || flag === "true";
}

export function assertLocalDevAuthAllowed(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV === "production" && isLocalDevAuthFlagOn(env)) {
    throw new Error("LOCAL_DEV_AUTH cannot be enabled when NODE_ENV=production");
  }
}
