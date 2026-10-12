-- Keep only the newest active Rally for each pair before enforcing the invariant.
WITH ranked_active_rallies AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY LEAST("senderId", "receiverId"), GREATEST("senderId", "receiverId")
      ORDER BY "createdAt" DESC, "id" DESC
    ) AS pair_rank
  FROM "Rally"
  WHERE "status" IN ('PENDING', 'ACCEPTED', 'SCHEDULED')
)
UPDATE "Rally"
SET
  "status" = 'CANCELLED',
  "cancelledAt" = CURRENT_TIMESTAMP,
  "cancellationReason" = 'Superseded while enforcing one active Rally per pair',
  "courtStatus" = 'NOT_STARTED'
WHERE "id" IN (
  SELECT "id" FROM ranked_active_rallies WHERE pair_rank > 1
);

CREATE UNIQUE INDEX "Rally_one_active_per_pair_key"
ON "Rally" (
  LEAST("senderId", "receiverId"),
  GREATEST("senderId", "receiverId")
)
WHERE "status" IN ('PENDING', 'ACCEPTED', 'SCHEDULED');
