/* global FormData */
import { Blob, Buffer } from "node:buffer";
import { PrismaClient } from "@prisma/client";

const baseUrl = process.env.RALLY_API_BASE_URL ?? "http://localhost:4000";
const adminEmail = process.env.RALLY_SMOKE_ADMIN_EMAIL ?? "naman.test@illinois.edu";
const password = process.env.RALLY_SMOKE_PASSWORD ?? "correct-horse-battery-staple";
const smokePrisma = new PrismaClient();
let currentPolicyVersion;

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...options.headers
    }
  });

  const body = await response.json().catch(() => null);
  return { status: response.status, body, headers: response.headers };
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

async function patch(path, body, token) {
  return request(path, {
    method: "PATCH",
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
    body: JSON.stringify(body)
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
    displayName: prefix,
    isAtLeast18: true,
    policyVersion: currentPolicyVersion
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
      interests: ["Coffee", "Live music", "Campus events"],
      prompts: [
        {
          promptKey: "IDEAL_FIRST_RALLY",
          answer: "A relaxed tennis set followed by coffee."
        },
        {
          promptKey: "PERFECT_WEEKEND",
          answer: "A morning match and something live on campus."
        }
      ],
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

async function uploadProfilePhoto(userSession, concurrently = false) {
  const bytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64"
  );
  const intent = await post(
    "/v1/me/photos/upload-intents",
    { contentType: "image/png", sizeBytes: bytes.length },
    userSession.token
  );
  assertStatus("create photo upload intent", intent.status, 201);

  const form = new FormData();
  for (const [name, value] of Object.entries(intent.body.upload.fields)) form.append(name, value);
  form.append("file", new Blob([bytes], { type: "image/png" }), "profile.png");
  const upload = await fetch(intent.body.upload.url, { method: "POST", body: form });
  assertStatus("upload private profile photo", upload.status, 204);

  const completionPath = `/v1/me/photos/upload-intents/${intent.body.upload.id}/complete`;
  const attempts = concurrently
    ? await Promise.all([
        post(completionPath, {}, userSession.token),
        post(completionPath, {}, userSession.token)
      ])
    : [await post(completionPath, {}, userSession.token)];
  if (concurrently) {
    const statuses = attempts.map(({ status }) => status).sort();
    if (statuses[0] !== 200 || statuses[1] !== 201) {
      throw new Error(`concurrent photo finalization: expected 200 and 201, got ${statuses.join(", ")}`);
    }
  } else {
    assertStatus("finalize sanitized profile photo", attempts[0].status, 201);
  }
  const completed = attempts.find(({ status }) => status === 201) ?? attempts[0];
  if (
    completed.body.photo.contentType !== "image/webp" ||
    !completed.body.photo.url.endsWith(".webp")
  ) {
    throw new Error("finalize sanitized profile photo: expected a converted WebP asset");
  }
  return completed.body.photo;
}

const health = await get("/health");
assertStatus("health", health.status, 200);

const ready = await get("/ready");
assertStatus("ready", ready.status, 200);

const currentPolicy = await get("/v1/policies/current");
assertStatus("current policy metadata", currentPolicy.status, 200);
currentPolicyVersion = currentPolicy.body.policy?.version;
if (!currentPolicyVersion || currentPolicy.body.policy.minimumAge !== 18) {
  throw new Error("current policy metadata: expected version and 18+ minimum age");
}

const promptCatalog = await get("/v1/profile-options/prompts");
assertStatus("profile prompt catalog", promptCatalog.status, 200);
if (!Array.isArray(promptCatalog.body.prompts) || promptCatalog.body.prompts.length !== 6) {
  throw new Error("profile prompt catalog: expected six curated prompts");
}

const outdatedPolicy = await post("/v1/auth/register", {
  email: `outdated.${Date.now()}@illinois.edu`,
  password,
  displayName: "Outdated Policy",
  isAtLeast18: true,
  policyVersion: "outdated-policy"
});
assertStatus("reject outdated policy consent", outdatedPolicy.status, 409);

const nonUiuc = await post("/v1/auth/register", {
  email: `outsider.${Date.now()}@example.com`,
  password,
  displayName: "Outsider",
  isAtLeast18: true,
  policyVersion: currentPolicyVersion
});
assertStatus("non-UIUC register", nonUiuc.status, 400);

const adminLogin = await post("/v1/auth/login", {
  email: adminEmail,
  password
});
assertStatus("admin login", adminLogin.status, 200);

const migratedConsent = await post(
  "/v1/me/policy-consent",
  { isAtLeast18: true, policyVersion: currentPolicyVersion },
  adminLogin.body.token
);
assertStatus("record existing-account policy consent", migratedConsent.status, 200);
if (migratedConsent.body.consent.policyVersion !== currentPolicyVersion) {
  throw new Error("record existing-account policy consent: expected current policy version");
}

const refreshedAdmin = await post("/v1/auth/refresh", {
  refreshToken: adminLogin.body.refreshToken
});
assertStatus("refresh session", refreshedAdmin.status, 200);

const replayedRefresh = await post("/v1/auth/refresh", {
  refreshToken: adminLogin.body.refreshToken
});
assertStatus("reject refresh replay", replayedRefresh.status, 401);

const compromisedDescendant = await post("/v1/auth/refresh", {
  refreshToken: refreshedAdmin.body.refreshToken
});
assertStatus("revoke refresh family after replay", compromisedDescendant.status, 401);

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
const deactivating = await createVerifiedUser("deactivating");
const deleting = await createVerifiedUser("deleting");
const schedulerA = await createVerifiedUser("schedulerA");
const schedulerB = await createVerifiedUser("schedulerB");

const analyticsEvent = await post(
  "/v1/analytics/events",
  { name: "DISCOVERY_VIEWED", metadata: { candidateCount: 4 } },
  normal.token
);
assertStatus("record catalog analytics event", analyticsEvent.status, 201);
if (
  analyticsEvent.body.event.name !== "DISCOVERY_VIEWED" ||
  analyticsEvent.body.event.userId !== normal.user.id
) {
  throw new Error("record catalog analytics event: expected authenticated ownership");
}

const unsafeAnalyticsEvent = await post(
  "/v1/analytics/events",
  {
    name: "DISCOVERY_VIEWED",
    metadata: { candidateCount: 4, email: "private@illinois.edu" }
  },
  normal.token
);
assertStatus("reject unsafe analytics metadata", unsafeAnalyticsEvent.status, 400);

const unknownRecovery = await post("/v1/auth/forgot-password", {
  email: `missing.${Date.now()}@illinois.edu`
});
assertStatus("generic unknown-account recovery", unknownRecovery.status, 202);
if (unknownRecovery.body.devResetToken) {
  throw new Error("generic unknown-account recovery: must not issue a reset token");
}

const recovery = await post("/v1/auth/forgot-password", { email: normal.user.email });
assertStatus("request password reset", recovery.status, 202);
if (!recovery.body.devResetToken) {
  throw new Error("request password reset: expected development reset token");
}

const reusedPassword = await post("/v1/auth/reset-password", {
  token: recovery.body.devResetToken,
  password
});
assertStatus("reject reused password", reusedPassword.status, 400);

const recoveredPassword = "new-correct-horse-battery-staple";
const passwordReset = await post("/v1/auth/reset-password", {
  token: recovery.body.devResetToken,
  password: recoveredPassword
});
assertStatus("reset password", passwordReset.status, 204);

const resetReplay = await post("/v1/auth/reset-password", {
  token: recovery.body.devResetToken,
  password: "another-correct-horse-battery-staple"
});
assertStatus("reject reset token replay", resetReplay.status, 400);

const revokedByReset = await post("/v1/auth/refresh", { refreshToken: normal.refreshToken });
assertStatus("revoke sessions after password reset", revokedByReset.status, 401);

const oldPasswordLogin = await post("/v1/auth/login", {
  email: normal.user.email,
  password
});
assertStatus("reject old password", oldPasswordLogin.status, 401);

const recoveredLogin = await post("/v1/auth/login", {
  email: normal.user.email,
  password: recoveredPassword
});
assertStatus("login with recovered password", recoveredLogin.status, 200);

await completeProfile(schedulerA, "Scheduler A", [{ dayOfWeek: 2, startTime: "17:00", endTime: "20:00" }]);
await completeProfile(schedulerB, "Scheduler B", [{ dayOfWeek: 2, startTime: "18:00", endTime: "21:00" }]);

const recommendations = await get("/v1/recommendations", schedulerA.token);
assertStatus("explainable recommendations", recommendations.status, 200);
const schedulerRecommendation = recommendations.body.recommendations.find(
  (recommendation) => recommendation.userId === schedulerB.user.id
);
if (
  !schedulerRecommendation ||
  !Array.isArray(schedulerRecommendation.reasons) ||
  schedulerRecommendation.reasons.length === 0 ||
  !Array.isArray(schedulerRecommendation.breakdown) ||
  schedulerRecommendation.breakdown.length !== 5 ||
  schedulerRecommendation.profile?.prompts?.length !== 2 ||
  schedulerRecommendation.profile?.interests?.length !== 3 ||
  !Array.isArray(schedulerRecommendation.profile?.photos) ||
  schedulerRecommendation.profile?.sports?.some((sport) => "userId" in sport || "id" in sport) ||
  schedulerRecommendation.profile?.photos?.some((photo) => "storageKey" in photo || "userId" in photo) ||
  "interestedIn" in schedulerRecommendation.profile ||
  "availability" in schedulerRecommendation.profile
) {
  throw new Error("explainable recommendations: expected reasons and a privacy-shaped discovery profile");
}

await completeProfile(normal, "Normal User", [{ dayOfWeek: 2, startTime: "17:00", endTime: "20:00" }]);
await completeProfile(other, "Other User", [{ dayOfWeek: 2, startTime: "18:00", endTime: "21:00" }]);

const firstPhoto = await uploadProfilePhoto(normal);
const secondPhoto = await uploadProfilePhoto(normal);
const publishedPhoto = await fetch(firstPhoto.url);
assertStatus("read published profile photo", publishedPhoto.status, 200);
if (publishedPhoto.headers.get("content-type") !== "image/webp") {
  throw new Error("read published profile photo: expected image/webp");
}

const reorderedPhotos = await request("/v1/me/photos/order", {
  method: "PATCH",
  headers: { authorization: `Bearer ${normal.token}` },
  body: JSON.stringify({ photoIds: [secondPhoto.id, firstPhoto.id] })
});
assertStatus("reorder profile photos", reorderedPhotos.status, 200);
if (reorderedPhotos.body.photos[0].id !== secondPhoto.id) {
  throw new Error("reorder profile photos: expected requested primary photo");
}

const unauthorizedPhotoDelete = await request(`/v1/me/photos/${firstPhoto.id}`, {
  method: "DELETE",
  headers: { authorization: `Bearer ${other.token}` }
});
assertStatus("reject another user's photo deletion", unauthorizedPhotoDelete.status, 404);
const deletedPhoto = await request(`/v1/me/photos/${firstPhoto.id}`, {
  method: "DELETE",
  headers: { authorization: `Bearer ${normal.token}` }
});
assertStatus("delete owned profile photo", deletedPhoto.status, 204);

const concurrentPhoto = await uploadProfilePhoto(normal, true);
assertStatus("retain concurrently finalized photo", (await fetch(concurrentPhoto.url)).status, 200);

const dataExport = await get("/v1/me/export", normal.token);
assertStatus("export account data", dataExport.status, 200);
if (
  dataExport.body.account?.email !== normal.user.email ||
  !dataExport.headers.get("content-disposition")?.includes("rally-data-export-")
) {
  throw new Error("export account data: expected account identity and attachment filename");
}
const serializedExport = JSON.stringify(dataExport.body);
for (const forbiddenField of ["passwordHash", "tokenHash", "refreshToken", "operationalIncident"]) {
  if (serializedExport.includes(forbiddenField)) {
    throw new Error(`export account data: included forbidden field ${forbiddenField}`);
  }
}

const adminSummary = await get("/v1/admin/summary?windowDays=7", adminLogin.body.token);
assertStatus("admin summary", adminSummary.status, 200);
if (
  adminSummary.body.summary.window?.days !== 7 ||
  adminSummary.body.summary.window.activeUsers < 1 ||
  typeof adminSummary.body.summary.window.outcomes?.completedRalliesPerActiveUser !== "number" ||
  typeof adminSummary.body.summary.window.funnel?.conversionPercent?.sentToAccepted !== "number" ||
  typeof adminSummary.body.summary.operations?.pendingOver48Hours !== "number"
) {
  throw new Error("admin summary: expected founder funnel and operational metrics");
}

const normalSummary = await get("/v1/admin/summary", normal.token);
assertStatus("normal admin rejection", normalSummary.status, 403);

const forcedError = await post("/v1/dev/errors", {});
assertStatus("capture development incident", forcedError.status, 500);

const incidents = await get("/v1/admin/incidents?status=OPEN&limit=10", adminLogin.body.token);
assertStatus("list operational incidents", incidents.status, 200);
const smokeIncident = incidents.body.incidents.find(
  (incident) => incident.errorCode === "DEV_SMOKE_ERROR"
);
if (!smokeIncident || smokeIncident.route !== "/v1/dev/errors") {
  throw new Error("list operational incidents: expected sanitized development incident");
}

const resolvedIncident = await request(`/v1/admin/incidents/${smokeIncident.id}/resolve`, {
  method: "PATCH",
  headers: { authorization: `Bearer ${adminLogin.body.token}` },
  body: JSON.stringify({ resolutionNote: "Verified by the backend smoke suite" })
});
assertStatus("resolve operational incident", resolvedIncident.status, 200);
if (!resolvedIncident.body.incident.resolvedAt || !resolvedIncident.body.incident.resolvedById) {
  throw new Error("resolve operational incident: expected resolution attribution");
}

const rallyCancelledByBlock = await post(
  "/v1/rallies",
  {
    receiverId: other.user.id,
    sport: "TENNIS",
    proposedStartAt: new Date(Date.now() + 86_400_000).toISOString(),
    proposedEndAt: new Date(Date.now() + 90_000_000).toISOString()
  },
  normal.token
);
assertStatus("create rally before block", rallyCancelledByBlock.status, 201);

const block = await post(
  "/v1/safety/blocks",
  {
    blockedUserId: other.user.id,
    reason: "smoke test"
  },
  normal.token
);
assertStatus("block user", block.status, 201);

const normalRallies = await get("/v1/rallies", normal.token);
assertStatus("list rallies after block", normalRallies.status, 200);
const blockedPairRally = normalRallies.body.rallies.find(
  (entry) => entry.id === rallyCancelledByBlock.body.rally.id
);
if (!blockedPairRally || blockedPairRally.status !== "CANCELLED") {
  throw new Error("block user: expected the active Rally to be cancelled");
}
const rallyReadPayload = JSON.stringify(blockedPairRally);
for (const privateField of [
  "email",
  "passwordHash",
  "interestedIn",
  "preferredAgeMin",
  "preferredAgeMax",
  "trustScore",
  "availability",
  "storageKey"
]) {
  if (rallyReadPayload.includes(`"${privateField}"`)) {
    throw new Error(`secure Rally read: leaked private field ${privateField}`);
  }
}
if (
  blockedPairRally.sender?.displayName !== "Normal User" ||
  blockedPairRally.receiver?.displayName !== "Other User"
) {
  throw new Error("secure Rally read: expected public participant summaries");
}

const rallyDetail = await get(`/v1/rallies/${blockedPairRally.id}`, normal.token);
assertStatus("read Rally detail as participant", rallyDetail.status, 200);
const hiddenRallyDetail = await get(`/v1/rallies/${blockedPairRally.id}`, schedulerA.token);
assertStatus("hide Rally detail from nonparticipant", hiddenRallyDetail.status, 404);

const report = await post(
  "/v1/safety/reports",
  {
    reportedUserId: other.user.id,
    rallyId: rallyCancelledByBlock.body.rally.id,
    category: "UNSAFE_BEHAVIOR",
    details: "Smoke test moderation report"
  },
  normal.token
);
assertStatus("create moderation report", report.status, 201);

const unrelatedReport = await post(
  "/v1/safety/reports",
  {
    reportedUserId: other.user.id,
    rallyId: rallyCancelledByBlock.body.rally.id,
    category: "OTHER",
    details: "This reporter did not participate in the Rally"
  },
  schedulerA.token
);
assertStatus("reject unrelated rally report", unrelatedReport.status, 400);

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

const normalAuditLogs = await get("/v1/admin/audit-logs", normal.token);
assertStatus("normal audit log rejection", normalAuditLogs.status, 403);

const auditLogPage = await get(
  `/v1/admin/audit-logs?action=admin.user_status_updated&actorUserId=${adminLogin.body.user.id}&limit=1`,
  adminLogin.body.token
);
assertStatus("admin audit log inspection", auditLogPage.status, 200);
if (
  auditLogPage.body.auditLogs.length !== 1 ||
  auditLogPage.body.auditLogs[0].action !== "admin.user_status_updated" ||
  auditLogPage.body.auditLogs[0].user?.id !== adminLogin.body.user.id ||
  !auditLogPage.body.nextCursor
) {
  throw new Error("admin audit log inspection: expected a filtered first page and cursor");
}

const olderAuditLogPage = await get(
  `/v1/admin/audit-logs?action=admin.user_status_updated&actorUserId=${adminLogin.body.user.id}&limit=1&cursor=${auditLogPage.body.nextCursor}`,
  adminLogin.body.token
);
assertStatus("admin audit log pagination", olderAuditLogPage.status, 200);
if (olderAuditLogPage.body.auditLogs.length !== 1) {
  throw new Error("admin audit log pagination: expected an older matching event");
}

const deactivated = await post(
  "/v1/me/deactivate",
  { password, reason: "Smoke test deactivation" },
  deactivating.token
);
assertStatus("deactivate account", deactivated.status, 200);
assertStatus("deactivated access rejection", (await get("/v1/me", deactivating.token)).status, 401);
assertStatus(
  "deactivated refresh rejection",
  (await post("/v1/auth/refresh", { refreshToken: deactivating.refreshToken })).status,
  401
);

const deletingPhoto = await uploadProfilePhoto(deleting);
const deleted = await request("/v1/me", {
  method: "DELETE",
  headers: { authorization: `Bearer ${deleting.token}` },
  body: JSON.stringify({ password, confirmation: "DELETE" })
});
assertStatus("delete account", deleted.status, 204);
assertStatus("deleted access rejection", (await get("/v1/me", deleting.token)).status, 401);
assertStatus("deleted account photo removal", (await fetch(deletingPhoto.url)).status, 404);
assertStatus(
  "deleted login rejection",
  (await post("/v1/auth/login", { email: deleting.user.email, password })).status,
  401
);

const adminUsers = await get("/v1/admin/users?limit=100", adminLogin.body.token);
assertStatus("admin user inspection", adminUsers.status, 200);
const anonymized = adminUsers.body.users.find((user) => user.id === deleting.user.id);
if (!anonymized || anonymized.status !== "DELETED" || !anonymized.email.endsWith("@deleted.invalid")) {
  throw new Error("delete account: expected anonymized retained identity");
}

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

const blocks = await get("/v1/safety/blocks", normal.token);
assertStatus("list blocks", blocks.status, 200);
if (!blocks.body.blocks.some((entry) => entry.blockedId === other.user.id)) {
  throw new Error("list blocks: expected blocked user");
}

const unblocked = await request(`/v1/safety/blocks/${other.user.id}`, {
  method: "DELETE",
  headers: { authorization: `Bearer ${normal.token}` }
});
assertStatus("unblock user", unblocked.status, 204);

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

const activePairRecommendations = await get("/v1/recommendations", schedulerA.token);
assertStatus("list recommendations during active Rally", activePairRecommendations.status, 200);
if (
  activePairRecommendations.body.recommendations.some(
    (recommendation) => recommendation.userId === schedulerB.user.id
  )
) {
  throw new Error("active Rally discovery: expected the active pair to be excluded");
}

const receivedNotifications = await get("/v1/notifications?unreadOnly=true", schedulerB.token);
assertStatus("list unread notifications", receivedNotifications.status, 200);
const received = receivedNotifications.body.notifications.filter(
  (notification) =>
    notification.rallyId === rally.body.rally.id && notification.type === "RALLY_RECEIVED"
);
if (received.length !== 1 || receivedNotifications.body.unreadCount < 1) {
  throw new Error("create Rally notification: expected one unread receiver notification");
}

const duplicateRally = await post(
  "/v1/rallies",
  {
    receiverId: schedulerA.user.id,
    sport: "TENNIS",
    proposedStartAt: new Date(Date.now() + 172_800_000).toISOString(),
    proposedEndAt: new Date(Date.now() + 176_400_000).toISOString()
  },
  schedulerB.token
);
assertStatus("reject duplicate active rally", duplicateRally.status, 409);

const pastRally = await post(
  "/v1/rallies",
  {
    receiverId: schedulerB.user.id,
    sport: "TENNIS",
    proposedStartAt: new Date(Date.now() - 7_200_000).toISOString(),
    proposedEndAt: new Date(Date.now() - 3_600_000).toISOString()
  },
  schedulerA.token
);
assertStatus("reject past rally window", pastRally.status, 400);

const acceptAttempts = await Promise.all([
  post(`/v1/rallies/${rally.body.rally.id}/respond`, { status: "ACCEPTED" }, schedulerB.token),
  post(`/v1/rallies/${rally.body.rally.id}/respond`, { status: "ACCEPTED" }, schedulerB.token)
]);
const acceptStatuses = acceptAttempts.map(({ status }) => status).sort();
if (acceptStatuses[0] !== 200 || acceptStatuses[1] !== 409) {
  throw new Error(`atomic accept: expected one 200 and one 409, got ${acceptStatuses.join(", ")}`);
}

const acceptedNotifications = await get("/v1/notifications", schedulerA.token);
const accepted = acceptedNotifications.body.notifications.filter(
  (notification) =>
    notification.rallyId === rally.body.rally.id && notification.type === "RALLY_ACCEPTED"
);
if (accepted.length !== 1) {
  throw new Error("atomic accept notification: expected exactly one sender notification");
}

const scheduleBody = {
  proposedStartAt: dateTimeForSuggestion(selectedSuggestion, selectedSuggestion.startTime),
  proposedEndAt: dateTimeForSuggestion(selectedSuggestion, selectedSuggestion.endTime),
  venueId: selectedSuggestion.venue.id
};
const scheduleAttempts = await Promise.all([
  post(`/v1/rallies/${rally.body.rally.id}/schedule`, scheduleBody, schedulerA.token),
  post(`/v1/rallies/${rally.body.rally.id}/schedule`, scheduleBody, schedulerB.token)
]);
const scheduleStatuses = scheduleAttempts.map(({ status }) => status).sort();
if (scheduleStatuses[0] !== 200 || scheduleStatuses[1] !== 409) {
  throw new Error(`atomic schedule: expected one 200 and one 409, got ${scheduleStatuses.join(", ")}`);
}
const scheduled = scheduleAttempts.find(({ status }) => status === 200);

if (scheduled.body.rally.venueId !== selectedSuggestion.venue.id) {
  throw new Error("select persisted schedule: expected venue to persist");
}
if (scheduled.body.rally.status !== "SCHEDULED") {
  throw new Error("select persisted schedule: expected explicit SCHEDULED state");
}

const [scheduledNotificationsA, scheduledNotificationsB] = await Promise.all([
  get("/v1/notifications", schedulerA.token),
  get("/v1/notifications", schedulerB.token)
]);
const scheduledNotificationCount = [scheduledNotificationsA, scheduledNotificationsB]
  .flatMap(({ body }) => body.notifications)
  .filter(
    (notification) =>
      notification.rallyId === rally.body.rally.id && notification.type === "RALLY_SCHEDULED"
  ).length;
if (scheduledNotificationCount !== 1) {
  throw new Error("atomic schedule notification: expected exactly one other-participant notification");
}

const invalidBookingState = await post(
  `/v1/rallies/${rally.body.rally.id}/court-booking`,
  { courtStatus: "NEEDS_USER_ACTION" },
  schedulerA.token
);
assertStatus("reject internal court state", invalidBookingState.status, 400);

const unavailableBooking = await post(
  `/v1/rallies/${rally.body.rally.id}/court-booking`,
  { courtStatus: "UNAVAILABLE" },
  schedulerA.token
);
assertStatus("record unavailable court", unavailableBooking.status, 200);

const bookingAttempts = await Promise.all([
  post(
    `/v1/rallies/${rally.body.rally.id}/court-booking`,
    { courtStatus: "BOOKED", bookingReference: "booking-a" },
    schedulerA.token
  ),
  post(
    `/v1/rallies/${rally.body.rally.id}/court-booking`,
    { courtStatus: "BOOKED", bookingReference: "booking-b" },
    schedulerB.token
  )
]);
const bookingStatuses = bookingAttempts.map(({ status }) => status).sort();
if (bookingStatuses[0] !== 200 || bookingStatuses[1] !== 409) {
  throw new Error(`atomic court booking: expected one 200 and one 409, got ${bookingStatuses.join(", ")}`);
}
const bookingWinnerIndex = bookingAttempts.findIndex(({ status }) => status === 200);
const bookingWinner = bookingWinnerIndex === 0 ? schedulerA : schedulerB;
const bookingLoser = bookingWinnerIndex === 0 ? schedulerB : schedulerA;
const winningReference = bookingWinnerIndex === 0 ? "booking-a" : "booking-b";

const repeatedBooking = await post(
  `/v1/rallies/${rally.body.rally.id}/court-booking`,
  { courtStatus: "BOOKED", bookingReference: winningReference },
  bookingWinner.token
);
assertStatus("retry identical court booking", repeatedBooking.status, 200);

const overwrittenBooking = await post(
  `/v1/rallies/${rally.body.rally.id}/court-booking`,
  { courtStatus: "BOOKED", bookingReference: winningReference },
  bookingLoser.token
);
assertStatus("reject court booking owner overwrite", overwrittenBooking.status, 409);

const earlyCompletion = await post(
  `/v1/rallies/${rally.body.rally.id}/complete`,
  {},
  schedulerA.token
);
assertStatus("reject completion before scheduled start", earlyCompletion.status, 409);

await smokePrisma.rally.update({
  where: { id: rally.body.rally.id },
  data: {
    proposedStartAt: new Date(Date.now() - 3_600_000),
    proposedEndAt: new Date(Date.now() - 1_800_000)
  }
});

const completionAttempts = await Promise.all([
  post(`/v1/rallies/${rally.body.rally.id}/complete`, {}, schedulerA.token),
  post(`/v1/rallies/${rally.body.rally.id}/complete`, {}, schedulerB.token)
]);
for (const completion of completionAttempts) {
  assertStatus("idempotent concurrent completion", completion.status, 200);
}
if (completionAttempts[0].body.rally.completedAt !== completionAttempts[1].body.rally.completedAt) {
  throw new Error("idempotent concurrent completion: expected one persisted completion timestamp");
}

const completedPairRecommendations = await get("/v1/recommendations", schedulerA.token);
assertStatus("list recommendations after completed Rally", completedPairRecommendations.status, 200);
if (
  !completedPairRecommendations.body.recommendations.some(
    (recommendation) => recommendation.userId === schedulerB.user.id
  )
) {
  throw new Error("completed Rally discovery: expected the terminal pair to be eligible again");
}

const [completedNotificationsA, completedNotificationsB] = await Promise.all([
  get("/v1/notifications", schedulerA.token),
  get("/v1/notifications", schedulerB.token)
]);
for (const notifications of [completedNotificationsA, completedNotificationsB]) {
  const completed = notifications.body.notifications.filter(
    (notification) =>
      notification.rallyId === rally.body.rally.id && notification.type === "RALLY_COMPLETED"
  );
  if (completed.length !== 1) {
    throw new Error("idempotent completion notification: expected one notification per participant");
  }
}

const feedbackA = await post(
  `/v1/feedback/rallies/${rally.body.rally.id}`,
  {
    played: true,
    feltSafe: false,
    rallyAgain: true,
    experienceScore: 3,
    notes: "Please follow up privately about the venue interaction."
  },
  schedulerA.token
);
assertStatus("submit first feedback", feedbackA.status, 200);
if (!feedbackA.body.safetyFollowUpCreated || "report" in feedbackA.body) {
  throw new Error("unsafe feedback: expected a confidential follow-up acknowledgement only");
}

const repeatedUnsafeFeedback = await post(
  `/v1/feedback/rallies/${rally.body.rally.id}`,
  {
    played: true,
    feltSafe: false,
    rallyAgain: true,
    experienceScore: 3,
    notes: "Please follow up privately about the venue interaction."
  },
  schedulerA.token
);
assertStatus("retry unsafe feedback", repeatedUnsafeFeedback.status, 200);

const changedFeedback = await post(
  `/v1/feedback/rallies/${rally.body.rally.id}`,
  {
    played: true,
    feltSafe: true,
    rallyAgain: false,
    experienceScore: 5,
    notes: "Attempt to revise a final response."
  },
  schedulerA.token
);
assertStatus("reject changed final feedback", changedFeedback.status, 409);

const feedbackBAttempts = await Promise.all([
  post(
    `/v1/feedback/rallies/${rally.body.rally.id}`,
    { played: true, feltSafe: true, rallyAgain: true, experienceScore: 5 },
    schedulerB.token
  ),
  post(
    `/v1/feedback/rallies/${rally.body.rally.id}`,
    { played: true, feltSafe: true, rallyAgain: true, experienceScore: 5 },
    schedulerB.token
  )
]);
for (const attempt of feedbackBAttempts) {
  assertStatus("submit concurrent identical feedback", attempt.status, 200);
}
if (feedbackBAttempts[0].body.feedback.id !== feedbackBAttempts[1].body.feedback.id) {
  throw new Error("concurrent identical feedback: expected one persisted response");
}

const outcome = await get(`/v1/feedback/rallies/${rally.body.rally.id}/outcome`, schedulerA.token);
assertStatus("read rally outcome", outcome.status, 200);

if (!outcome.body.outcome.bothResponded || !outcome.body.outcome.isMutualMatch) {
  throw new Error("read rally outcome: expected mutual match after two yes feedback entries");
}

const safetyReports = await get("/v1/admin/reports?limit=100", adminLogin.body.token);
assertStatus("surface unsafe feedback in founder queue", safetyReports.status, 200);
const generatedSafetyReports = safetyReports.body.reports.filter(
  (entry) =>
    entry.rallyId === rally.body.rally.id &&
    entry.reporterId === schedulerA.user.id &&
    entry.sourceFeedbackId === feedbackA.body.feedback.id
);
if (
  generatedSafetyReports.length !== 1 ||
  generatedSafetyReports[0].reportedUserId !== schedulerB.user.id ||
  generatedSafetyReports[0].category !== "UNSAFE_BEHAVIOR"
) {
  throw new Error("unsafe feedback: expected one deduplicated founder safety report");
}

const [mutualNotificationsA, mutualNotificationsB] = await Promise.all([
  get("/v1/notifications", schedulerA.token),
  get("/v1/notifications", schedulerB.token)
]);
for (const notifications of [mutualNotificationsA, mutualNotificationsB]) {
  const mutual = notifications.body.notifications.filter(
    (notification) =>
      notification.rallyId === rally.body.rally.id && notification.type === "MUTUAL_RALLY_AGAIN"
  );
  if (mutual.length !== 1) {
    throw new Error("mutual Rally notification: expected one notification per participant");
  }
}

const markedRead = await patch(
  `/v1/notifications/${accepted[0].id}/read`,
  {},
  schedulerA.token
);
assertStatus("mark notification read", markedRead.status, 204);
const readAll = await post("/v1/notifications/read-all", {}, schedulerA.token);
assertStatus("mark all notifications read", readAll.status, 200);
const unreadAfterReadAll = await get("/v1/notifications?unreadOnly=true", schedulerA.token);
if (unreadAfterReadAll.body.unreadCount !== 0 || unreadAfterReadAll.body.notifications.length !== 0) {
  throw new Error("mark all notifications read: expected an empty unread inbox");
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

const acceptedCancellable = await post(
  `/v1/rallies/${cancellable.body.rally.id}/respond`,
  { status: "ACCEPTED" },
  schedulerB.token
);
assertStatus("accept cancellable rally", acceptedCancellable.status, 200);

const scheduledCancellable = await post(
  `/v1/rallies/${cancellable.body.rally.id}/schedule`,
  scheduleBody,
  schedulerA.token
);
assertStatus("schedule cancellable rally", scheduledCancellable.status, 200);

const bookedCancellable = await post(
  `/v1/rallies/${cancellable.body.rally.id}/court-booking`,
  { courtStatus: "BOOKED", courtNumber: "7", bookingReference: "cancel-handoff" },
  schedulerA.token
);
assertStatus("book cancellable rally", bookedCancellable.status, 200);

const cancelAttempts = await Promise.all([
  post(`/v1/rallies/${cancellable.body.rally.id}/cancel`, { reason: "Plans changed" }, schedulerA.token),
  post(`/v1/rallies/${cancellable.body.rally.id}/cancel`, { reason: "Plans changed" }, schedulerB.token)
]);
const cancelStatuses = cancelAttempts.map(({ status }) => status).sort();
if (cancelStatuses[0] !== 200 || cancelStatuses[1] !== 409) {
  throw new Error(`atomic cancellation: expected one 200 and one 409, got ${cancelStatuses.join(", ")}`);
}
const cancelled = cancelAttempts.find(({ status }) => status === 200);
if (
  cancelled.body.rally.status !== "CANCELLED" ||
  ![schedulerA.user.id, schedulerB.user.id].includes(cancelled.body.rally.cancelledById) ||
  cancelled.body.rally.cancellationReason !== "Plans changed" ||
  cancelled.body.rally.courtStatus !== "BOOKED" ||
  cancelled.body.rally.bookingOwnerId !== schedulerA.user.id ||
  cancelled.body.rally.courtNumber !== "7" ||
  cancelled.body.rally.bookingReference !== "cancel-handoff"
) {
  throw new Error("cancel rally: expected status, actor, reason, and booking handoff to persist");
}

const cancellationRecipient = cancelled.body.rally.cancelledById === schedulerA.user.id
  ? schedulerB
  : schedulerA;
const cancellationNotifications = await get("/v1/notifications", cancellationRecipient.token);
const cancellationCount = cancellationNotifications.body.notifications.filter(
  (notification) =>
    notification.rallyId === cancellable.body.rally.id && notification.type === "RALLY_CANCELLED"
).length;
if (cancellationCount !== 1) {
  throw new Error("atomic cancellation notification: expected one other-participant notification");
}

const firstHistoryPage = await get("/v1/rallies?limit=1", schedulerA.token);
assertStatus("list first Rally history page", firstHistoryPage.status, 200);
if (firstHistoryPage.body.rallies.length !== 1 || !firstHistoryPage.body.nextCursor) {
  throw new Error("Rally history pagination: expected one item and a next cursor");
}
const secondHistoryPage = await get(
  `/v1/rallies?limit=1&cursor=${firstHistoryPage.body.nextCursor}`,
  schedulerA.token
);
assertStatus("list second Rally history page", secondHistoryPage.status, 200);
if (
  secondHistoryPage.body.rallies.length !== 1 ||
  secondHistoryPage.body.rallies[0].id === firstHistoryPage.body.rallies[0].id
) {
  throw new Error("Rally history pagination: expected a distinct second item");
}

const foreignHistoryCursor = await get(
  `/v1/rallies?cursor=${blockedPairRally.id}`,
  schedulerA.token
);
assertStatus("reject another participant's Rally cursor", foreignHistoryCursor.status, 400);

const acceptCancelled = await post(
  `/v1/rallies/${cancellable.body.rally.id}/respond`,
  { status: "ACCEPTED" },
  schedulerB.token
);
assertStatus("reject cancelled rally transition", acceptCancelled.status, 409);

await smokePrisma.$disconnect();

console.log(JSON.stringify({
  ok: true,
  checks: [
    "health",
    "ready",
    "versioned 18+ policy consent",
    "non-UIUC rejection",
    "privacy-safe catalog analytics ingestion",
    "verification resend and superseded-token rejection",
    "refresh rotation and replay rejection",
    "refresh-token family replay containment",
    "logout revocation",
    "single-use password recovery and session revocation",
    "admin authorization",
    "founder funnel and operational metrics",
    "normal admin rejection",
    "filtered paginated founder audit visibility",
    "operational incident capture and resolution",
    "founder report resolution and user suspension",
    "block enforcement",
    "block cancellation and report relationship integrity",
    "privacy-safe participant-authorized Rally reads",
    "bounded participant-scoped Rally history",
    "account deactivation, deletion, and unblock",
    "privacy-safe account data export",
    "sanitized profile photo upload and ownership",
    "mutual filters and explainable recommendations",
    "actionable discovery excludes active Rally pairs",
    "profile prompts, interests, and discovery details",
    "schedule suggestions",
    "persisted rally lifecycle",
    "duplicate and invalid Rally rejection",
    "explicit scheduling and cancellation states",
    "atomic immutable court booking ownership",
    "external booking handoff survives cancellation",
    "scheduled-start completion boundary",
    "atomic concurrent Rally transitions",
    "persisted feedback outcome",
    "immutable idempotent feedback decisions",
    "confidential deduplicated safety-check escalation",
    "durable lifecycle notifications"
  ]
}, null, 2));
