import {
  RDSDataClient,
  ExecuteStatementCommand,
} from "@aws-sdk/client-rds-data";

const client = new RDSDataClient({ region: "eu-central-1" });

export const handler = async () => {
  try {
    await client.send(
      new ExecuteStatementCommand({
        resourceArn: process.env.AURORA_CLUSTER_ARN!,
        secretArn: process.env.AURORA_SECRET_ARN!,
        database: "postgres",
        sql: "SELECT 1",
      })
    );
    console.log("Aurora warmup: OK");
  } catch (err) {
    console.error("Aurora warmup failed:", err);
  }
};
