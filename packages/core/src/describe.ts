import type { AuditEvent } from "./types";

const DE_VERBS: Record<string, string> = {
  created: "hat {target} erstellt",
  updated: "hat {target} geändert",
  deleted: "hat {target} gelöscht",
  archived: "hat {target} archiviert",
  restored: "hat {target} wiederhergestellt",
  invited: "hat {target} eingeladen",
  removed: "hat {target} entfernt",
  added: "hat {target} hinzugefügt",
  enabled: "hat {target} aktiviert",
  disabled: "hat {target} deaktiviert",
  exported: "hat {target} exportiert",
  viewed: "hat {target} angesehen",
  signed_in: "hat sich angemeldet",
  signed_out: "hat sich abgemeldet",
  failed: "{target}: fehlgeschlagen",
};

function words(text: string): string {
  return text.replace(/[_-]+/g, " ").trim();
}

/**
 * Turns an event into a short sentence without the actor, e.g. `updated project "Website"`
 * (English) or `hat Projekt „Website“ geändert` (German, with `nouns` for the resource names).
 */
export function describeAction(
  event: Pick<AuditEvent, "action" | "targets">,
  options: { locale?: string; nouns?: Record<string, string> } = {},
): string {
  const parts = event.action.split(".");
  const verb = parts.length > 1 ? (parts[parts.length - 1] as string) : event.action;
  const resource = parts.length > 1 ? parts.slice(0, -1).join(" ") : "";
  const target = event.targets[0];
  const noun = options.nouns?.[resource] ?? options.nouns?.[target?.type ?? ""] ?? words(resource);
  const german = options.locale?.toLowerCase().startsWith("de") ?? false;
  const name = target?.name ? (german ? ` „${target.name}“` : ` "${target.name}"`) : "";
  const object = `${noun}${name}`.trim();

  if (german) {
    const template = DE_VERBS[verb];
    if (template) return template.replace("{target}", object).replace(/\s+/g, " ").trim();
    return `${object}: ${words(verb)}`.trim();
  }
  return `${words(verb)} ${object}`.trim();
}
