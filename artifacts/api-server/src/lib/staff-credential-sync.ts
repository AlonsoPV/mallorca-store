export class StaffCredentialSyncError extends Error {
  readonly code?: string;

  constructor(code?: string) {
    super("No se pudo sincronizar el acceso con el proveedor de identidad.");
    this.name = "StaffCredentialSyncError";
    this.code = code;
  }
}

type StaffCredentials = {
  userId: string;
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  password?: string | null;
};

type CredentialUpdate = {
  firstName?: string;
  lastName?: string;
  username?: string;
  password?: string;
  skipPasswordChecks?: boolean;
};

export async function syncStaffCredentials(
  params: StaffCredentials,
  clerkAvailable: boolean,
  updateUser: (userId: string, update: CredentialUpdate) => Promise<unknown>,
): Promise<void> {
  if (params.userId.startsWith("user_local_")) return;
  if (!clerkAvailable) throw new StaffCredentialSyncError();

  try {
    await updateUser(params.userId, {
      firstName: params.firstName ?? undefined,
      lastName: params.lastName ?? undefined,
      username: params.username ?? undefined,
      ...(params.password ? { password: params.password, skipPasswordChecks: false } : {}),
    });
  } catch (error) {
    const code = (error as { errors?: Array<{ code?: string }> } | null)?.errors?.[0]?.code;
    throw new StaffCredentialSyncError(code);
  }
}