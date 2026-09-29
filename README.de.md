# dsh-pptx-sidebar

[简体中文](README.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Italiano](README.it.md) | [Русский](README.ru.md) | [Español](README.es.md)

`.pptx` / `.pptm`-Präsentationen in der DSH-Sidebar lesen — die Folien **in
Präsentationsreihenfolge**, mit ihrem Text, den Aufzählungsebenen, den
Sprechernotizen und den eingebetteten Bildern.

> **Dies ist eine Leseansicht, keine Folienreproduktion.** Keine absolute
> Positionierung, keine Theme-Schriftarten, keine Platzhalter-Vererbung, keine
> Animation. Der Viewer sagt das in seinem Kopfbereich, denn ein
> Layoutunterschied, der wie ein Rendering-Fehler aussieht, ist schlimmer als
> eine klar benannte Einschränkung.

Das Plugin ist ein Konsument von
[dsh-better-sidebar](https://www.npmjs.com/package/dsh-better-sidebar): Es
registriert eine Dateivorschau und rendert im Vorschaubereich der Side-Karte.
Ohne dieses Plugin lädt es, warnt genau einmal und tut nichts.

---

## Installation

```bash
dsh plugin --profile <profile> add github:drscrewdriver/dsh-pptx-sidebar#<sha>
dsh plugin --profile <profile> add dsh-pptx-sidebar@0.1.0     # once published
```

Starten Sie danach den **DSH-Host neu** — ein Browser-Refresh genügt nicht,
damit eine neue Loader-Zeile erscheint. Prüfung, ohne irgendetwas zu starten:

```bash
dsh --profile <profile> --dump-config | Select-String dsh-pptx-sidebar
```

Die manuelle Installation besteht aus drei Schritten, nicht aus einem — siehe
`cordis.patch.yml`. Führt man nur die Schritte 1 und 3 aus, entsteht ein
Profil, in dem das Paket vorhanden ist und die Patch-Zeile vorhanden ist —
**und nichts lädt, lautlos**.

## Was das Plugin tut — und was nicht

| Erledigt | Nicht erledigt |
|----------|----------------|
| Folienliste in `p:sldIdLst`-Reihenfolge | Visuelles Layout, absolute Positionierung |
| Textabsätze, Aufzählungsebene je Absatz | Auflösung der Theme-/Master-Schriftarten |
| Titel-Erkennung über den Platzhalter-Typ | **Platzhalter-Vererbung** (siehe unten) |
| Sprechernotizen aus `notesSlide`-Teilen | Diagramme, die als Diagramme gerendert werden |
| Eingebettete Bilder als Blob-URLs | Animation, Übergänge, Timings |
| Echte Tabellen (`a:tbl`) | Kommentare, Revisionsmarken |
| Fetten/kursiven Runs | Bearbeiten, Zurückschreiben |
| Sieben Circuit-Breaker-Grenzen | Legacy-`.ppt` (BIFF/OLE2), WPS-Formate |

### Die Zeile zur Platzhalter-Vererbung (bewusst so entschieden)

Eine Folie zeigt oft Text, den sie selbst nicht enthält: Nummern, Fußzeilen
und Titeltext, der in `slideLayout` / `slideMaster` lebt und über einen
`p:ph`-Platzhalter referenziert wird. Ihn aufzulösen hieße, PowerPoints
Vererbungskette neu zu implementieren — einschließlich der `lstStyle`-Ebenen-Overrides
und des Layouts, das die Folie tatsächlich verwendet.

**v1 tut das nicht.** Gelesen wird nur der eigene Part der Folie. Die
Konsequenz wird benannt statt versteckt: Eine Folie, deren Text vollständig
geerbt ist, wird ohne Text gerendert. Das ist eine sichtbare Auslassung, keine
Beschädigung — der umgekehrte Kompromiss (falsch erben) würde Text zeigen, der
gar nicht auf der Folie steht.

## Breitenanpassung

Der Sidebar-Bereich lässt sich in der Größe verändern, die Leseansicht passt
sich also an ihn an — innerhalb von Grenzen, denn „adaptiv“ ist keine Lizenz
zum endlosen Wachsen oder Schrumpfen:

| Stellschraube | Wert | Warum |
|---------------|------|-------|
| Basisbreite | 360 px | Der Faktor ist hier **exakt 1**, die übliche Bereichsbreite rendert also das Layout, wie 0.1.0 es ausgeliefert hat |
| Untergrenze | 0.9× | Ein schmaler Bereich bekommt weiterhin lesbare Schrift |
| Obergrenze | 1.15× | Ein breiter Bereich bekommt angenehme, nicht riesige Schrift |
| Quantisierung | 2 Dezimalstellen | Ziehen legt das Layout in 0.01er-Schritten neu aus, nicht bei jedem Pixel |

Der Faktor wird aus der Bereichsbreite abgeleitet und in die benutzerdefinierte
Eigenschaft `--reader-scale` geschrieben; die Root-Schriftgröße wird
`13px × scale`, und der Folieninhalt ist in `em` ausgedrückt, sodass Text bei
der neuen Größe **umbricht (Reflow)**, statt transformiert skaliert zu werden
(was Glyphen verschmieren würde).

**Nur das Dokument skaliert.** Titel, Aufzählungen, Absätze, Notizen, Tabellen
und Bildunterschriften folgen dem Faktor; die Kopfleiste, die Folienleiste,
das Breaker-Banner und die Lade-/Leerzustände behalten ihre feste Größe. Eine
Oberfläche, die sich beim Ziehen eines Trenners mitverändert, liest sich als
Glitch, nicht als Reaktionsfähigkeit.

Zwei verwandte Entscheidungen:

- **Eine nicht messbare Breite fällt auf 1 zurück**, nicht auf eine Grenze.
  Vor der ersten Messung ist die Breite 0, und sie als „möglichst schmal“ zu
  rendern würde bei jedem Öffnen einer Präsentation winzige Schrift aufblitzen
  lassen.
- **Bilder skalieren nicht.** Sie werden in der Größe gerendert, die die
  Shape-Transformation angibt, und nur durch den Bereich begrenzt; eine Bitmap
  über ihre natürliche Größe hinaus zu vergrößern, um dem Text zu folgen,
  würde sie weicher, nicht treuer machen.

## Die Pipeline

```
archive bytes (host /sidebar/file, custom loader)
  → archive-size gate                      refuse before any unpacking
  → central directory (declared-size gate) refuse a lying part before inflating
  → streaming inflate + total budget       the zip-bomb gate
  → ppt/presentation.xml                   p:sldIdLst — slide ORDER
  → ppt/_rels/presentation.xml.rels        rId → slides/slideN.xml
  → ppt/slides/slideN.xml                  p:spTree → p:sp / p:pic / p:graphicFrame
  │     p:txBody → a:p → a:pPr@lvl (level), a:r → a:rPr(b/i) + a:t
  │     p:pic    → a:blip@r:embed → slide rels → ppt/media/*
  │     p:grpSp  → recursed, never flattened away
  ├→ ppt/slides/_rels/slideN.xml.rels      .../notesSlide → notesSlides/notesSlideN.xml
  └→ rules: a slide too long loses only its own tail; notes absent is silence
```

Bilder werden aus dem Zip extrahiert und in Object-URLs umgewandelt. Ein
eingebettetes Bild lebt *im Inneren* des Archivs — es gibt keine Host-Route,
auf die man verweisen könnte. Das ist kein „Dateien selbst lesen“, sondern die
Nutzung der Bytes, die der Host bereits übergeben hat.

## Die sieben Circuit-Breaker-Grenzen

| Dimension | Standard | Darüber |
|-----------|----------|---------|
| Archivgröße | 8 MB | BLOCKIERT — Abweisung vor jedem Entpacken |
| Inflation gesamt | 64 MB | BLOCKIERT — die Zip-Bomben-Schranke |
| Ein einzelner Part | 32 MB | BLOCKIERT — ein einzelner überdimensionierter XML-Part |
| Folien | 300 | GESTUTZT — der Reader hört auf, die Präsentation zu durchlaufen |
| Folientext | 20 000 Zeichen | der restliche Text dieser Folie wird ausgelassen |
| Bilder | 200 | weitere Bilder werden übersprungen |
| Ein einzelnes Bild | 8 MB | dieses Bild wird übersprungen (nicht einmal entpackt) |

**Höchstens eine Warnung pro Dimension**, strukturell bedingt — Warnungen
leben in einer `Map<reason, warning>`; eine Dimension, die bei jeder Folie
auslöst, erzeugt also eine Zeile, nicht sechzig.

Die Textgrenze pro Folie lässt nur die betroffene Folie verkürzt erscheinen.
Eine Grenze pro Block würde jede Folie gleichmäßig beschneiden und
Informationen verlieren, für die die Präsentation Budget hatte; der
Fehlermodus, den wir stattdessen akzeptieren, lautet: „Folie 12 wird
abgeschnitten“.

## Tests

```bash
npm install
npm run verify          # build (bundle load gate) + tests
npm test                # 19 checks
```

Das Fixture ist ein echtes pptx-förmiges Zip, das in der Testdatei gebaut
wird, mit einem echten winzigen PNG. Es ist genau dort feindlich, wo das
Format es ist:

- `p:sldIdLst` listet **Folie 2 vor Folie 1** — sortiert man Parts nach
  Dateinamen, bestehen alle anderen Assertionen, und das Ergebnis ist trotzdem
  falsch;
- eine Folien-Beziehung verwendet ein **absolutes** Ziel, eine andere ist
  **External**;
- `ppt/slideLayouts/slideLayout1.xml` trägt `MASTER TEXT MUST NOT APPEAR`, was
  nie auftauchen darf — genau das bedeutet hier „keine Platzhalter-Vererbung“.

## Aufbau

| Datei | Rolle |
|-------|-------|
| `pptx.ts` | Der Reader: Parts, Beziehungen, Shape-Baum, Notizen, Bilder |
| `circuit-breaker.ts` | Die sieben Grenzen und die Regel „eine Warnung pro Dimension“ |
| `zip.ts` / `xml.ts` | Container lesen; gezieltes XML-Scanning mit Tiefenzählung |
| `PptxViewer.tsx` | Folienleiste, Rendering der aktuellen Folie, Lebensdauer der Object-URLs |
| `locales.ts` | zh-/en-Wörterbücher, einschließlich jeder Warnvorlage |
| `seams.ts` | Strukturelle Spiegelbilder der konsumierten Client-Dienste |

Der Zip- und XML-Code ist vom Nachbar-Dokument-Plugin **kopiert**, nicht
geteilt. Zwei Nutzer dieses Codes sind noch nicht die Schwelle für ein
eigenes Paket — das würde ein drittes Ding hinzufügen, das veröffentlicht und
versionsfest gesperrt werden muss.

## Lizenz

MIT
