# POINTAGE

Application de pointage pour les chantiers SP2E.

## Les deux moitiés de l'application

| | Où | Quoi |
|---|---|---|
| **Front** | ce dépôt, `index.html` | page unique, servie par GitHub Pages sur https://imad-archbtp.github.io/POINTAGE/ |
| **Back** | Google Apps Script lié au classeur « SP2E - Pointages » | `Code.gs`, copie de référence conservée ici |
| **Données** | onglets `Ouvriers`, `Chantiers`, `Pointages` du classeur | |
| **Plans** | `plans/<code affaire>/*.pdf` | servis par GitHub Pages comme la page |

`Code.gs` est une **copie** : la version qui tourne réellement est celle collée dans l'éditeur Apps Script. Après toute modification, recopier le fichier des deux côtés.

## Publier une modification

**Front** : pousser sur `main`. GitHub Pages reconstruit en une minute environ.

**Back** : enregistrer dans l'éditeur Apps Script **ne suffit pas**. L'URL `/exec` sert une version figée. Il faut :

> Déployer → Gérer les déploiements → crayon → Version : **Nouvelle version** → Déployer

L'identifiant de déploiement ne change pas, donc l'`API_URL` d'`index.html` reste valable. Sauter cette étape est le piège classique : le code est sauvegardé, mais l'application continue de servir l'ancien.

## Mot de passe administrateur

Il n'est **pas** dans le code. Il est lu dans les propriétés du script :

> Paramètres du projet → Propriétés du script → `MDP_ADMIN`

Tant que la propriété est vide, l'accès administrateur est refusé. C'est volontaire : ce dépôt est public, et un mot de passe écrit dans le code resterait visible dans tout l'historique des versions même après avoir été retiré.

## Ajouter un salarié

Par l'écran **Administration → Ouvriers**. Ne pas éditer le classeur à la main : c'est la saisie manuelle des noms qui a produit des comptes impossibles à retrouver au moment de la connexion.

## Fonctions de maintenance

À exécuter depuis l'éditeur Apps Script, une seule fois, uniquement si besoin :

- `migrer()` — ajoute l'en-tête `notes` en colonne G de `Pointages` et passe les codes d'accès en texte
- `reparerDonnees()` — restaure les codes affaire ayant perdu leur zéro de tête (`016` devenu `16`) et les dates converties en date/heure
- `reparerMotsDePasse()` — repasse la colonne des codes en texte sans changer aucune valeur

⚠️ `initialiser()` **efface et recrée les trois onglets**. Réservée à un classeur vierge.
