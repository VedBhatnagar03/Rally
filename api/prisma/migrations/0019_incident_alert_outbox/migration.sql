ALTER TABLE "OperationalIncident"
ADD COLUMN "alertDeliveredAt" TIMESTAMP(3),
ADD COLUMN "alertAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "alertLastAttemptAt" TIMESTAMP(3),
ADD COLUMN "alertNextAttemptAt" TIMESTAMP(3),
ADD COLUMN "alertLastError" TEXT;

CREATE INDEX "OperationalIncident_alertDeliveredAt_alertNextAttemptAt_alertAttempts_idx"
ON "OperationalIncident"("alertDeliveredAt", "alertNextAttemptAt", "alertAttempts");
