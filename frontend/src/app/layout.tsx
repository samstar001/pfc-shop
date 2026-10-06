import type { Metadata } from "next";
import { Bricolage_Grotesque, Hanken_Grotesk } from "next/font/google";
import "./globals.css";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { AuthProvider } from "@/lib/auth/AuthProvider";

// Fonts: headings and body text
const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
});
const body = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-hanken" });

// Default page title and description
export const metadata: Metadata = {
  title: { default: "PAT Footwear Collection", template: "%s | PFC" },
  description:
    "Shop footwear from PAT Footwear Collection. Pick your size and colour and pay securely online.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body className="min-h-screen">
        {/* Everything inside needs the signed-in user */}
        <AuthProvider>
          <Header />
          <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
          <Footer />
        </AuthProvider>
      </body>
    </html>
  );
}
