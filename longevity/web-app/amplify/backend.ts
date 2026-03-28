import { defineBackend } from "@aws-amplify/backend";
import { auth } from "./auth/resource";
import { data } from "./data/resource";
import { auroraWarmup } from "./functions/auroraWarmup/resource";
import { Effect, PolicyStatement } from "aws-cdk-lib/aws-iam";
import { Function as LambdaFunction } from "aws-cdk-lib/aws-lambda";
import { Rule, Schedule } from "aws-cdk-lib/aws-events";
import { LambdaFunction as LambdaTarget } from "aws-cdk-lib/aws-events-targets";
import { createAuroraCluster } from "./aurora/resource";

const backend = defineBackend({
  auth,
  data,
  auroraWarmup,
});

// Aurora Serverless v2 — provisioned via CDK, no manual console steps
const auroraStack = backend.createStack("aurora");
const { cluster } = createAuroraCluster(auroraStack);
if (!cluster.secret) throw new Error("Aurora cluster has no managed secret");

const bedrockPolicy = new PolicyStatement({
  effect: Effect.ALLOW,
  actions: ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
  resources: [
    "arn:aws:bedrock:eu-west-1:*:inference-profile/eu.anthropic.claude-3-5-sonnet-20240620-v1:0",
    "arn:aws:bedrock:*::foundation-model/anthropic.claude-3-5-sonnet-20240620-v1:0",
  ],
});

const marketplacePolicy = new PolicyStatement({
  effect: Effect.ALLOW,
  actions: [
    "aws-marketplace:ViewSubscriptions",
    "aws-marketplace:Subscribe",
    "aws-marketplace:Unsubscribe",
    "aws-marketplace:ListSubscriptions",
    "aws-marketplace:ListSubscriptionsForResource",
  ],
  resources: ["*"],
});

// Aurora warmup — schedule every hour to prevent cold starts
const warmupStack = backend.createStack("auroraWarmupSchedule");
new Rule(warmupStack, "WarmupRule", {
  schedule: Schedule.expression("rate(1 hour)"),
  targets: [new LambdaTarget(backend.auroraWarmup.resources.lambda)],
});

// Inject real CDK-token ARNs — no TODO placeholders
const warmupLambda = backend.auroraWarmup.resources.lambda as LambdaFunction;
warmupLambda.addEnvironment("AURORA_CLUSTER_ARN", cluster.clusterArn);
warmupLambda.addEnvironment("AURORA_SECRET_ARN", cluster.secret.secretArn);

// Tighten IAM: specific cluster ARN instead of wildcard
backend.auroraWarmup.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ["rds-data:ExecuteStatement"],
    resources: [cluster.clusterArn],
  })
);

cluster.secret.grantRead(backend.auroraWarmup.resources.lambda);

// ConversationHandlerFunction (from @aws-amplify/ai-constructs) does NOT call
// setResourceName(), so the Lambda and its role are invisible to
// backend.data.resources.roles / .functions / .cfnResources.cfnRoles.
// The only reliable path is to walk the full construct tree and match on path.
backend.data.resources.graphqlApi.node.findAll().forEach((construct) => {
  if (
    construct instanceof LambdaFunction &&
    construct.node.path.toLowerCase().includes("conversation")
  ) {
    construct.addToRolePolicy(bedrockPolicy);
    construct.addToRolePolicy(marketplacePolicy);
  }
});
