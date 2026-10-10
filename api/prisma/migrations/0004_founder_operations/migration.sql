ALTER TABLE "Rally"
ADD COLUMN "acceptedAt" TIMESTAMP(3),
ADD COLUMN "scheduledAt" TIMESTAMP(3),
ADD COLUMN "completedAt" TIMESTAMP(3);

UPDATE "Rally" SET "acceptedAt" = "updatedAt"
WHERE "status" IN ('ACCEPTED', 'SCHEDULED', 'COMPLETED');

UPDATE "Rally" SET "scheduledAt" = "updatedAt"
WHERE "status" IN ('SCHEDULED', 'COMPLETED');

UPDATE "Rally" SET "completedAt" = "updatedAt"
WHERE "status" = 'COMPLETED';

ALTER TABLE "Report"
ADD COLUMN "resolutionNote" TEXT,
ADD COLUMN "resolvedAt" TIMESTAMP(3),
ADD COLUMN "resolvedById" TEXT;
