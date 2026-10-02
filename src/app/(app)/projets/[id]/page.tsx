import Link from "next/link";
import { notFound } from "next/navigation";
import { ProjectView } from "@/components/projects/ProjectView";
import { requireUser } from "@/lib/auth";
import { loadProjectMessages, loadTodoLists } from "@/lib/data/queries";
import { requestNow } from "@/lib/request-time";
import { idSchema } from "@/lib/validation";

export const metadata = { title: "Projet · Horaire HELMO" };

export default async function ProjetPage({ params }: PageProps<"/projets/[id]">) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();
  const { user, supabase } = await requireUser();
  const [lists, messages, now] = await Promise.all([loadTodoLists(supabase, user.id), loadProjectMessages(supabase, id), requestNow()]);
  // Le RLS ne renvoie que mes projets et ceux de mes groupes : introuvable = pas le droit (ou supprimé).
  const project = lists.find((l) => l.id === id && l.scope === "project");
  if (!project) {
    return (
      <div className="py-16 text-center">
        <p className="font-semibold">Projet introuvable.</p>
        <p className="mt-1 text-sm text-zinc-500">Il a peut-être été supprimé, ou tu ne fais plus partie de son groupe.</p>
        <Link href="/projets" className="mt-4 inline-block text-sm text-blue-600 hover:underline">
          ‹ Projets
        </Link>
      </div>
    );
  }
  return <ProjectView project={project} messages={messages} now={now} />;
}
