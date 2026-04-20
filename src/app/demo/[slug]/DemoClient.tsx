"use client";

export default function DemoClient({ slug }: { slug: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-slate-800">MicroPulse Demo</h1>
        <p className="mt-2 text-slate-500">Demo for {slug} — coming soon</p>
      </div>
    </div>
  );
}
