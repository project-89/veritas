import { LlmGateway } from './src/lib/services/utils/llm-gateway';

/**
 * The LlmGateway is a process-wide singleton with an in-memory response cache
 * and per-context token budget. Reset it after every test so cached responses
 * or accumulated spend from one test can't leak into the next.
 */
afterEach(() => {
  LlmGateway.setInstance(null);
});
