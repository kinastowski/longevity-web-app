import { defineFunction } from "@aws-amplify/backend";

export const cipherConversationHandlerFn = defineFunction({
  name: "cipherConversationHandler",
  entry: "../conversationHandler/handler.ts",
  timeoutSeconds: 30,
  memoryMB: 512,
  environment: {
    EXPERT_ID: "cipher",
  },
});
