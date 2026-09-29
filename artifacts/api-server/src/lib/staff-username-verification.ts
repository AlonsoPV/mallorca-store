import { hashPassword, verifyPassword } from "./password.ts";

type StaffLoginUser = {
  email: string;
  role: string;
  passwordHash: string | null;
};

const DUMMY_HASH = hashPassword("not-a-real-staff-account");

export function verifiedStaffEmail(user: StaffLoginUser | undefined, password: string): string | null {
  const validPassword = verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  return user && user.role !== "customer" && validPassword ? user.email : null;
}