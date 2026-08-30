# Assistant IA pour l'interrogation d'un ERP générique

Application web permettant à un utilisateur authentifié d'interroger une base ERP
fictive en **langage naturel**, d'y créer ou modifier des données, et d'importer des
factures fournisseurs par lecture automatique — avec contrôle des droits et
validation côté serveur à chaque étape.

> Projet de stage d'ingénieur — VirtualDev, 2026
> Stagiaire : Mohamed Amin Kharrat

---

## Principe

Une seule règle gouverne l'implémentation : **le modèle repère, le code décide.**

| | Rôle |
|---|---|
| Le modèle de langue | comprend la phrase, repère où se trouve chaque information |
| Le code | normalise, résout les références en base, contrôle les droits, exécute |

Le modèle ne produit jamais de SQL, ni de nom de table, ni de nom de colonne. Il
renvoie une spécification JSON ou un code d'action pris dans une liste fermée. Tout
le reste — convertir « 1 200,500 » en nombre, traduire « par chèque » en `CHECK`,
retrouver une facture à partir d'un nom de client — est fait par du code
déterministe et testable.

### Consultation

```
Question  →  LLM  →  spécification JSON  →  validation  →  SQL  →  PostgreSQL
                                                ↓
                                        refus motivé si hors périmètre
```

Trois garanties en découlent :

- le compte PostgreSQL utilisé pour les lectures n'a de droits que sur les vues ;
- toute colonne absente du catalogue est inaccessible, quelle que soit la question ;
- la phrase de réponse est construite par le backend à partir des lignes réellement
  retournées, jamais rédigée librement par le modèle.

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
convertis puis vérifiés — HT + TVA doit faire TTC, la somme des lignes doit faire le
HT, quantité × prix unitaire doit faire chaque total. Le fournisseur est retrouvé par
son **matricule fiscal**, une clé exacte que le modèle lit mieux qu'un nom propre.

Un brouillon est présenté à l'utilisateur ; la facture d'achat et ses lignes ne sont
créées qu'après validation, en une seule transaction.

Formats acceptés : PNG et JPEG, 10 Mo maximum.

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
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=qwen3.5:9b
AUTH_SECRET=               # générer avec : npx auth secret
```

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
| `responsable@integrasys.tn` | MANAGER | toutes les données métier, toutes les actions |
| `comptable@integrasys.tn` | ACCOUNTANT | factures, paiements, import OCR |
| `commercial@integrasys.tn` | SALES | clients, produits, commandes |
| `admin@integrasys.tn` | ADMIN | administration, sans accès métier |

> Comptes de développement uniquement. À supprimer avant toute mise en ligne.

---

## Utilisation

### Consultation

```
Quel est le montant total des factures impayées ?
Quelles sont les factures impayées de Medina Textile ?
Seulement celles en retard
Quelles commandes sont en retard ?
```

La conversation garde le contexte : le second tour affine le premier sans répéter le
client.

### Création et modification

```
Ajoute un client nommé Société Horizon Tech avec un délai de paiement de 45 jours
Modifie le téléphone du client Epsilon Services en 71 111 222
Facture la commande CMD-2026-0002
Enregistre un paiement de 500 dinars par virement pour Gamma SARL
```

La dernière demande ne désigne pas de facture précise : le système propose les
factures ouvertes du client, avec leur reste à payer, sous forme de choix cliquables.

### Import d'une facture

Le bouton « Importer facture (OCR) » ouvre le sélecteur de fichier. La lecture prend
une dizaine de secondes, puis un brouillon s'affiche avec le fournisseur identifié,
les montants et les lignes rapprochées du catalogue produits.

---

## Structure

```
app/
  api/chat/             traitement d'une question, de bout en bout
  api/actions/confirm/  confirmation d'une action d'écriture
  api/import/           téléversement et lecture d'une facture
  api/import/confirm/   création de la facture d'achat
  api/conversations/    liste et relecture des conversations
  chat/                 interface principale
  login/                page de connexion
components/
  chat-area.tsx         zone de discussion
  carte-action.tsx      confirmation d'une action d'écriture
  carte-import.tsx      brouillon d'une facture importée
  sidebar.tsx           barre latérale et historique
lib/
  catalogue.ts          vues, colonnes et rôles autorisés — liste blanche
  actions.ts            catalogue des actions d'écriture — champs, rôles, cibles
  ecriture.ts           traitement d'une demande d'écriture, clarification
  ocr.ts                lecture d'une facture, rapprochement, contrôles
  imports.ts            persistance des brouillons, création de la facture d'achat
  stockage.ts           stockage des pièces, empreinte SHA-256
  llm.ts                appel du modèle, cascade Ollama → Gemini
  validateur.ts         vérification de la spécification, construction du SQL
  synthese.ts           rédaction déterministe de la réponse
  entites.ts            résolution des filtres et report du sujet
  conversations.ts      persistance et mémoire conversationnelle
  session.ts            session courante (Auth.js)
db/                     schema.sql, seed.sql, roles.sql, README_BD.md
uploads/                pièces importées — exclu du dépôt
auth.ts                 configuration Auth.js
proxy.ts                redirection des routes non authentifiées
```

Deux fichiers sont centraux : `lib/catalogue.ts` déclare les vues interrogeables,
`lib/actions.ts` déclare les actions d'écriture. Ajouter une entrée à l'un ou l'autre
suffit — le prompt du modèle, le schéma de sa sortie, la validation des valeurs et les
questions de clarification en découlent.

---

## Sécurité

- **Aucun SQL généré par le modèle.** Il choisit dans une liste fermée ; le décodage
  contraint d'Ollama rend un code inventé mécaniquement impossible.
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

118 tests couvrent la normalisation des valeurs, la validation des actions, la
construction des requêtes, la rédaction des réponses et l'extraction OCR. Cinq d'entre
eux sont des tests de propriété appliqués à toutes les vues du catalogue : aucun
nombre absent des données, aucune condition non demandée, accord singulier/pluriel.

---

## État d'avancement

| Fonctionnalité | État |
|---|---|
| Interrogation en langage naturel | terminé |
| Contrôle des rôles et des permissions | terminé |
| Mémoire conversationnelle et historique | terminé |
| Authentification (Auth.js) | terminé |
| Création et modification de données | terminé |
| Import de factures fournisseurs par OCR | terminé |

---

## Limites connues

- Le report du sujet fonctionne à l'intérieur d'une même vue, pas d'une vue à l'autre :
  après « les factures de X », la demande « et ses commandes » reste sur les factures.
- Le brouillon d'import ne peut pas être corrigé à l'écran. Une incohérence détectée
  bloque l'enregistrement et impose un rejet.
- L'import accepte les images PNG et JPEG. Le PDF demanderait une conversion préalable
  en image, prévue mais non implémentée.
- Le timbre fiscal, fréquent sur les factures tunisiennes, rompt l'égalité
  HT + TVA = TTC et déclencherait une anomalie.
- Certaines formulations indirectes demandent au modèle de relier deux fragments
  éloignés d'une même phrase. Un modèle plus grand y parvient plus souvent, sans
  garantie : c'est la raison même du déplacement du travail vers le code.

---

## Remarques

Le modèle tourne **en local** via Ollama : les données ERP ne sortent pas de la
machine. Gemini n'intervient qu'en secours si Ollama est indisponible, et peut être
désactivé en laissant `GEMINI_API_KEY` vide.

Le premier appel après le démarrage d'Ollama est lent — le modèle est chargé en
mémoire — les suivants prennent quelques secondes. La lecture d'une facture demande
une dizaine de secondes.

Les fichiers importés sont stockés dans `uploads/`, hors des dossiers servis
publiquement. Ce dossier est exclu du dépôt.