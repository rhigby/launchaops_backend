import type { Request, Response } from "express";
import { nanoid } from "nanoid";
import { db, audit, nowIso, seedIfEmpty } from "./db.js";
import { addIncidentUpdateSchema, addStepSchema, createChecklistSchema, createIncidentSchema, patchIncidentStatusSchema } from "./validators.js";

const userLabel = (req: Request) => req.user?.email || req.user?.name || req.user?.sub || "user";

export function health(_req: Request, res: Response) {
  res.json({ ok: true, time: new Date().toISOString() });
}

export function me(req: Request, res: Response) {
  res.json({ user: req.user });
}

export function listChecklists(req: Request, res: Response) {
  const u = req.user!;
  seedIfEmpty(u.sub, userLabel(req));

  const rows = db.prepare(`SELECT id, title, created_at FROM checklists WHERE user_sub = ? ORDER BY created_at DESC`).all(u.sub) as any[];
  const checklists = rows.map((r) => {
    const steps = db.prepare(`SELECT id, label, done, updated_at, updated_by FROM checklist_steps WHERE checklist_id = ? ORDER BY rowid ASC`).all(r.id) as any[];
    return {
      id: r.id,
      title: r.title,
      createdAt: r.created_at,
      steps: steps.map((s) => ({ id: s.id, label: s.label, done: !!s.done, updatedAt: s.updated_at, updatedBy: s.updated_by }))
    };
  });

  res.json(checklists);
}

export function createChecklist(req: Request, res: Response) {
  const u = req.user!;
  const parsed = createChecklistSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "validation", details: parsed.error.flatten() });

  const id = nanoid();
  const createdAt = nowIso();
  db.prepare(`INSERT INTO checklists (id, user_sub, title, created_at) VALUES (?, ?, ?, ?)`).run(id, u.sub, parsed.data.title, createdAt);
  audit(u.sub, "create", "checklist", id, { title: parsed.data.title });
  res.status(201).json({ id, title: parsed.data.title, createdAt, steps: [] });
}

export function getChecklist(req: Request, res: Response) {
  const u = req.user!;
  const id = req.params.id;

  const c = db.prepare(`SELECT id, title, created_at FROM checklists WHERE user_sub = ? AND id = ?`).get(u.sub, id) as any;
  if (!c) return res.status(404).json({ error: "not_found" });

  const steps = db.prepare(`SELECT id, label, done, updated_at, updated_by FROM checklist_steps WHERE checklist_id = ? ORDER BY rowid ASC`).all(id) as any[];
  res.json({
    id: c.id,
    title: c.title,
    createdAt: c.created_at,
    steps: steps.map((s) => ({ id: s.id, label: s.label, done: !!s.done, updatedAt: s.updated_at, updatedBy: s.updated_by }))
  });
}

export function addStep(req: Request, res: Response) {
  const u = req.user!;
  const checklistId = req.params.id;

  const exists = db.prepare(`SELECT id FROM checklists WHERE user_sub = ? AND id = ?`).get(u.sub, checklistId) as any;
  if (!exists) return res.status(404).json({ error: "not_found" });

  const parsed = addStepSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "validation", details: parsed.error.flatten() });

  const stepId = nanoid();
  const updatedAt = nowIso();
  const updatedBy = userLabel(req);

  db.prepare(`INSERT INTO checklist_steps (id, checklist_id, label, done, updated_at, updated_by)
              VALUES (?, ?, ?, 0, ?, ?)`).run(stepId, checklistId, parsed.data.label, updatedAt, updatedBy);

  audit(u.sub, "add_step", "checklist", checklistId, { stepId, label: parsed.data.label });
  res.status(201).json({ id: stepId, label: parsed.data.label, done: false, updatedAt, updatedBy });
}

export function toggleStep(req: Request, res: Response) {
  const u = req.user!;
  const checklistId = req.params.id;
  const stepId = req.params.stepId;

  const exists = db.prepare(`SELECT id FROM checklists WHERE user_sub = ? AND id = ?`).get(u.sub, checklistId) as any;
  if (!exists) return res.status(404).json({ error: "not_found" });

  const s = db.prepare(`SELECT id, done FROM checklist_steps WHERE checklist_id = ? AND id = ?`).get(checklistId, stepId) as any;
  if (!s) return res.status(404).json({ error: "not_found" });

  const nextDone = s.done ? 0 : 1;
  const updatedAt = nowIso();
  const updatedBy = userLabel(req);

  db.prepare(`UPDATE checklist_steps SET done = ?, updated_at = ?, updated_by = ? WHERE id = ? AND checklist_id = ?`)
    .run(nextDone, updatedAt, updatedBy, stepId, checklistId);

  audit(u.sub, "toggle_step", "checklist", checklistId, { stepId, done: !!nextDone });
  res.json({ ok: true, stepId, done: !!nextDone, updatedAt, updatedBy });
}

export function listIncidents(req: Request, res: Response) {
  const u = req.user!;
  seedIfEmpty(u.sub, userLabel(req));

  const incidents = db.prepare(`SELECT id, title, severity, status, created_at FROM incidents WHERE user_sub = ? ORDER BY created_at DESC`).all(u.sub) as any[];
  const mapped = incidents.map((i) => {
    const updates = db.prepare(`SELECT id, note, by, at FROM incident_updates WHERE incident_id = ? ORDER BY at DESC`).all(i.id) as any[];
    return {
      id: i.id,
      title: i.title,
      severity: i.severity,
      status: i.status,
      createdAt: i.created_at,
      updates: updates.map((u) => ({ id: u.id, note: u.note, by: u.by, at: u.at }))
    };
  });

  res.json(mapped);
}

export function createIncident(req: Request, res: Response) {
  const u = req.user!;
  const parsed = createIncidentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "validation", details: parsed.error.flatten() });

  const id = nanoid();
  const createdAt = nowIso();
  db.prepare(`INSERT INTO incidents (id, user_sub, title, severity, status, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(id, u.sub, parsed.data.title, parsed.data.severity, "open", createdAt);

  audit(u.sub, "create", "incident", id, { title: parsed.data.title, severity: parsed.data.severity });
  res.status(201).json({ id, title: parsed.data.title, severity: parsed.data.severity, status: "open", createdAt, updates: [] });
}

export function addIncidentUpdate(req: Request, res: Response) {
  const u = req.user!;
  const incidentId = req.params.id;

  const exists = db.prepare(`SELECT id FROM incidents WHERE user_sub = ? AND id = ?`).get(u.sub, incidentId) as any;
  if (!exists) return res.status(404).json({ error: "not_found" });

  const parsed = addIncidentUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "validation", details: parsed.error.flatten() });

  const id = nanoid();
  const at = nowIso();
  const by = userLabel(req);

  db.prepare(`INSERT INTO incident_updates (id, incident_id, note, by, at) VALUES (?, ?, ?, ?, ?)`)
    .run(id, incidentId, parsed.data.note, by, at);

  audit(u.sub, "add_update", "incident", incidentId, { updateId: id });
  res.status(201).json({ id, note: parsed.data.note, by, at });
}

export function patchIncidentStatus(req: Request, res: Response) {
  const u = req.user!;
  const incidentId = req.params.id;

  const exists = db.prepare(`SELECT id FROM incidents WHERE user_sub = ? AND id = ?`).get(u.sub, incidentId) as any;
  if (!exists) return res.status(404).json({ error: "not_found" });

  const parsed = patchIncidentStatusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "validation", details: parsed.error.flatten() });

  db.prepare(`UPDATE incidents SET status = ? WHERE id = ? AND user_sub = ?`).run(parsed.data.status, incidentId, u.sub);
  audit(u.sub, "status", "incident", incidentId, { status: parsed.data.status });

  res.json({ ok: true, id: incidentId, status: parsed.data.status });
}
