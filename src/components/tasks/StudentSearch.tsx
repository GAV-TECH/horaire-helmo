"use client";

import { useEffect, useRef, useState } from "react";
import { searchStudents } from "@/lib/actions/shares";
import type { StudentHit } from "@/lib/data/types";
import { buttonClass, inputClass } from "@/components/styles";

type Props = {
  /** Texte du bouton de chaque résultat ("Inviter", "Envoyer"…). */
  label: (hit: StudentHit) => string;
  disabled?: (hit: StudentHit) => boolean;
  pending?: boolean;
  /** Action sur l'étudiant choisi ; renvoie true si elle a réussi (la recherche est alors vidée). */
  onPick: (hit: StudentHit) => Promise<boolean>;
};

/**
 * Recherche d'un étudiant par son nom, avec suggestions pendant la frappe. Ce qu'on fait de
 * l'étudiant trouvé (l'inviter, lui envoyer une copie…) est décidé par l'appelant via onPick.
 */
export function StudentSearch({ label, disabled, pending, onPick }: Props) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<StudentHit[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // On attend 300 ms après la dernière touche, et on ignore une réponse arrivée après
  // une frappe plus récente (latest).
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef("");
  const search = (text: string) => {
    latest.current = text;
    clearTimeout(timer.current);
    if (text.trim().length < 2) {
      setHits(null);
      return;
    }
    timer.current = setTimeout(async () => {
      const r = await searchStudents(text);
      if (latest.current !== text) return;
      setError(r.ok ? null : r.error);
      setHits(r.ok ? r.students : null);
    }, 300);
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  const pick = async (hit: StudentHit) => {
    if (!(await onPick(hit))) return;
    setQuery("");
    search(""); // vide les résultats et annule une recherche en cours
  };

  return (
    <div className="flex flex-col gap-2 text-sm">
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          search(e.target.value);
        }}
        maxLength={60}
        placeholder="Nom de l'étudiant (2 lettres minimum)"
        aria-label="Nom de l'étudiant"
        autoComplete="off"
        className={inputClass}
      />
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      {hits && hits.length === 0 && <p className="text-xs text-zinc-500">Aucun étudiant trouvé. Il doit avoir un compte sur l&apos;app.</p>}
      {hits && hits.length > 0 && (
        <ul className="flex flex-col gap-1">
          {hits.map((h) => (
            <li key={h.id} className="flex items-center gap-2 rounded-md bg-zinc-50 px-2 py-1.5 dark:bg-zinc-800/60">
              <span className="min-w-0 flex-1 truncate">
                {h.displayName} <span className="text-xs text-zinc-500">{h.emailHint}</span>
              </span>
              <button type="button" disabled={pending || disabled?.(h)} onClick={() => void pick(h)} className={buttonClass.primary}>
                {label(h)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
