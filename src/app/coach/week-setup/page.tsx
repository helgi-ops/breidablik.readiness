export const dynamic = "force-dynamic";

import WeekSetupView from "@/components/coach/WeekSetupView";

// The Week Setup UI lives in a component so the Periodization Hub's Micro tab can mount the same
// view embedded (with the Macro/Meso context passed in) — page files may not take custom props.
export default function WeekSetupPage() {
  return <WeekSetupView />;
}
