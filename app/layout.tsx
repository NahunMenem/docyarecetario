import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";

const outfit = Outfit({ subsets: ["latin"], weight: ["300","400","500","600","700","800"] });

export const metadata: Metadata = {
  title: "DocYa Recetas",
  description: "Sistema de recetas médicas digitales",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={outfit.className}>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
