// Playthrough Combat export route (Combat MVP 1.0, P6 G7): a plain GET
// writing the running fight's bare CombatState, so the export works without
// JavaScript and re-imports through the Arena import form. Without a running
// fight (or on an incompatible Playthrough) there is nothing to write and the
// page answers instead. Another Session's Playthrough, or a nonexistent one,
// is a 404.

import { notFound, redirect } from 'next/navigation';
import { getScenario } from '@/content/registry';
import { arenaExportFilename } from '@/engine/combat/index';
import { isV3State } from '@/engine/conditions';
import { getDatabase } from '@/persistence/index';
import { getSessionHash } from '@/app/lib/session';
import { resolvePlaythrough } from '@/app/lib/playthrough';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  context: { params: Promise<{ playthroughId: string }> },
): Promise<Response> {
  const { playthroughId } = await context.params;
  const path = `/play/${playthroughId}`;
  const resolved = await resolvePlaythrough(
    getDatabase(),
    getScenario,
    playthroughId,
    await getSessionHash(),
  );
  if (resolved === null) {
    notFound();
  }
  if (
    resolved.compatible &&
    isV3State(resolved.playthrough.state) &&
    resolved.playthrough.state.activeCombat !== null
  ) {
    const combat = resolved.playthrough.state.activeCombat.combat;
    return new Response(JSON.stringify(combat), {
      headers: {
        'content-type': 'application/json',
        'content-disposition': `attachment; filename="${arenaExportFilename(combat)}"`,
      },
    });
  }
  redirect(path);
}
