"use client";

import { useState, useTransition } from "react";
import type { ActionResult } from "@/lib/actions/context";
import { saveDigestSettings } from "@/lib/actions/digest";
import { ActionMessage } from "@/components/ui";
import { cardClass, inputClass } from "@/components/styles";

/** Réglage du débrief quotidien : une notification le soir avec le bilan du jour et le programme de demain. */
export function DigestSettings({ enabled: initialEnabled, hour: initialHour }: { enabled: boolean; hour: number }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [hour, setHour] = useState(initialHour);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  const save = (nextEnabled: boolean, nextHour: number) => {
    setEnabled(nextEnabled);
    setHour(nextHour);
    startTransition(async () => setResult(await saveDigestSettings(nextEnabled, nextHour)));
  };

  return (
    <section className={cardClass}>
      <h2 className="mb-1 font-semibold">Débrief quotidien</h2>
      <p className="mb-3 text-sm text-zinc-500">
        Chaque jour, une notification : tâches faites, ce qui reste, les cours, tâches et échéances de demain, et la prochaine évaluation.
      </p>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={enabled} disabled={pending} onChange={(e) => save(e.target.checked, hour)} className="h-4 w-4 accent-blue-600" />
          Activé
        </label>
        <label className="flex items-center gap-2">
          à
          <select value={hour} disabled={pending || !enabled} onChange={(e) => save(enabled, Number(e.target.value))} className={`${inputClass} w-auto py-1`} aria-label="Heure du débrief">
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, "0")}:00
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="mt-2">
        <ActionMessage result={result} />
      </div>
      <p className="mt-2 text-xs text-zinc-500">Nécessite les notifications activées sur au moins un appareil (ci-dessus).</p>
    </section>
  );
}
