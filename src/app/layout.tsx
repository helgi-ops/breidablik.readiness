import type { Metadata, Viewport } from "next";
import "./globals.css";
import RegisterServiceWorker from "@/components/pwa/RegisterServiceWorker";
import DynamicManifest from "@/components/pwa/DynamicManifest";
import PasswordRecoveryGate from "@/components/auth/PasswordRecoveryGate";

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
    <html lang="is">
      <body className="antialiased">
        <RegisterServiceWorker />
        <DynamicManifest />
        <PasswordRecoveryGate />
        {children}
      </body>
    </html>
  );
}
