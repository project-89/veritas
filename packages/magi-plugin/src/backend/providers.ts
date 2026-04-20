import { PsychologicalProfilerService } from './services/psychological-profiler.service';
import { PSYCHOLOGICAL_PROFILER_SERVICE } from '../../../../libs/ingestion/src/lib/queue/analysis.processor';

export const MAGI_PLUGIN_APP_PROVIDERS = [
  PsychologicalProfilerService,
  { provide: PSYCHOLOGICAL_PROFILER_SERVICE, useExisting: PsychologicalProfilerService },
];
