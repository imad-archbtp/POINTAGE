/**
 * SP2E - Pointage chantier : serveur Cloudflare Worker + base D1.
 *
 * Remplace le Google Apps Script (Code.gs) en conservant STRICTEMENT le meme
 * contrat JSON : index.html n'a change que d'adresse. Chaque requete est un POST
 * avec {action, ...} et recoit {ok, ...}.
 *
 * Pourquoi ce remplacement : Apps Script repondait entre 2 et 34 secondes pour la
 * meme lecture, de facon imprevisible. Un Worker repond en quelques dizaines de
 * millisecondes, sans demarrage a froid.
 *
 * Secret attendu : MDP_ADMIN (Parametres > Variables et secrets).
 */

const ENTETES_CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

export default {
  async fetch(requete, env) {
    if (requete.method === 'OPTIONS') return new Response(null, { status: 204, headers: ENTETES_CORS });
    if (requete.method === 'GET') return new Response('SP2E Pointage - serveur actif', { headers: { ...ENTETES_CORS, 'Content-Type': 'text/plain; charset=utf-8' } });
    if (requete.method !== 'POST') return reponse({ ok: false, erreur: 'Methode non autorisee.' }, 405);

    let d;
    try { d = await requete.json(); }
    catch (e) { return reponse({ ok: false, erreur: 'Requete illisible.' }, 400); }
    if (!d || typeof d !== 'object') return reponse({ ok: false, erreur: 'Requete illisible.' }, 400);

    try {
      return reponse(await traiter(d, env));
    } catch (e) {
      console.error('Erreur serveur', e);
      return reponse({ ok: false, erreur: 'Erreur serveur : ' + (e && e.message ? e.message : String(e)) }, 500);
    }
  },
};

/* ---------- Aiguillage ---------- */

async function traiter(d, env) {
  switch (d.action) {

    /* Prenoms pour le menu deroulant de connexion. Aucun code d'acces. */
    case 'ouvriers':
      return { ok: true, ouvriers: await nomsOuvriers(env) };

    case 'login': {
      const o = await verifier(env, d.nom, d.mdp);
      if (!o) return { ok: false, erreur: 'Nom ou code incorrect.' };
      return { ok: true, nom: o.nom, chantiers: await lireChantiers(env), pointages: await pointagesDe(env, o.cle) };
    }

    case 'loginAdmin': {
      if (!env.MDP_ADMIN) return { ok: false, erreur: 'Acces administrateur non configure : definissez le secret MDP_ADMIN dans Cloudflare.' };
      if (!egalSur(String(d.mdp == null ? '' : d.mdp).trim(), env.MDP_ADMIN)) return { ok: false, erreur: 'Mot de passe administrateur incorrect.' };
      return { ok: true, chantiers: await lireChantiers(env), ouvriers: await nomsOuvriers(env) };
    }

    case 'mes': {
      const u = await verifier(env, d.nom, d.mdp);
      if (!u) return { ok: false, erreur: 'Session expiree.' };
      return { ok: true, pointages: await pointagesDe(env, u.cle) };
    }

    case 'ajouter': {
      const u = await verifier(env, d.nom, d.mdp);
      if (!u) return { ok: false, erreur: 'Session expiree.' };
      const h = Number(d.heures);
      if (!(h > 0) || h > 24) return { ok: false, erreur: "Nombre d'heures invalide." };
      const date = texteDate(d.date);
      if (!date) return { ok: false, erreur: 'Date invalide.' };
      const ch = await env.DB.prepare('SELECT code, nom FROM chantiers WHERE code = ?').bind(texteCode(d.code)).first();
      if (!ch) return { ok: false, erreur: 'Chantier inconnu.' };
      const id = nouvelId();
      const note = texteNote(d.notes);
      await env.DB.prepare(
        'INSERT INTO pointages (id, date, ouvrier, ouvrier_cle, code, chantier, heures, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(id, date, u.nom, u.cle, ch.code, ch.nom, h, note).run();
      /* La ligne creee est renvoyee : l'application l'affiche sans recharger. */
      return { ok: true, id, ligne: { id, date, ouvrier: u.nom, code: ch.code, chantier: ch.nom, heures: h, notes: note } };
    }

    /* Note du jour, posee sur toutes les lignes deja pointees ce jour-la. */
    case 'noterJour': {
      const u = await verifier(env, d.nom, d.mdp);
      if (!u) return { ok: false, erreur: 'Session expiree.' };
      const date = texteDate(d.date);
      if (!date) return { ok: false, erreur: 'Date invalide.' };
      const r = await env.DB.prepare('UPDATE pointages SET notes = ? WHERE ouvrier_cle = ? AND date = ?')
        .bind(texteNote(d.notes), u.cle, date).run();
      const n = r.meta ? r.meta.changes : 0;
      if (!n) return { ok: false, erreur: "Saisissez d'abord vos heures du jour, puis validez la note." };
      return { ok: true, lignes: n };
    }

    case 'supprimer': {
      const admin = estAdmin(d, env);
      const u = admin ? null : await verifier(env, d.nom, d.mdp);
      if (!admin && !u) return { ok: false, erreur: 'Session expiree.' };
      const id = String(d.id == null ? '' : d.id);
      const ligne = await env.DB.prepare('SELECT ouvrier_cle FROM pointages WHERE id = ?').bind(id).first();
      if (!ligne) return { ok: false, erreur: 'Ligne introuvable.' };
      if (!admin && ligne.ouvrier_cle !== u.cle) return { ok: false, erreur: 'Ligne non autorisee.' };
      await env.DB.prepare('DELETE FROM pointages WHERE id = ?').bind(id).run();
      return { ok: true };
    }

    case 'tous': {
      if (!estAdmin(d, env)) return { ok: false, erreur: 'Acces refuse.' };
      const { results } = await env.DB.prepare(
        'SELECT id, date, ouvrier, code, chantier, heures, notes FROM pointages ORDER BY date DESC, id DESC'
      ).all();
      return { ok: true, pointages: results, ouvriers: await nomsOuvriers(env) };
    }

    /* ---------- Gestion des ouvriers (reserve a l'admin) ---------- */

    case 'ajouterOuvrier': {
      if (!estAdmin(d, env)) return { ok: false, erreur: 'Acces refuse.' };
      const nom = String(d.nouveauNom == null ? '' : d.nouveauNom).trim();
      const code = String(d.nouveauMdp == null ? '' : d.nouveauMdp).trim();
      if (!nom) return { ok: false, erreur: 'Le nom est obligatoire.' };
      if (code.length < 4) return { ok: false, erreur: "Le code d'acces doit faire au moins 4 caracteres." };
      const cle = normNom(nom);
      if (!cle) return { ok: false, erreur: 'Le nom doit contenir au moins une lettre ou un chiffre.' };
      const existant = await env.DB.prepare('SELECT id, actif FROM ouvriers WHERE cle = ?').bind(cle).first();
      if (existant && existant.actif) return { ok: false, erreur: 'Un ouvrier porte deja ce nom.' };
      const sel = nouveauSel();
      const emp = await empreinte(sel, code);
      if (existant) {
        /* Ouvrier retire puis reintegre : on reactive sa fiche, l'historique le retrouve. */
        await env.DB.prepare('UPDATE ouvriers SET nom = ?, sel = ?, empreinte = ?, actif = 1 WHERE id = ?')
          .bind(nom, sel, emp, existant.id).run();
      } else {
        await env.DB.prepare('INSERT INTO ouvriers (nom, cle, sel, empreinte, actif) VALUES (?, ?, ?, ?, 1)')
          .bind(nom, cle, sel, emp).run();
      }
      return { ok: true, ouvriers: await nomsOuvriers(env) };
    }

    case 'changerMdpOuvrier': {
      if (!estAdmin(d, env)) return { ok: false, erreur: 'Acces refuse.' };
      const code = String(d.nouveauMdp == null ? '' : d.nouveauMdp).trim();
      if (code.length < 4) return { ok: false, erreur: "Le code d'acces doit faire au moins 4 caracteres." };
      const sel = nouveauSel();
      const r = await env.DB.prepare('UPDATE ouvriers SET sel = ?, empreinte = ? WHERE cle = ? AND actif = 1')
        .bind(sel, await empreinte(sel, code), normNom(d.nouveauNom)).run();
      if (!(r.meta && r.meta.changes)) return { ok: false, erreur: 'Ouvrier introuvable.' };
      return { ok: true, ouvriers: await nomsOuvriers(env) };
    }

    case 'supprimerOuvrier': {
      if (!estAdmin(d, env)) return { ok: false, erreur: 'Acces refuse.' };
      /* Retrait d'acces, pas d'effacement : les pointages et la fiche restent. */
      const r = await env.DB.prepare('UPDATE ouvriers SET actif = 0 WHERE cle = ? AND actif = 1')
        .bind(normNom(d.nouveauNom)).run();
      if (!(r.meta && r.meta.changes)) return { ok: false, erreur: 'Ouvrier introuvable.' };
      return { ok: true, ouvriers: await nomsOuvriers(env) };
    }

    /* ---------- Gestion des chantiers (reserve a l'admin) ----------
       Avant, les chantiers s'editaient a la main dans le classeur Google.
       Il n'y a plus de classeur : on les gere ici. */

    case 'enregistrerChantier': {
      if (!estAdmin(d, env)) return { ok: false, erreur: 'Acces refuse.' };
      const code = texteCode(d.code);
      const nom = String(d.nom == null ? '' : d.nom).trim();
      if (!/^[0-9A-Za-z-]{1,10}$/.test(code)) return { ok: false, erreur: 'Code affaire invalide (chiffres ou lettres, 10 maximum).' };
      if (!nom) return { ok: false, erreur: 'Le nom du chantier est obligatoire.' };
      const plans = String(d.plans == null ? '' : d.plans).split(',').map(s => s.trim()).filter(Boolean).join(', ');
      await env.DB.prepare(
        'INSERT INTO chantiers (code, nom, plans) VALUES (?, ?, ?) ON CONFLICT(code) DO UPDATE SET nom = excluded.nom, plans = excluded.plans'
      ).bind(code, nom, plans).run();
      return { ok: true, chantiers: await lireChantiers(env) };
    }

    case 'supprimerChantier': {
      if (!estAdmin(d, env)) return { ok: false, erreur: 'Acces refuse.' };
      /* Les pointages gardent le nom du chantier copie a la saisie : l'historique survit. */
      const r = await env.DB.prepare('DELETE FROM chantiers WHERE code = ?').bind(texteCode(d.code)).run();
      if (!(r.meta && r.meta.changes)) return { ok: false, erreur: 'Chantier introuvable.' };
      return { ok: true, chantiers: await lireChantiers(env) };
    }

    default:
      return { ok: false, erreur: 'Action inconnue.' };
  }
}

/* ---------- Acces aux donnees ---------- */

async function nomsOuvriers(env) {
  const { results } = await env.DB.prepare('SELECT nom FROM ouvriers WHERE actif = 1 ORDER BY id').all();
  return results.map(r => r.nom);
}

async function lireChantiers(env) {
  const { results } = await env.DB.prepare('SELECT code, nom, plans FROM chantiers ORDER BY code').all();
  return results.map(c => ({
    code: c.code,
    nom: c.nom,
    plans: String(c.plans || '').split(',').map(s => s.trim()).filter(Boolean),
  }));
}

async function pointagesDe(env, cle) {
  const { results } = await env.DB.prepare(
    'SELECT id, date, ouvrier, code, chantier, heures, notes FROM pointages WHERE ouvrier_cle = ? ORDER BY date, id'
  ).bind(cle).all();
  return results;
}

/**
 * Authentifie un ouvrier. Le code n'est jamais stocke en clair : on compare
 * SHA-256(sel + ':' + code) a l'empreinte enregistree, a temps constant.
 */
async function verifier(env, nom, code) {
  const cle = normNom(nom);
  const saisi = String(code == null ? '' : code).trim();
  if (!cle || !saisi) return null;
  const o = await env.DB.prepare('SELECT nom, cle, sel, empreinte FROM ouvriers WHERE cle = ? AND actif = 1').bind(cle).first();
  if (!o) return null;
  return egalSur(await empreinte(o.sel, saisi), o.empreinte) ? o : null;
}

function estAdmin(d, env) {
  if (!env.MDP_ADMIN) return false;
  return egalSur(String(d.mdpAdmin == null ? '' : d.mdpAdmin).trim(), env.MDP_ADMIN);
}

/* ---------- Utilitaires ---------- */

function reponse(obj, statut) {
  return new Response(JSON.stringify(obj), {
    status: statut || 200,
    headers: { ...ENTETES_CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

/** Meme normalisation que l'ancien serveur : "Yaa-Coub " et "YAACOUB" donnent "yaacoub". */
function normNom(brut) {
  return String(brut == null ? '' : brut)
    .normalize('NFD').replace(/\p{Mn}/gu, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '');
}

function texteCode(brut) {
  if (typeof brut === 'number') return String(brut).padStart(3, '0');
  return String(brut == null ? '' : brut).trim();
}

/** Accepte uniquement AAAA-MM-JJ et verifie que la date existe. */
function texteDate(brut) {
  const s = String(brut == null ? '' : brut).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const dt = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (dt.getUTCFullYear() !== +m[1] || dt.getUTCMonth() !== +m[2] - 1 || dt.getUTCDate() !== +m[3]) return null;
  return s;
}

function texteNote(brut) {
  return String(brut == null ? '' : brut).trim().substring(0, 200);
}

/** Meme forme que les identifiants historiques (horodatage + 3 chiffres), repris tels quels. */
function nouvelId() {
  return String(Date.now()) + String(Math.floor(Math.random() * 1000)).padStart(3, '0');
}

function nouveauSel() {
  const o = new Uint8Array(16);
  crypto.getRandomValues(o);
  return hex(o);
}

async function empreinte(sel, code) {
  const donnees = new TextEncoder().encode(sel + ':' + String(code).trim());
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', donnees)));
}

function hex(octets) {
  let s = '';
  for (const b of octets) s += b.toString(16).padStart(2, '0');
  return s;
}

/** Comparaison a temps constant : la duree ne revele pas a quel caractere ca diverge. */
function egalSur(a, b) {
  const x = new TextEncoder().encode(String(a)), y = new TextEncoder().encode(String(b));
  let r = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) r |= (x[i] || 0) ^ (y[i] || 0);
  return r === 0;
}
