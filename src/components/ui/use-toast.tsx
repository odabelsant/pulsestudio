"use client";

import React, { createContext, useContext, useState, useCallback } from "react";

export type Toast = {
  id: string;
  title: string;
  description?: string;
  variant?: "default" | "destructive";
};

type ToastContextType = {
  toast: (props: Omit<Toast, "id">) => void;
  toasts: Toast[];
};

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    return {
      toast: () => {},
      toasts: [],
    };
  }
  return context;
}

export default function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((props: Omit<Toast, "id">) => {
    const id = Math.random().toString(36).substring(2, 9);
    const newToast: Toast = { ...props, id };
    setToasts((prev) => [...prev.slice(-2), newToast]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ toast, toasts }}>
      {children}
      <div className="fixed top-4 right-4 z-50 space-y-4 pointer-events-none">
        {toasts.map((item) => (
          <div
            key={item.id}
            className={`pointer-events-auto rounded-2xl border p-4 max-w-sm animate-in fade-in-0 flex items-center gap-3 shadow-lg ${
              item.variant === "destructive"
                ? "border-red-500/30 bg-red-950/90 text-red-100"
                : "border-slate-700/50 bg-slate-950/90 text-slate-100"
            }`}
          >
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">{item.title}</p>
              {item.description && (
                <p className="text-xs text-slate-400 mt-0.5">{item.description}</p>
              )}
            </div>
            <button
              onClick={() => {
                setToasts((prev) => prev.filter((t) => t.id !== item.id));
              }}
              className="bg-transparent p-1 inline-flex items-center justify-center rounded-sm hover:bg-slate-800/50"
            >
              <svg
                className="h-4 w-4 text-slate-400"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1={18} y1={6} x2={6} y2={18} />
                <line x1={6} y1={18} x2={18} y2={6} />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}