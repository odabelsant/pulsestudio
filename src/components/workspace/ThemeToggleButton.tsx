"use client";

import { Moon, Sun } from "lucide-react";
import { saveWorkspaceTheme, useWorkspaceTheme } from "@/components/workspace/ThemeProvider";

export default function ThemeToggleButton() {
  const theme = useWorkspaceTheme();

  return (
    <button
      type="button"
      onClick={() => saveWorkspaceTheme(theme === "dark" ? "light" : "dark")}
      className="grid h-8 w-8 place-items-center rounded-lg border border-[#223039] text-[#A6B5BE] transition hover:bg-[#141F25] hover:text-[#E8F0F3]"
      aria-label={`Cambiar a tema ${theme === "dark" ? "claro" : "oscuro"}`}
      aria-pressed={theme === "light"}
      title={`Cambiar a tema ${theme === "dark" ? "claro" : "oscuro"}`}
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
