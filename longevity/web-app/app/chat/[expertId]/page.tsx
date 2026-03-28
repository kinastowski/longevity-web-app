import { notFound } from "next/navigation";
import { expertMap } from "@/lib/experts";
import { ExpertChatClient } from "./ExpertChatClient";

export default async function ChatPage({
  params,
}: {
  params: Promise<{ expertId: string }>;
}) {
  const { expertId } = await params;
  const expert = expertMap[expertId];

  if (!expert) {
    notFound();
  }

  return <ExpertChatClient expert={expert} />;
}
