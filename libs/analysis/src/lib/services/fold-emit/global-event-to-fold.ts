import {
  type FoldChange,
  type FoldEvent,
  type FoldProvenance,
  toWorldDate,
} from '@veritas/shared/utils';
import type { GlobalEvent } from '../../types/global-event';

/** Workspace scope all Veritas-emitted records live under. */
export const VERITAS_WORKSPACE = 'veritas';

/** Node kind for an ingested real-world event, in fold's extension namespace. */
const EVENT_NODE_KIND = 'x.veritas.global-event';

/**
 * Severity is an editorial classification we assign from feed tier and
 * category — not something the source stated. `derived`, not `observed`.
 */
const SEVERITY_ORDER: Record<GlobalEvent['severity'], number> = {
  low: 0.25,
  medium: 0.5,
  high: 0.75,
  critical: 1,
};

/**
 * Translate a Veritas GlobalEvent into a Fold change record.
 *
 * The point of emitting is not interchange for its own sake — it is that fold
 * makes provenance structural. Every value below declares whether we OBSERVED
 * it (it came from the source), DERIVED it (we computed it), or ESTIMATED it
 * (we guessed, and it is uncalibrated). Veritas already tracks this via
 * `analysisMode` / `scoreType` / `dataSufficiency`, but by convention; here the
 * schema enforces it.
 *
 * Two deliberate refusals:
 *
 *   - `causedBy` is NEVER populated here. Fold treats it as a reference, and
 *     the only causal signal available at this layer is temporal ordering —
 *     which is precisely the inference the causal Phase 0 work removed. It
 *     stays empty until the base-rate layer can justify a link.
 *
 *   - `magnitude` is emitted with `basis: 'estimated'` and NO confidence.
 *     It is a hand-assigned 0-1 from feed tier, not a measurement, and
 *     omitting confidence is more honest than inventing 0.5.
 */
export function globalEventToFold(event: GlobalEvent): FoldEvent {
  const subject = `urn:veritas:event:${event.id}`;
  const observed: FoldProvenance = {
    basis: 'observed',
    method: { kind: 'sensor', id: event.source },
  };
  const derived: FoldProvenance = {
    basis: 'derived',
    method: { kind: 'system', id: 'veritas.global-event-aggregation' },
  };

  const changes: FoldChange[] = [
    { verb: 'create', subject, nodeKind: EVENT_NODE_KIND, provenance: observed },
    // Reported by the source verbatim.
    {
      verb: 'set',
      subject,
      component: 'x.veritas.headline',
      value: event.title,
      provenance: observed,
    },
    // Our classification, not the source's.
    {
      verb: 'set',
      subject,
      component: 'x.veritas.category',
      value: event.category,
      provenance: derived,
    },
    {
      verb: 'set',
      subject,
      component: 'x.veritas.severity',
      value: event.severity,
      provenance: derived,
    },
  ];

  if (event.description) {
    changes.push({
      verb: 'set',
      subject,
      component: 'x.veritas.summary',
      value: event.description,
      provenance: observed,
    });
  }

  // Geocoding is inferred from headline text or a region centroid, so it is
  // derived — and a centroid is a placeholder rather than a real position.
  if (Number.isFinite(event.location?.lat) && Number.isFinite(event.location?.lng)) {
    changes.push({
      verb: 'set',
      subject,
      component: 'core.position',
      value: {
        lat: event.location.lat,
        lng: event.location.lng,
        label: event.location.label,
        countryCode: event.location.countryCode,
      },
      provenance: {
        basis: 'derived',
        method: { kind: 'classifier', id: 'veritas.geocodeFromText' },
        // 'geocoded' means a place was named in the headline; anything else is
        // a region centroid standing in for an unknown position.
        confidence: event.location.region === 'geocoded' ? 0.8 : 0.2,
      },
    });
  }

  // Provenance metadata the RSS catalog carries. Structural facts about the
  // outlet, not judgements about it — observed.
  const ownership = event.metadata?.['feedOwnership'];
  if (typeof ownership === 'string') {
    changes.push({
      verb: 'set',
      subject,
      component: 'x.veritas.source-ownership',
      value: ownership,
      provenance: observed,
    });
  }

  // Translation provenance: emitted so a consumer can tell an English original
  // from a machine translation, and a FAILED translation from either.
  const originalLanguage = event.metadata?.['originalLanguage'];
  if (typeof originalLanguage === 'string') {
    changes.push({
      verb: 'set',
      subject,
      component: 'x.veritas.original-language',
      value: originalLanguage,
      provenance: observed,
    });
    changes.push({
      verb: 'mark',
      subject,
      component: 'x.veritas.translated',
      provenance: {
        basis: event.metadata?.['translated'] === true ? 'derived' : 'estimated',
        method: { kind: 'model', id: 'veritas.translation' },
      },
    });
  }

  return {
    specVersion: '0.7',
    id: subject,
    kind: 'x.veritas.global-event',
    title: event.title,
    ...(event.description ? { description: event.description } : {}),
    at: {
      t: new Date(event.timestamp).getTime(),
      worldDate: toWorldDate(event.timestamp),
    },
    ...(event.location?.label ? { location: event.location.label } : {}),
    author: { kind: 'ingest', id: `urn:veritas:connector:${event.source}` },
    magnitude: {
      value: Number.isFinite(event.magnitude)
        ? event.magnitude
        : SEVERITY_ORDER[event.severity],
      // Hand-assigned from feed tier, never calibrated. No confidence claimed.
      basis: 'estimated',
      scale: '0-1 editorial significance',
      method: { kind: 'system', id: 'veritas.global-event-aggregation' },
    },
    capture: { scope: { workspace: VERITAS_WORKSPACE, space: 'global-events' } },
    changes,
    extensions: {
      veritasSource: event.source,
      veritasCategory: event.category,
    },
  };
}
