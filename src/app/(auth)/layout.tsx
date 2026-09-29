/** Mise en page des écrans de connexion : une carte centrée, sans barre de navigation. */
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <p className="mb-6 text-center text-2xl font-bold">Horaire HELMO</p>
        {children}
      </div>
    </main>
  );
}
