// Lecture d'un ticket de chronométrage à partir du texte OCR (supabase/functions/_shared/ticket-ocr.ts).
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  checkTicketText,
  clockTimesIn,
  compact,
  findDate,
  lapMatches,
  lapTimesIn,
  linesWithName,
  looksLikeTimingTicket,
  mentionsTrack,
  normalize,
} from '../ticket-ocr.ts';

// Ticket individuel : nom en en-tête, tours en dessous.
const SOLO_TICKET = `KARTING DES DUNES
Lorient
Session 12 - 15/10/2026 14:25
Pilote : JEAN DUPONT
Kart 7
Tour  Temps
1  49.812
2  48.103
3  47.312
Meilleur tour 47.312
Imprimé le 15/10/2026 14:41`;

// Feuille de classement : plusieurs pilotes, temps au centième.
const RANKING_SHEET = `RKC Karting Lorient - Classement
Course 15.10.26 16:05
Pos Pilote Meilleur tour Ecart
1 MARIE CURIE 46.98 -
2 JEAN DUPONT 47.31 0.33
3 PAUL MARTIN 48.02 1.04`;

const CLAIM = { name: 'Jean Dupont', lapMs: 47312, trackName: 'Karting des Dunes', trackCity: 'Lorient' };
const lines = (text) => text.split('\n').map(normalize).filter(Boolean);

test('normalisation : accents, casse et ponctuation ignorés', () => {
  assert.equal(normalize('  Éric   LEFÈVRE '), 'eric lefevre');
  assert.equal(compact('Jean-Dupont'), compact('JEAN DUPONT'));
});

test('temps au tour imprimés dans tous les formats courants', () => {
  assert.deepEqual(lapTimesIn('47.312'), [{ ms: 47312, decimals: 3 }]);
  assert.deepEqual(lapTimesIn('47,31'), [{ ms: 47310, decimals: 2 }]);
  assert.deepEqual(lapTimesIn('1:02.345'), [{ ms: 62345, decimals: 3 }]);
  assert.deepEqual(lapTimesIn(`1'02"345`), [{ ms: 62345, decimals: 3 }]);
  assert.deepEqual(lapTimesIn('9.500'), [], 'un tour de moins de 10 s est un écart, pas un temps');
  assert.deepEqual(lapTimesIn('75.123'), [], 'plus de 59 secondes : pas un temps');
});

test('heures imprimées, sans confondre avec un temps au tour', () => {
  assert.deepEqual(clockTimesIn('Départ 14:25'), ['14:25']);
  assert.deepEqual(clockTimesIn('14h25'), ['14:25']);
  assert.deepEqual(clockTimesIn('14:25:30'), ['14:25:30']);
  assert.deepEqual(clockTimesIn('1:02.345'), [], 'un temps au tour n\'est pas une heure');
  assert.deepEqual(clockTimesIn('25:00'), [], 'heure impossible');
});

test('dates imprimées', () => {
  assert.equal(findDate('le 15/10/2026'), '2026-10-15');
  assert.equal(findDate('15.10.2026'), '2026-10-15');
  assert.equal(findDate('15-10-26'), '2026-10-15');
  assert.equal(findDate('2026-10-15'), '2026-10-15');
  assert.equal(findDate('32/10/2026'), null);
  assert.equal(findDate('meilleur tour 47.312'), null);
});

test('nom du pilote retrouvé malgré une erreur de lecture', () => {
  const ticket = lines('Pos Pilote\n1 MARIE CURIE 46.98\n2 JEAN DUP0NT 47.31');
  assert.deepEqual(linesWithName(ticket, 'Jean Dupont'), [2], 'O lu 0 : toléré');
  assert.deepEqual(linesWithName(ticket, 'Jean Durand'), []);
  assert.deepEqual(linesWithName(ticket, 'J'), [], 'nom trop court');
});

test('feuille de classement : le temps doit être sur la ligne du pilote', () => {
  const sheet = lines(RANKING_SHEET);
  const jean = linesWithName(sheet, 'Jean Dupont');
  assert.equal(lapMatches(sheet, jean, 47312), true, '47.31 imprimé au centième correspond à 47.312');
  assert.equal(lapMatches(sheet, jean, 46980), false, 'le meilleur tour d\'un autre pilote est refusé');
});

test('ticket de chronométrage ou autre papier ?', () => {
  assert.equal(looksLikeTimingTicket(lines(SOLO_TICKET)), true);
  assert.equal(looksLikeTimingTicket(lines('SUPERMARCHE\nPain 1,20\nLait 0,99\nTOTAL 12,50')), false);
  assert.equal(looksLikeTimingTicket(lines('Kart Lap Best\n47.312')), false, 'il faut au moins 3 temps');
});

test('circuit du check-in mentionné sur le ticket', () => {
  assert.equal(mentionsTrack(lines(SOLO_TICKET), 'Karting des Dunes', 'Lorient'), true);
  assert.equal(mentionsTrack(lines(SOLO_TICKET), 'Speed Park Valence', 'Valence'), false);
  assert.equal(mentionsTrack(lines(SOLO_TICKET), 'Karting Club', 'Ax'), true, 'nom sans mot distinctif : contrôle ignoré');
});

test('ticket individuel valide : heure de session la plus tôt retenue', () => {
  assert.deepEqual(checkTicketText(SOLO_TICKET, CLAIM), { ok: true, date: '2026-10-15', time: '14:25', lapMs: 47312 });
});

test('feuille de classement valide', () => {
  assert.deepEqual(checkTicketText(RANKING_SHEET, CLAIM), { ok: true, date: '2026-10-15', time: '16:05', lapMs: 47312 });
});

test('chaque contrôle a son code de refus', () => {
  const refuse = (text, claim = CLAIM) => checkTicketText(text, claim);
  assert.deepEqual(refuse('Photo de mon chat'), { ok: false, code: 'NOT_A_TICKET' });
  assert.deepEqual(refuse(SOLO_TICKET, { ...CLAIM, trackName: 'Speed Park Valence', trackCity: 'Valence' }), {
    ok: false,
    code: 'TRACK_NOT_FOUND',
  });
  assert.deepEqual(refuse(SOLO_TICKET, { ...CLAIM, name: 'Paul Martin' }), { ok: false, code: 'NAME_NOT_FOUND' });
  assert.deepEqual(refuse(SOLO_TICKET, { ...CLAIM, lapMs: 46000 }), { ok: false, code: 'LAP_NOT_FOUND' });
  const undated = SOLO_TICKET.replace(/15\/10\/2026 /g, '');
  assert.deepEqual(refuse(undated), { ok: false, code: 'TICKET_DATE_UNREADABLE' });
  const noClock = SOLO_TICKET.replace(/ 14:\d\d/g, '');
  assert.deepEqual(refuse(noClock), { ok: false, code: 'TICKET_TIME_UNREADABLE' });
});
