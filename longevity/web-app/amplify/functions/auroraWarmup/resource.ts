import { defineFunction } from "@aws-amplify/backend";

export const auroraWarmup = defineFunction({
  name: "auroraWarmup",
  entry: "./handler.ts",
  timeoutSeconds: 30,
  // AURORA_CLUSTER_ARN and AURORA_SECRET_ARN will be injected from backend.ts
  // via lambda.addEnvironment() once the Aurora CDK construct is wired in.
  environment: {},
});
