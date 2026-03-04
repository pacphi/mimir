/**
 * One-time backfill script: resolves geographic coordinates for all instances
 * that have `geo_lat IS NULL` using the region coordinate registry.
 *
 * Run: pnpm --filter api exec tsx scripts/backfill-geo.ts
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { resolveRegionCoords } from "../src/services/geo/region-coords.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL must be set");
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString });
const db = new PrismaClient({ adapter });

async function main() {
  const instances = await db.instance.findMany({
    where: { geo_lat: null },
    select: { id: true, name: true, region: true, provider: true },
  });

  console.log(`Found ${instances.length} instances without geo data`);

  let updated = 0;
  let skipped = 0;

  for (const inst of instances) {
    const coords = resolveRegionCoords(inst.region, inst.provider);
    if (!coords) {
      console.log(
        `  SKIP ${inst.name} (${inst.provider}/${inst.region ?? "null"}) — no coordinates`,
      );
      skipped++;
      continue;
    }

    await db.instance.update({
      where: { id: inst.id },
      data: {
        geo_lat: coords.lat,
        geo_lon: coords.lon,
        geo_label: coords.label,
        geo_source: "region_registry",
      },
    });

    console.log(`  OK   ${inst.name} → ${coords.label} (${coords.lat}, ${coords.lon})`);
    updated++;
  }

  console.log(`\nDone: ${updated} updated, ${skipped} skipped`);
}

main()
  .catch((err) => {
    console.error("Backfill failed:", err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
