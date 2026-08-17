import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "GOALX — Défie. Joue. Domine.",
    template: "%s | GOALX"
  },

  description:
    "La plateforme de matchmaking compétitif pour les joueurs eFootball.",

  applicationName: "GOALX",

  keywords: [
    "GOALX",
    "eFootball",
    "matchmaking",
    "football",
    "esport",
    "compétition"
  ],

  authors: [
    {
      name: "GOALX"
    }
  ],

  creator: "GOALX",
  publisher: "GOALX",

  formatDetection: {
    email: false,
    address: false,
    telephone: false
  },

  icons: {
    icon: "/favicon.svg"
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#080c12",
  colorScheme: "dark"
};

type RootLayoutProps = Readonly<{
  children: ReactNode;
}>;

export default function RootLayout({
  children
}: RootLayoutProps) {
  return (
    <html lang="fr">
      <body>
        {children}
      </body>
    </html>
  );
}
