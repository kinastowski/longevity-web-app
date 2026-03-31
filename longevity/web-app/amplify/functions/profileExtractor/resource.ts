import { defineFunction } from "@aws-amplify/backend";

export const profileExtractorFn = defineFunction({
  name: "profileExtractor",
  entry: "./handler.ts",
  timeoutSeconds: 60,
  memoryMB: 256,
  // Move into data stack so backend.ts can inject table names without circular deps.
  resourceGroupName: 'data',
});
