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

function nextDateForDay(dayOfWeek) {
  const now = new Date();
  const delta = (dayOfWeek - now.getDay() + 7) % 7 || 7;
  const result = new Date(now);
  result.setDate(now.getDate() + delta);
  return result.toISOString().slice(0, 10);
}

function dateTimeForSuggestion(suggestion, time) {
  return `${nextDateForDay(suggestion.dayOfWeek)}T${time}:00.000Z`;
}

async function createVerifiedUser(prefix, testResend = false) {
  const email = `${prefix}.${Date.now()}@illinois.edu`;
  const registration = await post("/v1/auth/register", {
    email,
    password,
    displayName: prefix
  });
  assertStatus(`${prefix} register`, registration.status, 201);

  let verificationToken = registration.body.devVerificationToken;
  if (testResend) {
    const resent = await post("/v1/auth/resend-verification", { email });
    assertStatus(`${prefix} resend verification`, resent.status, 202);

    const invalidated = await post("/v1/auth/verify-email", {
      token: registration.body.devVerificationToken
    });
    assertStatus(`${prefix} reject superseded verification`, invalidated.status, 400);
    verificationToken = resent.body.devVerificationToken;
  }

  const verification = await post("/v1/auth/verify-email", {
    token: verificationToken
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
      age: 21,
      preferredAgeMin: 18,
      preferredAgeMax: 30,
      gender: "PREFER_NOT_TO_SAY",
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

const refreshedAdmin = await post("/v1/auth/refresh", {
  refreshToken: adminLogin.body.refreshToken
});
assertStatus("refresh session", refreshedAdmin.status, 200);

const replayedRefresh = await post("/v1/auth/refresh", {
  refreshToken: adminLogin.body.refreshToken
});
assertStatus("reject refresh replay", replayedRefresh.status, 401);

const logout = await post("/v1/auth/logout", {
  refreshToken: refreshedAdmin.body.refreshToken
});
assertStatus("logout session", logout.status, 204);

const loggedOutRefresh = await post("/v1/auth/refresh", {
  refreshToken: refreshedAdmin.body.refreshToken
});
assertStatus("reject logged-out refresh", loggedOutRefresh.status, 401);

const normal = await createVerifiedUser("normal", true);
const other = await createVerifiedUser("other");
const schedulerA = await createVerifiedUser("schedulerA");
const schedulerB = await createVerifiedUser("schedulerB");

await completeProfile(schedulerA, "Scheduler A", [{ dayOfWeek: 2, startTime: "17:00", endTime: "20:00" }]);
await completeProfile(schedulerB, "Scheduler B", [{ dayOfWeek: 2, startTime: "18:00", endTime: "21:00" }]);

const recommendations = await get("/v1/recommendations", schedulerA.token);
assertStatus("explainable recommendations", recommendations.status, 200);
const schedulerRecommendation = recommendations.body.recommendations.find(
  (candidate) => candidate.userId === schedulerB.user.id
);
if (
  !schedulerRecommendation ||
  !Array.isArray(schedulerRecommendation.reasons) ||
  schedulerRecommendation.reasons.length === 0 ||
  !Array.isArray(schedulerRecommendation.breakdown) ||
  schedulerRecommendation.breakdown.length !== 5
) {
  throw new Error("explainable recommendations: expected reasons and five score components");
}

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

const report = await post(
  "/v1/safety/reports",
  {
    reportedUserId: other.user.id,
    category: "UNSAFE_BEHAVIOR",
    details: "Smoke test moderation report"
  },
  normal.token
);
assertStatus("create moderation report", report.status, 201);

const adminReports = await get("/v1/admin/reports?limit=10", adminLogin.body.token);
assertStatus("admin report queue", adminReports.status, 200);

const resolvedReport = await request(`/v1/admin/reports/${report.body.report.id}`, {
  method: "PATCH",
  headers: { authorization: `Bearer ${adminLogin.body.token}` },
  body: JSON.stringify({ status: "RESOLVED", resolutionNote: "Reviewed during smoke test" })
});
assertStatus("resolve moderation report", resolvedReport.status, 200);
if (!resolvedReport.body.report.resolvedAt || !resolvedReport.body.report.resolvedById) {
  throw new Error("resolve moderation report: expected resolution attribution");
}

const suspended = await request(`/v1/admin/users/${other.user.id}/status`, {
  method: "PATCH",
  headers: { authorization: `Bearer ${adminLogin.body.token}` },
  body: JSON.stringify({ status: "SUSPENDED", reason: "Smoke test suspension" })
});
assertStatus("suspend user", suspended.status, 200);

const suspendedAccess = await get("/v1/me", other.token);
assertStatus("suspended access rejection", suspendedAccess.status, 401);

const reactivated = await request(`/v1/admin/users/${other.user.id}/status`, {
  method: "PATCH",
  headers: { authorization: `Bearer ${adminLogin.body.token}` },
  body: JSON.stringify({ status: "ACTIVE", reason: "Smoke test complete" })
});
assertStatus("reactivate user", reactivated.status, 200);

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

const selectedSuggestion = suggestions.body.suggestions[0];

const rally = await post(
  "/v1/rallies",
  {
    receiverId: schedulerB.user.id,
    sport: "TENNIS",
    proposedStartAt: new Date(Date.now() + 86_400_000).toISOString(),
    proposedEndAt: new Date(Date.now() + 90_000_000).toISOString()
  },
  schedulerA.token
);
assertStatus("create persisted rally", rally.status, 201);

const accepted = await post(
  `/v1/rallies/${rally.body.rally.id}/respond`,
  { status: "ACCEPTED" },
  schedulerB.token
);
assertStatus("accept persisted rally", accepted.status, 200);

const scheduled = await post(
  `/v1/rallies/${rally.body.rally.id}/schedule`,
  {
    proposedStartAt: dateTimeForSuggestion(selectedSuggestion, selectedSuggestion.startTime),
    proposedEndAt: dateTimeForSuggestion(selectedSuggestion, selectedSuggestion.endTime),
    venueId: selectedSuggestion.venue.id
  },
  schedulerA.token
);
assertStatus("select persisted schedule", scheduled.status, 200);

if (scheduled.body.rally.venueId !== selectedSuggestion.venue.id) {
  throw new Error("select persisted schedule: expected venue to persist");
}
if (scheduled.body.rally.status !== "SCHEDULED") {
  throw new Error("select persisted schedule: expected explicit SCHEDULED state");
}

const booked = await post(
  `/v1/rallies/${rally.body.rally.id}/court-booking`,
  { courtStatus: "BOOKED", bookingReference: "smoke-test-booking" },
  schedulerA.token
);
assertStatus("persist court booking", booked.status, 200);

const completed = await post(`/v1/rallies/${rally.body.rally.id}/complete`, {}, schedulerA.token);
assertStatus("complete persisted rally", completed.status, 200);

const feedbackA = await post(
  `/v1/feedback/rallies/${rally.body.rally.id}`,
  { played: true, feltSafe: true, rallyAgain: true, experienceScore: 5 },
  schedulerA.token
);
assertStatus("submit first feedback", feedbackA.status, 200);

const feedbackB = await post(
  `/v1/feedback/rallies/${rally.body.rally.id}`,
  { played: true, feltSafe: true, rallyAgain: true, experienceScore: 5 },
  schedulerB.token
);
assertStatus("submit second feedback", feedbackB.status, 200);

const outcome = await get(`/v1/feedback/rallies/${rally.body.rally.id}/outcome`, schedulerA.token);
assertStatus("read rally outcome", outcome.status, 200);

if (!outcome.body.outcome.bothResponded || !outcome.body.outcome.isMutualMatch) {
  throw new Error("read rally outcome: expected mutual match after two yes feedback entries");
}

const cancellable = await post(
  "/v1/rallies",
  {
    receiverId: schedulerB.user.id,
    sport: "TENNIS",
    proposedStartAt: new Date(Date.now() + 172_800_000).toISOString(),
    proposedEndAt: new Date(Date.now() + 176_400_000).toISOString()
  },
  schedulerA.token
);
assertStatus("create cancellable rally", cancellable.status, 201);

const cancelled = await post(
  `/v1/rallies/${cancellable.body.rally.id}/cancel`,
  { reason: "Plans changed" },
  schedulerA.token
);
assertStatus("cancel rally", cancelled.status, 200);
if (
  cancelled.body.rally.status !== "CANCELLED" ||
  cancelled.body.rally.cancelledById !== schedulerA.user.id ||
  cancelled.body.rally.cancellationReason !== "Plans changed"
) {
  throw new Error("cancel rally: expected status, actor, and reason to persist");
}

const acceptCancelled = await post(
  `/v1/rallies/${cancellable.body.rally.id}/respond`,
  { status: "ACCEPTED" },
  schedulerB.token
);
assertStatus("reject cancelled rally transition", acceptCancelled.status, 409);

console.log(JSON.stringify({
  ok: true,
  checks: [
    "health",
    "ready",
    "non-UIUC rejection",
    "verification resend and superseded-token rejection",
    "refresh rotation and replay rejection",
    "logout revocation",
    "admin authorization",
    "normal admin rejection",
    "founder report resolution and user suspension",
    "block enforcement",
    "mutual filters and explainable recommendations",
    "schedule suggestions",
    "persisted rally lifecycle",
    "explicit scheduling and cancellation states",
    "persisted feedback outcome"
  ]
}, null, 2));
