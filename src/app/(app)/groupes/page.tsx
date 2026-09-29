import { GroupsHome } from "@/components/groups/GroupsHome";

export const metadata = { title: "Groupes · Horaire HELMO" };

/** Les groupes viennent du contexte chargé par le layout. */
export default function GroupesPage() {
  return <GroupsHome />;
}
