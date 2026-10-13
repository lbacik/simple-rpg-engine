// Test-only tactical entry path for the browser E2E (tactical-combat
// handoff, U4/U5). Two plain forms seed real saves (see actions.ts) and land
// in Combat. Nothing here links from production navigation, and the page
// answers 404 unless E2E_TEST_ROUTES=1, which only the Playwright webServer
// sets for its throwaway database server.

import { notFound } from 'next/navigation';
import { loadLegacyCombat, newPairCombat } from './actions';

export const dynamic = 'force-dynamic';

const ERRORS: Record<string, string> = {
  'no-scenario': 'The tactical-pairs fixture Scenario is not in the collection.',
  start: 'Could not start the pair fixture Playthrough.',
  enter: 'Could not enter the pair fixture Combat.',
  'no-combat': 'The pair fixture setup ended outside Combat.',
  'no-fixture': 'The legacy active-Combat fixture is unavailable.',
  forbidden: 'Test routes are disabled.',
};

export default async function TestTacticalPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (process.env.E2E_TEST_ROUTES !== '1') {
    notFound();
  }
  const { error } = await searchParams;
  return (
    <main>
      <h1>Tactical test entry</h1>
      {error !== undefined && ERRORS[error] !== undefined ? (
        <p className="notice" role="status">
          {ERRORS[error]}
        </p>
      ) : null}
      <form action={newPairCombat}>
        <p>
          <button className="button" type="submit">
            New pair Combat
          </button>
        </p>
      </form>
      <form action={loadLegacyCombat}>
        <p>
          <button className="button" type="submit">
            Load legacy Combat save
          </button>
        </p>
      </form>
    </main>
  );
}
