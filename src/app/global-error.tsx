"use client";

import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-[#0b0b0b] text-zinc-100 p-8">
        <div className="max-w-md mx-auto">
          <div className="rounded-2xl border border-white/[0.08] bg-[#171717] p-8 shadow-2xl mb-6">
            <div className="flex items-center justify-center h-12 w-12 rounded-bg-white/10 mb-6">
              <svg className="h-6 w-6 fill-none stroke-white" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>
            <h2 className="text-2xl font-semibold tracking-tight text-white mb-2">Something went wrong</h2>
            <p className="text-zinc-500 mb-6">Error inesperado en la aplicación. Por favor, recarga la página o vuelve al inicio.</p>
            <Button onClick={() => window.location.reload()} className="w-full">
              Recargar página
            </Button>
          </div>
        </div>
      </body>
    </html>
  );
}