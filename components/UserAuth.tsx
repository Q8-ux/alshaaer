"use client";

import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  Feather,
  KeyRound,
  LogIn,
  Mail,
  RefreshCw,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

type Mode = "login" | "register";
type Step = "form" | "verify";

type ApiResult = {
  ok?: boolean;
  error?: string;
  code?: string;
  email?: string;
  maskedEmail?: string;
  emailApproved?: boolean;
  testCode?: string;
};

async function postJson(url: string, body: Record<string, string>) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json()) as ApiResult;
  if (!response.ok) {
    const error = new Error(data.error || "تعذّر إكمال الطلب الآن.") as Error & {
      code?: string;
      data?: ApiResult;
    };
    error.code = data.code;
    error.data = data;
    throw error;
  }
  return data;
}

function safeReturnTo() {
  const value = new URLSearchParams(window.location.search).get("return_to") || "/";
  return value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export default function UserAuth() {
  const [mode, setMode] = useState<Mode>("login");
  const [step, setStep] = useState<Step>("form");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState("");
  const [maskedEmail, setMaskedEmail] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [busy, setBusy] = useState<"login" | "register" | "verify" | "resend" | null>(null);
  const [error, setError] = useState("");
  const [resendSeconds, setResendSeconds] = useState(0);
  const [testCode, setTestCode] = useState<string | null>(null);

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = window.setInterval(
      () => setResendSeconds((seconds) => Math.max(0, seconds - 1)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [resendSeconds]);

  const beginVerification = (data: ApiResult, accountEmail: string) => {
    setRegisteredEmail(data.email || accountEmail.trim().toLowerCase());
    setMaskedEmail(data.maskedEmail || accountEmail);
    setTestCode(data.testCode || null);
    setEmailCode("");
    setResendSeconds(45);
    setStep("verify");
    setError("");
  };

  const resendCodes = async (accountEmail = registeredEmail) => {
    if (!accountEmail || busy === "resend") return;
    setBusy("resend");
    setError("");
    try {
      const data = await postJson("/api/auth/resend", { email: accountEmail });
      beginVerification(data, accountEmail);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "تعذّر إعادة إرسال رمز التفعيل.");
    } finally {
      setBusy(null);
    }
  };

  const submitLogin = async (event: FormEvent) => {
    event.preventDefault();
    setBusy("login");
    setError("");
    try {
      await postJson("/api/auth/session", { email, password });
      window.location.assign(safeReturnTo());
    } catch (requestError) {
      const typedError = requestError as Error & { code?: string };
      if (typedError.code === "ACCOUNT_PENDING") {
        await resendCodes(email);
      } else {
        setError(typedError.message || "تعذّر تسجيل الدخول.");
      }
    } finally {
      setBusy(null);
    }
  };

  const submitRegister = async (event: FormEvent) => {
    event.preventDefault();
    setBusy("register");
    setError("");
    try {
      const data = await postJson("/api/auth/register", {
        displayName,
        email,
        password,
        confirmPassword,
      });
      beginVerification(data, email);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "تعذّر إنشاء الحساب.");
    } finally {
      setBusy(null);
    }
  };

  const submitVerification = async (event: FormEvent) => {
    event.preventDefault();
    setBusy("verify");
    setError("");
    try {
      await postJson("/api/auth/verify", {
        email: registeredEmail,
        emailCode,
      });
      window.location.assign(safeReturnTo());
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "تعذّر تفعيل الحساب.");
    } finally {
      setBusy(null);
    }
  };

  const changeMode = (nextMode: Mode) => {
    setMode(nextMode);
    setStep("form");
    setError("");
  };

  return (
    <main className="user-auth-shell">
      <section className="user-auth-card">
        <div className="user-auth-brand">
          <div className="brand-mark" aria-hidden="true"><Feather size={24} /></div>
          <div><strong>أنت الشاعر</strong><span>قصتك بصوت القصيدة</span></div>
        </div>

        {step === "verify" ? (
          <>
            <div className="auth-heading-icon"><KeyRound size={23} /></div>
            <div className="auth-eyebrow"><ShieldCheck size={16} /> تفعيل آمن للحساب</div>
            <h1>أدخل رمز التحقق</h1>
            <p className="auth-intro">
              أرسلنا رمز التفعيل إلى <strong>{maskedEmail}</strong>.
            </p>

            <form className="user-auth-form" onSubmit={submitVerification}>
              <label>
                <span><Mail size={16} /> رمز البريد الإلكتروني</span>
                <input
                  value={emailCode}
                  onChange={(event) => setEmailCode(event.target.value.replace(/\D/g, "").slice(0, 10))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="••••••"
                  dir="ltr"
                  required
                />
              </label>
              {testCode && (
                <div className="auth-test-codes">للاختبار المحلي: رمز البريد {testCode}</div>
              )}
              {error && <div className="error-box user-auth-error">{error}</div>}
              <button className="primary-button auth-submit" type="submit" disabled={Boolean(busy)}>
                {busy === "verify" ? "جارٍ التحقق…" : <><CheckCircle2 size={18} /> تفعيل الحساب والدخول</>}
              </button>
            </form>

            <div className="verification-actions">
              <button
                type="button"
                onClick={() => void resendCodes()}
                disabled={Boolean(busy) || resendSeconds > 0}
              >
                <RefreshCw size={15} />
                {resendSeconds > 0 ? `إعادة الإرسال بعد ${resendSeconds}ث` : "إعادة إرسال الرمز"}
              </button>
              <button type="button" onClick={() => setStep("form")}><ArrowLeft size={15} /> تعديل البيانات</button>
            </div>
          </>
        ) : (
          <>
            <div className="auth-tabs" role="tablist" aria-label="نوع الدخول">
              <button
                type="button"
                role="tab"
                aria-selected={mode === "login"}
                className={mode === "login" ? "active" : ""}
                onClick={() => changeMode("login")}
              ><LogIn size={17} /> تسجيل الدخول</button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "register"}
                className={mode === "register" ? "active" : ""}
                onClick={() => changeMode("register")}
              ><UserPlus size={17} /> حساب جديد</button>
            </div>

            <div className="auth-eyebrow"><ShieldCheck size={16} /> حسابك وأرشيفك محفوظان</div>
            <h1>{mode === "login" ? "مرحبًا بعودتك" : "أنشئ حسابك"}</h1>
            <p className="auth-intro">
              {mode === "login"
                ? "ادخل إلى قصصك وتسجيلاتك وقصائدك المحفوظة."
                : "سيتحقق النظام من بريدك الإلكتروني قبل تفعيل الحساب."}
            </p>

            <form className="user-auth-form" onSubmit={mode === "login" ? submitLogin : submitRegister}>
              {mode === "register" && (
                <label>
                  <span>الاسم</span>
                  <input
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    autoComplete="name"
                    placeholder="اسمك كما تحب أن يظهر"
                    minLength={2}
                    maxLength={80}
                    required
                  />
                </label>
              )}
              <label>
                <span>البريد الإلكتروني</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  placeholder="name@example.com"
                  dir="ltr"
                  required
                />
              </label>
              <label>
                <span>كلمة المرور</span>
                <div className="password-field">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                    minLength={mode === "register" ? 8 : 1}
                    maxLength={128}
                    required
                  />
                  <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label="إظهار أو إخفاء كلمة المرور">
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
                {mode === "register" && <small>ثمانية أحرف على الأقل وتحتوي على حرف ورقم.</small>}
              </label>
              {mode === "register" && (
                <label>
                  <span>تأكيد كلمة المرور</span>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    autoComplete="new-password"
                    minLength={8}
                    maxLength={128}
                    required
                  />
                </label>
              )}
              {error && <div className="error-box user-auth-error">{error}</div>}
              <button className="primary-button auth-submit" type="submit" disabled={Boolean(busy)}>
                {busy ? "جارٍ العمل…" : mode === "login" ? <><LogIn size={18} /> دخول</> : <><UserPlus size={18} /> إنشاء الحساب وإرسال رمز التفعيل</>}
              </button>
            </form>
          </>
        )}

        <Link className="admin-entry-link" href="/admin/login">دخول مدير التطبيق <ArrowLeft size={14} /></Link>
      </section>
      <aside className="user-auth-aside" aria-label="مزايا الحساب">
        <div className="auth-aside-mark"><Feather size={34} /></div>
        <p>من الحكاية إلى القصيدة</p>
        <h2>كل قصيدة تبدأ بقصة لا تشبه سواها.</h2>
        <ul>
          <li><CheckCircle2 size={18} /> أرشيف خاص لكل مستخدم</li>
          <li><CheckCircle2 size={18} /> حفظ الكتابة والتسجيلات والقصائد</li>
          <li><CheckCircle2 size={18} /> تفعيل آمن بالبريد الإلكتروني</li>
        </ul>
      </aside>
    </main>
  );
}
