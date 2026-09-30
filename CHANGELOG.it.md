# Registro delle modifiche

Tutte le modifiche rilevanti di questo progetto sono documentate qui. Il
formato si basa su [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) e
questo progetto aderisce al
[Versionamento Semantico](https://semver.org/spec/v2.0.0.html).

## [0.3.0] — 2026-09-29

### Modificato

- **Linea host retargetizzata su DSH 0.2.0** (`main`, promossa da `compat/0.2.0`): `engines.dsh` e la
  peer dependency `@deepseek-ai/dsh-client-locale` passano da `>=0.1.5-rc.1 <0.2.0-0` a
  `>=0.2.0-rc.1 <0.2.1-0` (aggancio alla finestra rc; 0.2.1+ richiede una nuova valutazione). Adattamento
  solo di metadati — la superficie di consumo del plugin è composta da pure chiamate `ctx.get(...)` con
  definizioni di interfacce locali, e 0.2.0-rc.1 mantiene intatta l'API plugin di 0.1.7, quindi zero
  modifiche al codice. Le linee 0.1.x (0.1.5 / 0.1.7) restano servite dai rami congelati
  `compat/0.1.7` / `compat/0.1.5` (≤0.2.0).
- Albero delle dipendenze rinfrescato sulla nuova linea; lockfile rigenerato. `dsh.plugin.json`
  version/engines sincronizzate con `package.json`.

### Documentazione (2026-09-29 — nessuna ripubblicazione)

- Ristrutturazione dei rami: `main` è ora la linea 0.2.0 (promossa da `compat/0.2.0`); le
  linee host 0.1.x sono servite dai rami congelati `compat/0.1.7` / `compat/0.1.5`.
  Mappatura npm invariata: `dsh-0.2.0` → questa linea, `dsh-0.1.7` / `dsh-0.1.5` → la linea 0.1.x.
- Installazione (questa linea): `dsh plugin --profile <profile> add dsh-pptx-sidebar@dsh-0.2.0`.
- La README ha guadagnato una guida rapida in cinque lingue (Deutsch / Français / Русский / Español / Italiano).

## [0.2.0] — 2026-09-23

Adattamento alla larghezza: la vista di lettura si scala con il pannello della
barra laterale, entro certi limiti.

### Aggiunto

- **Scala adattiva alla larghezza** (`src/client/scale.ts` +
  `useReaderScale.ts`): un fattore derivato dalla larghezza viene scritto
  nella proprietà personalizzata `--reader-scale`, la dimensione del font di
  root diventa `13px × scale` e il contenuto delle slide è espresso in `em`
  così da seguirlo. Alla larghezza base di **360 px il fattore è esattamente
  1**, quindi il layout resta invariato alla larghezza abituale del pannello;
  il minimo è **0.9** e il massimo **1.15**.
- **Si ridimensiona solo il documento.** Titoli, elenchi, paragrafi, note,
  tabelle e didascalie delle immagini seguono il fattore; la striscia di
  intestazione, la striscia delle slide, il banner del breaker e gli stati di
  caricamento/vuoto mantengono la loro dimensione fissa. Un'interfaccia che
  cambia dimensioni mentre trascini un divisore si legge come un difetto, non
  come reattività.
- **Quantizzato a due decimali**, così trascinare un divisore riorganizza il
  layout a passi di 0.01 invece che a ogni pixel.
- **Le larghezze non misurabili ricadono su 1** — 0, negativo, NaN o Infinity
  (primo frame, segnalazione difettosa) rendono il layout consegnato anziché
  un estremo dell'intervallo, che farebbe lampeggiare un testo minuscolo
  all'apertura.
- **Rientro degli elenchi in `em`** (`INDENT_EM = 1.08em`), cioè i 14 px di
  prima alla scala 1.
- **Tetto delle celle di tabella 320 px → 24.6em**, così le celle si
  restringono col pannello invece di imporre una barra di scorrimento
  orizzontale.

### Modificato

- Le immagini continuano a essere rese alla dimensione dichiarata dalla
  trasformazione della forma, limitate solo dal pannello: ingrandire una
  bitmap oltre la sua dimensione naturale per seguire la scala del testo la
  renderebbe più sfocata, non più fedele.

### Test

- 5 nuovi controlli (24 in totale), che coprono: il fattore esattamente 1 alla
  larghezza base, entrambi i limiti, la monotonia, il ripiego per larghezze
  non misurabili, la quantizzazione a due decimali e il rientro corrispondente
  a 14 px alla scala 1.

### Pubblicazione

- **Prima pubblicazione npm**: `dsh-pptx-sidebar@0.2.0`, dist-tags `latest` +
  `dsh-0.1.5`; 39 file / 83.1 kB, shasum del tarball
  `e6faf24a4e1c8e32a561ecb8693c828759626e96`.
- Il pacchetto pubblicato dichiara **`repository`**, che punta a
  `drscrewdriver/dsh-pptx-sidebar`. La awesome list collega un pacchetto npm
  a un repository solo quando il pacchetto pubblicato punta a esso.

## [0.1.0] — 2026-09-22

Prima versione. Legge `.pptx` / `.pptm` come vista di lettura strutturata
nella barra laterale destra di DSH.

### Aggiunto

- Registrazione dell'anteprima di file per `.pptx` e `.pptm` (`priority: 50`,
  `fetchStrategy: 'custom'`), con i byte prelevati attraverso la rotta
  `/sidebar/file` di better-sidebar, così che la recinzione dei percorsi del
  workspace resti sul lato host.
- Elenco delle slide il cui ordine viene **solo** da `p:sldIdLst` risolto
  attraverso le relazioni della presentazione — mai dall'ordinamento dei nomi
  file delle parti. Le destinazioni delle relazioni assolute e relative con
  `../` si risolvono entrambe; le destinazioni External vengono ignorate.
- Percorso dell'albero delle forme (`p:sp`, `p:pic`, `p:graphicFrame`,
  `p:grpSp`) con un unico contatore di profondità, così le forme raggruppate
  contribuiscono il loro testo esattamente una volta.
- Estrazione del testo con livelli di elenco per paragrafo (`a:pPr@lvl`, da
  0-based → 1-based) e run in grassetto / corsivo.
- Rilevamento del titolo dal **tipo** di segnaposto (`title` / `ctrTitle`),
  non dalla posizione o dalla dimensione del font.
- Note del relatore dalle parti `notesSlide`, saltando il segnaposto
  dell'immagine della slide. Una slide senza note non produce blocco, avviso
  né errore.
- Immagini incorporate: `a:blip@r:embed` → relazione → byte dell'archivio →
  blob URL, con dimensionamento EMU→px. I formati non renderizzabili
  (EMF/WMF) diventano segnaposto etichettati invece di vuoti silenziosi.
- Tabelle vere dai graphic frame `a:tbl`.
- Sette limiti del circuit breaker (archivio / inflazione totale / parte
  singola / slide / testo della slide / immagini / immagine singola), con
  **un avviso per dimensione**.
- Dizionari zh e en, compreso un modello per ogni motivo di intervento del
  breaker.
- Build con una vera barriera di caricamento: il bundle client viene valutato
  in una sandbox `node:vm` e l'export della factory viene verificato per
  portare `apply` e `inject`.
- `npm test` — 19 controlli contro un fixture ostile costruito in-process.
- Script di pubblicazione e di migrazione del profilo (`-DryRun` per
  impostazione predefinita), incluso un preflight che rifiuta una spec che
  non si risolve ancora.

### Deliberatamente non incluso

- Ereditarietà dei segnaposto da layout e master: la v1 legge solo la parte
  propria della slide. Per il ragionamento, vedi la sezione del README con lo
  stesso nome.
- Fedeltà del layout visivo, font del tema, animazioni, modifica, supporto
  `.ppt`.
