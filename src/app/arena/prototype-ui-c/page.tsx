import { notFound } from 'next/navigation';
import UiCPrototype from './prototype';
import { REVIEW_STATES } from './fixtures';

// THROWAWAY (#185): UI C with real resolver output; `?state=` picks a review state.
export default async function Page({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  if (process.env.NODE_ENV === 'production') notFound();
  const { state } = await searchParams;
  const key = REVIEW_STATES.some(s => s.key === state) ? state! : REVIEW_STATES[0].key;
  return <UiCPrototype stateKey={key} />;
}
