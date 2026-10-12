// Content module: the YAML loader, Zod definitions, validator and content
// hash (see docs/spec/architecture.md).
//
// This module must stay free of Next.js, React and persistence imports
// (enforced by the no-restricted-imports rule in eslint.config.mjs).

export type { Diagnostic, DiagnosticRange } from './diagnostic';
export { loadScenario } from './loadScenario';
export type { LoadScenarioFailure, LoadScenarioResult, LoadScenarioSuccess, RejectedTranslation, Scenario } from './loadScenario';
export { getScenario, listScenarios, loadAllScenarios, scenarioDirectory } from './registry';
export { checkPlaythroughCompatibility } from './compatibility';
export type { CompatibilityResult } from './compatibility';
