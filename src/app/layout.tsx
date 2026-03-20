import type { Metadata } from "next";
import { DM_Sans, Geist_Mono, Sora } from "next/font/google";
import "./globals.css";
import { AppLayout } from "@/components/app-layout";
import packageJson from "../../package.json";

const dmSans = DM_Sans({
  variable: "--font-body",
  subsets: ["latin"],
});

const sora = Sora({
  variable: "--font-heading",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "KiwiFolio",
  description: "NZ FIF Portfolio Tracker",
  icons: {
    icon: "/kiwifolio-logo.svg",
    shortcut: "/kiwifolio-logo.svg",
    apple: "/kiwifolio-logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${dmSans.variable} ${sora.variable} ${geistMono.variable} antialiased`}
      >
        <AppLayout version={packageJson.version}>{children}</AppLayout>
      </body>
    </html>
  );
}
