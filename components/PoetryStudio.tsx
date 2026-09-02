"use client";

import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  AudioLines,
  BookOpen,
  Brain,
  Check,
  Copy,
  Feather,
  Library,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  MessageCircleQuestion,
  Mic,
  PenLine,
  RefreshCw,
  Scale,
  ScanText,
  ShieldCheck,
  Sparkles,
  Square,
  UserRound,
  WandSparkles,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Question = {
  id: string;
  question: string;
  options: string[];
  allow_custom: boolean;
};

type Analysis = {
  story_summary: string;
  emotional_core: string;
  recommended_purpose: string;
  recommended_meter: string;
  meter_reason: string;
  suggested_tone: string;
  questions: Question[];
  submission_id?: string;
};

type Verse = {
  sadr: string;
  ajz: string;
  meaning_note: string;
  rhythm_note: string;
};

type Poem = {
  title: string;
  meter: string;
  meter_reason: string;
  dialect: string;
  tone: string;
  sadr_rhyme: string;
  ajz_rhyme: string;
  rawi: string;
  verses: Verse[];
  fidelity_note: string;
  meter_check: string;
  rhyme_check: string;
  originality_check: string;
  performance_note: string;
  submission_id?: string;
};

type CurrentUser = {
  id: string;
  displayName: string;
  email: string;
  role: "admin" | "user";
  isGuest: boolean;
};

type SavedDraft = {
  version: 1;
  story: string;
  submissionId: string | null;
  analysis: Analysis | null;
  analysisStory: string;
  answers: Record<string, string>;
  poetryRequest: string;
  poem: Poem | null;
  savedAt: number;
};

const DRAFT_STORAGE_KEY = "ant_alshaer_draft_v1";
const DRAFT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const GUEST_DRAFT_STORAGE_KEY = `${DRAFT_STORAGE_KEY}:guest-device`;

const draftStorageKeyFor = (user: CurrentUser) =>
  user.isGuest ? GUEST_DRAFT_STORAGE_KEY : `${DRAFT_STORAGE_KEY}:${user.id}`;

const loadSavedDraft = (storageKey: string) => {
  try {
    const raw = window.localStorage.getItem(storageKey);
    const saved = raw ? (JSON.parse(raw) as SavedDraft) : null;
    const valid = Boolean(
      saved &&
        saved.version === 1 &&
        typeof saved.story === "string" &&
        Number.isFinite(saved.savedAt) &&
        Date.now() - saved.savedAt <= DRAFT_TTL_MS,
    );
    if (valid && saved) return saved;
    if (raw) window.localStorage.removeItem(storageKey);
  } catch {
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // Storage availability is optional.
    }
  }
  return null;
};

const LoadingDots = () => (
  <span className="loading-dots" aria-label="جارٍ العمل">
    <i />
    <i />
    <i />
  </span>
);

const formatDuration = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

const exampleStory =
  "اكتب قصتك كما حدثت، من غير ترتيب رسمي. مثلاً: كنت أظن أن المسافة تنتهي باللقاء، لكن كلما اقترب الموعد ظهرت ظروف جديدة. أريد أبياتًا فيها عتب هادئ وكرامة، وتنتهي بأمل لا يبدو ضعيفًا.";

const examplePoetryRequest =
  "مثلاً: أريدها وصية لابني بلهجة كويتية، من ثمانية أبيات، فيها حكمة وتحذير من غدر الزمان، وتكون الخاتمة قوية وغير مقطوعة.";

const fetchWithTimeout = async (
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs = 120_000,
) => {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
};

const requestErrorMessage = (requestError: unknown, fallback: string) => {
  if (requestError instanceof DOMException && requestError.name === "AbortError") {
    return "استغرق الطلب وقتًا أطول من المتوقع. قصتك محفوظة؛ أعد المحاولة من المرحلة نفسها.";
  }
  if (
    requestError instanceof TypeError ||
    (requestError instanceof Error &&
      /failed to fetch|load failed|networkerror|network request failed/i.test(requestError.message))
  ) {
    return "انقطع الاتصال أثناء إرسال الطلب. قصتك محفوظة هنا؛ تحقق من الشبكة ثم اضغط مرة أخرى.";
  }
  return requestError instanceof Error ? requestError.message : fallback;
};

export default function PoetryStudio() {
  const [inputMode, setInputMode] = useState<"text" | "voice">("text");
  const [story, setStory] = useState("");
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [analysisStory, setAnalysisStory] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [poetryRequest, setPoetryRequest] = useState("");
  const [poem, setPoem] = useState<Poem | null>(null);
  const [busy, setBusy] = useState<"analyze" | "generate" | "transcribe" | "revise" | null>(null);
  const [error, setError] = useState("");
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [copied, setCopied] = useState(false);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordStartedAtRef = useRef<number | null>(null);
  const writingRef = useRef<HTMLDivElement | null>(null);
  const resultRef = useRef<HTMLDivElement | null>(null);
  const storyRevisionRef = useRef(0);
  const draftStorageKey = currentUser ? draftStorageKeyFor(currentUser) : null;

  useEffect(() => {
    if (!draftReady || !draftStorageKey) return;
    if (!story.trim() && !analysis && !poem) {
      try {
        window.localStorage.removeItem(draftStorageKey);
      } catch {
        // Storage availability is optional.
      }
      return;
    }
    const timer = window.setTimeout(() => {
      const savedAt = Date.now();
      const draft: SavedDraft = {
        version: 1,
        story,
        submissionId,
        analysis,
        analysisStory,
        answers,
        poetryRequest,
        poem,
        savedAt,
      };
      try {
        window.localStorage.setItem(draftStorageKey, JSON.stringify(draft));
        setDraftSavedAt(savedAt);
      } catch {
        // Private browsing and storage quotas must not block the writing flow.
      }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [analysis, analysisStory, answers, draftReady, draftStorageKey, poem, poetryRequest, story, submissionId]);

  useEffect(() => {
    let active = true;
    fetch("/api/me", { cache: "no-store" })
      .then(async (response) => (response.ok ? ((await response.json()) as CurrentUser) : null))
      .then((user) => {
        if (!active) return;
        if (user) {
          setCurrentUser(user);
          const saved = loadSavedDraft(draftStorageKeyFor(user));
          if (saved) {
            setStory(saved.story);
            setSubmissionId(saved.submissionId || null);
            setAnalysis(saved.analysis || null);
            setAnalysisStory(saved.analysisStory || (saved.analysis ? saved.story.trim() : ""));
            setAnswers(saved.answers || {});
            setPoetryRequest(saved.poetryRequest || "");
            setPoem(saved.poem || null);
            setDraftSavedAt(saved.savedAt);
            setDraftRestored(Boolean(saved.story.trim()));
          }
        }
        setDraftReady(true);
      })
      .catch(() => {
        if (active) setDraftReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!recording) return;
    const id = window.setInterval(() => setRecordSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(id);
  }, [recording]);

  useEffect(() => {
    if (analysis && !poem) {
      window.setTimeout(
        () => writingRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
        140,
      );
    }
  }, [analysis, poem]);

  useEffect(() => {
    if (poem) {
      window.setTimeout(
        () => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
        120,
      );
    }
  }, [poem]);

  const apiRequest = async (payload: Record<string, unknown>) => {
    const response = await fetchWithTimeout("/api/poetry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await response.json()) as { error?: string; [key: string]: unknown };
    if (!response.ok) {
      throw new Error(data.error || "تعذّر إكمال الطلب الآن.");
    }
    return data;
  };

  const analyzeStory = async () => {
    if (story.trim().length < 24) {
      setError("اكتب تفاصيل أكثر قليلًا حتى نفهم المعنى الذي تريد تحويله إلى شعر.");
      return;
    }
    const storyRevision = storyRevisionRef.current;
    setBusy("analyze");
    setError("");
    setPoem(null);
    try {
      const data = (await apiRequest({
        mode: "analyze",
        story: story.trim(),
        submission_id: submissionId || undefined,
      })) as Analysis;
      if (storyRevision !== storyRevisionRef.current) return;
      setAnalysis(data);
      setAnalysisStory(story.trim());
      if (data.submission_id) setSubmissionId(data.submission_id);
      setAnswers(
        Object.fromEntries(data.questions.map((question) => [question.id, question.options[0] || ""])),
      );
      setPoetryRequest("");
    } catch (requestError) {
      setError(requestErrorMessage(requestError, "حدث خطأ غير متوقع."));
    } finally {
      setBusy(null);
    }
  };

  const generatePoem = async () => {
    if (!analysis) return;
    if (analysisStory !== story.trim()) {
      setError("تغيّرت القصة بعد التحليل. حلّل النسخة الحالية أولًا حتى لا تُبنى القصيدة على فهم قديم.");
      return;
    }
    const storyRevision = storyRevisionRef.current;
    setBusy("generate");
    setError("");
    try {
      const generationAnswers = poetryRequest.trim()
        ? { ...answers, custom_request: poetryRequest.trim() }
        : answers;
      const data = (await apiRequest({
        mode: "generate",
        submission_id: submissionId || undefined,
        story: story.trim(),
        analysis,
        answers: generationAnswers,
      })) as Poem;
      if (storyRevision !== storyRevisionRef.current) return;
      setPoem(data);
      if (data.submission_id) setSubmissionId(data.submission_id);
    } catch (requestError) {
      setError(requestErrorMessage(requestError, "تعذّر توليد الأبيات."));
    } finally {
      setBusy(null);
    }
  };

  const revisePoem = async (instruction: string) => {
    if (!analysis || !poem) return;
    const storyRevision = storyRevisionRef.current;
    setBusy("revise");
    setError("");
    try {
      const revisionAnswers = poetryRequest.trim()
        ? { ...answers, custom_request: poetryRequest.trim() }
        : answers;
      const data = (await apiRequest({
        mode: "revise",
        submission_id: submissionId || undefined,
        story: story.trim(),
        analysis,
        answers: revisionAnswers,
        current_poem: poem,
        revision_instruction: instruction,
      })) as Poem;
      if (storyRevision !== storyRevisionRef.current) return;
      setPoem(data);
      if (data.submission_id) setSubmissionId(data.submission_id);
    } catch (requestError) {
      setError(requestErrorMessage(requestError, "تعذّر تعديل الأبيات."));
    } finally {
      setBusy(null);
    }
  };

  const transcribe = async (blob: Blob, durationSeconds: number) => {
    setBusy("transcribe");
    setError("");
    const formData = new FormData();
    formData.append("audio", blob, "story.webm");
    formData.append("duration_seconds", String(durationSeconds));
    try {
      const response = await fetchWithTimeout(
        "/api/transcribe",
        { method: "POST", body: formData },
        90_000,
      );
      const data = (await response.json()) as {
        error?: string;
        text?: string;
        submission_id?: string;
      };
      if (!response.ok) throw new Error(data.error || "تعذّر تفريغ التسجيل.");
      storyRevisionRef.current += 1;
      setStory(data.text || "");
      setAnalysis(null);
      setAnalysisStory("");
      setAnswers({});
      setPoetryRequest("");
      setPoem(null);
      if (data.submission_id) setSubmissionId(data.submission_id);
      setInputMode("text");
    } catch (requestError) {
      setError(requestErrorMessage(requestError, "تعذّر تفريغ التسجيل."));
    } finally {
      setBusy(null);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  };

  const startRecording = async () => {
    if (recording) {
      stopRecording();
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("المتصفح الحالي لا يدعم التسجيل الصوتي. يمكنك كتابة القصة مباشرة.");
      return;
    }

    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      streamRef.current = stream;
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      setRecordSeconds(0);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const audioBlob = new Blob(chunksRef.current, { type: recorder.mimeType });
        const durationSeconds = recordStartedAtRef.current
          ? Math.max(1, Math.round((Date.now() - recordStartedAtRef.current) / 1000))
          : recordSeconds;
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recordStartedAtRef.current = null;
        setRecording(false);
        if (audioBlob.size > 0) void transcribe(audioBlob, durationSeconds);
      };
      recorder.start();
      recordStartedAtRef.current = Date.now();
      setRecording(true);
    } catch {
      setError("لم نتمكن من استخدام الميكروفون. تحقق من إذن التسجيل ثم جرّب مرة أخرى.");
    }
  };

  const copyPoem = async () => {
    if (!poem) return;
    const text = [
      poem.title,
      `البحر: ${poem.meter}`,
      "",
      ...poem.verses.map((verse) => `${verse.sadr}  —  ${verse.ajz}`),
    ].join("\n");
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const reset = () => {
    storyRevisionRef.current += 1;
    setStory("");
    setSubmissionId(null);
    setAnalysis(null);
    setAnalysisStory("");
    setAnswers({});
    setPoetryRequest("");
    setPoem(null);
    setError("");
    setInputMode("text");
    setDraftRestored(false);
    setDraftSavedAt(null);
    if (draftStorageKey) {
      try {
        window.localStorage.removeItem(draftStorageKey);
      } catch {
        // Storage availability is optional.
      }
    }
  };

  const updateStory = (value: string) => {
    storyRevisionRef.current += 1;
    setStory(value);
    setDraftRestored(false);
    if (analysis && value.trim() !== analysisStory) {
      setAnalysis(null);
      setAnalysisStory("");
      setAnswers({});
      setPoetryRequest("");
      setPoem(null);
      setError("عدّلت القصة، لذلك أزلنا التحليل السابق حتى تُراجع النسخة الحالية بدقة.");
    }
  };

  const logout = async () => {
    await Promise.allSettled([
      fetch("/api/auth/session", { method: "DELETE" }),
      fetch("/api/admin/session", { method: "DELETE" }),
    ]);
    window.location.assign("/login");
  };

  const preferencesReady = Boolean(
    analysis && analysis.questions.every((question) => (answers[question.id] || "").trim()),
  );
  const journeySteps = [
    { label: "القصة", complete: story.trim().length >= 24 },
    { label: "الفهم", complete: Boolean(analysis) },
    { label: "الاختيارات", complete: preferencesReady },
    { label: "القصيدة", complete: Boolean(poem) },
  ];
  const firstIncompleteJourney = journeySteps.findIndex((step) => !step.complete);
  const activeJourneyIndex =
    firstIncompleteJourney === -1 ? journeySteps.length - 1 : firstIncompleteJourney;
  const draftTime = draftSavedAt
    ? new Intl.DateTimeFormat("ar-KW", { hour: "numeric", minute: "2-digit" }).format(
        new Date(draftSavedAt),
      )
    : null;

  return (
    <div className="app-shell">
      <header className="page-wrap site-header">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <Feather size={23} strokeWidth={1.8} />
          </div>
          <div>
            <div className="brand-name">أنت الشاعر</div>
            <div className="brand-tagline">قصتك بصوت القصيدة</div>
          </div>
        </div>
        <div className="header-actions">
          {currentUser && !currentUser.isGuest && (
            <div className="header-user" title={currentUser.email}>
              <UserRound size={16} />
              <span>{currentUser.displayName.split(" ")[0]}</span>
            </div>
          )}
          {currentUser?.isGuest && (
            <div className="header-user" title="وضع زائر مؤقت">
              <UserRound size={16} />
              <span>زائر</span>
            </div>
          )}
          <Link className="header-link" href="/archive">
            <Archive size={16} />
            <span>أرشيفي</span>
          </Link>
          {currentUser?.role === "admin" && (
            <Link className="header-link admin" href="/admin">
              <LayoutDashboard size={16} />
              <span>لوحة الإدارة</span>
            </Link>
          )}
          {!currentUser?.isGuest && (
            <button className="header-link header-logout" type="button" onClick={() => void logout()}>
              <LogOut size={16} />
              <span>خروج</span>
            </button>
          )}
          <div className="header-badge">
            <i />
            <span>مرجع شعري موثّق</span>
            <ShieldCheck size={16} />
          </div>
        </div>
      </header>

      <main className="page-wrap">
        <section className="hero">
          <div className="eyebrow">
            <Sparkles size={15} />
            من الحكاية إلى القصيدة
          </div>
          <h1>
            احكِ قصتك <span>ونصوغها شعرًا</span>
          </h1>
          <p>
            اكتب ما حدث أو سجّله بصوتك. نفهم مقصدك أولًا، نسألك عمّا ينقص، ثم نكتب لك
            أبياتًا خاصة بك مع بيان البحر والقافية وفحص إيقاعي أولي.
          </p>
        </section>

        <section className="studio-grid">
          <div className="card main-card">
            <ol className="creation-progress" aria-label="تقدّم إنشاء القصيدة">
              {journeySteps.map((step, index) => (
                <li
                  key={step.label}
                  className={`${step.complete ? "complete" : ""} ${activeJourneyIndex === index ? "active" : ""}`}
                  aria-current={activeJourneyIndex === index ? "step" : undefined}
                >
                  <span>{step.complete ? <Check size={14} /> : index + 1}</span>
                  <strong>{step.label}</strong>
                </li>
              ))}
            </ol>

            {draftReady && story.trim() && (
              <div className="draft-status" role="status">
                <ShieldCheck size={16} />
                <span>
                  {draftRestored ? "استعدنا مسودتك على هذا الجهاز" : "تُحفظ مسودتك تلقائيًا على هذا الجهاز"}
                  {draftTime ? ` • آخر حفظ ${draftTime}` : ""}
                </span>
              </div>
            )}

            <div className="step-row">
              <div className="step-copy">
                <div className="step-number">١</div>
                <div>
                  <div className="step-title">احكِ لنا القصة</div>
                  <div className="step-subtitle">لا تحتاج إلى صياغة مرتبة أو كلمات شعرية</div>
                </div>
              </div>
              <div className="text-tabs" role="tablist" aria-label="طريقة إدخال القصة">
                <button
                  type="button"
                  className={`tab-button ${inputMode === "text" ? "active" : ""}`}
                  onClick={() => setInputMode("text")}
                  role="tab"
                  aria-selected={inputMode === "text"}
                >
                  <PenLine size={15} />
                  كتابة
                </button>
                <button
                  type="button"
                  className={`tab-button ${inputMode === "voice" ? "active" : ""}`}
                  onClick={() => setInputMode("voice")}
                  role="tab"
                  aria-selected={inputMode === "voice"}
                >
                  <Mic size={15} />
                  تسجيل صوتي
                </button>
              </div>
            </div>

            {inputMode === "text" ? (
              <div className="story-box">
                <textarea
                  className="story-textarea"
                  aria-label="اكتب قصتك"
                  maxLength={3000}
                  placeholder={exampleStory}
                  value={story}
                  onChange={(event) => updateStory(event.target.value)}
                />
                <div className="char-count">{story.length} / ٣٠٠٠</div>
              </div>
            ) : (
              <div className="voice-panel">
                <button
                  type="button"
                  className={`record-button ${recording ? "recording" : ""}`}
                  onClick={startRecording}
                  aria-label={recording ? "إيقاف التسجيل" : "بدء التسجيل"}
                  disabled={busy === "transcribe"}
                >
                  {recording ? <Square size={26} fill="currentColor" /> : <Mic size={29} />}
                </button>
                <div className="record-title">
                  {busy === "transcribe"
                    ? "نحوّل صوتك إلى نص"
                    : recording
                      ? `جارٍ التسجيل • ${formatDuration(recordSeconds)}`
                      : "اضغط وابدأ الحكاية"}
                </div>
                <div className="record-note">
                  {busy === "transcribe"
                    ? "انتظر لحظات، ثم راجع النص قبل التحليل."
                    : "تحدّث بطبيعتك وبلهجتك. يمكنك إيقاف التسجيل متى انتهيت."}
                </div>
              </div>
            )}

            <div className="action-row">
              <div className="privacy-note">
                <LockKeyhole size={14} />
                المحتوى محفوظ ولا يظهر للمستخدمين الآخرين
              </div>
              <button
                type="button"
                className="primary-button"
                onClick={analyzeStory}
                disabled={busy !== null || story.trim().length < 24}
              >
                {busy === "analyze" ? <LoadingDots /> : <Brain size={18} />}
                {busy === "analyze" ? "نحلّل المعنى" : "حلّل قصتي"}
                {busy !== "analyze" && <ArrowLeft size={17} />}
              </button>
            </div>

            {error && <div className="error-box">{error}</div>}

            {analysis && (
              <section className="analysis-panel" aria-live="polite">
                <div className="analysis-banner">
                  <div className="analysis-label">
                    <ScanText size={16} />
                    ما فهمناه من قصتك
                  </div>
                  <div className="analysis-summary">{analysis.story_summary}</div>
                  <div className="recommendation-row">
                    <span className="recommendation-chip">
                      <WandSparkles size={13} />
                      {analysis.recommended_purpose}
                    </span>
                    <span className="recommendation-chip">
                      <Scale size={13} />
                      البحر المقترح: {analysis.recommended_meter}
                    </span>
                    <span className="recommendation-chip">
                      <AudioLines size={13} />
                      {analysis.suggested_tone}
                    </span>
                  </div>
                </div>

                <div className="writing-panel" ref={writingRef}>
                  <div className="step-copy">
                    <div className="step-number">٢</div>
                    <div>
                      <div className="step-title">اكتب كيف تريد القصيدة</div>
                      <div className="step-subtitle">
                        اذكر لمن ستُقال، واللهجة، وعدد الأبيات، والشعور أو الخاتمة التي تريدها
                      </div>
                    </div>
                  </div>

                  <div className="poetry-request-box">
                    <textarea
                      id="poetry-request"
                      className="poetry-request-textarea"
                      aria-label="اكتب طلبك للقصيدة"
                      maxLength={700}
                      placeholder={examplePoetryRequest}
                      value={poetryRequest}
                      onChange={(event) => setPoetryRequest(event.target.value)}
                    />
                    <div className="char-count">{poetryRequest.length} / ٧٠٠</div>
                  </div>
                  <div className="request-help">
                    يمكنك ترك الخانة فارغة واعتماد اقتراحات التحليل، أو كتابة طلبك بطريقتك.
                  </div>
                </div>

                <div className="questions-panel">
                  <div className="step-copy">
                    <div className="step-number">٣</div>
                    <div>
                      <div className="step-title">راجع الاختيارات المقترحة</div>
                      <div className="step-subtitle">
                        اختر ما يناسبك أو اكتب إجابة خاصة قبل نظم الأبيات
                      </div>
                    </div>
                  </div>

                  <div className="question-list">
                    {analysis.questions.map((question) => (
                      <div key={question.id}>
                        <div className="question-label">{question.question}</div>
                        <div className="option-grid">
                          {question.options.map((option) => (
                            <button
                              type="button"
                              key={option}
                              className={`option-button ${answers[question.id] === option ? "selected" : ""}`}
                              onClick={() =>
                                setAnswers((current) => ({ ...current, [question.id]: option }))
                              }
                            >
                              {option}
                            </button>
                          ))}
                        </div>
                        {question.allow_custom && (
                          <input
                            className="free-answer"
                            style={{ marginTop: 9 }}
                            value={
                              question.options.includes(answers[question.id] || "")
                                ? ""
                                : answers[question.id] || ""
                            }
                            placeholder="أو اكتب إجابتك الخاصة"
                            onChange={(event) =>
                              setAnswers((current) => ({
                                ...current,
                                [question.id]: event.target.value,
                              }))
                            }
                          />
                        )}
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    className="primary-button wide"
                    style={{ marginTop: 24 }}
                    onClick={generatePoem}
                    disabled={busy !== null || !preferencesReady}
                  >
                    {busy === "generate" ? <LoadingDots /> : <Feather size={19} />}
                    {busy === "generate" ? "نكتب ونراجع الأبيات" : "اكتب القصيدة الآن"}
                  </button>
                </div>
              </section>
            )}

            {poem && (
              <section className="result-panel" ref={resultRef} aria-live="polite">
                <div className="result-head">
                  <div>
                    <div className="poem-title">{poem.title}</div>
                    <div className="poem-meta">
                      <span className="status-chip">البحر: {poem.meter}</span>
                      <span className="status-chip">روي العجز: {poem.rawi}</span>
                      <span className="status-chip">{poem.dialect}</span>
                    </div>
                  </div>
                  <button type="button" className="secondary-button" onClick={copyPoem}>
                    {copied ? <Check size={16} /> : <Copy size={16} />}
                    {copied ? "تم النسخ" : "نسخ القصيدة"}
                  </button>
                </div>

                <div className="poem-paper">
                  {poem.verses.map((verse, index) => (
                    <div className="verse" key={`${verse.sadr}-${index}`}>
                      <div className="hemistich">{verse.sadr}</div>
                      <div className="verse-divider">◆</div>
                      <div className="hemistich">{verse.ajz}</div>
                    </div>
                  ))}
                </div>

                <div className="audit-grid">
                  <div className="audit-item">
                    <div className="audit-title">
                      <AudioLines size={14} />
                      فحص الإيقاع
                    </div>
                    <div className="audit-copy">{poem.meter_check}</div>
                  </div>
                  <div className="audit-item">
                    <div className="audit-title">
                      <Scale size={14} />
                      فحص القافية
                    </div>
                    <div className="audit-copy">{poem.rhyme_check}</div>
                  </div>
                  <div className="audit-item">
                    <div className="audit-title">
                      <ShieldCheck size={14} />
                      الأصالة
                    </div>
                    <div className="audit-copy">{poem.originality_check}</div>
                  </div>
                </div>

                <div className="caveat">
                  <AlertTriangle size={16} style={{ flex: "0 0 auto", marginTop: 2 }} />
                  {poem.performance_note}
                </div>

                <div className="result-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => revisePoem("اجعل الصور الشعرية أعمق مع بقاء القصة والبحر والقافيتين")}
                    disabled={busy !== null}
                  >
                    <WandSparkles size={15} />
                    اجعلها أعمق
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => revisePoem("زد بيتين جديدين يكملان الفكرة من غير حشو أو تكرار")}
                    disabled={busy !== null}
                  >
                    <RefreshCw size={15} />
                    زد بيتين
                  </button>
                  <button type="button" className="ghost-button" onClick={reset}>
                    <RefreshCw size={15} />
                    ابدأ قصة جديدة
                  </button>
                  <Link className="secondary-button" href="/archive">
                    <Archive size={15} />
                    عرض أرشيفي
                  </Link>
                  {busy === "revise" && <LoadingDots />}
                </div>
              </section>
            )}
          </div>

          <aside className="side-column">
            <div className="card side-card">
              <div className="side-heading">
                <MessageCircleQuestion size={18} />
                ماذا يحدث بعد قصتك؟
              </div>
              <div className="process-list">
                <div className="process-item">
                  <div className="process-icon"><Brain size={17} /></div>
                  <div>
                    <div className="process-title">فهم المعنى والشعور</div>
                    <div className="process-desc">نستخرج الحدث، المقصد، النبرة، وما يجب ألّا يُفقد.</div>
                  </div>
                </div>
                <div className="process-item">
                  <div className="process-icon"><MessageCircleQuestion size={17} /></div>
                  <div>
                    <div className="process-title">أسئلة تخص قصتك</div>
                    <div className="process-desc">نسأل عن المرسل إليه والنهاية واللهجة بدل افتراضها.</div>
                  </div>
                </div>
                <div className="process-item">
                  <div className="process-icon"><Scale size={17} /></div>
                  <div>
                    <div className="process-title">اختيار البناء الشعري</div>
                    <div className="process-desc">نحدّد البحر والقافيتين والروي قبل كتابة البيت الأول.</div>
                  </div>
                </div>
                <div className="process-item">
                  <div className="process-icon"><ShieldCheck size={17} /></div>
                  <div>
                    <div className="process-title">كتابة ثم مراجعة</div>
                    <div className="process-desc">نراجع المعنى والقافية والإيقاع ونوضح حدود الفحص الآلي.</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="card side-card reference-card">
              <div className="side-heading">
                <Library size={18} />
                المرجع الشعري
              </div>
              <p className="reference-copy">
                مبني على مرجع الموسوعة النبطية الكاملة بجزأيها: أعلام شعراء النبط،
                وبحور وأوزان الشعر النبطي. نستخدم قواعدها للبناء والمراجعة لا لنسخ
                أبيات الشعراء.
              </p>
              <div className="stats-row">
                <div className="stat"><strong>٧٩٢</strong><span>صفحة</span></div>
                <div className="stat"><strong>١٣</strong><span>بحرًا ولونًا</span></div>
                <div className="stat"><strong>١٩</strong><span>قاعدة محورية</span></div>
              </div>
            </div>
          </aside>
        </section>
      </main>

      <footer className="page-wrap footer">
        <BookOpen size={13} style={{ display: "inline", verticalAlign: "middle", marginLeft: 5 }} />
        حقوق المحتوى محفوظة © 2026 • أنت الشاعر • كتابة أصلية مسترشدة بالمرجع النبطي • الفحص الآلي لا يغني عن الأداء والسماع
      </footer>
    </div>
  );
}
