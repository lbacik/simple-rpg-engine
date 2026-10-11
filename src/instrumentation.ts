// Next.js startup: load the Scenario collection into the in-memory registry.
// Migrations run via `npm run migrate`, never here.

import { loadAllScenarios, scenarioDirectory } from './content/registry';

export function register(): void {
  loadAllScenarios(scenarioDirectory());
}
