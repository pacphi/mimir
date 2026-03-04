-- AlterTable
ALTER TABLE "Instance" ADD COLUMN "geo_lat" DOUBLE PRECISION;
ALTER TABLE "Instance" ADD COLUMN "geo_lon" DOUBLE PRECISION;
ALTER TABLE "Instance" ADD COLUMN "geo_label" TEXT;
ALTER TABLE "Instance" ADD COLUMN "geo_source" TEXT;

-- CreateIndex
CREATE INDEX "Instance_geo_lat_geo_lon_status_idx" ON "Instance"("geo_lat", "geo_lon", "status");
