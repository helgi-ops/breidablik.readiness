import { Suspense } from "react";
import { notFound } from "next/navigation";
import DevPlayerClient from "./DevPlayerClient";

export const dynamic = "force-dynamic";

export default function Page() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return (
    <Suspense fallback={null}>
      <DevPlayerClient />
    </Suspense>
  );
}
