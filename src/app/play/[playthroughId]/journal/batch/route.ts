// One older journal batch as JSON (docs/spec/ui.md, journal): the entries
// are rendered on the server with the existing Journal rendering, and the
// client only appends the HTML it receives. The batch is addressed by the
// sequence cursor (`?before=`, "entries older than X"), never by page number
// or offset. The Journal renders the same during play, after the end and
// when the Playthrough is incompatible: it stores the text as presented.

import { getScenario } from '@/content/registry';
import { getDatabase, PlaythroughStore } from '@/persistence/index';
import { resolvePlaythrough, safeCharacterName } from '@/app/lib/playthrough';
import { getSessionHash } from '@/app/lib/session';
import {
  JOURNAL_BATCH_SIZE,
  parseJournalCursor,
  renderJournalEntries,
  type JournalBatchResponse,
} from '@/app/lib/journal';
import { getCatalogue } from '@/i18n/index';
import { getInterfaceLanguage } from '@/app/lib/language';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  context: { params: Promise<{ playthroughId: string }> },
): Promise<Response> {
  const { playthroughId } = await context.params;
  const before = parseJournalCursor(
    new URL(request.url).searchParams.get('before') ?? undefined,
  );
  const sessionHash = await getSessionHash();
  const store = new PlaythroughStore(getDatabase());
  const resolved = await resolvePlaythrough(
    getDatabase(),
    getScenario,
    playthroughId,
    sessionHash,
  );
  if (!resolved) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
  const playthrough = resolved.playthrough;
  const batch = await store.listJournalBatch(playthrough.id, {
    limit: JOURNAL_BATCH_SIZE,
    beforeSeq: before,
  });
  const catalogue = getCatalogue(await getInterfaceLanguage());
  // Journal-only: safe on missing Scenarios and invalid documents alike.
  const characterName = safeCharacterName(playthrough.state, playthrough.scenarioId);
  const body: JournalBatchResponse = {
    entries: renderJournalEntries(batch.entries, catalogue, characterName),
    nextCursor: batch.nextCursor ?? null,
  };
  return Response.json(body);
}
