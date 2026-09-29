import Link from "next/link";
import { SettingsForms } from "@/components/settings/SettingsForms";
import { PageTitle, buttonClass, cardClass } from "@/components/ui";
import { signOut } from "@/lib/actions/auth";
import { requireUser } from "@/lib/auth";
import { loadProfile } from "@/lib/data/queries";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Réglages · Horaire HELMO" };

export default async function ParametresPage() {
  const { user, supabase } = await requireUser();
  const profile = await loadProfile(supabase, user.id);

  // On ne lit QUE l'état du lien (dates, erreur), jamais le lien lui-même : il ne quitte pas le serveur.
  const { data: source } = await createAdminClient()
    .from("ics_sources")
    .select("updated_at, last_synced_at, last_error")
    .eq("user_id", user.id)
    .maybeSingle();

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <PageTitle>Réglages</PageTitle>
      <SettingsForms
        displayName={profile.displayName}
        source={
          source
            ? { updatedAt: source.updated_at, lastSyncedAt: source.last_synced_at, lastError: source.last_error }
            : null
        }
      />
      <section className={cardClass}>
        <h2 className="mb-2 font-semibold">Compte</h2>
        <p className="mb-3 text-sm text-zinc-500">Connecté en tant que {user.email}</p>
        <div className="flex flex-wrap gap-2">
          <Link href="/parametres/mot-de-passe" className={buttonClass.secondary}>
            Changer le mot de passe
          </Link>
          <form action={signOut}>
            <button type="submit" className={buttonClass.secondary}>
              Se déconnecter
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
