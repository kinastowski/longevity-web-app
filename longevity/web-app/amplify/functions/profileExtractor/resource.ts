import { defineFunction } from "@aws-amplify/backend";

export const profileExtractorFn = defineFunction({
  name: "profileExtractor",
  entry: "./handler.ts",
  timeoutSeconds: 60,
  memoryMB: 256,
});
