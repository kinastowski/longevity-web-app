import { defineFunction } from "@aws-amplify/backend";

export const auroraWarmup = defineFunction({
  name: "auroraWarmup",
  entry: "./handler.ts",
  // AURORA_CLUSTER_ARN and AURORA_SECRET_ARN are injected in backend.ts
  // via addEnvironment() after the Aurora cluster CDK construct is created.
  environment: {},
});
