import type { Metadata } from "next";
import { Analytics } from '@vercel/analytics/react';
import "./globals.css";

const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

export const metadata: Metadata = {
  title: "Trialogue - Multi-LLM Chat Interface",
  description: "Chat with up to three AI models simultaneously. Compare responses, run multi-round debates, and find the best answer — bring your own keys or use demo mode.",
  icons: {
    icon: "/logo.png",
    shortcut: "/logo.png",
    apple: "/logo.png",
  },
  openGraph: {
    title: "Trialogue - Multi-LLM Chat Interface",
    description: "Chat with up to three AI models simultaneously. Compare responses, run multi-round debates, and find the best answer.",
    url: "https://trialogue.vercel.app",
    siteName: "Trialogue",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
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
      </body>
    </html>
  );
}
