ALTER TABLE "Photo"
ADD COLUMN "storageKey" TEXT,
ADD COLUMN "contentType" TEXT,
ADD COLUMN "sizeBytes" INTEGER;

CREATE UNIQUE INDEX "Photo_storageKey_key" ON "Photo"("storageKey");

CREATE TABLE "PhotoUpload" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "objectKey" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PhotoUpload_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PhotoUpload_objectKey_key" ON "PhotoUpload"("objectKey");
CREATE INDEX "PhotoUpload_userId_expiresAt_idx" ON "PhotoUpload"("userId", "expiresAt");

ALTER TABLE "PhotoUpload"
ADD CONSTRAINT "PhotoUpload_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
