import Link from "next/link";

export default function MissingCheckinBanner() {
  return (
    <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg">📋</span>
            <span className="text-sm font-bold text-amber-900">Dagleg skráning vantar</span>
          </div>
          <p className="mt-1 text-xs text-amber-800">
            Skráðu líðan þína til að kerfið geti stillt æfinguna fyrir þig í dag.
          </p>
        </div>
        <Link
          href="/player/checkin"
          className="shrink-0 inline-flex items-center rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-amber-600 transition-colors"
        >
          Skrá núna →
        </Link>
      </div>
    </div>
  );
}
