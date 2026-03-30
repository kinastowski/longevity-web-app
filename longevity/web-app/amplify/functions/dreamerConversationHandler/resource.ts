import { defineFunction } from "@aws-amplify/backend";

export const dreamerConversationHandlerFn = defineFunction({
  name: "dreamerConversationHandler",
  entry: "../conversationHandler/handler.ts",
  timeoutSeconds: 30,
  memoryMB: 512,
  environment: {
    EXPERT_ID: "dreamer",
  },
});
