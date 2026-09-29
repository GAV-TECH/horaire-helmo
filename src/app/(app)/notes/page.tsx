import { NoteCard } from "@/components/items/NoteCard";
import { formatSessionDate } from "@/components/items/format";
import { PageTitle } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { courseColor } from "@/lib/courses";
import { loadNotes, loadSessions } from "@/lib/data/queries";
import type { Note } from "@/lib/data/types";
import { attachToSessions } from "@/lib/sessions/attach";

export const metadata = { title: "Notes · Horaire HELMO" };

export default async function NotesPage() {
  const { user, supabase } = await requireUser();
  // Toutes les séances (pas seulement les récentes), sinon les notes anciennes paraîtraient orphelines.
  const [notes, sessions] = await Promise.all([loadNotes(supabase, user.id), loadSessions(supabase, user.id)]);
  const { bySession, orphans } = attachToSessions(notes, (n) => n, sessions);
  const groups = sessions
    .filter((s) => bySession.has(s.key))
    .sort((a, b) => b.start.localeCompare(a.start)) // plus récentes d'abord
    .map((s) => ({ session: s, notes: bySession.get(s.key) ?? [] }));

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <PageTitle>Notes</PageTitle>

      {orphans.length > 0 && (
        <section className="rounded-lg border border-amber-400 p-4">
          <h2 className="font-semibold">Notes orphelines ({orphans.length})</h2>
          <p className="mb-3 text-sm text-zinc-500">
            La séance de ces notes n&apos;existe plus dans ton horaire (supprimée, ou déplacée avec un nouvel identifiant). Les notes
            sont conservées ici.
          </p>
          <div className="flex flex-col gap-2">
            {orphans.map((note) => (
              <NoteCard key={note.id} note={note} header={<NoteHeader title={note.courseTitle} start={note.sessionStart} courseKey={note.courseKey} />} />
            ))}
          </div>
        </section>
      )}

      {groups.length === 0 && orphans.length === 0 && (
        <p className="text-sm text-zinc-500">Aucune note. Clique sur une séance de l&apos;horaire pour en ajouter une.</p>
      )}

      {groups.map(({ session, notes }) => (
        <section key={session.key} className="flex flex-col gap-2">
          <NoteHeader title={session.title} start={session.start} courseKey={session.courseKey} cancelled={session.status === "cancelled"} />
          {notes.map((note: Note) => (
            <NoteCard key={note.id} note={note} />
          ))}
        </section>
      ))}
    </div>
  );
}

function NoteHeader({ title, start, courseKey, cancelled }: { title: string; start: string; courseKey: string; cancelled?: boolean }) {
  return (
    <h2 className="mb-1 flex items-center gap-2 text-sm">
      <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: courseColor(courseKey) }} aria-hidden />
      <span className="font-semibold">{title}</span>
      <span className="text-zinc-500">{formatSessionDate(start)}</span>
      {cancelled && <span className="text-xs text-red-600">(annulée)</span>}
    </h2>
  );
}
