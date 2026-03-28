import { RemovalPolicy, Stack } from "aws-cdk-lib";
import {
  ClusterInstance,
  DatabaseCluster,
  DatabaseClusterEngine,
  AuroraPostgresEngineVersion,
} from "aws-cdk-lib/aws-rds";
import { SubnetType, Vpc } from "aws-cdk-lib/aws-ec2";

export function createAuroraCluster(stack: Stack) {
  // No NAT gateways — RDS Data API is called over HTTPS from Lambda outside VPC.
  // Aurora itself doesn't need internet access.
  const vpc = new Vpc(stack, "AuroraVpc", {
    maxAzs: 2,
    natGateways: 0,
    subnetConfiguration: [
      {
        name: "isolated",
        subnetType: SubnetType.PRIVATE_ISOLATED,
      },
    ],
  });

  const cluster = new DatabaseCluster(stack, "AuroraCluster", {
    engine: DatabaseClusterEngine.auroraPostgres({
      version: AuroraPostgresEngineVersion.VER_16_6,
    }),
    serverlessV2MinCapacity: 0,   // scale-to-zero
    serverlessV2MaxCapacity: 4,
    writer: ClusterInstance.serverlessV2("writer"),
    vpc,
    vpcSubnets: { subnetType: SubnetType.PRIVATE_ISOLATED },
    enableDataApi: true,
    removalPolicy: RemovalPolicy.SNAPSHOT, // safety: snapshot on destroy, not DELETE
  });

  return { cluster, vpc };
}
