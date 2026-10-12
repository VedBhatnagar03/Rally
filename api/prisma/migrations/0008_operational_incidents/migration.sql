CREATE TABLE "OperationalIncident" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "method" TEXT NOT NULL,
  "route" TEXT NOT NULL,
  "statusCode" INTEGER NOT NULL DEFAULT 500,
  "errorName" TEXT NOT NULL,
  "errorCode" TEXT,
  "userId" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "resolutionNote" TEXT,
  "resolvedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OperationalIncident_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OperationalIncident_requestId_key"
ON "OperationalIncident"("requestId");

CREATE INDEX "OperationalIncident_resolvedAt_createdAt_idx"
ON "OperationalIncident"("resolvedAt", "createdAt");

CREATE INDEX "OperationalIncident_errorName_createdAt_idx"
ON "OperationalIncident"("errorName", "createdAt");
