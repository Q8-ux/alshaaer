import { z } from "zod";
import {
  adminSessionCookie,
  createAdminSessionToken,
  verifyAdminCredentials,
} from "@/lib/admin-session";

export const runtime = "edge";

const LoginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(256),
});

export async function POST(request: Request) {
  try {
    const credentials = LoginSchema.parse(await request.json());
    const valid = await verifyAdminCredentials(credentials.email, credentials.password);
    if (!valid) {
      await new Promise((resolve) => setTimeout(resolve, 650));
      return Response.json(
        { error: "البريد الإلكتروني أو كلمة المرور غير صحيحة." },
        { status: 401 },
      );
    }

    const response = Response.json({ ok: true });
    response.headers.append(
      "Set-Cookie",
      adminSessionCookie(
        await createAdminSessionToken(credentials.email),
        undefined,
        new URL(request.url).protocol === "https:",
      ),
    );
    return response;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: "أدخل بريدًا إلكترونيًا وكلمة مرور صالحين." }, { status: 400 });
    }
    if (error instanceof Error && error.message === "ADMIN_AUTH_NOT_CONFIGURED") {
      return Response.json({ error: "دخول المدير قيد الإعداد حاليًا." }, { status: 503 });
    }
    console.error("ADMIN_LOGIN_ERROR", error instanceof Error ? error.name : "UnknownError");
    return Response.json({ error: "تعذّر تسجيل الدخول الآن." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const response = Response.json({ ok: true });
  response.headers.append(
    "Set-Cookie",
    adminSessionCookie("", 0, new URL(request.url).protocol === "https:"),
  );
  return response;
}
