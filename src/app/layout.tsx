import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getLocale } from "next-intl/server";
import { AmxThemeInit } from "@/components/amx-theme-init";
import { BackButtonHandler } from "@/components/back-button-handler";
import { PortraitLock } from "@/components/portrait-lock";
import { AppDialogHost } from "@/components/app-dialog-host";
import { EditingRefreshGuard } from "@/components/editing-refresh-guard";
import { TelegramWebAppInit } from "@/components/telegram-webapp-init";
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
  title: "Asia Mix",
  description: "Туры, брони, финансы и команда",
  applicationName: "Asia Mix",
  appleWebApp: {
    capable: true,
    title: "Asia Mix",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/pwa-icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/pwa-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/pwa-icon-180.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#e9492d",
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} className={`${geistSans.variable} ${geistMono.variable} antialiased`} suppressHydrationWarning>
      <body className="flex flex-col">
        <NextIntlClientProvider messages={messages} locale={locale}>
          <AmxThemeInit />
          <BackButtonHandler />
          <PortraitLock />
          <TelegramWebAppInit />
          <EditingRefreshGuard />
          <AppDialogHost />
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
