import type { Metadata, Viewport } from "next";
import "@fontsource/manrope/400.css";
import "@fontsource/manrope/500.css";
import "@fontsource/manrope/600.css";
import "@fontsource/manrope/700.css";
import "@fontsource/dm-serif-display/400.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Boulevard Club",
  description: "A private place for family, good games, and better company.",
  applicationName: "The Boulevard Club",
  appleWebApp: { capable: true, title: "Boulevard", statusBarStyle: "default" },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-180.png"
  },
  robots: { index: false, follow: false }
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f7f5ef" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
