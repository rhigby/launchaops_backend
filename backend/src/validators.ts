import { z } from "zod";

export const createChecklistSchema = z.object({
  title: z.string().min(3).max(120)
});

export const addStepSchema = z.object({
  label: z.string().min(3).max(200)
});

export const createIncidentSchema = z.object({
  title: z.string().min(3).max(160),
  severity: z.number().int().min(1).max(5)
});

export const addIncidentUpdateSchema = z.object({
  note: z.string().min(2).max(500)
});

export const patchIncidentStatusSchema = z.object({
  status: z.enum(["open", "investigating", "mitigated", "resolved"])
});
