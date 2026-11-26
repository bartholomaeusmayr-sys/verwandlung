// Verwandlung-Quiz – Übungs- und Prüfungs-App zu Kafkas „Die Verwandlung“.
// Reines Node.js ohne Abhängigkeiten. Start: node server.js  (danach http://localhost:3000 öffnen)
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const POOL = require('./fragen.js');

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'pruefungen.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_BODY = 512 * 1024;
const MAX_TEILNEHMENDE = 300;
const GNADENFRIST_MS = 2 * 60 * 1000;      // so lange nach Ablauf des Zeitlimits wird eine Abgabe noch angenommen
// Mindest-Prozentsatz für 15, 14, … 1 Notenpunkte (übliche Oberstufen-Tabelle); darunter 0 Punkte
const STANDARD_SCHLUESSEL = [95, 90, 85, 80, 75, 70, 65, 60, 55, 50, 45, 40, 33, 27, 20];
const BY_ID = Object.fromEntries(POOL.map((q) => [q.id, q]));

// ---------- Speicher ----------
let db = { config: {}, exams: {} };
try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch { /* neu */ }
db.config = db.config || {}; db.exams = db.exams || {};
if (!db.config.secret) db.config.secret = crypto.randomBytes(24).toString('hex');
if (db.config.uebenAktiv === undefined) db.config.uebenAktiv = true;
let LEHRER_PASSWORT = process.env.LEHRER_PASSWORT;
if (!LEHRER_PASSWORT) {
  if (!db.config.lehrerPasswort) db.config.lehrerPasswort = crypto.randomBytes(5).toString('hex');
  LEHRER_PASSWORT = db.config.lehrerPasswort;
}
let saveTimer = null;
function save(now) {
  const write = () => {
    saveTimer = null;
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(DB_FILE + '.tmp', JSON.stringify(db));
      fs.renameSync(DB_FILE + '.tmp', DB_FILE);
    } catch (e) { console.error('Speichern fehlgeschlagen:', e.message); }
  };
  if (now) { clearTimeout(saveTimer); write(); return; }
  if (!saveTimer) saveTimer = setTimeout(write, 800);
}
save(true);

// ---------- Hilfsfunktionen ----------
const rnd = (n) => crypto.randomBytes(n).toString('hex');
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function key(salt, qid, idx) { return crypto.createHmac('sha256', db.config.secret).update(`${salt}|${qid}|${idx}`).digest('base64url').slice(0, 10); }
function codeGen() { const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let c; do { c = ''; for (let i = 0; i < 5; i++) c += abc[crypto.randomInt(abc.length)]; } while (db.exams[c]); return c; }
const str = (v, max) => (typeof v === 'string' ? v : '').trim().slice(0, max);
const round2 = (x) => Math.round(x * 100) / 100;

// ---------- Ziehung: AFB-Verhältnis 60/30/10, gleichmäßig über die Kapitel ----------
function afbZiele(n) {
  const n3 = n >= 5 ? Math.max(1, Math.round(n * 0.1)) : 0;
  const n2 = Math.round(n * 0.3);
  return { 1: n - n2 - n3, 2: n2, 3: n3 };
}
function ziehen(n, kapitel) {
  kapitel = kapitel.filter((k) => [1, 2, 3].includes(k));
  if (!kapitel.length) kapitel = [1, 2, 3];
  const verfuegbar = POOL.filter((q) => kapitel.includes(q.kap)).length;
  n = Math.max(1, Math.min(n, verfuegbar));
  const ziel = afbZiele(n);
  const proKap = Object.fromEntries(kapitel.map((k) => [k, 0]));
  const rest = {}; // rest[afb][kap] = gemischte Fragen
  for (const afb of [1, 2, 3]) { rest[afb] = {}; for (const k of kapitel) rest[afb][k] = shuffle(POOL.filter((q) => q.kap === k && q.afb === afb)); }
  const gewaehlt = [];
  const nimm = (afb) => {
    const kand = kapitel.filter((k) => rest[afb][k].length);
    if (!kand.length) return false;
    const min = Math.min(...kand.map((k) => proKap[k]));
    const k = shuffle(kand.filter((x) => proKap[x] === min))[0];
    gewaehlt.push(rest[afb][k].pop()); proKap[k]++; return true;
  };
  for (const afb of [3, 2, 1]) for (let i = 0; i < ziel[afb]; i++) if (!nimm(afb)) { ziel[1]++; }
  while (gewaehlt.length < n && [1, 2, 3].some(nimm)) { /* auffüllen, falls eine Stufe leer war */ }
  // Reihenfolge: nach Kapitel, innerhalb des Kapitels gemischt
  const order = shuffle(gewaehlt).sort((a, b) => a.kap - b.kap);
  return order.map((q) => q.id);
}

// ---------- Aufbereitung für Schülergeräte (ohne Lösungen) ----------
function oeffentlich(qid, salt) {
  const q = BY_ID[qid];
  const items = q.typ === 'reihe' ? q.items.map((t, i) => ({ k: key(salt, qid, i), t })) : q.items.map((it, i) => ({ k: key(salt, qid, i), t: it.t }));
  const out = { id: q.id, kap: q.kap, afb: q.afb, typ: q.typ, frage: q.frage, items: shuffle(items) };
  if (q.typ === 'zuordnung') out.kategorien = q.kategorien;
  return out;
}

// ---------- Bewertung ----------
function bewerten(qid, antwort, salt, teilpunkte) {
  const q = BY_ID[qid];
  const n = q.items.length;
  const keys = q.items.map((_, i) => key(salt, qid, i));
  const idxOf = Object.fromEntries(keys.map((k, i) => [k, i]));
  antwort = antwort || {};
  let richtig = 0; const detail = { id: q.id, kap: q.kap, afb: q.afb, typ: q.typ, frage: q.frage };
  if (q.typ === 'reihe') {
    let folge = Array.isArray(antwort.folge) ? antwort.folge.map((k) => idxOf[k]).filter((i) => i !== undefined) : [];
    if (new Set(folge).size !== n) folge = null;
    const bearbeitet = !!folge;
    if (!folge) folge = [];
    folge.forEach((idx, pos) => { if (idx === pos) richtig++; });
    detail.gegeben = folge.map((i) => q.items[i]);
    detail.loesung = q.items;
    detail.erkl = q.erkl;
    detail.bearbeitet = bearbeitet;
    const falsch = n - richtig;
    detail.punkte = !bearbeitet ? 0 : falsch === 0 ? 1 : (teilpunkte && falsch === 2 ? 0.5 : 0);
  } else {
    detail.items = q.items.map((it, i) => {
      const k = keys[i];
      let gegeben;
      if (q.typ === 'kprim') gegeben = antwort[k] === true ? true : antwort[k] === false ? false : null;
      else if (q.typ === 'mr') gegeben = Array.isArray(antwort.wahl) && antwort.wahl.includes(k);
      else gegeben = typeof antwort[k] === 'string' ? antwort[k] : null;
      const ok = gegeben === it.ok;
      if (ok) richtig++;
      return { t: it.t, loesung: it.ok, gegeben, richtig: ok, why: it.why };
    });
    if (q.typ === 'zuordnung') detail.kategorien = q.kategorien;
    detail.punkte = richtig === n ? 1 : (teilpunkte && richtig === n - 1 ? 0.5 : 0);
  }
  detail.max = 1;
  detail.status = detail.punkte === 1 ? 'richtig' : detail.punkte > 0 ? 'teilweise' : 'falsch';
  return detail;
}
function istBearbeitet(qid, a) {
  const q = BY_ID[qid]; if (!a || !q) return false;
  const n = q.items.length;
  if (q.typ === 'mr') return !!a.beruehrt;
  if (q.typ === 'reihe') return Array.isArray(a.folge) && a.folge.length === n;
  const werte = Object.values(a);
  return q.typ === 'kprim' ? werte.filter((v) => typeof v === 'boolean').length === n : werte.filter((v) => typeof v === 'string' && v).length === n;
}
function notenpunkte(prozent, schluessel) {
  for (let i = 0; i < 15; i++) if (prozent + 1e-9 >= schluessel[i]) return 15 - i;
  return 0;
}
function auswerten(set, antworten, salt, settings) {
  const details = set.map((qid) => bewerten(qid, (antworten || {})[qid], salt, settings.teilpunkte));
  const punkte = round2(details.reduce((s, d) => s + d.punkte, 0));
  const max = details.length;
  const prozent = max ? round2((punkte / max) * 100) : 0;
  return { punkte, max, prozent, np: notenpunkte(prozent, settings.schluessel), details };
}

// ---------- Lehrkraft-Sitzungen ----------
const sessions = new Map(); // token -> Ablaufzeit
function lehrerOk(req) {
  const t = req.headers['x-lehrer-token'];
  const exp = t && sessions.get(t);
  if (!exp || exp < Date.now()) return false;
  sessions.set(t, Date.now() + 12 * 3600e3);
  return true;
}
const loginVersuche = new Map();

// ---------- Prüfungen ----------
function examSummary(e) {
  const tn = Object.values(e.teilnehmende);
  const abg = tn.filter((p) => p.abgabe);
  const npSchnitt = abg.length ? round2(abg.reduce((s, p) => s + p.ergebnis.np, 0) / abg.length) : null;
  return { code: e.code, titel: e.titel, erstellt: e.erstellt, offen: e.offen, settings: e.settings, teilnehmende: tn.length, abgegeben: abg.length, npSchnitt };
}
function deadline(e, p) { return e.settings.dauer > 0 ? p.start + e.settings.dauer * 60000 : null; }
function abschliessen(e, p, antworten) {
  if (p.abgabe) return;
  if (antworten) p.antworten = antworten;
  const r = auswerten(p.set, p.antworten, p.salt, e.settings);
  p.ergebnis = { punkte: r.punkte, max: r.max, prozent: r.prozent, np: r.np, einzel: Object.fromEntries(r.details.map((d) => [d.id, d.punkte])) };
  p.abgabe = Date.now();
}
function korrekturFrei(e) { return e.settings.korrektur === 'sofort' || !e.offen; }
function schuelerStatus(e, p, mitFragen) {
  const out = { code: e.code, titel: e.titel, nr: p.nr, start: p.start, deadline: deadline(e, p), jetzt: Date.now(), abgegeben: !!p.abgabe, offen: e.offen };
  if (mitFragen && !p.abgabe) { out.fragen = p.set.map((qid) => oeffentlich(qid, p.salt)); out.antworten = p.antworten || {}; }
  if (p.abgabe) { out.ergebnis = { punkte: p.ergebnis.punkte, max: p.ergebnis.max, prozent: p.ergebnis.prozent, np: p.ergebnis.np }; out.korrekturFrei = korrekturFrei(e); }
  return out;
}
function findeTeilnahme(token) {
  if (typeof token !== 'string' || token.length < 20) return null;
  for (const e of Object.values(db.exams)) { const p = e.teilnehmende[token]; if (p) return { e, p }; }
  return null;
}
function sanitizeAntworten(a, set) {
  const out = {};
  if (!a || typeof a !== 'object') return out;
  for (const qid of set) {
    const v = a[qid]; if (!v || typeof v !== 'object') continue;
    const s = JSON.stringify(v); if (s.length > 4000) continue;
    out[qid] = v;
  }
  return out;
}
function settingsAus(b) {
  const n = Math.max(5, Math.min(60, parseInt(b.anzahl, 10) || 24));
  let kapitel = Array.isArray(b.kapitel) ? b.kapitel.map(Number).filter((k) => [1, 2, 3].includes(k)) : [1, 2, 3];
  if (!kapitel.length) kapitel = [1, 2, 3];
  let schluessel = Array.isArray(b.schluessel) && b.schluessel.length === 15 ? b.schluessel.map(Number) : STANDARD_SCHLUESSEL;
  if (schluessel.some((x) => !Number.isFinite(x) || x < 0 || x > 100) || schluessel.some((x, i) => i && x > schluessel[i - 1])) schluessel = STANDARD_SCHLUESSEL;
  return {
    anzahl: Math.min(n, POOL.filter((q) => kapitel.includes(q.kap)).length), kapitel,
    dauer: Math.max(0, Math.min(300, parseInt(b.dauer, 10) || 0)),
    gleicheFragen: !!b.gleicheFragen,
    korrektur: b.korrektur === 'nachEnde' ? 'nachEnde' : 'sofort',
    teilpunkte: b.teilpunkte !== false,
    schluessel,
  };
}
function csv(e) {
  const rows = [['Nr', 'Status', 'Beginn', 'Abgabe', 'Punkte', 'Max', 'Prozent', 'Notenpunkte', 'Einzelpunkte (Aufgabe=Punkte)']];
  const fmt = (t) => (t ? new Date(t).toLocaleString('de-DE') : '');
  for (const p of Object.values(e.teilnehmende).sort((a, b) => a.nr - b.nr)) {
    const r = p.ergebnis;
    rows.push([p.nr, p.abgabe ? 'abgegeben' : 'in Bearbeitung', fmt(p.start), fmt(p.abgabe), r ? String(r.punkte).replace('.', ',') : '', r ? r.max : '', r ? String(r.prozent).replace('.', ',') : '', r ? r.np : '',
      r ? p.set.map((q) => `${q}=${String(r.einzel[q]).replace('.', ',')}`).join(' | ') : '']);
  }
  return '﻿' + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
}
function aufgabenStatistik(e) {
  const st = {};
  for (const p of Object.values(e.teilnehmende)) {
    if (!p.abgabe) continue;
    for (const qid of p.set) { const s = st[qid] || (st[qid] = { id: qid, n: 0, summe: 0 }); s.n++; s.summe += p.ergebnis.einzel[qid]; }
  }
  return Object.values(st).map((s) => ({ id: s.id, kap: BY_ID[s.id].kap, afb: BY_ID[s.id].afb, frage: BY_ID[s.id].frage, n: s.n, quote: round2((s.summe / s.n) * 100) })).sort((a, b) => a.quote - b.quote);
}

// ---------- HTTP ----------
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > MAX_BODY) { reject(new Error('zu groß')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { reject(new Error('ungültig')); } });
    req.on('error', reject);
  });
}
function json(res, code, data) { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); }
const fehler = (res, code, msg) => json(res, code, { fehler: msg });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

async function api(req, res, url) {
  const p = url.pathname; const m = req.method;
  const body = m === 'POST' ? await readBody(req) : {};

  if (p === '/api/meta' && m === 'GET') return json(res, 200, { uebenAktiv: db.config.uebenAktiv, pool: POOL.length, standardSchluessel: STANDARD_SCHLUESSEL });

  // ----- Üben (zustandslos, Bewertung auf dem Server) -----
  if (p === '/api/ueben/neu' && m === 'POST') {
    if (!db.config.uebenAktiv) return fehler(res, 403, 'Der Übungsmodus ist zurzeit von der Lehrkraft gesperrt.');
    const kap = [1, 2, 3].includes(Number(body.kapitel)) ? [Number(body.kapitel)] : [1, 2, 3];
    const n = kap.length === 1 ? 10 : 24;
    const salt = rnd(8);
    const set = ziehen(n, kap);
    return json(res, 200, { salt, set, fragen: set.map((id) => oeffentlich(id, salt)) });
  }
  if (p === '/api/ueben/auswerten' && m === 'POST') {
    if (!db.config.uebenAktiv) return fehler(res, 403, 'Der Übungsmodus ist zurzeit von der Lehrkraft gesperrt.');
    const set = Array.isArray(body.set) ? body.set.filter((id) => BY_ID[id]).slice(0, 60) : [];
    if (!set.length || typeof body.salt !== 'string') return fehler(res, 400, 'Ungültige Anfrage');
    return json(res, 200, auswerten(set, sanitizeAntworten(body.antworten, set), body.salt.slice(0, 40), { teilpunkte: true, schluessel: STANDARD_SCHLUESSEL }));
  }

  // ----- Prüfung: Schülerseite -----
  if (p === '/api/pruefung/beitreten' && m === 'POST') {
    const code = str(body.code, 10).toUpperCase();
    const e = db.exams[code];
    if (!e) return fehler(res, 404, 'Unter diesem Code gibt es keine Prüfung.');
    if (!e.offen) return fehler(res, 403, 'Diese Prüfung ist beendet.');
    if (Object.keys(e.teilnehmende).length >= MAX_TEILNEHMENDE) return fehler(res, 403, 'Die Prüfung ist voll.');
    const token = rnd(16); const salt = e.settings.gleicheFragen ? e.salt : rnd(8);
    const t = { nr: e.naechsteNr++, token, salt, set: e.settings.gleicheFragen ? e.set : ziehen(e.settings.anzahl, e.settings.kapitel), start: Date.now(), antworten: {}, abgabe: null, ergebnis: null };
    e.teilnehmende[token] = t; save();
    return json(res, 200, { token, ...schuelerStatus(e, t, true) });
  }
  if (p === '/api/pruefung/status' && m === 'POST') {
    const f = findeTeilnahme(body.token); if (!f) return fehler(res, 404, 'Teilnahme nicht gefunden.');
    return json(res, 200, schuelerStatus(f.e, f.p, true));
  }
  if (p === '/api/pruefung/speichern' && m === 'POST') {
    const f = findeTeilnahme(body.token); if (!f) return fehler(res, 404, 'Teilnahme nicht gefunden.');
    const { e, p: t } = f;
    if (t.abgabe) return fehler(res, 409, 'Bereits abgegeben.');
    const dl = deadline(e, t);
    if (dl && Date.now() > dl + GNADENFRIST_MS) return fehler(res, 409, 'Die Bearbeitungszeit ist abgelaufen.');
    if (!e.offen) return fehler(res, 409, 'Die Prüfung wurde beendet.');
    t.antworten = sanitizeAntworten(body.antworten, t.set); t.zuletzt = Date.now(); save();
    return json(res, 200, { ok: true });
  }
  if (p === '/api/pruefung/abgeben' && m === 'POST') {
    const f = findeTeilnahme(body.token); if (!f) return fehler(res, 404, 'Teilnahme nicht gefunden.');
    const { e, p: t } = f;
    if (!t.abgabe) {
      const dl = deadline(e, t);
      const zuSpaet = (dl && Date.now() > dl + GNADENFRIST_MS) || !e.offen;
      abschliessen(e, t, zuSpaet ? null : sanitizeAntworten(body.antworten, t.set));
      save(true);
    }
    return json(res, 200, schuelerStatus(e, t, false));
  }
  if (p === '/api/pruefung/korrektur' && m === 'POST') {
    const f = findeTeilnahme(body.token); if (!f) return fehler(res, 404, 'Teilnahme nicht gefunden.');
    const { e, p: t } = f;
    if (!t.abgabe) return fehler(res, 403, 'Die Korrektur gibt es erst nach der Abgabe.');
    if (!korrekturFrei(e)) return fehler(res, 403, 'Die Lehrkraft gibt die Korrektur frei, sobald die Prüfung beendet ist.');
    return json(res, 200, { nr: t.nr, titel: e.titel, ...auswerten(t.set, t.antworten, t.salt, e.settings) });
  }

  // ----- Lehrkraft -----
  if (p === '/api/lehrer/login' && m === 'POST') {
    const ip = req.socket.remoteAddress || '';
    const v = loginVersuche.get(ip) || { n: 0, t: Date.now() };
    if (Date.now() - v.t > 15 * 60000) { v.n = 0; v.t = Date.now(); }
    if (v.n >= 10) return fehler(res, 429, 'Zu viele Versuche. Bitte 15 Minuten warten.');
    const pw = str(body.passwort, 200);
    const a = Buffer.from(pw), b = Buffer.from(LEHRER_PASSWORT);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) { v.n++; loginVersuche.set(ip, v); return fehler(res, 401, 'Falsches Passwort.'); }
    loginVersuche.delete(ip);
    const t = rnd(20); sessions.set(t, Date.now() + 12 * 3600e3);
    return json(res, 200, { token: t });
  }
  if (!p.startsWith('/api/lehrer/')) return fehler(res, 404, 'Unbekannt');
  if (!lehrerOk(req)) return fehler(res, 401, 'Bitte neu anmelden.');

  if (p === '/api/lehrer/pool' && m === 'GET') return json(res, 200, POOL);
  if (p === '/api/lehrer/ueben' && m === 'POST') { db.config.uebenAktiv = !!body.aktiv; save(); return json(res, 200, { uebenAktiv: db.config.uebenAktiv }); }
  if (p === '/api/lehrer/pruefungen' && m === 'GET') return json(res, 200, { uebenAktiv: db.config.uebenAktiv, pruefungen: Object.values(db.exams).map(examSummary).sort((a, b) => b.erstellt - a.erstellt) });
  if (p === '/api/lehrer/pruefungen' && m === 'POST') {
    const settings = settingsAus(body);
    const code = codeGen();
    const e = { code, titel: str(body.titel, 120) || 'Lektüretest „Die Verwandlung“', erstellt: Date.now(), offen: true, settings, naechsteNr: 1, teilnehmende: {} };
    if (settings.gleicheFragen) { e.set = ziehen(settings.anzahl, settings.kapitel); e.salt = rnd(8); }
    db.exams[code] = e; save(true);
    return json(res, 200, examSummary(e));
  }
  const mm = p.match(/^\/api\/lehrer\/pruefungen\/([A-Z0-9]{3,10})(\/[a-z]+)?(?:\/(\d+))?$/);
  if (mm) {
    const e = db.exams[mm[1]]; if (!e) return fehler(res, 404, 'Prüfung nicht gefunden.');
    const aktion = mm[2] || '';
    if (aktion === '' && m === 'GET') {
      const tn = Object.values(e.teilnehmende).sort((a, b) => a.nr - b.nr).map((t) => ({
        nr: t.nr, start: t.start, zuletzt: t.zuletzt || null, abgabe: t.abgabe, beantwortet: t.set.filter((qid) => istBearbeitet(qid, (t.antworten || {})[qid])).length, anzahl: t.set.length,
        deadline: deadline(e, t), ergebnis: t.ergebnis ? { punkte: t.ergebnis.punkte, max: t.ergebnis.max, prozent: t.ergebnis.prozent, np: t.ergebnis.np } : null,
      }));
      return json(res, 200, { ...examSummary(e), liste: tn, statistik: aufgabenStatistik(e), jetzt: Date.now() });
    }
    if (aktion === '' && m === 'DELETE') { delete db.exams[e.code]; save(true); return json(res, 200, { ok: true }); }
    if (aktion === '/status' && m === 'POST') { e.offen = !!body.offen; save(true); return json(res, 200, examSummary(e)); }
    if (aktion === '/einsammeln' && m === 'POST') {
      let n = 0; for (const t of Object.values(e.teilnehmende)) if (!t.abgabe) { abschliessen(e, t, null); n++; }
      save(true); return json(res, 200, { eingesammelt: n });
    }
    if (aktion === '/csv' && m === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="Ergebnisse_${e.code}.csv"` });
      return res.end(csv(e));
    }
    if (aktion === '/teilnahme' && mm[3]) {
      const t = Object.values(e.teilnehmende).find((x) => x.nr === Number(mm[3]));
      if (!t) return fehler(res, 404, 'Nummer nicht gefunden.');
      if (m === 'DELETE') { delete e.teilnehmende[t.token]; save(true); return json(res, 200, { ok: true }); }
      return json(res, 200, { nr: t.nr, abgabe: t.abgabe, start: t.start, ...auswerten(t.set, t.antworten, t.salt, e.settings) });
    }
  }
  return fehler(res, 404, 'Unbekannt');
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    let file = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
    const full = path.normalize(path.join(PUBLIC_DIR, file));
    if (!full.startsWith(PUBLIC_DIR + path.sep) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) {
      // unbekannte Pfade (z. B. /lehrkraft) liefern die App
      res.writeHead(200, { 'Content-Type': MIME['.html'] }); return fs.createReadStream(path.join(PUBLIC_DIR, 'index.html')).pipe(res);
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream' });
    fs.createReadStream(full).pipe(res);
  } catch (e) {
    if (!res.headersSent) fehler(res, 400, e.message === 'zu groß' ? 'Anfrage zu groß' : 'Ungültige Anfrage');
  }
});
server.listen(PORT, () => {
  console.log(`Verwandlung-Quiz läuft: http://localhost:${PORT}`);
  console.log(process.env.LEHRER_PASSWORT ? 'Lehrkraft-Passwort: aus der Umgebungsvariablen LEHRER_PASSWORT' : `Lehrkraft-Passwort: ${LEHRER_PASSWORT}   (ändern: Umgebungsvariable LEHRER_PASSWORT setzen)`);
});
