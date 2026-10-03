import { DigestHistory, type DigestEntry } from "@/components/pwa/DigestHistory";
import { DigestSettings } from "@/components/pwa/DigestSettings";
import { InstallHint } from "@/components/pwa/InstallHint";
import { PushSetup } from "@/components/pwa/PushSetup";
import { RemindersOverview } from "@/components/reminders/RemindersOverview";
import { PageTitle } from "@/components/ui";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Rappels · Horaire HELMO" };

/** Les rappels viennent du contexte chargé par le layout ; seuls les réglages du débrief sont lus ici. */
export default async function RappelsPage() {
  const { user, supabase } = await requireUser();
  // Pas encore de ligne (ou table absente avant la migration 0006) : valeurs par défaut.
  const { data } = await supabase.from("user_settings").select("digest_enabled, digest_hour").eq("user_id", user.id).maybeSingle();
  // Derniers débriefs envoyés (table absente avant la migration 0018 : rien à afficher).
  const { data: log } = await supabase.from("digest_log").select("day, body, projects").eq("user_id", user.id).order("day", { ascending: false }).limit(7);
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <PageTitle>Rappels</PageTitle>
      <PushSetup />
      <DigestSettings enabled={data?.digest_enabled ?? true} hour={data?.digest_hour ?? 20} />
      <DigestHistory entries={(log ?? []) as DigestEntry[]} />
      <InstallHint />
      <RemindersOverview />
    </div>
  );
}
