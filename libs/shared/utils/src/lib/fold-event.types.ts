/**
 * Local mirror of the Fold Change Record schema (specVersion 0.7), covering
 * the subset Veritas emits.
 *
 * Typed HERE rather than imported from `@_89/fold` on purpose: super-brain is a
 * separate workspace with no build linkage, and coupling Veritas's build to a
 * private sibling repo would make this repo unbuildable without it. Consumers
 * validate with the real zod schema on the fold side; this type exists so the
 * producer is checked at compile time and the shape is documented where it is
 * written.
 *
 * If the two ever drift, fold's validator is authoritative — it will reject on
 * append, which is the correct place to find out.
 *
 * WHY WE EMIT AT ALL
 *
 * Veritas's stated purpose is watching narratives "emerge, branch, merge, and
 * compete". Fold is an event log with deterministic ordering, forking, and a
 * `merge` verb — the reconstruction primitives for exactly that. Emitting a
 * well-formed log now means point-in-time reconstruction stays available later
 * without re-ingesting history, whether the reducer ends up living here or in
 * a consumer.
 *
 * The provenance discipline is the other reason. Fold makes it structurally
 * impossible to state a value or a causal link without declaring its `basis`
 * (observed / derived / estimated / authored) and confidence. Veritas arrived
 * at the same principle independently — `analysisMode`, `scoreType`,
 * `stanceSource`, `dataSufficiency` — but by convention, enforced only by
 * review. Emitting into this schema makes it enforced by the schema.
 */

/** How a value came to be known. `estimated` covers anything uncalibrated. */
export type FoldBasis = 'authored' | 'observed' | 'estimated' | 'derived';

export interface FoldMethod {
  kind: 'sensor' | 'classifier' | 'oracle' | 'model' | 'human' | 'system';
  id?: string;
  detail?: Record<string, unknown>;
}

export interface FoldProvenance {
  basis: FoldBasis;
  /** 0-1. Omit rather than inventing one — absence is honest, 0.5 is not. */
  confidence?: number;
  scale?: string;
  method?: FoldMethod;
}

/** A number that carries how it was obtained. */
export interface FoldMeasurement extends FoldProvenance {
  value: number;
}

/**
 * The change verbs Veritas produces. Fold defines more (destroy, unmark,
 * unlink, transfer, reveal, conceal, merge); we emit only what we can honestly
 * claim, and add others when we genuinely observe them.
 */
export type FoldChange =
  | { verb: 'create'; subject: string; nodeKind: string; provenance?: FoldProvenance }
  | {
      verb: 'set';
      subject: string;
      component: string;
      field?: string;
      value: unknown;
      provenance?: FoldProvenance;
    }
  | {
      verb: 'mark';
      subject: string;
      component: string;
      field?: string;
      provenance?: FoldProvenance;
    }
  | {
      verb: 'link';
      subject: string;
      component: string;
      object: string;
      provenance?: FoldProvenance;
    };

export interface FoldAuthor {
  kind: 'human' | 'simulation' | 'agent' | 'rule' | 'generator' | 'ingest' | 'sensor';
  id: string;
  productionId?: string;
}

export interface FoldCaptureEnvelope {
  scope: { workspace: string; space?: string; creator?: string };
  identity?: Record<string, string>;
}

export interface FoldLifecycle {
  sensor: string;
  phase: 'online' | 'heartbeat' | 'degraded' | 'offline';
  observedAt: string;
  heartbeatWindowMs: number;
}

export interface FoldEvent {
  specVersion: '0.7';
  id: string;
  kind: string;
  title: string;
  description?: string;
  at: {
    /** Numeric ordering key. Epoch milliseconds for real-world observations. */
    t: number;
    /** `YYYY-MM-DD` or `YYYY-MM-DDTHH:MM`. */
    worldDate: string;
    granularity?: 'beat' | 'scene' | 'chapter' | 'era' | 'session';
  };
  timelineId?: string;
  participants?: string[];
  location?: string;
  author: FoldAuthor;
  /**
   * References to prior event ids. A REFERENCE, not an assertion — pair it
   * with provenance on the change that depends on it. Veritas must not
   * populate this from temporal ordering alone; see the causal-inference plan.
   */
  causedBy?: string[];
  magnitude?: FoldMeasurement;
  valence?: FoldMeasurement;
  capture: FoldCaptureEnvelope;
  lifecycle?: FoldLifecycle;
  changes: FoldChange[];
  effects?: Array<{ id: string; type: string; payload: unknown }>;
  extensions?: Record<string, unknown>;
}

/** `worldDate` format fold expects, derived from an ISO timestamp. */
export function toWorldDate(iso: string, withTime = true): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid timestamp: ${iso}`);
  const date = d.toISOString().slice(0, 10);
  return withTime ? `${date}T${d.toISOString().slice(11, 16)}` : date;
}
