import { defineConversationHandlerFunction } from "@aws-amplify/backend-ai/conversation";

// EXPERT_ID env var is injected in amplify/backend.ts (Task 10)
// defineConversationHandlerFunction does not support environment prop directly
export const synapseConversationHandlerFn = defineConversationHandlerFunction({
  name: "synapseConversationHandler",
  entry: "../conversationHandler/handler.ts",
  // Grants IAM invoke permission for this Bedrock model — must match aiModel.resourcePath in data/resource.ts
  models: [
    {
      modelId: "eu.anthropic.claude-3-5-sonnet-20240620-v1:0",
      region: "eu-central-1",
    },
  ],
  timeoutSeconds: 60,
  memoryMB: 512,
});
