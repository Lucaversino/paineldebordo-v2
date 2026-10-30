import type { Metadata, Viewport } from "next";
import "ol/ol.css";
import "./globals.css";
import "../components/edit.css";
import "../components/empty.css";

export const metadata: Metadata = {
  title: "Painel de Bordo — Pesca Industrial",
  description: "Gestão de viagens, largadas e capturas em alto-mar.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Painel de Bordo",
  },
  applicationName: "Painel de Bordo",
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#071b22",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">{children}</body>
    </html>
  );
}
