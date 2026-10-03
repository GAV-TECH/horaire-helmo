import { AppNav } from "@/components/AppNav";
import { GroupsProvider } from "@/components/groups/GroupsContext";
import { RealtimeRefresher } from "@/components/groups/RealtimeRefresher";
import { PwaBootstrap } from "@/components/pwa/PwaBootstrap";
import { ShareRequests } from "@/components/tasks/ShareRequests";
import { RemindersProvider } from "@/components/reminders/RemindersContext";
import { requireUser } from "@/lib/auth";
import { loadGroups, loadReminders, loadTaskOffers, loadTaskShares } from "@/lib/data/queries";
import { requestNow } from "@/lib/request-time";

/** Toutes les pages de ce groupe exigent d'être connecté. */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { user, supabase } = await requireUser();
  const [reminders, groups, shares, offers, now] = await Promise.all([
    loadReminders(supabase),
    loadGroups(supabase, user.id),
    loadTaskShares(supabase),
    loadTaskOffers(supabase),
    requestNow(),
  ]);
  return (
    <GroupsProvider me={user.id} groups={groups} shares={shares} offers={offers}>
      <RemindersProvider reminders={reminders} now={now}>
        <PwaBootstrap />
        {/* Toujours actif : on peut rejoindre un groupe à tout moment sans recharger la page */}
        <RealtimeRefresher />
        {/* App installée sur téléphone : la page passe SOUS l'heure et la batterie (viewport "cover").
            Cette bande opaque, de la hauteur de la barre d'état, empêche le contenu qui défile de s'y mélanger. */}
        <div aria-hidden className="fixed inset-x-0 top-0 z-30 h-[env(safe-area-inset-top)] bg-background" />
        <AppNav />
        <ShareRequests />
        {/* pb-24 : laisse la place à la barre de navigation fixée en bas sur mobile */}
        <main className="mx-auto w-full max-w-6xl px-3 pb-24 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6 md:pb-10 md:pt-4">
          {children}
        </main>
      </RemindersProvider>
    </GroupsProvider>
  );
}
