import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import TimeBanner from "@/components/TimeBanner";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Trading Journal",
  description: "Track, analyze, and improve your trading performance",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <TimeBanner />
        {children}
      </body>
    </html>
  );
}
