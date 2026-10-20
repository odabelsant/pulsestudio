import { NextResponse } from "next/server";
import { getBrainCatalog } from "@/lib/brain";
import { localApiAuthorizationError } from "@/lib/local-api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authorizationError = localApiAuthorizationError(request);
  if (authorizationError) return authorizationError;
  return NextResponse.json(await getBrainCatalog());
}
