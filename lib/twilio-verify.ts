import { getRuntimeStringBinding } from "@/lib/runtime-bindings";
import { getTwilioVerifyCredentials } from "@/lib/twilio-settings";

export class VerificationProviderError extends Error {
  constructor(
    message: string,
    public code = "VERIFICATION_PROVIDER_ERROR",
  ) {
    super(message);
  }
}

const TEST_EMAIL_CODE = "111111";

function isLocalTest(request: Request) {
  const hostname = new URL(request.url).hostname;
  return (
    ["terminal.local", "127.0.0.1", "localhost"].includes(hostname) &&
    getRuntimeStringBinding("AUTH_TEST_MODE") === "true"
  );
}

async function config() {
  const credentials = await getTwilioVerifyCredentials();
  if (!credentials) {
    throw new VerificationProviderError(
      "خدمة تفعيل الحسابات بالبريد الإلكتروني قيد الإعداد الآن.",
      "VERIFICATION_NOT_CONFIGURED",
    );
  }
  return credentials;
}

async function twilioRequest(path: string, body: URLSearchParams) {
  const { username, password, serviceSid } = await config();
  const response = await fetch(`https://verify.twilio.com/v2/Services/${serviceSid}/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${username}:${password}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new VerificationProviderError(
      "تعذّر إرسال أو فحص رمز التفعيل الآن. أعد المحاولة بعد قليل.",
    );
  }
  return (await response.json()) as { status?: string };
}

async function startVerification(to: string, channel: "email" | "sms") {
  const response = await twilioRequest(
    "Verifications",
    new URLSearchParams({ To: to, Channel: channel }),
  );
  if (!response || response.status !== "pending") {
    throw new VerificationProviderError("تعذّر إرسال رمز التفعيل الآن.");
  }
}

async function checkVerification(to: string, code: string) {
  const response = await twilioRequest(
    "VerificationCheck",
    new URLSearchParams({ To: to, Code: code }),
  );
  return response?.status === "approved";
}

export async function sendEmailVerification(request: Request, email: string) {
  if (isLocalTest(request)) {
    return { testCode: TEST_EMAIL_CODE };
  }
  await startVerification(email, "email");
  return {};
}

export async function checkEmailVerification(request: Request, input: { email: string; emailCode: string }) {
  if (isLocalTest(request)) {
    return input.emailCode === TEST_EMAIL_CODE;
  }
  return checkVerification(input.email, input.emailCode);
}
