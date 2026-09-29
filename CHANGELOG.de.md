# Änderungsprotokoll

Alle wesentlichen Änderungen an diesem Projekt werden hier dokumentiert. Das
Format basiert auf [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
und dieses Projekt hält sich an die
[Semantische Versionierung](https://semver.org/spec/v2.0.0.html).

## [0.2.0] — 2026-09-23

Breitenanpassung: Die Leseansicht skaliert mit dem Sidebar-Bereich, innerhalb
von Grenzen.

### Hinzugefügt

- **Breitenadaptiver Skalierungsfaktor** (`src/client/scale.ts` +
  `useReaderScale.ts`): ein aus der Breite abgeleiteter Faktor wird in die
  benutzerdefinierte Eigenschaft `--reader-scale` geschrieben, die
  Root-Schriftgröße wird `13px × scale`, und der Folieninhalt ist in `em`
  ausgedrückt, sodass er folgt. Bei der Basisbreite von **360 px ist der
  Faktor exakt 1**, das Layout bleibt bei der üblichen Bereichsbreite also
  unverändert; die Untergrenze ist **0.9**, die Obergrenze **1.15**.
- **Nur das Dokument skaliert.** Titel, Aufzählungen, Absätze, Notizen,
  Tabellen und Bildunterschriften folgen dem Faktor; die Kopfleiste, die
  Folienleiste, das Breaker-Banner und die Lade-/Leerzustände behalten ihre
  feste Größe. Eine Oberfläche, die sich beim Ziehen eines Trenners
  mitverändert, liest sich als Glitch, nicht als Reaktionsfähigkeit.
- **Auf zwei Dezimalstellen quantisiert**, sodass das Ziehen eines Trenners
  das Layout in 0.01er-Schritten neu auslegt statt bei jedem Pixel.
- **Nicht messbare Breiten fallen auf 1 zurück** — 0, negativ, NaN oder
  Infinity (erste Frame, fehlerhafte Meldung) rendern das ausgelieferte
  Layout statt eines Extrems des Bereichs, das beim Öffnen winzige Schrift
  aufblitzen ließe.
- **Aufzählungseinzug in `em`** (`INDENT_EM = 1.08em`), also die 14 px, die
  es bei Skalierung 1 zuvor waren.
- **Tabellenzellen-Deckel 320 px → 24.6em**, damit Zellen mit dem Bereich
  schmaler werden, statt eine horizontale Bildlaufleiste zu erzwingen.

### Geändert

- Bilder werden weiterhin in der Größe gerendert, die die Shape-Transformation
  angibt, nur durch den Bereich begrenzt: Eine Bitmap über ihre natürliche
  Größe hinaus zu vergrößern, um der Textskalierung zu folgen, würde sie
  weicher, nicht treuer machen.

### Tests

- 5 neue Prüfungen (24 insgesamt), u. a.: Faktor exakt 1 bei der Basisbreite,
  beide Grenzen, Monotonie, Rückfall bei nicht messbarer Breite, Quantisierung
  auf zwei Dezimalstellen und Einzug passend zu 14 px bei Skalierung 1.

### Paketierung

- **Erste npm-Veröffentlichung**: `dsh-pptx-sidebar@0.2.0`, dist-tags
  `latest` + `dsh-0.1.5`; 39 Dateien / 83.1 kB, Tarball-Shasum
  `e6faf24a4e1c8e32a561ecb8693c828759626e96`.
- Das veröffentlichte Paket deklariert **`repository`** und zeigt zurück auf
  `drscrewdriver/dsh-pptx-sidebar`. Die Awesome-Liste verknüpft ein npm-Paket
  nur dann mit einem Repository, wenn das veröffentlichte Paket dorthin
  zurückzeigt.

## [0.1.0] — 2026-09-22

Erste Veröffentlichung. Liest `.pptx` / `.pptm` als strukturierte Leseansicht
in der rechten DSH-Sidebar.

### Hinzugefügt

- Registrierung als Dateivorschau für `.pptx` und `.pptm` (`priority: 50`,
  `fetchStrategy: 'custom'`); die Bytes kommen über better-sidebars Route
  `/sidebar/file`, sodass der Pfadzaun des Arbeitsbereichs auf der Host-Seite
  bleibt.
- Folienliste, deren Reihenfolge **ausschließlich** aus `p:sldIdLst` stammt,
  aufgelöst über die Präsentations-Beziehungen — nie aus der Sortierung der
  Part-Dateinamen. Absolute und `../`-relative Beziehungsziele lösen beide
  auf; External-Ziele werden ignoriert.
- Durchwandern des Shape-Baums (`p:sp`, `p:pic`, `p:graphicFrame`, `p:grpSp`)
  mit einem einzigen Tiefenzähler, sodass gruppierte Shapes ihren Text genau
  einmal beitragen.
- Textextraktion mit Aufzählungsebenen je Absatz (`a:pPr@lvl`, 0-basiert →
  1-basiert) und fetten/kursiven Runs.
- Titel-Erkennung über den Platzhalter-**Typ** (`title` / `ctrTitle`), nicht
  über Position oder Schriftgröße.
- Sprechernotizen aus `notesSlide`-Teilen; der Platzhalter für das Folienbild
  wird übersprungen. Eine Folie ohne Notizen erzeugt keinen Block, keine
  Warnung und keinen Fehler.
- Eingebettete Bilder: `a:blip@r:embed` → Beziehung → Archiv-Bytes →
  Blob-URL, mit EMU→px-Bemessung. Nicht renderbare Formate (EMF/WMF) werden
  zu beschrifteten Platzhaltern statt stiller Lücken.
- Echte Tabellen aus `a:tbl`-GraphicFrames.
- Sieben Circuit-Breaker-Grenzen (Archiv / Inflation gesamt / einzelner Part /
  Folien / Folientext / Bilder / einzelnes Bild), mit **einer Warnung pro
  Dimension**.
- zh- und en-Wörterbücher, einschließlich einer Vorlage für jeden
  Breaker-Grund.
- Build mit echter Ladeschranke: Das Client-Bundle wird in einer `node:vm`-Sandbox
  ausgewertet und der Export der Factory wird darauf geprüft, `apply` und
  `inject` zu tragen.
- `npm test` — 19 Prüfungen gegen ein im Prozess gebautes, feindliches
  Fixture.
- Veröffentlichungs- und Profil-Migrationsskripte (standardmäßig `-DryRun`),
  einschließlich eines Preflights, der eine noch nicht auflösbare Spec
  zurückweist.

### Bewusst nicht enthalten

- Platzhalter-Vererbung aus Layouts und Mastern: v1 liest nur den eigenen
  Part der Folie. Die Begründung steht im gleichnamigen README-Abschnitt.
- Visuelle Layouttreue, Theme-Schriftarten, Animation, Bearbeiten,
  `.ppt`-Unterstützung.
