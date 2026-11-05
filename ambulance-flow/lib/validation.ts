import { z } from 'zod';
export const configSchema = z.object({
  name: z.string().trim().min(1).max(100), preset: z.enum(['normal', 'surge', 'stale']), fleet: z.number().int().min(5).max(50), hospitals: z.number().int().min(2).max(10), duration: z.number().int().min(60).max(720), seed: z.number().int().min(0).max(2147483647), callsPerHour: z.number().min(1).max(90), slots: z.number().int().min(1).max(6), serviceMinutes: z.number().int().min(5).max(60), informationDelay: z.number().int().min(0).max(60), policy: z.enum(['nearest', 'coordinated']), manual: z.boolean(),
  prediction: z.object({ congestionWeight: z.number().min(0).max(1).optional(), queueWeight: z.number().min(0).max(2).optional(), maxMinutes: z.number().min(60).max(360).optional() }).optional(),
});
export const controlSchema = z.object({ revision: z.number().int().min(0), action: z.enum(['advance', 'pause', 'resume', 'stop', 'policy', 'manual', 'capacity']), minutes: z.number().int().min(1).max(30).optional(), policy: z.enum(['nearest', 'coordinated']).optional(), manual: z.boolean().optional(), hospitalId: z.string().optional(), capacity: z.number().int().min(0).max(6).optional() });
