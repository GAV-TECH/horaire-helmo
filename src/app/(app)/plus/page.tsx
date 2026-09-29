import Link from "next/link";
import { NAV_LINKS } from "@/components/nav-links";
import { InstallHint } from "@/components/pwa/InstallHint";
import { PageTitle } from "@/components/ui";
import { cardClass } from "@/components/styles";

export const metadata = { title: "Plus · Horaire HELMO" };

/** Sur téléphone : les rubriques qui n'ont pas de place dans la barre du bas. */
export default function PlusPage() {
  return (
    <div className="mx-auto max-w-sm">
      <PageTitle>Plus</PageTitle>
      <ul className="flex flex-col gap-2">
        {NAV_LINKS.filter((l) => !l.mobile).map((l) => (
          <li key={l.href}>
            <Link href={l.href} className={`${cardClass} flex items-center gap-3 hover:bg-zinc-50 dark:hover:bg-zinc-900`}>
              {l.icon}
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
      <div className="mt-4">
        <InstallHint />
      </div>
    </div>
  );
}
