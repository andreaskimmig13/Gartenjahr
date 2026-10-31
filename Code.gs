/**
 * Gartenjahr – persönliche Garten-App (Google Apps Script)
 * Daten: Google Sheet + Drive-Ordner „Gartenjahr“ im eigenen Konto.
 * KI: Claude API (Schlüssel in den Skripteigenschaften).
 * Wetter: Open-Meteo (kostenlos, ohne Schlüssel).
 */
const VERSION = '1.0.5';
const TZ = 'Europe/Berlin';

const TABELLEN = {
  Flaechen: ['id', 'name', 'bereich', 'typ', 'licht', 'boden', 'notiz', 'plan', 'angelegt'],
  Pflanzen: ['id', 'name', 'botanisch', 'sorte', 'flaecheId', 'winterFlaecheId', 'haltung', 'bewaesserung', 'kreisId',
    'pflanzdatum', 'notiz', 'profil', 'planX', 'planY', 'standort', 'zuletztGegossen', 'thumb', 'angelegt'],
  Kreise: ['id', 'name', 'notiz', 'angelegt'],
  Aufgaben: ['id', 'key', 'quelle', 'bezugId', 'titel', 'kategorie', 'von', 'bis', 'status', 'erledigtAm',
    'hinweis', 'material', 'angelegt'],
  Fotos: ['id', 'pflanzeId', 'datum', 'fileId', 'art', 'zustand', 'bewertung', 'notiz', 'thumb'],
  Einkauf: ['id', 'artikel', 'menge', 'notiz', 'status', 'aufgabeId', 'angelegt', 'erledigtAm']
};

const STANDARD = {
  modell: 'claude-sonnet-5-5',
  ort: '', lat: '', lon: '',
  maehroboter: true, robotStart: '03-25', robotEnde: '10-31',
  frostSchwelle: 2, trockenTopf: 3, trockenBeet: 7,
  mailAktiv: true, mailAn: '',
  planFileId: ''
};

const SYS_GAERTNER = 'Du bist ein erfahrener Gärtnermeister in Deutschland und berätst einen Hobbygärtner. ' +
  'Deine Angaben sind praxisnah, jahreszeitlich korrekt für Mitteleuropa und knapp formuliert. ' +
  'Antworte ausschließlich mit gültigem JSON, ohne Markdown und ohne Text davor oder danach.';

/* ============================================================
 * Feste Jahrespläne: Rasen, Mähroboter, Bewässerung
 * ============================================================ */
const RASEN = [
  { vkey: 'duengen-fruehjahr', kategorie: 'Düngen', titel: 'Rasen düngen (Frühjahr)', von: '03-20', bis: '04-30',
    hinweis: 'Sobald der Rasen wieder wächst (Boden ca. 8–10 °C). Langzeitdünger, am besten vor leichtem Regen ausbringen. Wächst viel Moos, kann ein zu saurer Boden die Ursache sein – dann den pH-Wert testen und ggf. kalken (nicht gleichzeitig mit dem Dünger).', material: 'Rasendünger Frühjahr (Langzeit)' },
  { vkey: 'vertikutieren', kategorie: 'Rasen', titel: 'Vertikutieren', von: '04-15', bis: '05-31',
    hinweis: 'Etwa 2–3 Wochen nach dem Düngen, bei abgetrocknetem Boden. Vorher den Mähroboter tief mähen lassen (ca. 3 cm). Längs und quer vertikutieren, Filz abrechen.', material: '' },
  { vkey: 'sanden', kategorie: 'Rasen', titel: 'Sanden', von: '04-15', bis: '05-31',
    hinweis: 'Direkt nach dem Vertikutieren 3–5 l Quarzsand (0–2 mm) je m² dünn verteilen und mit dem Rechenrücken einarbeiten. Lockert den Boden, besonders wichtig bei Lehm.', material: 'Rasensand / Quarzsand 0–2 mm' },
  { vkey: 'nachsaat-fruehjahr', kategorie: 'Rasen', titel: 'Kahle Stellen nachsäen', von: '04-15', bis: '05-31',
    hinweis: 'Nach dem Sanden. Saat leicht andrücken und 2–3 Wochen gleichmäßig feucht halten. Den Mähroboter diese Stellen so lange aussparen lassen.', material: 'Nachsaat-Rasensamen' },
  { vkey: 'duengen-sommer', kategorie: 'Düngen', titel: 'Rasen düngen (Sommer)', von: '06-01', bis: '06-30',
    hinweis: 'Zweite Gabe. Nicht bei Hitze über 25 °C oder bei Trockenheit ausbringen.', material: 'Rasendünger Sommer' },
  { vkey: 'herbstpflege', kategorie: 'Rasen', titel: 'Herbstpflege: Lücken nachsäen', von: '08-20', bis: '09-30',
    hinweis: 'Der Spätsommer ist die beste Zeit für Nachsaat (warmer Boden, mehr Feuchtigkeit). Bei starkem Filz vorher leicht vertikutieren.', material: '' },
  { vkey: 'duengen-herbst', kategorie: 'Düngen', titel: 'Herbstdünger (kaliumbetont)', von: '09-01', bis: '10-31',
    hinweis: 'Kaliumbetonter Herbstdünger macht die Gräser frost- und krankheitsfester. Spätestens Ende Oktober.', material: 'Rasen-Herbstdünger' },
  { vkey: 'laub', kategorie: 'Rasen', titel: 'Laub vom Rasen entfernen', von: '10-15', bis: '11-30',
    hinweis: 'Liegendes Laub erstickt den Rasen und fördert Pilze. Regelmäßig abrechen.', material: '' }
];

const BEWAESSERUNG = [
  { vkey: 'bew-start', kategorie: 'Bewässerung', titel: 'Bewässerung in Betrieb nehmen', von: '04-10', bis: '05-10',
    hinweis: 'Nach den letzten Frösten: Leitungen anschließen und auf Lecks prüfen, Tropfer und Düsen reinigen, Batterie im Steuergerät wechseln, Programme an die Pflanzen anpassen.', material: 'Batterien für Steuergerät' },
  { vkey: 'bew-sommer', kategorie: 'Bewässerung', titel: 'Bewässerung: Filter reinigen, Laufzeiten erhöhen', von: '07-01', bis: '07-15',
    hinweis: 'Filter reinigen und Laufzeiten an die Sommerhitze anpassen – Topfpflanzen brauchen dann oft deutlich mehr.', material: '' },
  { vkey: 'bew-winter', kategorie: 'Bewässerung', titel: 'Bewässerung winterfest machen', von: '10-15', bis: '11-15',
    hinweis: 'Vor dem ersten Frost: Wasser abstellen, Leitungen entleeren bzw. ausblasen, Steuergerät, Ventile und Pumpe frostfrei einlagern, Batterien entnehmen.', material: '' }
];

function robotVorlagen_(s) {
  const st = normMD_(s.robotStart) || '03-25';
  const en = normMD_(s.robotEnde) || '10-31';
  return [
    { vkey: 'robot-start', kategorie: 'Mähroboter', titel: 'Mähroboter starten (Saisonbeginn)', von: shiftMD_(st, -7), bis: shiftMD_(st, 14),
      hinweis: 'Wenn der Rasen wieder wächst. Vorher Messer wechseln, Ladestation und Kontakte reinigen, App/Firmware aktualisieren, Mähzeiten einstellen. Die ersten Schnitte etwas höher.', material: 'Ersatzmesser Mähroboter' },
    { vkey: 'robot-messer-wechsel', kategorie: 'Mähroboter', titel: 'Mähroboter: Messer wechseln', von: '06-15', bis: '06-30',
      hinweis: 'Zur Saisonmitte die Messer tauschen und dabei die Unterseite von Grasresten befreien. Stumpfe Messer fransen die Halme aus (braune Spitzen).', material: 'Ersatzmesser Mähroboter' },
    { vkey: 'robot-hitze', kategorie: 'Mähroboter', titel: 'Mähroboter: Sommerbetrieb anpassen', von: '07-01', bis: '07-15',
      hinweis: 'Bei Hitze und Trockenheit Schnitthöhe erhöhen, Mähzeiten reduzieren und nicht in der Mittagshitze mähen.', material: '' },
    { vkey: 'robot-pause', kategorie: 'Mähroboter', titel: 'Mähroboter in die Winterpause', von: shiftMD_(en, -7), bis: shiftMD_(en, 14),
      hinweis: 'Wenn der Rasen kaum noch wächst: Mähplan deaktivieren, Gerät gründlich reinigen (nicht mit dem Wasserstrahl), Akku nach Herstellerangabe laden, trocken und frostfrei lagern. Ladestation je nach Hersteller abbauen oder abdecken.', material: '' }
  ];
}

/* ============================================================
 * Einrichtung und Web-App
 * ============================================================ */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Gartenjahr')
    .setFaviconUrl('https://andreaskimmig13.github.io/Gartenjahr/favicon.png')
    // Erlaubt das Einbetten in die eigene Startseite (dort ohne Google-Hinweisbanner)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .addMetaTag('mobile-web-app-capable', 'yes')
    .addMetaTag('apple-mobile-web-app-capable', 'yes');
}

/** Einmalig im Editor ausführen. Legt Ordner, Tabelle und die tägliche Prüfung an. */
function setup() {
  const props = PropertiesService.getScriptProperties();
  let ordner = null;
  const ordnerId = props.getProperty('FOLDER_ID');
  if (ordnerId) { try { ordner = DriveApp.getFolderById(ordnerId); } catch (e) { ordner = null; } }
  if (!ordner) {
    ordner = DriveApp.createFolder('Gartenjahr');
    props.setProperty('FOLDER_ID', ordner.getId());
  }
  ['FOTOS', 'PLAN'].forEach(function (n) {
    let ok = false;
    const id = props.getProperty('FOLDER_' + n);
    if (id) { try { DriveApp.getFolderById(id); ok = true; } catch (e) { ok = false; } }
    if (!ok) props.setProperty('FOLDER_' + n, ordner.createFolder(n === 'FOTOS' ? 'Fotos' : 'Plan').getId());
  });

  let ss = null;
  const ssId = props.getProperty('SS_ID');
  if (ssId) { try { ss = SpreadsheetApp.openById(ssId); } catch (e) { ss = null; } }
  if (!ss) {
    ss = SpreadsheetApp.create('Gartenjahr – Daten');
    DriveApp.getFileById(ss.getId()).moveTo(ordner);
    props.setProperty('SS_ID', ss.getId());
  }
  Object.keys(TABELLEN).forEach(function (name) {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    const cols = TABELLEN[name];
    sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange(1, 1, sh.getMaxRows(), cols.length).setNumberFormat('@');
  });
  ss.getSheets().forEach(function (sh) {
    if (!TABELLEN[sh.getName()] && ss.getSheets().length > 1 && sh.getLastRow() === 0) ss.deleteSheet(sh);
  });

  const s = einstellungen_();
  if (!s.mailAn) {
    s.mailAn = Session.getEffectiveUser().getEmail();
    PropertiesService.getScriptProperties().setProperty('SETTINGS', JSON.stringify(s));
  }
  trigger_(bool_(s.mailAktiv));
  Logger.log('Fertig. Daten liegen hier: ' + ss.getUrl());
}

function trigger_(aktiv) {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'taeglich') ScriptApp.deleteTrigger(t);
  });
  if (aktiv) ScriptApp.newTrigger('taeglich').timeBased().everyDays(1).atHour(7).inTimezone(TZ).create();
}

/* ============================================================
 * Daten-Grundfunktionen
 * ============================================================ */
let _ss = null;
function prop_(k) { return PropertiesService.getScriptProperties().getProperty(k); }
function pruefeSetup_() {
  if (!prop_('SS_ID')) throw new Error('Die App ist noch nicht eingerichtet. Bitte im Skript-Editor einmal die Funktion „setup“ ausführen.');
}
function ss_() { if (!_ss) { pruefeSetup_(); _ss = SpreadsheetApp.openById(prop_('SS_ID')); } return _ss; }
function blatt_(n) {
  const sh = ss_().getSheetByName(n);
  if (!sh) throw new Error('Tabellenblatt „' + n + '“ fehlt – bitte setup erneut ausführen.');
  return sh;
}

function lesen_(n) {
  const sh = blatt_(n), cols = TABELLEN[n], last = sh.getLastRow();
  if (last < 2) return [];
  const vals = sh.getRange(2, 1, last - 1, cols.length).getValues();
  const out = [];
  vals.forEach(function (r, i) {
    const o = { _row: i + 2 };
    cols.forEach(function (c, j) {
      let v = r[j];
      if (v instanceof Date) v = Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
      o[c] = (v === null || v === undefined) ? '' : String(v);
    });
    if (o.id) out.push(o);
  });
  return out;
}

function zeile_(n, o) { return TABELLEN[n].map(function (c) { return o[c] === undefined || o[c] === null ? '' : String(o[c]); }); }

function einfuegen_(n, objs) {
  if (!objs.length) return;
  const sh = blatt_(n), cols = TABELLEN[n];
  const start = sh.getLastRow() + 1;
  const r = sh.getRange(start, 1, objs.length, cols.length);
  r.setNumberFormat('@');
  r.setValues(objs.map(function (o) { return zeile_(n, o); }));
}

function finde_(n, id) {
  const o = lesen_(n).find(function (x) { return x.id === id; });
  if (!o) throw new Error('Eintrag nicht gefunden.');
  return o;
}

function aendern_(n, id, patch) {
  const o = finde_(n, id);
  Object.keys(patch).forEach(function (k) { if (TABELLEN[n].indexOf(k) >= 0) o[k] = patch[k]; });
  const r = blatt_(n).getRange(o._row, 1, 1, TABELLEN[n].length);
  r.setNumberFormat('@');
  r.setValues([zeile_(n, o)]);
  return sauber_(o);
}

function zeilenLoeschen_(n, filterFn) {
  const sh = blatt_(n);
  const rows = lesen_(n).filter(filterFn).map(function (o) { return o._row; }).sort(function (a, b) { return b - a; });
  rows.forEach(function (r) { sh.deleteRow(r); });
  return rows.length;
}

function sauber_(o) { const c = {}; Object.keys(o).forEach(function (k) { if (k !== '_row') c[k] = o[k]; }); return c; }
function map_(arr) { const m = {}; arr.forEach(function (x) { m[x.id] = x; }); return m; }
function id_(p) { return p + Utilities.getUuid().replace(/-/g, '').slice(0, 10); }
function parse_(s) { if (!s) return null; try { return JSON.parse(s); } catch (e) { return null; } }
function bool_(v) { return v === true || v === 'true' || v === 1 || v === '1'; }

function mitSperre_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

/* ---------- Datum ---------- */
function pad_(n) { n = String(n); return n.length < 2 ? '0' + n : n; }
function heute_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }
function jetzt_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm'); }
function addTage_(iso, n) {
  const d = new Date(String(iso).slice(0, 10) + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function diffTage_(a, b) {
  return Math.round((new Date(String(b).slice(0, 10) + 'T12:00:00Z') - new Date(String(a).slice(0, 10) + 'T12:00:00Z')) / 864e5);
}
function normMD_(s) {
  const m = String(s || '').trim().match(/^(\d{1,2})-(\d{1,2})$/);
  if (!m) return null;
  const mo = Number(m[1]), t = Number(m[2]);
  if (mo < 1 || mo > 12 || t < 1 || t > 31) return null;
  return pad_(mo) + '-' + pad_(t);
}
function datumAus_(jahr, md) {
  const mo = Number(md.slice(0, 2));
  let t = Number(md.slice(3, 5));
  const max = new Date(Date.UTC(jahr, mo, 0)).getUTCDate();
  if (t > max) t = max;
  return jahr + '-' + pad_(mo) + '-' + pad_(t);
}
function shiftMD_(md, n) { return addTage_('2001-' + md, n).slice(5); }
function wochentag_(iso) {
  return ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][new Date(iso + 'T12:00:00Z').getUTCDay()] + ' ' +
    iso.slice(8, 10) + '.' + iso.slice(5, 7) + '.';
}
function slug_(s) {
  return String(s || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}

/* ============================================================
 * Einstellungen
 * ============================================================ */
function einstellungen_() {
  const s = parse_(prop_('SETTINGS')) || {};
  const out = {};
  Object.keys(STANDARD).forEach(function (k) { out[k] = (s[k] === undefined) ? STANDARD[k] : s[k]; });
  return out;
}
function oeffentlich_(s) {
  const o = JSON.parse(JSON.stringify(s));
  o.hatSchluessel = !!prop_('CLAUDE_API_KEY');
  o.hatPlan = !!s.planFileId;
  return o;
}

function speichereEinstellungen(neu) {
  return mitSperre_(function () {
    const s = einstellungen_();
    const vorherMail = bool_(s.mailAktiv);
    const vorherRobot = [bool_(s.maehroboter), s.robotStart, s.robotEnde].join('|');
    ['modell', 'ort', 'lat', 'lon', 'robotStart', 'robotEnde', 'mailAn'].forEach(function (k) {
      if (neu[k] !== undefined) s[k] = String(neu[k]).trim();
    });
    ['frostSchwelle', 'trockenTopf', 'trockenBeet'].forEach(function (k) {
      if (neu[k] !== undefined && neu[k] !== '' && !isNaN(Number(neu[k]))) s[k] = Number(neu[k]);
    });
    ['maehroboter', 'mailAktiv'].forEach(function (k) { if (neu[k] !== undefined) s[k] = bool_(neu[k]); });
    if (!s.modell) s.modell = STANDARD.modell;
    PropertiesService.getScriptProperties().setProperty('SETTINGS', JSON.stringify(s));
    if (bool_(s.mailAktiv) !== vorherMail) trigger_(bool_(s.mailAktiv));
    if ([bool_(s.maehroboter), s.robotStart, s.robotEnde].join('|') !== vorherRobot) {
      // offene, noch nicht begonnene Mähroboter-Aufgaben neu planen
      zeilenLoeschen_('Aufgaben', function (a) {
        return a.bezugId === 'maehroboter' && a.status === 'offen' && a.von > heute_();
      });
      syncAufgaben_();
    }
    return oeffentlich_(s);
  });
}

function speichereSchluessel(key) {
  key = String(key || '').trim();
  if (!key) { PropertiesService.getScriptProperties().deleteProperty('CLAUDE_API_KEY'); return false; }
  if (key.indexOf('sk-ant-') !== 0) throw new Error('Das sieht nicht wie ein Claude-API-Schlüssel aus (beginnt mit „sk-ant-“).');
  PropertiesService.getScriptProperties().setProperty('CLAUDE_API_KEY', key);
  return true;
}

function testeKi() {
  const r = claude_('Antworte nur mit JSON.', 'Antworte mit {"ok":true}', null, 50);
  return !!(r && r.ok);
}

function sucheOrt(name) {
  const url = 'https://geocoding-api.open-meteo.com/v1/search?count=6&language=de&name=' + encodeURIComponent(String(name || '').trim());
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('Ortssuche nicht erreichbar.');
  const d = JSON.parse(res.getContentText());
  return (d.results || []).map(function (r) {
    return { name: r.name, region: [r.admin1, r.country].filter(String).join(', '), lat: r.latitude, lon: r.longitude };
  });
}

/* ============================================================
 * Laden
 * ============================================================ */
function ladeAlles() {
  pruefeSetup_();
  const letzter = Number(prop_('LAST_SYNC') || 0);
  if (Date.now() - letzter > 6 * 3600 * 1000 || prop_('SYNC_VERSION') !== VERSION) {
    mitSperre_(syncAufgaben_);
    PropertiesService.getScriptProperties().setProperty('SYNC_VERSION', VERSION);
  }
  const heute = heute_();
  const grenze = addTage_(heute, -60);
  const fl = lesen_('Flaechen'), pf = lesen_('Pflanzen');
  const au = lesen_('Aufgaben').filter(function (a) {
    return a.status === 'offen' || (a.erledigtAm || '') >= grenze;
  });
  let hinweise = [];
  try { hinweise = hinweise_(fl, pf); } catch (e) {
    hinweise = [{ typ: 'info', titel: 'Wetter gerade nicht verfügbar', text: String(e.message || e), pflanzen: [] }];
  }
  return {
    version: VERSION,
    heute: heute,
    flaechen: fl.map(sauber_),
    pflanzen: pf.map(sauber_),
    kreise: lesen_('Kreise').map(sauber_),
    aufgaben: au.map(sauber_),
    einkauf: lesen_('Einkauf').map(sauber_),
    einstellungen: oeffentlich_(einstellungen_()),
    hinweise: hinweise,
    links: { tabelle: ss_().getUrl(), ordner: 'https://drive.google.com/drive/folders/' + prop_('FOLDER_ID') }
  };
}

/* ============================================================
 * Aufgaben-Generator
 * ============================================================ */
function vorlagen_() {
  const s = einstellungen_();
  const v = [];
  lesen_('Pflanzen').forEach(function (p) {
    const prof = parse_(p.profil);
    if (!prof || !Array.isArray(prof.aufgaben)) return;
    prof.aufgaben.forEach(function (a) {
      if (!a || !a.titel || istKontrollaufgabe_(a)) return;
      v.push({
        quelle: 'pflanze', bezugId: p.id, vkey: slug_((a.kategorie || '') + '-' + a.titel),
        kategorie: a.kategorie || 'Pflege', titel: a.titel, von: a.von, bis: a.bis,
        intervallTage: a.intervallTage, hinweis: a.hinweis || '', material: a.material || ''
      });
    });
  });
  lesen_('Flaechen').forEach(function (f) {
    if (f.typ !== 'Rasen') return;
    RASEN.forEach(function (r) { v.push(Object.assign({}, r, { quelle: 'flaeche', bezugId: f.id })); });
  });
  if (bool_(s.maehroboter)) robotVorlagen_(s).forEach(function (r) { v.push(Object.assign({}, r, { quelle: 'system', bezugId: 'maehroboter' })); });
  if (lesen_('Kreise').length) BEWAESSERUNG.forEach(function (r) { v.push(Object.assign({}, r, { quelle: 'system', bezugId: 'bewaesserung' })); });
  return v;
}

/** Erzeugt fehlende Aufgaben für die nächsten 12 Monate und markiert lange Überfälliges als verpasst. */
function syncAufgaben_() {
  const heute = heute_();
  const vorlagen = vorlagen_();
  // Offene geplante Aufgaben entfernen, deren Vorlage es nicht mehr gibt (z. B. reine Kontrollaufgaben)
  const weg = veralteteAufgaben_(lesen_('Aufgaben'), vorlagen, heute);
  if (weg.length) { const set = {}; weg.forEach(function (id) { set[id] = true; }); zeilenLoeschen_('Aufgaben', function (a) { return set[a.id]; }); }
  const alle = lesen_('Aufgaben');
  const neu = planeAufgaben_(vorlagen, alle.map(function (a) { return a.key; }), heute);
  einfuegen_('Aufgaben', neu.map(function (n) {
    return Object.assign(n, { id: id_('a'), status: 'offen', erledigtAm: '', angelegt: jetzt_() });
  }));
  // Generierte Aufgaben, deren Zeitfenster seit über 45 Tagen vorbei ist, als „verpasst“ ablegen
  const sh = blatt_('Aufgaben');
  const spStatus = TABELLEN.Aufgaben.indexOf('status') + 1, spErl = TABELLEN.Aufgaben.indexOf('erledigtAm') + 1;
  alle.forEach(function (a) {
    if (a.status === 'offen' && a.key && a.bis && diffTage_(a.bis, heute) > 45) {
      sh.getRange(a._row, spStatus).setValue('verpasst');
      sh.getRange(a._row, spErl).setNumberFormat('@').setValue(heute);
    }
  });
  PropertiesService.getScriptProperties().setProperty('LAST_SYNC', String(Date.now()));
  return neu.length;
}

/** Kontroll-/Beobachtungsaufgaben gehören nicht in den Aufgabenspeicher, sondern in den Steckbrief. */
function istKontrollaufgabe_(a) {
  if (a.kategorie === 'Pflanzenschutz') return true;
  const t = String(a.titel || '') + ' ' + String(a.kategorie || '');
  return /(kontroll|prüf|pruef|check|beobacht|befall|ausschau|im blick|inspiz|untersuch|absuch|nachseh|nachschau|schädling|schaedling|krankheit|spinnmilb|läuse|laeuse|thrips|pilzbefall)/i.test(t);
}

/** IDs offener, automatisch geplanter Aufgaben, zu denen es keine Vorlage mehr gibt. */
function veralteteAufgaben_(alle, vorlagen, heute) {
  const vorlauf = heute ? addTage_(heute, 10) : '9999';
  const gueltig = {};
  vorlagen.forEach(function (v) { gueltig[[v.quelle, v.bezugId, v.vkey].join('|')] = true; });
  return alle.filter(function (a) {
    if (a.status !== 'offen' || !a.key) return false;
    if (a.key.indexOf('#') > 0 && a.von > vorlauf) return true; // weit vorausgeplante Wiederholungen
    return !gueltig[a.key.split('|').slice(0, 3).join('|')];
  }).map(function (a) { return a.id; });
}

/** Reine Planungslogik (ohne Tabellenzugriff, damit testbar). */
function planeAufgaben_(vorlagen, vorhandeneKeys, heute) {
  const keys = {};
  vorhandeneKeys.forEach(function (k) { if (k) keys[k] = true; });
  const limit = addTage_(heute, 365);
  const vorlauf = addTage_(heute, 10);
  const y = Number(heute.slice(0, 4));
  const neu = [];
  vorlagen.forEach(function (v) {
    const von0 = normMD_(v.von), bis0 = normMD_(v.bis);
    if (!von0 || !bis0) return;
    [y - 1, y, y + 1].forEach(function (j) {
      const von = datumAus_(j, von0);
      const bis = datumAus_(bis0 < von0 ? j + 1 : j, bis0);
      const iv = Math.round(Number(v.intervallTage) || 0);
      const stuecke = [];
      if (iv >= 14) {
        let d = von, i = 0;
        while (d <= bis && i < 30) {
          const e = addTage_(d, iv - 1);
          stuecke.push({ von: d, bis: e < bis ? e : bis, suf: '#' + i });
          d = addTage_(d, iv); i++;
        }
      } else {
        stuecke.push({ von: von, bis: bis, suf: '' });
      }
      stuecke.forEach(function (st) {
        // Wiederkehrende Aufgaben (z. B. alle 14 Tage düngen) nur als nächsten Termin einplanen
        if (st.bis < heute || st.von > (st.suf ? vorlauf : limit)) return;
        const key = [v.quelle, v.bezugId, v.vkey, j].join('|') + st.suf;
        if (keys[key]) return;
        keys[key] = true;
        neu.push({
          key: key, quelle: v.quelle, bezugId: v.bezugId, titel: v.titel, kategorie: v.kategorie || 'Pflege',
          von: st.von, bis: st.bis, hinweis: v.hinweis || '', material: v.material || ''
        });
      });
    });
  });
  return neu;
}

/* ---------- Aufgaben bearbeiten ---------- */
function aufgabeAktion(id, aktion) {
  return mitSperre_(function () {
    const a = finde_('Aufgaben', id);
    const heute = heute_();
    if (aktion === 'erledigt') return aendern_('Aufgaben', id, { status: 'erledigt', erledigtAm: heute });
    if (aktion === 'offen') return aendern_('Aufgaben', id, { status: 'offen', erledigtAm: '' });
    if (aktion === 'ueberspringen') return aendern_('Aufgaben', id, { status: 'übersprungen', erledigtAm: heute });
    if (aktion === 'verschieben') {
      const von = addTage_(heute, 7);
      const bis = a.bis > addTage_(heute, 13) ? a.bis : addTage_(heute, 13);
      return aendern_('Aufgaben', id, { von: von, bis: bis, status: 'offen' });
    }
    if (aktion === 'loeschen') {
      if (a.key) throw new Error('Geplante Aufgaben bitte überspringen statt löschen.');
      zeilenLoeschen_('Aufgaben', function (x) { return x.id === id; });
      return null;
    }
    throw new Error('Unbekannte Aktion');
  });
}

function aufgabenErledigt(ids) {
  return mitSperre_(function () {
    const set = {}; ids.forEach(function (i) { set[i] = true; });
    const sh = blatt_('Aufgaben'), heute = heute_();
    const spS = TABELLEN.Aufgaben.indexOf('status') + 1, spE = TABELLEN.Aufgaben.indexOf('erledigtAm') + 1;
    let n = 0;
    lesen_('Aufgaben').forEach(function (a) {
      if (set[a.id] && a.status === 'offen') {
        sh.getRange(a._row, spS).setValue('erledigt');
        sh.getRange(a._row, spE).setNumberFormat('@').setValue(heute);
        n++;
      }
    });
    return n;
  });
}

function neueAufgabe(d) {
  return mitSperre_(function () {
    if (!d || !String(d.titel || '').trim()) throw new Error('Bitte einen Titel eingeben.');
    const heute = heute_();
    const von = d.von || heute;
    const a = {
      id: id_('a'), key: '', quelle: 'manuell', bezugId: d.bezugId || '', titel: String(d.titel).trim(),
      kategorie: d.kategorie || 'Sonstiges', von: von, bis: d.bis && d.bis >= von ? d.bis : von,
      status: 'offen', erledigtAm: '', hinweis: d.hinweis || '', material: d.material || '', angelegt: jetzt_()
    };
    einfuegen_('Aufgaben', [a]);
    return a;
  });
}

function uebernehmeMassnahmen(pflanzeId, liste) {
  return mitSperre_(function () {
    const heute = heute_();
    const neu = (liste || []).filter(function (m) { return m && m.titel; }).map(function (m) {
      return {
        id: id_('a'), key: '', quelle: 'foto', bezugId: pflanzeId, titel: m.titel, kategorie: m.kategorie || 'Pflege',
        von: heute, bis: addTage_(heute, m.dringend ? 3 : 14), status: 'offen', erledigtAm: '',
        hinweis: m.hinweis || '', material: m.material || '', angelegt: jetzt_()
      };
    });
    einfuegen_('Aufgaben', neu);
    return neu.length;
  });
}

/* ============================================================
 * Flächen und Bewässerungskreise
 * ============================================================ */
function speichereFlaeche(d) {
  return mitSperre_(function () {
    if (!String(d.name || '').trim()) throw new Error('Bitte einen Namen eingeben.');
    const felder = {
      name: String(d.name).trim(), bereich: d.bereich === 'Drinnen' ? 'Drinnen' : 'Draußen', typ: d.typ || 'Beet',
      licht: d.licht || '', boden: d.boden || '', notiz: d.notiz || ''
    };
    let f;
    if (d.id) {
      const alt = finde_('Flaechen', d.id);
      f = aendern_('Flaechen', d.id, felder);
      if (alt.typ === 'Rasen' && f.typ !== 'Rasen') {
        zeilenLoeschen_('Aufgaben', function (a) { return a.bezugId === f.id && a.quelle === 'flaeche' && a.status === 'offen'; });
      }
    } else {
      f = Object.assign({ id: id_('fl'), plan: '', angelegt: jetzt_() }, felder);
      einfuegen_('Flaechen', [f]);
    }
    if (f.typ === 'Rasen') syncAufgaben_();
    return f;
  });
}

function loescheFlaeche(id) {
  return mitSperre_(function () {
    const n = lesen_('Pflanzen').filter(function (p) { return p.flaecheId === id || p.winterFlaecheId === id; }).length;
    if (n) throw new Error('Auf dieser Fläche sind noch ' + n + ' Pflanze(n) eingetragen. Bitte zuerst umziehen oder löschen.');
    zeilenLoeschen_('Aufgaben', function (a) { return a.bezugId === id && a.status === 'offen'; });
    zeilenLoeschen_('Flaechen', function (f) { return f.id === id; });
    return true;
  });
}

function speichereKreis(d) {
  return mitSperre_(function () {
    if (!String(d.name || '').trim()) throw new Error('Bitte einen Namen eingeben.');
    let k;
    if (d.id) k = aendern_('Kreise', d.id, { name: String(d.name).trim(), notiz: d.notiz || '' });
    else {
      k = { id: id_('k'), name: String(d.name).trim(), notiz: d.notiz || '', angelegt: jetzt_() };
      einfuegen_('Kreise', [k]);
    }
    syncAufgaben_();
    return k;
  });
}

function loescheKreis(id) {
  return mitSperre_(function () {
    const n = lesen_('Pflanzen').filter(function (p) { return p.kreisId === id; }).length;
    if (n) throw new Error('Diesem Kreis sind noch ' + n + ' Pflanze(n) zugeordnet.');
    zeilenLoeschen_('Kreise', function (k) { return k.id === id; });
    if (!lesen_('Kreise').length) {
      zeilenLoeschen_('Aufgaben', function (a) { return a.bezugId === 'bewaesserung' && a.status === 'offen'; });
    }
    return true;
  });
}

/* ============================================================
 * Pflanzen
 * ============================================================ */
function kontext_(d, flM) {
  const f = flM[d.flaecheId] || {};
  const w = d.winterFlaecheId ? flM[d.winterFlaecheId] : null;
  return {
    name: d.name, botanisch: d.botanisch, sorte: d.sorte, haltung: d.haltung, bewaesserung: d.bewaesserung,
    bereich: f.bereich, licht: f.licht, boden: f.boden, flaeche: f.name, flaecheTyp: f.typ,
    winterquartier: w ? w.name + ' (' + (w.bereich === 'Drinnen' ? 'drinnen' : 'draußen') + (w.licht ? ', ' + w.licht : '') + ')' : ''
  };
}

function profilPrompt_(k) {
  const s = einstellungen_();
  return 'Erstelle einen Pflegesteckbrief für diese Pflanze in einem Privatgarten in Deutschland' +
    (s.ort ? ' (Region: ' + s.ort + ')' : '') + '.\n\n' +
    'Pflanze: ' + k.name + (k.botanisch ? ' (' + k.botanisch + ')' : '') + (k.sorte ? ', Sorte: ' + k.sorte : '') + '\n' +
    'Standort: ' + (k.bereich === 'Drinnen' ? 'drinnen (Zimmerpflanze)' : 'draußen') +
    (k.flaecheTyp ? ', Flächentyp: ' + k.flaecheTyp : '') + (k.licht ? ', Licht: ' + k.licht : '') + (k.boden ? ', Boden: ' + k.boden : '') + '\n' +
    'Haltung: ' + (k.haltung === 'Topf' ? 'im Topf/Kübel' : 'ausgepflanzt') + '\n' +
    (k.winterquartier ? 'Winterquartier: ' + k.winterquartier + '\n' : '') +
    'Bewässerung: ' + (k.bewaesserung === 'Automatisch' ? 'automatische Bewässerung (Tropfer) vorhanden' : 'wird von Hand gegossen') + '\n\n' +
    'Antworte NUR mit JSON in genau diesem Format:\n' +
    '{\n' +
    ' "name": "gebräuchlicher deutscher Name",\n' +
    ' "botanisch": "botanischer Name",\n' +
    ' "kurzinfo": "1–2 Sätze, was das für eine Pflanze ist",\n' +
    ' "licht": ["sonnig","halbschattig","schattig"] (nur die geeigneten Werte),\n' +
    ' "standortHinweis": "kurzer Hinweis zu Standort und Boden",\n' +
    ' "wasserbedarf": "gering" | "mittel" | "hoch",\n' +
    ' "giessen": "Gießtipps (Häufigkeit, Menge, worauf achten), passend zu Haltung und Bewässerung",\n' +
    ' "giessIntervallTage": Zahl oder null (typischer Abstand zwischen Wassergaben in der Hauptsaison, nur bei Zimmerpflanzen; sonst null),\n' +
    ' "giessIntervallWinterTage": Zahl oder null (Zimmerpflanze im Winter bzw. Kübelpflanze im Winterquartier; sonst null),\n' +
    ' "duengen": "wann, womit und wie oft düngen; ab wann nicht mehr",\n' +
    ' "schnitt": "wann und wie schneiden; was man vermeiden sollte",\n' +
    ' "winter": "Winterschutz bzw. Überwinterung",\n' +
    ' "winterschutz": "Sofortmaßnahme bei Frost in max. 8 Wörtern",\n' +
    ' "frostgrenze": Zahl in °C, bis zu der die Pflanze ausgepflanzt ohne Schutz durchhält (z. B. -20 für sehr winterhart, 5 für sehr empfindlich), null bei reinen Zimmerpflanzen,\n' +
    ' "frostempfindlich": true | false,\n' +
    ' "giftigkeit": {"stufe": "ungiftig" | "leicht giftig" | "giftig" | "stark giftig", "text": "für Kinder und Haustiere (Hund, Katze): welche Teile, welche Wirkung"},\n' +
    ' "schaedlinge": "typische Schädlinge und Krankheiten, woran man sie erkennt, was vorbeugt",\n' +
    ' "tipps": ["2–4 kurze, konkrete Pflegetipps"],\n' +
    ' "aufgaben": [{"kategorie": "Schnitt" | "Düngen" | "Winterschutz" | "Umtopfen" | "Pflege", "titel": "kurz, z. B. Rückschnitt", "von": "MM-TT", "bis": "MM-TT", "intervallTage": Zahl oder null, "hinweis": "wie genau", "material": "Einkaufsartikel oder leer"}]\n' +
    '}\n\n' +
    'Regeln für "aufgaben": nur Arbeiten, die in einem normalen Jahr ohne besondere Vorkommnisse tatsächlich erledigt werden müssen, mit realistischem Zeitfenster für Deutschland (MM-TT, z. B. "03-15"). ' +
    'KEINE Kontroll- oder Beobachtungsaufgaben wie "auf Schädlinge prüfen", "Blätter kontrollieren" oder "Zustand beobachten" – was man im Blick behalten sollte, gehört in "schaedlinge" bzw. "tipps". ' +
    'Schnitt und Düngen haben Vorrang und sollen vollständig sein. Für regelmäßiges Düngen EINE Aufgabe über den ganzen Düngezeitraum mit "intervallTage" (mindestens 14, z. B. 14 oder 28); für einmalige Gaben intervallTage null. ' +
    'Bei Topfpflanzen draußen, die nicht im Topf überwintern können: "Ins Winterquartier räumen" und "Ausräumen" mit Zeitfenster. ' +
    'Keine Gießaufgaben. Höchstens 8 Aufgaben. "material" nur, wenn etwas gekauft werden muss (z. B. "Rosendünger").';
}

function neuePflanze(d, foto) {
  pruefeSetup_();
  const flM = map_(lesen_('Flaechen'));
  if (!flM[d.flaecheId]) throw new Error('Bitte eine Fläche wählen.');
  if (!String(d.name || '').trim()) throw new Error('Bitte einen Namen eingeben.');
  const prof = claude_(SYS_GAERTNER, profilPrompt_(kontext_(d, flM)), null, 3000);
  return mitSperre_(function () {
    const p = {
      id: id_('p'), name: String(d.name).trim(), botanisch: d.botanisch || prof.botanisch || '', sorte: d.sorte || '',
      flaecheId: d.flaecheId, winterFlaecheId: d.haltung === 'Topf' ? (d.winterFlaecheId || '') : '',
      haltung: d.haltung === 'Topf' ? 'Topf' : 'Ausgepflanzt', bewaesserung: d.bewaesserung === 'Automatisch' ? 'Automatisch' : 'Manuell',
      kreisId: d.bewaesserung === 'Automatisch' ? (d.kreisId || '') : '', pflanzdatum: d.pflanzdatum || '', notiz: d.notiz || '',
      profil: JSON.stringify(prof), planX: '', planY: '', standort: 'Sommer', zuletztGegossen: '', thumb: '', angelegt: jetzt_()
    };
    einfuegen_('Pflanzen', [p]);
    if (foto && foto.bild) fotoSpeichern_(p, foto, 'Bestimmung', '', {});
    syncAufgaben_();
    return p.id;
  });
}

function aenderePflanze(d, neuesProfil) {
  pruefeSetup_();
  const alt = finde_('Pflanzen', d.id);
  const felder = {
    name: String(d.name || alt.name).trim(), botanisch: d.botanisch || '', sorte: d.sorte || '', flaecheId: d.flaecheId || alt.flaecheId,
    haltung: d.haltung === 'Topf' ? 'Topf' : 'Ausgepflanzt', bewaesserung: d.bewaesserung === 'Automatisch' ? 'Automatisch' : 'Manuell',
    pflanzdatum: d.pflanzdatum || '', notiz: d.notiz || ''
  };
  felder.winterFlaecheId = felder.haltung === 'Topf' ? (d.winterFlaecheId || '') : '';
  felder.kreisId = felder.bewaesserung === 'Automatisch' ? (d.kreisId || '') : '';
  if (felder.haltung !== 'Topf') felder.standort = 'Sommer';
  let prof = null;
  if (neuesProfil) {
    const flM = map_(lesen_('Flaechen'));
    prof = claude_(SYS_GAERTNER, profilPrompt_(kontext_(Object.assign({}, alt, felder), flM)), null, 3000);
    felder.profil = JSON.stringify(prof);
  }
  return mitSperre_(function () {
    const p = aendern_('Pflanzen', d.id, felder);
    if (prof) {
      zeilenLoeschen_('Aufgaben', function (a) { return a.bezugId === p.id && a.quelle === 'pflanze' && a.status === 'offen'; });
      syncAufgaben_();
    }
    return p.id;
  });
}

function neuerSteckbrief(id) {
  const p = finde_('Pflanzen', id);
  return aenderePflanze(sauber_(p), true);
}

function loeschePflanze(id) {
  return mitSperre_(function () {
    lesen_('Fotos').filter(function (f) { return f.pflanzeId === id; }).forEach(function (f) {
      try { DriveApp.getFileById(f.fileId).setTrashed(true); } catch (e) { /* schon weg */ }
    });
    zeilenLoeschen_('Fotos', function (f) { return f.pflanzeId === id; });
    zeilenLoeschen_('Aufgaben', function (a) { return a.bezugId === id && a.status === 'offen'; });
    zeilenLoeschen_('Pflanzen', function (p) { return p.id === id; });
    return true;
  });
}

function pflanzeGegossen(id) {
  return mitSperre_(function () { return aendern_('Pflanzen', id, { zuletztGegossen: heute_() }); });
}

function pflanzeStandort(id, standort) {
  return mitSperre_(function () { return aendern_('Pflanzen', id, { standort: standort === 'Winter' ? 'Winter' : 'Sommer' }); });
}

/* ============================================================
 * Fotos und KI
 * ============================================================ */
function b64_(dataUrl) { const s = String(dataUrl || ''); const i = s.indexOf(','); return i >= 0 ? s.slice(i + 1) : s; }

function fotoSpeichern_(p, foto, art, notiz, extra) {
  const ordner = DriveApp.getFolderById(prop_('FOLDER_FOTOS'));
  const datum = jetzt_();
  const name = p.name.replace(/[\\/:*?"<>|]/g, '') + ' – ' + datum.replace(':', '-') + ' – ' + art + '.jpg';
  const file = ordner.createFile(Utilities.newBlob(Utilities.base64Decode(b64_(foto.bild)), 'image/jpeg', name));
  const f = {
    id: id_('f'), pflanzeId: p.id, datum: datum, fileId: file.getId(), art: art,
    zustand: extra.zustand || '', bewertung: extra.bewertung || '', notiz: notiz || '', thumb: foto.thumb || ''
  };
  einfuegen_('Fotos', [f]);
  if (foto.thumb) aendern_('Pflanzen', p.id, { thumb: foto.thumb });
  return f;
}

function bestimmeFoto(bild) {
  return claude_(
    'Du bist Botaniker und Gärtnermeister in Deutschland. Antworte ausschließlich mit gültigem JSON.',
    'Bestimme die Pflanze auf dem Foto (Garten- oder Zimmerpflanze in Deutschland). Antworte NUR mit JSON:\n' +
    '{"kandidaten":[{"name":"deutscher Name","botanisch":"botanischer Name","sorte":"falls sicher erkennbar, sonst leer","sicherheit":Zahl 0–100,"merkmale":"woran erkannt, 1 Satz"}],"hinweis":"was ein besseres Foto zeigen sollte, sonst leer"}\n' +
    'Höchstens 3 Kandidaten, der wahrscheinlichste zuerst. Ist keine Pflanze erkennbar, bleibt "kandidaten" leer.',
    b64_(bild), 900);
}

function fotoHinzufuegen(pflanzeId, foto, notiz) {
  return mitSperre_(function () {
    const p = finde_('Pflanzen', pflanzeId);
    return sauber_(fotoSpeichern_(p, foto, 'Tagebuch', notiz || '', {}));
  });
}

function pruefeFoto(pflanzeId, foto, notiz) {
  const p = finde_('Pflanzen', pflanzeId);
  const prof = parse_(p.profil) || {};
  const flM = map_(lesen_('Flaechen'));
  const f = flM[p.standort === 'Winter' && p.winterFlaecheId ? p.winterFlaecheId : p.flaecheId] || {};
  const vorher = lesen_('Fotos').filter(function (x) { return x.pflanzeId === pflanzeId && x.art === 'Check'; }).pop();
  let vorherText = '';
  if (vorher) { const vb = parse_(vorher.bewertung); if (vb) vorherText = 'Letzte Beurteilung (' + vorher.datum.slice(0, 10) + '): ' + vorher.zustand + ' – ' + (vb.zusammenfassung || ''); }
  const heute = heute_();
  const text = 'Beurteile den aktuellen Zustand dieser Pflanze anhand des Fotos und sage, was jetzt zu tun ist.\n' +
    'Pflanze: ' + p.name + (p.botanisch ? ' (' + p.botanisch + ')' : '') + '\n' +
    'Heute: ' + heute + '\n' +
    'Standort: ' + (f.name || '') + ', ' + (f.bereich === 'Drinnen' ? 'drinnen' : 'draußen') + (f.licht ? ', ' + f.licht : '') + '\n' +
    'Haltung: ' + (p.haltung === 'Topf' ? 'Topf/Kübel' : 'ausgepflanzt') + ', Bewässerung: ' + (p.bewaesserung === 'Automatisch' ? 'automatisch' : 'von Hand') + '\n' +
    (prof.schnitt ? 'Schnitt laut Steckbrief: ' + prof.schnitt + '\n' : '') +
    (prof.duengen ? 'Düngen laut Steckbrief: ' + prof.duengen + '\n' : '') +
    (vorherText ? vorherText + '\n' : '') +
    (notiz ? 'Anmerkung des Besitzers: ' + notiz + '\n' : '') +
    '\nAntworte NUR mit JSON:\n' +
    '{"zustand":"gut" | "mittel" | "schlecht","zusammenfassung":"2–3 Sätze","beobachtungen":["konkrete Beobachtungen am Foto"],' +
    '"wachstum":"Entwicklungsstand in einem Satz (für das Wachstumstagebuch)",' +
    '"massnahmen":[{"titel":"konkrete Aufgabe","kategorie":"Schnitt" | "Düngen" | "Gießen" | "Pflanzenschutz" | "Umtopfen" | "Winterschutz" | "Pflege","dringend":true | false,"hinweis":"wie genau","material":"Einkaufsartikel oder leer"}]}\n' +
    'Nur sinnvolle, zur Jahreszeit passende Maßnahmen. Wenn nichts zu tun ist, bleibt "massnahmen" leer. Wenn das Foto unklar ist, sage es in der Zusammenfassung.';
  const r = claude_(SYS_GAERTNER, text, b64_(foto.bild), 1500);
  mitSperre_(function () {
    fotoSpeichern_(p, foto, 'Check', notiz || '', { zustand: r.zustand || '', bewertung: JSON.stringify(r) });
  });
  return r;
}

function getFotos(pflanzeId) {
  return lesen_('Fotos').filter(function (f) { return f.pflanzeId === pflanzeId; }).map(sauber_)
    .sort(function (a, b) { return a.datum < b.datum ? 1 : -1; });
}

function getFoto(fotoId) {
  const f = finde_('Fotos', fotoId);
  const blob = DriveApp.getFileById(f.fileId).getBlob();
  return 'data:image/jpeg;base64,' + Utilities.base64Encode(blob.getBytes());
}

function loescheFoto(fotoId) {
  return mitSperre_(function () {
    const f = finde_('Fotos', fotoId);
    try { DriveApp.getFileById(f.fileId).setTrashed(true); } catch (e) { /* egal */ }
    zeilenLoeschen_('Fotos', function (x) { return x.id === fotoId; });
    const rest = lesen_('Fotos').filter(function (x) { return x.pflanzeId === f.pflanzeId; })
      .sort(function (a, b) { return a.datum < b.datum ? 1 : -1; });
    aendern_('Pflanzen', f.pflanzeId, { thumb: rest.length ? rest[0].thumb : '' });
    return true;
  });
}

/** Aufruf der Claude API. Gibt das JSON-Objekt aus der Antwort zurück. */
function claude_(system, text, bildB64, maxTokens) {
  const key = prop_('CLAUDE_API_KEY');
  if (!key) throw new Error('Es ist noch kein Claude-API-Schlüssel hinterlegt (Mehr → Einstellungen).');
  const s = einstellungen_();
  const content = [];
  if (bildB64) content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: bildB64 } });
  content.push({ type: 'text', text: text });
  const res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify({ model: s.modell || STANDARD.modell, max_tokens: maxTokens || 2000, system: system, messages: [{ role: 'user', content: content }] })
  });
  const code = res.getResponseCode(), body = res.getContentText();
  if (code !== 200) {
    let msg = body;
    try { msg = JSON.parse(body).error.message; } catch (e) { /* roh */ }
    if (code === 400 && /workspace/i.test(msg)) {
      throw new Error('Der API-Schlüssel ist keinem Workspace zugeordnet. Bitte in der Claude Console einen neuen Schlüssel erstellen und dabei einen Workspace (z. B. „Default“) auswählen.');
    }
    throw new Error('Claude API (' + code + '): ' + msg);
  }
  const data = JSON.parse(body);
  const out = (data.content || []).filter(function (c) { return c.type === 'text'; }).map(function (c) { return c.text; }).join('');
  return jsonAus_(out);
}

function jsonAus_(t) {
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('Die KI-Antwort war nicht lesbar. Bitte noch einmal versuchen.');
  return JSON.parse(t.slice(a, b + 1));
}

/* ============================================================
 * Wetter und Hinweise (Frost, Trockenheit, Gießen drinnen)
 * ============================================================ */
function wetter_() {
  const s = einstellungen_();
  if (!s.lat || !s.lon) return null;
  const cache = CacheService.getScriptCache();
  const k = 'wetter_' + s.lat + '_' + s.lon + '_' + heute_();
  const hit = cache.get(k);
  if (hit) return JSON.parse(hit);
  const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + s.lat + '&longitude=' + s.lon +
    '&daily=temperature_2m_min,temperature_2m_max,precipitation_sum&past_days=14&forecast_days=7&timezone=Europe%2FBerlin';
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('Der Wetterdienst antwortet gerade nicht (' + res.getResponseCode() + ').');
  const d = JSON.parse(res.getContentText()).daily;
  const tage = d.time.map(function (t, i) {
    return { datum: t, min: d.temperature_2m_min[i], max: d.temperature_2m_max[i], regen: d.precipitation_sum[i] };
  });
  cache.put(k, JSON.stringify(tage), 3600);
  return tage;
}

function hinweise_(fl, pf) {
  return berechneHinweise_(fl, pf, wetter_(), einstellungen_(), heute_(), lesen_('Aufgaben'), lesen_('Kreise').length > 0);
}

/** Reine Logik (testbar). */
function berechneHinweise_(fl, pf, tage, s, heute, aufgaben, hatKreise) {
  const out = [];
  const flM = map_(fl);
  const liste = pf.map(function (p) {
    const f = flM[p.standort === 'Winter' && p.winterFlaecheId ? p.winterFlaecheId : p.flaecheId];
    return { p: p, prof: parse_(p.profil), f: f, imWinter: p.standort === 'Winter' };
  });
  const draussen = liste.filter(function (x) { return x.f && x.f.bereich !== 'Drinnen' && !(x.imWinter && !x.p.winterFlaecheId); });

  if (!tage) {
    out.push({ typ: 'info', titel: 'Ort fehlt', text: 'Trage unter Mehr → Einstellungen deinen Ort ein, dann warnt die App vor Frost und Trockenheit.', pflanzen: [] });
  } else {
    // ---- Frost (heute + 3 Tage)
    const kommend = tage.filter(function (t) { return t.datum >= heute && t.min !== null; }).slice(0, 4);
    let kalt = null;
    kommend.forEach(function (t) { if (!kalt || t.min < kalt.min) kalt = t; });
    if (kalt && kalt.min <= Number(s.frostSchwelle)) {
      const betr = [];
      draussen.forEach(function (x) {
        if (!x.prof) return;
        const topf = x.p.haltung === 'Topf';
        let g = x.prof.frostgrenze;
        if (g === null || g === undefined || g === '' || isNaN(Number(g))) {
          if (!x.prof.frostempfindlich) return;
          g = 0;
        }
        g = Number(g) + (topf ? 5 : 0); // Wurzeln im Topf frieren deutlich früher
        if (kalt.min > g + 1) return;
        let m;
        if (topf) m = x.p.winterFlaecheId && !x.imWinter ? 'Ins Winterquartier (' + ((flM[x.p.winterFlaecheId] || {}).name || '') + ') räumen' : 'Reinholen oder Topf einpacken und geschützt stellen';
        else m = x.prof.winterschutz || 'Mit Vlies abdecken';
        betr.push({ id: x.p.id, name: x.p.name, flaeche: x.f.name, massnahme: m });
      });
      const bew = (aufgaben || []).find(function (a) { return a.status === 'offen' && a.bezugId === 'bewaesserung' && a.key.indexOf('|bew-winter|') > 0; });
      if (hatKreise && bew) betr.push({ id: '', name: 'Bewässerung', flaeche: '', massnahme: 'Leitungen entleeren, Steuergerät reinholen' });
      if (betr.length) {
        out.push({ typ: 'frost', titel: 'Frost bis ' + String(kalt.min).replace('.', ',') + ' °C (' + wochentag_(kalt.datum) + ')',
          datum: kalt.datum, min: kalt.min, text: '', pflanzen: betr });
      }
    }
    // ---- Trockenheit (nur nicht bewässerte Pflanzen draußen)
    const vergangen = tage.filter(function (t) { return t.datum < heute; }).reverse();
    let trocken = 0, sumMax = 0;
    for (let i = 0; i < vergangen.length; i++) {
      if ((vergangen[i].regen || 0) >= 2) break;
      trocken++; sumMax += (vergangen[i].max || 0);
    }
    const mittelMax = trocken ? sumMax / trocken : 0;
    const regenBald = tage.filter(function (t) { return t.datum >= heute; }).slice(0, 2)
      .reduce(function (a, t) { return a + (t.regen || 0); }, 0);
    if (trocken && mittelMax >= 12) {
      const betr = [];
      draussen.forEach(function (x) {
        if (x.p.bewaesserung === 'Automatisch' || x.imWinter) return;
        const topf = x.p.haltung === 'Topf';
        let grenze = topf ? Number(s.trockenTopf) : Number(s.trockenBeet);
        if (x.prof && x.prof.wasserbedarf === 'gering') grenze *= 2;
        if (x.prof && x.prof.wasserbedarf === 'hoch') grenze = Math.max(2, Math.round(grenze * 0.7));
        if (mittelMax >= 28) grenze = Math.max(2, Math.round(grenze * 0.7));
        if (trocken < grenze) return;
        betr.push({ id: x.p.id, name: x.p.name, flaeche: x.f.name, massnahme: topf ? 'Gründlich gießen, bis Wasser unten austritt' : 'Durchdringend gießen (morgens oder abends)' });
      });
      if (betr.length) {
        out.push({ typ: 'trocken', titel: (trocken >= 14 ? 'Seit über 2 Wochen' : 'Seit ' + trocken + ' Tagen') + ' kein nennenswerter Regen',
          text: regenBald >= 5 ? 'Für die nächsten 2 Tage sind ' + Math.round(regenBald) + ' mm Regen angekündigt – evtl. abwarten.' : '',
          pflanzen: betr });
      }
    }
  }

  // ---- Gießen drinnen (Zimmerpflanzen und Kübel im Winterquartier)
  const monat = heute.slice(5, 7);
  const winterzeit = ['11', '12', '01', '02'].indexOf(monat) >= 0;
  const giessen = [];
  liste.forEach(function (x) {
    if (!x.f || x.f.bereich !== 'Drinnen' || !x.prof || x.p.bewaesserung === 'Automatisch') return;
    let iv;
    if (x.imWinter) iv = Number(x.prof.giessIntervallWinterTage || 0);
    else if (winterzeit) iv = Number(x.prof.giessIntervallWinterTage || 0) || Math.round(Number(x.prof.giessIntervallTage || 0) * 1.5);
    else iv = Number(x.prof.giessIntervallTage || 0);
    if (!iv) return;
    const seit = x.p.zuletztGegossen ? diffTage_(x.p.zuletztGegossen, heute) : null;
    if (seit !== null && seit < iv) return;
    giessen.push({ id: x.p.id, name: x.p.name, flaeche: x.f.name, giessen: true,
      massnahme: seit === null ? 'Noch nicht als gegossen markiert (Rhythmus ca. ' + iv + ' Tage)' : 'Zuletzt vor ' + seit + ' Tagen (Rhythmus ca. ' + iv + ' Tage)' });
  });
  if (giessen.length) out.push({ typ: 'giessen', titel: 'Gießen drinnen', text: 'Vorher mit dem Finger prüfen: Ist die Erde oben noch feucht, einige Tage warten.', pflanzen: giessen });
  return out;
}

/* ============================================================
 * Einkaufsliste
 * ============================================================ */
function einkaufNeu(d) {
  return mitSperre_(function () {
    if (!String(d.artikel || '').trim()) throw new Error('Bitte einen Artikel eingeben.');
    if (d.aufgabeId && lesen_('Einkauf').some(function (e) { return e.aufgabeId === d.aufgabeId && e.status === 'offen'; })) return null;
    const e = { id: id_('e'), artikel: String(d.artikel).trim(), menge: d.menge || '', notiz: d.notiz || '', status: 'offen',
      aufgabeId: d.aufgabeId || '', angelegt: jetzt_(), erledigtAm: '' };
    einfuegen_('Einkauf', [e]);
    return e;
  });
}
function einkaufStatus(id, erledigt) {
  return mitSperre_(function () {
    return aendern_('Einkauf', id, { status: erledigt ? 'erledigt' : 'offen', erledigtAm: erledigt ? heute_() : '' });
  });
}
function einkaufLoeschen(id) { return mitSperre_(function () { zeilenLoeschen_('Einkauf', function (e) { return e.id === id; }); return true; }); }
function einkaufAufraeumen() { return mitSperre_(function () { return zeilenLoeschen_('Einkauf', function (e) { return e.status === 'erledigt'; }); }); }

/* ============================================================
 * Gartenplan
 * ============================================================ */
function speicherePlanBild(bild) {
  return mitSperre_(function () {
    const s = einstellungen_();
    if (s.planFileId) { try { DriveApp.getFileById(s.planFileId).setTrashed(true); } catch (e) { /* egal */ } }
    const f = DriveApp.getFolderById(prop_('FOLDER_PLAN')).createFile(
      Utilities.newBlob(Utilities.base64Decode(b64_(bild)), 'image/jpeg', 'Gartenplan ' + heute_() + '.jpg'));
    s.planFileId = f.getId();
    PropertiesService.getScriptProperties().setProperty('SETTINGS', JSON.stringify(s));
    return true;
  });
}
function getPlanBild() {
  const s = einstellungen_();
  if (!s.planFileId) return null;
  return 'data:image/jpeg;base64,' + Utilities.base64Encode(DriveApp.getFileById(s.planFileId).getBlob().getBytes());
}
function speicherePlanFlaeche(flaecheId, punkteJson) {
  return mitSperre_(function () { return aendern_('Flaechen', flaecheId, { plan: punkteJson || '' }); });
}
function speicherePlanPflanze(pflanzeId, x, y) {
  return mitSperre_(function () {
    return aendern_('Pflanzen', pflanzeId, { planX: x === null ? '' : String(Math.round(x * 10000) / 10000), planY: y === null ? '' : String(Math.round(y * 10000) / 10000) });
  });
}

/* ============================================================
 * Jahresrückblick
 * ============================================================ */
function rueckblick(jahr) {
  jahr = String(jahr);
  const alle = lesen_('Aufgaben');
  const fotos = lesen_('Fotos');
  const pf = lesen_('Pflanzen'); const pfM = map_(pf);
  const erl = alle.filter(function (a) { return a.status === 'erledigt' && (a.erledigtAm || '').slice(0, 4) === jahr; });
  const proKat = {}, proMonat = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  erl.forEach(function (a) {
    proKat[a.kategorie] = (proKat[a.kategorie] || 0) + 1;
    proMonat[Number(a.erledigtAm.slice(5, 7)) - 1]++;
  });
  const fJ = fotos.filter(function (f) { return f.datum.slice(0, 4) === jahr; }).sort(function (a, b) { return a.datum < b.datum ? -1 : 1; });
  const proPflanze = {};
  fJ.forEach(function (f) { (proPflanze[f.pflanzeId] = proPflanze[f.pflanzeId] || []).push(f); });
  const vergleich = Object.keys(proPflanze).filter(function (k) { return proPflanze[k].length >= 2 && pfM[k]; }).map(function (k) {
    const l = proPflanze[k], a = l[0], b = l[l.length - 1];
    return { pflanzeId: k, name: pfM[k].name, anzahl: l.length,
      erstes: { id: a.id, datum: a.datum, thumb: a.thumb }, letztes: { id: b.id, datum: b.datum, thumb: b.thumb } };
  });
  const checks = fJ.filter(function (f) { return f.art === 'Check'; }).map(function (f) {
    const b = parse_(f.bewertung) || {};
    return { datum: f.datum, pflanzeId: f.pflanzeId, name: (pfM[f.pflanzeId] || {}).name || '–', zustand: f.zustand, text: b.zusammenfassung || '' };
  });
  const jahre = {};
  jahre[heute_().slice(0, 4)] = true;
  alle.forEach(function (a) { if (a.erledigtAm) jahre[a.erledigtAm.slice(0, 4)] = true; });
  fotos.forEach(function (f) { jahre[f.datum.slice(0, 4)] = true; });
  return {
    jahr: jahr, erledigt: erl.length,
    uebersprungen: alle.filter(function (a) { return a.status === 'übersprungen' && (a.erledigtAm || '').slice(0, 4) === jahr; }).length,
    verpasst: alle.filter(function (a) { return a.status === 'verpasst' && (a.erledigtAm || '').slice(0, 4) === jahr; }).length,
    proKat: proKat, proMonat: proMonat, fotosAnzahl: fJ.length, vergleich: vergleich, checks: checks,
    neu: pf.filter(function (p) { return (p.angelegt || '').slice(0, 4) === jahr; }).map(function (p) { return p.name; }),
    liste: erl.sort(function (a, b) { return a.erledigtAm < b.erledigtAm ? -1 : 1; }).map(sauber_),
    jahre: Object.keys(jahre).sort().reverse()
  };
}

/* ============================================================
 * Tägliche Prüfung und Erinnerungs-Mail
 * ============================================================ */
function taeglich() {
  mitSperre_(syncAufgaben_);
  const s = einstellungen_();
  if (!bool_(s.mailAktiv) || !s.mailAn) return;
  const props = PropertiesService.getScriptProperties();
  const heute = heute_();
  const fl = lesen_('Flaechen'), pf = lesen_('Pflanzen');
  let h = [];
  try { h = hinweise_(fl, pf); } catch (e) { h = []; }
  const teile = [];
  let betreff = '';

  const frost = h.find(function (x) { return x.typ === 'frost'; });
  if (frost && props.getProperty('MAIL_FROST') !== frost.datum) {
    teile.push(hinweisHtml_(frost)); props.setProperty('MAIL_FROST', frost.datum);
    betreff = 'Frostwarnung';
  }
  const tr = h.find(function (x) { return x.typ === 'trocken'; });
  const lastTr = props.getProperty('MAIL_TROCKEN') || '';
  if (tr && (!lastTr || diffTage_(lastTr, heute) >= 5)) {
    teile.push(hinweisHtml_(tr)); props.setProperty('MAIL_TROCKEN', heute);
    betreff = betreff || 'Trockenheit – bitte gießen';
  }

  const montag = Utilities.formatDate(new Date(), TZ, 'u') === '1';
  if (montag) {
    const flM = map_(fl), pfM = map_(pf);
    const bis = addTage_(heute, 7);
    const offen = lesen_('Aufgaben').filter(function (a) { return a.status === 'offen' && a.von <= bis; })
      .sort(function (a, b) { return a.bis < b.bis ? -1 : 1; });
    const ue = offen.filter(function (a) { return a.bis < heute; });
    const jetzt = offen.filter(function (a) { return a.bis >= heute; });
    let html = '<h3 style="margin:16px 0 6px">Diese Woche</h3>';
    if (!offen.length) html += '<p>Keine Gartenarbeiten fällig. 🌿</p>';
    if (ue.length) html += '<p style="color:#b3261e;margin:8px 0 4px"><b>Überfällig</b></p>' + aufgabenListeHtml_(ue, pfM, flM);
    if (jetzt.length) html += aufgabenListeHtml_(jetzt, pfM, flM);
    const g = h.find(function (x) { return x.typ === 'giessen'; });
    if (g) html += hinweisHtml_(g);
    teile.push(html);
    betreff = betreff || (offen.length + ' Gartenarbeit' + (offen.length === 1 ? '' : 'en') + ' diese Woche');
  }
  if (!teile.length) return;
  const url = ScriptApp.getService().getUrl();
  benachrichtigen_('Gartenjahr: ' + betreff,
    '<div style="font-family:Arial,sans-serif;font-size:14px;color:#1d2a1f;max-width:560px">' + teile.join('') +
    (url ? '<p style="margin-top:18px"><a href="' + url + '" style="background:#2f6b3a;color:#fff;padding:9px 14px;border-radius:8px;text-decoration:none">App öffnen</a></p>' : '') +
    '<p style="color:#777;font-size:12px;margin-top:18px">Diese Mail kommt von deiner Garten-App. Abschalten unter Mehr → Einstellungen.</p></div>');
}

/** Zentrale Benachrichtigung – hier kann später ntfy ergänzt werden. */
function benachrichtigen_(betreff, html) {
  const s = einstellungen_();
  MailApp.sendEmail({ to: s.mailAn, subject: betreff, htmlBody: html, name: 'Gartenjahr' });
}

function esc_(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function hinweisHtml_(h) {
  const farbe = h.typ === 'frost' ? '#1f5fa8' : h.typ === 'trocken' ? '#a8581f' : '#2f6b3a';
  return '<h3 style="margin:16px 0 6px;color:' + farbe + '">' + esc_(h.titel) + '</h3>' +
    (h.text ? '<p style="margin:0 0 6px">' + esc_(h.text) + '</p>' : '') +
    '<ul style="margin:0;padding-left:18px">' + h.pflanzen.map(function (p) {
      return '<li><b>' + esc_(p.name) + '</b>' + (p.flaeche ? ' (' + esc_(p.flaeche) + ')' : '') + ': ' + esc_(p.massnahme) + '</li>';
    }).join('') + '</ul>';
}

function aufgabenListeHtml_(liste, pfM, flM) {
  return '<ul style="margin:0;padding-left:18px">' + liste.map(function (a) {
    let bezug = '';
    if (pfM[a.bezugId]) bezug = pfM[a.bezugId].name;
    else if (flM[a.bezugId]) bezug = flM[a.bezugId].name;
    else if (a.bezugId === 'maehroboter') bezug = 'Mähroboter';
    else if (a.bezugId === 'bewaesserung') bezug = 'Bewässerung';
    return '<li style="margin-bottom:4px">' + esc_(a.titel) + (bezug ? ' – <i>' + esc_(bezug) + '</i>' : '') +
      ' <span style="color:#777">(bis ' + a.bis.slice(8, 10) + '.' + a.bis.slice(5, 7) + '.)</span></li>';
  }).join('') + '</ul>';
}
