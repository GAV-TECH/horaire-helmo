import { AuthForms } from "@/components/auth/AuthForms";

export const metadata = { title: "Connexion · Horaire HELMO" };

export default async function ConnexionPage({ searchParams }: PageProps<"/connexion">) {
  const { next, erreur } = await searchParams;
  return (
    <AuthForms
      next={typeof next === "string" ? next : "/"}
      linkError={erreur === "lien" ? "Ce lien a expiré ou a déjà été utilisé. Reconnecte-toi ou redemande un e-mail." : null}
    />
  );
}
