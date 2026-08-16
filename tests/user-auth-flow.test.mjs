import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { Miniflare } from "miniflare";

const workerUrl = new URL("../dist/server/index.js", import.meta.url);
workerUrl.searchParams.set("auth-test", `${process.pid}-${Date.now()}`);
const { default: worker } = await import(workerUrl.href);

const miniflare = new Miniflare({
  modules: true,
  script: "export default { fetch() { return new Response('ok') } }",
  d1Databases: ["DB"],
  r2Buckets: ["BUCKET"],
});

const adminEmail = "admin-test@example.test";
const adminPassword = "AdminPass1234";
const adminSessionSecret = "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
const adminPasswordHash = `hmac-sha256-v1$${createHmac("sha256", Buffer.from(adminSessionSecret, "base64url"))
  .update(`admin-password-v1:${adminPassword}`)
  .digest("base64url")}`;

const env = {
  DB: await miniflare.getD1Database("DB"),
  BUCKET: await miniflare.getR2Bucket("BUCKET"),
  USER_AUTH_SECRET: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  ADMIN_EMAIL: adminEmail,
  ADMIN_SESSION_SECRET: adminSessionSecret,
  ADMIN_PASSWORD_HASH: adminPasswordHash,
  AUTH_TEST_MODE: "true",
  GUEST_ACCESS_ENABLED: "true",
  ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
  IMAGES: {
    input() {
      throw new Error("Image binding should not be used by authentication tests.");
    },
  },
};

const ctx = {
  waitUntil() {},
  passThroughOnException() {},
};

const appFetch = (path, init = {}) =>
  worker.fetch(new Request(`http://terminal.local${path}`, init), env, ctx);

async function post(path, body, cookie = "") {
  return appFetch(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
    redirect: "manual",
  });
}

const responseCookie = (response) =>
  (response.headers.get("set-cookie") || "").split(";")[0];

test("allows temporary guest access while preserving user and admin authentication", async (t) => {
  t.after(async () => miniflare.dispose());

  const stamp = String(Date.now());
  const email = `user-test-${stamp}@example.test`;
  const password = "DemoPass1234";

  const loginPage = await appFetch("/login", { redirect: "manual" });
  assert.ok(loginPage.status >= 300 && loginPage.status < 400);
  assert.equal(new URL(loginPage.headers.get("location"), "http://terminal.local").pathname, "/");

  const anonymousHome = await appFetch("/");
  assert.equal(anonymousHome.status, 200);
  assert.match(await anonymousHome.text(), /أنت الشاعر/);

  const guestSession = await appFetch("/api/me");
  assert.equal(guestSession.status, 200);
  const guest = await guestSession.json();
  assert.equal(guest.isGuest, true);
  assert.equal(guest.displayName, "زائر مؤقت");
  const guestCookie = responseCookie(guestSession);
  assert.ok(guestCookie.startsWith("ant_alshaer_user_session="));

  const guestArchive = await appFetch("/archive", { headers: { cookie: guestCookie } });
  assert.equal(guestArchive.status, 200);
  assert.match(await guestArchive.text(), /أرشيفي الشعري/);

  const guestSubmissionId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  await env.DB
    .prepare(
      "INSERT INTO submissions (id, user_id, source_mode, story_text, state, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(guestSubmissionId, guest.id, "text", "قصة زائر خاصة", "analyzed", createdAt, createdAt)
    .run();

  const firstGuestArchive = await appFetch("/api/archive", { headers: { cookie: guestCookie } });
  assert.equal(firstGuestArchive.status, 200);
  assert.equal((await firstGuestArchive.json()).archive.length, 1);

  const secondGuestSession = await appFetch("/api/me");
  assert.equal(secondGuestSession.status, 200);
  const secondGuest = await secondGuestSession.json();
  assert.notEqual(secondGuest.id, guest.id);
  const secondGuestCookie = responseCookie(secondGuestSession);
  const secondGuestArchive = await appFetch("/api/archive", { headers: { cookie: secondGuestCookie } });
  assert.equal(secondGuestArchive.status, 200);
  assert.equal((await secondGuestArchive.json()).archive.length, 0);

  const registration = await post("/api/auth/register", {
    displayName: "مستخدم الاختبار",
    email,
    password,
    confirmPassword: password,
  });
  assert.equal(registration.status, 200);
  const registrationData = await registration.json();
  assert.equal(registrationData.ok, true);
  assert.ok(registrationData.testCode);

  const pendingLogin = await post("/api/auth/session", { email, password });
  assert.equal(pendingLogin.status, 403);
  assert.equal((await pendingLogin.json()).code, "ACCOUNT_PENDING");

  const partialVerification = await post("/api/auth/verify", {
    email,
    emailCode: "000000",
  });
  assert.equal(partialVerification.status, 400);
  const partialData = await partialVerification.json();
  assert.equal(partialData.emailApproved, false);

  const verification = await post("/api/auth/verify", {
    email,
    emailCode: registrationData.testCode,
  });
  assert.equal(verification.status, 200);
  const firstCookie = responseCookie(verification);
  assert.ok(firstCookie.startsWith("ant_alshaer_user_session="));

  const authenticatedHome = await appFetch("/", { headers: { cookie: firstCookie } });
  assert.equal(authenticatedHome.status, 200);
  assert.match(await authenticatedHome.text(), /أنت الشاعر/);

  const archive = await appFetch("/archive", { headers: { cookie: firstCookie } });
  assert.equal(archive.status, 200);
  assert.match(await archive.text(), /أرشيفي الشعري/);

  const logout = await appFetch("/api/auth/session", {
    method: "DELETE",
    headers: { cookie: firstCookie },
  });
  assert.equal(logout.status, 200);
  assert.match(logout.headers.get("set-cookie") || "", /Max-Age=0/);

  const wrongLogin = await post("/api/auth/session", { email, password: "WrongPass123" });
  assert.equal(wrongLogin.status, 401);

  const login = await post("/api/auth/session", { email, password });
  assert.equal(login.status, 200);
  assert.ok(responseCookie(login).startsWith("ant_alshaer_user_session="));

  const anonymousSettings = await appFetch("/api/admin/integrations/twilio");
  assert.equal(anonymousSettings.status, 401);

  const adminLogin = await post("/api/admin/session", { email: adminEmail, password: adminPassword });
  assert.equal(adminLogin.status, 200);
  const adminCookie = responseCookie(adminLogin);
  assert.ok(adminCookie.startsWith("ant_alshaer_admin_session="));

  const initialSettings = await appFetch("/api/admin/integrations/twilio", {
    headers: { cookie: adminCookie },
  });
  assert.equal(initialSettings.status, 200);
  assert.deepEqual(await initialSettings.json(), { configured: false, source: null });

  const accountSid = `AC${"a".repeat(32)}`;
  const authToken = "b".repeat(32);
  const serviceSid = `VA${"c".repeat(32)}`;
  const storedSettings = await appFetch("/api/admin/integrations/twilio", {
    method: "PUT",
    headers: { "content-type": "application/json", cookie: adminCookie },
    body: JSON.stringify({ accountSid, authToken, serviceSid }),
  });
  assert.equal(storedSettings.status, 200);
  assert.deepEqual(await storedSettings.json(), { configured: true, source: "secure_storage" });

  const storedRow = await env.DB
    .prepare("SELECT encrypted_value FROM integration_settings WHERE key = ?")
    .bind("twilio_verify_v1")
    .first();
  assert.ok(storedRow?.encrypted_value);
  assert.doesNotMatch(storedRow.encrypted_value, new RegExp(authToken));

  const readbackSettings = await appFetch("/api/admin/integrations/twilio", {
    headers: { cookie: adminCookie },
  });
  assert.equal(readbackSettings.status, 200);
  assert.deepEqual(await readbackSettings.json(), { configured: true, source: "secure_storage" });
});
