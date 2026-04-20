import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SeasonalBackground } from "@/components/SeasonalBackground";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "My Workspace",
  description: "Presentation-style flashcards for teaching and review.",
  authors: [{ name: "Aaron Nisperos", url: "mailto:aaronjoshuanisperos@gmail.com" }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} relative min-h-screen antialiased`}>
        <SeasonalBackground />
        <div className="relative z-10">{children}</div>
      </body>
    </html>
  );
}
