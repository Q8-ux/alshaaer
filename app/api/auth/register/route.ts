import { z } from "zod";
import {
  maskEmail,
  registerPendingUser,
  UserAuthError,
} from "@/lib/user-auth";
import { sendEmailVerification, VerificationProviderError } from "@/lib/twilio-verify";

export const runtime = "edge";

const RegisterSchema = z
  .object({
    displayName: z.string().trim().min(2).max(80),
    email: z.string().trim().email().max(254),
    password: z.string().min(8).max(128),
    confirmPassword: z.string().min(8).max(128),
  })
  .refine((value) => /\p{L}/u.test(value.password) && /\d/.test(value.password), {
    message: "كلمة المرور يجب أن تحتوي على حرف ورقم على الأقل.",
    path: ["password"],
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "تأكيد كلمة المرور غير مطابق.",
    path: ["confirmPassword"],
  });

export async function POST(request: Request) {
  try {
    const input = RegisterSchema.parse(await request.json());
    const user = await registerPendingUser({
      displayName: input.displayName,
      email: input.email,
      password: input.password,
    });
    const verification = await sendEmailVerification(request, user.email);
    return Response.json({
      ok: true,
      email: user.email,
      maskedEmail: maskEmail(user.email),
      ...verification,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: error.issues[0]?.message || "راجع بيانات إنشاء الحساب." },
        { status: 400 },
      );
    }
    if (error instanceof UserAuthError) {
      return Response.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof VerificationProviderError) {
      return Response.json({ error: error.message, code: error.code }, { status: 503 });
    }
    console.error("USER_REGISTER_ERROR", error instanceof Error ? error.name : "UnknownError");
    return Response.json({ error: "تعذّر إنشاء الحساب الآن." }, { status: 500 });
  }
}
