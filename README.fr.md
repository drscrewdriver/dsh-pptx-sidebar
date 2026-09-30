# dsh-pptx-sidebar

[简体中文](README.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Italiano](README.it.md) | [Русский](README.ru.md) | [Español](README.es.md)

Lisez des présentations `.pptx` / `.pptm` dans la barre latérale de DSH — les
diapositives **dans l'ordre de présentation**, avec leur texte, leurs niveaux
de puces, les notes du présentateur et les images intégrées.

> **Ceci est une vue de lecture, pas une reproduction de la diapositive.** Pas
> de positionnement absolu, pas de polices du thème, pas d'héritage des espaces
> réservés, pas d'animation. Le visionneur l'annonce dans son en-tête : une
> différence de mise en page qui ressemble à un bug de rendu est pire qu'une
> limitation clairement libellée.

C'est un consommateur de
[dsh-better-sidebar](https://www.npmjs.com/package/dsh-better-sidebar) : il
enregistre un aperçu de fichiers et effectue son rendu dans la zone d'aperçu
de la carte Side. Sans ce plugin, il se charge, émet un seul avertissement et
ne fait rien.

---

## Installation

```bash
dsh plugin --profile <profile> add github:drscrewdriver/dsh-pptx-sidebar#<sha>
dsh plugin --profile <profile> add dsh-pptx-sidebar@0.1.0     # once published
```

Redémarrez ensuite **l'hôte DSH** — un simple rafraîchissement du navigateur
ne suffit pas pour faire apparaître une nouvelle ligne de loader. Vérifiez
sans rien démarrer :

```bash
dsh --profile <profile> --dump-config | Select-String dsh-pptx-sidebar
```

L'installation manuelle comporte trois étapes, pas une seule — voir
`cordis.patch.yml`. Ne faire que les étapes 1 et 3 produit un profil où le
paquet est présent, la ligne de patch est présente, **et rien ne se charge,
en silence**.

## Ce que le plugin fait / ne fait pas

| Fait | Pas fait |
|------|----------|
| Liste de diapositives dans l'ordre `p:sldIdLst` | Mise en page visuelle, positionnement absolu |
| Paragraphes de texte, niveau de puce par paragraphe | Résolution des polices du thème/master |
| Détection du titre à partir du type d'espace réservé | **Héritage des espaces réservés** (voir ci-dessous) |
| Notes du présentateur issues des parties `notesSlide` | Graphiques re-rendus en tant que graphiques |
| Images intégrées sous forme de blob URLs | Animation, transitions, minutages |
| Vrais tableaux (`a:tbl`) | Commentaires, marques de révision |
| Runs en gras / italique | Édition, réécriture |
| Sept plafonds de disjoncteur | `.ppt` historique (BIFF/OLE2), formats WPS |

### La ligne sur l'héritage des espaces réservés (volontaire)

Une diapositive affiche souvent un texte qu'elle ne contient pas : numéros,
pieds de page et titre qui vivent dans `slideLayout` / `slideMaster`,
référencés via un espace réservé `p:ph`. Les résoudre reviendrait à
réimplémenter la chaîne d'héritage de PowerPoint — y compris les surcharges
de niveau `lstStyle` et le layout que la diapositive utilise réellement.

**La v1 ne le fait pas.** Seule la partie propre de la diapositive est lue.
La conséquence est énoncée plutôt que cachée : une diapositive dont le texte
est entièrement hérité s'affiche sans texte. C'est une omission visible, pas
une corruption — le choix inverse (hériter à tort) afficherait un texte qui
ne se trouve pas sur la diapositive.

## Adaptation à la largeur

Le volet de la barre latérale est redimensionnable, la vue de lecture s'y
adapte donc — dans certaines limites, car « adaptatif » n'est pas une licence
à grossir ou rétrécir sans fin :

| Réglage | Valeur | Pourquoi |
|---------|--------|----------|
| Largeur de base | 360 px | Le facteur y vaut **exactement 1**, si bien que la largeur habituelle du volet affiche la mise en page telle que la 0.1.0 l'a livrée |
| Plancher | 0.9× | Un volet étroit garde une typographie lisible |
| Plafond | 1.15× | Un volet large reçoit une typographie confortable, pas énorme |
| Quantification | 2 décimales | Un glissement réorganise la mise en page par pas de 0.01, pas à chaque pixel |

Le facteur est dérivé de la largeur du volet et écrit dans la propriété
personnalisée `--reader-scale` ; la taille de police racine devient
`13px × scale` et le contenu des diapositives est exprimé en `em`, de sorte
que le texte **se réorganise** à la nouvelle taille au lieu d'être
redimensionné par transformation (ce qui rendrait les glyphes flous).

**Seul le document change d'échelle.** Titres, puces, paragraphes, notes,
tableaux et légendes suivent le facteur ; la bande d'en-tête, la bande de
diapositives, la bannière du disjoncteur et les états de chargement/vide
conservent leur taille fixe. Un habillage qui change de taille pendant qu'on
tire un séparateur se lit comme un défaut, pas comme de la réactivité.

Deux décisions connexes :

- **Une largeur non mesurable retombe sur 1**, pas sur une borne. Avant la
  première mesure, la largeur vaut 0, et la restituer « aussi étroite que
  possible » ferait clignoter une typographie minuscule à chaque ouverture de
  présentation.
- **Les images ne changent pas d'échelle.** Elles s'affichent à la taille
  indiquée par la transformation de la forme et ne sont plafonnées que par le
  volet ; agrandir une image bitmap au-delà de sa taille naturelle pour suivre
  le texte la rendrait plus floue, pas plus fidèle.

## Le pipeline

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

Les images sont extraites du zip et transformées en object URLs. Une image
intégrée vit *à l'intérieur* de l'archive : il n'existe aucune route d'hôte
vers laquelle pointer — ce n'est pas « lire les fichiers nous-mêmes », c'est
utiliser les octets que l'hôte a déjà transmis.

## Les sept plafonds du disjoncteur

| Dimension | Valeur par défaut | Au-delà |
|-----------|-------------------|---------|
| Taille de l'archive | 8 MB | BLOQUÉ — refusé avant tout décompactage |
| Inflation totale | 64 MB | BLOQUÉ — le garde-fou anti zip-bomb |
| Une seule partie | 32 MB | BLOQUÉ — une seule partie XML surdimensionnée |
| Diapositives | 300 | TRONQUÉ — le lecteur cesse de parcourir la présentation |
| Texte d'une diapositive | 20 000 caractères | le reste du texte de cette diapositive est élidé |
| Images | 200 | les images suivantes sont ignorées |
| Une seule image | 8 MB | cette image est ignorée (même pas décompressée) |

**Au plus un avertissement par dimension**, et ce structurellement — les
avertissements vivent dans une `Map<reason, warning>`, une dimension qui se
déclenche à chaque diapositive produit donc une ligne, pas soixante.

Le plafond de texte par diapositive n'élide que la diapositive fautive. Un
plafond par bloc rognerait toutes les diapositives à l'identique et perdrait
des informations pour lesquelles la présentation avait du budget ; le mode de
défaillance que nous acceptons à la place est « la diapositive 12 est coupée
court ».

## Tests

```bash
npm install
npm run verify          # build (bundle load gate) + tests
npm test                # 19 checks
```

Le fixture est un vrai zip en forme de pptx, construit dans le fichier de
test, avec un authentique petit PNG. Il est hostile exactement là où le
format l'est :

- `p:sldIdLst` liste la **diapositive 2 avant la diapositive 1**, de sorte que
  trier les parties par nom de fichier ferait passer toutes les autres
  assertions tout en restant faux ;
- une relation de diapositive utilise une cible **absolue**, une autre est
  **External** ;
- `ppt/slideLayouts/slideLayout1.xml` contient `MASTER TEXT MUST NOT APPEAR`,
  qui ne doit jamais apparaître — c'est ce que signifie « pas d'héritage des
  espaces réservés » ici.

## Architecture

| Fichier | Rôle |
|---------|------|
| `pptx.ts` | Le lecteur : parties, relations, arbre de formes, notes, images |
| `circuit-breaker.ts` | Les sept plafonds et la règle d'un avertissement par dimension |
| `zip.ts` / `xml.ts` | Lecture du conteneur ; balayage XML ciblé avec comptage de profondeur |
| `PptxViewer.tsx` | Bande de diapositives, rendu de la diapositive courante, cycle de vie des object URLs |
| `locales.ts` | Dictionnaires zh / en, y compris chaque modèle d'avertissement |
| `seams.ts` | Miroirs structurels des services du client que nous consommons |

Le code zip et XML est **copié** depuis le plugin document voisin plutôt que
partagé. Deux utilisateurs de ce code, ce n'est pas encore le seuil pour
extraire un paquet — cela ajouterait une troisième chose à publier et à
verrouiller par version.

## Compatibilité

| Version du plugin | Plage d'hôtes DSH | Notes |
|-------------------|-------------------|-------|
| 0.3.0 | `>=0.2.0-rc.1 <0.2.1-0` | La ligne 0.2.0 (`main`, promue depuis `compat/0.2.0`). Adaptation limitée aux métadonnées : la surface de consommation est constituée d'appels purs `ctx.get(...)`, et 0.2.0-rc.1 préserve l'API plugin de 0.1.7 |
| 0.2.0 | `>=0.1.5-rc.1 <0.2.0-0` | Assurée par les branches figées `compat/0.1.7` / `compat/0.1.5` |

`engines.dsh`, la dépendance pair `@deepseek-ai/dsh-client-locale` de `package.json` et
`engines.dsh` de `dsh.plugin.json` portent la même plage (maintenue en cohérence).

## Languages / Sprachen / Langues / Языки / Idiomas / Lingue

Cette README est rédigée en français. Référence rapide de compatibilité et d'installation (cette ligne nécessite DSH 0.2.0 : `>=0.2.0-rc.1 <0.2.1-0` ; installation : `dsh plugin --profile <profile> add dsh-pptx-sidebar@dsh-0.2.0`) :

- **Deutsch** — benötigt DSH 0.2.0 (`>=0.2.0-rc.1 <0.2.1-0`). Installation: `dsh plugin --profile <profile> add dsh-pptx-sidebar@dsh-0.2.0`. Die 0.1.x-Wirtslinie wird von den eingefrorenen Zweigen `compat/0.1.7` / `compat/0.1.5` (npm-Tags `dsh-0.1.7` / `dsh-0.1.5`) versorgt.
- **Français** — nécessite DSH 0.2.0 (`>=0.2.0-rc.1 <0.2.1-0`). Installation : `dsh plugin --profile <profile> add dsh-pptx-sidebar@dsh-0.2.0`. La lignée d'hôtes 0.1.x est assurée par les branches figées `compat/0.1.7` / `compat/0.1.5` (tags npm `dsh-0.1.7` / `dsh-0.1.5`).
- **Русский** — требуется DSH 0.2.0 (`>=0.2.0-rc.1 <0.2.1-0`). Установка: `dsh plugin --profile <profile> add dsh-pptx-sidebar@dsh-0.2.0`. Линия хостов 0.1.x обслуживается замороженными ветками `compat/0.1.7` / `compat/0.1.5` (npm-теги `dsh-0.1.7` / `dsh-0.1.5`).
- **Español** — requiere DSH 0.2.0 (`>=0.2.0-rc.1 <0.2.1-0`). Instalación: `dsh plugin --profile <profile> add dsh-pptx-sidebar@dsh-0.2.0`. La línea de anfitriones 0.1.x la atienden las ramas congeladas `compat/0.1.7` / `compat/0.1.5` (etiquetas npm `dsh-0.1.7` / `dsh-0.1.5`).
- **Italiano** — richiede DSH 0.2.0 (`>=0.2.0-rc.1 <0.2.1-0`). Installazione: `dsh plugin --profile <profile> add dsh-pptx-sidebar@dsh-0.2.0`. La linea di host 0.1.x è servita dai rami congelati `compat/0.1.7` / `compat/0.1.5` (tag npm `dsh-0.1.7` / `dsh-0.1.5`).

## Licence

MIT
