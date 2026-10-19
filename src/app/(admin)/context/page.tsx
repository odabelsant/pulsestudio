import ContextLibraryView from "@/components/context/ContextLibraryView";

export default function ContextPage() {
  return (
    <main className="min-h-screen bg-[#0b0b0b] px-5 py-8 text-zinc-100 sm:px-8">
      <section className="mx-auto w-full max-w-6xl">
        <h1 className="mb-2 text-2xl font-semibold tracking-tight">Cerebro de Contexto</h1>
        <p className="mb-8 text-sm text-zinc-500">Cuadernos, fuentes de referencia y notas del proyecto.</p>
        <ContextLibraryView />
      </section>
    </main>
  );
}
