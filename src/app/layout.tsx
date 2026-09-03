import type { Metadata, Viewport } from "next";
import { Toaster } from "@/components/ui/sonner";
import { themeNoFlashScript } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Fitsss",
    template: "%s · Fitsss",
  },
  description: "Your wardrobe as blocks: what you own, and what to wear from it.",
  applicationName: "Fitsss",
  appleWebApp: {
    capable: true,
    // "default" keeps dark status-bar text, which is the readable choice over
    // the light (#f2f2f7) grouped background. theme-color tints the bar itself.
    statusBarStyle: "default",
    title: "Fitsss",
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f2f7" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head>
        {/* Applies the stored theme preference before first paint. */}
        <script dangerouslySetInnerHTML={{ __html: themeNoFlashScript }} />
      </head>
      <body className="flex min-h-full flex-col">
        {children}
        <Toaster
          position="bottom-center"
          offset={{ bottom: "calc(var(--tabbar-h) + env(safe-area-inset-bottom) + 12px)" }}
          mobileOffset={{ bottom: "calc(var(--tabbar-h) + env(safe-area-inset-bottom) + 12px)" }}
        />
      </body>
    </html>
  );
}
