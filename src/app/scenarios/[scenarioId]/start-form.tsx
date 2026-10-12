// The Character creation form (docs/spec/ui.md, character creation): a Client
// Component, so every word it shows arrives as rendered strings in `strings`
// and the start errors arrive from the Server Action already rendered in the
// language current when they are shown. No catalogue is imported here.

'use client';

import { useActionState } from 'react';
import { startPlaythroughAction, type StartState } from '@/app/lib/start';

export default function StartForm({
  scenarioId,
  templates,
  strings,
}: {
  scenarioId: string;
  templates: { id: string; name: string }[];
  strings: { legend: string; nameLabel: string; submit: string; starting: string };
}) {
  const [state, action, pending] = useActionState<StartState, FormData>(
    startPlaythroughAction.bind(null, scenarioId),
    {},
  );
  return (
    <form action={action}>
      <fieldset>
        <legend>{strings.legend}</legend>
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
        <label htmlFor="name">{strings.nameLabel}</label>
        <input id="name" name="name" type="text" maxLength={40} required autoComplete="off" />
      </p>
      {state.error ? (
        <p className="error" role="alert">
          {state.error}
        </p>
      ) : null}
      <p>
        <button className="button" type="submit" disabled={pending}>
          {pending ? strings.starting : strings.submit}
        </button>
      </p>
    </form>
  );
}
