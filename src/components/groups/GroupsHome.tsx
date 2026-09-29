"use client";

import Link from "next/link";
import { createGroup, joinGroup } from "@/lib/actions/groups";
import { ActionMessage, Field, PageTitle, buttonClass, cardClass, inputClass, useFormAction } from "@/components/ui";
import { useGroups } from "./GroupsContext";

export function GroupsHome() {
  const { groups } = useGroups();
  const create = useFormAction(createGroup);
  const join = useFormAction(joinGroup);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <PageTitle>Groupes</PageTitle>
      <p className="text-sm text-zinc-500">
        Dans un groupe, vous partagez des deadlines, des listes de tâches et des rappels. Vos horaires, vos notes et vos liens
        d&apos;horaire restent privés.
      </p>

      {groups.length > 0 && (
        <ul className="flex flex-col gap-2">
          {groups.map((g) => (
            <li key={g.id}>
              <Link href={`/groupes/${g.id}`} className={`${cardClass} flex items-center gap-2 hover:bg-zinc-50 dark:hover:bg-zinc-900`}>
                <span className="mr-auto font-semibold">👥 {g.name}</span>
                <span className="text-xs text-zinc-500">
                  {g.members.length} membre{g.members.length > 1 ? "s" : ""}
                  {g.myRole === "admin" && " · admin"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <form onSubmit={create.onSubmit} className={`${cardClass} flex flex-col gap-3`}>
          <h2 className="font-semibold">Créer un groupe</h2>
          <Field label="Nom">
            <input name="name" required maxLength={80} placeholder="Bloc 2 info – groupe B" className={inputClass} />
          </Field>
          <ActionMessage result={create.result} />
          <button type="submit" disabled={create.pending} className={`${buttonClass.primary} self-start`}>
            Créer
          </button>
        </form>

        <form onSubmit={join.onSubmit} className={`${cardClass} flex flex-col gap-3`}>
          <h2 className="font-semibold">Rejoindre un groupe</h2>
          <Field label="Code d'invitation">
            <input name="code" required maxLength={40} placeholder="A3F9-C27E-1B00" autoComplete="off" className={`${inputClass} uppercase`} />
          </Field>
          <ActionMessage result={join.result} />
          <button type="submit" disabled={join.pending} className={`${buttonClass.primary} self-start`}>
            Rejoindre
          </button>
        </form>
      </div>
    </div>
  );
}
