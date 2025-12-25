import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { nanoid } from "nanoid";
import { config } from "./config.js";

function ensureDir(p: string) {
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
ensureDir(config.sqlitePath);

export const db = new Database(config.sqlitePath);

export function migrate() {
  db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS checklists (
      id TEXT PRIMARY KEY,
      user_sub TEXT NOT NULL,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS checklist_steps (
      id TEXT PRIMARY KEY,
      checklist_id TEXT NOT NULL,
      label TEXT NOT NULL,
      done INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      updated_by TEXT NOT NULL,
      FOREIGN KEY (checklist_id) REFERENCES checklists(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS incidents (
      id TEXT PRIMARY KEY,
      user_sub TEXT NOT NULL,
      title TEXT NOT NULL,
      severity INTEGER NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS incident_updates (
      id TEXT PRIMARY KEY,
      incident_id TEXT NOT NULL,
      note TEXT NOT NULL,
      by TEXT NOT NULL,
      at TEXT NOT NULL,
      FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      user_sub TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      at TEXT NOT NULL,
      meta_json TEXT NOT NULL
    );
  `);
}

export function nowIso() {
  return new Date().toISOString();
}

export function audit(userSub: string, action: string, entityType: string, entityId: string, meta: unknown) {
  db.prepare(`INSERT INTO audit_log (id, user_sub, action, entity_type, entity_id, at, meta_json)
              VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(nanoid(), userSub, action, entityType, entityId, nowIso(), JSON.stringify(meta ?? {}));
}

export function seedIfEmpty(userSub: string, userLabel: string) {
  const row = db.prepare(`SELECT COUNT(1) as c FROM checklists WHERE user_sub = ?`).get(userSub) as any;
  if (row?.c > 0) return;

  const checklistId = nanoid();
  db.prepare(`INSERT INTO checklists (id, user_sub, title, created_at) VALUES (?, ?, ?, ?)`)
    .run(checklistId, userSub, "Buffalo Go-Live – Core UI Validation", nowIso());

  const steps = [
    "Confirm Auth0 login + role claims",
    "Validate responsive layout on laptop + iPad",
    "Verify WCAG focus states on key flows",
    "Simulate offline / network-loss behavior",
    "Capture screenshots for release notes"
  ];

  const ins = db.prepare(`INSERT INTO checklist_steps (id, checklist_id, label, done, updated_at, updated_by)
                          VALUES (?, ?, ?, 0, ?, ?)`);
  for (const label of steps) {
    ins.run(nanoid(), checklistId, label, nowIso(), userLabel);
  }

  const incidentId = nanoid();
  db.prepare(`INSERT INTO incidents (id, user_sub, title, severity, status, created_at)
              VALUES (?, ?, ?, ?, ?, ?)`)
    .run(incidentId, userSub, "OAuth redirect loop observed on client network", 2, "investigating", nowIso());

  db.prepare(`INSERT INTO incident_updates (id, incident_id, note, by, at)
              VALUES (?, ?, ?, ?, ?)`)
    .run(nanoid(), incidentId, "Added router basename + updated Allowed Web Origins; retesting.", userLabel, nowIso());

  audit(userSub, "seed", "system", "seed", { created: true });
}
