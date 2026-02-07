import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { QueryProvider } from "@/providers/QueryProvider";
import { Header } from "@/components/layout/Header";
import { Toaster } from "sonner";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SmartCrowd",
  description: "Wallet-weighted prediction market signals",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} font-sans antialiased`}>
        <QueryProvider>
          <Header />
          <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
          <Toaster
            theme="dark"
            position="top-right"
            toastOptions={{
              style: {
                background: "#0a0a0a",
                border: "2px solid #ededed",
                borderRadius: 0,
                color: "#ededed",
              },
            }}
          />
        </QueryProvider>
      </body>
    </html>
  );
}
