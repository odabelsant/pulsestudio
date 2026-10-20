"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { apiFetch } from "@/lib/api-fetch";
import {
  Eye,
  EyeOff,
  Copy,
  Check,
  Trash2,
  Edit2,
  Plus,
  Shield,
  Key,
  Search,
  Lock,
  Unlock,
  RefreshCw,
} from "lucide-react";

export type EnvVar = {
  id: string;
  key: string;
  value: string;
  environments: string[];
  projectId?: string;
  createdAt?: string;
  updatedAt?: string;
};

const ALL_ENVS = ["development", "preview", "production"] as const;

export function EnvironmentVariablesPanel() {
  const [variables, setVariables] = useState<EnvVar[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [adminToken, setAdminToken] = useState("");
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Form state
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [selectedEnvs, setSelectedEnvs] = useState<string[]>([
    "development",
    "preview",
    "production",
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edit modal
  const [editingVar, setEditingVar] = useState<EnvVar | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editEnvs, setEditEnvs] = useState<string[]>([]);

  // Revealed secrets map: id -> cleartext value
  const [revealedValues, setRevealedValues] = useState<Record<string, string>>({});

  const { toast } = useToast();

  const fetchVariables = useCallback(async () => {
    setLoading(true);
    try {
      const headers: Record<string, string> = {};
      if (adminToken) headers["x-pulse-admin-token"] = adminToken;

      const res = await apiFetch("/api/env", { headers });
      if (res.status === 401) {
        setShowTokenInput(true);
        toast({
          title: "Autorización requerida",
          description: "Ingresa el token administrativo para gestionar las variables.",
          variant: "destructive",
        });
        setVariables([]);
        return;
      }

      if (!res.ok) {
        throw new Error("No se pudieron cargar las variables de entorno.");
      }

      const data = await res.json();
      setVariables(Array.isArray(data) ? data : []);
    } catch (error) {
      toast({
        title: "Error de conexión",
        description: error instanceof Error ? error.message : "Error al conectar con /api/env",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [adminToken, toast]);

  useEffect(() => {
    fetchVariables();
  }, [fetchVariables]);

  const saveToken = () => {
    setShowTokenInput(false);
    toast({
      title: "Autorización temporal",
      description: "El token administrativo se conservará sólo en memoria mientras esta vista permanezca abierta.",
    });
    fetchVariables();
  };

  const toggleReveal = async (item: EnvVar) => {
    if (revealedValues[item.id]) {
      setRevealedValues((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      return;
    }

    try {
      const headers: Record<string, string> = {};
      if (adminToken) headers["x-pulse-admin-token"] = adminToken;

      const res = await apiFetch(`/api/env?reveal=${encodeURIComponent(item.id)}`, { headers });
      if (!res.ok) {
        throw new Error("No se pudo revelar la variable.");
      }
      const data = await res.json();
      setRevealedValues((prev) => ({
        ...prev,
        [item.id]: data.value,
      }));
    } catch (err) {
      toast({
        title: "Error al revelar",
        description: err instanceof Error ? err.message : "Acceso denegado.",
        variant: "destructive",
      });
    }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 2000);
    toast({
      title: "Copiado al portapapeles",
      description: `Valor copiado exitosamente.`,
    });
  };

  const handleAddVariable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKey.trim() || !newValue.trim()) {
      toast({
        title: "Campos requeridos",
        description: "Nombre (Key) y Valor son obligatorios.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (adminToken) headers["x-pulse-admin-token"] = adminToken;

      const res = await apiFetch("/api/env", {
        method: "POST",
        headers,
        body: JSON.stringify({
          key: newKey.trim(),
          value: newValue.trim(),
          environments: selectedEnvs,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "Error al registrar la variable.");
      }

      toast({
        title: "Variable guardada",
        description: `Se registró ${newKey.trim()} con éxito.`,
      });

      setNewKey("");
      setNewValue("");
      setSelectedEnvs(["development", "preview", "production"]);
      fetchVariables();
    } catch (err) {
      toast({
        title: "Error al guardar",
        description: err instanceof Error ? err.message : "Error inesperado.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string, keyName: string) => {
    if (!confirm(`¿Eliminar la variable ${keyName}? Esta acción es irreversible.`)) {
      return;
    }

    try {
      const headers: Record<string, string> = {};
      if (adminToken) headers["x-pulse-admin-token"] = adminToken;

      const res = await apiFetch(`/api/env?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers,
      });

      if (!res.ok) {
        throw new Error("No se pudo eliminar la variable.");
      }

      setVariables((prev) => prev.filter((v) => v.id !== id));
      toast({
        title: "Variable eliminada",
        description: `${keyName} fue eliminada del almacén.`,
      });
    } catch (err) {
      toast({
        title: "Error al eliminar",
        description: err instanceof Error ? err.message : "Error inesperado.",
        variant: "destructive",
      });
    }
  };

  const openEditModal = (item: EnvVar) => {
    setEditingVar(item);
    setEditValue(revealedValues[item.id] || "");
    setEditEnvs(item.environments || ["development", "preview", "production"]);
  };

  const handleSaveEdit = async () => {
    if (!editingVar) return;
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (adminToken) headers["x-pulse-admin-token"] = adminToken;

      const res = await apiFetch("/api/env", {
        method: "POST",
        headers,
        body: JSON.stringify({
          key: editingVar.key,
          value: editValue,
          environments: editEnvs,
        }),
      });

      if (!res.ok) {
        throw new Error("No se pudo actualizar la variable.");
      }

      toast({
        title: "Variable actualizada",
        description: `${editingVar.key} ha sido guardada.`,
      });

      setEditingVar(null);
      fetchVariables();
    } catch (err) {
      toast({
        title: "Error al actualizar",
        description: err instanceof Error ? err.message : "Error inesperado.",
        variant: "destructive",
      });
    }
  };

  const filteredVars = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return variables;
    return variables.filter(
      (v) =>
        v.key.toLowerCase().includes(q) ||
        v.environments.some((env) => env.toLowerCase().includes(q))
    );
  }, [variables, search]);

  const getEnvBadge = (env: string) => {
    switch (env) {
      case "production":
        return "bg-rose-500/10 text-rose-300 border-rose-500/20";
      case "preview":
        return "bg-purple-500/10 text-purple-300 border-purple-500/20";
      case "development":
        return "bg-blue-500/10 text-blue-300 border-blue-500/20";
      default:
        return "bg-zinc-500/10 text-zinc-300 border-zinc-500/20";
    }
  };

  return (
    <div className="space-y-6">
      {/* Barra superior de estado y token */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-2xl border border-white/[0.08] bg-[#141414] p-4">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-white/[0.05] text-zinc-200 border border-white/[0.08]">
            <Key className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">
              Gestor de Variables y Secretos
            </h2>
            <p className="text-xs text-zinc-400">
              Estilo Vercel · Almacenamiento seguro por entornos y encriptación local
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowTokenInput((v) => !v)}
            className="border-white/[0.1] bg-[#1a1a1a] text-xs text-zinc-300 hover:text-white"
          >
            {adminToken ? <Lock className="h-3.5 w-3.5 mr-1.5 text-emerald-400" /> : <Unlock className="h-3.5 w-3.5 mr-1.5 text-amber-400" />}
            {adminToken ? "Token Activo" : "Configurar Token"}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={fetchVariables}
            disabled={loading}
            className="border-white/[0.1] bg-[#1a1a1a] text-xs text-zinc-300 hover:text-white"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Input de token si está abierto */}
      {showTokenInput && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.05] p-4 flex flex-col sm:flex-row gap-3 items-center">
          <Shield className="h-5 w-5 text-amber-400 shrink-0" />
          <div className="flex-1 w-full">
            <p className="text-xs font-medium text-amber-200 mb-1">
              PULSE_ADMIN_TOKEN (requerido para modificar secretos):
            </p>
            <Input
              type="password"
              value={adminToken}
              onChange={(e) => setAdminToken(e.target.value)}
              placeholder="Ej: pulse_sec_..."
              className="bg-[#111] border-white/[0.1] text-xs font-mono h-8"
            />
          </div>
          <Button size="sm" onClick={saveToken} className="shrink-0 h-8 text-xs bg-blue-600 text-white font-semibold hover:bg-blue-700 hover:text-white">
            Guardar Token
          </Button>
        </div>
      )}

      {/* Formulario de creación tipo Vercel */}
      <form
        onSubmit={handleAddVariable}
        className="rounded-2xl border border-white/[0.08] bg-[#141414] p-5 shadow-xl space-y-4"
      >
        <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Añadir Nueva Variable
          </span>
          <span className="text-[11px] text-zinc-500">
            Compatible con Next.js y procesos en background
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-medium text-zinc-400 mb-1">
              CLAVE (KEY)
            </label>
            <Input
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder="EJ: NEXT_PUBLIC_API_URL o STRIPE_SECRET"
              className="font-mono text-xs uppercase bg-[#1a1a1a] border-white/[0.1] text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-400"
              required
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-zinc-400 mb-1">
              VALOR (VALUE)
            </label>
            <Input
              type="password"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              placeholder="Pega el valor o secreto aquí..."
              className="font-mono text-xs bg-[#1a1a1a] border-white/[0.1] text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-400"
              required
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-400">Entornos:</span>
            {ALL_ENVS.map((env) => {
              const active = selectedEnvs.includes(env);
              return (
                <button
                  type="button"
                  key={env}
                  onClick={() =>
                    setSelectedEnvs((prev) =>
                      prev.includes(env)
                        ? prev.filter((e) => e !== env)
                        : [...prev, env]
                    )
                  }
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium border transition ${
                    active
                      ? getEnvBadge(env)
                      : "border-white/[0.05] bg-transparent text-zinc-600 hover:text-zinc-400"
                  }`}
                >
                  {env}
                </button>
              );
            })}
          </div>

          <Button
            type="submit"
            disabled={isSubmitting || !newKey.trim() || !newValue.trim()}
            className="bg-blue-600 text-white hover:bg-blue-700 hover:text-white text-xs font-semibold h-8 px-4"
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Guardar Variable
          </Button>
        </div>
      </form>

      {/* Lista y filtro de variables */}
      <div className="rounded-2xl border border-white/[0.08] bg-[#141414] overflow-hidden shadow-xl">
        <div className="p-4 border-b border-white/[0.06] flex items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-500" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filtrar por nombre o entorno..."
              className="pl-8 bg-[#1a1a1a] border-white/[0.08] text-xs h-8 text-zinc-200 placeholder:text-zinc-600"
            />
          </div>
          <span className="text-xs text-zinc-500">
            {filteredVars.length} variable{filteredVars.length === 1 ? "" : "s"}
          </span>
        </div>

        <div className="divide-y divide-white/[0.05]">
          {filteredVars.length === 0 ? (
            <div className="p-8 text-center text-zinc-500 text-xs">
              {loading ? "Cargando variables..." : "No hay variables de entorno registradas."}
            </div>
          ) : (
            filteredVars.map((item) => {
              const isRevealed = Boolean(revealedValues[item.id]);
              const displayValue = isRevealed
                ? revealedValues[item.id]
                : item.value;

              return (
                <div
                  key={item.id}
                  className="p-4 hover:bg-white/[0.02] transition flex flex-col md:flex-row md:items-center justify-between gap-3"
                >
                  <div className="min-w-0 space-y-1.5 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-zinc-100 tracking-tight">
                        {item.key}
                      </span>
                      <button
                        onClick={() => handleCopy(item.key, `key-${item.id}`)}
                        className="text-zinc-500 hover:text-zinc-300 p-0.5 rounded transition"
                        title="Copiar clave"
                      >
                        {copiedKey === `key-${item.id}` ? (
                          <Check className="h-3 w-3 text-emerald-400" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </button>
                    </div>

                    <div className="flex items-center gap-2 font-mono text-xs text-zinc-400">
                      <span className="truncate max-w-md bg-[#0e0e0e] px-2 py-0.5 rounded border border-white/[0.06]">
                        {displayValue}
                      </span>
                      <button
                        onClick={() => toggleReveal(item)}
                        className="text-zinc-500 hover:text-zinc-200 p-0.5 rounded transition"
                        title={isRevealed ? "Ocultar secreto" : "Revelar secreto"}
                      >
                        {isRevealed ? (
                          <EyeOff className="h-3.5 w-3.5 text-amber-400" />
                        ) : (
                          <Eye className="h-3.5 w-3.5" />
                        )}
                      </button>
                      {isRevealed && (
                        <button
                          onClick={() => handleCopy(revealedValues[item.id], `val-${item.id}`)}
                          className="text-zinc-500 hover:text-zinc-200 p-0.5 rounded transition"
                          title="Copiar valor descubierto"
                        >
                          {copiedKey === `val-${item.id}` ? (
                            <Check className="h-3 w-3 text-emerald-400" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="flex items-center gap-1.5">
                      {item.environments.map((env) => (
                        <span
                          key={env}
                          className={`text-[10px] font-medium px-2 py-0.5 rounded border ${getEnvBadge(
                            env
                          )}`}
                        >
                          {env}
                        </span>
                      ))}
                    </div>

                    <div className="flex items-center gap-1 border-l border-white/[0.08] pl-2">
                      <button
                        onClick={() => openEditModal(item)}
                        className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:bg-white/[0.08] hover:text-white transition"
                        title="Editar variable"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(item.id, item.key)}
                        className="grid h-7 w-7 place-items-center rounded-lg text-zinc-500 hover:bg-rose-500/10 hover:text-rose-400 transition"
                        title="Eliminar variable"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Modal de edición */}
      {editingVar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/[0.12] bg-[#171717] p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-semibold text-white">
              Editar Variable: <span className="font-mono text-emerald-400">{editingVar.key}</span>
            </h3>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">
                Nuevo Valor
              </label>
              <Input
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                placeholder="Ingresa el nuevo valor"
                className="font-mono text-xs bg-[#111] border-white/[0.1] text-zinc-100"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-2">
                Entornos asignados
              </label>
              <div className="flex gap-2">
                {ALL_ENVS.map((env) => {
                  const active = editEnvs.includes(env);
                  return (
                    <button
                      type="button"
                      key={env}
                      onClick={() =>
                        setEditEnvs((prev) =>
                          prev.includes(env)
                            ? prev.filter((e) => e !== env)
                            : [...prev, env]
                        )
                      }
                      className={`text-xs px-2.5 py-1 rounded-lg border font-medium ${
                        active
                          ? getEnvBadge(env)
                          : "border-white/[0.08] bg-transparent text-zinc-500"
                      }`}
                    >
                      {env}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditingVar(null)}
                className="text-xs text-zinc-400 hover:text-white"
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={handleSaveEdit}
                className="text-xs bg-blue-600 text-white hover:bg-blue-700 hover:text-white font-semibold"
              >
                Actualizar Variable
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
export default EnvironmentVariablesPanel;