import { defineFunction } from "@aws-amplify/backend";

export const auroraWarmup = defineFunction({
  name: "auroraWarmup",
  entry: "./handler.ts",
  environment: {
    // TODO: replace with actual Aurora cluster ARN
    AURORA_CLUSTER_ARN: "arn:aws:rds:eu-central-1:TODO_ACCOUNT_ID:cluster:TODO_CLUSTER_NAME",
    // TODO: replace with actual Secrets Manager secret ARN
    AURORA_SECRET_ARN: "arn:aws:secretsmanager:eu-central-1:TODO_ACCOUNT_ID:secret:TODO_SECRET_NAME",
  },
});
