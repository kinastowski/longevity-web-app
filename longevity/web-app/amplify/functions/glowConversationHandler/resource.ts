import { defineConversationHandlerFunction } from "@aws-amplify/backend-ai/conversation";

// EXPERT_ID env var is injected in amplify/backend.ts (Task 10)
// defineConversationHandlerFunction does not support environment prop directly
export const glowConversationHandlerFn = defineConversationHandlerFunction({
  name: "glowConversationHandler",
  entry: "../conversationHandler/handler.ts",
  models: [
    {
      modelId: "eu.anthropic.claude-3-5-sonnet-20240620-v1:0",
      region: "eu-central-1",
    },
  ],
  timeoutSeconds: 30,
  memoryMB: 512,
});
