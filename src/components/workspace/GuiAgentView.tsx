"use client";

import ActionAgentTerminal from "@/components/terminal/ActionAgentTerminal";

export default function GuiAgentView() {
  return (
    <section className="mx-auto w-full max-w-6xl space-y-4 p-5 sm:p-8">
      <header>
        <p className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#E85D5D]">
          Agente en vivo · Terminal gobernada
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-[#E8F0F3] sm:text-3xl">Agente GUI</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#A6B5BE]">
          Consola interactiva con despacho asistido por IA. Las acciones del Runner requieren aprobación explícita y no
          escriben en sistemas externos.
        </p>
      </header>
      <div className="rounded-2xl border border-[#223039] bg-[#10181D]/70 p-3 sm:p-4">
        <ActionAgentTerminal provider="ollama" model="qwen2.5-coder:3b" />
      </div>
    </section>
  );
}
