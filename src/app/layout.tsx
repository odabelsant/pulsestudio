import "./globals.css";
import { ReactNode } from "react";
import ToastProvider from "@/components/ui/use-toast";
import ThemeProvider from "@/components/workspace/ThemeProvider";
import ThemeBootstrapScript from "@/components/workspace/ThemeBootstrapScript";

export const metadata = {
  title: "PulseStudio",
  description: "Estudio local de IA para desarrollo de software.",
  icons: {
    icon: "/pulsestudio-logo.png",
    apple: "/pulsestudio-logo.png",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <ThemeBootstrapScript />
      </head>
      <body suppressHydrationWarning>
        <ThemeProvider>
          <ToastProvider>{children}</ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}