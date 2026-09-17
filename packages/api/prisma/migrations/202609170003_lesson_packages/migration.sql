-- AlterTable
ALTER TABLE "EntitlementEntry" ADD COLUMN     "packageId" TEXT,
ADD COLUMN     "packageSnapshot" JSONB;

-- CreateTable
CREATE TABLE "LessonPackage" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "priceAudCents" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "LessonPackage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LessonPackage_active_name_id_idx" ON "LessonPackage"("active", "name", "id");

-- AddForeignKey
ALTER TABLE "EntitlementEntry" ADD CONSTRAINT "EntitlementEntry_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "LessonPackage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "LessonPackage" ADD CONSTRAINT "LessonPackage_values_check" CHECK ("quantity" BETWEEN 1 AND 10000 AND "priceAudCents" > 0 AND "version" >= 1);
ALTER TABLE "EntitlementEntry" ADD CONSTRAINT "EntitlementEntry_package_check" CHECK (
  ("packageId" IS NULL AND "packageSnapshot" IS NULL) OR
  ("packageId" IS NOT NULL AND "packageSnapshot" IS NOT NULL AND jsonb_typeof("packageSnapshot") = 'object' AND "kind" = 'PURCHASE' AND "bucket" = 'REGULAR')
);
