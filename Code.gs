/**
 * ============================================================
 *  Atelier Arduino × Tinkercad — script serveur Google Apps Script
 * ============================================================
 *  Installation (une seule fois) :
 *   1. Créez une feuille Google Sheets vide (sheets.new).
 *   2. Extensions → Apps Script. Collez ce fichier dans Code.gs.
 *   3. Fichier « + » → HTML, nommez-le exactement Index, collez Index.html.
 *   4. Choisissez la fonction « installer » puis cliquez sur Exécuter
 *      (acceptez les autorisations).
 *   5. Déployer → Nouveau déploiement → Application Web
 *      · Exécuter en tant que : Moi
 *      · Qui a accès : Tout le monde (ou « Tout utilisateur de votre domaine »)
 *      Donnez l'adresse obtenue aux élèves.
 *
 *  Sécurité :
 *   · Les élèves n'ont jamais accès à la feuille : ils passent uniquement par
 *     l'application, qui ne leur renvoie que leurs propres informations.
 *   · Le code professeur n'est jamais écrit en clair : seule une empreinte
 *     (SHA-256 salée, 2 000 tours) est gardée dans les propriétés du script.
 *     Après 5 codes faux, l'espace professeur est bloqué 10 minutes.
 *   · Tous les onglets sont protégés : seul le propriétaire peut les modifier.
 *   · Toutes les écritures passent par un verrou : deux élèves ne peuvent
 *     jamais obtenir le même TP.
 * ============================================================
 */

const ATELIER = {
  ADRESSE: 'https://script.google.com/macros/s/AKfycbwXb8lojGdPiNJEUIU1e80pm252Op-lztlftywAQ_PkfrEAsemr-5G4j_2pKCOabzUyrw/exec',
  CODE_PROF_DEFAUT: '7843',   // code utilisé au premier lancement d'installer() ; changez-le ensuite
  MAX_ESSAIS_PROF: 5,         // codes professeur faux tolérés…
  BLOCAGE_MINUTES: 10,        // …avant ce blocage
  TOURS_EMPREINTE: 2000,
  DESCRIPTION_PROTECTION: 'Atelier Arduino : onglet géré par le script (modification réservée au propriétaire)'
};

/* ---------- Les 13 TP (le contenu détaillé est dans Index.html) ---------- */
const TPS = [
  ['tp01', 'Faire clignoter une LED', 1, '45 min', 'pinMode, digitalWrite, delay, setup / loop'],
  ['tp02', 'Feu tricolore', 1, '50 min', 'plusieurs sorties, séquence, constantes'],
  ['tp03', 'Bouton poussoir et LED', 1, '50 min', 'digitalRead, entrée numérique, résistance pull-down, if / else'],
  ['tp04', 'Télérupteur et moniteur série', 2, '55 min', 'Serial, front montant, variable booléenne, anti-rebond'],
  ['tp05', 'Potentiomètre et lecture analogique', 2, '45 min', 'analogRead, CAN 10 bits, conversion en volts, traceur série'],
  ['tp06', 'Variateur de lumière (PWM)', 2, '45 min', 'analogWrite, PWM, map(), broches ~'],
  ['tp07', 'LED RVB multicolore', 2, '50 min', 'synthèse additive, fonctions avec paramètres, analogWrite x3'],
  ['tp08', 'Buzzer et mélodie', 2, '45 min', 'tone / noTone, fréquence, tableaux, boucle for'],
  ['tp09', 'Lampe automatique (photorésistance)', 3, '55 min', 'capteur de lumière, pont diviseur, seuil, calibration'],
  ['tp10', 'Thermomètre à LED (TMP36)', 3, '55 min', 'capteur de température, float, conditions multiples, else if'],
  ['tp11', 'Servomoteur piloté', 3, '50 min', 'bibliothèque Servo, #include, objet, angle 0–180°'],
  ['tp12', 'Radar de recul (capteur à ultrasons)', 3, '60 min', 'pulseIn, vitesse du son, fonction qui renvoie une valeur, tone'],
  ['tp13', 'Afficheur LCD 16×2', 3, '60 min', 'bibliothèque LiquidCrystal, setCursor, millis(), affichage']
].map((t, i) => ({id: t[0], num: i + 1, titre: t[1], niveau: t[2], duree: t[3], notions: t[4]}));
const NB = TPS.length;
const TP_INDEX = {};
TPS.forEach((t, i) => { TP_INDEX[t.id] = i; });

/* ---------- Les onglets de la feuille ---------- */
const ONGLETS = {
  eleves: {nom: 'Élèves', entetes: ['Code élève', 'Nom', 'Prénom', 'N° élève', 'Inscrit le'],
    largeurs: [110, 170, 150, 90, 140], colCode: 1, colsDates: [5], couleur: '#00878f'},
  cours: {nom: 'TP en cours', entetes: ['TP', 'TP n°', 'Sujet du TP', 'Statut', 'Code élève', 'Nom', 'Prénom', 'Pris le', 'Rendu le', 'Lien Tinkercad', 'Remarque du professeur'],
    largeurs: [60, 60, 260, 100, 110, 150, 130, 140, 140, 280, 280], colCode: 5, colsDates: [8, 9], couleur: '#fb8c00'},
  valid: {nom: 'Validations', entetes: ['Validé le', 'Code élève', 'Nom', 'Prénom', 'TP', 'TP n°', 'Sujet du TP', 'Pris le', 'Rendu le', 'Durée (min)', 'Lien Tinkercad'],
    largeurs: [140, 110, 150, 130, 60, 60, 260, 140, 140, 90, 280], colCode: 2, colsDates: [1, 8, 9], couleur: '#2e9d4f'},
  journal: {nom: 'Journal', entetes: ['Date', 'Événement', 'Code élève', 'Nom', 'Prénom', 'TP n°', 'Sujet du TP', 'Lien Tinkercad', 'Remarque'],
    largeurs: [140, 230, 110, 150, 130, 60, 260, 280, 280], colCode: 3, colsDates: [1], couleur: '#1e63d6'},
  prog: {nom: 'Progression', entetes: ['Code élève', 'Nom', 'Prénom', 'N° élève', 'TP validés'].concat(TPS.map(t => t.num)),
    largeurs: [110, 170, 150, 90, 90].concat(TPS.map(() => 42)), colCode: 1, colsDates: [], couleur: '#8e24aa'},
  sujets: {nom: 'Sujets des TP', entetes: ['TP', 'TP n°', 'Sujet du TP', 'Niveau (1 à 3)', 'Durée', 'Notions'],
    largeurs: [60, 60, 280, 110, 80, 420], colCode: 0, colsDates: [], couleur: '#e53935'}
};
const STATUT = {LIBRE: 'Libre', COURS: 'En cours', VALIDER: 'À valider'};

/* ============================================================
   1. PAGE WEB ET MENU
   ============================================================ */
function doGet() {
  // Le fichier HTML doit s'appeler « Index » ; on accepte aussi les variantes courantes.
  const noms = ['Index', 'index', 'Index.html', 'index.html', 'INDEX', 'Page', 'page', 'Atelier', 'atelier'];
  for (let i = 0; i < noms.length; i++) {
    try {
      return HtmlService.createHtmlOutputFromFile(noms[i])
        .setTitle('Atelier Arduino × Tinkercad')
        .addMetaTag('viewport', 'width=device-width, initial-scale=1');
    } catch (e) { /* nom suivant */ }
  }
  return HtmlService.createHtmlOutput(
    '<div style="font-family:Arial,sans-serif;max-width:640px;margin:40px auto;line-height:1.5">' +
    '<h2>Atelier Arduino : fichier HTML introuvable</h2>' +
    '<p>Dans l\'éditeur Apps Script, créez un fichier <b>HTML</b> (bouton <b>+</b> → HTML) nommé exactement <b>Index</b> ' +
    '(I majuscule, sans « .html ») et collez-y le contenu du fichier Index.html.</p>' +
    '<p>Ensuite : <b>Déployer → Gérer les déploiements → ✏️ Modifier → Version : Nouvelle version → Déployer</b>. ' +
    'L\'adresse de l\'atelier reste la même.</p></div>').setTitle('Atelier Arduino : installation à terminer');
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Atelier Arduino')
    .addItem('Installer / réparer la feuille', 'installer')
    .addItem('Changer le code professeur', 'changerCodeDepuisMenu')
    .addItem("Afficher l'adresse de l'atelier", 'afficherAdresse')
    .addToUi();
}

/* ============================================================
   2. INSTALLATION (à lancer une fois depuis l'éditeur)
   ============================================================ */
function installer() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error("Ouvrez ce script depuis la feuille Google Sheets (Extensions → Apps Script), puis relancez installer().");
  const props = props_();
  props.setProperty('ID_FEUILLE', ss.getId());
  _classeur = ss;

  Object.keys(ONGLETS).forEach(k => preparerOnglet_(ss, k));

  // TP en cours : une ligne par TP (on ne touche pas aux TP déjà occupés)
  const shC = ss.getSheetByName(ONGLETS.cours.nom);
  const existants = {};
  if (shC.getLastRow() >= 2) shC.getRange(2, 1, shC.getLastRow() - 1, ONGLETS.cours.entetes.length).getValues()
    .forEach(r => { if (r[0]) existants[r[0]] = r; });
  const lignesCours = TPS.map(t => {
    const r = existants[t.id];
    return r ? [t.id, t.num, t.titre].concat(r.slice(3)) : [t.id, t.num, t.titre, STATUT.LIBRE, '', '', '', '', '', '', ''];
  });
  if (shC.getLastRow() >= 2) shC.getRange(2, 1, shC.getLastRow() - 1, ONGLETS.cours.entetes.length).clearContent();
  shC.getRange(2, 1, NB, ONGLETS.cours.entetes.length).setValues(lignesCours);
  colorerStatuts_(shC);

  // Sujets des TP
  const shS = ss.getSheetByName(ONGLETS.sujets.nom);
  shS.getRange(2, 1, NB, 6).setValues(TPS.map(t => [t.id, t.num, t.titre, t.niveau, t.duree, t.notions]));

  // Onglet par défaut vide
  ss.getSheets().forEach(sh => {
    const n = sh.getName();
    if (/^(Feuille|Sheet)\s*1$/i.test(n) && sh.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(sh);
  });

  // Code professeur (empreinte seulement) et inscriptions
  if (!props.getProperty('CODE_PROF_EMPREINTE')) enregistrerCodeProf_(ATELIER.CODE_PROF_DEFAUT);
  if (!props.getProperty('INSCRIPTION_LIBRE')) props.setProperty('INSCRIPTION_LIBRE', 'oui');

  majProgression_();
  protegerOnglets_(ss);
  ss.setActiveSheet(ss.getSheetByName(ONGLETS.cours.nom));

  const msg = "Atelier installé. Code professeur actuel : celui que vous avez choisi (7843 au premier lancement). " +
    "Déployez maintenant l'application Web (Déployer → Nouveau déploiement → Application Web).";
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { Logger.log(msg); }
  return msg;
}

function preparerOnglet_(ss, k) {
  const def = ONGLETS[k];
  let sh = ss.getSheetByName(def.nom);
  if (!sh) sh = ss.insertSheet(def.nom);
  const nc = def.entetes.length;
  sh.getRange(1, 1, 1, nc).setValues([def.entetes])
    .setFontWeight('bold').setFontColor('#ffffff').setBackground(def.couleur)
    .setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true);
  sh.setFrozenRows(1);
  sh.setRowHeight(1, 34);
  def.largeurs.forEach((w, i) => sh.setColumnWidth(i + 1, w));
  if (def.colCode) sh.getRange(2, def.colCode, Math.max(sh.getMaxRows() - 1, 1), 1).setNumberFormat('@');
  def.colsDates.forEach(c => sh.getRange(2, c, Math.max(sh.getMaxRows() - 1, 1), 1).setNumberFormat('dd/mm/yyyy hh:mm'));
  try { sh.setTabColor(def.couleur); } catch (e) {}
  return sh;
}

function colorerStatuts_(sh) {
  const plage = sh.getRange(2, 4, NB, 1);
  const r = (txt, fond, texte) => SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo(txt).setBackground(fond).setFontColor(texte).setRanges([plage]).build();
  sh.setConditionalFormatRules([
    r(STATUT.LIBRE, '#e3f5ea', '#1f8a4c'),
    r(STATUT.COURS, '#fff3df', '#c77700'),
    r(STATUT.VALIDER, '#e5edff', '#2559c7')
  ]);
}

function protegerOnglets_(ss) {
  const moi = Session.getEffectiveUser();
  ss.getSheets().forEach(sh => {
    sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).forEach(p => {
      if (p.getDescription() === ATELIER.DESCRIPTION_PROTECTION) p.remove();
    });
    const p = sh.protect().setDescription(ATELIER.DESCRIPTION_PROTECTION);
    p.addEditor(moi);
    const autres = p.getEditors().filter(u => u.getEmail() !== moi.getEmail());
    if (autres.length) p.removeEditors(autres);
    if (p.canDomainEdit()) p.setDomainEdit(false);
  });
}

function changerCodeDepuisMenu() {
  const ui = SpreadsheetApp.getUi();
  const rep = ui.prompt('Nouveau code professeur', 'Au moins 4 caractères. Il ne sera jamais affiché ni écrit en clair.', ui.ButtonSet.OK_CANCEL);
  if (rep.getSelectedButton() !== ui.Button.OK) return;
  const code = String(rep.getResponseText() || '').trim();
  if (code.length < 4) { ui.alert('Code trop court : au moins 4 caractères.'); return; }
  enregistrerCodeProf_(code);
  ui.alert('Nouveau code professeur enregistré.');
}

function afficherAdresse() {
  const url = ScriptApp.getService().getUrl() || ATELIER.ADRESSE;
  SpreadsheetApp.getUi().alert(url ? "Adresse de l'atelier à donner aux élèves :\n" + url
    : "L'application n'est pas encore déployée : Extensions → Apps Script → Déployer → Nouveau déploiement → Application Web.");
}

/* ============================================================
   3. OUTILS
   ============================================================ */
let _classeur = null;
function props_() { return PropertiesService.getScriptProperties(); }
function classeur_() {
  if (_classeur) return _classeur;
  const id = props_().getProperty('ID_FEUILLE');
  _classeur = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  if (!_classeur) throw new Error("L'atelier n'est pas installé : le professeur doit lancer installer() dans Apps Script.");
  return _classeur;
}
function onglet_(k) {
  const sh = classeur_().getSheetByName(ONGLETS[k].nom);
  if (!sh) throw new Error("Onglet « " + ONGLETS[k].nom + " » introuvable : le professeur doit relancer installer().");
  return sh;
}
function lignes_(k) {
  const sh = onglet_(k), n = sh.getLastRow();
  return n < 2 ? [] : sh.getRange(2, 1, n - 1, ONGLETS[k].entetes.length).getValues();
}
function verrou_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error("Beaucoup d'élèves en même temps : réessaie dans quelques secondes.");
  try { return fn(); } finally { SpreadsheetApp.flush(); lock.releaseLock(); }
}
function texte_(v, max) {
  let s = String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max || 200);
  if (/^[=+\-@]/.test(s)) s = "'" + s;          // empêche l'injection de formules
  return s;
}
function codeNorm_(c) { return String(c == null ? '' : c).trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 20); }
function cle_(s) { return String(s == null ? '' : s).replace(/^'/, '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
function cap_(s) { s = String(s || '').trim(); return s.charAt(0).toUpperCase() + s.slice(1); }
function lien_(u) {
  u = String(u || '').trim().slice(0, 500);
  return /^https:\/\/[^\s"'<>]+$/i.test(u) ? u : '';
}
function ms_(d) { return d instanceof Date ? d.getTime() : null; }
function hex_(octets) { return octets.map(b => ((b + 256) % 256).toString(16).padStart(2, '0')).join(''); }

function empreinte_(code, sel) {
  const alg = Utilities.DigestAlgorithm.SHA_256;
  let h = Utilities.computeDigest(alg, sel + '|' + code, Utilities.Charset.UTF_8);
  for (let i = 0; i < ATELIER.TOURS_EMPREINTE; i++) h = Utilities.computeDigest(alg, h);
  return hex_(h);
}
function enregistrerCodeProf_(code) {
  const sel = Utilities.getUuid();
  props_().setProperties({CODE_PROF_SEL: sel, CODE_PROF_EMPREINTE: empreinte_(String(code).trim(), sel)});
}
function verifierProf_(pin) {
  const cache = CacheService.getScriptCache();
  const essais = Number(cache.get('essais_prof') || 0);
  if (essais >= ATELIER.MAX_ESSAIS_PROF)
    throw new Error('Trop de codes faux : espace professeur bloqué pendant ' + ATELIER.BLOCAGE_MINUTES + ' minutes.');
  const p = props_();
  const ref = p.getProperty('CODE_PROF_EMPREINTE'), sel = p.getProperty('CODE_PROF_SEL');
  if (!ref) throw new Error("L'atelier n'est pas installé : lancez installer() dans Apps Script.");
  if (empreinte_(String(pin == null ? '' : pin).trim(), sel) !== ref) {
    cache.put('essais_prof', String(essais + 1), ATELIER.BLOCAGE_MINUTES * 60);
    throw new Error('Code professeur incorrect.');
  }
  cache.remove('essais_prof');
}

/* ---------- Lecture des données ---------- */
function lireEleves_() {
  return lignes_('eleves').map((r, i) => ({ligne: i + 2, code: codeNorm_(r[0]), nom: String(r[1]), prenom: String(r[2]),
    rang: Number(r[3]) || 0, inscrit: ms_(r[4])})).filter(e => e.code);
}
function lireCours_() {
  const parId = {};
  lignes_('cours').forEach((r, i) => { parId[r[0]] = {ligne: i + 2, r: r}; });
  return TPS.map(t => {
    const x = parId[t.id];
    if (!x) throw new Error("La ligne du " + t.id + " manque dans « TP en cours » : relancez installer().");
    const r = x.r;
    return {ligne: x.ligne, id: t.id, statut: String(r[3] || STATUT.LIBRE), code: codeNorm_(r[4]), nom: String(r[5]), prenom: String(r[6]),
      debut: ms_(r[7]), rendu: ms_(r[8]), lien: String(r[9] || ''), remarque: String(r[10] || '')};
  });
}
function lireValidations_() {
  return lignes_('valid').map((r, i) => ({ligne: i + 2, date: ms_(r[0]), code: codeNorm_(r[1]), nom: String(r[2]), prenom: String(r[3]),
    tp: String(r[4]), debut: ms_(r[7]), rendu: ms_(r[8]), lien: String(r[10] || '')})).filter(v => v.code && TP_INDEX[v.tp] !== undefined);
}
function faits_(code, valids) {
  const s = {};
  (valids || lireValidations_()).forEach(v => { if (v.code === code) s[v.tp] = true; });
  return s;
}

/* ---------- Écriture ---------- */
function ecrireCours_(c, o) {
  onglet_('cours').getRange(c.ligne, 4, 1, 8).setValues([[o.statut, o.code || '', texte_(o.nom, 60), texte_(o.prenom, 60),
    o.debut ? new Date(o.debut) : '', o.rendu ? new Date(o.rendu) : '', lien_(o.lien), texte_(o.remarque, 300)]]);
}
function libererCours_(c) { ecrireCours_(c, {statut: STATUT.LIBRE}); }
function journal_(evt, qui, tp, remarque, lien) {
  onglet_('journal').appendRow([new Date(), evt, qui && qui.code || '', texte_(qui && qui.nom, 60), texte_(qui && qui.prenom, 60),
    tp ? tp.num : '', tp ? tp.titre : '', lien_(lien), texte_(remarque, 300)]);
}
function majProgression_() {
  const sh = onglet_('prog');
  const eleves = lireEleves_().sort((a, b) => (a.rang || 999) - (b.rang || 999));
  const nc = ONGLETS.prog.entetes.length;
  if (sh.getLastRow() >= 2) sh.getRange(2, 1, sh.getLastRow() - 1, nc).clearContent();
  if (!eleves.length) return;
  const vs = "'" + ONGLETS.valid.nom + "'!";
  const lignes = eleves.map((e, i) => {
    const l = i + 2;
    const tps = TPS.map((t, j) => {
      const col = columnLetter_(6 + j);
      return '=IF(COUNTIFS(' + vs + '$B:$B,$A' + l + ',' + vs + '$F:$F,' + col + '$1)>0,"✓","")';
    });
    return [e.code, texte_(e.nom, 60), texte_(e.prenom, 60), e.rang || '', '=COUNTIF(' + vs + '$B:$B,$A' + l + ')'].concat(tps);
  });
  sh.getRange(2, 1, lignes.length, nc).setValues(lignes);
}
function columnLetter_(n) { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
function prochainRang_(eleves) {
  const pris = {};
  eleves.forEach(e => { if (e.rang) pris[e.rang] = true; });
  let r = 1; while (pris[r]) r++;
  return r;
}

/* ---------- Rotation : l'élève n°r commence au TP r, puis r+1… ---------- */
function attribuer_(e) {
  const cours = lireCours_();
  if (cours.some(c => c.code === e.code && c.statut !== STATUT.LIBRE)) return true;
  const faits = faits_(e.code);
  const nbFaits = Object.keys(faits).length;
  if (nbFaits >= NB) return true;
  const depart = ((e.rang || 1) - 1 + nbFaits) % NB;
  for (let k = 0; k < NB; k++) {
    const i = (depart + k) % NB, tp = TPS[i], c = cours[i];
    if (faits[tp.id] || c.statut !== STATUT.LIBRE) continue;
    ecrireCours_(c, {statut: STATUT.COURS, code: e.code, nom: e.nom, prenom: e.prenom, debut: Date.now()});
    journal_('TP pris', e, tp, '');
    return true;
  }
  return false;
}

/* ---------- Ce que chaque personne a le droit de voir ---------- */
function tpsPublics_(cours, code) {
  const out = {};
  cours.forEach(c => {
    if (c.statut === STATUT.LIBRE) return;
    const st = c.statut === STATUT.VALIDER ? 'a_valider' : 'en_cours';
    out[c.id] = c.code === code
      ? {statut: st, code: c.code, nom: c.nom, prenom: c.prenom, debut: c.debut, rendu: c.rendu, lien: c.lien, remarque: c.remarque}
      : {statut: st, prenom: c.prenom, nom: c.nom.charAt(0)};
  });
  return out;
}
function etatEleve_(e) {
  const valids = lireValidations_(), mes = {};
  valids.forEach(v => { if (v.code === e.code) mes[v.code + '_' + v.tp] = {code: v.code, tp: v.tp, date: v.date, debut: v.debut, rendu: v.rendu, lien: v.lien}; });
  return {me: {code: e.code, nom: e.nom, prenom: e.prenom, rang: (e.rang || 1) - 1},
    tps: tpsPublics_(lireCours_(), e.code), validations: mes, nbEleves: lireEleves_().length};
}
function identifier_(ident) {
  const code = codeNorm_(ident && ident.code);
  const e = code && lireEleves_().find(x => x.code === code);
  if (!e || cle_(e.nom) !== cle_(ident.nom) || cle_(e.prenom) !== cle_(ident.prenom))
    throw new Error('Nom, prénom ou code élève incorrect.');
  return e;
}

/* ============================================================
   4. FONCTIONS APPELÉES PAR LES ÉLÈVES
   ============================================================ */
function apiEtatPublic() {
  return {tps: tpsPublics_(lireCours_(), null), nbEleves: lireEleves_().length};
}

function apiConnexion(nom, prenom, code) {
  nom = texte_(nom, 60); prenom = texte_(prenom, 60); code = codeNorm_(code);
  if (!nom || !prenom || code.length < 2) throw new Error('Remplis ton nom, ton prénom et ton code élève (au moins 2 lettres ou chiffres).');
  return verrou_(() => {
    const eleves = lireEleves_();
    let e = eleves.find(x => x.code === code);
    if (e) {
      if (cle_(e.nom) !== cle_(nom) || cle_(e.prenom) !== cle_(prenom))
        throw new Error('Ce code élève est déjà utilisé par un autre élève. Vérifie ton code ou ton nom.');
      if (!e.rang) {                       // élève pré-inscrit par le professeur
        e.rang = prochainRang_(eleves);
        onglet_('eleves').getRange(e.ligne, 4, 1, 2).setValues([[e.rang, new Date()]]);
        majProgression_();
      }
    } else {
      if (props_().getProperty('INSCRIPTION_LIBRE') === 'non')
        throw new Error("Ce code élève n'est pas dans la liste de la classe. Demande ton code au professeur.");
      e = {code: code, nom: nom.replace(/^'/, '').toUpperCase(), prenom: cap_(prenom.replace(/^'/, '')), rang: prochainRang_(eleves)};
      onglet_('eleves').appendRow([code, texte_(e.nom, 60), texte_(e.prenom, 60), e.rang, new Date()]);
      journal_('Inscription', e, null, '');
      majProgression_();
    }
    attribuer_(e);
    return etatEleve_(e);
  });
}

function apiEtatEleve(ident) {
  const e = identifier_(ident);
  const cours = lireCours_();
  const aUnTp = cours.some(c => c.code === e.code && c.statut !== STATUT.LIBRE);
  if (!aUnTp && cours.some(c => c.statut === STATUT.LIBRE) && Object.keys(faits_(e.code)).length < NB) {
    verrou_(() => attribuer_(e));
  }
  return etatEleve_(e);
}

function apiRendre(ident, tpId, lien) {
  return verrou_(() => {
    const e = identifier_(ident);
    const c = monTp_(e, tpId);
    if (c.statut !== STATUT.VALIDER) {
      const l = lien_(lien);
      ecrireCours_(c, {statut: STATUT.VALIDER, code: c.code, nom: c.nom, prenom: c.prenom, debut: c.debut, rendu: Date.now(), lien: l, remarque: ''});
      journal_('Rendu (demande de validation)', e, TPS[TP_INDEX[tpId]], '', l);
    }
    return etatEleve_(e);
  });
}

function apiAnnulerRendu(ident, tpId) {
  return verrou_(() => {
    const e = identifier_(ident);
    const c = monTp_(e, tpId);
    if (c.statut === STATUT.VALIDER) {
      ecrireCours_(c, {statut: STATUT.COURS, code: c.code, nom: c.nom, prenom: c.prenom, debut: c.debut, rendu: c.rendu, lien: c.lien, remarque: ''});
      journal_("Demande annulée par l'élève", e, TPS[TP_INDEX[tpId]], '');
    }
    return etatEleve_(e);
  });
}

function monTp_(e, tpId) {
  const i = TP_INDEX[tpId];
  if (i === undefined) throw new Error('TP inconnu.');
  const c = lireCours_()[i];
  if (c.statut === STATUT.LIBRE || c.code !== e.code) throw new Error("Ce TP n'est pas à ton nom.");
  return c;
}

/* ============================================================
   5. FONCTIONS DU PROFESSEUR (code professeur vérifié à chaque appel)
   ============================================================ */
function etatProf_() {
  const eleves = {}, tps = {}, validations = {};
  lireEleves_().forEach(e => { eleves[e.code] = {code: e.code, nom: e.nom, prenom: e.prenom, rang: (e.rang || 1) - 1, creeLe: e.inscrit}; });
  lireCours_().forEach(c => {
    if (c.statut !== STATUT.LIBRE) tps[c.id] = {statut: c.statut === STATUT.VALIDER ? 'a_valider' : 'en_cours', code: c.code, nom: c.nom,
      prenom: c.prenom, debut: c.debut, rendu: c.rendu, lien: c.lien, remarque: c.remarque};
  });
  lireValidations_().forEach(v => { validations[v.code + '_' + v.tp] = {code: v.code, tp: v.tp, nom: v.nom, prenom: v.prenom, date: v.date, debut: v.debut, rendu: v.rendu, lien: v.lien}; });
  const shJ = onglet_('journal'), nj = shJ.getLastRow() - 1;
  const journal = nj > 0 ? shJ.getRange(Math.max(2, nj - 39 + 1), 1, Math.min(40, nj), 9).getValues().reverse()
    .map(r => ({date: ms_(r[0]), evt: String(r[1]), code: String(r[2]), nom: String(r[3]), prenom: String(r[4]), num: r[5], remarque: String(r[8])})) : [];
  return {eleves: eleves, tps: tps, validations: validations, journal: journal, nbEleves: Object.keys(eleves).length,
    url: classeur_().getUrl(), adresse: ATELIER.ADRESSE, inscriptionLibre: props_().getProperty('INSCRIPTION_LIBRE') !== 'non'};
}

function apiProf(pin) { verifierProf_(pin); return etatProf_(); }

function apiValider(pin, tpId) {
  verifierProf_(pin);
  return verrou_(() => {
    const i = TP_INDEX[tpId]; if (i === undefined) throw new Error('TP inconnu.');
    const c = lireCours_()[i], tp = TPS[i];
    if (c.statut === STATUT.LIBRE) throw new Error('Ce TP est déjà libre.');
    if (!faits_(c.code)[tp.id]) {
      const fin = Date.now();
      onglet_('valid').appendRow([new Date(fin), c.code, texte_(c.nom, 60), texte_(c.prenom, 60), tp.id, tp.num, tp.titre,
        c.debut ? new Date(c.debut) : '', c.rendu ? new Date(c.rendu) : '', c.debut ? Math.round((fin - c.debut) / 60000) : '', c.lien]);
    }
    libererCours_(c);
    journal_('Validé par le professeur', c, tp, '', c.lien);
    return etatProf_();
  });
}

function apiRefuser(pin, tpId, remarque) {
  verifierProf_(pin);
  return verrou_(() => {
    const i = TP_INDEX[tpId]; if (i === undefined) throw new Error('TP inconnu.');
    const c = lireCours_()[i];
    if (c.statut === STATUT.LIBRE) throw new Error('Ce TP est libre.');
    const rem = texte_(remarque || 'À reprendre.', 300);
    ecrireCours_(c, {statut: STATUT.COURS, code: c.code, nom: c.nom, prenom: c.prenom, debut: c.debut, rendu: c.rendu, lien: c.lien, remarque: rem});
    journal_('À reprendre', c, TPS[i], rem);
    return etatProf_();
  });
}

function apiLiberer(pin, tpId) {
  verifierProf_(pin);
  return verrou_(() => {
    const i = TP_INDEX[tpId]; if (i === undefined) throw new Error('TP inconnu.');
    const c = lireCours_()[i];
    if (c.statut !== STATUT.LIBRE) { journal_('Libéré par le professeur (non validé)', c, TPS[i], ''); libererCours_(c); }
    return etatProf_();
  });
}

function apiAnnulerValidation(pin, code, tpId) {
  verifierProf_(pin);
  return verrou_(() => {
    code = codeNorm_(code);
    const sh = onglet_('valid');
    lireValidations_().filter(v => v.code === code && v.tp === tpId).reverse().forEach(v => sh.deleteRow(v.ligne));
    journal_('Validation annulée par le professeur', {code: code}, TPS[TP_INDEX[tpId]], '');
    return etatProf_();
  });
}

function apiSupprimerEleve(pin, code) {
  verifierProf_(pin);
  return verrou_(() => {
    code = codeNorm_(code);
    const e = lireEleves_().find(x => x.code === code);
    if (!e) return etatProf_();
    lireCours_().forEach(c => { if (c.code === code && c.statut !== STATUT.LIBRE) libererCours_(c); });
    const shV = onglet_('valid');
    lireValidations_().filter(v => v.code === code).reverse().forEach(v => shV.deleteRow(v.ligne));
    onglet_('eleves').deleteRow(e.ligne);
    journal_('Élève supprimé par le professeur', e, null, '');
    majProgression_();
    return etatProf_();
  });
}

function apiInscriptionLibre(pin, libre) {
  verifierProf_(pin);
  props_().setProperty('INSCRIPTION_LIBRE', libre ? 'oui' : 'non');
  return etatProf_();
}

function apiChangerCode(pin, nouveau) {
  verifierProf_(pin);
  nouveau = String(nouveau || '').trim();
  if (nouveau.length < 4) throw new Error('Le nouveau code doit contenir au moins 4 caractères.');
  enregistrerCodeProf_(nouveau);
  return true;
}

function apiReinitialiser(pin) {
  verifierProf_(pin);
  return verrou_(() => {
    ['eleves', 'valid'].forEach(k => {
      const sh = onglet_(k);
      if (sh.getLastRow() >= 2) sh.deleteRows(2, sh.getLastRow() - 1);
    });
    lireCours_().forEach(c => libererCours_(c));
    majProgression_();
    journal_("Atelier réinitialisé par le professeur (élèves, TP en cours et validations effacés)", null, null, '');
    return etatProf_();
  });
}
