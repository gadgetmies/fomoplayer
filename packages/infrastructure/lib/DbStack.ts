import { App, Stack } from 'aws-cdk-lib'
import { Vpc } from 'aws-cdk-lib/aws-ec2'
import { StringParameter } from 'aws-cdk-lib/aws-ssm'
import * as rds from 'aws-cdk-lib/aws-rds'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import { DatabaseInstance } from 'aws-cdk-lib/aws-rds'
import { SharedStack, SharedStackProps } from './SharedStack'
import { Secret } from 'aws-cdk-lib/aws-secretsmanager'

interface DbStackProps extends SharedStackProps {
  credentialsArn: string
}

export class DbStack extends SharedStack {
  public static readonly databaseName: string = 'fomoplayer'
  public readonly database: DatabaseInstance
  constructor(scope: App, id: string, props: DbStackProps) {
    super(scope, id, props)

    const credentialsArn = StringParameter.fromStringParameterName(
      this,
      `FomoPlayer-DbStack-credentials-arn-${props.stage}`,
      props.credentialsArn
    )

    const credentials = Secret.fromSecretCompleteArn(
      this,
      `FomoPlayer-DbStack-credentials-${props.stage}`,
      credentialsArn.stringValue
    )

    // finally, lets configure and create our database!
    const rdsConfig: rds.DatabaseInstanceProps = {
      databaseName: DbStack.databaseName,
      // port: DbStack.databasePort,
      engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_14_4 }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE3, ec2.InstanceSize.MICRO),
      vpc: props.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS
      },
      instanceIdentifier: `FomoPlayer-DB-${props.stage}`,
      maxAllocatedStorage: 200,
      securityGroups: [props.securityGroup!],
      credentials: rds.Credentials.fromSecret(credentials) // Get both username and password from existing secret
    }

    // create the instance
    this.database = new rds.DatabaseInstance(this, `fomoplayer-db-instance-${props.stage}`, rdsConfig)
  }
}
