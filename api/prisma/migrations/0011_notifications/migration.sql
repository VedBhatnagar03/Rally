CREATE TYPE "NotificationType" AS ENUM (
  'RALLY_RECEIVED',
  'RALLY_ACCEPTED',
  'RALLY_DECLINED',
  'RALLY_SCHEDULED',
  'RALLY_CANCELLED',
  'RALLY_COMPLETED',
  'MUTUAL_RALLY_AGAIN'
);

CREATE TABLE "Notification" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" "NotificationType" NOT NULL,
  "rallyId" TEXT NOT NULL,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Notification_userId_type_rallyId_key"
ON "Notification"("userId", "type", "rallyId");

CREATE INDEX "Notification_userId_readAt_createdAt_idx"
ON "Notification"("userId", "readAt", "createdAt");

ALTER TABLE "Notification"
ADD CONSTRAINT "Notification_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Notification"
ADD CONSTRAINT "Notification_rallyId_fkey"
FOREIGN KEY ("rallyId") REFERENCES "Rally"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
