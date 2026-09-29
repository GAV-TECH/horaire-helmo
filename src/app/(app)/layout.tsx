import { AppNav } from "@/components/AppNav";
import { GroupsProvider } from "@/components/groups/GroupsContext";
import { RealtimeRefresher } from "@/components/groups/RealtimeRefresher";
import { PwaBootstrap } from "@/components/pwa/PwaBootstrap";
import { RemindersProvider } from "@/components/reminders/RemindersContext";
import { requireUser } from "@/lib/auth";
import { loadGroups, loadReminders } from "@/lib/data/queries";
import { requestNow } from "@/lib/request-time";

/** Toutes les pages de ce groupe exigent d'être connecté. */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { user, supabase } = await requireUser();
  const [reminders, groups, now] = await Promise.all([loadReminders(supabase), loadGroups(supabase, user.id), requestNow()]);
  return (
    <GroupsProvider me={user.id} groups={groups}>
      <RemindersProvider reminders={reminders} now={now}>
        <PwaBootstrap />
        {/* Temps réel utile seulement si l'on partage quelque chose avec quelqu'un */}
        {groups.length > 0 && <RealtimeRefresher />}
        <AppNav />
        {/* pb-24 : laisse la place à la barre de navigation fixée en bas sur mobile */}
        <main className="mx-auto w-full max-w-6xl px-3 pb-24 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6 md:pb-10 md:pt-4">
          {children}
        </main>
      </RemindersProvider>
    </GroupsProvider>
  );
}
