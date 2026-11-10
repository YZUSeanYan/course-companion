'use strict';

// Synthetic fixtures only. Run with node --test miniprogram/tests/core.test.cjs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createStore, STORAGE_KEY } = require('../lib/store');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MINUTE = 60000;
const DAY = 86400000;
const CAP = 750 * 1024;
const KINDS = ['courses', 'sessions', 'doubts', 'cards', 'logs'];
const copy = value => JSON.parse(JSON.stringify(value));
const fakeId = number => '00000000-0000-4000-8000-' + number.toString(16).padStart(12, '0');

function memory(initial) {
  return {
    value: initial,
    writes: 0,
    reads: 0,
    failRead: false,
    failWrite: false,
    onWrite: null,
    getStorageSync(key) {
      assert.equal(key, STORAGE_KEY);
      this.reads += 1;
      if (this.failRead) throw new Error('synthetic-private-storage-detail');
      return this.value;
    },
    setStorageSync(key, value) {
      assert.equal(key, STORAGE_KEY);
      assert.equal(typeof value, 'string');
      assert.ok(Buffer.byteLength(value, 'utf8') <= CAP);
      if (this.onWrite) this.onWrite();
      if (this.failWrite) throw new Error('synthetic-private-storage-detail');
      this.value = value;
      this.writes += 1;
    },
  };
}
function fails(callback, code) {
  assert.throws(callback, error => {
    assert.equal(error.code, code);
    assert.match(error.message, /[\u3400-\u9fff]/);
    assert.ok(!error.message.includes('synthetic-private-storage-detail'));
    return true;
  });
}
function fixture() {
  const storage = memory();
  const store = createStore(storage);
  const course = store.addCourse({ name: 'Synthetic course', teacher: 'Fictional teacher', language: '中文' });
  const session = store.addSession({ courseId: course.id, title: 'Synthetic text', transcript: 'Artificial text, never a classroom recording.' });
  const doubt = store.addDoubt({ sessionId: session.id, sourceText: 'Artificial text', note: 'A synthetic question.' });
  const card = store.addCard({ courseId: course.id, sourceId: doubt.id, front: 'Synthetic term', back: 'Artificial definition' });
  return { storage, store, course, session, doubt, card };
}
function unchanged(store, storage, callback, code) {
  const before = store.getSnapshot();
  const persisted = storage.value;
  const writes = storage.writes;
  fails(callback, code);
  assert.deepEqual(store.getSnapshot(), before);
  assert.equal(storage.value, persisted);
  assert.equal(storage.writes, writes);
}

// Public interface, IDs and input constraints.
test('default state is versioned, empty, offline and never auto-seeded or written', () => {
  const storage = memory();
  const store = createStore(storage);
  assert.deepEqual(store.getSnapshot(), {
    version: 1, scheduler: 'spaced-interval-v1', settings: { reduceMotion: false },
    courses: [], sessions: [], doubts: [], cards: [], logs: [],
  });
  assert.deepEqual(store.dueCards(0), []);
  assert.deepEqual(store.stats(0), {
    courses: 0, sessions: 0, doubts: 0, openDoubts: 0, resolvedDoubts: 0,
    cards: 0, dueCards: 0, reviews: 0, reviewedToday: 0,
    archived: { courses: 0, sessions: 0, doubts: 0, cards: 0, logs: 0 },
  });
  assert.equal(storage.writes, 0);
  assert.deepEqual(createStore(memory('')).getSnapshot(), store.getSnapshot());
  assert.equal(typeof store.exportBackup(), 'string');
});

test('entities use stable 36-character UUID v4 IDs and id-only relationships across reload', () => {
  const { store, storage, course, session, doubt, card } = fixture();
  const result = store.rateCard(card.id, 'good', card.createdAtMillis);
  const snapshot = store.getSnapshot();
  const ids = KINDS.flatMap(kind => snapshot[kind].map(record => {
    assert.equal(record.id.length, 36);
    assert.match(record.id, UUID);
    assert.equal(record.deletedAtMillis, null);
    assert.ok(Number.isSafeInteger(record.createdAtMillis));
    assert.ok(record.updatedAtMillis >= record.createdAtMillis);
    assert.ok(!Object.hasOwn(record, 'uid'));
    return record.id;
  }));
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(session.courseId, course.id);
  assert.equal(doubt.sessionId, session.id);
  assert.equal(card.courseId, course.id);
  assert.equal(card.sourceId, doubt.id);
  assert.equal(result.log.cardId, card.id);
  assert.deepEqual(createStore(storage).getSnapshot(), snapshot);
});

test('all returned objects, arrays, nested settings and operation results are detached', () => {
  const { store, course, card } = fixture();
  course.name = 'changed outside';
  const snapshot = store.getSnapshot();
  snapshot.settings.reduceMotion = true;
  snapshot.courses[0].name = 'changed outside';
  snapshot.cards.length = 0;
  const due = store.dueCards(card.createdAtMillis);
  due[0].front = 'changed outside';
  const settings = store.updateSettings({ reduceMotion: true });
  settings.reduceMotion = false;
  const review = store.rateCard(card.id, 'again', card.createdAtMillis);
  review.card.reps = 999;
  review.log.rating = 'easy';
  const stats = store.stats(card.createdAtMillis);
  stats.archived.courses = 100;
  const current = store.getSnapshot();
  assert.equal(current.courses[0].name, 'Synthetic course');
  assert.equal(current.cards[0].front, 'Synthetic term');
  assert.equal(current.cards[0].reps, 1);
  assert.equal(current.logs[0].rating, 'again');
  assert.equal(current.settings.reduceMotion, true);
  assert.equal(store.stats(card.createdAtMillis).archived.courses, 0);
});

test('manual additions trim inputs, default optional fields and do not accept fake AI/audio fields', () => {
  const store = createStore(memory());
  const course = store.addCourse({ name: '  Synthetic  ', uid: 'ignored' });
  assert.equal(course.name, 'Synthetic');
  assert.equal(course.teacher, '');
  assert.equal(course.language, '');
  const session = store.addSession({ courseId: course.id, title: '  Text ', transcript: '  plain\ntext\tvalue ', audioBlob: 'ignored', inputMode: 'RECORDING' });
  assert.equal(session.transcript, 'plain\ntext\tvalue');
  assert.equal(session.inputMode, 'MANUAL_TEXT');
  assert.ok(!Object.hasOwn(session, 'audioBlob'));
  const doubt = store.addDoubt({ sessionId: session.id, sourceText: '  plain ' });
  assert.equal(doubt.note, '');
  assert.equal(doubt.status, 'OPEN');
  assert.equal(doubt.answer, '');
  assert.equal(doubt.resolvedAtMillis, null);
  const card = store.addCard({ courseId: course.id, front: ' f ', back: ' b ', origin: 'AI' });
  assert.equal(card.origin, 'MANUAL');
  assert.equal(card.sourceId, null);
  const resolved = store.resolveDoubt(doubt.id, '  A manual answer.  ');
  assert.equal(resolved.status, 'RESOLVED');
  assert.equal(resolved.answer, 'A manual answer.');
  assert.equal(resolved.resolvedAtMillis, resolved.updatedAtMillis);
});

test('UI field limits accept exact bounds and reject oversize, blank, controls and wrong types', () => {
  const { store, storage, course, session, doubt } = fixture();
  store.addCourse({ name: 'n'.repeat(80), teacher: 't'.repeat(80), language: 'l'.repeat(80) });
  store.addSession({ courseId: course.id, title: 't'.repeat(120), transcript: 'x'.repeat(30000) });
  store.addDoubt({ sessionId: session.id, sourceText: 's'.repeat(2000), note: 'n'.repeat(2000) });
  store.addCard({ courseId: course.id, front: 'f'.repeat(2000), back: 'b'.repeat(4000) });
  store.resolveDoubt(doubt.id, 'a'.repeat(4000));
  const invalid = [
    () => store.addCourse(null), () => store.addCourse([]), () => store.addCourse({}),
    () => store.addCourse({ name: '   ' }), () => store.addCourse({ name: 12 }),
    () => store.addCourse({ name: 'n'.repeat(81) }), () => store.addCourse({ name: 'x', teacher: 't'.repeat(81) }),
    () => store.addCourse({ name: 'x', language: 'l'.repeat(81) }), () => store.addCourse({ name: 'x\u0000y' }),
    () => store.addSession({ courseId: course.id, title: 't'.repeat(121), transcript: 'x' }),
    () => store.addSession({ courseId: course.id, title: 't', transcript: 'x'.repeat(30001) }),
    () => store.addSession({ courseId: course.id, title: 't', transcript: '' }),
    () => store.addDoubt({ sessionId: session.id, sourceText: 's'.repeat(2001), note: '' }),
    () => store.addDoubt({ sessionId: session.id, sourceText: 's', note: 'n'.repeat(2001) }),
    () => store.addCard({ courseId: course.id, front: 'f'.repeat(2001), back: 'b' }),
    () => store.addCard({ courseId: course.id, front: 'f', back: 'b'.repeat(4001) }),
    () => store.resolveDoubt(doubt.id, 'a'.repeat(4001)), () => store.resolveDoubt(doubt.id, ''),
    () => store.updateSettings({ reduceMotion: 'true' }), () => store.updateSettings({}),
  ];
  invalid.forEach(operation => unchanged(store, storage, operation, 'INVALID_INPUT'));
});

test('bad IDs are validated even with empty tables; UUID newline regression and case normalization', () => {
  const store = createStore(memory());
  fails(() => store.addSession({ courseId: 'not-a-uuid', title: 'x', transcript: 'y' }), 'INVALID_INPUT');
  fails(() => store.addDoubt({ sessionId: 1, sourceText: 'x' }), 'INVALID_INPUT');
  const course = store.addCourse({ name: 'Synthetic' });
  fails(() => store.archive('courses', course.id + '\n'), 'INVALID_INPUT');
  const session = store.addSession({ courseId: course.id.toUpperCase(), title: 'x', transcript: 'y' });
  assert.equal(session.courseId, course.id);
  fails(() => store.archive('course', course.id), 'INVALID_INPUT');
});

test('missing, cross-course and archived sources cannot create orphan records', () => {
  const { store, storage, course, session } = fixture();
  const other = store.addCourse({ name: 'Another synthetic course' });
  unchanged(store, storage, () => store.addSession({ courseId: fakeId(1), title: 'x', transcript: 'y' }), 'NOT_FOUND');
  unchanged(store, storage, () => store.addDoubt({ sessionId: fakeId(2), sourceText: 'x' }), 'NOT_FOUND');
  unchanged(store, storage, () => store.addCard({ courseId: course.id, sourceId: fakeId(3), front: 'f', back: 'b' }), 'NOT_FOUND');
  unchanged(store, storage, () => store.addCard({ courseId: other.id, sourceId: session.id, front: 'f', back: 'b' }), 'INVALID_RELATIONSHIP');
  store.archive('courses', other.id);
  unchanged(store, storage, () => store.addCard({ courseId: other.id, front: 'f', back: 'b' }), 'ARCHIVED');
  unchanged(store, storage, () => store.addSession({ courseId: other.id, title: 'x', transcript: 'y' }), 'ARCHIVED');
});

// Scheduling is intentionally NOT FSRS.
for (const [rating, expected] of [['again', MINUTE], ['hard', 10 * MINUTE], ['good', DAY], ['easy', 3 * DAY]]) {
  test(`first ${rating} rating schedules the documented interval in one atomic write`, () => {
    const { store, storage, card } = fixture();
    const before = storage.writes;
    const { card: updated, log } = store.rateCard(card.id, rating, card.createdAtMillis);
    assert.equal(storage.writes, before + 1);
    assert.equal(updated.intervalMillis, expected);
    assert.equal(updated.dueAtMillis, card.createdAtMillis + expected);
    assert.equal(updated.reps, 1);
    assert.equal(updated.lastRating, rating);
    assert.equal(log.sequence, 1);
    assert.equal(log.previousDueAtMillis, card.dueAtMillis);
    assert.equal(log.previousIntervalMillis, 0);
    assert.equal(log.nextDueAtMillis, updated.dueAtMillis);
    assert.equal(log.intervalMillis, expected);
    assert.equal(store.dueCards(updated.dueAtMillis - 1).length, 0);
    assert.equal(store.dueCards(updated.dueAtMillis).length, 1);
    const saved = JSON.parse(storage.value);
    assert.equal(saved.cards[0].reps, 1);
    assert.equal(saved.logs.length, 1);
  });
}

test('interval growth, hard multiplier, 365-day cap and again reset are deterministic', () => {
  const { store, card } = fixture();
  let updated = store.rateCard(card.id, 'good', card.createdAtMillis).card;
  updated = store.rateCard(card.id, 'good', updated.dueAtMillis).card;
  assert.equal(updated.intervalMillis, 2 * DAY);
  updated = store.rateCard(card.id, 'hard', updated.dueAtMillis).card;
  assert.equal(updated.intervalMillis, Math.ceil(2 * DAY * 1.2));
  for (let i = 0; i < 9; i += 1) updated = store.rateCard(card.id, 'easy', updated.dueAtMillis).card;
  assert.equal(updated.intervalMillis, 365 * DAY);
  updated = store.rateCard(card.id, 'again', updated.dueAtMillis).card;
  assert.equal(updated.intervalMillis, MINUTE);
  assert.equal(store.getSnapshot().logs.length, updated.reps);
});

test('same-time and rapid duplicate ratings are rejected without an extra log/write', () => {
  const { store, storage, card } = fixture();
  const now = card.createdAtMillis;
  store.rateCard(card.id, 'again', now);
  unchanged(store, storage, () => store.rateCard(card.id, 'again', now), 'CARD_NOT_DUE');
  unchanged(store, storage, () => store.rateCard(card.id, 'good', now + 1), 'CARD_NOT_DUE');
  unchanged(store, storage, () => store.rateCard(card.id, 'good', now + MINUTE - 1), 'CARD_NOT_DUE');
  assert.equal(store.getSnapshot().logs.length, 1);
});

test('rating validates enum, archived state, clock and supported date overflow', () => {
  const { store, storage, card } = fixture();
  for (const rating of ['GOOD', 3, null, 'fsrs', '']) {
    unchanged(store, storage, () => store.rateCard(card.id, rating, card.createdAtMillis), 'INVALID_INPUT');
  }
  for (const now of [NaN, Infinity, -1, 1.5, '2026-01-01', 8640000000000001]) {
    unchanged(store, storage, () => store.rateCard(card.id, 'good', now), 'INVALID_INPUT');
    fails(() => store.dueCards(now), 'INVALID_INPUT');
    fails(() => store.stats(now), 'INVALID_INPUT');
  }
  unchanged(store, storage, () => store.rateCard(card.id, 'good', card.createdAtMillis - 1), 'CLOCK_INVALID');
  unchanged(store, storage, () => store.rateCard(card.id, 'easy', 8640000000000000), 'CLOCK_INVALID');
  store.archive('cards', card.id);
  unchanged(store, storage, () => store.rateCard(card.id, 'good', Date.now()), 'ARCHIVED');
});

test('due cards are ordered by due time and stable ID without mutating snapshot order', () => {
  const { store, course, card } = fixture();
  const second = store.addCard({ courseId: course.id, front: 'f2', back: 'b2' });
  const third = store.addCard({ courseId: course.id, front: 'f3', back: 'b3' });
  store.rateCard(card.id, 'easy', third.createdAtMillis);
  store.rateCard(second.id, 'again', third.createdAtMillis);
  const order = store.getSnapshot().cards.map(item => item.id);
  const due = store.dueCards(third.createdAtMillis + 4 * DAY);
  assert.deepEqual(due.map(item => item.id), [third.id, second.id, card.id]);
  assert.deepEqual(store.getSnapshot().cards.map(item => item.id), order);
});

// Archival is reversible and never erases historical review state.
test('archive rejects active children; restore requires parents/sources in order', () => {
  const { store, storage, course, session, doubt, card } = fixture();
  unchanged(store, storage, () => store.archive('courses', course.id), 'ACTIVE_CHILDREN');
  unchanged(store, storage, () => store.archive('sessions', session.id), 'ACTIVE_CHILDREN');
  unchanged(store, storage, () => store.archive('doubts', doubt.id), 'ACTIVE_CHILDREN');
  store.archive('cards', card.id);
  store.archive('doubts', doubt.id);
  store.archive('sessions', session.id);
  const archived = store.archive('courses', course.id);
  assert.notEqual(archived.deletedAtMillis, null);
  assert.equal(store.stats().cards, 0);
  assert.equal(store.dueCards().length, 0);
  unchanged(store, storage, () => store.restore('cards', card.id), 'PARENT_ARCHIVED');
  unchanged(store, storage, () => store.restore('sessions', session.id), 'PARENT_ARCHIVED');
  unchanged(store, storage, () => store.restore('doubts', doubt.id), 'PARENT_ARCHIVED');
  store.restore('courses', course.id);
  unchanged(store, storage, () => store.restore('cards', card.id), 'PARENT_ARCHIVED');
  store.restore('sessions', session.id);
  unchanged(store, storage, () => store.restore('cards', card.id), 'PARENT_ARCHIVED');
  store.restore('doubts', doubt.id);
  const restored = store.restore('cards', card.id);
  assert.equal(restored.deletedAtMillis, null);
  assert.equal(restored.id, card.id);
  assert.equal(restored.createdAtMillis, card.createdAtMillis);
  assert.equal(restored.dueAtMillis, card.dueAtMillis);
  assert.deepEqual(createStore(storage).getSnapshot(), store.getSnapshot());
});

test('session-source cards block session archive even without doubts', () => {
  const store = createStore(memory());
  const course = store.addCourse({ name: 'Synthetic' });
  const session = store.addSession({ courseId: course.id, title: 'x', transcript: 'y' });
  const card = store.addCard({ courseId: course.id, sourceId: session.id, front: 'f', back: 'b' });
  fails(() => store.archive('sessions', session.id), 'ACTIVE_CHILDREN');
  store.archive('cards', card.id);
  store.archive('sessions', session.id);
  fails(() => store.addDoubt({ sessionId: session.id, sourceText: 'x' }), 'ARCHIVED');
  fails(() => store.restore('cards', card.id), 'PARENT_ARCHIVED');
});

test('historical logs do not block card archive; hidden reviews return on restore without schedule rewind', () => {
  const { store, storage, card } = fixture();
  const now = card.createdAtMillis;
  const result = store.rateCard(card.id, 'good', now);
  assert.equal(store.stats(now).reviews, 1);
  assert.equal(store.stats(now).reviewedToday, 1);
  store.archive('cards', card.id);
  assert.equal(store.stats(now).reviews, 0);
  assert.equal(store.stats(now).reviewedToday, 0);
  assert.equal(store.getSnapshot().logs[0].deletedAtMillis, null);
  assert.deepEqual(createStore(storage).getSnapshot(), store.getSnapshot());
  store.restore('cards', card.id);
  assert.equal(store.stats(now).reviews, 1);
  store.archive('logs', result.log.id);
  assert.equal(store.stats(now).reviews, 0);
  assert.equal(store.stats(now).archived.logs, 1);
  assert.equal(store.getSnapshot().cards[0].reps, 1);
  assert.equal(store.getSnapshot().cards[0].dueAtMillis, result.card.dueAtMillis);
  store.restore('logs', result.log.id);
  assert.equal(store.stats(now).reviews, 1);
  assert.equal(store.getSnapshot().cards[0].dueAtMillis, result.card.dueAtMillis);
});

test('idempotent archive/restore/settings/resolve make no extra writes', () => {
  const { store, storage, card, doubt } = fixture();
  store.restore('cards', card.id);
  store.updateSettings({ reduceMotion: false });
  assert.equal(storage.writes, 4);
  store.archive('cards', card.id);
  const afterArchive = storage.writes;
  store.archive('cards', card.id);
  assert.equal(storage.writes, afterArchive);
  store.resolveDoubt(doubt.id, 'Synthetic answer');
  const afterResolve = storage.writes;
  store.resolveDoubt(doubt.id, 'Synthetic answer');
  assert.equal(storage.writes, afterResolve);
});

test('stats distinguish open/resolved, archived, local-day reviews and future review timestamps', t => {
  const now = new Date(2026, 0, 5, 12).getTime();
  t.mock.method(Date, 'now', () => now);
  const { store, doubt, card } = fixture();
  store.resolveDoubt(doubt.id, 'Synthetic answer');
  store.rateCard(card.id, 'again', now);
  store.rateCard(card.id, 'good', now + 2 * MINUTE);
  assert.equal(store.stats(now).openDoubts, 0);
  assert.equal(store.stats(now).resolvedDoubts, 1);
  assert.equal(store.stats(now).reviews, 2);
  assert.equal(store.stats(now).reviewedToday, 1);
  assert.equal(store.stats(now + 2 * MINUTE).reviewedToday, 2);
  assert.equal(store.stats(now + DAY).reviewedToday, 0);
});

// Persistence must publish nothing until the one snapshot write succeeds.
test('read failures and corrupt/unsupported storage fail visibly without resetting or writing', () => {
  for (const invalid of [null, false, 0, {}, [], 'null', '{}', '[]', '{bad', ' ', JSON.stringify({ version: 2 }), 'x'.repeat(1048577)]) {
    const storage = memory(invalid);
    fails(() => createStore(storage), 'STORAGE_CORRUPT');
    assert.equal(storage.value, invalid);
    assert.equal(storage.writes, 0);
  }
  const storage = memory();
  storage.failRead = true;
  fails(() => createStore(storage), 'STORAGE_READ_FAILED');
  assert.equal(storage.writes, 0);
  for (const invalid of [null, {}, { getStorageSync() {} }]) fails(() => createStore(invalid), 'INVALID_STORAGE');
});

test('every mutator rolls back in memory and storage on persistence failure, then retries safely', () => {
  const operations = [
    value => value.store.addCourse({ name: 'Another synthetic course' }),
    value => value.store.addSession({ courseId: value.course.id, title: 'x', transcript: 'y' }),
    value => value.store.addDoubt({ sessionId: value.session.id, sourceText: 'x' }),
    value => value.store.resolveDoubt(value.doubt.id, 'Synthetic answer'),
    value => value.store.addCard({ courseId: value.course.id, front: 'f', back: 'b' }),
    value => value.store.rateCard(value.card.id, 'good', value.card.createdAtMillis),
    value => value.store.updateSettings({ reduceMotion: true }),
    value => value.store.archive('cards', value.card.id),
    value => value.store.importBackup(fixture().store.exportBackup()),
  ];
  for (const operation of operations) {
    const value = fixture();
    value.storage.failWrite = true;
    unchanged(value.store, value.storage, () => operation(value), 'STORAGE_WRITE_FAILED');
    value.storage.failWrite = false;
    const before = value.storage.writes;
    operation(value);
    assert.equal(value.storage.writes, before + 1);
  }
  const value = fixture();
  value.store.archive('cards', value.card.id);
  value.storage.failWrite = true;
  unchanged(value.store, value.storage, () => value.store.restore('cards', value.card.id), 'STORAGE_WRITE_FAILED');
  const storage = memory();
  const store = createStore(storage);
  storage.failWrite = true;
  unchanged(store, storage, () => store.seedDemo(), 'STORAGE_WRITE_FAILED');
  storage.failWrite = false;
  store.seedDemo();
  assert.equal(storage.writes, 1);
});

test('storage read failure during a mutation leaves the prior memory snapshot untouched', () => {
  const { store, storage } = fixture();
  storage.failRead = true;
  unchanged(store, storage, () => store.updateSettings({ reduceMotion: true }), 'STORAGE_READ_FAILED');
  storage.failRead = false;
  store.updateSettings({ reduceMotion: true });
  assert.equal(store.getSnapshot().settings.reduceMotion, true);
});

test('stale store instances cannot overwrite records or duplicate a review', () => {
  const { store, storage, card } = fixture();
  const stale = createStore(storage);
  store.rateCard(card.id, 'good', card.createdAtMillis);
  unchanged(stale, storage, () => stale.rateCard(card.id, 'good', card.createdAtMillis), 'STALE_STORE');
  unchanged(stale, storage, () => stale.addCourse({ name: 'Stale synthetic addition' }), 'STALE_STORE');
  const reopened = createStore(storage);
  fails(() => reopened.rateCard(card.id, 'good', card.createdAtMillis), 'CARD_NOT_DUE');
  assert.equal(reopened.getSnapshot().logs.length, 1);
});

test('adapter re-entrancy is rejected while the original atomic write can finish', () => {
  const { store, storage } = fixture();
  let attempted = false;
  storage.onWrite = () => {
    attempted = true;
    fails(() => store.addCourse({ name: 'Reentrant synthetic input' }), 'STORE_BUSY');
  };
  store.updateSettings({ reduceMotion: true });
  assert.equal(attempted, true);
  assert.equal(store.getSnapshot().courses.length, 1);
  assert.equal(store.getSnapshot().settings.reduceMotion, true);
});

// Backup validation, merge behavior and bounded growth.
test('backup round-trip retains history and tombstones; merges append, skip identical IDs and preserve settings', () => {
  const { store: source, card } = fixture();
  source.rateCard(card.id, 'hard', card.createdAtMillis);
  source.archive('cards', card.id);
  source.updateSettings({ reduceMotion: true });
  const storage = memory();
  const target = createStore(storage);
  target.addCourse({ name: 'Existing synthetic local course' });
  const before = storage.writes;
  const result = target.importBackup(source.exportBackup());
  assert.deepEqual(result.added, { courses: 1, sessions: 1, doubts: 1, cards: 1, logs: 1 });
  assert.equal(result.skipped, 0);
  assert.equal(storage.writes, before + 1);
  assert.equal(target.getSnapshot().settings.reduceMotion, false);
  assert.equal(target.getSnapshot().courses.length, 2);
  assert.notEqual(target.getSnapshot().cards[0].deletedAtMillis, null);
  assert.deepEqual(target.getSnapshot().logs, source.getSnapshot().logs);
  const second = target.importBackup(source.exportBackup());
  assert.equal(second.skipped, 5);
  assert.deepEqual(second.added, { courses: 0, sessions: 0, doubts: 0, cards: 0, logs: 0 });
  assert.equal(storage.writes, before + 1);
  assert.deepEqual(createStore(storage).getSnapshot(), target.getSnapshot());
});

test('conflicting IDs never overwrite, partially append, resurrect or rewind local data', () => {
  const { store, storage, card } = fixture();
  const old = store.exportBackup();
  const conflicting = JSON.parse(old);
  conflicting.courses.unshift({ ...conflicting.courses[0], id: fakeId(101), name: 'Would append first' });
  conflicting.courses[1].name = 'Conflicting edit';
  unchanged(store, storage, () => store.importBackup(JSON.stringify(conflicting)), 'ID_CONFLICT');
  store.archive('cards', card.id);
  unchanged(store, storage, () => store.importBackup(old), 'ID_CONFLICT');
  store.restore('cards', card.id);
  store.rateCard(card.id, 'good', Date.now());
  unchanged(store, storage, () => store.importBackup(old), 'ID_CONFLICT');
});

test('unknown imported fields and prototype keys are stripped at every level', () => {
  const { store: source, card } = fixture();
  source.rateCard(card.id, 'good', card.createdAtMillis);
  const data = source.getSnapshot();
  data.cloudToken = 'synthetic-not-a-token';
  data.settings.upload = true;
  Object.defineProperty(data, '__proto__', { value: { polluted: true }, enumerable: true });
  for (const kind of KINDS) {
    data[kind][0].unknown = { nested: 'synthetic' };
    data[kind][0].constructor = { prototype: { polluted: true } };
    data[kind][0].audioBlob = 'synthetic-not-audio';
  }
  const target = createStore(memory());
  target.importBackup(JSON.stringify(data));
  assert.deepEqual(target.getSnapshot(), source.getSnapshot());
  assert.equal({}.polluted, undefined);
  assert.ok(!target.exportBackup().includes('synthetic-not-a-token'));
});

test('plain text is never evaluated or converted to HTML; exported markup is escaped and round-trips', () => {
  const store = createStore(memory());
  const payload = '</script><img src=x onerror=alert(1)>&\u2028';
  const course = store.addCourse({ name: 'Synthetic security sample' });
  store.addSession({ courseId: course.id, title: 'Synthetic markup as text', transcript: payload + ' end' });
  const backup = store.exportBackup();
  assert.ok(!backup.includes('<'));
  assert.ok(!backup.includes('>'));
  assert.ok(!backup.includes('&'));
  assert.ok(!backup.includes('\u2028'));
  assert.equal(JSON.parse(backup).sessions[0].transcript, payload + ' end');
  const target = createStore(memory());
  target.importBackup(backup);
  assert.equal(target.getSnapshot().sessions[0].transcript, payload + ' end');
});

const invalidSchemaCases = [
  ['version', data => { data.version = 2; }],
  ['version type', data => { data.version = '1'; }],
  ['scheduler', data => { data.scheduler = 'FSRS'; }],
  ['settings type', data => { data.settings.reduceMotion = 1; }],
  ['missing root array', data => { delete data.logs; }],
  ['non-array table', data => { data.cards = {}; }],
  ['missing nullable field', data => { delete data.cards[0].deletedAtMillis; }],
  ['UUID format', data => { data.courses[0].id = '1'; }],
  ['UUID newline', data => { data.courses[0].id += '\n'; }],
  ['UUID version', data => { data.courses[0].id = '00000000-0000-1000-8000-000000000001'; }],
  ['date string', data => { data.courses[0].createdAtMillis = '2026-01-01'; }],
  ['date negative', data => { data.courses[0].createdAtMillis = -1; }],
  ['date fractional', data => { data.courses[0].createdAtMillis = 0.5; }],
  ['date overflow', data => { data.courses[0].updatedAtMillis = 8640000000000001; }],
  ['date order', data => { data.courses[0].updatedAtMillis = data.courses[0].createdAtMillis - 1; }],
  ['deleted date order', data => { data.cards[0].deletedAtMillis = data.cards[0].updatedAtMillis + 1; }],
  ['parent created later', data => { data.sessions[0].createdAtMillis = data.courses[0].createdAtMillis - 1; }],
  ['missing course relation', data => { data.sessions[0].courseId = fakeId(1001); }],
  ['missing session relation', data => { data.doubts[0].sessionId = fakeId(1002); }],
  ['missing source relation', data => { data.cards[0].sourceId = fakeId(1003); }],
  ['invalid source kind', data => { data.cards[0].sourceId = data.courses[0].id; }],
  ['missing log relation', data => { data.logs[0].cardId = fakeId(1004); }],
  ['archived parent with active child', data => { data.courses[0].deletedAtMillis = data.courses[0].createdAtMillis; }],
  ['archived source with active card', data => { data.doubts[0].deletedAtMillis = data.doubts[0].createdAtMillis; }],
  ['recording mode', data => { data.sessions[0].inputMode = 'RECORDING'; }],
  ['AI origin', data => { data.cards[0].origin = 'AI'; }],
  ['status enum', data => { data.doubts[0].status = 'unknown'; }],
  ['open doubt answer', data => { data.doubts[0].answer = 'Unexpected answer'; }],
  ['resolved doubt empty answer', data => { data.doubts[0].status = 'RESOLVED'; data.doubts[0].resolvedAtMillis = data.doubts[0].createdAtMillis; }],
  ['resolution chronology', data => { data.doubts[0].status = 'RESOLVED'; data.doubts[0].answer = 'Synthetic'; data.doubts[0].resolvedAtMillis = data.doubts[0].updatedAtMillis + 1; }],
  ['content bound', data => { data.courses[0].name = 'n'.repeat(81); }],
  ['content control character', data => { data.cards[0].front = 'x\u0000y'; }],
  ['numeric rating', data => { data.logs[0].rating = 3; }],
  ['review sequence', data => { data.logs[0].sequence = 2; }],
  ['review count', data => { data.cards[0].reps = 2; }],
  ['missing review history', data => { data.logs = []; }],
  ['review before due', data => { data.logs[0].previousDueAtMillis = data.logs[0].reviewedAtMillis + 1; }],
  ['bad next due', data => { data.logs[0].nextDueAtMillis += 1; }],
  ['bad interval', data => { data.logs[0].previousIntervalMillis = 1; }],
  ['mismatching last rating', data => { data.cards[0].lastRating = 'easy'; }],
  ['mismatching card schedule', data => { data.cards[0].dueAtMillis += 1; }],
];
for (const [name, mutate] of invalidSchemaCases) {
  test(`strict backup rejects ${name} atomically`, () => {
    const { store: source, card } = fixture();
    source.rateCard(card.id, 'good', card.createdAtMillis);
    const data = source.getSnapshot();
    mutate(data);
    const { store, storage } = fixture();
    unchanged(store, storage, () => store.importBackup(JSON.stringify(data)), 'INVALID_BACKUP');
  });
}

test('strict backup rejects malformed JSON, arrays, null, non-string and missing required fields', () => {
  const { store, storage } = fixture();
  for (const invalid of ['', '{bad', 'null', '[]', '{}', 123, null, {}, undefined]) {
    unchanged(store, storage, () => store.importBackup(invalid), 'INVALID_BACKUP');
  }
  const valid = store.getSnapshot();
  for (const kind of ['courses', 'sessions', 'doubts', 'cards']) {
    for (const field of Object.keys(valid[kind][0])) {
      const malformed = copy(valid);
      delete malformed[kind][0][field];
      unchanged(store, storage, () => store.importBackup(JSON.stringify(malformed)), 'INVALID_BACKUP');
    }
  }
});

test('duplicate IDs within/across tables and mixed-case aliases are rejected', () => {
  const { store, storage } = fixture();
  for (const mutate of [
    data => data.courses.push(copy(data.courses[0])),
    data => data.courses.push({ ...data.courses[0], id: data.courses[0].id.toUpperCase() }),
    data => { data.sessions[0].id = data.courses[0].id; },
  ]) {
    const data = store.getSnapshot();
    mutate(data);
    unchanged(store, storage, () => store.importBackup(JSON.stringify(data)), 'ID_CONFLICT');
  }
});

test('cross-course card provenance is rejected on backup import too', () => {
  const { store, storage, course } = fixture();
  const other = store.addCourse({ name: 'Other synthetic' });
  const data = store.getSnapshot();
  data.cards[0].courseId = other.id;
  // Keep creation chronology valid so only source provenance is under test.
  data.courses.find(item => item.id === other.id).createdAtMillis = course.createdAtMillis;
  unchanged(store, storage, () => store.importBackup(JSON.stringify(data)), 'INVALID_BACKUP');
});

test('backup size is bounded by UTF-8 bytes, not JS characters, before parsing', () => {
  const { store, storage } = fixture();
  unchanged(store, storage, () => store.importBackup('x'.repeat(1048577)), 'BACKUP_TOO_LARGE');
  const cjk = JSON.stringify({ synthetic: '中'.repeat(350000) });
  assert.ok(cjk.length < 1048576 && Buffer.byteLength(cjk, 'utf8') > 1048576);
  unchanged(store, storage, () => store.importBackup(cjk), 'BACKUP_TOO_LARGE');
  const astral = JSON.stringify({ synthetic: '\u{1f4da}'.repeat(263000) });
  assert.ok(astral.length < 1048576 && Buffer.byteLength(astral, 'utf8') > 1048576);
  unchanged(store, storage, () => store.importBackup(astral), 'BACKUP_TOO_LARGE');
});

test('cumulative Chinese text reaches the 750 KiB snapshot cap and rejects the next write without mutation', () => {
  const storage = memory();
  const store = createStore(storage);
  const course = store.addCourse({ name: '合成容量测试课程' });
  for (let i = 0; i < 8; i += 1) store.addSession({ courseId: course.id, title: '合成文本', transcript: '中'.repeat(30000) });
  assert.ok(Buffer.byteLength(storage.value, 'utf8') < CAP);
  assert.ok(storage.value.length < CAP / 2);
  unchanged(store, storage, () => store.addSession({ courseId: course.id, title: '合成文本', transcript: '中'.repeat(30000) }), 'LIMIT_EXCEEDED');
  assert.equal(store.getSnapshot().sessions.length, 8);
  assert.deepEqual(createStore(storage).getSnapshot(), store.getSnapshot());
});

test('merged snapshots and JSON escaping expansion also obey the total storage cap', () => {
  function largeStore(character, count) {
    const storage = memory();
    const store = createStore(storage);
    const course = store.addCourse({ name: 'Synthetic size fixture' });
    for (let i = 0; i < count; i += 1) store.addSession({ courseId: course.id, title: 'Synthetic', transcript: character.repeat(30000) });
    return { store, storage, course };
  }
  const local = largeStore('中', 5);
  const remote = largeStore('中', 5);
  unchanged(local.store, local.storage, () => local.store.importBackup(remote.store.exportBackup()), 'LIMIT_EXCEEDED');
  const escaped = largeStore('<', 4);
  unchanged(escaped.store, escaped.storage, () => escaped.store.addSession({ courseId: escaped.course.id, title: 'Synthetic', transcript: '<'.repeat(30000) }), 'LIMIT_EXCEEDED');
});

test('all entity counts are bounded on import and CRUD cannot exceed course count', () => {
  const { store: source, card } = fixture();
  source.rateCard(card.id, 'good', card.createdAtMillis);
  const limits = { courses: 100, sessions: 500, doubts: 1000, cards: 2000, logs: 5000 };
  for (const kind of KINDS) {
    const data = source.getSnapshot();
    // Deliberately tiny records prove count rejection happens before per-record validation.
    data[kind] = Array.from({ length: limits[kind] + 1 }, () => ({}));
    const storage = memory();
    const store = createStore(storage);
    unchanged(store, storage, () => store.importBackup(JSON.stringify(data)), 'LIMIT_EXCEEDED');
  }
  const storage = memory();
  const store = createStore(storage);
  for (let i = 0; i < 100; i += 1) store.addCourse({ name: 'Synthetic ' + i });
  unchanged(store, storage, () => store.addCourse({ name: 'Synthetic overflow' }), 'LIMIT_EXCEEDED');
  store.archive('courses', store.getSnapshot().courses[0].id);
  unchanged(store, storage, () => store.addCourse({ name: 'Archive does not free capacity' }), 'LIMIT_EXCEEDED');
});

test('demo is explicit, synthetic, one-write and never silently replaces existing/archived data', () => {
  const storage = memory();
  const store = createStore(storage);
  const demo = store.seedDemo();
  assert.equal(storage.writes, 1);
  assert.equal(demo.courses.length, 1);
  assert.equal(demo.sessions.length, 1);
  assert.equal(demo.doubts.length, 1);
  assert.equal(demo.cards.length, 2);
  assert.equal(demo.logs.length, 0);
  assert.ok(demo.cards.every(card => card.origin === 'DEMO'));
  assert.match(demo.sessions[0].transcript, /合成示例/);
  assert.equal(demo.sessions[0].inputMode, 'MANUAL_TEXT');
  demo.cards.length = 0;
  assert.equal(store.getSnapshot().cards.length, 2);
  unchanged(store, storage, () => store.seedDemo(), 'DEMO_REQUIRES_EMPTY');
  const other = createStore(memory());
  const course = other.addCourse({ name: 'Synthetic' });
  other.archive('courses', course.id);
  fails(() => other.seedDemo(), 'DEMO_REQUIRES_EMPTY');
});

// Runtime isolation: no Node dependencies, network, cloud, console or audio in core.
test('Date/random UUID fallback works offline even with frozen time and repeated random values', () => {
  const source = fs.readFileSync(path.join(__dirname, '../lib/store.js'), 'utf8');
  const module = { exports: {} };
  class FixedDate extends Date { static now() { return 1760000000000; } }
  const math = Object.create(Math);
  math.random = () => 0.25;
  const context = {
    module, Date: FixedDate, Math: math,
    wx: new Proxy({}, { get() { throw new Error('unexpected wx capability'); } }),
    fetch() { throw new Error('unexpected network'); },
    require() { throw new Error('unexpected dependency'); },
    console: new Proxy({}, { get() { throw new Error('unexpected logging'); } }),
  };
  vm.runInNewContext(source, context, { filename: 'store.js' });
  const storage = memory();
  const store = module.exports.createStore(storage);
  for (let i = 0; i < 25; i += 1) store.addCourse({ name: 'Synthetic fallback ' + i });
  const cards = store.seedDemo;
  assert.equal(typeof cards, 'function');
  const ids = store.getSnapshot().courses.map(item => item.id);
  ids.forEach(id => { assert.equal(id.length, 36); assert.match(id, UUID); });
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(!/\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(|\bwx\.(?:request|cloud|uploadFile|getRecorderManager)\b/.test(source));
  assert.match(source, /never an authentication ID/);
});

test('repository uses only lazy synchronous wx storage, caches singleton and exposes initialization failures', () => {
  const source = fs.readFileSync(path.join(__dirname, '../lib/repository.js'), 'utf8');
  const storage = memory();
  const allowed = new Proxy(storage, {
    get(target, key) {
      if (key !== 'getStorageSync' && key !== 'setStorageSync') throw new Error('unexpected wx API');
      return (...args) => target[key](...args);
    },
  });
  function load(wxValue) {
    const module = { exports: {} };
    vm.runInNewContext(source, {
      module, wx: wxValue,
      require(name) { assert.equal(name, './store'); return { createStore }; },
    });
    return module.exports;
  }
  const repository = load(allowed);
  assert.equal(storage.reads, 0);
  assert.equal(storage.writes, 0);
  const store = repository.getStore();
  assert.equal(repository.getStore(), store);
  assert.equal(storage.reads, 1);
  store.addCourse({ name: 'Synthetic adapter check' });
  assert.equal(storage.writes, 1);
  fails(() => load(undefined).getStore(), 'WX_UNAVAILABLE');
  const corrupt = memory('{bad');
  const retryable = load(corrupt);
  fails(() => retryable.getStore(), 'STORAGE_CORRUPT');
  assert.equal(corrupt.writes, 0);
  corrupt.value = undefined;
  assert.equal(retryable.getStore().getSnapshot().courses.length, 0);
});
