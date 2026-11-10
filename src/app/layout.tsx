import type { Metadata, Viewport } from "next";
import { Roboto } from "next/font/google";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

import "./globals.css";

const font = Roboto({
  variable: "--font-app",
  weight: ["400", "500", "700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Old Mountain CRM",
  description: "Manage subscribers, broadcasts and email journeys.",
  appleWebApp: { title: "Old Mountain", statusBarStyle: "default" },
};

// Lets the page reach under the notch and home bar; the header and tab bar pad for them.
export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: "#fcfbf8",
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
