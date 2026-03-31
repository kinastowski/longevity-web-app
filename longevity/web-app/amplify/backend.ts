import { defineBackend } from "@aws-amplify/backend";
import { auth } from "./auth/resource";
import { data } from "./data/resource";
import { auroraWarmup } from "./functions/auroraWarmup/resource";
import { profileExtractorFn } from "./functions/profileExtractor/resource";
import { Stack } from "aws-cdk-lib";
import { Effect, PolicyStatement } from "aws-cdk-lib/aws-iam";
import { StringParameter } from "aws-cdk-lib/aws-ssm";
import { Function as LambdaFunction } from "aws-cdk-lib/aws-lambda";
import { Rule, Schedule } from "aws-cdk-lib/aws-events";
import { LambdaFunction as LambdaTarget } from "aws-cdk-lib/aws-events-targets";
import { createAuroraCluster } from "./aurora/resource";

const backend = defineBackend({
  auth,
  data,
  auroraWarmup,
  profileExtractorFn,
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
// Cast needed: resources.lambda is typed as IFunction (interface), which lacks addEnvironment.
// Amplify defineFunction always returns a concrete Function, so the cast is safe.
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

const KB_ID = "NMQX9C6VSI";

// Bedrock Knowledge Base — HTTP data source for AppSync searchKnowledgeBase query.
// The KB ID is injected at runtime via the pipeline resolver stash (kbIdResolver.js).
// Region eu-west-1: where Bedrock and the KB are deployed.
const kbDataSource = backend.data.addHttpDataSource(
  "BedrockKnowledgeBaseDataSource",
  "https://bedrock-agent-runtime.eu-west-1.amazonaws.com",
  {
    authorizationConfig: {
      signingRegion: "eu-west-1",
      signingServiceName: "bedrock",
    },
  }
);

kbDataSource.grantPrincipal.addToPrincipalPolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ["bedrock:Retrieve"],
    resources: [
      `arn:aws:bedrock:eu-west-1:*:knowledge-base/${KB_ID}`,
    ],
  })
);

// Memory layer: Bedrock KB retrieve policy
const extractorArn = backend.profileExtractorFn.resources.lambda.functionArn;

const bedrockRetrievePolicy = new PolicyStatement({
  effect: Effect.ALLOW,
  actions: ["bedrock:Retrieve"],
  resources: [`arn:aws:bedrock:eu-west-1:*:knowledge-base/${KB_ID}`],
});

// Per-expert EXPERT_ID map — handler Lambda construct paths contain the function name.
// ConversationHandlerFunction Lambdas live in their OWN top-level CDK stack
// (conversationHandlerFunction...), NOT in the data stack. Must walk the entire
// CDK app tree (node.root) to find them — walking only Stack.of(graphqlApi) misses them.
const EXPERT_ID_BY_PATH: Record<string, string> = {
  vitaconversationhandler: "vita",
  synapseconversationhandler: "synapse",
  glowconversationhandler: "glow",
  dreamerconversationhandler: "dreamer",
  pulseconversationhandler: "pulse",
  cipherconversationhandler: "cipher",
};

// DynamoDB table access — allow.resource() is not supported at model level in this Amplify version;
// grant table access explicitly via CDK instead.
const userProfileTable = backend.data.resources.tables["UserProfile"];
const conversationMemoryTable = backend.data.resources.tables["ConversationMemory"];

// SSM config stack — writes resolved table names and extractor ARN to Parameter Store.
// Conversation handler Lambdas live in a SEPARATE CFN stack from the data tables.
// Injecting CDK tokens directly (addEnvironment / grantReadData) would create circular
// CloudFormation dependency (data ↔ conversationHandlerFunction).
// Solution: write values to SSM here (configStack → data, one-way dep), and have the
// Lambda read them at cold start via SDK call (no CFN cross-stack reference).
const configStack = backend.createStack("config");
new StringParameter(configStack, "UserProfileTableNameParam", {
  parameterName: "/go-life/userprofile-table-name",
  stringValue: userProfileTable.tableName,
});
new StringParameter(configStack, "ProfileExtractorArnParam", {
  parameterName: "/go-life/profile-extractor-arn",
  stringValue: extractorArn,
});

// IAM policies using ARN PATTERNS + ${AWS::AccountId} pseudo-param.
// Pseudo-params are resolved locally per stack — no cross-stack CFN references created.
const acct = Stack.of(backend.data.resources.graphqlApi).account;

const conversationHandlerDynamoPolicy = new PolicyStatement({
  effect: Effect.ALLOW,
  actions: ["dynamodb:GetItem", "dynamodb:Query"],
  resources: [
    `arn:aws:dynamodb:eu-west-1:${acct}:table/UserProfile-*`,
    `arn:aws:dynamodb:eu-west-1:${acct}:table/UserProfile-*/index/*`,
  ],
});

const conversationHandlerLambdaInvokePolicy = new PolicyStatement({
  effect: Effect.ALLOW,
  actions: ["lambda:InvokeFunction"],
  resources: [`arn:aws:lambda:eu-west-1:${acct}:function:*profileExtractor*`],
});

const ssmReadPolicy = new PolicyStatement({
  effect: Effect.ALLOW,
  actions: ["ssm:GetParameters"],
  resources: [`arn:aws:ssm:eu-west-1:${acct}:parameter/go-life/*`],
});

// Walk the entire CDK app to find conversation handler Lambdas in their own stack.
// Only add policies/env vars that carry NO CDK token cross-stack references.
// Table name and extractor ARN are read from SSM at Lambda cold start (handler.ts).
Stack.of(backend.data.resources.graphqlApi).node.root.node.findAll().forEach((construct) => {
  if (!(construct instanceof LambdaFunction)) return;
  const pathLower = construct.node.path.toLowerCase();
  const expertId = Object.entries(EXPERT_ID_BY_PATH).find(([key]) => pathLower.includes(key))?.[1];
  if (!expertId) return;

  construct.addToRolePolicy(bedrockPolicy);
  construct.addToRolePolicy(marketplacePolicy);
  construct.addToRolePolicy(bedrockRetrievePolicy);
  construct.addToRolePolicy(conversationHandlerDynamoPolicy);
  construct.addToRolePolicy(conversationHandlerLambdaInvokePolicy);
  construct.addToRolePolicy(ssmReadPolicy);
  construct.addEnvironment("EXPERT_ID", expertId);
  construct.addEnvironment("BEDROCK_KB_ID", KB_ID);
});

// profileExtractor — Bedrock InvokeModel + full DynamoDB access to UserProfile and ConversationMemory
userProfileTable.grantReadWriteData(backend.profileExtractorFn.resources.lambda);
conversationMemoryTable.grantWriteData(backend.profileExtractorFn.resources.lambda);

// grantReadWriteData only covers the table ARN, not GSI ARNs — add index access explicitly
backend.profileExtractorFn.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ["dynamodb:Query"],
    resources: [`${userProfileTable.tableArn}/index/*`],
  })
);

// Inject table names for direct DynamoDB SDK access (generateClient requires full Amplify outputs, not available in Lambdas)
(backend.profileExtractorFn.resources.lambda as LambdaFunction).addEnvironment(
  "USERPROFILE_TABLE_NAME", userProfileTable.tableName
);
(backend.profileExtractorFn.resources.lambda as LambdaFunction).addEnvironment(
  "CONVERSATIONMEMORY_TABLE_NAME", conversationMemoryTable.tableName
);

backend.profileExtractorFn.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ["bedrock:InvokeModel"],
    resources: [
      "arn:aws:bedrock:eu-west-1:*:inference-profile/eu.anthropic.claude-3-5-sonnet-20240620-v1:0",
      "arn:aws:bedrock:*::foundation-model/anthropic.claude-3-5-sonnet-20240620-v1:0",
    ],
  })
);
