"use client";

import { useRouter } from "next/navigation";
import { generateClient } from "aws-amplify/api";
import { createAIHooks } from "@aws-amplify/ui-react-ai";
import { AIConversation } from "@aws-amplify/ui-react-ai";
import type { Schema } from "@/amplify/data/resource";
import type { ComponentType } from "react";
import type { Expert } from "@/lib/experts";
import { Button } from "@/components/ui/button";

const client = generateClient<Schema>({ authMode: "userPool" });
const { useAIConversation } = createAIHooks(client);

// One component per expert — React hooks cannot be called conditionally.
// Each component calls its own useAIConversation hook unconditionally.

function VitaChatUI({ welcome }: { welcome: string }) {
  const [{ data, isLoading }, handleSendMessage] = useAIConversation("vitaChat");
  return (
    <AIConversation
      messages={data.messages}
      isLoading={isLoading}
      handleSendMessage={handleSendMessage}
      welcomeMessage={welcome}
    />
  );
}

function SynapseChatUI({ welcome }: { welcome: string }) {
  const [{ data, isLoading }, handleSendMessage] = useAIConversation("synapseChat");
  return (
    <AIConversation
      messages={data.messages}
      isLoading={isLoading}
      handleSendMessage={handleSendMessage}
      welcomeMessage={welcome}
    />
  );
}

function GlowChatUI({ welcome }: { welcome: string }) {
  const [{ data, isLoading }, handleSendMessage] = useAIConversation("glowChat");
  return (
    <AIConversation
      messages={data.messages}
      isLoading={isLoading}
      handleSendMessage={handleSendMessage}
      welcomeMessage={welcome}
    />
  );
}

function DreamerChatUI({ welcome }: { welcome: string }) {
  const [{ data, isLoading }, handleSendMessage] = useAIConversation("dreamerChat");
  return (
    <AIConversation
      messages={data.messages}
      isLoading={isLoading}
      handleSendMessage={handleSendMessage}
      welcomeMessage={welcome}
    />
  );
}

function PulseChatUI({ welcome }: { welcome: string }) {
  const [{ data, isLoading }, handleSendMessage] = useAIConversation("pulseChat");
  return (
    <AIConversation
      messages={data.messages}
      isLoading={isLoading}
      handleSendMessage={handleSendMessage}
      welcomeMessage={welcome}
    />
  );
}

function CipherChatUI({ welcome }: { welcome: string }) {
  const [{ data, isLoading }, handleSendMessage] = useAIConversation("cipherChat");
  return (
    <AIConversation
      messages={data.messages}
      isLoading={isLoading}
      handleSendMessage={handleSendMessage}
      welcomeMessage={welcome}
    />
  );
}

// Map expert.id → component reference (not JSX element — avoids mounting all 6 hooks)
const chatMap: Record<string, ComponentType<{ welcome: string }>> = {
  vita: VitaChatUI,
  synapse: SynapseChatUI,
  glow: GlowChatUI,
  dreamer: DreamerChatUI,
  pulse: PulseChatUI,
  cipher: CipherChatUI,
};

export function ExpertChatClient({ expert }: { expert: Expert }) {
  const router = useRouter();
  const ChatComponent = chatMap[expert.id];

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center gap-4 px-6 py-4 bg-zinc-900 border-b border-zinc-800">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/")}
          className="text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 -ml-2"
        >
          ← Back
        </Button>
        <div className="flex items-center gap-3">
          <span className="text-2xl leading-none">{expert.emoji}</span>
          <div>
            <h1 className="font-semibold text-zinc-100 leading-tight">
              {expert.name}
            </h1>
            <p className="text-xs text-zinc-500 uppercase tracking-wider">
              {expert.subtitle}
            </p>
          </div>
        </div>
      </header>

      {/* Chat area */}
      <main className="flex-1 overflow-hidden p-4">
        <ChatComponent welcome={expert.welcome} />
      </main>
    </div>
  );
}
