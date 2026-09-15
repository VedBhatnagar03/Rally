const baseUrl = process.env.RALLY_API_BASE_URL ?? "http://localhost:4000";
const adminEmail = process.env.RALLY_SMOKE_ADMIN_EMAIL ?? "naman.test@illinois.edu";
const password = process.env.RALLY_SMOKE_PASSWORD ?? "correct-horse-battery-staple";

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...options.headers
    }
  });

  const body = await response.json().catch(() => null);
  return { status: response.status, body };
}

async function post(path, body, token) {
  return request(path, {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
    body: JSON.stringify(body)
  });
}

async function get(path, token) {
  return request(path, {
    headers: token ? { authorization: `Bearer ${token}` } : undefined
  });
}

function assertStatus(name, actual, expected) {
  if (actual !== expected) {
    throw new Error(`${name}: expected ${expected}, got ${actual}`);
  }
}

async function createVerifiedUser(prefix) {
  const email = `${prefix}.${Date.now()}@illinois.edu`;
  const registration = await post("/v1/auth/register", {
    email,
    password,
    displayName: prefix
  });
  assertStatus(`${prefix} register`, registration.status, 201);

  const verification = await post("/v1/auth/verify-email", {
    token: registration.body.devVerificationToken
  });
  assertStatus(`${prefix} verify`, verification.status, 200);

  return verification.body;
}

async function completeProfile(userSession, displayName, availability) {
  const response = await request("/v1/me/profile", {
    method: "PUT",
    headers: { authorization: `Bearer ${userSession.token}` },
    body: JSON.stringify({
      displayName,
      major: "Information Sciences",
      classYear: "Junior",
      bio: "Smoke-test profile for Rally beta verification.",
      datingIntent: "DATING",
      interestedIn: [],
      campusZone: "Main Quad",
      sports: [
        {
          sport: "TENNIS",
          skillLevel: "INTERMEDIATE",
          intensity: 3,
          favorite: true
        }
      ],
      availability
    })
  });

  assertStatus(`${displayName} profile`, response.status, 200);
}

const health = await get("/health");
assertStatus("health", health.status, 200);

const ready = await get("/ready");
assertStatus("ready", ready.status, 200);

const nonUiuc = await post("/v1/auth/register", {
  email: `outsider.${Date.now()}@example.com`,
  password,
  displayName: "Outsider"
});
assertStatus("non-UIUC register", nonUiuc.status, 400);

const adminLogin = await post("/v1/auth/login", {
  email: adminEmail,
  password
});
assertStatus("admin login", adminLogin.status, 200);

const normal = await createVerifiedUser("normal");
const other = await createVerifiedUser("other");
const schedulerA = await createVerifiedUser("schedulerA");
const schedulerB = await createVerifiedUser("schedulerB");

await completeProfile(schedulerA, "Scheduler A", [{ dayOfWeek: 2, startTime: "17:00", endTime: "20:00" }]);
await completeProfile(schedulerB, "Scheduler B", [{ dayOfWeek: 2, startTime: "18:00", endTime: "21:00" }]);

const adminSummary = await get("/v1/admin/summary", adminLogin.body.token);
assertStatus("admin summary", adminSummary.status, 200);

const normalSummary = await get("/v1/admin/summary", normal.token);
assertStatus("normal admin rejection", normalSummary.status, 403);

const block = await post(
  "/v1/safety/blocks",
  {
    blockedUserId: other.user.id,
    reason: "smoke test"
  },
  normal.token
);
assertStatus("block user", block.status, 201);

const blockedRally = await post(
  "/v1/rallies",
  {
    receiverId: other.user.id,
    sport: "TENNIS",
    proposedStartAt: new Date(Date.now() + 86_400_000).toISOString(),
    proposedEndAt: new Date(Date.now() + 90_000_000).toISOString()
  },
  normal.token
);
assertStatus("blocked rally rejection", blockedRally.status, 403);

const suggestions = await get(`/v1/rallies/suggestions/${schedulerB.user.id}`, schedulerA.token);
assertStatus("schedule suggestions", suggestions.status, 200);

if (!Array.isArray(suggestions.body.suggestions) || suggestions.body.suggestions.length === 0) {
  throw new Error("schedule suggestions: expected at least one viable slot");
}

console.log(JSON.stringify({
  ok: true,
  checks: [
    "health",
    "ready",
    "non-UIUC rejection",
    "admin authorization",
    "normal admin rejection",
    "block enforcement",
    "schedule suggestions"
  ]
}, null, 2));
