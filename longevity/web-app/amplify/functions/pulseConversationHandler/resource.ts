import { defineFunction } from "@aws-amplify/backend";

export const pulseConversationHandlerFn = defineFunction({
  name: "pulseConversationHandler",
  entry: "../conversationHandler/handler.ts",
  timeoutSeconds: 30,
  memoryMB: 512,
  environment: {
    EXPERT_ID: "pulse",
  },
});
