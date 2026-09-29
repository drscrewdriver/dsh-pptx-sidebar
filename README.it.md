# dsh-pptx-sidebar

[简体中文](README.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Italiano](README.it.md) | [Русский](README.ru.md) | [Español](README.es.md)

Leggi i deck `.pptx` / `.pptm` nella barra laterale di DSH — le slide
**nell'ordine di presentazione**, con il loro testo, i livelli di elenco, le
note del relatore e le immagini incorporate.

> **Questa è una vista di lettura, non una riproduzione della slide.** Niente
> posizionamento assoluto, niente font del tema, niente ereditarietà dei
> segnaposto, niente animazioni. Il visualizzatore lo dichiara nella propria
> intestazione, perché una differenza di layout che sembra un bug di rendering
> è peggiore di un limite dichiarato apertamente.

È un consumer di
[dsh-better-sidebar](https://www.npmjs.com/package/dsh-better-sidebar):
registra un'anteprima di file e si disegna dentro l'area di anteprima della
card Side. Senza quel plugin, si carica, avvisa una volta sola e non fa nulla.

---

## Installazione

```bash
dsh plugin --profile <profile> add github:drscrewdriver/dsh-pptx-sidebar#<sha>
dsh plugin --profile <profile> add dsh-pptx-sidebar@0.1.0     # once published
```

Riavvia quindi **l'host DSH** — un refresh del browser non basta perché
compaia una nuova riga del loader. Verifica senza avviare nulla:

```bash
dsh --profile <profile> --dump-config | Select-String dsh-pptx-sidebar
```

L'installazione manuale è di tre passaggi, non di uno — vedi
`cordis.patch.yml`. Eseguire solo i passaggi 1 e 3 produce un profilo in cui
il pacchetto c'è, la riga della patch c'è, **e non si carica nulla, in
silenzio**.

## Cosa fa / cosa non fa

| Fatto | Non fatto |
|-------|-----------|
| Elenco delle slide nell'ordine di `p:sldIdLst` | Layout visivo, posizionamento assoluto |
| Paragrafi di testo, livello di elenco per paragrafo | Risoluzione dei font di tema/master |
| Rilevamento del titolo dal tipo di segnaposto | **Ereditarietà dei segnaposto** (vedi sotto) |
| Note del relatore dalle parti `notesSlide` | Grafici renderizzati come grafici |
| Immagini incorporate come blob URL | Animazioni, transizioni, timing |
| Tabelle vere (`a:tbl`) | Commenti, contrassegni di revisione |
| Run in grassetto / corsivo | Modifica, riscrittura |
| Sette limiti del circuit breaker | `.ppt` legacy (BIFF/OLE2), formati WPS |

### La riga sull'ereditarietà dei segnaposto (deliberata)

Una slide spesso mostra testo che non contiene: numeri, piè di pagina e testo
del titolo che vivono in `slideLayout` / `slideMaster`, referenziati tramite
un segnaposto `p:ph`. Risolverli significherebbe reimplementare la catena di
ereditarietà di PowerPoint — incluse le override di livello di `lstStyle` e il
layout che la slide usa davvero.

**La v1 non lo fa.** Viene letta solo la parte propria della slide. La
conseguenza è dichiarata, non nascosta: una slide il cui testo è interamente
ereditato viene resa senza testo. È un'omissione visibile, non una corruzione
— la scelta opposta (ereditare a torto) mostrerebbe testo che non è sulla
slide.

## Adattamento alla larghezza

Il pannello della barra laterale è ridimensionabile, quindi la vista di
lettura si adatta a esso — entro certi limiti, perché «adattivo» non è una
licenza a continuare a crescere o restringersi:

| Parametro | Valore | Perché |
|-----------|--------|--------|
| Larghezza base | 360 px | Il fattore qui è **esattamente 1**, quindi la larghezza abituale del pannello rende il layout così come lo ha consegnato la 0.1.0 |
| Minimo | 0.9× | Un pannello stretto mantiene comunque un testo leggibile |
| Massimo | 1.15× | Un pannello largo riceve un testo comodo, non enorme |
| Quantizzazione | 2 decimali | Trascinare riorganizza il layout a passi di 0.01, non a ogni pixel |

Il fattore è ricavato dalla larghezza del pannello e scritto nella proprietà
personalizzata `--reader-scale`; la dimensione del font di root diventa
`13px × scale` e il contenuto delle slide è espresso in `em`, così il testo va
in **reflow** alla nuova dimensione invece di essere scalato con una
trasformazione (che renderebbe sfocati i glifi).

**Si ridimensiona solo il documento.** Titoli, elenchi, paragrafi, note,
tabelle e didascalie seguono il fattore; la striscia di intestazione, la
striscia delle slide, il banner del circuit breaker e gli stati di
caricamento/vuoto mantengono la loro dimensione fissa. Un'interfaccia che
cambia dimensioni mentre trascini un divisore si legge come un difetto, non
come reattività.

Due decisioni correlate:

- **Una larghezza non misurabile ricade su 1**, non su un limite. Prima della
  prima misurazione la larghezza è 0, e renderla «il più stretta possibile»
  farebbe lampeggiare un testo minuscolo a ogni apertura di un deck.
- **Le immagini non si ridimensionano.** Vengono rese alla dimensione
  dichiarata dalla trasformazione della forma e sono limitate solo dal
  pannello; ingrandire una bitmap oltre la sua dimensione naturale per seguire
  il testo la renderebbe più sfocata, non più fedele.

## La pipeline

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

Le immagini sono estratte dallo zip e trasformate in object URL. Un'immagine
incorporata vive *dentro* l'archivio, quindi non esiste una rotta dell'host a
cui puntare — non è «leggere i file da soli», è usare i byte che l'host ha già
consegnato.

## I sette limiti del circuit breaker

| Dimensione | Predefinito | Oltre |
|------------|-------------|-------|
| Dimensione dell'archivio | 8 MB | BLOCCATO — rifiutato prima di qualsiasi decompressione |
| Inflazione totale | 64 MB | BLOCCATO — la barriera anti zip-bomb |
| Una singola parte | 32 MB | BLOCCATO — una singola parte XML sovradimensionata |
| Slide | 300 | TRONCATO — il lettore smette di percorrere il deck |
| Testo della slide | 20 000 caratteri | il testo rimanente di quella slide viene omesso |
| Immagini | 200 | le immagini successive vengono saltate |
| Una singola immagine | 8 MB | quell'immagine viene saltata (nemmeno decompressa) |

**Al massimo un avviso per dimensione**, per costruzione — gli avvisi vivono
in una `Map<reason, warning>`, quindi una dimensione che scatta su ogni slide
produce una riga, non sessanta.

Il limite di testo per slide omette solo la slide incriminata. Un limite per
blocco spunterebbe tutte le slide allo stesso modo e perderebbe informazioni
per le quali il deck aveva budget; la modalità di errore che accettiamo invece
è «la slide 12 viene troncata».

## Test

```bash
npm install
npm run verify          # build (bundle load gate) + tests
npm test                # 19 checks
```

Il fixture è un vero zip dalla forma di un pptx, costruito nel file di test,
con un autentico piccolo PNG. È ostile esattamente dove lo è il formato:

- `p:sldIdLst` elenca la **slide 2 prima della slide 1**, quindi ordinare le
  parti per nome file passerebbe tutte le altre asserzioni restando comunque
  sbagliato;
- una relazione di slide usa una destinazione **assoluta**, un'altra è
  **External**;
- `ppt/slideLayouts/slideLayout1.xml` contiene `MASTER TEXT MUST NOT APPEAR`,
  che non deve mai affiorare — questo è ciò che significa «niente ereditarietà
  dei segnaposto».

## Struttura

| File | Ruolo |
|------|-------|
| `pptx.ts` | Il lettore: parti, relazioni, albero delle forme, note, immagini |
| `circuit-breaker.ts` | I sette limiti e la regola di un avviso per dimensione |
| `zip.ts` / `xml.ts` | Lettura del contenitore; scansione XML mirata con conteggio della profondità |
| `PptxViewer.tsx` | Striscia delle slide, rendering della slide corrente, ciclo di vita degli object URL |
| `locales.ts` | Dizionari zh / en, compreso ogni modello di avviso |
| `seams.ts` | Specchi strutturali dei servizi del client che consumiamo |

Il codice zip e XML è **copiato** dal plugin documenti gemello anziché
condiviso. Due utenti di questo codice non sono ancora la soglia per estrarre
un pacchetto — aggiungerebbero una terza cosa da pubblicare e da bloccare per
versione.

## Licenza

MIT
