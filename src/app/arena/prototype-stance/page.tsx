import { notFound } from 'next/navigation';
import CombatPrototype from './prototype';

export default async function Page({ searchParams }: { searchParams: Promise<{ variant?: string }> }) {
  if (process.env.NODE_ENV === 'production') notFound();
  const { variant } = await searchParams;
  return <CombatPrototype variant={variant === 'B' || variant === 'C' ? variant : 'A'} />;
}
