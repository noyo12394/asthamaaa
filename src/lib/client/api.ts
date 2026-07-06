"use client";

/** Thin client for the PASS backend API. All UI data flows through here. */

export interface ApiEnvelope<T> {
  ok: boolean;
  persistence?: "postgres" | "memory";
  generatedAt?: string;
  data?: T;
  error?: string;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = (await res.json()) as ApiEnvelope<T>;
  if (!res.ok || !body.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body.data as T;
}

export async function apiWithMeta<T>(
  path: string,
  init?: RequestInit
): Promise<{ data: T; persistence: "postgres" | "memory" }> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = (await res.json()) as ApiEnvelope<T>;
  if (!res.ok || !body.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return { data: body.data as T, persistence: body.persistence ?? "memory" };
}
