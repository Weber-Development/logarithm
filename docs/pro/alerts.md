---
title: Alerts and anomalies
description: Slack and Microsoft Teams notifications for selected actions, and anomaly detection from a cron job.
---

Both are part of `@weber-development/logarithm-export`.

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
