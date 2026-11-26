// Règles d'horaire du Time Attack (supabase/functions/_shared/time-attack-rules.ts).
import test from 'node:test';
import assert from 'node:assert/strict';

import { FUTURE_TOLERANCE_MS, checkTicketTiming, localDate, wallClockToUtc } from '../time-attack-rules.ts';

const PARIS = 'Europe/Paris';
const iso = (date) => date?.toISOString() ?? null;

test('heure du ticket (heure de Paris) convertie en UTC', () => {
  assert.equal(iso(wallClockToUtc('2026-10-15', '14:25', PARIS)), '2026-10-15T12:25:00.000Z', 'heure d\'été : UTC+2');
  assert.equal(iso(wallClockToUtc('2026-12-15', '14:25', PARIS)), '2026-12-15T13:25:00.000Z', 'heure d\'hiver : UTC+1');
  assert.equal(iso(wallClockToUtc('2026-10-15', '14:25:30', PARIS)), '2026-10-15T12:25:30.000Z', 'avec les secondes');
  assert.equal(iso(wallClockToUtc('2026-03-29', '10:00', PARIS)), '2026-03-29T08:00:00.000Z', 'jour du passage à l\'heure d\'été');
});

test('dates et heures impossibles refusées', () => {
  assert.equal(wallClockToUtc('2026-02-31', '14:25', PARIS), null, '31 février');
  assert.equal(wallClockToUtc('2026-13-01', '14:25', PARIS), null);
  assert.equal(wallClockToUtc('2026-10-15', '24:00', PARIS), null);
  assert.equal(wallClockToUtc('15/10/2026', '14:25', PARIS), null, 'format attendu : AAAA-MM-JJ');
});

test('date locale d\'un instant', () => {
  assert.equal(localDate(new Date('2026-10-15T23:30:00Z'), PARIS), '2026-10-16', 'après minuit à Paris');
  assert.equal(localDate(new Date('2026-10-15T21:30:00Z'), PARIS), '2026-10-15');
});

test('règle d\'or : ticket strictement postérieur au check-in', () => {
  const checkInAt = new Date('2026-10-15T12:00:00Z');
  const deadlineAt = new Date('2026-10-15T13:30:00Z');
  const receivedAt = new Date('2026-10-15T12:50:00Z');
  const timing = (ticketAt, received = receivedAt) => checkTicketTiming({ checkInAt, deadlineAt, receivedAt: received, ticketAt });

  assert.equal(timing(checkInAt), 'TICKET_BEFORE_CHECK_IN', 'même instant que le check-in : refusé');
  assert.equal(timing(new Date('2026-10-15T11:59:00Z')), 'TICKET_BEFORE_CHECK_IN');
  assert.equal(timing(new Date(checkInAt.getTime() + 1000)), null, 'une seconde après : accepté');
  assert.equal(timing(new Date(receivedAt.getTime() + FUTURE_TOLERANCE_MS)), null, 'horloge du circuit en avance de 10 min : tolérée');
  assert.equal(timing(new Date(receivedAt.getTime() + FUTURE_TOLERANCE_MS + 1000)), 'TICKET_IN_FUTURE');
  assert.equal(
    timing(new Date('2026-10-15T12:30:00Z'), new Date(deadlineAt.getTime() + 1000)),
    'DEADLINE_PASSED',
    'reçu après les 90 minutes',
  );
  assert.equal(timing(checkInAt, new Date(deadlineAt.getTime() + 1000)), 'DEADLINE_PASSED', 'l\'échéance est contrôlée en premier');
});
