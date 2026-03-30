import { defineFunction } from "@aws-amplify/backend";

export const vitaConversationHandlerFn = defineFunction({
  name: "vitaConversationHandler",
  entry: "../conversationHandler/handler.ts",
  timeoutSeconds: 30,
  memoryMB: 512,
  environment: {
    EXPERT_ID: "vita",
  },
});
