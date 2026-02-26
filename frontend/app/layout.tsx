import type { Metadata } from "next";
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';
import "./globals.css";

const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

export const metadata: Metadata = {
  title: "Trialogue - Multi-LLM Chat Interface",
  description: "Chat with up to three AI models simultaneously. Compare responses, run multi-round debates, and find the best answer — bring your own keys or use demo mode.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "Trialogue - Multi-LLM Chat Interface",
    description: "Chat with up to three AI models simultaneously. Compare responses, run multi-round debates, and find the best answer.",
    url: "https://trialogue.vercel.app",
    siteName: "Trialogue",
    images: [
      {
        url: "/og-image.png",
        width: 1408,
        height: 768,
        alt: "Trialogue - Multi-LLM Chat Interface",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Trialogue - Multi-LLM Chat Interface",
    description: "Chat with up to three AI models simultaneously. Compare responses, run multi-round debates, and find the best answer.",
    images: ["/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {GA_ID && (
          <>
            <script async src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} />
            <script
              dangerouslySetInnerHTML={{
                __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${GA_ID}');`,
              }}
            />
          </>
        )}
      </head>
      <body className="antialiased">
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
