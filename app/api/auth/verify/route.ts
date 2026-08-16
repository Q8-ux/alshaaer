import { z } from "zod";
import {
  activateVerifiedUser,
  createUserSessionToken,
  findPendingUser,
  normalizeEmail,
  userSessionCookie,
  UserAuthError,
} from "@/lib/user-auth";
import { checkEmailVerification, VerificationProviderError } from "@/lib/twilio-verify";

export const runtime = "edge";

const VerifySchema = z.object({
  email: z.string().email().max(254),
  emailCode: z.string().trim().regex(/^\d{4,10}$/),
});

export async function POST(request: Request) {
  try {
    const input = VerifySchema.parse(await request.json());
    const user = await findPendingUser(input.email);
    if (!user || user.status !== "pending") {
      return Response.json({ error: "طلب التفعيل غير موجود أو انتهى." }, { status: 404 });
    }
    const emailApproved = await checkEmailVerification(request, {
      email: normalizeEmail(user.email),
      emailCode: input.emailCode,
    });
    if (!emailApproved) {
      return Response.json(
        {
          error: "تحقق من رمز البريد الإلكتروني ثم حاول مرة أخرى.",
          emailApproved,
        },
        { status: 400 },
      );
    }

    const activeUser = await activateVerifiedUser(user.id);
    const response = Response.json({ ok: true });
    response.headers.append(
      "Set-Cookie",
      userSessionCookie(
        await createUserSessionToken(activeUser),
        undefined,
        new URL(request.url).protocol === "https:",
      ),
    );
    return response;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: "أدخل رمزي التفعيل بالأرقام." }, { status: 400 });
    }
    if (error instanceof UserAuthError) {
      return Response.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof VerificationProviderError) {
      return Response.json({ error: error.message, code: error.code }, { status: 503 });
    }
    console.error("USER_VERIFY_ERROR", error instanceof Error ? error.name : "UnknownError");
    return Response.json({ error: "تعذّر تفعيل الحساب الآن." }, { status: 500 });
  }
}
