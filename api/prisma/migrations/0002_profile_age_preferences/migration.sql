ALTER TABLE "Profile"
ADD COLUMN "age" INTEGER,
ADD COLUMN "preferredAgeMin" INTEGER NOT NULL DEFAULT 18,
ADD COLUMN "preferredAgeMax" INTEGER NOT NULL DEFAULT 30;

ALTER TABLE "Profile"
ADD CONSTRAINT "Profile_age_check" CHECK ("age" IS NULL OR ("age" >= 18 AND "age" <= 100)),
ADD CONSTRAINT "Profile_preferred_age_check" CHECK (
  "preferredAgeMin" >= 18
  AND "preferredAgeMax" <= 100
  AND "preferredAgeMin" <= "preferredAgeMax"
);
