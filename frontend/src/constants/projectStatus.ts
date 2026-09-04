/**
 * Projekt-Status-Pipeline: Anfrage → Angebot → Ausführung → Fertig
 * Zusätzlich: Abgebrochen und Archiv.
 *
 * Alte Status-Werte ('aktiv', 'abgeschlossen') werden automatisch gemappt,
 * damit bestehende Projekte weiterhin korrekt angezeigt werden.
 */

export type ProjectStatusKey =
  | 'anfrage'
  | 'angebot'
  | 'ausfuehrung'
  | 'fertig'
  | 'abgebrochen'
  | 'archiviert';

export interface ProjectStatusMeta {
  key: ProjectStatusKey;
  label: string;
  color: string;
  icon: string;
}

export const PROJECT_STATUSES: ProjectStatusMeta[] = [
  { key: 'anfrage', label: 'Anfrage', color: '#9c27b0', icon: 'help-circle-outline' },
  { key: 'angebot', label: 'Angebot', color: '#ff9800', icon: 'document-text-outline' },
  { key: 'ausfuehrung', label: 'Ausführung', color: '#4caf50', icon: 'play-circle-outline' },
  { key: 'fertig', label: 'Fertig', color: '#2196f3', icon: 'checkmark-circle-outline' },
  { key: 'abgebrochen', label: 'Abgebrochen', color: '#f44336', icon: 'close-circle-outline' },
  { key: 'archiviert', label: 'Archiv', color: '#607d8b', icon: 'archive-outline' },
];

/** Alte Status-Werte auf die neue Pipeline mappen */
export const normalizeStatus = (status?: string): ProjectStatusKey => {
  switch (status) {
    case 'aktiv':
      return 'ausfuehrung';
    case 'abgeschlossen':
      return 'fertig';
    case 'anfrage':
    case 'angebot':
    case 'ausfuehrung':
    case 'fertig':
    case 'abgebrochen':
    case 'archiviert':
      return status;
    default:
      return 'anfrage';
  }
};

export const getStatusMeta = (status?: string): ProjectStatusMeta => {
  const key = normalizeStatus(status);
  return PROJECT_STATUSES.find((s) => s.key === key)!;
};

/** Reihenfolge in der Pipeline (für Sortierung) */
export const getStatusOrder = (status?: string): number => {
  const key = normalizeStatus(status);
  return PROJECT_STATUSES.findIndex((s) => s.key === key);
};
