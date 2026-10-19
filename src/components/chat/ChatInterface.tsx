"use client";

import { useMemo, useRef, useState } from "react";
import type { ChangeEvent, KeyboardEvent as ReactKeyboardEvent, KeyboardEventHandler } from "react";
import { Bot, ClipboardCheck, LoaderCircle, Sparkles } from "lucide-react";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type ChatInterfaceProps = {
  messages: ChatMessage[];
  responseText: string;
  isStreaming: boolean;
  thinkingMessage: string;
  onSendDiffToApprovals: (diff: string) => void;
};

export interface MentionSource {
  id: string;
  moduleName: string;
  projectName: string;
}

interface ContextMentionInputProps {
  value: string;
  sources: MentionSource[];
  onChange: (value: string) => void;
  onMentionIdsChange: (ids: string[]) => void;
  onKeyDown?: KeyboardEventHandler<HTMLInputElement | HTMLTextAreaElement>;
  multiline?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  ariaLabel: string;
}

function mentionBase(source: MentionSource) {
  const name = source.moduleName.split("/").pop() || source.moduleName;
  return name.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || source.id.slice(0, 8);
}

function mentionToken(source: MentionSource, sources: MentionSource[]) {
  const base = mentionBase(source);
  const duplicates = sources.filter((candidate) => mentionBase(candidate) === base);
  return `@${base}${duplicates.length > 1 ? `-${source.id.slice(0, 6)}` : ""}`;
}

export function ContextMentionInput({
  value,
  sources,
  onChange,
  onMentionIdsChange,
  onKeyDown,
  multiline = true,
  disabled = false,
  placeholder,
  className,
  ariaLabel,
}: ContextMentionInputProps) {
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [activeOption, setActiveOption] = useState(0);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const mentionStart = useRef<number | null>(null);
  const filteredSources = useMemo(() => {
    if (mentionQuery === null) return [];
    const query = mentionQuery.toLowerCase();
    return sources
      .filter((source) =>
        source.moduleName.toLowerCase().includes(query) ||
        source.projectName.toLowerCase().includes(query) ||
        mentionToken(source, sources).toLowerCase().slice(1).includes(query),
      )
      .slice(0, 8);
  }, [mentionQuery, sources]);

  function handleChange(nextValue: string, cursor: number) {
    onChange(nextValue);
    const tokenBeforeCursor = nextValue.slice(0, cursor).match(/@([a-zA-Z0-9._/-]*)$/);
    if (tokenBeforeCursor) {
      mentionStart.current = cursor - tokenBeforeCursor[0].length;
      setMentionQuery(tokenBeforeCursor[1]);
      setActiveOption(0);
    } else {
      mentionStart.current = null;
      setMentionQuery(null);
    }
    onMentionIdsChange(
      sources
        .filter((source) => nextValue.includes(mentionToken(source, sources)))
        .map((source) => source.id),
    );
  }

  function selectSource(source: MentionSource) {
    const input = inputRef.current;
    const start = mentionStart.current ?? input?.selectionStart ?? value.length;
    const end = input?.selectionEnd ?? start;
    const inserted = `${mentionToken(source, sources)} `;
    const nextValue = `${value.slice(0, start)}${inserted}${value.slice(end)}`;
    handleChange(nextValue, start + inserted.length);
    setMentionQuery(null);
    mentionStart.current = null;
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(start + inserted.length, start + inserted.length);
    });
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    if (mentionQuery !== null && filteredSources.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveOption((current) => (current + 1) % filteredSources.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveOption((current) => (current - 1 + filteredSources.length) % filteredSources.length);
        return;
      }
      if (event.key === "Escape") {
        setMentionQuery(null);
        return;
      }
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        selectSource(filteredSources[activeOption] ?? filteredSources[0]);
        return;
      }
    }
    onKeyDown?.(event);
  }

  const inputProps = {
    value,
    disabled,
    autoComplete: "off" as const,
    "aria-label": ariaLabel,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      handleChange(event.currentTarget.value, event.currentTarget.selectionStart ?? event.currentTarget.value.length),
    onKeyDown: handleKeyDown,
    placeholder,
    className,
  };

  return (
    <div className="relative min-w-0 flex-1">
      {mentionQuery !== null && filteredSources.length > 0 && (
        <div
          role="listbox"
          aria-label="Fuentes disponibles"
          className="absolute bottom-[calc(100%+8px)] left-0 z-40 max-h-64 w-full min-w-64 overflow-y-auto rounded-xl border border-white/[0.12] bg-[#202020] p-1.5 shadow-2xl"
        >
          <p className="px-2.5 py-1.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500">Fuentes del cuaderno</p>
          {filteredSources.map((source, index) => (
            <button
              key={source.id}
              type="button"
              role="option"
              aria-selected={index === activeOption}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectSource(source)}
              className={`flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left ${
                index === activeOption ? "bg-white/[0.1]" : "hover:bg-white/[0.06]"
              }`}
            >
              <span className="min-w-0 truncate text-xs text-zinc-200">{source.moduleName}</span>
              <span className="shrink-0 font-mono text-[10px] text-emerald-300">{mentionToken(source, sources)}</span>
            </button>
          ))}
        </div>
      )}
      {multiline
        ? <textarea {...inputProps} ref={(element) => { inputRef.current = element; }} rows={2} />
        : <input {...inputProps} ref={(element) => { inputRef.current = element; }} />}
    </div>
  );
}

export default function ChatInterface({
  messages,
  responseText,
  isStreaming,
  thinkingMessage,
  onSendDiffToApprovals,
}: ChatInterfaceProps) {
  if (messages.length === 0 && !responseText) {
    return (
      <div className="my-auto max-w-2xl">
        <div className="mb-5 grid h-11 w-11 place-items-center rounded-xl bg-white text-black">
          <Sparkles className="h-5 w-5" />
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">¿En qué trabajamos?</h1>
        <p className="mt-3 text-base leading-7 text-zinc-500">
          Pulsa <strong className="font-medium text-zinc-300">+</strong> para añadir contexto, skills, ejecuciones,
          variables o flujos de aprobación sin salir de esta conversación.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-7 pb-8">
      {messages.filter((message) => message.role !== "assistant" || message.content.trim().length > 0).map((message) => (
        <article
          key={message.id}
          className={
            message.role === "user"
              ? "ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-zinc-800 px-4 py-3 text-sm leading-6 text-zinc-100"
              : "max-w-3xl whitespace-pre-wrap text-sm leading-7 text-zinc-300"
          }
        >
          {message.role === "assistant" && (
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-zinc-500">
              <Bot className="h-3.5 w-3.5" /> PulseStudio
            </div>
          )}
          {message.content}
          {message.role === "assistant" && message.content.includes("diff --git") && (
            <button
              onClick={() => onSendDiffToApprovals(message.content.slice(message.content.indexOf("diff --git")))}
              className="mt-4 flex items-center gap-2 rounded-lg border border-white/[0.12] px-3 py-2 text-xs font-medium text-zinc-200 transition hover:bg-white/[0.08]"
            >
              <ClipboardCheck className="h-3.5 w-3.5" /> Enviar diff a aprobaciones
            </button>
          )}
        </article>
      ))}
      {isStreaming && (
        <div
          className="flex max-w-3xl items-center gap-2.5 text-sm text-zinc-500"
          role="status"
          aria-live="polite"
        >
          <LoaderCircle className="h-4 w-4 animate-spin text-zinc-300" />
          <span>{thinkingMessage}</span>
          <span className="flex gap-1" aria-hidden="true">
            <span className="h-1 w-1 animate-bounce rounded-full bg-zinc-400 [animation-delay:-0.2s]" />
            <span className="h-1 w-1 animate-bounce rounded-full bg-zinc-400 [animation-delay:-0.1s]" />
            <span className="h-1 w-1 animate-bounce rounded-full bg-zinc-400" />
          </span>
        </div>
      )}
      {responseText && (
        <article className="max-w-3xl whitespace-pre-wrap text-sm leading-7 text-zinc-300">
          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-zinc-500">
            <Bot className="h-3.5 w-3.5" /> PulseStudio
            {isStreaming && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-400" />}
          </div>
          {responseText}
        </article>
      )}
    </div>
  );
}
