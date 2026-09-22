# POINTAGE

Application de pointage pour les chantiers SP2E.

## Architecture

| | Où | Quoi |
|---|---|---|
| **Front** | `index.html` à la racine | page unique, servie par GitHub Pages sur https://imad-archbtp.github.io/POINTAGE/ |
| **Serveur** | `worker/` | Cloudflare Worker `pointage` — https://pointage.imad94mail.workers.dev/ |
| **Base** | Cloudflare D1 `sp2e-pointage` | tables `ouvriers`, `chantiers`, `pointages` (schéma dans `worker/migrations/`) |
| **Plans** | `plans/<code affaire>/*.pdf` | servis par GitHub Pages comme la page |

Le front et le serveur échangent en JSON : un `POST` avec `{action, ...}`, une réponse `{ok, ...}`.

## Publier une modification

Tout part d'un push sur `main` :

- **Front** : GitHub Pages reconstruit en une minute environ.
- **Serveur** : Cloudflare (Workers Builds) applique les migrations D1 puis déploie le Worker. Réglages dans le tableau de bord Cloudflare, Worker `pointage` → Settings → Builds : dossier racine `worker`, commande de déploiement `npx wrangler d1 migrations apply sp2e-pointage --remote && npx wrangler deploy`.

Pour modifier le schéma de la base : ajouter un fichier `worker/migrations/000N_description.sql`. Il sera appliqué une seule fois, au prochain déploiement.

## Mot de passe administrateur

Secret `MDP_ADMIN` du Worker (Cloudflare → `pointage` → Settings → Variables and Secrets). Il n'est jamais dans le code. Tant qu'il n'est pas défini, l'accès administrateur est refusé.

## Codes d'accès des ouvriers

Jamais stockés en clair : la base ne conserve qu'une empreinte SHA-256 salée. On ne peut donc pas *lire* un code perdu, seulement en définir un nouveau depuis **Administration → Ouvriers → Changer le code**.

## Gérer ouvriers et chantiers

Uniquement depuis l'écran **Administration**. Il n'y a plus de feuille Google à éditer à la main. Retirer un ouvrier ou un chantier ne supprime jamais les pointages déjà saisis.

## Données

D1 conserve 30 jours d'historique (Time Travel) : toute erreur se rattrape depuis le tableau de bord Cloudflare, `sp2e-pointage` → Time Travel. L'export Excel mensuel reste le document de référence pour la paie.

## Ancien serveur (Google Apps Script)

`Code.gs` est conservé à titre d'archive. Le classeur « SP2E - Pointages » et son script restent joignables en secours pendant la période de transition, puis seront désactivés. Ils ne reçoivent plus les nouveaux pointages.
