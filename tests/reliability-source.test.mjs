import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("preserves bounded drafts and invalidates stale async results", async () => {
  const studio = await read("components/PoetryStudio.tsx");

  assert.match(studio, /DRAFT_STORAGE_KEY/);
  assert.match(studio, /DRAFT_TTL_MS\s*=\s*30/);
  assert.match(studio, /GUEST_DRAFT_STORAGE_KEY/);
  assert.match(studio, /guest-device/);
  assert.match(studio, /user\.isGuest\s*\?\s*GUEST_DRAFT_STORAGE_KEY/);
  assert.match(studio, /`\$\{DRAFT_STORAGE_KEY}:\$\{user\.id}`/);
  assert.match(studio, /localStorage\.setItem/);
  assert.match(studio, /analysisStory\s*!==\s*story\.trim\(\)/);
  assert.match(studio, /storyRevisionRef/);
  assert.match(studio, /storyRevision\s*!==\s*storyRevisionRef\.current/);
  assert.match(studio, /controller\.abort\(\)/);
  assert.doesNotMatch(studio, /controller\.abort\("timeout"\)/);
  assert.match(studio, /creation-progress/);
});

test("exposes a non-mutating operational health check with a valid session secret requirement", async () => {
  const route = await read("app/api/health/route.ts");

  assert.match(route, /DB/);
  assert.match(route, /BUCKET/);
  assert.match(route, /OPENAI_API_KEY/);
  assert.match(route, /USER_AUTH_SECRET/);
  assert.match(route, /hasValidSessionSecret/);
  assert.match(route, /atob\(padded\)\.length\s*>=\s*32/);
  assert.match(route, /status:\s*ok\s*\?\s*"ready"\s*:\s*"degraded"/);
  assert.match(route, /"Cache-Control":\s*"no-store"/);
});

test("adds baseline response protections", async () => {
  const worker = await read("worker/index.ts");

  assert.match(worker, /X-Content-Type-Options/);
  assert.match(worker, /X-Frame-Options/);
  assert.match(worker, /Referrer-Policy/);
  assert.match(worker, /Permissions-Policy/);
});

test("build scripts work without executable file bits", async () => {
  for (const path of [
    "scripts/build-verified.sh",
    "scripts/install-ci.sh",
    "scripts/validate-artifact.sh",
  ]) {
    assert.match(await read(path), /bash\s+"\$\{script_dir\}\/sites-env\.sh"/);
  }
});

test("public landing pages use the official GitHub project link", async () => {
  for (const path of ["index.html", "docs/index.html"]) {
    const html = await read(path);
    assert.doesNotMatch(html, /centrino\.chatgpt\.site/);
    assert.match(html, /https:\/\/github\.com\/Q8-ux\/alshaaer/);
    assert.match(html, /https:\/\/q8-ux\.github\.io\/saad\/ant-alshaer\//);
  }
});

test("keeps source research behind the admin backend", async () => {
  const route = await read("app/api/admin/research/route.ts");
  const client = await read("lib/masar-client.ts");
  const dashboard = await read("components/AdminDashboard.tsx");

  assert.match(route, /requireAdminUser\(\)/);
  assert.match(route, /ResearchRequestSchema/);
  assert.match(client, /MASAR_API_URL/);
  assert.match(client, /MASAR_ANT_ALSHAER_TOKEN/);
  assert.match(client, /Authorization:\s*`Bearer \$\{token\}`/);
  assert.doesNotMatch(dashboard, /MASAR_ANT_ALSHAER_TOKEN/);
  assert.match(dashboard, /لا ينشر محتوى ولا يغيّر قصيدة أو سجلًا تلقائيًا/);
});

test("grounds Najdi and Bedouin vocabulary in academic and institutional references", async () => {
  const reference = await read("lib/nabati-reference.ts");

  assert.match(reference, /Najdi Arabic: Central Arabian/);
  assert.match(reference, /North East Arabian Dialects/);
  assert.match(reference, /Oral Poetry and Narratives from Central Arabia/);
  assert.match(reference, /منصة سِوار للمعاجم اللغوية/);
  assert.match(reference, /فلك — المدونات اللغوية العربية/);
  assert.match(reference, /لا تُعمّم المفردة البدوية/);
});
