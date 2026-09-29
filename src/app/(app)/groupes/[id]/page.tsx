import { notFound } from "next/navigation";
import { GroupDetail } from "@/components/groups/GroupDetail";
import { requireUser } from "@/lib/auth";
import { loadDeadlines, loadTodoLists } from "@/lib/data/queries";
import { requestNow } from "@/lib/request-time";
import { idSchema } from "@/lib/validation";

export const metadata = { title: "Groupe · Horaire HELMO" };

export default async function GroupePage({ params }: PageProps<"/groupes/[id]">) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();
  const { user, supabase } = await requireUser();
  const [deadlines, lists, now] = await Promise.all([loadDeadlines(supabase, user.id), loadTodoLists(supabase, user.id), requestNow()]);
  return (
    <GroupDetail
      groupId={id}
      deadlines={deadlines.filter((d) => d.groupId === id)}
      lists={lists.filter((l) => l.groupId === id)}
      now={now}
    />
  );
}
