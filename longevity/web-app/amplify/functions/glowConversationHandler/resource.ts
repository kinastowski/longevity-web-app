import { defineFunction } from "@aws-amplify/backend";

export const glowConversationHandlerFn = defineFunction({
  name: "glowConversationHandler",
  entry: "../conversationHandler/handler.ts",
  timeoutSeconds: 30,
  memoryMB: 512,
  environment: {
    EXPERT_ID: "glow",
  },
});
