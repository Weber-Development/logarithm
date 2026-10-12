import { createAuditLog, memoryStore } from "@sweberdev/logarithm";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { relativeTime } from "../src/ActivityFeed";
import { ActivityFeed, AuditLog, ObjectHistory, toSearchParams } from "../src/index";

afterEach(cleanup);

async function seed() {
  let clock = Date.parse("2026-10-01T08:00:00.000Z");
  const audit = createAuditLog({
    store: memoryStore(),
    now: () => {
      clock += 60_000;
      return new Date(clock);
    },
  });
  await audit.record({
    action: "project.updated",
    actor: { id: "u1", name: "Anna Muster" },
    targets: [{ type: "project", id: "p1", name: "Website" }],
    before: { plan: "free" },
    after: { plan: "pro" },
    context: { ip: "203.0.113.5" },
  });
  for (let i = 0; i < 3; i++) {
    await audit.record({ action: "member.invited", actor: { id: "u2", name: "Ben Keller" } });
  }
  return audit;
}

describe("heading levels", () => {
  it("uses h3 by default and the level you ask for", async () => {
    const audit = await seed();
    const { unmount } = render(<AuditLog fetchPage={(q) => audit.query(q)} />);
    await screen.findByText(/4 entries/);
    expect(screen.getAllByRole("heading", { level: 3 }).length).toBeGreaterThan(0);
    unmount();
    render(<AuditLog fetchPage={(q) => audit.query(q)} headingLevel={2} />);
    await screen.findByText(/4 entries/);
    expect(screen.getAllByRole("heading", { level: 2 }).length).toBeGreaterThan(0);
    expect(screen.queryAllByRole("heading", { level: 3 })).toHaveLength(0);
  });

  it("sets the level of the activity feed title", async () => {
    const audit = await seed();
    render(<ActivityFeed fetchPage={(q) => audit.query(q)} headingLevel={2} />);
    expect(await screen.findByRole("heading", { level: 2 })).toBeTruthy();
  });
});

describe("<AuditLog>", () => {
  it("renders entries, details and paging", async () => {
    const audit = await seed();
    render(<AuditLog fetchPage={(q) => audit.query(q)} pageSize={2} />);
    await screen.findByText(/2\+ entries/);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Show older entries" }));
    await screen.findByText("4 entries");
    const item = screen.getByText(/updated project "Website"/).closest("li") as HTMLElement;
    expect(within(item).getByText("1 change")).toBeTruthy();

    const toggle = within(item).getByRole("button", { name: "Details" });
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const table = within(item).getByRole("table", { name: "Changes" });
    expect(within(table).getByText("free")).toBeTruthy();
    expect(within(table).getByText("pro")).toBeTruthy();
    expect(within(item).getByText("203.0.113.5")).toBeTruthy();
  });

  it("filters by search and action, in German", async () => {
    const audit = await seed();
    const fetchPage = vi.fn((q) => audit.query(q));
    render(
      <AuditLog
        fetchPage={fetchPage}
        locale="de-CH"
        nouns={{ project: "Projekt" }}
        actions={[{ value: "member.*", label: "Mitglieder" }]}
      />,
    );
    await screen.findByText("hat Projekt „Website“ geändert");
    fireEvent.change(screen.getByLabelText("Aktion"), { target: { value: "member.*" } });
    await screen.findByText("3 Einträge");
    fireEvent.change(screen.getByLabelText("Suche"), { target: { value: "nobody" } });
    await screen.findByText("Keine Aktivität für diese Filter.");
    expect(fetchPage).toHaveBeenLastCalledWith(
      expect.objectContaining({ action: "member.*", search: "nobody", cursor: null }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Zurücksetzen" }));
    await screen.findByText("4 Einträge");
  });

  it("shows an error with retry", async () => {
    const audit = await seed();
    let fail = true;
    render(
      <AuditLog
        fetchPage={async (q) => {
          if (fail) throw new Error("boom");
          return audit.query(q);
        }}
      />,
    );
    await screen.findByRole("alert");
    fail = false;
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    });
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
  });

  it("loads from an endpoint with query parameters", async () => {
    const audit = await seed();
    const fetchMock = vi.fn(async (url: string) => {
      const params = new URL(url, "https://x.test").searchParams;
      return new Response(
        JSON.stringify(await audit.query({ search: params.get("q") ?? undefined })),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<AuditLog endpoint="/api/audit" scope={{ search: "anna" }} />);
    await screen.findByText("1 entry");
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/audit?q=anna&limit=25");
    vi.unstubAllGlobals();
  });
});

describe("toSearchParams", () => {
  it("maps the query to the handler's parameters", () => {
    expect(
      toSearchParams({
        actorId: "u",
        action: ["a.*", "b.c"],
        targetId: "t",
        from: "2026-01-01T00:00:00Z",
      }).toString(),
    ).toBe("actor=u&action=a.*%2Cb.c&target=t&from=2026-01-01T00%3A00%3A00.000Z");
  });
});

describe("<ActivityFeed>", () => {
  it("shows the latest entries with a link to the full log", async () => {
    const audit = await seed();
    const fetchPage = vi.fn((q) => audit.query(q));
    render(<ActivityFeed fetchPage={fetchPage} limit={2} href="/audit" locale="de" />);
    await screen.findByText("Letzte Aktivität");
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(2));
    expect(fetchPage.mock.calls[0]?.[0]).toMatchObject({ limit: 2 });
    const link = screen.getByRole("link", { name: "Alle Aktivitäten anzeigen" });
    expect(link.getAttribute("href")).toBe("/audit");
  });

  it("has French and Italian labels", async () => {
    const audit = await seed();
    render(<ActivityFeed fetchPage={(q) => audit.query(q)} locale="fr-CH" />);
    await screen.findByText("Activité récente");
    cleanup();
    render(<ActivityFeed fetchPage={(q) => audit.query(q)} locale="it-CH" />);
    await screen.findByText("Attività recente");
  });

  it("formats relative times", () => {
    const now = Date.parse("2026-10-05T12:00:00.000Z");
    expect(relativeTime("2026-10-05T11:59:30.000Z", now, "en", "just now")).toBe("just now");
    expect(relativeTime("2026-10-05T11:55:00.000Z", now, "en", "just now")).toBe("5 minutes ago");
    expect(relativeTime("2026-10-04T12:00:00.000Z", now, "de", "gerade eben")).toBe("gestern");
  });
});

describe("outcome", () => {
  it("shows failed and denied events with text, filters by result and shows the correlation id", async () => {
    const audit = createAuditLog({ store: memoryStore() });
    await audit.record({ action: "export.created", actor: { id: "u1", name: "Anna" } });
    await audit.record({
      action: "export.created",
      actor: { id: "u2", name: "Ben" },
      outcome: "denied",
      correlationId: "req-7",
    });
    render(<AuditLog fetchPage={(q) => audit.query(q)} />);
    await screen.findByText(/2 entries/);
    expect(screen.getAllByText("Denied").length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText("Result"), { target: { value: "denied" } });
    await screen.findByText(/1 entry/);
    fireEvent.click(screen.getByRole("button", { name: "Details" }));
    expect(screen.getByText("req-7")).toBeTruthy();
  });
});

describe("<ObjectHistory>", () => {
  async function history() {
    let clock = Date.parse("2026-10-01T08:00:00.000Z");
    const audit = createAuditLog({
      store: memoryStore(),
      now: () => {
        clock += 3_600_000;
        return new Date(clock);
      },
    });
    const target = [{ type: "project", id: "p1", name: "Website" }];
    await audit.record({
      action: "project.updated",
      actor: { id: "u1", name: "Anna Muster" },
      targets: target,
      before: { plan: "free", name: "Site" },
      after: { plan: "pro", name: "Site" },
    });
    await audit.record({
      action: "project.updated",
      actor: { id: "u2", name: "Ben Keller" },
      targets: target,
      before: { name: "Site" },
      after: { name: "Website" },
    });
    await audit.record({
      action: "project.updated",
      actor: { id: "u3", name: "Other" },
      targets: [{ type: "project", id: "p2" }],
      before: { plan: "x" },
      after: { plan: "y" },
    });
    return audit;
  }

  it("lists the changes of one object with before and after, newest first", async () => {
    const audit = await history();
    render(<ObjectHistory fetchPage={(q) => audit.query(q)} targetType="project" targetId="p1" />);
    expect(await screen.findByText("Ben Keller")).toBeTruthy();
    expect(screen.queryByText("Other")).toBeNull();
    const entries = document.querySelectorAll(".lg-history-entry");
    expect(entries).toHaveLength(2);
    expect(entries[0]?.textContent).toContain("Ben Keller");
    expect(screen.getAllByText("pro").length).toBe(1);
  });

  it("narrows the history to the changes of one field", async () => {
    const audit = await history();
    render(<ObjectHistory fetchPage={(q) => audit.query(q)} targetType="project" targetId="p1" />);
    await screen.findByText("Ben Keller");
    fireEvent.change(screen.getByLabelText("Show changes to"), { target: { value: "plan" } });
    await waitFor(() => expect(document.querySelectorAll(".lg-history-entry")).toHaveLength(1));
    expect(screen.getByText("Anna Muster")).toBeTruthy();
    expect(screen.queryByText("Ben Keller")).toBeNull();
  });

  it("says so when an object has no history", async () => {
    const audit = await history();
    render(
      <ObjectHistory fetchPage={(q) => audit.query(q)} targetType="project" targetId="nope" />,
    );
    expect(await screen.findByText(/No changes have been recorded/)).toBeTruthy();
  });

  it("translates the labels", async () => {
    const audit = await history();
    render(
      <ObjectHistory
        fetchPage={(q) => audit.query(q)}
        targetType="project"
        targetId="p1"
        locale="de"
      />,
    );
    expect(await screen.findByRole("heading", { name: "Verlauf" })).toBeTruthy();
  });
});
