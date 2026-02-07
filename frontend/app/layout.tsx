import type { Metadata } from "next";
import Script from "next/script";
import { Analytics } from '@vercel/analytics/react';
import "./globals.css";

const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

export const metadata: Metadata = {
  title: "Trialogue - Multi-LLM Chat Interface",
  description: "Chat with three AI models simultaneously and compare their responses",
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
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
            strategy="afterInteractive"
            onLoad={() => {
              (window as any).dataLayer = (window as any).dataLayer || [];
              function gtag(...args: any[]) { (window as any).dataLayer.push(args); }
              gtag('js', new Date());
              gtag('config', GA_ID);
            }}
          />
        )}
      </head>
      <body className="antialiased">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
