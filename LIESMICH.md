# Lektüre-Check: Kafka, „Die Verwandlung“

Web-App mit 60 Multiple-Choice-Aufgaben (je 20 pro Kapitel) zur Überprüfung der Lektürekenntnis. Sie hat zwei Modi:

- **Üben:** „Durchmischen“ stellt 24 Aufgaben aus dem ganzen Werk zusammen (oder 10 aus einem Kapitel). Nach dem Auswerten gibt es Notenpunkte und zu jedem Fehler eine Erklärung mit Textzitat und Kapitelangabe.
- **Prüfung:** Die Lehrkraft legt eine Prüfung an und nennt den Schülern einen Code. Jede Schülerin und jeder Schüler bekommt automatisch eine **Prüfungsnummer** (kein Name). Nach der Abgabe sehen sie ihre Notenpunkte und können die Korrektur aufrufen. Die Lehrkraft sieht live alle Nummern, Antworten, Punkte und Notenpunkte und kann die Ergebnisse als CSV-Datei (Excel) herunterladen.

## Aufgabenpool

| | AFB I (Textkenntnis) | AFB II (Zusammenhänge) | AFB III (Deutung) |
|---|---|---|---|
| Kapitel I | 12 | 6 | 2 |
| Kapitel II | 12 | 6 | 2 |
| Kapitel III | 12 | 6 | 2 |

Jede Ziehung hält das Verhältnis ein: bei 24 Aufgaben 15 × AFB I, 7 × AFB II, 2 × AFB III, gleichmäßig 8 pro Kapitel; bei 10 Aufgaben 6/3/1.

Aufgabenformate mit niedriger Ratewahrscheinlichkeit:

- **Kprim:** 4 Aussagen, jede richtig/falsch (volle Punktzahl durch Raten: 1 : 16)
- **Mehrfachauswahl:** 5 Antworten, die Anzahl der richtigen ist unbekannt (1 : 32)
- **Reihenfolge:** 5 Ereignisse ordnen (1 : 120)
- **Zuordnung:** 6 Zitate einer von 5 Figuren zuordnen

Bewertung: 1 Punkt pro Aufgabe, ½ Punkt, wenn genau eine Entscheidung falsch ist (bei der Reihenfolge: genau zwei Ereignisse vertauscht). Teilpunkte lassen sich pro Prüfung abschalten.

Notenpunkte (Standard, pro Prüfung änderbar): 15 ab 95 %, 14 ab 90 %, 13 ab 85 %, 12 ab 80 %, 11 ab 75 %, 10 ab 70 %, 9 ab 65 %, 8 ab 60 %, 7 ab 55 %, 6 ab 50 %, 5 ab 45 %, 4 ab 40 %, 3 ab 33 %, 2 ab 27 %, 1 ab 20 %, sonst 0.

Alle Aufgaben mit Lösungen und Textbelegen stehen in `Aufgabenpool_mit_Loesungen.html` (im Browser öffnen, drucken möglich) und in der App unter „Aufgabenpool“. Die Zitate wurden automatisch mit dem Originaltext abgeglichen.

## Lokal starten (z. B. im Schul-WLAN)

1. [Node.js](https://nodejs.org) installieren (Version 18 oder neuer).
2. Im Ordner `verwandlung` ein Terminal öffnen und `node server.js` eingeben.
3. In der Konsole erscheint die Adresse und das **Lehrkraft-Passwort**. Ein eigenes Passwort legt man so fest:
   - Windows: `set LEHRER_PASSWORT=meinPasswort` und dann `node server.js`
   - macOS/Linux: `LEHRER_PASSWORT=meinPasswort node server.js`
4. Im Browser `http://localhost:3000` öffnen. Schülergeräte im selben WLAN öffnen `http://<IP-des-Rechners>:3000`.

Es müssen keine Pakete installiert werden (kein `npm install` nötig).

## Kostenlos online stellen (Render.com)

1. Ordner in ein GitHub-Repository hochladen.
2. Auf render.com mit GitHub anmelden → „New“ → „Web Service“ → Repository wählen.
3. Start Command: `node server.js`, Plan: „Free“. Unter „Environment“ die Variable `LEHRER_PASSWORT` mit einem eigenen Passwort anlegen.
4. Nach ca. 2 Minuten gibt es eine Adresse wie `https://verwandlung-xyz.onrender.com`.

Hinweise zum Gratis-Plan: Der Dienst schläft nach 15 Minuten ohne Besuch ein; den ersten Aufruf deshalb einige Minuten vor der Stunde selbst machen. Bei einem Neustart des Dienstes gehen gespeicherte Prüfungen verloren. Deshalb die Ergebnisse **direkt nach der Prüfung als CSV herunterladen**. Alternativen mit gleichem Ablauf: Railway, Fly.io, Koyeb oder ein eigener Schulserver.

## Ablauf einer Prüfung

1. Startseite → „Bereich für Lehrkräfte“ → anmelden.
2. „Neue Prüfung anlegen“: Titel, Anzahl der Aufgaben (Standard 24), Kapitel, optional Zeitlimit, gleiche oder individuell gemischte Fragen, Korrektur sofort nach Abgabe oder erst nach Prüfungsende, Teilpunkte, Notenschlüssel.
3. Den angezeigten **Code** (oder den Direktlink) an die Klasse geben. Die Schüler geben ihn auf der Startseite ein und erhalten ihre Prüfungsnummer.
4. Tipp: Während der Prüfung den **Übungsmodus sperren** (Schalter in der Übersicht), damit niemand nebenbei Erklärungen zu Pool-Aufgaben nachschlägt.
5. Die Teilnehmerliste aktualisiert sich alle 5 Sekunden. „Antworten“ zeigt die vollständige Korrektur einer Nummer.
6. Am Ende „Offene Arbeiten einsammeln“ (wertet den zuletzt gespeicherten Stand aus), dann „Prüfung beenden“ und „Ergebnisse als CSV“ herunterladen.

Gut zu wissen:

- Antworten werden automatisch gespeichert. Lädt ein Schüler die Seite neu oder schließt den Browser, geht es auf demselben Gerät mit derselben Nummer weiter.
- Bei Zeitlimit wird automatisch abgegeben; danach gilt eine Kulanz von 2 Minuten.
- Wer sich versehentlich doppelt anmeldet, erscheint mit zwei Nummern; überzählige Nummern lassen sich mit ✕ entfernen.
- Wenn die Korrektur sofort sichtbar ist, könnten früh fertige Schüler Lösungen weitergeben. Bei individueller Mischung ist das wenig ergiebig; ganz ausschließen lässt es sich mit der Einstellung „Korrektur erst wenn ich die Prüfung beende“.
- Damit Nummern später einer Person zugeordnet werden können, können die Schüler ihre Nummer z. B. auf einer Liste notieren, die nur die Lehrkraft sieht.

## Datenschutz

Es werden keine Namen, E-Mail-Adressen oder Konten erfasst, nur Prüfungsnummern, Antworten und Zeitpunkte. Die Daten liegen in `data/pruefungen.json` auf dem Rechner bzw. Server, auf dem die App läuft. Gelöschte Prüfungen werden sofort entfernt. Die Lösungen werden nie vorab an die Schülergeräte geschickt; ausgewertet wird auf dem Server.

## Technik und Anpassung

- `server.js`: reines Node.js ohne Abhängigkeiten. Port über `PORT`, Speicherort über `DATA_DIR`, Passwort über `LEHRER_PASSWORT`.
- `fragen.js`: der Aufgabenpool. Aufgaben lassen sich dort ändern oder ergänzen (Felder `kap`, `afb`, `typ`, `frage`, `items` mit `t` = Text, `ok` = Lösung, `why` = Erklärung). Nach Änderungen den Server neu starten.
- `public/index.html`: die gesamte Oberfläche.
- Textgrundlage: Franz Kafka, „Die Verwandlung“ (1915), Text nach Projekt Gutenberg in alter Rechtschreibung.
