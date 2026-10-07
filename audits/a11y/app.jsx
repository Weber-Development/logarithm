import { createRoot } from "react-dom/client";
import { AuditLog } from "../../packages/react/dist/index.js";

const actors = [
  ["u1", "Anna Muster"],
  ["u2", "Ben Keller"],
  ["u3", "Chiara Rossi"],
];
const actions = [
  "project.created",
  "project.updated",
  "member.role_changed",
  "invoice.paid",
  "api_key.rotated",
];
const events = Array.from({ length: 60 }, (_, i) => ({
  id: `e${String(i).padStart(3, "0")}`,
  occurredAt: new Date(Date.UTC(2026, 9, 6, 12) - i * 3_600_000).toISOString(),
  tenantId: "acme",
  action: actions[i % actions.length],
  actor: {
    type: "user",
    id: actors[i % 3][0],
    name: actors[i % 3][1],
    email: `u${i % 3}@example.ch`,
  },
  targets: [{ type: "project", id: `p${i}`, name: `Project ${i}` }],
  changes:
    i % 2
      ? [
          { path: "billing.plan", before: "free", after: "pro" },
          { path: "name", before: "Old", after: "New" },
        ]
      : [],
  context: { ip: `10.0.0.${i}` },
  metadata: {},
}));
const fetchPage = async (q) => {
  const start = q.cursor ? Number(q.cursor) : 0;
  const size = q.limit ?? 25;
  const slice = events.slice(start, start + size);
  return { events: slice, nextCursor: start + size < events.length ? String(start + size) : null };
};
const params = new URLSearchParams(location.search);
createRoot(document.getElementById("root")).render(
  <main style={{ padding: 16 }}>
    <h1>Activity</h1>
    <AuditLog
      headingLevel={2}
      fetchPage={fetchPage}
      theme={params.get("theme") ?? undefined}
      locale={params.get("locale") ?? "en"}
      actions={[
        { value: "project.*", label: "Projects" },
        { value: "invoice.*", label: "Invoices" },
      ]}
    />
  </main>,
);
