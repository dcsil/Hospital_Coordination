import type { Run } from './simulation.ts';

/** Hospital-facing view of ambulances en route to a destination. Simulated only:
 * the model tracks care level and pickup time, not clinical condition. */
export type IncomingAmbulance = {
  ambulanceId: string;
  incidentId: string;
  hospitalId: string;
  hospitalName: string;
  careLevel: 'specialist' | 'general';
  pickedUpAt?: number;
  /** Simulation minute of the expected arrival. */
  etaMinute: number;
  /** Minutes from the current simulation time until expected arrival. */
  etaMinutes: number;
};

export const CARE_LABELS: Record<IncomingAmbulance['careLevel'], string> = {
  specialist: 'Specialist care',
  general: 'General care',
};

/** Simulation minute to clock time, matching the Live operations display (starts 08:00). */
export const simulationClock = (minute: number) =>
  `${String(8 + Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;

/** Ambulances en route to a confirmed destination, soonest arrival first. */
export function incomingAmbulances(run: Run, hospitalId?: string): IncomingAmbulance[] {
  return run.ambulances
    .filter(a => a.status === 'EN_ROUTE' && a.destination !== undefined && (hospitalId === undefined || a.destination === hospitalId))
    .flatMap((a): IncomingAmbulance[] => {
      const hospital = run.hospitals.find(h => h.id === a.destination);
      if (!hospital) return [];
      const incident = run.incidents.find(i => i.id === a.incidentId);
      return [{
        ambulanceId: a.id,
        incidentId: a.incidentId ?? '—',
        hospitalId: hospital.id,
        hospitalName: hospital.name,
        careLevel: incident?.care === 'specialist' ? 'specialist' : 'general',
        pickedUpAt: incident?.pickedUpAt,
        etaMinute: a.until,
        etaMinutes: Math.max(0, a.until - run.time),
      }];
    })
    .sort((x, y) => x.etaMinute - y.etaMinute || x.ambulanceId.localeCompare(y.ambulanceId));
}
