ALTER TABLE "Report" ADD COLUMN "sourceFeedbackId" TEXT;

CREATE UNIQUE INDEX "Report_sourceFeedbackId_key" ON "Report"("sourceFeedbackId");

ALTER TABLE "Report"
ADD CONSTRAINT "Report_sourceFeedbackId_fkey"
FOREIGN KEY ("sourceFeedbackId") REFERENCES "RallyFeedback"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
