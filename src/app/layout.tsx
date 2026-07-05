import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Archivo } from "next/font/google";
import "./globals.css";
import RegisterServiceWorker from "@/components/pwa/RegisterServiceWorker";
import DynamicManifest from "@/components/pwa/DynamicManifest";
import PasswordRecoveryGate from "@/components/auth/PasswordRecoveryGate";

// Body / UI text = Geist Sans; mono = Geist Mono; headings + big numbers = Archivo
// (wired to --font-display, consumed by the heading rule in globals.css).
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const archivo = Archivo({ variable: "--font-archivo", subsets: ["latin"], weight: ["600", "700", "800"] });

export const metadata: Metadata = {
  title: "MicroPulse",
  description: "Dagleg líðansskráning og þjálfanaálag.",
  // Static fallback — DynamicManifest (client) will swap this to
  // /api/manifest?team_id=... once the user's team is known.
  manifest: "/api/manifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "MicroPulse",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#005a2b",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${archivo.variable}`}>
      <body className="font-sans antialiased">
        <RegisterServiceWorker />
        <DynamicManifest />
        <PasswordRecoveryGate />
        {children}
      </body>
    </html>
  );
}
