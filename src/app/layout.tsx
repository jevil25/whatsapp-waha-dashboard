import "~/styles/globals.css";

import { type Metadata } from "next";
import { Geist } from "next/font/google";

import { TRPCReactProvider } from "~/trpc/react";
import Footer from "./_components/Footer";

export const metadata: Metadata = {
  title: "WhatsApp Group Manager",
  description: "Manage your WhatsApp groups and campaigns efficiently.",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geist.variable}`}>
      <body className="flex min-h-screen flex-col">
        <TRPCReactProvider>
          <main className="flex-1">{children}</main>
          <Footer />
        </TRPCReactProvider>
      </body>
    </html>
  );
}
