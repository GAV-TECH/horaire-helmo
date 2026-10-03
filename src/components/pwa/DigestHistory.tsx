import Link from "next/link";
import { cardClass } from "@/components/styles";
import { formatFr } from "@/lib/time";

/** Un débrief envoyé (table digest_log) : le texte de la notification + les projets où il y avait du nouveau. */
export type DigestEntry = {
  day: string; // "AAAA-MM-JJ"
  body: string;
  projects: { list_id: string; title: string; messages: number; links: number }[];
};

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;

/** Trace des derniers débriefs : la notification disparaît, le récap reste ici. Le plus récent est déplié. */
export function DigestHistory({ entries }: { entries: DigestEntry[] }) {
  return (
    <section className={cardClass}>
      <h2 className="mb-1 font-semibold">Derniers récaps</h2>
      {entries.length === 0 ? (
        <p className="text-sm text-zinc-500">Aucun récap pour l&apos;instant : le premier apparaîtra ici après le prochain débrief.</p>
      ) : (
        <div className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
          {entries.map((entry, index) => (
            <details key={entry.day} open={index === 0} className="py-2">
              {/* Midi UTC : le même jour à Bruxelles, été comme hiver. */}
              <summary className="cursor-pointer text-sm font-medium first-letter:uppercase">{formatFr(`${entry.day}T12:00:00Z`, "EEEE d MMMM")}</summary>
              <p className="mt-2 text-sm whitespace-pre-line text-zinc-700 dark:text-zinc-300">{entry.body}</p>
              {entry.projects.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-2">
                  {entry.projects.map((p) => (
                    <li key={p.list_id}>
                      <Link href={`/projets/${p.list_id}`} className="inline-block rounded-full border border-zinc-300 px-3 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">
                        {p.title} · {[p.messages > 0 ? plural(p.messages, "message") : null, p.links > 0 ? plural(p.links, "document") : null].filter(Boolean).join(" · ")}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </details>
          ))}
        </div>
      )}
    </section>
  );
}
