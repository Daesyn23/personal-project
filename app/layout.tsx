import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { DeploymentRefreshNotice } from "@/components/DeploymentRefreshNotice";
import { GeminiChatWidget } from "@/components/GeminiChatWidget";
import { PinGate } from "@/components/PinGate";
import { SeasonalBackground } from "@/components/SeasonalBackground";
import { SpeechSynthesisWarmup } from "@/components/SpeechSynthesisWarmup";
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

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} relative min-h-screen min-w-0 overflow-x-hidden antialiased`}
      >
        <SeasonalBackground />
        <div className="relative z-10 min-w-0">
          <SpeechSynthesisWarmup />
          <PinGate>
            <>
              {children}
              <GeminiChatWidget />
              <DeploymentRefreshNotice />
            </>
          </PinGate>
        </div>
      </body>
    </html>
  );
}
