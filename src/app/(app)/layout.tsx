import { AppNav } from "@/components/AppNav";
import { PwaBootstrap } from "@/components/pwa/PwaBootstrap";
import { RemindersProvider } from "@/components/reminders/RemindersContext";
import { requireUser } from "@/lib/auth";
import { loadReminders } from "@/lib/data/queries";
import { requestNow } from "@/lib/request-time";

/** Toutes les pages de ce groupe exigent d'être connecté. */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { user, supabase } = await requireUser();
  const [reminders, now] = await Promise.all([loadReminders(supabase, user.id), requestNow()]);
  return (
    <RemindersProvider reminders={reminders} now={now}>
      <PwaBootstrap />
      <AppNav />
      {/* pb-24 : laisse la place à la barre de navigation fixée en bas sur mobile */}
      <main className="mx-auto w-full max-w-6xl px-3 pb-24 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6 md:pb-10 md:pt-4">
        {children}
      </main>
    </RemindersProvider>
  );
}
