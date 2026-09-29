import { AppNav } from "@/components/AppNav";
import { requireUser } from "@/lib/auth";

/** Toutes les pages de ce groupe exigent d'être connecté. */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  await requireUser();
  return (
    <>
      <AppNav />
      {/* pb-24 : laisse la place à la barre de navigation fixée en bas sur mobile */}
      <main className="mx-auto w-full max-w-6xl px-3 pb-24 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6 md:pb-10 md:pt-4">
        {children}
      </main>
    </>
  );
}
