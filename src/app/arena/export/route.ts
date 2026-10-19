// Arena export route (Combat MVP 1.0, P5 A3): a plain GET writing the bare
// CombatState as `combat-rNN-<phase>.json`, so export works without
// JavaScript. The file re-imports through the import form; without a fight
// there is nothing to write and the page answers instead.

import { redirect } from 'next/navigation';
import { arenaExportFilename } from '@/engine/combat/index';
import { arenaFights, arenaSessionHash } from '../server';

export async function GET(): Promise<Response> {
  const sessionHash = await arenaSessionHash();
  if (sessionHash === null) redirect('/arena');
  const read = await arenaFights().read(sessionHash);
  if (read.status !== 'ready') redirect('/arena');
  return new Response(JSON.stringify(read.fight.combat), {
    headers: {
      'content-type': 'application/json',
      'content-disposition': `attachment; filename="${arenaExportFilename(read.fight.combat)}"`,
    },
  });
}
