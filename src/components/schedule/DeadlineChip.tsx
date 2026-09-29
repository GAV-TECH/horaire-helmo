import Link from "next/link";
import { courseColor } from "@/lib/courses";
import type { Deadline } from "@/lib/data/types";
import { formatFr } from "@/lib/time";

/** Deadline affichée dans le calendrier (rangée "jour" de la grille ou liste du jour). */
export function DeadlineChip({ deadline }: { deadline: Deadline }) {
  const color = deadline.courseKey ? courseColor(deadline.courseKey) : "#71717a";
  return (
    <Link
      href={`/deadlines?modifier=${deadline.id}`}
      className={`block truncate rounded border border-dashed px-1.5 py-0.5 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-900 ${
        deadline.priority === 1 ? "font-semibold" : ""
      }`}
      style={{ borderColor: color, color }}
      title={`${deadline.title} — ${formatFr(deadline.dueAt, "HH:mm")}${deadline.courseName ? ` · ${deadline.courseName}` : ""}`}
    >
      ⚑ {formatFr(deadline.dueAt, "HH:mm")} {deadline.title}
    </Link>
  );
}
