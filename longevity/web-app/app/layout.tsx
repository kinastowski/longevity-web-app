"use client";

import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Amplify } from "aws-amplify";
import { Authenticator } from "@aws-amplify/ui-react";
import "@aws-amplify/ui-react/styles.css";
import outputs from "@/amplify_outputs.json";
import { SageToggle } from "@/components/SageToggle";

Amplify.configure(outputs);

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pl"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Authenticator>
          {({ signOut, user }) => (
            <>
              <nav className="sticky top-0 z-50 w-full bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-700 tracking-wide">
                  GO Life
                </span>
                <SageToggle />
              </nav>
              <main className="flex-1">{children}</main>
            </>
          )}
        </Authenticator>
      </body>
    </html>
  );
}
