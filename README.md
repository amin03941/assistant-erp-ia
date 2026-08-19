# Assistant IA pour l'interrogation d'un ERP générique

Application web permettant à un utilisateur authentifié d'interroger une base ERP
fictive en **langage naturel**, avec contrôle des droits et validation des requêtes
côté serveur.

> Projet de stage d'ingénieur — VirtualDev, 2026
> Stagiaire : Mohamed Amin Kharrat

---

## Principe

L'utilisateur pose une question en français. Le modèle de langage ne produit
**jamais de SQL** : il renvoie une *spécification JSON* que le backend valide
contre une liste blanche de vues et de colonnes avant de construire la requête
lui-même.

```
Question  →  LLM  →  spécification JSON  →  validation  →  SQL  →  PostgreSQL
                                                ↓
                                        refus motivé si hors périmètre
```

Trois garanties en découlent :

- le compte PostgreSQL utilisé pour les lectures n'a de droits que sur les vues ;
- toute colonne absente du catalogue est inaccessible, quelle que soit la question ;
- la phrase de réponse est construite par le backend à partir des lignes
  réellement retournées, jamais rédigée librement par le modèle.

---

## Prérequis

| Outil | Version |
|---|---|
| Node.js | 20 ou plus |
| PostgreSQL | 16 ou plus |
| [Ollama](https://ollama.com/download) | version récente |

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

`schema.sql` crée 18 tables et 15 vues. `seed.sql` insère le jeu de données
fictif ; il commence par un `TRUNCATE` et peut donc être rejoué. `roles.sql` crée
les deux rôles applicatifs — **modifier les mots de passe qu'il contient**.

### 3. Modèle local

```bash
ollama pull qwen3.5:9b
```

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
| `responsable@integrasys.tn` | MANAGER | toutes les données métier |
| `comptable@integrasys.tn` | ACCOUNTANT | factures et paiements |
| `commercial@integrasys.tn` | SALES | clients, produits, commandes |
| `admin@integrasys.tn` | ADMIN | administration, sans accès métier |

> Comptes de développement uniquement. À supprimer avant toute mise en ligne.

---

## Structure

```
app/
  api/chat/          traitement d'une question, de bout en bout
  api/conversations/ liste et relecture des conversations
  chat/              interface principale
  login/             page de connexion
components/          barre latérale, historique, zone de discussion
lib/
  catalogue.ts       vues, colonnes et rôles autorisés — liste blanche
  llm.ts             appel du modèle, cascade Ollama → Gemini
  validateur.ts      vérification de la spécification, construction du SQL
  synthese.ts        rédaction déterministe de la réponse
  conversations.ts   persistance et mémoire conversationnelle
  session.ts         session courante (Auth.js)
db/                  schema.sql, seed.sql, roles.sql, README_BD.md
auth.ts              configuration Auth.js
proxy.ts             redirection des routes non authentifiées
```

Le fichier central est `lib/catalogue.ts` : ajouter une vue au catalogue suffit à
la rendre interrogeable, et les tests s'y appliquent automatiquement.

---

## Tests

```bash
npm test
```

Douze tests couvrent la rédaction des réponses, dont cinq tests de propriété
appliqués à toutes les vues du catalogue : aucun nombre absent des données,
aucune condition non demandée, accord singulier/pluriel.

---

## État d'avancement

| Fonctionnalité | État |
|---|---|
| Interrogation en langage naturel | terminé |
| Contrôle des rôles et des permissions | terminé |
| Mémoire conversationnelle et historique | terminé |
| Authentification (Auth.js) | terminé |
| Création et modification de données | à venir |
| Import de factures par OCR | à venir |

---

## Remarques

Le modèle tourne **en local** via Ollama : les données ERP ne sortent pas de la
machine. Gemini n'intervient qu'en secours si Ollama est indisponible, et peut
être désactivé en laissant `GEMINI_API_KEY` vide.

Le premier appel après le démarrage d'Ollama est lent (chargement du modèle en
mémoire), les suivants prennent quelques secondes.