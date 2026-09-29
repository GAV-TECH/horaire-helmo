import { InstallHint } from "@/components/pwa/InstallHint";
import { PushSetup } from "@/components/pwa/PushSetup";
import { RemindersOverview } from "@/components/reminders/RemindersOverview";
import { PageTitle } from "@/components/ui";

export const metadata = { title: "Rappels · Horaire HELMO" };

/** Les rappels viennent du contexte chargé par le layout : pas de requête supplémentaire ici. */
export default function RappelsPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <PageTitle>Rappels</PageTitle>
      <PushSetup />
      <InstallHint />
      <RemindersOverview />
    </div>
  );
}
