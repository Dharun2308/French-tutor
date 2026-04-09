import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { TtsProvider } from "@/components/tts-provider";
import { Nav } from "@/components/nav";

export const metadata: Metadata = {
  title: "French Tutor",
  description: "Adaptive French verb conjugation practice",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <TtsProvider>
            <div className="min-h-screen bg-background">
              <Nav />
              <main>{children}</main>
            </div>
          </TtsProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
