'use strict';

// Offline data only. All content is UNTRUSTED PLAIN TEXT: render with WXML
// <text> bindings, never rich-text/HTML. No audio, accounts, analytics or cloud.
const STORAGE_KEY = 'zhixi.miniprogram.offline.v1';
const SCHEDULER = 'spaced-interval-v1'; // A simple interval policy, NOT FSRS.
const MAX_BYTES = 1024 * 1024; // Backup input limit, UTF-8 bytes.
const MAX_SNAPSHOT_BYTES = 750 * 1024; // Leave room under wx's 1 MiB per-key limit.
const TEXT_LIMITS = { name: 80, teacher: 80, language: 80, title: 120, transcript: 30000, sourceText: 2000, note: 2000, front: 2000, back: 4000, answer: 4000 };
const MAX_DATE = 8640000000000000;
const MINUTE = 60000;
const DAY = 86400000;
const MAX_INTERVAL = 365 * DAY;
const KINDS = ['courses', 'sessions', 'doubts', 'cards', 'logs'];
const LIMITS = { courses: 100, sessions: 500, doubts: 1000, cards: 2000, logs: 5000 };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RATINGS = ['again', 'hard', 'good', 'easy'];
const locks = new WeakSet();
let uuidSequence = 0;

const MESSAGES = {
  INVALID_STORAGE: '本地存储不可用，需要同步读写适配器。',
  STORAGE_READ_FAILED: '无法读取本地数据，未重置任何数据，请稍后重试。',
  STORAGE_CORRUPT: '本地数据损坏或版本不受支持，未重置任何数据，请保留原数据并寻求帮助。',
  STORAGE_WRITE_FAILED: '本地保存失败，本次更改未生效，请检查存储空间后重试。',
  STALE_STORE: '本地数据已在其他实例中更改，请重新打开小程序后重试。',
  STORE_BUSY: '正在保存本地数据，请稍后重试。',
  INVALID_INPUT: '输入无效，请检查必填内容、长度、类型和日期。',
  INVALID_BACKUP: '备份格式、日期、关联关系或复习记录无效，未导入任何数据。',
  BACKUP_TOO_LARGE: '备份超过 1 MiB（UTF-8 字节）上限，无法导入。',
  LIMIT_EXCEEDED: '数据已达条数或 750 KiB 本地快照上限，请先导出备份；归档不会释放空间，分库存储需后续版本支持。',
  ID_CONFLICT: '记录编号重复或与已有记录冲突，未导入任何数据。',
  ID_GENERATION_FAILED: '无法生成唯一的本地记录编号，请重试。',
  NOT_FOUND: '找不到该记录，请返回列表刷新。',
  ARCHIVED: '该记录已归档，请先从回收站恢复。',
  INVALID_RELATIONSHIP: '卡片来源必须属于同一课程。',
  ACTIVE_CHILDREN: '请先归档关联卡片、疑问及文字资料，再归档上级记录。',
  PARENT_ARCHIVED: '请先恢复所属课程、文字资料及来源疑问，再恢复此记录。',
  CARD_NOT_DUE: '这张卡片尚未到期，本次评分未保存。',
  CLOCK_INVALID: '复习时间早于上次更新或超出日期范围，请检查设备时间。',
  DEMO_REQUIRES_EMPTY: '仅空白资料库可以添加演示数据，已有数据不会被覆盖。',
};

function fail(code) {
  const error = new Error(MESSAGES[code]);
  error.code = code;
  throw error;
}
function check(ok, code = 'INVALID_INPUT') {
  if (!ok) fail(code);
}
function object(value) {
  check(value !== null && typeof value === 'object' && !Array.isArray(value));
  return value;
}
function own(value, key) {
  check(Object.prototype.hasOwnProperty.call(value, key));
  return value[key];
}
function text(value, max, allowEmpty = false) {
  check(typeof value === 'string' && value.length <= max);
  // Reject non-text control characters; tabs and line breaks remain useful.
  check(!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value));
  const result = value.trim();
  check(allowEmpty || result.length > 0);
  return result;
}
function integer(value, max = MAX_DATE) {
  check(Number.isSafeInteger(value) && value >= 0 && value <= max);
  return value;
}
function uuid(value) {
  check(typeof value === 'string' && value.length === 36 && UUID.test(value));
  return value.toLowerCase();
}
function nullableDate(value) {
  return value === null ? null : integer(value);
}
function choice(value, choices) {
  check(choices.includes(value));
  return value;
}
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
function utf8Bytes(value) {
  let bytes = 0;
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && i + 1 < value.length &&
      value.charCodeAt(i + 1) >= 0xdc00 && value.charCodeAt(i + 1) <= 0xdfff) {
      bytes += 4;
      i += 1;
    } else bytes += 3;
  }
  return bytes;
}
function serialize(snapshot) {
  // Defense in depth for exports: JSON stays data, even if embedded in HTML.
  const result = JSON.stringify(snapshot).replace(/[<>&\u2028\u2029]/g,
    character => '\\u' + character.charCodeAt(0).toString(16).padStart(4, '0'));
  check(result.length <= MAX_SNAPSHOT_BYTES && utf8Bytes(result) <= MAX_SNAPSHOT_BYTES, 'LIMIT_EXCEEDED');
  return result;
}
function emptySnapshot() {
  return {
    version: 1,
    scheduler: SCHEDULER,
    settings: { reduceMotion: false },
    courses: [], sessions: [], doubts: [], cards: [], logs: [],
  };
}
function base(record) {
  object(record);
  const result = {
    id: uuid(own(record, 'id')),
    createdAtMillis: integer(own(record, 'createdAtMillis')),
    updatedAtMillis: integer(own(record, 'updatedAtMillis')),
    deletedAtMillis: nullableDate(own(record, 'deletedAtMillis')),
  };
  check(result.createdAtMillis <= result.updatedAtMillis);
  check(result.deletedAtMillis === null || (result.deletedAtMillis >= result.createdAtMillis &&
    result.deletedAtMillis <= result.updatedAtMillis));
  return result;
}
function normalizeRecord(kind, record) {
  const result = base(record);
  const get = key => own(record, key);
  if (kind === 'courses') {
    result.name = text(get('name'), TEXT_LIMITS.name);
    result.teacher = text(get('teacher'), TEXT_LIMITS.teacher, true);
    result.language = text(get('language'), TEXT_LIMITS.language, true);
  } else if (kind === 'sessions') {
    result.courseId = uuid(get('courseId'));
    result.title = text(get('title'), TEXT_LIMITS.title);
    result.transcript = text(get('transcript'), TEXT_LIMITS.transcript);
    result.inputMode = choice(get('inputMode'), ['MANUAL_TEXT']);
  } else if (kind === 'doubts') {
    result.sessionId = uuid(get('sessionId'));
    result.sourceText = text(get('sourceText'), TEXT_LIMITS.sourceText);
    result.note = text(get('note'), TEXT_LIMITS.note, true);
    result.status = choice(get('status'), ['OPEN', 'RESOLVED']);
    result.answer = text(get('answer'), TEXT_LIMITS.answer, true);
    result.resolvedAtMillis = nullableDate(get('resolvedAtMillis'));
    if (result.status === 'OPEN') {
      check(result.answer === '' && result.resolvedAtMillis === null);
    } else {
      check(result.answer.length > 0 && result.resolvedAtMillis !== null &&
        result.resolvedAtMillis >= result.createdAtMillis && result.resolvedAtMillis <= result.updatedAtMillis);
    }
  } else if (kind === 'cards') {
    result.courseId = uuid(get('courseId'));
    result.front = text(get('front'), TEXT_LIMITS.front);
    result.back = text(get('back'), TEXT_LIMITS.back);
    result.sourceId = get('sourceId') === null ? null : uuid(get('sourceId'));
    result.origin = choice(get('origin'), ['MANUAL', 'DEMO']);
    result.dueAtMillis = integer(get('dueAtMillis'));
    result.intervalMillis = integer(get('intervalMillis'), MAX_INTERVAL);
    result.reps = integer(get('reps'), LIMITS.logs);
    result.lastReviewedAtMillis = nullableDate(get('lastReviewedAtMillis'));
    result.lastRating = get('lastRating') === null ? null : choice(get('lastRating'), RATINGS);
    check(result.dueAtMillis >= result.createdAtMillis);
    if (result.reps === 0) {
      check(result.lastReviewedAtMillis === null && result.lastRating === null &&
        result.intervalMillis === 0 && result.dueAtMillis === result.createdAtMillis);
    } else {
      check(result.lastReviewedAtMillis !== null && result.lastRating !== null &&
        result.lastReviewedAtMillis >= result.createdAtMillis &&
        result.lastReviewedAtMillis <= result.updatedAtMillis && result.intervalMillis >= MINUTE &&
        result.dueAtMillis === result.lastReviewedAtMillis + result.intervalMillis);
    }
  } else {
    result.cardId = uuid(get('cardId'));
    result.rating = choice(get('rating'), RATINGS);
    result.sequence = integer(get('sequence'), LIMITS.logs);
    result.reviewedAtMillis = integer(get('reviewedAtMillis'));
    result.previousDueAtMillis = integer(get('previousDueAtMillis'));
    result.nextDueAtMillis = integer(get('nextDueAtMillis'));
    result.previousIntervalMillis = integer(get('previousIntervalMillis'), MAX_INTERVAL);
    result.intervalMillis = integer(get('intervalMillis'), MAX_INTERVAL);
    check(result.sequence > 0 && result.reviewedAtMillis === result.createdAtMillis &&
      result.previousDueAtMillis <= result.reviewedAtMillis &&
      result.nextDueAtMillis === result.reviewedAtMillis + result.intervalMillis);
  }
  return result;
}

// again: 1 minute; hard: max(10 minutes, ceil(previous * 1.2));
// good: max(1 day, previous * 2); easy: max(3 days, previous * 3).
// All intervals are capped at 365 days and measured from the actual review.
function intervalFor(rating, previous) {
  if (rating === 'again') return MINUTE;
  if (rating === 'hard') return Math.min(MAX_INTERVAL, Math.max(10 * MINUTE, Math.ceil(previous * 1.2)));
  if (rating === 'good') return Math.min(MAX_INTERVAL, Math.max(DAY, previous * 2));
  return Math.min(MAX_INTERVAL, Math.max(3 * DAY, previous * 3));
}
function active(record) {
  return record.deletedAtMillis === null;
}
function validateRelationships(snapshot) {
  const all = new Map();
  const tables = {};
  KINDS.forEach(kind => {
    tables[kind] = new Map();
    snapshot[kind].forEach(record => {
      check(!all.has(record.id), 'ID_CONFLICT');
      all.set(record.id, record);
      tables[kind].set(record.id, record);
    });
  });
  function parent(child, table, id, historical = false) {
    const record = table.get(id);
    check(record && child.createdAtMillis >= record.createdAtMillis);
    check(historical || !active(child) || active(record));
    return record;
  }
  snapshot.sessions.forEach(session => parent(session, tables.courses, session.courseId));
  snapshot.doubts.forEach(doubt => parent(doubt, tables.sessions, doubt.sessionId));
  snapshot.cards.forEach(card => {
    parent(card, tables.courses, card.courseId);
    if (card.sourceId !== null) {
      const source = tables.sessions.get(card.sourceId) || tables.doubts.get(card.sourceId);
      check(source);
      parent(card, all, card.sourceId);
      const courseId = tables.sessions.has(source.id) ? source.courseId : tables.sessions.get(source.sessionId).courseId;
      check(courseId === card.courseId);
    }
  });
  const histories = new Map();
  snapshot.logs.forEach(log => {
    parent(log, tables.cards, log.cardId, true); // Logs survive card/course archival.
    if (!histories.has(log.cardId)) histories.set(log.cardId, []);
    histories.get(log.cardId).push(log);
  });
  snapshot.cards.forEach(card => {
    const history = (histories.get(card.id) || []).sort((a, b) => a.sequence - b.sequence);
    check(history.length === card.reps);
    let due = card.createdAtMillis;
    let interval = 0;
    history.forEach((log, index) => {
      check(log.sequence === index + 1 && log.previousDueAtMillis === due &&
        log.previousIntervalMillis === interval && log.intervalMillis === intervalFor(log.rating, interval));
      due = log.nextDueAtMillis;
      interval = log.intervalMillis;
    });
    check(card.dueAtMillis === due && card.intervalMillis === interval);
    if (history.length) {
      const last = history[history.length - 1];
      check(card.lastReviewedAtMillis === last.reviewedAtMillis && card.lastRating === last.rating);
    }
  });
}
function normalizeSnapshot(value) {
  object(value);
  check(own(value, 'version') === 1 && own(value, 'scheduler') === SCHEDULER);
  const settings = object(own(value, 'settings'));
  check(typeof own(settings, 'reduceMotion') === 'boolean');
  // Reconstruct every object explicitly: unknown/prototype keys never enter state.
  const result = emptySnapshot();
  result.settings.reduceMotion = settings.reduceMotion;
  KINDS.forEach(kind => {
    const records = own(value, kind);
    check(Array.isArray(records));
    check(records.length <= LIMITS[kind], 'LIMIT_EXCEEDED');
    result[kind] = records.map(record => normalizeRecord(kind, record));
  });
  validateRelationships(result);
  return result;
}
function parseBackup(value) {
  check(typeof value === 'string', 'INVALID_BACKUP');
  check(value.length <= MAX_BYTES && utf8Bytes(value) <= MAX_BYTES, 'BACKUP_TOO_LARGE');
  try {
    return normalizeSnapshot(JSON.parse(value));
  } catch (error) {
    if (error.code === 'ID_CONFLICT' || error.code === 'LIMIT_EXCEEDED') throw error;
    fail('INVALID_BACKUP');
  }
}
function readStorage(storage) {
  try {
    return storage.getStorageSync(STORAGE_KEY);
  } catch (_) {
    fail('STORAGE_READ_FAILED');
  }
}
function absent(value) {
  // wx returns '' for a missing key; test adapters may return undefined.
  // null, false, {}, etc. are corruption, not permission to erase old data.
  return value === undefined || value === '';
}
function sameStoredValue(left, right) {
  return left === right || (absent(left) && absent(right));
}
function makeUuid() {
  // Local record identity ONLY, never an authentication ID/token. The Date/
  // Math.random fallback is deliberately not advertised as cryptographically secure.
  const random = typeof crypto !== 'undefined' ? crypto : null;
  if (random && typeof random.randomUUID === 'function') return random.randomUUID().toLowerCase();
  const bytes = new Uint8Array(16);
  if (random && typeof random.getRandomValues === 'function') random.getRandomValues(bytes);
  else {
    for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
    let stamp = Date.now();
    for (let i = 0; i < 6; i += 1) {
      bytes[i] ^= stamp % 256;
      stamp = Math.floor(stamp / 256);
    }
    uuidSequence = (uuidSequence + 1) >>> 0;
    for (let i = 0; i < 4; i += 1) bytes[12 + i] ^= (uuidSequence >>> (i * 8)) & 255;
  }
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
}
function newBase(snapshot, now) {
  const used = new Set();
  KINDS.forEach(kind => snapshot[kind].forEach(record => used.add(record.id)));
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const id = makeUuid();
    if (UUID.test(id) && !used.has(id)) return { id, createdAtMillis: now, updatedAtMillis: now, deletedAtMillis: null };
  }
  fail('ID_GENERATION_FAILED');
}
function changeTime(snapshot) {
  // Preserve monotonic entity dates even when a device clock moves backwards.
  let now = integer(Date.now());
  KINDS.forEach(kind => snapshot[kind].forEach(record => { now = Math.max(now, record.updatedAtMillis); }));
  return now;
}
function find(snapshot, kind, id, requireActive = true) {
  const normalizedId = uuid(id);
  const record = snapshot[kind].find(item => item.id === normalizedId);
  check(record, 'NOT_FOUND');
  check(!requireActive || active(record), 'ARCHIVED');
  return record;
}
function courseRecord(snapshot, input, now) {
  object(input);
  return Object.assign(newBase(snapshot, now), {
    name: text(input.name, TEXT_LIMITS.name),
    teacher: text(input.teacher === undefined ? '' : input.teacher, TEXT_LIMITS.teacher, true),
    language: text(input.language === undefined ? '' : input.language, TEXT_LIMITS.language, true),
  });
}
function sessionRecord(snapshot, input, now) {
  object(input);
  const course = find(snapshot, 'courses', input.courseId);
  return Object.assign(newBase(snapshot, now), {
    courseId: course.id, title: text(input.title, TEXT_LIMITS.title), transcript: text(input.transcript, TEXT_LIMITS.transcript), inputMode: 'MANUAL_TEXT',
  });
}
function doubtRecord(snapshot, input, now) {
  object(input);
  const session = find(snapshot, 'sessions', input.sessionId);
  return Object.assign(newBase(snapshot, now), {
    sessionId: session.id, sourceText: text(input.sourceText, TEXT_LIMITS.sourceText),
    note: text(input.note === undefined ? '' : input.note, TEXT_LIMITS.note, true),
    status: 'OPEN', answer: '', resolvedAtMillis: null,
  });
}
function cardRecord(snapshot, input, now, origin = 'MANUAL') {
  object(input);
  const course = find(snapshot, 'courses', input.courseId);
  const sourceId = input.sourceId === undefined || input.sourceId === null ? null : uuid(input.sourceId);
  if (sourceId !== null) {
    const source = snapshot.sessions.find(item => item.id === sourceId) || snapshot.doubts.find(item => item.id === sourceId);
    check(source, 'NOT_FOUND');
    check(active(source), 'ARCHIVED');
    const sourceCourse = source.courseId || find(snapshot, 'sessions', source.sessionId).courseId;
    check(sourceCourse === course.id, 'INVALID_RELATIONSHIP');
  }
  return Object.assign(newBase(snapshot, now), {
    courseId: course.id, front: text(input.front, TEXT_LIMITS.front), back: text(input.back, TEXT_LIMITS.back), sourceId, origin,
    dueAtMillis: now, intervalMillis: 0, reps: 0, lastReviewedAtMillis: null, lastRating: null,
  });
}
function hasActiveChildren(snapshot, kind, id) {
  if (kind === 'courses') return snapshot.sessions.some(item => active(item) && item.courseId === id) ||
    snapshot.cards.some(item => active(item) && item.courseId === id);
  if (kind === 'sessions') return snapshot.doubts.some(item => active(item) && item.sessionId === id) ||
    snapshot.cards.some(item => active(item) && item.sourceId === id);
  if (kind === 'doubts') return snapshot.cards.some(item => active(item) && item.sourceId === id);
  return false; // Review logs are independent historical records, not active children.
}
function canRestore(snapshot, kind, record) {
  if (kind === 'sessions' || kind === 'cards') {
    check(active(find(snapshot, 'courses', record.courseId, false)), 'PARENT_ARCHIVED');
  }
  if (kind === 'doubts') check(active(find(snapshot, 'sessions', record.sessionId, false)), 'PARENT_ARCHIVED');
  if (kind === 'cards' && record.sourceId !== null) {
    const source = snapshot.sessions.find(item => item.id === record.sourceId) || snapshot.doubts.find(item => item.id === record.sourceId);
    check(source && active(source), 'PARENT_ARCHIVED');
  }
}

/**
 * Synchronous API using only storage.getStorageSync(key)/setStorageSync(key, JSON).
 * The adapter must atomically replace one key or throw without writing. Reads do
 * not write. A mutation validates a detached draft and saves once before publishing
 * it in memory. Separate instances fail closed on stale writes (no lost updates).
 */
function createStore(storage) {
  check(storage && typeof storage.getStorageSync === 'function' && typeof storage.setStorageSync === 'function', 'INVALID_STORAGE');
  let stored = readStorage(storage);
  let state;
  if (absent(stored)) state = emptySnapshot();
  else {
    try {
      state = parseBackup(stored);
      serialize(state);
    } catch (_) {
      fail('STORAGE_CORRUPT');
    }
  }

  function transaction(edit) {
    check(!locks.has(storage), 'STORE_BUSY');
    locks.add(storage);
    try {
      check(sameStoredValue(readStorage(storage), stored), 'STALE_STORE');
      const draft = clone(state);
      const result = edit(draft);
      const next = normalizeSnapshot(draft);
      const encoded = serialize(next);
      const detachedResult = clone(result);
      if (encoded === serialize(state)) return detachedResult;
      try {
        storage.setStorageSync(STORAGE_KEY, encoded);
      } catch (_) {
        fail('STORAGE_WRITE_FAILED');
      }
      stored = encoded;
      state = next;
      return detachedResult;
    } finally {
      locks.delete(storage);
    }
  }

  function due(now) {
    integer(now);
    return state.cards.filter(card => active(card) && card.dueAtMillis <= now)
      .sort((left, right) => left.dueAtMillis - right.dueAtMillis || left.id.localeCompare(right.id));
  }
  function archiveOrRestore(kind, id, restoring) {
    choice(kind, KINDS);
    uuid(id);
    return transaction(draft => {
      const record = find(draft, kind, id, false);
      if (restoring === active(record)) return record;
      if (restoring) canRestore(draft, kind, record);
      else check(!hasActiveChildren(draft, kind, record.id), 'ACTIVE_CHILDREN');
      const now = changeTime(draft);
      record.deletedAtMillis = restoring ? null : now;
      record.updatedAtMillis = now;
      return record;
    });
  }

  return {
    getSnapshot() { return clone(state); },
    stats(now = Date.now()) {
      integer(now);
      const count = kind => state[kind].filter(active).length;
      const midnight = new Date(now);
      midnight.setHours(0, 0, 0, 0);
      const dayStart = midnight.getTime();
      const archived = {};
      const activeCards = new Set(state.cards.filter(active).map(card => card.id));
      const visibleLogs = state.logs.filter(log => active(log) && activeCards.has(log.cardId));
      KINDS.forEach(kind => { archived[kind] = state[kind].length - count(kind); });
      return {
        courses: count('courses'), sessions: count('sessions'), doubts: count('doubts'),
        openDoubts: state.doubts.filter(item => active(item) && item.status === 'OPEN').length,
        resolvedDoubts: state.doubts.filter(item => active(item) && item.status === 'RESOLVED').length,
        cards: count('cards'), dueCards: due(now).length, reviews: visibleLogs.length,
        reviewedToday: visibleLogs.filter(log => log.reviewedAtMillis >= dayStart && log.reviewedAtMillis <= now).length,
        archived,
      };
    },
    addCourse(input) {
      return transaction(draft => {
        const record = courseRecord(draft, input, changeTime(draft));
        draft.courses.push(record);
        return record;
      });
    },
    addSession(input) {
      return transaction(draft => {
        const record = sessionRecord(draft, input, changeTime(draft));
        draft.sessions.push(record);
        return record;
      });
    },
    addDoubt(input) {
      return transaction(draft => {
        const record = doubtRecord(draft, input, changeTime(draft));
        draft.doubts.push(record);
        return record;
      });
    },
    resolveDoubt(id, answer) {
      uuid(id);
      const content = text(answer, TEXT_LIMITS.answer);
      return transaction(draft => {
        const record = find(draft, 'doubts', id);
        if (record.status === 'RESOLVED' && record.answer === content) return record;
        record.status = 'RESOLVED';
        record.answer = content;
        record.resolvedAtMillis = changeTime(draft);
        record.updatedAtMillis = record.resolvedAtMillis;
        return record;
      });
    },
    addCard(input) {
      return transaction(draft => {
        const record = cardRecord(draft, input, changeTime(draft));
        draft.cards.push(record);
        return record;
      });
    },
    dueCards(now = Date.now()) { return clone(due(now)); },
    rateCard(id, rating, now = Date.now()) {
      uuid(id);
      choice(rating, RATINGS);
      integer(now);
      return transaction(draft => {
        const card = find(draft, 'cards', id);
        check(now >= card.updatedAtMillis, 'CLOCK_INVALID');
        check(card.dueAtMillis <= now, 'CARD_NOT_DUE');
        const interval = intervalFor(rating, card.intervalMillis);
        check(now <= MAX_DATE - interval, 'CLOCK_INVALID');
        const log = Object.assign(newBase(draft, now), {
          cardId: card.id, rating, sequence: card.reps + 1, reviewedAtMillis: now,
          previousDueAtMillis: card.dueAtMillis, nextDueAtMillis: now + interval,
          previousIntervalMillis: card.intervalMillis, intervalMillis: interval,
        });
        card.dueAtMillis = log.nextDueAtMillis;
        card.intervalMillis = interval;
        card.reps += 1;
        card.lastReviewedAtMillis = now;
        card.lastRating = rating;
        card.updatedAtMillis = now;
        draft.logs.push(log);
        return { card, log };
      });
    },
    updateSettings(input) {
      object(input);
      check(typeof input.reduceMotion === 'boolean');
      return transaction(draft => {
        draft.settings.reduceMotion = input.reduceMotion;
        return draft.settings;
      });
    },
    archive(kind, id) { return archiveOrRestore(kind, id, false); },
    restore(kind, id) { return archiveOrRestore(kind, id, true); },
    seedDemo() {
      return transaction(draft => {
        check(KINDS.every(kind => draft[kind].length === 0), 'DEMO_REQUIRES_EMPTY');
        const now = changeTime(draft);
        const course = courseRecord(draft, { name: '示例课程（合成数据）', teacher: '虚构讲师', language: '中英双语' }, now);
        draft.courses.push(course);
        const session = sessionRecord(draft, {
          courseId: course.id, title: '手动文本示例',
          transcript: '这是一段人工编写的合成示例，不来自真实课堂或录音。Spaced practice means reviewing over time.',
        }, now);
        draft.sessions.push(session);
        const doubt = doubtRecord(draft, { sessionId: session.id, sourceText: 'Spaced practice', note: '示例疑问：如何安排复习？' }, now);
        draft.doubts.push(doubt);
        draft.cards.push(cardRecord(draft, {
          courseId: course.id, sourceId: doubt.id, front: 'spaced practice', back: '间隔练习（人工编写的示例释义）',
        }, now, 'DEMO'));
        draft.cards.push(cardRecord(draft, {
          courseId: course.id, sourceId: session.id, front: '这个离线版本会自动录音或生成 AI 答案吗？', back: '不会。只保存手动输入的文字和显式添加的合成示例。',
        }, now, 'DEMO'));
        return draft;
      });
    },
    exportBackup() { return serialize(state); },
    importBackup(value) {
      const imported = parseBackup(value);
      return transaction(draft => {
        const existing = new Map();
        KINDS.forEach(kind => draft[kind].forEach(record => existing.set(record.id, { kind, record })));
        const added = {};
        let skipped = 0;
        KINDS.forEach(kind => {
          added[kind] = 0;
          imported[kind].forEach(record => {
            const match = existing.get(record.id);
            if (match) {
              check(match.kind === kind && JSON.stringify(match.record) === JSON.stringify(record), 'ID_CONFLICT');
              skipped += 1;
            } else {
              draft[kind].push(record);
              existing.set(record.id, { kind, record });
              added[kind] += 1;
            }
          });
        });
        // Deliberately preserve local settings and every existing record, including
        // tombstones. Imports cannot overwrite/resurrect records or roll back reviews.
        return { added, skipped };
      });
    },
  };
}

module.exports = { createStore, STORAGE_KEY };
