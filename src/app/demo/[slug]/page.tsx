import { notFound } from "next/navigation";
import DemoClient from "./DemoClient";

// Only allow known demo slugs
const ALLOWED_SLUGS = ["afturelding"];

export default async function DemoPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!ALLOWED_SLUGS.includes(slug)) notFound();
  return <DemoClient slug={slug} />;
}
