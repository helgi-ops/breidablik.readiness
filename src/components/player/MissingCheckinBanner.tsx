import Link from "next/link";
import { PLAYER_COPY } from "@/app/player/playerCopy";
import type { Lang } from "@/lib/lang";

type Props = { lang?: Lang };

export default function MissingCheckinBanner({ lang = "IS" }: Props) {
  const ct = PLAYER_COPY[lang].checkin;
  return (
    <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg">📋</span>
            <span className="text-sm font-bold text-amber-900">{ct.missingTitle}</span>
          </div>
          <p className="mt-1 text-xs text-amber-800">{ct.missingBody}</p>
        </div>
        <Link
          href="/player/checkin"
          className="shrink-0 inline-flex items-center rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-amber-600 transition-colors"
        >
          {ct.missingBtn}
        </Link>
      </div>
    </div>
  );
}
