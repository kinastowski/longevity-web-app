import { defineFunction } from "@aws-amplify/backend";

export const synapseConversationHandlerFn = defineFunction({
  name: "synapseConversationHandler",
  entry: "../conversationHandler/handler.ts",
  timeoutSeconds: 30,
  memoryMB: 512,
  environment: {
    EXPERT_ID: "synapse",
  },
});
