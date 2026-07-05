import ReturnToTrainingPage from "@/components/coach/ReturnToTrainingPage";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ playerId: string }> }) {
  const { playerId } = await params;
  return <ReturnToTrainingPage playerId={playerId} />;
}
