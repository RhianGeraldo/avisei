import type { Metadata } from "next";
import { Space_Grotesk, DM_Sans } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";
import { Providers } from "@/components/providers";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Avisei — Mensageria Inteligente",
  description: "Plataforma de mensageria WhatsApp automatizada e inteligente para sua empresa.",
  openGraph: {
    title: "Avisei — Mensageria Inteligente",
    description: "Mensageria WhatsApp automatizada e inteligente para sua empresa.",
    url: "https://avisei.erriesse.com",
    siteName: "Avisei",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Avisei — Mensageria Inteligente",
    description: "Mensageria WhatsApp automatizada e inteligente para sua empresa.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="dark">
      <body className={`${spaceGrotesk.variable} ${dmSans.variable} font-sans antialiased`}>
        <Providers>
          {children}
          <Toaster richColors position="top-right" />
        </Providers>
      </body>
    </html>
  );
}
