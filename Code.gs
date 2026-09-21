/**
 * SP2E - Pointage chantier : serveur (Google Apps Script)
 * A coller dans Extensions > Apps Script du Google Sheet.
 *
 * Le classeur doit contenir 3 onglets : Ouvriers, Chantiers, Pointages
 * (la fonction initialiser() les cree automatiquement).
 */

/**
 * Le mot de passe administrateur n'est PLUS ecrit dans ce fichier : il est lu dans
 * les proprietes du script (Parametres du projet > Proprietes du script > MDP_ADMIN).
 * Deux raisons : ce fichier est publie sur GitHub, et un mot de passe en clair dans
 * du code reste visible dans tout l'historique des versions, meme apres correction.
 * Tant que la propriete n'est pas renseignee, l'acces administrateur est refuse.
 */
function mdpAdminAttendu() {
  var v = PropertiesService.getScriptProperties().getProperty('MDP_ADMIN');
  return v === null ? '' : String(v).trim();
}

function initialiser() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var o = ss.getSheetByName('Ouvriers') || ss.insertSheet('Ouvriers');
  o.clear();
  o.getRange('C:C').setNumberFormat('@'); // empeche Sheets de transformer '0123' en 123
  o.getRange(1, 1, 8, 3).setValues([
    ['id', 'nom', 'mdp'],
    [1, 'Nadeem', '1234'],
    [2, 'Moujibullah', '1234'],
    [3, 'Rock', '1234'],
    [4, 'Yaya', '1234'],
    [5, 'Bogdan', '1234'],
    [6, 'Yaacoub', '1234'],
    [7, 'Sardasayed', '1234']
  ]);
  o.getRange(1, 1, 1, 3).setFontWeight('bold');

  var c = ss.getSheetByName('Chantiers') || ss.insertSheet('Chantiers');
  c.clear();
  c.getRange('A:A').setNumberFormat('@'); // empeche Sheets de transformer "016" en 16
  c.getRange(1, 1, 5, 3).setValues([
    ['code', 'nom', 'plans'],
    ['016', 'Paris 15', 'Plan_Detail.pdf, Facade.pdf'],
    ['011', 'Evry', 'Plan_Fondations.pdf, Toiture.pdf'],
    ['033', 'P10', 'Plan_P10.pdf, Electricite.pdf'],
    ['043', 'Gonesse', 'Plan_Gonesse.pdf, Cloisons.pdf']
  ]);
  c.getRange(1, 1, 1, 3).setFontWeight('bold');

  var p = ss.getSheetByName('Pointages') || ss.insertSheet('Pointages');
  p.clear();
  p.getRange('B:B').setNumberFormat('@'); // empeche Sheets de transformer la date en date/heure
  p.getRange(1, 1, 1, 7).setValues([['id', 'date', 'ouvrier', 'code', 'chantier', 'heures', 'notes']]);
  p.getRange(1, 1, 1, 7).setFontWeight('bold');
  p.setFrozenRows(1);

  var f = ss.getSheetByName('Feuille 1') || ss.getSheetByName('Sheet1');
  if (f && ss.getSheets().length > 3) ss.deleteSheet(f);
}

/**
 * A executer UNE FOIS (menu Executer > reparerDonnees) si des codes chantier ont perdu
 * leur zero de tete (016 devenu 16) ou si des dates de pointage ont ete converties en
 * date/heure au lieu de rester du texte. Ne supprime aucune donnee, corrige juste le format.
 */
function reparerDonnees() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var c = ss.getSheetByName('Chantiers');
  if (c) {
    var vc = c.getDataRange().getValues();
    c.getRange('A:A').setNumberFormat('@');
    for (var i = 1; i < vc.length; i++) {
      if (vc[i][0] === '') continue;
      if (typeof vc[i][0] === 'number') {
        c.getRange(i + 1, 1).setValue(texteCode(vc[i][0]));
      }
    }
  }

  var p = ss.getSheetByName('Pointages');
  if (p) {
    var vp = p.getDataRange().getValues();
    p.getRange('B:B').setNumberFormat('@');
    for (var j = 1; j < vp.length; j++) {
      if (vp[j][0] === '') continue;
      if (Object.prototype.toString.call(vp[j][1]) === '[object Date]') {
        p.getRange(j + 1, 2).setValue(texteDate(vp[j][1]));
      }
    }
  }

  return 'Reparation terminee.';
}

/**
 * A executer UNE FOIS (menu Executer > reparerMotsDePasse).
 * Sheets stocke les codes a 4 chiffres comme des NOMBRES : tant qu'il n'y a pas de zero
 * de tete ca fonctionne, mais un code '0123' deviendrait 123 et l'ouvrier ne pourrait
 * plus se connecter. Cette fonction passe la colonne mdp en texte et y reecrit les
 * valeurs existantes telles quelles. Aucun code n'est modifie.
 */
function reparerMotsDePasse() {
  var sh = feuille('Ouvriers');
  var v = sh.getDataRange().getValues();
  sh.getRange('C:C').setNumberFormat('@');
  var n = 0;
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][1]).trim() === '') continue;
    sh.getRange(i + 1, 3).setValue(texteMdp(v[i][2]));
    n++;
  }
  return 'Colonne mdp passee en texte : ' + n + ' ligne(s).';
}

/**
 * A executer UNE FOIS (menu Executer > migrer) sur un classeur deja en service.
 * Ne touche a aucune donnee existante :
 *  - ajoute l'en-tete "notes" en colonne G de Pointages (la colonne n'existait pas,
 *    donc les notes saisies par les ouvriers etaient ecrites nulle part) ;
 *  - passe la colonne des codes d'acces en texte.
 */
function migrer() {
  var fait = [];

  var p = feuille('Pointages');
  if (p) {
    var g1 = p.getRange(1, 7);
    if (String(g1.getValue()).trim() === '') {
      g1.setValue('notes');
      g1.setFontWeight('bold');
      fait.push('en-tete "notes" ajoute en G1 de Pointages');
    } else {
      fait.push('en-tete de la colonne G deja present : ' + g1.getValue());
    }
  }

  var o = feuille('Ouvriers');
  if (o) {
    o.getRange('C:C').setNumberFormat('@');
    fait.push('colonne des codes passee en texte');
  }

  return fait.join(' | ');
}

/* ---------- Utilitaires ---------- */

function feuille(nom) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nom);
}

function texteCode(brut) {
  if (typeof brut === 'number') return ('00' + brut).slice(-3);
  return String(brut).trim();
}

function texteDate(brut) {
  if (Object.prototype.toString.call(brut) === '[object Date]') {
    var y = brut.getFullYear(), m = brut.getMonth() + 1, j = brut.getDate();
    return y + '-' + (m < 10 ? '0' : '') + m + '-' + (j < 10 ? '0' : '') + j;
  }
  return String(brut).trim();
}

/* Plage des signes diacritiques combinants (U+0300 a U+036F), construite par
   code de caractere pour garder ce fichier en pur ASCII. */
var RE_ACCENTS = new RegExp('[' + String.fromCharCode(768) + '-' + String.fromCharCode(879) + ']', 'g');

/**
 * Normalise un nom pour la comparaison : minuscules, sans accent, sans espace
 * ni ponctuation. "Yaa-Coub " et "YAACOUB" donnent tous les deux "yaacoub".
 */
function normNom(brut) {
  var s = String(brut == null ? '' : brut);
  if (s.normalize) s = s.normalize('NFD').replace(RE_ACCENTS, '');
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Note du jour : 200 caracteres maximum, comme annonce dans l'interface. */
function texteNote(brut) {
  return String(brut == null ? '' : brut).trim().substring(0, 200);
}

/** Le code d'acces peut arriver de Sheets comme nombre (4607) ou comme texte ('AB12C'). */
function texteMdp(brut) {
  if (typeof brut === 'number') return String(brut);
  return String(brut == null ? '' : brut).trim();
}

/**
 * Compare le code stocke et le code saisi. Tolere le cas ou Sheets a mange un zero
 * de tete ('0123' devenu le nombre 123) : l'ouvrier tape bien le code qu'on lui a donne.
 */
function memeMdp(stocke, saisi) {
  var a = texteMdp(stocke);
  var b = String(saisi == null ? '' : saisi).trim();
  if (a === '') return false;
  if (a === b) return true;
  if (/^[0-9]+$/.test(a) && /^0[0-9]+$/.test(b) && b.length <= 12) {
    return b.replace(/^0+/, '') === a.replace(/^0+/, '');
  }
  return false;
}

/**
 * Lecture bornee a la derniere ligne reellement remplie. getDataRange() inclut
 * les lignes seulement mises en forme : un format Texte applique a une colonne
 * entiere suffit a faire relire des milliers de lignes vides a chaque appel.
 */
function valeurs(nomFeuille, nbColonnes) {
  var sh = feuille(nomFeuille);
  if (!sh) return [];
  var n = sh.getLastRow();
  if (n < 2) return [];
  return sh.getRange(1, 1, n, nbColonnes).getValues();
}

/**
 * Ouvriers et chantiers sont relus a CHAQUE requete, y compris avant chaque
 * saisie d'heures, alors qu'ils ne changent quasiment jamais. Chaque lecture est
 * un aller-retour vers Sheets, et pour une ecriture cela se passe a l'interieur
 * du verrou : c'est ce qui faisait durer une saisie plusieurs secondes et mettait
 * les ouvriers en file d'attente en fin de journee.
 * Le cache est vide des qu'un ouvrier est ajoute, modifie ou retire.
 */
var CACHE_SECONDES = 120;

function litAvecCache(clef, produire) {
  var cache = CacheService.getScriptCache();
  try {
    var brut = cache.get(clef);
    if (brut) return JSON.parse(brut);
  } catch (e) {}
  var valeur = produire();
  try { cache.put(clef, JSON.stringify(valeur), CACHE_SECONDES); } catch (e2) {}
  return valeur;
}

function viderCache() {
  try { CacheService.getScriptCache().removeAll(['ouvriers', 'chantiers']); } catch (e) {}
}

function lireOuvriers() {
  return litAvecCache('ouvriers', lireOuvriersFeuille);
}

function lireOuvriersFeuille() {
  var v = valeurs('Ouvriers', 3);
  var t = [];
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][1]).trim() === '') continue;
    t.push({
      id: Number(v[i][0]) || 0,
      ligne: i + 1,
      nom: String(v[i][1]).trim(),
      mdp: texteMdp(v[i][2])
    });
  }
  return t;
}

function nomsOuvriers() {
  return lireOuvriers().map(function (x) { return x.nom; });
}

function pointagesDe(nom) {
  var tous = lirePointages(), mes = [], c = normNom(nom);
  for (var i = 0; i < tous.length; i++) {
    if (normNom(tous[i].ouvrier) === c) mes.push(tous[i]);
  }
  return mes;
}

function lireChantiers() {
  return litAvecCache('chantiers', lireChantiersFeuille);
}

function lireChantiersFeuille() {
  var v = valeurs('Chantiers', 3);
  var t = [];
  for (var i = 1; i < v.length; i++) {
    if (v[i][0] === '') continue;
    var plans = String(v[i][2] || '').split(',');
    var nets = [];
    for (var j = 0; j < plans.length; j++) {
      var s = plans[j].trim();
      if (s) nets.push(s);
    }
    t.push({ code: texteCode(v[i][0]), nom: String(v[i][1]).trim(), plans: nets });
  }
  return t;
}

function lirePointages() {
  var v = valeurs('Pointages', 7);
  var t = [];
  for (var i = 1; i < v.length; i++) {
    if (v[i][0] === '') continue;
    t.push({
      id: String(v[i][0]),
      date: texteDate(v[i][1]),
      ouvrier: String(v[i][2]),
      code: texteCode(v[i][3]),
      chantier: String(v[i][4]),
      heures: Number(v[i][5]),
      notes: String(v[i][6] == null ? '' : v[i][6])
    });
  }
  return t;
}

function verifier(nom, mdp) {
  var cible = normNom(nom);
  if (!cible) return null;
  var l = lireOuvriers();
  for (var i = 0; i < l.length; i++) {
    if (normNom(l[i].nom) === cible && memeMdp(l[i].mdp, mdp)) return l[i];
  }
  return null;
}

function estAdmin(d) {
  var attendu = mdpAdminAttendu();
  if (attendu === '') return false;   // propriete non renseignee : aucun acces admin
  return String(d.mdpAdmin || '').trim() === attendu;
}

function reponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ---------- Point d'entree ---------- */

/* Seules ces actions modifient le classeur. Les autres ne font que lire.
   Avant, TOUTE requete prenait le verrou exclusif : les consultations se
   serialisaient entre elles, et en fin de journee, quand les equipes pointent
   en meme temps, l'attente cumulee depassait les 30 secondes du navigateur.
   L'ouvrier voyait "le serveur met vraiment trop de temps a repondre" alors que
   le serveur ne faisait qu'attendre son tour. */
var ACTIONS_ECRITURE = {
  ajouter: 1, supprimer: 1, noterJour: 1,
  ajouterOuvrier: 1, changerMdpOuvrier: 1, supprimerOuvrier: 1
};

function doPost(e) {
  var d, a;
  try {
    d = JSON.parse(e.postData.contents);
    a = d.action;
  } catch (errLecture) {
    return reponse({ ok: false, erreur: 'Requete illisible.' });
  }

  if (!ACTIONS_ECRITURE[a]) {
    try {
      return traiter(d, a);
    } catch (errSansVerrou) {
      return reponse({ ok: false, erreur: String(errSansVerrou) });
    }
  }

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    return traiter(d, a);
  } catch (errAvecVerrou) {
    return reponse({ ok: false, erreur: String(errAvecVerrou) });
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}

function traiter(d, a) {
  {
    /* Liste des prenoms, pour alimenter le menu deroulant de la page de connexion.
       Ne renvoie aucun code d'acces. */
    if (a === 'ouvriers') {
      return reponse({ ok: true, ouvriers: nomsOuvriers() });
    }

    if (a === 'login') {
      var o = verifier(d.nom, d.mdp);
      if (!o) return reponse({ ok: false, erreur: 'Nom ou code incorrect.' });
      /* On renvoie les pointages des la connexion : l'ouvrier voyait sa semaine
         apres deux allers-retours, chacun a plusieurs secondes sur un telephone
         en 4G de chantier. */
      return reponse({ ok: true, nom: o.nom, chantiers: lireChantiers(), pointages: pointagesDe(o.nom) });
    }

    if (a === 'loginAdmin') {
      var attenduAdmin = mdpAdminAttendu();
      if (attenduAdmin === '') {
        return reponse({ ok: false, erreur: "Acces administrateur non configure : renseignez la propriete MDP_ADMIN dans les parametres du script." });
      }
      if (String(d.mdp || '').trim() !== attenduAdmin) {
        return reponse({ ok: false, erreur: 'Mot de passe administrateur incorrect.' });
      }
      return reponse({ ok: true, chantiers: lireChantiers(), ouvriers: nomsOuvriers() });
    }

    if (a === 'mes') {
      var u = verifier(d.nom, d.mdp);
      if (!u) return reponse({ ok: false, erreur: 'Session expiree.' });
      return reponse({ ok: true, pointages: pointagesDe(u.nom) });
    }

    if (a === 'ajouter') {
      var u2 = verifier(d.nom, d.mdp);
      if (!u2) return reponse({ ok: false, erreur: 'Session expiree.' });
      var h = Number(d.heures);
      if (!(h > 0) || h > 24) return reponse({ ok: false, erreur: "Nombre d'heures invalide." });

      var ch = null, lc = lireChantiers(), codeDemande = texteCode(d.code);
      for (var k = 0; k < lc.length; k++) if (lc[k].code === codeDemande) ch = lc[k];
      if (!ch) return reponse({ ok: false, erreur: 'Chantier inconnu.' });

      var id = String(new Date().getTime()) + String(Math.floor(Math.random() * 1000));
      var sh = feuille('Pointages');
      /* Une seule pose de format puis une seule ecriture. La version precedente
         enchainait appendRow, getLastRow, setNumberFormat et setValue : quatre
         allers-retours vers Sheets, tous a l'interieur du verrou, donc payes par
         tous les ouvriers en attente derriere.
         Le format Texte sur la date et le code est indispensable : sinon Sheets
         convertit "2026-07-28" en vraie date et "016" en nombre 16. */
      var ligne = sh.getLastRow() + 1;
      var plage = sh.getRange(ligne, 1, 1, 7);
      plage.setNumberFormats([['@', '@', '@', '@', '@', 'General', '@']]);
      plage.setValues([[id, String(d.date), u2.nom, ch.code, ch.nom, h, texteNote(d.notes)]]);
      return reponse({ ok: true, id: id });
    }

    /* Note du jour, sans ressaisir d'heures : elle est posee sur toutes les lignes
       deja pointees par l'ouvrier ce jour-la. Le bouton "Valider la note" appelait
       auparavant l'action "ajouter", qui exigeait un chantier et des heures et
       repondait donc toujours "Choisissez un chantier". */
    if (a === 'noterJour') {
      var un = verifier(d.nom, d.mdp);
      if (!un) return reponse({ ok: false, erreur: 'Session expiree.' });
      var note = texteNote(d.notes);
      var shn = feuille('Pointages');
      var vn = shn.getDataRange().getValues();
      var majs = 0;
      for (var y = 1; y < vn.length; y++) {
        if (vn[y][0] === '') continue;
        if (texteDate(vn[y][1]) === String(d.date) && normNom(vn[y][2]) === normNom(un.nom)) {
          shn.getRange(y + 1, 7).setValue(note);
          majs++;
        }
      }
      if (majs === 0) {
        return reponse({ ok: false, erreur: "Saisissez d'abord vos heures du jour, puis validez la note." });
      }
      return reponse({ ok: true, lignes: majs });
    }

    if (a === 'supprimer') {
      var admin = estAdmin(d);
      var u3 = admin ? null : verifier(d.nom, d.mdp);
      if (!admin && !u3) return reponse({ ok: false, erreur: 'Session expiree.' });

      var sh2 = feuille('Pointages');
      var v = sh2.getDataRange().getValues();
      for (var r = 1; r < v.length; r++) {
        if (String(v[r][0]) === String(d.id)) {
          if (!admin && normNom(v[r][2]) !== normNom(u3.nom)) {
            return reponse({ ok: false, erreur: 'Ligne non autorisee.' });
          }
          sh2.deleteRow(r + 1);
          return reponse({ ok: true });
        }
      }
      return reponse({ ok: false, erreur: 'Ligne introuvable.' });
    }

    if (a === 'tous') {
      if (!estAdmin(d)) return reponse({ ok: false, erreur: 'Acces refuse.' });
      return reponse({ ok: true, pointages: lirePointages(), ouvriers: nomsOuvriers() });
    }

    /* ---------- Gestion des ouvriers (reserve a l'admin) ---------- */

    if (a === 'ajouterOuvrier') {
      if (!estAdmin(d)) return reponse({ ok: false, erreur: 'Acces refuse.' });
      var nNom = String(d.nouveauNom || '').trim();
      var nMdp = String(d.nouveauMdp || '').trim();
      if (!nNom) return reponse({ ok: false, erreur: 'Le nom est obligatoire.' });
      if (nMdp.length < 4) return reponse({ ok: false, erreur: "Le code d'acces doit faire au moins 4 caracteres." });

      var l = lireOuvriers(), maxId = 0;
      for (var m = 0; m < l.length; m++) {
        if (normNom(l[m].nom) === normNom(nNom)) {
          return reponse({ ok: false, erreur: 'Un ouvrier porte deja ce nom.' });
        }
        if (l[m].id > maxId) maxId = l[m].id;
      }

      var so = feuille('Ouvriers');
      so.appendRow([maxId + 1, nNom, nMdp]);
      // Colonne mdp en texte : sinon Sheets transforme '0123' en 123 et le code
      // devient insaisissable pour l'ouvrier.
      var cel = so.getRange(so.getLastRow(), 3);
      cel.setNumberFormat('@');
      cel.setValue(nMdp);
      viderCache();
      return reponse({ ok: true, ouvriers: nomsOuvriers() });
    }

    if (a === 'changerMdpOuvrier') {
      if (!estAdmin(d)) return reponse({ ok: false, erreur: 'Acces refuse.' });
      var cNom = String(d.nouveauNom || '').trim();
      var cMdp = String(d.nouveauMdp || '').trim();
      if (cMdp.length < 4) return reponse({ ok: false, erreur: "Le code d'acces doit faire au moins 4 caracteres." });
      var lc2 = lireOuvriers();
      for (var q = 0; q < lc2.length; q++) {
        if (normNom(lc2[q].nom) === normNom(cNom)) {
          var sc = feuille('Ouvriers').getRange(lc2[q].ligne, 3);
          sc.setNumberFormat('@');
          sc.setValue(cMdp);
          viderCache();
          return reponse({ ok: true, ouvriers: nomsOuvriers() });
        }
      }
      return reponse({ ok: false, erreur: 'Ouvrier introuvable.' });
    }

    if (a === 'supprimerOuvrier') {
      if (!estAdmin(d)) return reponse({ ok: false, erreur: 'Acces refuse.' });
      var sNom = String(d.nouveauNom || '').trim();
      var ls = lireOuvriers();
      for (var z = 0; z < ls.length; z++) {
        if (normNom(ls[z].nom) === normNom(sNom)) {
          // Les pointages deja saisis sont conserves : seul l'acces est supprime.
          feuille('Ouvriers').deleteRow(ls[z].ligne);
          viderCache();
          return reponse({ ok: true, ouvriers: nomsOuvriers() });
        }
      }
      return reponse({ ok: false, erreur: 'Ouvrier introuvable.' });
    }

    return reponse({ ok: false, erreur: 'Action inconnue.' });
  }
}

function doGet() {
  return ContentService.createTextOutput('SP2E Pointage - serveur actif');
}

