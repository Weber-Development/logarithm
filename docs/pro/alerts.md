---
title: Alerts and anomalies
description: Slack, Microsoft Teams and e-mail notifications for selected actions, and anomaly detection for mass deletions, mass changes, off-hours changes and new IPs.
---

Both are part of `@weber-development/logarithm-export`. If you would rather not run any of this yourself, the [admin server](server.md) runs the anomaly check and sends the alerts for you.

## Notifications

`slackSink` and `teamsSink` post selected events to an incoming webhook. Use them with `withForwarding` so every stored event that matches is posted right away:

```ts
import { slackSink, teamsSink, withForwarding } from "@weber-development/logarithm-export"

const store = withForwarding(postgresStore({ client: pool }), [
  slackSink({
    webhookUrl: process.env.SLACK_WEBHOOK_URL!,
    actions: ["member.role_changed", "api_key.*", "*.deleted"],
    title: "Acme audit log",
    link: (event) => `https://app.example.ch/admin/audit?id=${event.id}`,
  }),
  teamsSink({ webhookUrl: process.env.TEAMS_WEBHOOK_URL!, actions: ["billing.*"] }),
])
```

| Option | Meaning |
|---|---|
| `webhookUrl` | Slack: `https://hooks.slack.com/services/...`. Teams: the URL of a Workflows webhook ("When a Teams webhook request is received") or a legacy connector |
| `actions` | Patterns; `*` stands for any text, so `project.*`, `*.deleted` and `*` work. Default: all actions |
| `title` | Heading of the message. Default `Audit log` |
| `link(event)` | A link per event, e.g. into your admin UI. Only `http` and `https` links are used |
| `maxEvents` | Events per message, the rest is summarised as "and N more". Default 10 |
| `format(event)` | Your own one-line text instead of `Anna Muster: project.deleted project "Website" (p1)` |

Slack gets a message with blocks, Teams an Adaptive Card. Names and other user content are escaped, so an actor called `<!channel>` cannot mention everyone. Webhook URLs are secrets: errors only say `Slack webhook answered 404`, never the URL. Keep the URL in an environment variable.

### E-mail

`emailSink` hands a finished message (recipients, subject, text and HTML, every value escaped) to the mailer you already use:

```ts
import { emailSink } from "@weber-development/logarithm-export"

emailSink({
  to: ["security@example.ch"],
  title: "Acme audit log",
  actions: ["*.deleted", "member.role_changed"],
  send: (message) => resend.emails.send({ from: "audit@example.ch", ...message }),
})
```

`send` receives `{ to, subject, text, html }`, so it works with Nodemailer, Resend, Postmark or SES. Line breaks in names cannot reach the subject line. The message is covered by tests; delivery is up to your mailer.

To filter any other sink, wrap it: `onlyActions(webhookSink({ url, secret }), ["member.*"])`.

## Anomaly detection

`detectAnomalies` looks at a time window and flags every actor with unusually many exports, deletions or failed logins. Run it from a cron job and send the alerts to the same sinks:

```ts
// app/api/cron/audit-anomalies/route.ts (Vercel Cron, every 15 minutes)
import { detectAnomalies, slackSink } from "@weber-development/logarithm-export"

export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("unauthorized", { status: 401 })
  }
  const anomalies = await detectAnomalies({
    store,
    sinks: [slackSink({ webhookUrl: process.env.SLACK_SECURITY_WEBHOOK_URL!, title: "Security" })],
    record: true,
  })
  return Response.json({ anomalies: anomalies.length })
}
```

A Slack alert reads: `Unusual activity: Mallory (u_mallory) had 12 exports in 60 min (threshold 10)`.

| Option | Meaning |
|---|---|
| `store` | The store to read (and, with `record`, to write alerts to) |
| `rules` | Default `DEFAULT_ANOMALY_RULES`, see below |
| `windowMinutes` | Window for rules without their own. Default 60 |
| `now` | End of the window. Default now |
| `tenantId` | Only one tenant. Default: all tenants, each counted on its own |
| `sinks` | Where alerts go: `slackSink`, `teamsSink`, `webhookSink`, Splunk, Datadog or your own |
| `record` | Also store each alert as a `logarithm.anomaly_detected` event, so it shows in the log. An alert already stored for the same rule, tenant and subject within the window is not sent again, so the cron job can run more often than the window |
| `baseline` | Learn the threshold per rule and tenant from history, see below. `true` or `{ days, sigma, minThreshold, minSamples }` |
| `onError` | Called when a sink fails; detection still returns |

The default rules count per actor and hour:

| Rule | Actions | Threshold |
|---|---|---|
| `exports` | `*.exported`, `*.downloaded`, `export.*` | 10 |
| `deletions` | `*.deleted`, `*.erased` | 25 |
| `failed logins` | `*.sign_in_failed`, `*.login_failed`, `*.signin_failed` | 5 |

Name your actions accordingly, or pass your own rules. A rule can have its own window and can count per client IP instead of per actor, which suits failed logins of unknown users:

```ts
await detectAnomalies({
  store,
  sinks,
  rules: [
    { name: "exports", actions: ["report.exported", "customer.exported"], threshold: 5 },
    { name: "deletions", actions: ["*.deleted"], threshold: 50, windowMinutes: 24 * 60 },
    { name: "failed logins", actions: ["user.sign_in_failed"], threshold: 20, windowMinutes: 15, by: "ip" },
  ],
})
```

`detectAnomalies` returns the anomalies (`rule`, `subject`, `subjectName`, `tenantId`, `count`, `threshold`, `from`, `to`, up to 50 `eventIds`, and the alert `event`), most events first. If the store is wrapped with `withForwarding`, alerts stored with `record` are forwarded as well; then leave `sinks` empty or filter the forwarding sinks with `actions` to avoid duplicates.

### More rules: mass changes, off-hours, new IPs

Three more rule kinds catch what a count of events misses. `EXTENDED_ANOMALY_RULES` has a ready-made rule of each kind; they are not part of the defaults, so existing installations get no new alerts by surprise:

```ts
import { DEFAULT_ANOMALY_RULES, EXTENDED_ANOMALY_RULES, detectAnomalies } from "@weber-development/logarithm-export"

await detectAnomalies({ store, sinks, record: true, rules: [...DEFAULT_ANOMALY_RULES, ...EXTENDED_ANOMALY_RULES] })
```

| Rule | What it flags |
|---|---|
| `bulk changes` | An actor who touched 50 different objects with `*.updated`, `*.created` or `*.deleted` within the hour. Set `count: "targets"` on your own rule to count distinct objects instead of events, so ten edits of one record do not raise an alarm and a sweep over 200 records does |
| `off-hours permission changes` | Role, permission or API key changes outside working hours (`outsideHours: { start: 6, end: 20, timeZone: "Europe/Zurich" }`). Hours are 0 to 24, the default time zone is UTC, and weekends count as off-hours unless you set `weekends: false` |
| `permission changes from a new IP` | The same changes from an IP address the actor has not used before (`newIp: true`, or `{ days: 90 }` to look back that far; default 30 days). An actor with no history is not flagged, so a new account does not alert on its first action |

An anomaly carries `measure` (`events` or `targets`), so the message says "changed 60 different objects" instead of "had 60 events". With `baseline`, these three kinds of rule keep their fixed threshold, and the `newIp` rule reads the actor's history on every run.

### Learned baselines

A fixed threshold fits nobody: 10 exports per hour is a burst for a five-person team and a normal morning for a large customer. With `baseline`, Logarithm learns what is normal per rule and tenant:

```ts
await detectAnomalies({ store, sinks, record: true, baseline: true })
// or tune it
await detectAnomalies({ store, sinks, baseline: { days: 30, sigma: 3, minThreshold: 5 } })
```

For every rule and tenant it looks at the `days` (default 14) before the window, splits them into windows of the rule's length and counts events per subject and window. It then flags a subject whose count in the current window exceeds the mean plus `sigma` (default 3) standard deviations, but never fewer than `minThreshold` (default 3) events. A quiet tenant, where people usually export once per hour, is therefore alerted at 3 exports, and a busy tenant, where people export 20 times, only well above that.

Only active windows count (a subject that did nothing in a window adds no sample), so the baseline describes how people behave when they use a feature. Until a rule has at least `minSamples` (default 20) such samples for a tenant, it keeps its fixed `threshold`, so new tenants are still covered. Each anomaly then carries the learned `threshold` and a `baseline` with `mean`, `stdDev`, `samples` and `days`. Learning reads the history on every run, so for large logs run the job every 15 minutes rather than every minute.

