// Test-only Combat core probe route (P1a K4). A client component imports
// the shared core, proving it builds for the browser. Nothing links from
// production navigation, and the page answers 404 unless
// E2E_TEST_ROUTES=1, like the test-tactical route.

import { notFound } from 'next/navigation';
import CombatCoreProbe from './CombatCoreProbe';

export const dynamic = 'force-dynamic';

export default function CombatCoreProbePage() {
  if (process.env['E2E_TEST_ROUTES'] !== '1') notFound();
  return (
    <main>
      <h1>Combat core probe</h1>
      <CombatCoreProbe />
    </main>
  );
}
