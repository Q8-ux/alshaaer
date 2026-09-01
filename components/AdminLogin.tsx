"use client";

import { ArrowRight, Eye, EyeOff, Feather, LogIn, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { FormEvent, useState } from "react";

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "تعذّر تسجيل الدخول.");
      window.location.assign("/control-center");
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "تعذّر تسجيل الدخول.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="admin-login-shell">
      <section className="admin-login-card">
        <div className="admin-login-brand" aria-hidden="true">
          <Feather size={27} />
        </div>
        <div className="dashboard-kicker"><ShieldCheck size={17} /> دخول آمن</div>
        <h1>لوحة إدارة «أنت الشاعر»</h1>
        <p>أدخل بيانات مدير التطبيق للوصول إلى الأرشيف والمستخدمين.</p>

        <form className="admin-login-form" onSubmit={submit}>
          <label>
            <span>البريد الإلكتروني</span>
            <input
              type="email"
              dir="ltr"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
              required
            />
          </label>
          <label>
            <span>كلمة المرور</span>
            <div className="password-field">
              <input
                type={showPassword ? "text" : "password"}
                dir="ltr"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </label>

          {error && <div className="error-box admin-login-error">{error}</div>}

          <button className="primary-button admin-login-submit" type="submit" disabled={busy}>
            <LogIn size={18} /> {busy ? "جارٍ التحقق…" : "دخول لوحة الإدارة"}
          </button>
        </form>

        <Link className="admin-login-back" href="/">
          العودة إلى التطبيق <ArrowRight size={16} />
        </Link>
      </section>
    </main>
  );
}
