const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { pathToFileURL, fileURLToPath } = require("node:url");

let DatabaseSync;
let sqliteLoadError = null;
try {
  ({ DatabaseSync } = require("node:sqlite"));
} catch (error) {
  sqliteLoadError = error;
}

function ensureSqlite() {
  if (DatabaseSync) return;
  const error = new Error(
    "node:sqlite is required for local storage but is not available in this runtime. " +
      "Use the Windows Electron build that bundles Node 22+ with node:sqlite support.",
  );
  error.cause = sqliteLoadError;
  throw error;
}

const ENTITY_TABLES = {
  Course: "courses",
  Flashcard: "flashcards",
  FlashcardDeck: "flashcard_decks",
  Note: "notes",
  Quiz: "quizzes",
  QuizQuestion: "quiz_questions",
  SavedAIAnswer: "saved_ai_answers",
  StudyGuide: "study_guides",
  StudyMaterial: "study_materials",
  StudySession: "study_sessions",
  Task: "tasks",
  Topic: "topics",
  TopicMastery: "topic_masteries",
};

const DEFAULT_PROFILE = {
  id: "local-user",
  email: "student@example.com",
  full_name: "Student",
  university: "",
  major: "",
  year: "",
  daily_goal_minutes: 60,
  planner_item_limit: 8,
  context_course_limit: 5,
  context_topic_limit: 6,
  context_material_limit: 3,
  context_note_limit: 3,
  context_session_limit: 3,
  context_task_limit: 3,
  notifications: {
    study_reminders: true,
    task_due: true,
    weekly_summary: false,
  },
};

let dbCache = null;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function buildDefaultTables() {
  return Object.fromEntries(Object.values(ENTITY_TABLES).map((table) => [table, []]));
}

function getDbPath(app) {
  return path.join(app.getPath("userData"), "studybridge.sqlite");
}

function getLegacyJsonPath(app) {
  return path.join(app.getPath("userData"), "studybridge-data.json");
}

function getUploadsDir(app) {
  return path.join(app.getPath("userData"), "studybridge-files");
}

function openDb(app) {
  if (dbCache) return dbCache;

  ensureSqlite();

  const db = new DatabaseSync(getDbPath(app));
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS profile (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS entities (
      id TEXT PRIMARY KEY,
      entity_name TEXT NOT NULL,
      user_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      data TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(entity_name);
    CREATE INDEX IF NOT EXISTS idx_entities_name_user ON entities(entity_name, user_id);
  `);

  dbCache = db;
  return dbCache;
}

function getMeta(db, key) {
  const row = db.prepare("SELECT value FROM meta WHERE key = ?").get(key);
  return row?.value ?? null;
}

function setMeta(db, key, value) {
  db.prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, String(value));
}

function normalizeProfile(payload = {}) {
  return {
    ...DEFAULT_PROFILE,
    ...payload,
    notifications: {
      ...DEFAULT_PROFILE.notifications,
      ...(payload.notifications || {}),
    },
  };
}

function parseDataJson(raw) {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function entityRowFromDb(row) {
  if (!row) return null;
  return {
    id: row.id,
    user_id: row.user_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    data: parseDataJson(row.data),
  };
}

async function migrateLegacyJsonIfNeeded(app, db) {
  if (getMeta(db, "legacy_json_migrated") === "1") return;

  const legacyPath = getLegacyJsonPath(app);
  try {
    const raw = await fs.readFile(legacyPath, "utf8");
    const parsed = JSON.parse(raw);

    if (parsed?.profile) {
      const profile = normalizeProfile(parsed.profile);
      db.prepare(`
        INSERT INTO profile (id, data, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
      `).run(profile.id || DEFAULT_PROFILE.id, JSON.stringify(profile), new Date().toISOString());
    }

    const now = new Date().toISOString();
    const insertEntity = db.prepare(`
      INSERT INTO entities (id, entity_name, user_id, created_at, updated_at, data)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        entity_name = excluded.entity_name,
        user_id = excluded.user_id,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        data = excluded.data
    `);

    for (const [tableName, rows] of Object.entries(parsed?.tables || {})) {
      const entityName = Object.entries(ENTITY_TABLES).find(([, table]) => table === tableName)?.[0];
      if (!entityName || !Array.isArray(rows)) continue;

      for (const row of rows) {
        insertEntity.run(
          row.id || crypto.randomUUID(),
          tableName,
          row.user_id || DEFAULT_PROFILE.id,
          row.created_at || now,
          row.updated_at || row.created_at || now,
          JSON.stringify(row.data || {}),
        );
      }
    }
  } catch {
    // No legacy JSON state to migrate.
  }

  setMeta(db, "legacy_json_migrated", "1");
}

async function ensureDb(app) {
  const db = openDb(app);
  await migrateLegacyJsonIfNeeded(app, db);
  return db;
}

function getTableName(entityName) {
  return ENTITY_TABLES[entityName];
}

async function listRows(app, entityName) {
  const tableName = getTableName(entityName);
  if (!tableName) throw new Error(`Unknown entity: ${entityName}`);

  const db = await ensureDb(app);
  const rows = db.prepare("SELECT id, user_id, created_at, updated_at, data FROM entities WHERE entity_name = ?").all(tableName);
  return rows.map(entityRowFromDb);
}

async function createRow(app, entityName, payload = {}) {
  const tableName = getTableName(entityName);
  if (!tableName) throw new Error(`Unknown entity: ${entityName}`);

  const db = await ensureDb(app);
  const now = new Date().toISOString();
  const row = {
    id: crypto.randomUUID(),
    user_id: DEFAULT_PROFILE.id,
    created_at: now,
    updated_at: now,
    data: clone(payload),
  };

  db.prepare(`
    INSERT INTO entities (id, entity_name, user_id, created_at, updated_at, data)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(row.id, tableName, row.user_id, row.created_at, row.updated_at, JSON.stringify(row.data));

  return row;
}

async function updateRow(app, entityName, id, payload = {}) {
  const tableName = getTableName(entityName);
  if (!tableName) throw new Error(`Unknown entity: ${entityName}`);

  const db = await ensureDb(app);
  const existing = db.prepare("SELECT id, user_id, created_at, updated_at, data FROM entities WHERE id = ? AND entity_name = ?").get(id, tableName);
  if (!existing) {
    throw new Error(`Could not find ${entityName} with id ${id}`);
  }

  const now = new Date().toISOString();
  const currentData = parseDataJson(existing.data);
  const nextData = {
    ...currentData,
    ...clone(payload),
  };

  db.prepare(`
    UPDATE entities
    SET updated_at = ?, data = ?
    WHERE id = ? AND entity_name = ?
  `).run(now, JSON.stringify(nextData), id, tableName);

  return {
    id: existing.id,
    user_id: existing.user_id,
    created_at: existing.created_at,
    updated_at: now,
    data: nextData,
  };
}

async function deleteRow(app, entityName, id) {
  const tableName = getTableName(entityName);
  if (!tableName) throw new Error(`Unknown entity: ${entityName}`);

  const db = await ensureDb(app);
  db.prepare("DELETE FROM entities WHERE id = ? AND entity_name = ?").run(id, tableName);
  return true;
}

async function getProfile(app) {
  const db = await ensureDb(app);
  const row = db.prepare("SELECT data FROM profile WHERE id = ?").get(DEFAULT_PROFILE.id);
  return normalizeProfile(row ? parseDataJson(row.data) : DEFAULT_PROFILE);
}

async function updateProfile(app, payload = {}) {
  const db = await ensureDb(app);
  const profile = normalizeProfile({
    ...(await getProfile(app)),
    ...payload,
  });
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO profile (id, data, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
  `).run(profile.id || DEFAULT_PROFILE.id, JSON.stringify(profile), now);
  return clone(profile);
}

async function resetProfile(app) {
  return updateProfile(app, DEFAULT_PROFILE);
}

async function saveUpload(app, { name, mimeType, buffer }) {
  if (!buffer) throw new Error("Upload buffer is missing");

  const uploadsDir = getUploadsDir(app);
  await fs.mkdir(uploadsDir, { recursive: true });
  const safeName = name ? path.basename(name) : "upload.bin";
  const fileName = `${crypto.randomUUID()}-${safeName}`;
  const filePath = path.join(uploadsDir, fileName);
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  await fs.writeFile(filePath, bytes);

  return {
    file_url: pathToFileURL(filePath).href,
    file_name: name || safeName,
    mime_type: mimeType || "application/octet-stream",
    local_path: filePath,
  };
}

async function deleteLocalFile(app, fileUrl) {
  if (!fileUrl) return true;
  if (!fileUrl.startsWith("file://")) return true;

  let filePath;
  try {
    filePath = fileURLToPath(fileUrl);
  } catch {
    filePath = decodeURIComponent(fileUrl.replace(/^file:\/+/, ""));
  }

  try {
    const allowedRoot = path.resolve(getUploadsDir(app));
    const resolvedPath = path.resolve(filePath);
    if (!resolvedPath.startsWith(allowedRoot + path.sep) && resolvedPath !== allowedRoot) {
      return false;
    }
    await fs.unlink(resolvedPath);
  } catch {
    // ignore missing files
  }

  return true;
}

module.exports = {
  ENTITY_TABLES,
  DEFAULT_PROFILE,
  listRows,
  createRow,
  updateRow,
  deleteRow,
  getProfile,
  updateProfile,
  resetProfile,
  saveUpload,
  deleteLocalFile,
  loadState: ensureDb,
  saveState: async () => true,
};
