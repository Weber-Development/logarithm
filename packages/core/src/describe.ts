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
  rotated: "hat {target} erneuert",
  role_changed: "hat die Rolle von {target} geändert",
  signed_in: "hat sich angemeldet",
  signed_out: "hat sich abgemeldet",
  failed: "{target}: fehlgeschlagen",
};

const EN_VERBS: Record<string, string> = {
  role_changed: "changed the role of {target}",
  signed_in: "signed in",
  signed_out: "signed out",
  sign_in_failed: "failed to sign in",
};

const FR_VERBS: Record<string, string> = {
  created: "a créé {target}",
  updated: "a modifié {target}",
  deleted: "a supprimé {target}",
  archived: "a archivé {target}",
  restored: "a restauré {target}",
  invited: "a invité {target}",
  removed: "a retiré {target}",
  added: "a ajouté {target}",
  enabled: "a activé {target}",
  disabled: "a désactivé {target}",
  exported: "a exporté {target}",
  viewed: "a consulté {target}",
  rotated: "a renouvelé {target}",
  role_changed: "a changé le rôle de {target}",
  signed_in: "s’est connecté",
  signed_out: "s’est déconnecté",
  sign_in_failed: "n’a pas pu se connecter",
};

const IT_VERBS: Record<string, string> = {
  created: "ha creato {target}",
  updated: "ha modificato {target}",
  deleted: "ha eliminato {target}",
  archived: "ha archiviato {target}",
  restored: "ha ripristinato {target}",
  invited: "ha invitato {target}",
  removed: "ha rimosso {target}",
  added: "ha aggiunto {target}",
  enabled: "ha attivato {target}",
  disabled: "ha disattivato {target}",
  exported: "ha esportato {target}",
  viewed: "ha visualizzato {target}",
  rotated: "ha rinnovato {target}",
  role_changed: "ha cambiato il ruolo di {target}",
  signed_in: "ha effettuato l’accesso",
  signed_out: "è uscito",
  sign_in_failed: "non è riuscito ad accedere",
};

type Language = "en" | "de" | "fr" | "it";

const VERBS: Record<Exclude<Language, "en">, Record<string, string>> = {
  de: DE_VERBS,
  fr: FR_VERBS,
  it: IT_VERBS,
};

const QUOTES: Record<Language, [string, string]> = {
  en: ['"', '"'],
  de: ["„", "“"],
  fr: ["« ", " »"],
  it: ["«", "»"],
};

function languageOf(locale: string | undefined): Language {
  const code = locale?.toLowerCase().slice(0, 2);
  return code === "de" || code === "fr" || code === "it" ? code : "en";
}

function words(text: string): string {
  return text.replace(/[_-]+/g, " ").trim();
}

/**
 * Turns an event into a short sentence without the actor, e.g. `updated project "Website"`
 * (English) or `hat Projekt „Website“ geändert` (German, with `nouns` for the resource names).
 * English, German, French and Italian are built in; for French and Italian pass nouns with their
 * article, e.g. `{ project: "le projet" }`.
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
  const language = languageOf(options.locale);
  const [open, close] = QUOTES[language];
  const name = target?.name ? ` ${open}${target.name}${close}` : "";
  const object = `${noun}${name}`.trim();

  if (language !== "en") {
    const template = VERBS[language][verb];
    if (template) return template.replace("{target}", object).replace(/\s+/g, " ").trim();
    return `${object}${language === "fr" ? " :" : ":"} ${words(verb)}`.trim();
  }
  const template = EN_VERBS[verb];
  if (template) return template.replace("{target}", object).replace(/\s+/g, " ").trim();
  return `${words(verb)} ${object}`.trim();
}
