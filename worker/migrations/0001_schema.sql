-- SP2E - Pointage chantier : schema de la base D1.
-- Reprend les trois onglets du classeur Google (Ouvriers, Chantiers, Pointages).

CREATE TABLE IF NOT EXISTS ouvriers (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  nom       TEXT    NOT NULL,              -- orthographe affichee
  cle       TEXT    NOT NULL UNIQUE,       -- nom normalise (minuscules, sans accent ni ponctuation)
  sel       TEXT    NOT NULL,              -- aleatoire, propre a chaque ouvrier
  empreinte TEXT    NOT NULL,              -- SHA-256(sel + ':' + code) : le code n'est jamais stocke en clair
  actif     INTEGER NOT NULL DEFAULT 1     -- 0 = acces retire, l'historique de pointage est conserve
);

CREATE TABLE IF NOT EXISTS chantiers (
  code  TEXT PRIMARY KEY,                  -- code affaire, toujours en texte : "016" reste "016"
  nom   TEXT NOT NULL,
  plans TEXT NOT NULL DEFAULT ''           -- noms de fichiers PDF separes par des virgules, servis depuis /plans/<code>/
);

CREATE TABLE IF NOT EXISTS pointages (
  id          TEXT PRIMARY KEY,            -- identifiants existants repris tels quels
  date        TEXT NOT NULL,               -- AAAA-MM-JJ, en texte : jamais converti en date/heure
  ouvrier     TEXT NOT NULL,               -- orthographe au moment de la saisie
  ouvrier_cle TEXT NOT NULL,               -- pour regrouper "Nadeem" et "nadeem" sur la meme personne
  code        TEXT NOT NULL,
  chantier    TEXT NOT NULL,               -- nom du chantier copie a la saisie : l'historique survit a une suppression de chantier
  heures      REAL NOT NULL,
  notes       TEXT NOT NULL DEFAULT '',
  cree_le     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pointages_ouvrier ON pointages (ouvrier_cle, date);
CREATE INDEX IF NOT EXISTS idx_pointages_date    ON pointages (date);
