# Journal des modifications

Tous les changements notables de ce projet sont documentés ici. Le format est
basé sur [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) et ce projet
adhère au [Versionnement Sémantique](https://semver.org/spec/v2.0.0.html).

## [0.3.0] — 2026-09-29

### Modifié

- **Ligne d'hôte retargetée vers DSH 0.2.0** (`main`, promue depuis `compat/0.2.0`) : `engines.dsh` et la
  dépendance pair `@deepseek-ai/dsh-client-locale` passent de `>=0.1.5-rc.1 <0.2.0-0` à
  `>=0.2.0-rc.1 <0.2.1-0` (verrouillage sur la fenêtre rc ; 0.2.1+ à réévaluer). Adaptation limitée aux
  métadonnées — la surface de consommation du plugin est constituée d'appels purs `ctx.get(...)` avec des
  définitions d'interfaces locales, et 0.2.0-rc.1 préserve l'API plugin de 0.1.7, donc zéro changement de
  code. Les lignes 0.1.x (0.1.5 / 0.1.7) restent servies par les branches figées
  `compat/0.1.7` / `compat/0.1.5` (≤0.2.0).
- Arbre de dépendances rafraîchi sur la nouvelle ligne ; lockfile régénérée. `dsh.plugin.json`
  version/engines synchronisées avec `package.json`.

### Documentation (2026-09-29 — sans republication)

- Restructuration des branches : `main` est désormais la ligne 0.2.0 (promue depuis `compat/0.2.0`) ; les
  lignes d'hôtes 0.1.x sont servies par les branches figées `compat/0.1.7` / `compat/0.1.5`.
  Mappage npm inchangé : `dsh-0.2.0` → cette ligne, `dsh-0.1.7` / `dsh-0.1.5` → la ligne 0.1.x.
- Installation (cette ligne) : `dsh plugin --profile <profile> add dsh-pptx-sidebar@dsh-0.2.0`.
- La README s'est dotée d'une référence rapide en cinq langues (Deutsch / Français / Русский / Español / Italiano).

## [0.2.0] — 2026-09-23

Adaptation à la largeur : la vue de lecture change d'échelle avec le volet de
la barre latérale, dans certaines limites.

### Ajouté

- **Échelle adaptative à la largeur** (`src/client/scale.ts` +
  `useReaderScale.ts`) : un facteur dérivé de la largeur est écrit dans la
  propriété personnalisée `--reader-scale`, la taille de police racine devient
  `13px × scale`, et le contenu des diapositives est exprimé en `em` pour le
  suivre. À la largeur de base de **360 px, le facteur vaut exactement 1**,
  la mise en page reste donc inchangée à la largeur habituelle du volet ; le
  plancher est **0.9** et le plafond **1.15**.
- **Seul le document change d'échelle.** Titres, puces, paragraphes, notes,
  tableaux et légendes d'images suivent le facteur ; la bande d'en-tête, la
  bande de diapositives, la bannière du disjoncteur et les états de
  chargement/vide conservent leur taille fixe. Un habillage qui se
  redimensionne pendant qu'on tire un séparateur se lit comme un défaut, pas
  comme de la réactivité.
- **Quantifié à deux décimales**, si bien que tirer un séparateur réorganise
  la mise en page par pas de 0.01 au lieu d'à chaque pixel.
- **Les largeurs non mesurables retombent sur 1** — 0, négatif, NaN ou
  Infinity (première image, rapport défaillant) rendent la mise en page
  livrée plutôt qu'un extrême de la plage, ce qui ferait clignoter une
  typographie minuscule à l'ouverture.
- **Retrait des puces en `em`** (`INDENT_EM = 1.08em`), soit les 14 px
  d'avant à l'échelle 1.
- **Plafond des cellules de tableau 320 px → 24.6em**, pour que les cellules
  s'affinent avec le volet au lieu d'imposer une barre de défilement
  horizontale.

### Modifié

- Les images continuent de s'afficher à la taille indiquée par la
  transformation de la forme, plafonnées uniquement par le volet : agrandir
  une image bitmap au-delà de sa taille naturelle pour suivre l'échelle du
  texte la rendrait plus floue, pas plus fidèle.

### Tests

- 5 nouveaux contrôles (24 au total), couvrant : le facteur exactement 1 à la
  largeur de base, les deux bornes, la monotonie, le repli en cas de largeur
  non mesurable, la quantification à deux décimales et le retrait
  correspondant à 14 px à l'échelle 1.

### Publication

- **Première publication npm** : `dsh-pptx-sidebar@0.2.0`, dist-tags `latest`
  + `dsh-0.1.5` ; 39 fichiers / 83.1 kB, shasum du tarball
  `e6faf24a4e1c8e32a561ecb8693c828759626e96`.
- Le paquet publié déclare **`repository`**, pointant vers
  `drscrewdriver/dsh-pptx-sidebar`. La liste awesome ne relie un paquet npm à
  un dépôt que lorsque le paquet publié pointe vers lui.

## [0.1.0] — 2026-09-22

Première version. Lit `.pptx` / `.pptm` sous forme de vue de lecture
structurée dans la barre latérale droite de DSH.

### Ajouté

- Enregistrement d'un aperçu de fichiers pour `.pptx` et `.pptm`
  (`priority: 50`, `fetchStrategy: 'custom'`), les octets étant récupérés via
  la route `/sidebar/file` de better-sidebar, de sorte que la clôture des
  chemins de l'espace de travail reste côté hôte.
- Liste de diapositives dont l'ordre provient **uniquement** de `p:sldIdLst`
  résolu via les relations de présentation — jamais du tri des noms de
  fichiers des parties. Les cibles de relation absolues et relatives
  (`../`) se résolvent toutes deux ; les cibles External sont ignorées.
- Parcours de l'arbre de formes (`p:sp`, `p:pic`, `p:graphicFrame`,
  `p:grpSp`) avec un unique compteur de profondeur, pour que les formes
  groupées contribuent leur texte exactement une fois.
- Extraction du texte avec niveaux de puces par paragraphe (`a:pPr@lvl`, de
  0-based → 1-based) et runs en gras / italique.
- Détection du titre par le **type** d'espace réservé (`title` / `ctrTitle`),
  pas par la position ni la taille de police.
- Notes du présentateur issues des parties `notesSlide`, en sautant l'espace
  réservé à l'image de la diapositive. Une diapositive sans notes ne produit
  ni bloc, ni avertissement, ni erreur.
- Images intégrées : `a:blip@r:embed` → relation → octets de l'archive →
  blob URL, avec dimensionnement EMU→px. Les formats non affichables
  (EMF/WMF) deviennent des espaces réservés libellés au lieu de trous
  silencieux.
- Vrais tableaux issus des cadres graphiques `a:tbl`.
- Sept plafonds de disjoncteur (archive / inflation totale / partie unique /
  diapositives / texte de diapositive / images / image unique), avec **un
  avertissement par dimension**.
- Dictionnaires zh et en, y compris un modèle pour chaque raison de
  déclenchement du disjoncteur.
- Build avec une véritable porte de chargement : le bundle client est évalué
  dans un bac à sable `node:vm` et l'export de la factory est asserté pour
  porter `apply` et `inject`.
- `npm test` — 19 contrôles contre un fixture hostile construit en mémoire.
- Scripts de publication et de migration de profil (`-DryRun` par défaut),
  avec un preflight qui refuse une spec qui ne se résout pas encore.

### Délibérément non inclus

- Héritage des espaces réservés depuis les layouts et les masters : la v1 ne
  lit que la partie propre de la diapositive. Voir la section du README du
  même nom pour le raisonnement.
- Fidélité de la mise en page visuelle, polices de thème, animation, édition,
  prise en charge de `.ppt`.
