import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Horaire HELMO",
  description: "Mon horaire de cours enrichi : notes, deadlines, tâches et rappels.",
  // iOS : ouverture en plein écran depuis l'écran d'accueil, avec ce nom sous l'icône.
  appleWebApp: { capable: true, title: "Horaire", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // permet d'utiliser env(safe-area-inset-*) sur les téléphones à encoche
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full">
        {/* Chrome signale très tôt que l'app est installable (beforeinstallprompt), parfois avant que
            React soit prêt : ce petit script le capte immédiatement et le garde pour le bouton "Installer". */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__installPrompt=e;window.dispatchEvent(new Event('installprompt-ready'));});",
          }}
        />
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
