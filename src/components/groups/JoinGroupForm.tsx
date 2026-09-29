"use client";

import { joinGroup } from "@/lib/actions/groups";
import { formatInviteCode } from "@/lib/groups";
import { ActionMessage, Field, buttonClass, cardClass, inputClass, useFormAction } from "@/components/ui";

/** On demande une confirmation (un simple lien ne doit pas faire rejoindre un groupe à notre insu). */
export function JoinGroupForm({ code }: { code: string }) {
  const { onSubmit, pending, result } = useFormAction(joinGroup);
  return (
    <form onSubmit={onSubmit} className={`${cardClass} mx-auto flex max-w-sm flex-col gap-3`}>
      <h1 className="text-lg font-semibold">Rejoindre un groupe</h1>
      <p className="text-sm text-zinc-500">
        Les membres verront ton nom affiché et ce que tu partages avec le groupe. Ton horaire et tes notes restent privés.
      </p>
      <Field label="Code d'invitation">
        <input name="code" required defaultValue={formatInviteCode(code)} maxLength={40} className={`${inputClass} uppercase`} />
      </Field>
      <ActionMessage result={result} />
      <button type="submit" disabled={pending} className={buttonClass.primary}>
        Rejoindre le groupe
      </button>
    </form>
  );
}
