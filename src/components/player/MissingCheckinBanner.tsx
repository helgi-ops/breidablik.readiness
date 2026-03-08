import Link from "next/link";

export default function MissingCheckinBanner() {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      <div className="font-semibold">Today&apos;s readiness check-in is still incomplete.</div>
      <div className="mt-2">
        <Link
          href="/player/checkin"
          className="inline-flex items-center rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900"
        >
          Complete check-in
        </Link>
      </div>
    </div>
  );
}
