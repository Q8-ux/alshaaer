import { cookies } from "next/headers";
import { getAdminSessionIdentity } from "@/lib/admin-session";
import { ArchiveError, ensureUser } from "@/lib/archive-store";
import type { UserRecord } from "@/db/schema";
import {
  createGuestUser,
  createUserSessionToken,
  getUserSession,
  guestAccessEnabled,
  USER_SESSION_COOKIE,
  userSessionCookieOptions,
} from "@/lib/user-auth";

export async function getCurrentAppUser(): Promise<UserRecord | null> {
  const adminIdentity = await getAdminSessionIdentity();
  if (adminIdentity) return ensureUser(adminIdentity);
  return getUserSession();
}

export async function requireAppUser(): Promise<UserRecord> {
  const user = await getCurrentAppUser();
  if (!user && guestAccessEnabled()) {
    const guest = await createGuestUser();
    (await cookies()).set(
      USER_SESSION_COOKIE,
      await createUserSessionToken(guest),
      userSessionCookieOptions(true),
    );
    return guest;
  }
  if (!user) throw new ArchiveError(401, "سجّل الدخول أولًا لحفظ قصتك في أرشيفك.");
  if (user.status === "suspended") {
    throw new ArchiveError(403, "هذا الحساب موقوف حاليًا. تواصل مع مدير التطبيق.");
  }
  return user;
}

export async function requireAdminUser() {
  const identity = await getAdminSessionIdentity();
  if (!identity) {
    throw new ArchiveError(401, "سجّل الدخول ببيانات مدير التطبيق للوصول إلى هذه الصفحة.");
  }
  const user = await ensureUser(identity);
  if (user.status === "suspended") {
    throw new ArchiveError(403, "هذا الحساب موقوف حاليًا.");
  }
  if (user.role !== "admin") {
    throw new ArchiveError(403, "سجّل الدخول ببيانات مدير التطبيق للوصول إلى هذه الصفحة.");
  }
  return user;
}

export function appErrorResponse(error: unknown) {
  if (error instanceof ArchiveError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  const detail = error instanceof Error ? error.message : "";
  if (detail.includes("no such table") || detail.includes("D1 binding")) {
    return Response.json(
      { error: "الأرشيف قيد الإعداد الآن. أعد المحاولة بعد لحظات." },
      { status: 503 },
    );
  }
  return Response.json({ error: "تعذّر الوصول إلى الأرشيف الآن." }, { status: 500 });
}
