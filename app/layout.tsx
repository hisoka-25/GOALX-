import type {
  Metadata,
  Viewport
} from "next";

import type {
  ReactNode
} from "react";

import {
  PwaRegister
} from "@/components/PwaRegister";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default:
      "GOALX — Défie. Joue. Domine.",
    template:
      "%s | GOALX"
  },

  description:
    "La plateforme de matchmaking compétitif pour les joueurs eFootball.",

  applicationName: "GOALX",

  manifest:
    "/manifest.webmanifest",

  appleWebApp: {
    capable: true,
    title: "GOALX",
    statusBarStyle:
      "black-translucent"
  },

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
    icon: [
      {
        url: "/favicon.svg",
        type: "image/svg+xml"
      },
      {
        url:
          "/goalx-icon-192.png",
        sizes: "192x192",
        type: "image/png"
      }
    ],

    apple:
      "/goalx-icon-192.png"
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
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
