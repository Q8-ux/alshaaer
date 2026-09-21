import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("blocks abusive or defamatory poetry before storage and checks generated output", async () => {
  const [safety, poetryRoute, transcription, studio] = await Promise.all(
    [
      "../lib/content-safety.ts",
      "../app/api/poetry/route.ts",
      "../app/api/transcribe/route.ts",
      "../components/PoetryStudio.tsx",
    ].map((path) => readFile(new URL(path, import.meta.url), "utf8")),
  );

  assert.match(safety, /person_abuse_or_defamation/);
  assert.match(safety, /divine_abuse/);
  assert.match(safety, /ruler_or_government_abuse/);
  assert.match(safety, /unclear_risk/);
  assert.match(safety, /CONTENT_NOT_ALLOWED/);
  assert.match(safety, /النقد العام المهذب/);

  const inputCheck = poetryRoute.indexOf("await assertSafePoetryContent(");
  const firstStorage = poetryRoute.indexOf("activeSubmissionId = await startStorySubmission(");
  assert.ok(inputCheck >= 0 && inputCheck < firstStorage);

  const finalPoem = poetryRoute.indexOf("const final = await auditDraft");
  const outputCheck = poetryRoute.indexOf('await assertSafePoetryContent(client, [final], "output")', finalPoem);
  const poemStorage = poetryRoute.indexOf("await savePoem({", finalPoem);
  assert.ok(outputCheck > finalPoem && outputCheck < poemStorage);
  assert.match(poetryRoute, /POETRY_SAFETY_POLICY_AR/);

  const transcriptCheck = transcription.indexOf('await assertSafePoetryContent(client, [text], "transcript")');
  const transcriptStorage = transcription.indexOf("await saveTranscription", transcriptCheck);
  assert.ok(transcriptCheck >= 0 && transcriptCheck < transcriptStorage);
  assert.match(studio, /المحتوى خاص، ويُرفض السب والقذف والإساءة/);
});
