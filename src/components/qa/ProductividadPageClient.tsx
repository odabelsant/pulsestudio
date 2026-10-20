"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import UnifiedProductivityView from "@/components/qa/UnifiedProductivityView";
import { QA_ENTITIES, type QaEntity } from "@/lib/qa-domain";

function parseEntity(value: string | null): QaEntity | undefined {
  if (!value) return undefined;
  return QA_ENTITIES.includes(value as QaEntity) ? (value as QaEntity) : undefined;
}

export default function ProductividadPageClient() {
  const searchParams = useSearchParams();
  const initialEntity = useMemo(
    () => parseEntity(searchParams.get("entity")),
    [searchParams],
  );

  return <UnifiedProductivityView initialEntity={initialEntity} />;
}
