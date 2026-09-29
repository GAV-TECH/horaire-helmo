import { PasswordForm } from "@/components/settings/PasswordForm";
import { PageTitle } from "@/components/ui";

export const metadata = { title: "Mot de passe · Horaire HELMO" };

export default function MotDePassePage() {
  return (
    <div className="mx-auto max-w-sm">
      <PageTitle>Nouveau mot de passe</PageTitle>
      <PasswordForm />
    </div>
  );
}
