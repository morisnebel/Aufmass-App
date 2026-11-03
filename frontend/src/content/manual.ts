// Bedienungsanleitung Aufmaßprofi – gemeinsame Inhalte für Hilfe-Seite und PDF
export type ManualStep = { text: string; info?: string; pro?: boolean };
export type ManualSection = { id: string; icon: string; color: string; title: string; intro: string; steps: ManualStep[]; tips?: string[]; pro?: boolean };

export const QUICK_START: { title: string; text: string }[] = [
  { title: 'Hinweise bestätigen', text: 'Beim ersten Start die Hinweise lesen, Häkchen setzen und „App starten“ tippen.' },
  { title: 'Firmendaten & Logo', text: 'Einstellungen → Logo, Name und PDF-Einstellungen eintragen. Erscheinen später auf allen PDFs.' },
  { title: 'Neues Projekt starten', text: 'Auf der Startseite den großen blauen Button „Neues Projekt starten“ tippen, Namen eingeben, Kunde wählen oder neu anlegen, speichern.' },
  { title: 'Aufmaß erfassen', text: 'Im Projekt Skizzen zeichnen, Fotos aufnehmen und Checklisten ausfüllen' },
  { title: 'Termin planen', text: 'Startseite „+ Termin“ oder im Projekt „Termin planen“ – mit Erinnerung und Navi-Adresse.' },
  { title: 'PDF erstellen & teilen', text: 'Im Projekt „Projekt-PDF“ wählen und per Mail, WhatsApp oder in Dateien weitergeben.' },
  { title: 'Daten sichern', text: 'Regelmäßig unter Backup „Backup erstellen & teilen“ – alle Daten liegen nur auf deinem Gerät.' },
];

export const MANUAL: ManualSection[] = [
  {
    id: 'versionen', icon: 'ribbon-outline', color: '#d97706', title: 'Basic und Pro – was ist enthalten?', pro: true,
    intro: 'Aufmaßprofi gibt es als Basic und als Pro. Mit „PRO“ markierte Kapitel und Schritte gibt es nur in der Pro-Version.',
    steps: [
      { text: 'Basic: Projekte, Kunden, Termine mit Erinnerungen, Skizzen mit Flächenberechnung, Fotos mit Beschriftung, Checklisten, Projekt-PDF und Backup.' },
      { text: 'Checklisten in Basic: bis zu 3 Vorlagen, 10 Hauptpunkte und 5 Unterpunkte je Checkliste.', info: 'In Pro sind Vorlagen und Punkte unbegrenzt. Dazu kommen verschachtelte Unterpunkte, Logos, Druckbild, Vorschau, Verknüpfungen, Berechnungen und Import/Export von Vorlagen.' },
      { text: 'Pro zusätzlich: Dach-Aufmaß, Flächen-Kalkulator, Fotomessung, Dokumente, Rapporte mit Mitarbeitern, Material und Maschinen, Referenzen sowie Projekte exportieren, importieren und verschieben.', pro: true },
      { text: 'In dieser Anleitung sind Pro-Funktionen mit „PRO“ gekennzeichnet.', info: 'Deine bisherigen Daten bleiben beim Wechsel von Basic auf Pro vollständig erhalten.' },
    ],
  },
  {
    id: 'start', icon: 'home-outline', color: '#1565c0', title: 'Die Startseite',
    intro: 'Dein Überblick über Projekte, Termine und schnelle Aktionen.',
    steps: [
      { text: 'Oben: Suche (Lupe), Backup (Wolke) und Profil/Einstellungen.' },
      { text: '„Neues Projekt starten“ ist der wichtigste Einstieg – hier beginnt jedes Aufmaß.' },
      { text: 'Darunter: „Kunde anlegen“ und „Checklisten“ als Schnellaktionen.' },
      { text: '„Heute“ zeigt die Termine des Tages, „Nächste 7 Tage“ die kommende Woche. „Kalender“ öffnet die Monatsansicht.', info: 'Tippe einen Termin an, um ihn zu bearbeiten. Das Navi-Symbol neben der Adresse startet die Navigation.' },
      { text: 'Zahlen-Kacheln zeigen, wie viele Projekte in Anfrage, Angebot, Ausführung oder fertig sind.' },
      { text: 'Ordner und „Letzte Projekte“ führen direkt in deine Arbeit.' },
      { text: 'Nach unten ziehen aktualisiert die Startseite.' },
    ],
    tips: ['Ein gelber Hinweis erinnert dich an ein fälliges Backup – mit „Sichern“ geht es sofort, mit X wird er 24 Std. ausgeblendet.'],
  },
  {
    id: 'kunden', icon: 'people-outline', color: '#0284c7', title: 'Kunden anlegen',
    intro: 'Kunden einmal anlegen und in Projekten und Terminen wiederverwenden.',
    steps: [
      { text: 'Startseite → „Kunde anlegen“ oder Kunden → „+“.' },
      { text: 'Kundentyp, Anrede, Vor- und Nachname (Pflicht), Adresse, Telefon und E-Mail eintragen.', info: 'Die Kundennummer (z. B. KD-26001) wird automatisch vergeben, wenn du das Feld leer lässt.' },
      { text: 'Alternativ „Aus Kontakten importieren“ – übernimmt Name, Telefon und Adresse aus deinem Telefonbuch.', info: 'Die App fragt einmalig nach Zugriff auf deine Kontakte. Ohne Erlaubnis kannst du alles manuell eintragen.' },
      { text: '„Kunde erstellen“ speichert.' },
    ],
  },
  {
    id: 'projekte', icon: 'folder-open-outline', color: '#2e7d32', title: 'Projekte',
    intro: 'Ein Projekt bündelt alles zu einer Baustelle: Skizzen, Fotos, Dachflächen, Checklisten, Rapporte und Dokumente.',
    steps: [
      { text: '„Neues Projekt starten“ tippen und einen Projektnamen eingeben (z. B. „Dachsanierung Hauptstraße“).' },
      { text: 'Kunde auswählen oder direkt neu anlegen.' },
      { text: 'Objektadresse eintragen, wenn die Baustelle nicht an der Kundenadresse liegt.', info: 'Die Objektadresse kannst du beim Kunden speichern und später wieder auswählen (z. B. „Garage“, „Ferienhaus“).' },
      { text: 'Speichern – das Projekt öffnet sich in den Projektdetails.' },
      { text: 'Status setzen (Anfrage, Angebot, Ausführung, Fertig), damit die Startseite den Überblick behält.' },
      { text: 'Projekte in Ordner sortieren: in der Projektliste ein Projekt gedrückt halten und auf einen Ordner ziehen.', info: 'Ordner legst du in der Projektliste an. „Ohne Ordner“ zeigt alle noch nicht sortierten Projekte.' },
      { text: 'Dokumente (z. B. Pläne, Angebote als PDF) im Projekt unter „Dokumente“ ablegen.', pro: true },
    ],
    tips: ['Fertige Projekte archivieren hält die Liste übersichtlich – Archiv findest du in den Einstellungen.', 'Gelöschtes landet zuerst im Papierkorb und kann wiederhergestellt werden.'],
  },
  {
    id: 'skizzen', icon: 'create-outline', color: '#7b1fa2', title: 'Skizzen zeichnen',
    intro: 'Grundrisse und Dachansichten mit Maßen direkt auf dem Handy oder Tablet zeichnen.',
    steps: [
      { text: 'Im Projekt „Skizze“ → neue Skizze anlegen.' },
      { text: 'Werkzeug wählen (Linie, Rechteck, Fläche, Text, Pfeil, Bemaßung) und mit dem Finger zeichnen.' },
      { text: 'Maße eintragen: Linie antippen und Länge eingeben – die Linie passt sich an.', info: 'Mit Raster-Einrastung und Winkel-Fang werden Linien sauber gerade und rechtwinklig.' },
      { text: 'Geschlossene Flächen werden automatisch in m² berechnet. Raumnamen erscheinen direkt im Grundriss.', info: 'Fläche antippen → umbenennen, z. B. „Wohnzimmer“. Die Flächen-Summen stehen auch im Projekt-PDF.' },
      { text: 'Fotos lassen sich in die Skizze einfügen und auf Breite skalieren.' },
      { text: 'Zwei Finger: zoomen und verschieben. Rückgängig-Pfeil macht den letzten Schritt rückgängig.' },
      { text: 'Speichern nicht vergessen – die Skizze erscheint im Projekt und im PDF.' },
    ],
    tips: ['Werkzeuge kannst du unter Einstellungen → „Skizzen-Werkzeuge benennen“ an deine Begriffe anpassen.'],
  },
  {
    id: 'fotos', icon: 'camera-outline', color: '#f57c00', title: 'Fotos & Fotomessung',
    intro: 'Baustellenfotos aufnehmen, beschriften und Maße direkt im Foto messen.',
    steps: [
      { text: 'Im Projekt „Fotos“ → Kamera oder Galerie wählen.', info: 'Kamera- und Fotozugriff wird erst beim ersten Tippen erfragt. Bei Ablehnung kannst du die Erlaubnis über „Einstellungen öffnen“ nachträglich erteilen.' },
      { text: 'Foto antippen → bearbeiten: Pfeile, Texte, Linien und Flächen einzeichnen.' },
      { text: 'Fotomessung: Referenz setzen (bekannte Länge, z. B. Ziegel oder Zollstock), dann weitere Strecken messen.', pro: true, info: 'Je genauer die Referenz, desto genauer die Messung. Fotomessung ersetzt kein exaktes Aufmaß.' },
      { text: 'Das erste Projektfoto dient als Vorschaubild in der Projektliste.' },
    ],
  },
  {
    id: 'dach', icon: 'triangle-outline', color: '#dc2626', title: 'Dachflächen & Flächen-Kalkulator', pro: true,
    intro: 'Dachflächen aus Gebäudemaßen und Neigung berechnen.',
    steps: [
      { text: 'Im Projekt „Dach-Aufmaß“ → Dachtyp wählen (z. B. Satteldach, Walmdach, Pultdach).' },
      { text: 'Gebäudebreite, -länge und Dachneigung in Grad eintragen, optional Dachüberstände.' },
      { text: 'Die App zeigt Dachfläche und Firsthöhe sofort an.' },
      { text: 'Flächen-Kalkulator: beliebige Flächen mit Abzügen (z. B. Fenster, Gauben) berechnen – Ergebnis ist die Netto-Fläche.' },
    ],
    tips: ['Alle Berechnungen dienen als Unterstützung – bitte vor der Verwendung selbst prüfen.'],
  },
  {
    id: 'checklisten', icon: 'checkbox-outline', color: '#7c3aed', title: 'Checklisten',
    intro: 'Wiederkehrende Prüfungen und Abnahmen mit Vorlagen erledigen.',
    steps: [
      { text: 'Startseite → „Checklisten“ zeigt deine Vorlagen.' },
      { text: 'Vorlage bearbeiten oder neu anlegen: Punkte und Kategorien festlegen.', info: 'In der Basic-Version: bis zu 3 Vorlagen, 10 Hauptpunkte und 5 Unterpunkte je Checkliste.' },
      { text: 'Logo, Druckbild, Vorschau, Berechnungen und Verknüpfungen in Vorlagen nutzen sowie Vorlagen importieren/exportieren.', pro: true },
      { text: 'Im Projekt „Checkliste“ → Vorlage wählen und Punkt für Punkt abhaken, Fotos und Notizen ergänzen.' },
      { text: 'Fertige Checklisten erscheinen im Projekt-PDF oder lassen sich einzeln exportieren.' },
    ],
  },
  {
    id: 'termine', icon: 'calendar-outline', color: '#dc2626', title: 'Termine & Erinnerungen',
    intro: 'Baustellentermine planen und rechtzeitig erinnert werden.',
    steps: [
      { text: 'Startseite „+ Termin“ oder im Projekt „Termin planen“.' },
      { text: 'Optional ein Projekt wählen, Titel eingeben, Datum (Heute/Morgen/Übermorgen oder Kalender) und Uhrzeit setzen.' },
      { text: 'Notiz eintragen, z. B. „Kunde vorher anrufen“.' },
      { text: '„Mitnehmen“: Checkliste, was du zum Termin brauchst – eigene Einträge tippen oder Vorschläge wie Leiter, Zollstock antippen. Abhaken, sobald eingepackt.', info: 'Deine eigenen Einträge merkt sich die App als Vorschlag. Was noch nicht abgehakt ist, steht auch in der Erinnerung. Auf der Startseite zeigt ein Taschen-Symbol, wie viel schon eingepackt ist (z. B. 2/5) – antippen klappt die Liste zum direkten Abhaken auf.' },
      { text: 'Mitnehmen-Vorlagen: Lila Knöpfe wie „Dach-Aufmaß“ oder „Abnahme“ übernehmen eine ganze Liste mit einem Tipp. „Liste als Vorlage speichern“ legt eigene Vorlagen an.', info: 'Gleicher Name überschreibt eine Vorlage. Lange auf eine Vorlage drücken löscht sie.' },
      { text: 'Adresse fürs Navi eintragen oder über „Aus Kunden“ übernehmen.' },
      { text: '„Erinnerung vor dem Termin“: 15 Min bis 1 Tag vorher oder „Eigene Zeit“ mit Kalender und Uhrzeit.', info: 'Erinnerungen kommen als Mitteilung aufs Handy – auch wenn die App geschlossen ist. Die App fragt dafür einmalig um Erlaubnis.' },
      { text: '„Fahrzeit“: Die App erinnert dich rechtzeitig zum Losfahren (Fahrzeit + 10 Min Puffer) – oder du wählst mit „Abfahrt wählen“ eine feste Zeit.' },
      { text: 'Adresse antippen → Apple Karten, Google Maps oder Waze wählen.' },
      { text: 'Aus einem Termin ohne Projekt kannst du mit „Projekt erstellen“ direkt ein Projekt machen – Kunde und Adresse werden übernommen.' },
    ],
    tips: ['Die Monatsansicht findest du über „Kalender“ auf der Startseite.'],
  },
  {
    id: 'rapporte', icon: 'document-text-outline', color: '#0891b2', title: 'Rapporte, Material & Mitarbeiter', pro: true,
    intro: 'Arbeitszeiten, Fahrten und Material zu einem Projekt erfassen.',
    steps: [
      { text: 'Im Projekt „Rapport“ anlegen: Datum, Mitarbeiter, Stunden und Fahrzeiten eintragen.' },
      { text: 'Material aus der Materialliste oder aus Checklisten übernehmen.' },
      { text: 'Briefkopf-Felder am Ende des Editors festlegen – „Als Standard speichern“ merkt die Auswahl.' },
      { text: 'Mitarbeiter, Material und Maschinen pflegst du über die Kacheln der Startseite.', info: 'Bei Maschinen kannst du TÜV-Termine hinterlegen – die Startseite erinnert dich rechtzeitig.' },
    ],
  },
  {
    id: 'pdf', icon: 'share-outline', color: '#1d4ed8', title: 'PDF & Weitergeben',
    intro: 'Aus jedem Projekt ein sauberes PDF mit deinem Logo erstellen.',
    steps: [
      { text: 'Im Projekt „Projekt-PDF“ tippen und Inhalte auswählen (Skizzen, Fotos, Flächen, Checklisten …).' },
      { text: 'Teilen per Mail, WhatsApp, AirDrop oder in „Dateien“ speichern.' },
      { text: 'Logo, Firmendaten und Layout stellst du unter Einstellungen → PDF-Einstellungen ein.' },
      { text: '„Projekt exportieren“ erstellt eine Datei, die ein Kollege mit Aufmaßprofi Pro importieren kann.', pro: true },
      { text: 'Referenzen: abgeschlossene Projekte mit Beispielfotos sammeln und Kunden zeigen.', pro: true },
    ],
  },
  {
    id: 'backup', icon: 'cloud-upload-outline', color: '#0891b2', title: 'Datensicherung',
    intro: 'Alle Daten liegen ausschließlich auf deinem Gerät – sichere sie regelmäßig.',
    steps: [
      { text: 'Backup → „Backup erstellen & teilen“ und die Datei z. B. in iCloud Drive, Google Drive oder per Mail sichern.' },
      { text: 'Automatisches Backup und Erinnerung an neue Backups lassen sich dort einschalten.' },
      { text: 'Wiederherstellen: „Aus Datei wiederherstellen“ und die Backup-Datei auswählen.', info: 'Beim Wiederherstellen werden die aktuellen Daten durch den Stand der Sicherung ersetzt.' },
      { text: 'Speicher-Bereinigung (Einstellungen) entfernt nicht mehr benötigte Daten und schafft Platz.' },
    ],
    tips: ['Vor einem Handywechsel immer ein Backup erstellen und auf dem neuen Gerät wiederherstellen.'],
  },
  {
    id: 'einstellungen', icon: 'settings-outline', color: '#546e7a', title: 'Einstellungen',
    intro: 'App an deinen Betrieb anpassen.',
    steps: [
      { text: 'Sprache, Logo, PDF-Layout, Projekttypen und Werkzeugnamen anpassen.' },
      { text: 'Archiv und Papierkorb verwalten.' },
      { text: 'Pro-Version: Dach-Aufmaß, Fotomessung, Rapporte, Mitarbeiter, Material und weitere Funktionen.', pro: true },
      { text: 'Rechtliches: Datenschutz, Haftungsausschluss und Impressum.' },
    ],
  },
];

// Basic: Pro-Kapitel und -Schritte ausblenden
export const getManual = (isPro: boolean): ManualSection[] =>
  isPro ? MANUAL : MANUAL.filter(sec => !sec.pro).map(sec => ({ ...sec, steps: sec.steps.filter(st => !st.pro) }));

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const PRO = '<span class="pro">PRO</span>';

// HTML für das PDF (Kurzanleitung + ausführliche Anleitung inkl. aller Erklärungen)
export const manualHtml = (isPro = false) => `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>
  .pro { display: inline-block; background: #d97706; color: #fff; font-size: 9px; font-weight: 800; border-radius: 4px; padding: 1px 5px; margin-left: 6px; vertical-align: middle; }
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #0f172a; font-size: 12px; line-height: 1.45; }
  h1 { color: #1565c0; font-size: 26px; margin: 0 0 4px; } .sub { color: #475569; margin-bottom: 18px; }
  h2 { font-size: 17px; margin: 22px 0 6px; padding-bottom: 4px; border-bottom: 2px solid #e2e8f0; page-break-after: avoid; }
  .quick { background: #eff6ff; border-radius: 10px; padding: 12px 16px; page-break-inside: avoid; }
  .quick ol { margin: 6px 0 0 18px; padding: 0; } .quick li { margin-bottom: 5px; }
  .intro { color: #475569; margin-bottom: 6px; } ol.steps { margin: 0 0 0 18px; padding: 0; } ol.steps li { margin-bottom: 6px; }
  .info { background: #f1f5f9; border-left: 3px solid #1976d2; padding: 5px 8px; margin-top: 4px; color: #334155; font-size: 11px; }
  .tip { background: #fff7e6; border-left: 3px solid #d97706; padding: 5px 8px; margin-top: 6px; font-size: 11px; }
  section { page-break-inside: avoid; } .foot { margin-top: 24px; color: #64748b; font-size: 10px; }
</style></head><body>
<h1>Aufmaßprofi – Bedienungsanleitung</h1>
<div class="sub">Die App für digitales Aufmaß · Schritt für Schritt erklärt · ${isPro ? `Deine Version: Pro. Mit ${PRO} markierte Funktionen gibt es nur in der Pro-Version.` : ''}</div>
<div class="quick"><b>Kurzanleitung – in 7 Schritten startklar</b><ol>
${QUICK_START.map(q => `<li><b>${esc(q.title)}:</b> ${esc(q.text)}</li>`).join('')}
</ol></div>
${getManual(isPro).map(sec => `<section><h2>${esc(sec.title)}${sec.pro ? PRO : ''}</h2><div class="intro">${esc(sec.intro)}</div><ol class="steps">
${sec.steps.map(st => `<li>${esc(st.text)}${st.pro ? PRO : ''}${st.info ? `<div class="info">ℹ️ ${esc(st.info)}</div>` : ''}</li>`).join('')}
</ol>${(sec.tips || []).map(t => `<div class="tip">💡 ${esc(t)}</div>`).join('')}</section>`).join('')}
<div class="foot">Maße und Berechnungen dienen als Unterstützung und ersetzen keine Statik, Bauplanung oder amtliche Vermessung. Alle Daten bleiben ausschließlich auf deinem Gerät.</div>
</body></html>`;
