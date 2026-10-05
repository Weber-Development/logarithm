export interface AuditLogLabels {
  search: string;
  searchPlaceholder: string;
  action: string;
  allActions: string;
  from: string;
  to: string;
  reset: string;
  loading: string;
  loadMore: string;
  empty: string;
  error: string;
  retry: string;
  details: string;
  hideDetails: string;
  changes: string;
  field: string;
  before: string;
  after: string;
  context: string;
  metadata: string;
  ip: string;
  userAgent: string;
  requestId: string;
  location: string;
  eventId: string;
  tenant: string;
  today: string;
  yesterday: string;
  filters: string;
  results: (count: number, more: boolean) => string;
  changeCount: (count: number) => string;
}

export const en: AuditLogLabels = {
  search: "Search",
  searchPlaceholder: "Person, action or object",
  action: "Action",
  allActions: "All actions",
  from: "From",
  to: "To",
  reset: "Reset",
  loading: "Loading activity…",
  loadMore: "Show older entries",
  empty: "No activity matches these filters.",
  error: "The activity log could not be loaded.",
  retry: "Try again",
  details: "Details",
  hideDetails: "Hide details",
  changes: "Changes",
  field: "Field",
  before: "Before",
  after: "After",
  context: "Request",
  metadata: "Additional data",
  ip: "IP address",
  userAgent: "Browser",
  requestId: "Request ID",
  location: "Location",
  eventId: "Event ID",
  tenant: "Organisation",
  today: "Today",
  yesterday: "Yesterday",
  filters: "Filter activity",
  results: (count, more) => `${count}${more ? "+" : ""} ${count === 1 ? "entry" : "entries"}`,
  changeCount: (count) => `${count} ${count === 1 ? "change" : "changes"}`,
};

export const de: AuditLogLabels = {
  search: "Suche",
  searchPlaceholder: "Person, Aktion oder Objekt",
  action: "Aktion",
  allActions: "Alle Aktionen",
  from: "Von",
  to: "Bis",
  reset: "Zurücksetzen",
  loading: "Aktivität wird geladen …",
  loadMore: "Ältere Einträge anzeigen",
  empty: "Keine Aktivität für diese Filter.",
  error: "Das Aktivitätsprotokoll konnte nicht geladen werden.",
  retry: "Erneut versuchen",
  details: "Details",
  hideDetails: "Details ausblenden",
  changes: "Änderungen",
  field: "Feld",
  before: "Vorher",
  after: "Nachher",
  context: "Anfrage",
  metadata: "Zusätzliche Daten",
  ip: "IP-Adresse",
  userAgent: "Browser",
  requestId: "Anfrage-ID",
  location: "Ort",
  eventId: "Ereignis-ID",
  tenant: "Organisation",
  today: "Heute",
  yesterday: "Gestern",
  filters: "Aktivität filtern",
  results: (count, more) => `${count}${more ? "+" : ""} ${count === 1 ? "Eintrag" : "Einträge"}`,
  changeCount: (count) => `${count} ${count === 1 ? "Änderung" : "Änderungen"}`,
};

export function labelsFor(locale: string | undefined): AuditLogLabels {
  return locale?.toLowerCase().startsWith("de") ? de : en;
}
