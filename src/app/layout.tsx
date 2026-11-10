import type { Metadata, Viewport } from "next";
import { Figtree } from "next/font/google";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

import "./globals.css";

// A clean geometric sans in the spirit of Flodesk's, kept apart from the Old Mountain brand fonts,
// which only emails use (see theme/tokens.ts).
const font = Figtree({
  variable: "--font-app",
  weight: ["400", "500", "700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Old Mountain CRM",
  description: "Manage subscribers, broadcasts and email journeys.",
  appleWebApp: { title: "Old Mountain", statusBarStyle: "default" },
};

// Lets the page reach under the notch and home bar; the header and page pad for them.
export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: "#f6f6f5",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${font.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster />
      </body>
    </html>
  );
}
