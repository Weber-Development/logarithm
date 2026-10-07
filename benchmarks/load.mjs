// Load test for the SQLite store: node benchmarks/load.mjs [events] [file]
// Inserts N realistic events in batches and times the queries a viewer runs against them.

import { rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { createAuditLog } from "../packages/core/dist/index.js";
import { migrateSqlite, sqliteStore } from "../packages/core/dist/sqlite.js";

const N = Number(process.argv[2] ?? 1_000_000);
const FILE = process.argv[3] ?? "/tmp/logarithm-load.db";
rmSync(FILE, { force: true });
const db = new DatabaseSync(FILE);
db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;");
migrateSqlite({ db });
const store = sqliteStore({ db });
const audit = createAuditLog({ store });

const ACTIONS = [
  "project.created",
  "project.updated",
  "project.deleted",
  "member.role_changed",
  "invoice.paid",
  "user.signed_in",
  "api_key.rotated",
  "report.exported",
];
const TENANTS = 200;
const ACTORS = 5000;
const start = Date.UTC(2026, 0, 1);
const span = 280 * 86_400_000;

function event(i) {
  const t = i % TENANTS;
  const a = (i * 7) % ACTORS;
  return {
    id: `evt_${String(i).padStart(12, "0")}`,
    occurredAt: new Date(start + Math.floor((i / N) * span)).toISOString(),
    tenantId: `tenant-${t}`,
    action: ACTIONS[i % ACTIONS.length],
    actor: { type: "user", id: `user-${a}`, name: `User ${a}`, email: `user${a}@example.ch` },
    targets: [{ type: "project", id: `p${i % 50_000}`, name: `Project ${i % 50_000}` }],
    changes: [{ path: "name", before: "Old", after: "New" }],
    context: { ip: `10.0.${i % 255}.${(i >> 8) % 255}` },
    metadata: { source: "load-test" },
  };
}

const BATCH = 1000;
const t0 = performance.now();
for (let i = 0; i < N; i += BATCH) {
  const batch = [];
  for (let j = i; j < Math.min(i + BATCH, N); j++) batch.push(event(j));
  await store.insert(batch);
  if ((i / BATCH) % 1000 === 0 && i) console.error(`  ${i.toLocaleString("en")} events`);
}
const insertMs = performance.now() - t0;
console.log(
  `insert: ${N.toLocaleString("en")} events in ${(insertMs / 1000).toFixed(1)} s (${Math.round(N / (insertMs / 1000)).toLocaleString("en")} events/s)`,
);

async function time(label, fn, runs = 20) {
  await fn();
  const samples = [];
  for (let r = 0; r < runs; r++) {
    const s = performance.now();
    await fn();
    samples.push(performance.now() - s);
  }
  samples.sort((x, y) => x - y);
  const p50 = samples[Math.floor(runs / 2)];
  const p95 = samples[Math.floor(runs * 0.95) - 1] ?? samples.at(-1);
  console.log(
    `${label.padEnd(44)} p50 ${p50.toFixed(1).padStart(8)} ms   p95 ${p95.toFixed(1).padStart(8)} ms`,
  );
}

const page = { limit: 50 };
await time("newest 50 of one tenant", () => audit.query({ tenantId: "tenant-7", ...page }));
await time("newest 50 of one tenant, 2nd page", async () => {
  const first = await audit.query({ tenantId: "tenant-7", ...page });
  return audit.query({ tenantId: "tenant-7", ...page, cursor: first.nextCursor });
});
await time("one tenant, one action", () =>
  audit.query({ tenantId: "tenant-7", action: "invoice.paid", ...page }),
);
await time("one tenant, action prefix project.*", () =>
  audit.query({ tenantId: "tenant-7", action: "project.*", ...page }),
);
await time("one tenant, one actor", () =>
  audit.query({ tenantId: "tenant-7", actorId: "user-7", ...page }),
);
await time("one tenant, one target", () =>
  audit.query({ tenantId: "tenant-7", targetId: "p7", ...page }),
);
await time("one tenant, last 7 days", () =>
  audit.query({ tenantId: "tenant-7", from: new Date(start + span - 7 * 86_400_000), ...page }),
);
await time(
  "one tenant, text search",
  () => audit.query({ tenantId: "tenant-7", search: "user7@", ...page }),
  5,
);
await time(
  "count per day, one tenant",
  () => audit.count({ tenantId: "tenant-7", groupBy: "day" }),
  5,
);
await time(
  "count per action, one tenant",
  () => audit.count({ tenantId: "tenant-7", groupBy: "action" }),
  5,
);
db.close();
