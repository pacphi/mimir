-- AlterTable
ALTER TABLE "Instance" ADD COLUMN "distro" TEXT;

-- CreateIndex
CREATE INDEX "Instance_distro_idx" ON "Instance"("distro");
