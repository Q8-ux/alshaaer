"use client";

import {
  Archive,
  ArrowRight,
  AudioLines,
  Feather,
  FileText,
  KeyRound,
  LogOut,
  MailCheck,
  RefreshCw,
  Search,
  ShieldCheck,
  UserCheck,
  Users,
  UserX,
} from "lucide-react";
import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Verse = { sadr: string; ajz: string };
type Poem = { title?: string; meter?: string; verses?: Verse[] };

type ArchiveItem = {
  id: string;
  sourceMode: "text" | "audio";
  storyText: string;
  requestText: string | null;
  poem: Poem | null;
  poemTitle: string | null;
  meter: string | null;
  verseCount: number | null;
  state: string;
  hasAudio: boolean;
  audioFilename: string | null;
  audioSize: number | null;
  createdAt: string;
  user: { id: string; email: string; displayName: string } | null;
};

type ManagedUser = {
  id: string;
  email: string;
  displayName: string;
  role: "admin" | "user";
  status: "pending" | "active" | "suspended";
  createdAt: string;
  lastSeenAt: string;
  archiveCount: number;
};

type DashboardData = {
  metrics: { users: number; archive: number; poems: number; audio: number };
  users: ManagedUser[];
  archive: ArchiveItem[];
};

type TwilioConfigurationStatus = {
  configured: boolean;
  source: "environment" | "secure_storage" | null;
};

const formatDate = (value: string) => {
  try {
    return new Intl.DateTimeFormat("ar-KW", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
};

const formatBytes = (value: number | null) => {
  if (!value) return "";
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} ك.ب`;
  return `${(value / (1024 * 1024)).toFixed(1)} م.ب`;
};

export default function AdminDashboard({ displayName }: { displayName: string }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [tab, setTab] = useState<"archive" | "users" | "activation">("archive");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [busyUser, setBusyUser] = useState<string | null>(null);
  const [twilioStatus, setTwilioStatus] = useState<TwilioConfigurationStatus | null>(null);
  const [twilioNotice, setTwilioNotice] = useState("");
  const [savingTwilio, setSavingTwilio] = useState(false);
  const [twilioForm, setTwilioForm] = useState({
    accountSid: "",
    authToken: "",
    serviceSid: "",
  });

  const loadDashboard = useCallback(async () => {
    setError("");
    try {
      const response = await fetch("/api/admin", { cache: "no-store" });
      if (response.status === 401 || response.status === 403) {
        window.location.assign("/admin/login");
        return;
      }
      const result = (await response.json()) as DashboardData & { error?: string };
      if (!response.ok) throw new Error(result.error || "تعذّر تحميل لوحة الإدارة.");
      setData(result as DashboardData);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "تعذّر تحميل لوحة الإدارة.");
    }
  }, []);

  const loadTwilioStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/integrations/twilio", { cache: "no-store" });
      if (response.status === 401 || response.status === 403) {
        window.location.assign("/admin/login");
        return;
      }
      const result = (await response.json()) as TwilioConfigurationStatus & { error?: string };
      if (!response.ok) throw new Error(result.error || "تعذّر قراءة إعداد التفعيل بالبريد.");
      setTwilioStatus(result);
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : "تعذّر قراءة إعداد التفعيل بالبريد.");
    }
  }, []);

  const logout = async () => {
    await fetch("/api/admin/session", { method: "DELETE" }).catch(() => undefined);
    window.location.assign("/admin/login");
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadDashboard();
      void loadTwilioStatus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadDashboard, loadTwilioStatus]);

  const updateUser = async (
    userId: string,
    change: { status?: "active" | "suspended"; role?: "admin" | "user" },
  ) => {
    setBusyUser(userId);
    setError("");
    try {
      const response = await fetch("/api/admin", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, ...change }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "تعذّر تحديث المستخدم.");
      await loadDashboard();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "تعذّر تحديث المستخدم.");
    } finally {
      setBusyUser(null);
    }
  };

  const saveTwilioConfiguration = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSavingTwilio(true);
    setError("");
    setTwilioNotice("");
    try {
      const response = await fetch("/api/admin/integrations/twilio", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(twilioForm),
      });
      if (response.status === 401 || response.status === 403) {
        window.location.assign("/admin/login");
        return;
      }
      const result = (await response.json()) as TwilioConfigurationStatus & { error?: string };
      if (!response.ok) throw new Error(result.error || "تعذّر حفظ إعداد Twilio.");
      setTwilioStatus(result);
      setTwilioForm({ accountSid: "", authToken: "", serviceSid: "" });
      setTwilioNotice("تم حفظ الإعداد المشفّر. أنشئ الآن حساب اختبار لتصل رسالة الرمز.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "تعذّر حفظ إعداد Twilio.");
    } finally {
      setSavingTwilio(false);
    }
  };

  const filteredArchive = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return data?.archive || [];
    return (data?.archive || []).filter((item) =>
      [
        item.storyText,
        item.poemTitle || "",
        item.meter || "",
        item.user?.displayName || "",
        item.user?.email || "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [data, search]);

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return data?.users || [];
    return (data?.users || []).filter((user) =>
      `${user.displayName} ${user.email}`.toLowerCase().includes(query),
    );
  }, [data, search]);

  return (
    <main className="dashboard-shell">
      <header className="dashboard-topbar">
        <div>
          <div className="dashboard-kicker"><ShieldCheck size={17} /> لوحة المدير</div>
          <h1>أرشيف «أنت الشاعر»</h1>
          <p>مرحبًا {displayName}، هنا القصص والتسجيلات والقصائد وحسابات المستخدمين.</p>
        </div>
        <div className="dashboard-top-actions">
          <button type="button" className="secondary-button" onClick={() => void loadDashboard()}>
            <RefreshCw size={16} /> تحديث
          </button>
          <button type="button" className="secondary-button" onClick={() => void logout()}>
            <LogOut size={16} /> تسجيل الخروج
          </button>
          <Link className="secondary-button" href="/">
            العودة للتطبيق <ArrowRight size={16} />
          </Link>
        </div>
      </header>

      {error && <div className="error-box dashboard-error">{error}</div>}

      {!data ? (
        <div className="dashboard-loading">جارٍ تحميل الأرشيف…</div>
      ) : (
        <>
          <section className="metric-grid" aria-label="ملخص الأرشيف">
            <div className="metric-card"><Users /><span>المستخدمون</span><strong>{data.metrics.users}</strong></div>
            <div className="metric-card"><Archive /><span>كل السجلات</span><strong>{data.metrics.archive}</strong></div>
            <div className="metric-card"><Feather /><span>القصائد</span><strong>{data.metrics.poems}</strong></div>
            <div className="metric-card"><AudioLines /><span>التسجيلات</span><strong>{data.metrics.audio}</strong></div>
          </section>

          <section className="dashboard-card">
            <div className="dashboard-controls">
              <div className="dashboard-tabs" role="tablist" aria-label="أقسام لوحة الإدارة">
                <button
                  type="button"
                  className={tab === "archive" ? "active" : ""}
                  onClick={() => setTab("archive")}
                >
                  <Archive size={17} /> الأرشيف الكامل
                </button>
                <button
                  type="button"
                  className={tab === "users" ? "active" : ""}
                  onClick={() => setTab("users")}
                >
                  <Users size={17} /> إدارة المستخدمين
                </button>
                <button
                  type="button"
                  className={tab === "activation" ? "active" : ""}
                  onClick={() => setTab("activation")}
                >
                  <MailCheck size={17} /> تفعيل البريد
                </button>
              </div>
              {tab !== "activation" && (
                <label className="dashboard-search">
                  <Search size={18} />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={tab === "archive" ? "ابحث في القصص والقصائد أو باسم المستخدم" : "ابحث بالاسم أو البريد"}
                  />
                </label>
              )}
            </div>

            {tab === "archive" ? (
              <div className="archive-list">
                {filteredArchive.length === 0 ? (
                  <div className="empty-state">لا توجد نتائج مطابقة في الأرشيف.</div>
                ) : (
                  filteredArchive.map((item) => (
                    <details className="archive-item" key={item.id}>
                      <summary>
                        <div className="archive-icon">
                          {item.hasAudio ? <AudioLines size={19} /> : <FileText size={19} />}
                        </div>
                        <div className="archive-summary-copy">
                          <strong>{item.poemTitle || "قصة قيد التحويل إلى قصيدة"}</strong>
                          <span>{item.user?.displayName || "مستخدم"} • {formatDate(item.createdAt)}</span>
                        </div>
                        <div className="archive-badges">
                          {item.meter && <span>{item.meter}</span>}
                          <span>{item.hasAudio ? "صوت" : "كتابة"}</span>
                          <span>{item.state === "completed" ? "مكتملة" : "قيد المعالجة"}</span>
                        </div>
                      </summary>
                      <div className="archive-details">
                        <div className="archive-user-line">
                          <strong>{item.user?.displayName || "مستخدم"}</strong>
                          <span>{item.user?.email}</span>
                        </div>
                        <div className="archive-block">
                          <h3>القصة الأصلية</h3>
                          <p>{item.storyText || "لم يُحفظ نص واضح بعد."}</p>
                        </div>
                        {item.requestText && (
                          <div className="archive-block compact">
                            <h3>طلب المستخدم للقصيدة</h3>
                            <p>{item.requestText}</p>
                          </div>
                        )}
                        {item.hasAudio && (
                          <div className="archive-audio">
                            <div><AudioLines size={18} /> التسجيل الأصلي {formatBytes(item.audioSize)}</div>
                            <audio controls preload="none" src={`/api/audio/${item.id}`} />
                          </div>
                        )}
                        {item.poem?.verses?.length ? (
                          <div className="archive-poem">
                            <h3>{item.poem.title || item.poemTitle}</h3>
                            {item.poem.verses.map((verse, index) => (
                              <div className="archive-verse" key={`${item.id}-${index}`}>
                                <span>{verse.sadr}</span><i>◆</i><span>{verse.ajz}</span>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </details>
                  ))
                )}
              </div>
            ) : tab === "users" ? (
              <div className="users-table-wrap">
                <table className="users-table">
                  <thead>
                    <tr><th>المستخدم</th><th>الصلاحية</th><th>الحالة</th><th>الأرشيف</th><th>آخر دخول</th><th>الإدارة</th></tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((user) => (
                      <tr key={user.id}>
                        <td data-label="المستخدم"><strong>{user.displayName}</strong><span>{user.email}</span></td>
                        <td data-label="الصلاحية"><span className={`role-pill ${user.role}`}>{user.role === "admin" ? "مدير" : "مستخدم"}</span></td>
                        <td data-label="الحالة"><span className={`status-pill ${user.status}`}>{user.status === "active" ? "نشط" : user.status === "pending" ? "بانتظار التفعيل" : "موقوف"}</span></td>
                        <td data-label="الأرشيف">{user.archiveCount}</td>
                        <td data-label="آخر دخول">{formatDate(user.lastSeenAt)}</td>
                        <td data-label="الإدارة">
                          <div className="user-actions">
                            {user.role === "admin" ? (
                              <span className="protected-admin"><ShieldCheck size={15} /> مدير محمي</span>
                            ) : user.status === "pending" ? (
                              <span className="protected-admin">بانتظار تأكيد البريد الإلكتروني</span>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  disabled={busyUser === user.id}
                                  onClick={() => void updateUser(user.id, { status: user.status === "active" ? "suspended" : "active" })}
                                >
                                  {user.status === "active" ? <UserX size={15} /> : <UserCheck size={15} />}
                                  {user.status === "active" ? "إيقاف" : "تفعيل"}
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <section className="integration-panel" aria-label="إعداد تفعيل البريد الإلكتروني">
                <div className="integration-panel-head">
                  <div className="integration-icon"><KeyRound size={20} /></div>
                  <div>
                    <h2>ربط Twilio لتفعيل البريد</h2>
                    <p>لا تظهر مفاتيحك بعد الحفظ، وتُخزَّن مشفّرة داخل إعدادات التطبيق.</p>
                  </div>
                </div>

                <div className={`integration-status ${twilioStatus?.configured ? "ready" : "pending"}`}>
                  <MailCheck size={18} />
                  <div>
                    <strong>
                      {twilioStatus?.configured
                        ? "تفعيل البريد مرتبط وجاهز للاختبار"
                        : twilioStatus
                          ? "لم يُربط تفعيل البريد بعد"
                          : "جارٍ فحص إعداد التفعيل…"}
                    </strong>
                    {twilioStatus?.configured && (
                      <span>
                        {twilioStatus.source === "environment"
                          ? "مصدر الإعداد: إعدادات الاستضافة المحمية."
                          : "مصدر الإعداد: حفظ مشفّر في قاعدة بيانات التطبيق."}
                      </span>
                    )}
                  </div>
                </div>

                <form className="integration-form" onSubmit={saveTwilioConfiguration}>
                  <label>
                    <span>Twilio Account SID</span>
                    <input
                      type="text"
                      dir="ltr"
                      autoComplete="off"
                      spellCheck={false}
                      value={twilioForm.accountSid}
                      onChange={(event) => setTwilioForm((current) => ({ ...current, accountSid: event.target.value }))}
                      placeholder="AC…"
                      required
                    />
                  </label>
                  <label>
                    <span>Twilio Auth Token</span>
                    <input
                      type="password"
                      dir="ltr"
                      autoComplete="new-password"
                      spellCheck={false}
                      value={twilioForm.authToken}
                      onChange={(event) => setTwilioForm((current) => ({ ...current, authToken: event.target.value }))}
                      placeholder="لن يظهر بعد الحفظ"
                      required
                    />
                  </label>
                  <label>
                    <span>Verify Service SID</span>
                    <input
                      type="text"
                      dir="ltr"
                      autoComplete="off"
                      spellCheck={false}
                      value={twilioForm.serviceSid}
                      onChange={(event) => setTwilioForm((current) => ({ ...current, serviceSid: event.target.value }))}
                      placeholder="VA…"
                      required
                    />
                  </label>

                  <div className="integration-help">
                    من Twilio افتح <strong>Verify → Services</strong> ثم انسخ Account SID وAuth Token وVerify Service SID.
                    ويجب أن يكون Email Integration في Twilio مرتبطًا بالخدمة قبل إرسال الرموز.
                  </div>

                  {twilioNotice && <div className="integration-notice">{twilioNotice}</div>}

                  <button className="primary-button integration-submit" type="submit" disabled={savingTwilio}>
                    <KeyRound size={18} /> {savingTwilio ? "جارٍ الحفظ الآمن…" : "حفظ إعداد Twilio"}
                  </button>
                </form>
              </section>
            )}
          </section>
          <p className="retention-note">يُحتفظ بالمحتوى في الأرشيف الخاص، ولا تظهر بيانات أي مستخدم لمستخدم آخر.</p>
        </>
      )}
    </main>
  );
}
