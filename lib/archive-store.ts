import { and, count, desc, eq, isNotNull, like, ne, or } from "drizzle-orm";
import { ensureRuntimeSchema, getBucket, getDb } from "@/db";
import { submissions, users, type SubmissionRecord, type UserRecord } from "@/db/schema";
import { getRuntimeStringBinding } from "@/lib/runtime-bindings";

type Identity = {
  email: string;
  displayName: string;
};

type AudioInput = {
  file: File;
  durationSeconds?: number;
  transcript?: string;
};

export class ArchiveError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const now = () => new Date().toISOString();
const normalizeEmail = (email: string) => email.trim().toLowerCase();

export async function ensureUser(identity: Identity): Promise<UserRecord> {
  await ensureRuntimeSchema();
  const db = getDb();
  const email = normalizeEmail(identity.email);
  const adminEmail = normalizeEmail(getRuntimeStringBinding("ADMIN_EMAIL") || "");
  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const role = email && email === adminEmail ? "admin" : existing?.role || "user";
  const timestamp = now();

  if (existing) {
    const [updated] = await db
      .update(users)
      .set({ displayName: identity.displayName || existing.displayName, role, lastSeenAt: timestamp })
      .where(eq(users.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(users)
    .values({
      id: crypto.randomUUID(),
      email,
      displayName: identity.displayName || email,
      role,
      status: "active",
      createdAt: timestamp,
      lastSeenAt: timestamp,
    })
    .returning();
  return created;
}

export async function saveAudioSubmission(user: UserRecord, input: AudioInput) {
  const db = getDb();
  const bucket = getBucket();
  const submissionId = crypto.randomUUID();
  const safeFilename = input.file.name.replace(/[^a-zA-Z0-9._-]/g, "_") || "story.webm";
  const audioKey = `audio/${user.id}/${submissionId}/${safeFilename}`;
  const timestamp = now();

  await bucket.put(audioKey, await input.file.arrayBuffer(), {
    httpMetadata: { contentType: input.file.type || "audio/webm" },
    customMetadata: {
      submissionId,
      ownerId: user.id,
      originalFilename: input.file.name || "story.webm",
    },
  });

  await db.insert(submissions).values({
    id: submissionId,
    userId: user.id,
    sourceMode: "audio",
    storyText: input.transcript || "",
    transcriptionText: input.transcript || null,
    audioKey,
    audioFilename: input.file.name || "story.webm",
    audioContentType: input.file.type || "audio/webm",
    audioSize: input.file.size,
    audioDurationSeconds: input.durationSeconds || null,
    state: "audio_saved",
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  return { submissionId, audioKey };
}

export async function saveTranscription(userId: string, submissionId: string, transcript: string) {
  await getDb()
    .update(submissions)
    .set({
      storyText: transcript,
      transcriptionText: transcript,
      state: "audio_saved",
      updatedAt: now(),
    })
    .where(and(eq(submissions.id, submissionId), eq(submissions.userId, userId)));
}

async function ownedSubmission(userId: string, submissionId: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(submissions)
    .where(and(eq(submissions.id, submissionId), eq(submissions.userId, userId)))
    .limit(1);
  return row;
}

export async function startStorySubmission(params: {
  user: UserRecord;
  submissionId?: string;
  story: string;
}) {
  const db = getDb();
  const timestamp = now();

  if (params.submissionId) {
    const existing = await ownedSubmission(params.user.id, params.submissionId);
    if (!existing) throw new ArchiveError(404, "تعذّر العثور على السجل المرتبط بهذه القصة.");
    await db
      .update(submissions)
      .set({
        storyText: params.story,
        transcriptionText:
          existing.sourceMode === "audio" ? params.story : existing.transcriptionText,
        updatedAt: timestamp,
      })
      .where(eq(submissions.id, params.submissionId));
    return params.submissionId;
  }

  const submissionId = crypto.randomUUID();
  await db.insert(submissions).values({
    id: submissionId,
    userId: params.user.id,
    sourceMode: "text",
    storyText: params.story,
    state: "received",
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  return submissionId;
}

export async function saveAnalysisResult(userId: string, submissionId: string, analysis: unknown) {
  await getDb()
    .update(submissions)
    .set({ analysisJson: JSON.stringify(analysis), state: "analyzed", updatedAt: now() })
    .where(and(eq(submissions.id, submissionId), eq(submissions.userId, userId)));
}

export async function savePoem(params: {
  user: UserRecord;
  submissionId: string;
  answers: Record<string, string>;
  poem: { title?: string; meter?: string; verses?: unknown[] };
}) {
  const db = getDb();
  const existing = await ownedSubmission(params.user.id, params.submissionId);
  if (!existing) throw new ArchiveError(404, "تعذّر العثور على سجل القصة لحفظ القصيدة.");
  await db
    .update(submissions)
    .set({
      requestText: params.answers.custom_request || null,
      answersJson: JSON.stringify(params.answers),
      poemJson: JSON.stringify(params.poem),
      poemTitle: params.poem.title || "قصيدة بلا عنوان",
      meter: params.poem.meter || null,
      verseCount: Array.isArray(params.poem.verses) ? params.poem.verses.length : null,
      state: "completed",
      updatedAt: now(),
    })
    .where(eq(submissions.id, params.submissionId));
}

function parseJson<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function publicSubmission(row: SubmissionRecord) {
  return {
    id: row.id,
    sourceMode: row.sourceMode,
    storyText: row.storyText,
    transcriptionText: row.transcriptionText,
    requestText: row.requestText,
    analysis: parseJson(row.analysisJson),
    answers: parseJson(row.answersJson),
    poem: parseJson(row.poemJson),
    poemTitle: row.poemTitle,
    meter: row.meter,
    verseCount: row.verseCount,
    state: row.state,
    hasAudio: Boolean(row.audioKey),
    audioFilename: row.audioFilename,
    audioSize: row.audioSize,
    audioDurationSeconds: row.audioDurationSeconds,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listUserArchive(userId: string, limit = 100) {
  const rows = await getDb()
    .select()
    .from(submissions)
    .where(eq(submissions.userId, userId))
    .orderBy(desc(submissions.createdAt))
    .limit(Math.min(Math.max(limit, 1), 200));
  return rows.map(publicSubmission);
}

type AdminDashboardQuery = {
  page?: number;
  pageSize?: number;
  search?: string;
  sourceMode?: "text" | "audio";
  state?: "received" | "audio_saved" | "analyzed" | "completed" | "failed";
};

export async function getAdminDashboard(query: AdminDashboardQuery = {}) {
  const db = getDb();
  const page = Math.max(1, Math.trunc(query.page || 1));
  const pageSize = Math.min(100, Math.max(10, Math.trunc(query.pageSize || 50)));
  const search = query.search?.trim().slice(0, 160) || "";
  const archiveFilter = and(
    query.sourceMode ? eq(submissions.sourceMode, query.sourceMode) : undefined,
    query.state ? eq(submissions.state, query.state) : undefined,
    search
      ? or(
          like(submissions.storyText, `%${search}%`),
          like(submissions.transcriptionText, `%${search}%`),
          like(submissions.requestText, `%${search}%`),
          like(submissions.poemTitle, `%${search}%`),
          like(submissions.meter, `%${search}%`),
          like(users.displayName, `%${search}%`),
          like(users.email, `%${search}%`),
        )
      : undefined,
  );
  const [
    userRows,
    archiveRows,
    [filteredArchiveTotal],
    [userTotal],
    [archiveTotal],
    [poemTotal],
    [audioTotal],
    [writtenTotal],
    [failedTotal],
    perUser,
  ] =
    await Promise.all([
      db.select().from(users).orderBy(desc(users.createdAt)),
      db
        .select({
          submission: submissions,
          user: {
            id: users.id,
            email: users.email,
            displayName: users.displayName,
          },
        })
        .from(submissions)
        .leftJoin(users, eq(submissions.userId, users.id))
        .where(archiveFilter)
        .orderBy(desc(submissions.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      db
        .select({ value: count() })
        .from(submissions)
        .leftJoin(users, eq(submissions.userId, users.id))
        .where(archiveFilter),
      db.select({ value: count() }).from(users),
      db.select({ value: count() }).from(submissions),
      db
        .select({ value: count() })
        .from(submissions)
        .where(eq(submissions.state, "completed")),
      db
        .select({ value: count() })
        .from(submissions)
        .where(isNotNull(submissions.audioKey)),
      db
        .select({ value: count() })
        .from(submissions)
        .where(eq(submissions.sourceMode, "text")),
      db
        .select({ value: count() })
        .from(submissions)
        .where(eq(submissions.state, "failed")),
      db
        .select({ userId: submissions.userId, value: count() })
        .from(submissions)
        .groupBy(submissions.userId),
    ]);

  const counts = new Map(perUser.map((row) => [row.userId, row.value]));
  const filteredTotal = filteredArchiveTotal?.value || 0;
  const totalPages = Math.max(1, Math.ceil(filteredTotal / pageSize));

  return {
    metrics: {
      users: userTotal?.value || 0,
      archive: archiveTotal?.value || 0,
      poems: poemTotal?.value || 0,
      audio: audioTotal?.value || 0,
      written: writtenTotal?.value || 0,
      failed: failedTotal?.value || 0,
    },
    users: userRows.map((user) => ({ ...user, archiveCount: counts.get(user.id) || 0 })),
    archive: archiveRows.map(({ submission, user }) => ({
      ...publicSubmission(submission),
      user,
    })),
    pagination: {
      page: Math.min(page, totalPages),
      pageSize,
      total: filteredTotal,
      totalPages,
    },
  };
}

export async function updateManagedUser(params: {
  admin: UserRecord;
  userId: string;
  status?: "active" | "suspended";
  role?: "admin" | "user";
}) {
  if (params.admin.id === params.userId) {
    throw new ArchiveError(400, "لا يمكنك إيقاف حساب المدير الحالي أو تخفيض صلاحيته.");
  }
  if (!params.status && !params.role) {
    throw new ArchiveError(400, "لم يصل تعديل صالح لحساب المستخدم.");
  }
  const [updated] = await getDb()
    .update(users)
    .set({
      ...(params.status ? { status: params.status } : {}),
      ...(params.role ? { role: params.role } : {}),
    })
    .where(eq(users.id, params.userId))
    .returning();
  if (!updated) throw new ArchiveError(404, "المستخدم غير موجود.");
  return updated;
}

export async function getAudioObject(user: UserRecord, submissionId: string) {
  const db = getDb();
  const [row] = await db.select().from(submissions).where(eq(submissions.id, submissionId)).limit(1);
  if (!row?.audioKey) throw new ArchiveError(404, "لا يوجد تسجيل صوتي لهذا السجل.");
  if (row.userId !== user.id && user.role !== "admin") {
    throw new ArchiveError(403, "ليس لديك صلاحية لسماع هذا التسجيل.");
  }
  const object = await getBucket().get(row.audioKey);
  if (!object) throw new ArchiveError(404, "ملف التسجيل غير متوفر.");
  return { object, row };
}

export async function markSubmissionFailed(userId: string, submissionId?: string) {
  if (!submissionId) return;
  await getDb()
    .update(submissions)
    .set({ state: "failed", updatedAt: now() })
    .where(
      and(
        eq(submissions.id, submissionId),
        eq(submissions.userId, userId),
        ne(submissions.state, "completed"),
      ),
    );
}
