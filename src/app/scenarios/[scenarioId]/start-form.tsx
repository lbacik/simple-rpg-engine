'use client';

import { useActionState } from 'react';
import { startPlaythroughAction, type StartState } from '@/app/lib/start';

export default function StartForm({
  scenarioId,
  templates,
}: {
  scenarioId: string;
  templates: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState<StartState, FormData>(
    startPlaythroughAction.bind(null, scenarioId),
    {},
  );
  return (
    <form action={action}>
      <fieldset>
        <legend>Character Template</legend>
        {templates.map((template, index) => (
          <p key={template.id}>
            <label>
              <input
                type="radio"
                name="templateId"
                value={template.id}
                defaultChecked={index === 0}
                required
              />{' '}
              {template.name}
            </label>
          </p>
        ))}
      </fieldset>
      <p>
        <label htmlFor="name">Character name</label>
        <input id="name" name="name" type="text" maxLength={40} required autoComplete="off" />
      </p>
      {state.error ? (
        <p className="error" role="alert">
          {state.error}
        </p>
      ) : null}
      <p>
        <button className="button" type="submit" disabled={pending}>
          {pending ? 'Starting…' : 'Start the Playthrough'}
        </button>
      </p>
    </form>
  );
}
