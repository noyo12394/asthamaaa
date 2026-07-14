import Link from "next/link";
import { MapPinOff } from "lucide-react";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-paper p-6">
      <div className="max-w-md text-center">
        <MapPinOff size={30} className="mx-auto text-ink-3" />
        <h1 className="mt-3 text-xl font-semibold">View not found</h1>
        <p className="mt-2 text-sm text-ink-2">The requested atlas page does not exist or has moved.</p>
        <Link href="/" className="mt-5 inline-flex rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white">Open the air map</Link>
      </div>
    </main>
  );
}
