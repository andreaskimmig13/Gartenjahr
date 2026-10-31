# Gartenjahr – Einrichtung

Die App läuft komplett in deinem Google-Konto: Daten in einer Google-Tabelle, Fotos im Drive-Ordner „Gartenjahr“, KI über deinen eigenen Claude-API-Schlüssel. Es wird kein Google-Cloud-Projekt angelegt, und es gibt keine automatischen Updates.

## 1. Projekt anlegen (am PC, ca. 10 Minuten)
1. **script.google.com** öffnen → **Neues Projekt** → oben links umbenennen in **Gartenjahr**.
2. Den Inhalt von **Code.gs** komplett in die Datei *Code.gs* einfügen (vorhandenen Text ersetzen).
3. Links bei *Dateien* auf **+ → HTML** klicken, Name **Index** (ohne .html), Inhalt von **Index.html** einfügen.
4. **Projekteinstellungen** (Zahnrad) → Häkchen bei *„appsscript.json“-Manifestdatei im Editor anzeigen* → zurück zum Editor, Datei *appsscript.json* öffnen und den Inhalt von **appsscript.json** einfügen.
5. Speichern (Strg+S).

## 2. Einmalig einrichten
1. Oben in der Funktionsauswahl **setup** wählen → **Ausführen**.
2. Berechtigungen bestätigen (Google zeigt „App nicht verifiziert“ → *Erweitert* → *Gartenjahr öffnen*). Benötigt werden: Drive (Fotos), Tabellen (Daten), Mail (Erinnerungen), externe Aufrufe (Claude und Wetter), Trigger (tägliche Prüfung).
3. Im Ausführungsprotokoll erscheint „Fertig“. In deinem Drive gibt es jetzt den Ordner **Gartenjahr** mit Tabelle und den Unterordnern *Fotos* und *Plan*.

`setup` legt genau einen täglichen Trigger an (7 Uhr). Er plant die Aufgaben fort und verschickt die Erinnerungs-Mails. Schaltest du die Mails in der App aus, wird der Trigger entfernt.

## 3. Als Web-App bereitstellen
1. **Bereitstellen → Neue Bereitstellung** → Typ **Web-App**.
2. *Ausführen als:* **Ich**, *Zugriff:* **Nur ich** → **Bereitstellen**.
3. Die angezeigte **Web-App-URL** auf dem Handy öffnen und **zum Startbildschirm hinzufügen**.

## 4. In der App
Die App führt dich auf der Startseite durch die Schritte:
1. **Mehr → Einstellungen:** Claude-API-Schlüssel eintragen (du kannst den aus dem Belegarchiv verwenden oder unter platform.claude.com/settings/keys einen eigenen anlegen – dabei einen Workspace auswählen) und **Ort** suchen.
2. **Mehr → Flächen:** Bereiche anlegen. Wichtig:
   - Rasen mit Typ **Rasen** → der Rasen-Jahresplan (Düngen, Vertikutieren, Sanden, Nachsaat, Herbstdünger, Laub) wird automatisch eingeplant.
   - Zimmer mit Bereich **Drinnen**.
   - Ein **Winterquartier** (z. B. Keller, Garage) für Kübelpflanzen.
   - Bei jeder Fläche das **Licht** angeben, dann prüft die App, ob die Pflanzen dort passen.
3. **Mehr → Bewässerungskreise:** deine Gardena-Kreise anlegen.
4. **Pflanzen → +:** per Foto bestimmen oder Namen eingeben, Fläche, Topf/ausgepflanzt und Bewässerung wählen. Die KI erstellt den Steckbrief und den Schnitt-, Dünge- und Pflegeplan.
5. **Plan:** Google-Maps-Screenshot (Satellit) hochladen, Flächen einzeichnen, Pflanzen setzen.
6. **Mähroboter:** Saisonstart und Winterpause unter *Einstellungen* anpassen.

## Was die App erinnert
- **Montags** eine Wochenübersicht per Mail.
- **Frost:** sofort, mit den konkret betroffenen Pflanzen. Topfpflanzen werden dabei strenger bewertet, weil die Wurzeln im Topf früher frieren. Ist die Bewässerung noch nicht winterfest, steht sie mit auf der Liste.
- **Trockenheit:** nur für nicht automatisch bewässerte Pflanzen draußen. Töpfe standardmäßig nach 3 Tagen, Beete nach 7 Tagen ohne nennenswerten Regen, und nur bei Wärme.
- **Zimmerpflanzen:** nach Gießrhythmus (im Winter länger). Mit „gegossen“ abhaken.
- Aufgaben, deren Zeitfenster seit über 45 Tagen vorbei ist, werden als „verpasst“ abgelegt und tauchen im Jahresrückblick auf.

## Kosten
Pro Bestimmung, Steckbrief oder Zustands-Check fallen ein paar Cent bei der Claude API an. Wetterdaten (Open-Meteo) sind kostenlos.

## Updates
Neue Dateien in script.google.com einfügen, speichern, dann **Bereitstellen → Bereitstellungen verwalten → Bearbeiten (Stift) → Version: Neue Version → Bereitstellen**. Die URL bleibt gleich.
Zurück zu einer älteren Version: dieselbe Stelle, ältere Version wählen.

## Später
- **ntfy-Push:** In `Code.gs` gibt es die Funktion `benachrichtigen_`. Dort kann der ntfy-Versand ergänzt werden, ohne den Rest zu ändern.
- **Pl@ntNet** für die Bestimmung, falls die Erkennung über Claude nicht reicht.
- **Familie mitnutzen:** Ordner teilen und die Bereitstellung auf „Jeder mit Google-Konto“ umstellen.

## App-Logo und ohne Google-Hinweis
Google blendet bei direkt aufgerufenen Apps-Script-Web-Apps einen Hinweis ein. Die Startseite **andreaskimmig13.github.io/gartenjahr** zeigt die App eingebettet – mit Logo und ohne diesen Hinweis.
1. Startseite auf dem Handy öffnen, einmalig die Web-App-URL (endet auf /exec) einfügen.
2. Zum Startbildschirm hinzufügen (iPhone: Teilen → „Zum Home-Bildschirm“, Android: ⋮ → „Zum Startbildschirm hinzufügen“). Beim iPhone fragt das Symbol beim ersten Start die URL noch einmal ab.
3. Klappt das Einbetten nicht (z. B. nicht bei Google angemeldet), bietet die Seite „Direkt öffnen“ an.
Adresse ändern: `…/gartenjahr/?setup` öffnen.
