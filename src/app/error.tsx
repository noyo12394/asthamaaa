"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-paper p-6">
      <div className="panel max-w-md rounded-md p-6 text-center">
        <AlertTriangle size={28} className="mx-auto text-warning" />
        <h1 className="mt-3 text-lg font-semibold">This view could not be loaded</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-2">
          Your filters and saved data were not changed. Try loading the view again; if the source is unavailable, the app will keep its status visible.
        </p>
        <button type="button" onClick={reset} className="mt-5 inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white">
          <RefreshCw size={15} /> Try again
        </button>
      </div>
    </main>
  );
}
