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
  recentActivity: string;
  viewAll: string;
  noActivity: string;
  justNow: string;
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
  recentActivity: "Recent activity",
  viewAll: "View all activity",
  noActivity: "No activity yet.",
  justNow: "just now",
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
  recentActivity: "Letzte Aktivität",
  viewAll: "Alle Aktivitäten anzeigen",
  noActivity: "Noch keine Aktivität.",
  justNow: "gerade eben",
  results: (count, more) => `${count}${more ? "+" : ""} ${count === 1 ? "Eintrag" : "Einträge"}`,
  changeCount: (count) => `${count} ${count === 1 ? "Änderung" : "Änderungen"}`,
};

export const fr: AuditLogLabels = {
  search: "Recherche",
  searchPlaceholder: "Personne, action ou objet",
  action: "Action",
  allActions: "Toutes les actions",
  from: "Du",
  to: "Au",
  reset: "Réinitialiser",
  loading: "Chargement de l’activité…",
  loadMore: "Afficher les entrées plus anciennes",
  empty: "Aucune activité pour ces filtres.",
  error: "Le journal d’activité n’a pas pu être chargé.",
  retry: "Réessayer",
  details: "Détails",
  hideDetails: "Masquer les détails",
  changes: "Modifications",
  field: "Champ",
  before: "Avant",
  after: "Après",
  context: "Requête",
  metadata: "Données supplémentaires",
  ip: "Adresse IP",
  userAgent: "Navigateur",
  requestId: "ID de requête",
  location: "Lieu",
  eventId: "ID d’événement",
  tenant: "Organisation",
  today: "Aujourd’hui",
  yesterday: "Hier",
  filters: "Filtrer l’activité",
  recentActivity: "Activité récente",
  viewAll: "Voir toute l’activité",
  noActivity: "Aucune activité pour l’instant.",
  justNow: "à l’instant",
  results: (count, more) => `${count}${more ? "+" : ""} ${count === 1 ? "entrée" : "entrées"}`,
  changeCount: (count) => `${count} ${count === 1 ? "modification" : "modifications"}`,
};

export const it: AuditLogLabels = {
  search: "Cerca",
  searchPlaceholder: "Persona, azione od oggetto",
  action: "Azione",
  allActions: "Tutte le azioni",
  from: "Dal",
  to: "Al",
  reset: "Reimposta",
  loading: "Caricamento attività…",
  loadMore: "Mostra voci precedenti",
  empty: "Nessuna attività per questi filtri.",
  error: "Impossibile caricare il registro attività.",
  retry: "Riprova",
  details: "Dettagli",
  hideDetails: "Nascondi dettagli",
  changes: "Modifiche",
  field: "Campo",
  before: "Prima",
  after: "Dopo",
  context: "Richiesta",
  metadata: "Dati aggiuntivi",
  ip: "Indirizzo IP",
  userAgent: "Browser",
  requestId: "ID richiesta",
  location: "Luogo",
  eventId: "ID evento",
  tenant: "Organizzazione",
  today: "Oggi",
  yesterday: "Ieri",
  filters: "Filtra attività",
  recentActivity: "Attività recente",
  viewAll: "Vedi tutta l’attività",
  noActivity: "Ancora nessuna attività.",
  justNow: "proprio ora",
  results: (count, more) => `${count}${more ? "+" : ""} ${count === 1 ? "voce" : "voci"}`,
  changeCount: (count) => `${count} ${count === 1 ? "modifica" : "modifiche"}`,
};

/** Built-in labels for a BCP 47 locale: German, French and Italian, English otherwise. */
export function labelsFor(locale: string | undefined): AuditLogLabels {
  const code = locale?.toLowerCase().slice(0, 2);
  if (code === "de") return de;
  if (code === "fr") return fr;
  if (code === "it") return it;
  return en;
}
