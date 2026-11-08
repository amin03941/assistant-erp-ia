# Assistant IA pour l'interrogation d'un ERP générique

Application web permettant à un utilisateur authentifié d'interroger une base ERP
fictive en **langage naturel**, à l'écrit ou **à la voix**, d'y créer ou modifier des
données, et d'importer des factures fournisseurs (image ou PDF) par lecture
automatique — avec contrôle des droits et validation côté serveur à chaque étape.

> Projet de stage d'ingénieur — VirtualDev, 2026
> Stagiaire : Mohamed Amin Kharrat

---

## Principe

Une seule règle gouverne l'implémentation : **le modèle repère, le code décide.**

| | Rôle |
|---|---|
| Le modèle de langue | comprend la phrase, repère où se trouve chaque information |
| Le code | normalise, résout les références en base, calcule les dates, contrôle les droits, exécute |

Le modèle ne produit jamais de SQL, ni de nom de table, ni de nom de colonne libre. Il
renvoie une spécification JSON dont la forme lui est imposée. Tout le reste — convertir
« 1 200,500 » en nombre, traduire « par chèque » en `CHECK`, retrouver une facture à
partir d'un nom de client, savoir ce que « le mois dernier » veut dire aujourd'hui — est
fait par du code déterministe et testable.

### Consultation

```
Question → modèle → spécification → période, reprise, noms résolus en base → validation → SQL → PostgreSQL
                                                                                     ↓
                                                     phrase rédigée par le code, tableau, graphique
```

Trois garanties en découlent :

- le compte PostgreSQL utilisé pour les lectures n'a de droits que sur les vues ;
- toute colonne absente du catalogue est inaccessible, quelle que soit la question ;
- la phrase de réponse est construite par le backend à partir des lignes réellement
  retournées, jamais rédigée librement par le modèle.

**Une grammaire par rôle.** Le schéma imposé au modèle par décodage contraint est
construit, pour chaque rôle, à partir du catalogue. C'est une union discriminée — lecture,
écriture, refus, conversation — où chaque branche impose ses champs et n'admet qu'eux.
La lecture se décline en une branche par vue ouverte au rôle : une fois la vue écrite,
seules les colonnes de cette vue restent admissibles. Une vue interdite ou une colonne
inventée ne sont donc pas seulement refusées par le validateur — elles sont
impossibles à produire. Le validateur reste en place, comme seconde barrière : il
vérifie aussi que chaque valeur a la forme du type de sa colonne.

**Les dates.** Le modèle ne connaît pas la date du jour : laissé libre, il écrivait
octobre 2024 pour « ce mois-ci ». Les colonnes de date ne figurent donc pas parmi les
filtres qu'il peut écrire. Il nomme la période (« ce mois-ci », « le mois dernier »,
« en septembre », « depuis le 1er août ») et le code en calcule les bornes, dans le
fuseau de l'entreprise. La réponse rappelle la période en clair : « le mois dernier
(septembre 2026) ».

**La reprise du sujet.** « Et ses factures ? » après un client : le modèle signale la
reprise, le code ajoute le filtre exact. Un filet déterministe reconnaît en plus les
reprises certaines par la grammaire (« cette commande », « ses ») ; « les factures de
cette année » n'en est pas une.

**Les messages sans données** (« bonjour », « merci », « que sais-tu faire ? ») ont leur
propre type. La liste des capacités est construite par le code à partir du catalogue et
des actions ouvertes au rôle ; le texte libre du modèle n'est affiché que pour une
salutation, et seulement s'il ne contient aucun chiffre ni nom interne.

**La transparence.** Pendant le traitement, l'interface affiche les étapes réellement
franchies (compréhension, vérification, exécution). Sous chaque réponse, « Comment j'ai
compris » détaille, en français, les données consultées, les conditions et le calcul : une
mauvaise compréhension se voit avant qu'on se fie au résultat. La requête SQL exécutée et
ses paramètres n'y figurent que pour le responsable et l'administrateur : pour les autres
rôles, le serveur ne les transmet pas, et les refus ne citent aucun nom interne.

**Les graphiques.** Un regroupement (« le reste à payer par client ») ou une série
déclarée au catalogue (le chiffre d'affaires mensuel) est aussi affiché en histogramme,
au-dessus du tableau.

### Écriture

```
Demande  →  LLM (code d'action)  →  LLM (valeurs brutes)  →  normalisation
                                                                 ↓
   confirmation utilisateur  ←  résumé  ←  résolution de la cible + contrôle des droits
            ↓
   exécution en transaction  →  journal d'audit
```

Le modèle ne produit jamais d'`INSERT`, d'`UPDATE` ni de `DELETE`. Ce qui manque
devient une **question** posée à l'utilisateur, pas une erreur. Rien n'est écrit sans
confirmation explicite : le navigateur n'envoie qu'un identifiant, les valeurs sont
relues côté serveur.

### Import OCR

Le même modèle, en mode vision, lit une facture fournisseur. Les champs extraits sont
convertis puis vérifiés — HT + TVA (+ timbre fiscal) doit faire TTC, la somme des
lignes doit faire le HT, quantité × prix unitaire doit faire chaque total. Le
fournisseur est retrouvé par son **matricule fiscal**, une clé exacte que le modèle lit
mieux qu'un nom propre.

Un brouillon est présenté à l'utilisateur ; la facture d'achat et ses lignes ne sont
créées qu'après validation, en une seule transaction. Le timbre fiscal, fréquent sur les
factures tunisiennes, est compris dans le TTC et noté sur la facture.

Formats acceptés : PNG, JPEG et PDF (3 pages au plus), 10 Mo maximum. Un PDF est rendu
en image dans le navigateur par pdf.js : le serveur et le modèle reçoivent une image.

### Voix

```
micro  →  Whisper (navigateur, Web Worker)  →  texte à relire  →  question
réponse déterministe  →  texte prononçable  →  synthèse vocale du navigateur
```

- **Reconnaissance vocale locale.** Whisper s'exécute dans le navigateur (transformers.js,
  ONNX Runtime en WASM, WebGPU sur option) : l'audio ne quitte jamais le poste, comme les
  questions confiées à Ollama. L'enregistrement s'arrête seul après un silence. La page
  de chat est isolée (en-têtes COOP/COEP) pour que l'inférence WASM utilise plusieurs
  threads : une phrase de 4 secondes est transcrite en 1,9 s au lieu de 5,1 s.
- **Relecture avant envoi.** Le texte reconnu est placé dans la zone de saisie : un nom ou
  un montant mal entendu se corrige avant de partir — d'autant que les écritures exigent
  de toute façon une confirmation.
- **Synthèse vocale.** Seule la phrase construite par le code est lue : la voix ne peut
  pas énoncer un chiffre faux. Elle est rendue prononçable — « 14 778,015 TND » devient
  « 14778 dinars et 15 millimes ». Une question dictée reçoit une réponse parlée ;
  l'interrupteur « Lecture vocale » lit toutes les réponses.

### Tableau de bord

Réservé au responsable et à l'administrateur, il montre comment l'assistant est utilisé
et comment il se comporte, à partir de données déjà enregistrées : questions posées,
taux de réponse et de refus, temps de réponse médian et p90, activité des 14 derniers
jours, nature des demandes, données les plus consultées, motifs de refus, dernières
opérations auditées, et résultats du jeu d'évaluation.

---

## Prérequis

| Outil | Version |
|---|---|
| Node.js | 20 ou plus |
| PostgreSQL | 16 ou plus |
| [Ollama](https://ollama.com/download) | version récente |

Le modèle `qwen3.5:9b` occupe environ 6,6 Go. Une carte graphique avec 8 Go de
mémoire vidéo suffit ; à défaut, Ollama bascule sur le processeur, plus lentement.

---

## Installation

### 1. Dépendances

```bash
git clone https://github.com/amin03941/assistant-erp-ia.git
cd assistant-erp-ia
npm install
```

### 2. Base de données

```bash
createdb assistant_erp
psql -d assistant_erp -v ON_ERROR_STOP=1 -f db/schema.sql
psql -d assistant_erp -v ON_ERROR_STOP=1 -f db/seed.sql
psql -d assistant_erp -v ON_ERROR_STOP=1 -f db/roles.sql
```

`schema.sql` crée les tables et les vues. `seed.sql` insère le jeu de données fictif ;
il commence par un `TRUNCATE` et peut donc être rejoué. `roles.sql` crée les deux
rôles applicatifs — **modifier les mots de passe qu'il contient**.

### 3. Modèle local

```bash
ollama pull qwen3.5:9b
```

Ce modèle sert à la fois à l'analyse des questions et à la lecture des factures : il
dispose de la capacité vision, vérifiable avec `ollama show qwen3.5:9b`.

### 4. Variables d'environnement

Copier `.env.example` vers `.env.local` et compléter :

```
DATABASE_URL=postgresql://erp_app:MOT_DE_PASSE@localhost:5432/assistant_erp
DATABASE_URL_READONLY=postgresql://erp_assistant:MOT_DE_PASSE@localhost:5432/assistant_erp
GEMINI_API_KEY=            # facultatif — secours si Ollama est arrêté
GEMINI_MODEL=gemini-3.6-flash   # facultatif — modèle de secours
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=qwen3.5:9b
AUTH_SECRET=               # générer avec : npx auth secret
APP_TZ=Africa/Tunis        # facultatif — fuseau de « aujourd'hui », « ce mois-ci »
NEXT_PUBLIC_STT_MODELE=onnx-community/whisper-base   # ou whisper-small, plus précis
NEXT_PUBLIC_STT_WEBGPU=0   # 1 pour exécuter Whisper sur la carte graphique
```

Le modèle vocal (~77 Mo pour `whisper-base`) est téléchargé depuis Hugging Face à la
première dictée, puis conservé dans le cache du navigateur : les dictées suivantes
fonctionnent hors ligne. Les bibliothèques du navigateur — transformers.js pour la voix,
pdf.js pour les PDF — sont chargées depuis le CDN jsDelivr à leur premier usage, puis
mises en cache. **Faire une dictée et un import PDF une première fois avec une connexion
internet** avant une démonstration hors ligne. Le micro n'est accessible que sur
`localhost` ou en HTTPS.

### 5. Lancement

```bash
npm run dev
```

L'application démarre sur <http://localhost:3000>.

---

## Comptes de démonstration

Mot de passe commun : `Demo1234!`

| Email | Rôle | Accès |
|---|---|---|
| `responsable@integrasys.tn` | MANAGER | toutes les données métier, toutes les actions, tableau de bord |
| `comptable@integrasys.tn` | ACCOUNTANT | factures, paiements, achats, import OCR |
| `commercial@integrasys.tn` | SALES | clients, produits, commandes |
| `admin@integrasys.tn` | ADMIN | tableau de bord, sans accès métier |

> Comptes de développement uniquement. À supprimer avant toute mise en ligne.

---

## Utilisation

### Consultation

```
Quel est le montant total des factures impayées ?
Quelles sont les factures impayées de Medina Textile ?
Seulement celles en retard
Combien de factures avons-nous émises le mois dernier ?
Quelle est l'évolution du chiffre d'affaires par mois ?
Montre la commande CMD-2026-0031, puis : quels produits contient cette commande ?
```

La conversation garde le contexte : un tour affine le précédent sans répéter le client,
et « cette commande » reprend la commande affichée. Sous chaque réponse, « Comment j'ai
compris » montre ce qui a été retenu (et, pour le responsable, la requête exécutée).

### Création et modification

```
Ajoute un client nommé Société Horizon Tech avec un délai de paiement de 45 jours
Modifie le téléphone du client Epsilon Services en 71 111 222
Facture la commande CMD-2026-0002
Enregistre un paiement de 500 dinars par virement pour Gamma SARL
```

La dernière demande ne désigne pas de facture précise : le système propose les
factures ouvertes du client, avec leur reste à payer, sous forme de choix cliquables.

### À la voix

Le bouton micro, à côté du bouton d'envoi, lance la dictée. Parlez, marquez une pause :
le texte reconnu apparaît dans la zone de saisie, Entrée l'envoie, et la réponse est lue
à voix haute.

### Import d'une facture

Le bouton « Importer facture (OCR) » ouvre le sélecteur de fichier (image ou PDF). La
lecture prend une vingtaine de secondes, puis un brouillon s'affiche avec le fournisseur
identifié, les montants, le timbre fiscal éventuel et les lignes rapprochées du
catalogue produits.

---

## Structure

```
app/
  api/chat/               traitement d'une question, de bout en bout (JSON ou flux d'étapes)
  api/actions/confirm/    confirmation d'une action d'écriture
  api/import/             téléversement et lecture d'une facture
  api/import/confirm/     création de la facture d'achat
  api/conversations/      liste et relecture des conversations
  chat/                   interface principale
  chat/tableau-de-bord/   suivi de l'assistant
  login/                  page de connexion
components/
  chat-area.tsx           zone de discussion, étapes en direct
  comprehension.tsx       « Comment j'ai compris »
  graphique.tsx           histogramme d'une série
  use-voix.ts             dictée (Whisper) et lecture à voix haute
  pdf-en-image.ts         rendu d'un PDF en image (pdf.js)
  carte-action.tsx        confirmation d'une action d'écriture
  carte-import.tsx        brouillon d'une facture importée
  sidebar.tsx             barre latérale et historique
lib/
  catalogue.ts            vues, colonnes, types et rôles autorisés — liste blanche
  actions.ts              catalogue des actions d'écriture — champs, rôles, cibles
  llm.ts                  appel du modèle, grammaire par rôle, cascade Ollama → Gemini
  periodes.ts             dates et périodes : le modèle nomme, le code calcule
  entites.ts              résolution des noms et report du sujet
  validateur.ts           vérification de la spécification, construction du SQL
  synthese.ts             rédaction de la réponse et de « Comment j'ai compris »
  graphique.ts            choix et données d'un graphique
  dialogue.ts             messages sans données : salutations, capacités du rôle
  observabilite.ts        indicateurs du tableau de bord
  ecriture.ts             traitement d'une demande d'écriture, clarification
  ocr.ts                  lecture d'une facture, rapprochement, contrôles
  imports.ts              persistance des brouillons, création de la facture d'achat
  stockage.ts             stockage des pièces, empreinte SHA-256
  voix.ts                 texte prononçable pour la synthèse vocale
  conversations.ts        persistance et mémoire conversationnelle
  session.ts              session courante (Auth.js)
public/voix/              stt-worker.js — Whisper dans un Web Worker
eval/                     jeux d'évaluation (référence, indépendant, validation) et rapports
tests/                    tests unitaires
db/                       schema.sql, seed.sql, roles.sql, README_BD.md
uploads/                  pièces importées — exclu du dépôt
```

Deux fichiers sont centraux : `lib/catalogue.ts` déclare les vues interrogeables,
`lib/actions.ts` déclare les actions d'écriture. Ajouter une entrée à l'un ou l'autre
suffit — le prompt du modèle, la grammaire de sa sortie, la validation des valeurs, les
libellés des réponses et les questions de clarification en découlent.

---

## Sécurité

- **Aucun SQL généré par le modèle.** Il remplit une spécification dont la grammaire,
  construite pour son rôle, n'admet que les vues et colonnes autorisées.
- **Valeurs vérifiées par type** avant la base : une date doit être une date, un
  montant un nombre ; les valeurs partent en paramètres, jamais dans le texte SQL.
- **Rôles vérifiés deux fois**, à la préparation puis à la confirmation, avec le rôle
  de la session courante — jamais celui figé au moment de la demande.
- **Verrouillage** (`SELECT … FOR UPDATE`) : deux clics simultanés ne peuvent pas
  exécuter l'action deux fois.
- **Règles métier contrôlées en transaction** : montant supérieur au reste dû, facture
  déjà soldée, commande déjà facturée.
- **Aucune suppression définitive** : l'action n'existe pas dans le catalogue.
- **Doublons d'import** : trois filets indépendants — empreinte SHA-256 du fichier,
  couple (fournisseur, numéro de facture), contrainte d'unicité en base.
- **Journal d'audit** : utilisateur, rôle, ancienne et nouvelle valeur, source de
  l'opération.
- **Deux comptes PostgreSQL distincts** : les lectures passent par un compte en
  lecture seule qui ne peut techniquement pas modifier de données.

---

## Tests

```bash
npm test
```

247 tests couvrent la normalisation des valeurs (dont les valeurs codées des filtres), la validation des actions et des
requêtes, les périodes, la résolution des entités, la grammaire de sortie par rôle, la
rédaction des réponses, les graphiques, les indicateurs du tableau de bord, l'extraction
OCR, la préparation du texte pour la voix et ce que chaque rôle reçoit des détails techniques. Cinq d'entre eux sont des tests de
propriété appliqués à toutes les vues du catalogue : aucun nombre absent des données,
aucune condition non demandée, accord singulier/pluriel.

---

## Évaluation de la compréhension

Les tests unitaires vérifient le code ; ils ne disent rien de la compréhension du
modèle. Trois jeux de questions y répondent, chacun avec la spécification attendue —
type de demande, vue, filtres exacts, agrégat, regroupement, tri, dates — et toutes les
interprétations légitimes quand une question en admet plusieurs.

| Jeu | Questions | Rôle |
|---|---|---|
| `eval/jeu.ts` — référence | 64 | a servi à **mettre au point** le prompt : score flatteur par construction |
| `eval/jeu-independant.ts` — indépendant n° 1 | 108 | figé avant exécution ; a ensuite servi à **diagnostiquer** des régressions |
| `eval/jeu-validation-2.ts` — validation n° 2 | 82 | figé **avant** la correction de ces régressions et lancé une seule fois après : **la mesure honnête** |

Chaque jeu couvre tout le périmètre — chaque vue, chaque rôle, chaque action, calculs,
regroupements, tris, dates, conversations en plusieurs messages, refus, fautes de frappe
et langage oral. L'historique Git montre que les jeux indépendants ont été commités avant
d'être exécutés.

```bash
npx vitest run --config vitest.eval.config.ts                                  # jeu de référence
EVAL_JEU=independant npx vitest run --config vitest.eval.config.ts              # jeu indépendant n° 1
EVAL_JEU=validation2 npx vitest run --config vitest.eval.config.ts              # jeu de validation n° 2
```

Chaque exécution écrit un rapport dans `eval/resultats/` après chaque question : score
global, score par famille, latence, et pour chaque échec ce que le système a compris. Le
lanceur s'exécute aussi sur la version de départ du projet, ce qui permet de comparer les
versions sur les mêmes questions.

### Résultats — `qwen3.5:9b` local, température 0

| | Départ (`d60aaf0`) | Avant correction des régressions | Version actuelle |
|---|---|---|---|
| **Validation n° 2** (mesure honnête) | 47 / 82 — 57,3 % | 53 / 82 — 64,6 % | **69 / 82 — 84,1 %** |
| Indépendant n° 1 (a servi au diagnostic) | 73 / 108 — 67,6 % | 81 / 108 — 75,0 % | 99 / 108 — 91,7 % |
| Référence (a servi à la mise au point) | 37 / 50 — 74 % | 64 / 64 — 100 % | 63 / 64 — 98,4 % |
| Latence médiane | 1,7 à 1,8 s | 1,2 s | 1,2 s |

**Ce que le jeu indépendant a appris.** Après la première série d'améliorations, le jeu de
référence affichait 100 % ; le jeu indépendant n° 1, écrit sans regarder ces
améliorations, n'en montrait que 75 % — et révélait que la réécriture du prompt avait fait
**régresser** des familles entières par rapport à la version de départ : les regroupements
et classements (de 7/10 à 2/10), le suivi de conversation (de 6/7 à 3/7), les valeurs de
statut (« livrée » au lieu de `DELIVERED`). Un score de mise au point ne mesure pas la
généralisation ; un jeu indépendant, si.

**Ce qui a été corrigé, en termes généraux.** Le catalogue déclare désormais les valeurs
codées de chaque colonne et leurs libellés français ; le modèle les voit, et le code
ramène au code exact une valeur écrite en français. Le prompt explique les regroupements,
les tris et le suivi des résultats précédents. Les exemples ajoutés ne reprennent aucune
question du jeu de validation n° 2.

**Ce qui reste faible** (13 échecs sur 82 en validation) : les classements du type « quel
est notre meilleur client », certaines conversations en plusieurs messages (« uniquement
les impayées », « que contient-elle ? »), une commande SQL brute classée comme demande
d'écriture au lieu d'être refusée — sans conséquence, puisque le modèle ne produit jamais
de SQL et qu'aucune écriture n'a lieu sans confirmation — et l'ajout d'un fournisseur,
action inexistante, proposé comme ajout de client — la carte de confirmation le montre
avant toute écriture.

**Comparaison avec un modèle distant.** Sur les 40 questions du jeu de référence mesurées
avec `gemini-3.5-flash` (offre gratuite limitée à 20 requêtes par jour et par modèle ;
mesure du 5 octobre, sur la version de l'époque) :

| | Score | Latence médiane |
|---|---|---|
| `qwen3.5:9b` local, version de départ | 30 / 40 | 2,5 s |
| `qwen3.5:9b` local, version actuelle | 39 / 40 | 1,2 s |
| `gemini-3.5-flash` distant | 40 / 40 | 4,4 s |

```bash
EVAL_REPRISE=eval/resultats/2026-10-05-00-50-gemini-3.5-flash.json LLM_FORCE=gemini GEMINI_MODEL=gemini-3.5-flash npx vitest run --config vitest.eval.config.ts
```

---

## État d'avancement

| Fonctionnalité | État |
|---|---|
| Interrogation en langage naturel, dates et périodes | terminé |
| Contrôle des rôles et des permissions | terminé |
| Mémoire conversationnelle et historique | terminé |
| Authentification (Auth.js) | terminé |
| Création et modification de données | terminé |
| Import de factures fournisseurs par OCR (image, PDF, timbre fiscal) | terminé |
| Dictée et lecture vocales | terminé |
| Transparence : étapes en direct, « Comment j'ai compris », graphiques | terminé |
| Tableau de bord | terminé |
| Jeu d'évaluation de la compréhension | terminé |

---

## Limites connues

- Le brouillon d'import ne peut pas être corrigé à l'écran. Une incohérence détectée
  bloque l'enregistrement et impose un rejet.
- Un PDF importé est conservé sous forme d'image (la page rendue), pas dans son format
  d'origine.
- Une date écrite sans année (« depuis le 3 mars ») est lue dans l'année en cours.
- La reconnaissance vocale `whisper-base` peut écorcher un nom propre rare ; le texte
  reconnu est toujours présenté pour relecture avant envoi. `whisper-small` est plus
  précis, au prix d'un téléchargement plus lourd (~250 Mo).
- Le secours Gemini, avec une clé gratuite, est limité à quelques dizaines de questions
  par jour : Ollama reste le moteur principal.
- Certaines formulations indirectes demandent au modèle de relier deux fragments
  éloignés d'une même phrase. Un modèle plus grand y parvient plus souvent, sans
  garantie : c'est la raison même du déplacement du travail vers le code.

---

## Remarques

Le modèle tourne **en local** via Ollama : les données ERP ne sortent pas de la
machine. Gemini n'intervient qu'en secours si Ollama est indisponible, et peut être
désactivé en laissant `GEMINI_API_KEY` vide.

Le premier appel après le démarrage d'Ollama est lent — le modèle est chargé en
mémoire — les suivants prennent une à deux secondes. La lecture d'une facture demande
une vingtaine de secondes.

Les fichiers importés sont stockés dans `uploads/`, hors des dossiers servis
publiquement. Ce dossier est exclu du dépôt.
