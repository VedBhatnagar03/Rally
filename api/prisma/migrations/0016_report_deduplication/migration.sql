ALTER TABLE "Report" ADD COLUMN "dedupeKey" TEXT;

CREATE UNIQUE INDEX "Report_dedupeKey_key" ON "Report"("dedupeKey");
