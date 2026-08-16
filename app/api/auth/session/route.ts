import { z } from "zod";
import {
  authenticateUser,
  createUserSessionToken,
  userSessionCookie,
  UserAuthError,
} from "@/lib/user-auth";

export const runtime = "edge";

const LoginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128),
});

export async function POST(request: Request) {
  try {
    const input = LoginSchema.parse(await request.json());
    const user = await authenticateUser(input.email, input.password);
    if (!user) {
      await new Promise((resolve) => setTimeout(resolve, 650));
      return Response.json(
        { error: "البريد الإلكتروني أو كلمة المرور غير صحيحة." },
        { status: 401 },
      );
    }
    const response = Response.json({ ok: true });
    response.headers.append(
      "Set-Cookie",
      userSessionCookie(
        await createUserSessionToken(user),
        undefined,
        new URL(request.url).protocol === "https:",
      ),
    );
    return response;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: "أدخل البريد وكلمة المرور." }, { status: 400 });
    }
    if (error instanceof UserAuthError) {
      return Response.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("USER_LOGIN_ERROR", error instanceof Error ? error.name : "UnknownError");
    return Response.json({ error: "تعذّر تسجيل الدخول الآن." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const response = Response.json({ ok: true });
  response.headers.append(
    "Set-Cookie",
    userSessionCookie("", 0, new URL(request.url).protocol === "https:"),
  );
  return response;
}
