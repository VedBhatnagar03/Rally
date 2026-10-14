CREATE TYPE "RefreshTokenRevocationReason" AS ENUM (
  'ROTATED',
  'LOGOUT',
  'PASSWORD_RESET',
  'ACCOUNT_CHANGE',
  'REUSE_DETECTED'
);

ALTER TABLE "RefreshToken"
ADD COLUMN "familyId" TEXT,
ADD COLUMN "revokedReason" "RefreshTokenRevocationReason";

UPDATE "RefreshToken" SET "familyId" = "id";

ALTER TABLE "RefreshToken" ALTER COLUMN "familyId" SET NOT NULL;

CREATE INDEX "RefreshToken_familyId_revokedAt_idx"
ON "RefreshToken"("familyId", "revokedAt");
