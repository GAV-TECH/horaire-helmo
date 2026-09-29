import { JoinGroupForm } from "@/components/groups/JoinGroupForm";

export const metadata = { title: "Rejoindre un groupe · Horaire HELMO" };

/** Arrivée depuis un lien d'invitation : /groupes/rejoindre?code=XXXX. */
export default async function RejoindrePage({ searchParams }: PageProps<"/groupes/rejoindre">) {
  const { code } = await searchParams;
  return <JoinGroupForm code={typeof code === "string" ? code.slice(0, 40) : ""} />;
}
