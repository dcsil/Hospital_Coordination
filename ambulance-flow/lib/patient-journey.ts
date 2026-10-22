import { z } from 'zod';
import { advance, choices, createRun, DEFAULT_CONFIG, type Point } from './simulation';

export const LOCATIONS = [
  { name: 'Union Station', lat: 43.6453, lng: -79.3806 },
  { name: 'Nathan Phillips Square', lat: 43.6525, lng: -79.3839 },
  { name: 'Yonge & Bloor', lat: 43.6709, lng: -79.3867 },
  { name: 'High Park', lat: 43.6537, lng: -79.4669 },
  { name: 'Danforth & Pape', lat: 43.6796, lng: -79.3449 },
];
export const journeySchema = z.object({
  location: z.string().min(1).max(100),
  origin: z.object({ lat: z.number().min(43.63).max(43.74), lng: z.number().min(-79.49).max(-79.29) }),
  urgency: z.enum(['low', 'moderate', 'critical']),
  status: z.enum(['choosing', 'en_route', 'arrived']),
  selected: z.string(), startedAt: z.number().nonnegative().nullable(),
});
export type Journey = z.infer<typeof journeySchema>;
export function resolveLocation(input: string): Point | null {
  const place = LOCATIONS.find(p => p.name.toLowerCase() === input.trim().toLowerCase());
  if (place) return { lat: place.lat, lng: place.lng };
  const match = input.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const result = journeySchema.shape.origin.safeParse({ lat: Number(match[1]), lng: Number(match[2]) });
  return result.success ? result.data : null;
}
export function journeyNetwork(origin: Point, urgency: Journey['urgency']) {
  const run = createRun({ ...DEFAULT_CONFIG }, 'patient-preview');
  advance(run, 60);
  run.status = 'paused';
  run.incidents.push({ id: 'PATIENT', ...origin, time: run.time, care: urgency === 'critical' ? 'specialist' : 'general', scene: 0, serviceFactor: 1 });
  run.ambulances.push({ id: 'YOUR-AMBULANCE', ...origin, from: origin, incidentId: 'PATIENT', status: 'AWAITING_DECISION', until: 0, routeStart: run.time });
  return { run, ranked: choices(run, 'YOUR-AMBULANCE').filter(c => c.eligible) };
}
