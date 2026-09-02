"use client";

import {
  Archive,
  ArrowRight,
  AudioLines,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
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
type AnalysisQuestion = { id: string; question: string };
type Analysis = {
  story_summary?: string;
  emotional_core?: string;
  recommended_purpose?: string;
  recommended_meter?: string;
  meter_reason?: string;
  suggested_tone?: string;
  questions?: AnalysisQuestion[];
};

type ArchiveItem = {
  id: string;
  sourceMode: "text" | "audio";
  storyText: string;
  transcriptionText: string | null;
  requestText: string | null;
  analysis: Analysis | null;
  answers: Record<string, string> | null;
  poem: Poem | null;
  poemTitle: string | null;
  meter: string | null;
  verseCount: number | null;
  state: "received" | "audio_saved" | "analyzed" | "completed" | "failed";
  hasAudio: boolean;
  audioFilename: string | null;
  audioSize: number | null;
  audioDurationSeconds: number | null;
  createdAt: string;
  updatedAt: string;
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
  metrics: {
    users: number;
    archive: number;
    poems: number;
    audio: number;
    written: number;
    failed: number;
  };
  users: ManagedUser[];
  archive: ArchiveItem[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
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

const formatDuration = (value: number | null) => {
  if (!value) return "";
  const seconds = Math.max(0, Math.round(value));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

const stateLabel: Record<ArchiveItem["state"], string> = {
  received: "مستلمة",
  audio_saved: "حُفظ التسجيل",
  analyzed: "تم التحليل",
  completed: "مكتملة",
  failed: "تحتاج مراجعة",
};

const answerLabel = (item: ArchiveItem, key: string) =>
  item.analysis?.questions?.find((question) => question.id === key)?.question || key;

export default function AdminDashboard({ displayName }: { displayName: string }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [tab, setTab] = useState<"archive" | "users" | "activation">("archive");
  const [search, setSearch] = useState("");
  const [archiveSearch, setArchiveSearch] = useState("");
  const [archivePage, setArchivePage] = useState(1);
  const [sourceFilter, setSourceFilter] = useState<"all" | "text" | "audio">("all");
  const [stateFilter, setStateFilter] = useState<
    "all" | "received" | "audio_saved" | "analyzed" | "completed" | "failed"
  >("all");
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
      const query = new URLSearchParams({ page: String(archivePage), pageSize: "50" });
      if (archiveSearch) query.set("search", archiveSearch);
      if (sourceFilter !== "all") query.set("sourceMode", sourceFilter);
      if (stateFilter !== "all") query.set("state", stateFilter);
      const response = await fetch(`/api/admin?${query}`, { cache: "no-store" });
      if (response.status === 401 || response.status === 403) {
        window.location.assign("/control-center/login");
        return;
      }
      const result = (await response.json()) as DashboardData & { error?: string };
      if (!response.ok) throw new Error(result.error || "تعذّر تحميل لوحة الإدارة.");
      if (result.pagination.page !== archivePage) {
        setArchivePage(result.pagination.page);
        return;
      }
      setData(result as DashboardData);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "تعذّر تحميل لوحة الإدارة.");
    }
  }, [archivePage, archiveSearch, sourceFilter, stateFilter]);

  const loadTwilioStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/integrations/twilio", { cache: "no-store" });
      if (response.status === 401 || response.status === 403) {
        window.location.assign("/control-center/login");
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
    window.location.assign("/control-center/login");
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadDashboard();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadDashboard]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadTwilioStatus(), 0);
    return () => window.clearTimeout(timer);
  }, [loadTwilioStatus]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setArchivePage(1);
      setArchiveSearch(search.trim());
    }, 350);
    return () => window.clearTimeout(timer);
  }, [search]);

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
        window.location.assign("/control-center/login");
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
          <h1>مركز بيانات «أنت الشاعر»</h1>
          <p>مرحبًا {displayName}، هنا القصائد وأوصافها وتفريغاتها وملفات شرحها الصوتية.</p>
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
            <div className="metric-card"><FileText /><span>النصوص المكتوبة</span><strong>{data.metrics.written}</strong></div>
            <div className="metric-card"><Feather /><span>القصائد</span><strong>{data.metrics.poems}</strong></div>
            <div className="metric-card"><AudioLines /><span>التسجيلات</span><strong>{data.metrics.audio}</strong></div>
            <div className="metric-card"><CircleAlert /><span>تحتاج مراجعة</span><strong>{data.metrics.failed}</strong></div>
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

            {tab === "archive" && (
              <div className="dashboard-filterbar" aria-label="ترشيح الأرشيف">
                <label>
                  <span>نوع المحتوى</span>
                  <select
                    value={sourceFilter}
                    onChange={(event) => {
                      setArchivePage(1);
                      setSourceFilter(event.target.value as typeof sourceFilter);
                    }}
                  >
                    <option value="all">الكل</option>
                    <option value="text">نص مكتوب</option>
                    <option value="audio">تسجيل صوتي</option>
                  </select>
                </label>
                <label>
                  <span>حالة السجل</span>
                  <select
                    value={stateFilter}
                    onChange={(event) => {
                      setArchivePage(1);
                      setStateFilter(event.target.value as typeof stateFilter);
                    }}
                  >
                    <option value="all">كل الحالات</option>
                    <option value="received">مستلمة</option>
                    <option value="audio_saved">حُفظ التسجيل</option>
                    <option value="analyzed">تم التحليل</option>
                    <option value="completed">مكتملة</option>
                    <option value="failed">تحتاج مراجعة</option>
                  </select>
                </label>
                <span className="dashboard-result-count">{data.pagination.total} سجل مطابق</span>
              </div>
            )}

            {tab === "archive" ? (
              <div className="archive-list">
                {data.archive.length === 0 ? (
                  <div className="empty-state">لا توجد نتائج مطابقة في الأرشيف.</div>
                ) : (
                  data.archive.map((item) => {
                    const answerEntries = Object.entries(item.answers || {}).filter(
                      ([key, value]) => key !== "custom_request" && value.trim(),
                    );
                    return (
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
                            <span className={item.state === "failed" ? "warning" : ""}>
                              {stateLabel[item.state]}
                            </span>
                          </div>
                        </summary>
                        <div className="archive-details">
                          <div className="archive-user-line">
                            <strong>{item.user?.displayName || "مستخدم"}</strong>
                            <span>{item.user?.email}</span>
                            <span>أُنشئ {formatDate(item.createdAt)}</span>
                            <span>آخر تحديث {formatDate(item.updatedAt)}</span>
                          </div>
                          <div className="archive-block">
                            <h3>نص القصة أو وصف القصيدة</h3>
                            <p>{item.storyText || "لم يُحفظ نص واضح بعد."}</p>
                          </div>
                          {item.sourceMode === "audio" && item.transcriptionText && (
                            <div className="archive-block transcript">
                              <h3>التفريغ النصي للتسجيل</h3>
                              <p>{item.transcriptionText}</p>
                            </div>
                          )}
                          {item.analysis && (
                            <div className="archive-analysis-grid">
                              {item.analysis.story_summary && (
                                <div><span>ملخص القصة</span><p>{item.analysis.story_summary}</p></div>
                              )}
                              {item.analysis.emotional_core && (
                                <div><span>المحور الشعوري</span><p>{item.analysis.emotional_core}</p></div>
                              )}
                              {item.analysis.recommended_purpose && (
                                <div><span>الغرض المقترح</span><p>{item.analysis.recommended_purpose}</p></div>
                              )}
                              {item.analysis.suggested_tone && (
                                <div><span>النبرة المقترحة</span><p>{item.analysis.suggested_tone}</p></div>
                              )}
                              {item.analysis.recommended_meter && (
                                <div><span>البحر المقترح</span><p>{item.analysis.recommended_meter}</p></div>
                              )}
                              {item.analysis.meter_reason && (
                                <div><span>سبب الاختيار</span><p>{item.analysis.meter_reason}</p></div>
                              )}
                            </div>
                          )}
                          {item.requestText && (
                            <div className="archive-block compact">
                              <h3>طلب المستخدم للقصيدة</h3>
                              <p>{item.requestText}</p>
                            </div>
                          )}
                          {answerEntries.length > 0 && (
                            <div className="archive-block answers">
                              <h3>تفاصيل وتفضيلات صاحب القصة</h3>
                              <dl>
                                {answerEntries.map(([key, value]) => (
                                  <div key={key}>
                                    <dt>{answerLabel(item, key)}</dt>
                                    <dd>{value}</dd>
                                  </div>
                                ))}
                              </dl>
                            </div>
                          )}
                          {item.hasAudio && (
                            <div className="archive-audio">
                              <div><AudioLines size={18} /> ملف شرح القصة الصوتي</div>
                              <p>
                                {[item.audioFilename, formatDuration(item.audioDurationSeconds), formatBytes(item.audioSize)]
                                  .filter(Boolean)
                                  .join(" • ")}
                              </p>
                              <audio controls preload="none" src={`/api/audio/${item.id}`} />
                            </div>
                          )}
                          {item.poem?.verses?.length ? (
                            <div className="archive-poem">
                              <h3>{item.poem.title || item.poemTitle}</h3>
                              <p className="archive-poem-meta">
                                {[item.meter, item.verseCount ? `${item.verseCount} أبيات` : ""].filter(Boolean).join(" • ")}
                              </p>
                              {item.poem.verses.map((verse, index) => (
                                <div className="archive-verse" key={`${item.id}-${index}`}>
                                  <span>{verse.sadr}</span><i>◆</i><span>{verse.ajz}</span>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </details>
                    );
                  })
                )}
                {data.pagination.totalPages > 1 && (
                  <nav className="archive-pagination" aria-label="صفحات الأرشيف">
                    <button
                      type="button"
                      disabled={archivePage <= 1}
                      onClick={() => setArchivePage((page) => Math.max(1, page - 1))}
                    >
                      <ChevronRight size={17} /> السابق
                    </button>
                    <span>صفحة {data.pagination.page} من {data.pagination.totalPages}</span>
                    <button
                      type="button"
                      disabled={archivePage >= data.pagination.totalPages}
                      onClick={() => setArchivePage((page) => page + 1)}
                    >
                      التالي <ChevronLeft size={17} />
                    </button>
                  </nav>
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
