import * as cdk from 'aws-cdk-lib'
import * as rds from 'aws-cdk-lib/aws-rds'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import { SecurityGroup, ISecurityGroup } from 'aws-cdk-lib/aws-ec2'
import * as ssm from 'aws-cdk-lib/aws-ssm'
import * as secretsManager from 'aws-cdk-lib/aws-secretsmanager'

export interface DbStackProps extends cdk.StackProps {
  stage: string
}

export class DbStack extends cdk.Stack {
  // static readonly databasePort = 5432;
  static readonly databaseName = `fomoplayer`;

  public readonly vpc: ec2.Vpc
  public readonly rdsInstance: rds.DatabaseInstance
  public readonly defaultSecurityGroup: ISecurityGroup
  public readonly databaseCredentialsSecret: secretsManager.Secret

  constructor(scope: cdk.App, id: string, props?: DbStackProps) {
    super(scope, id, props)

    // create a VPC with no private subnets.
    // this is for our demo purpose as this will be cheaper since you do not need a nat gateway
    this.vpc = new ec2.Vpc(this, `VPC-${props?.stage}`, {
      natGateways: 0,
      maxAzs: 2
    })

    // first, lets generate a secret to be used as credentials for our database
    this.databaseCredentialsSecret = new secretsManager.Secret(this, `FomoPlayer-${props?.stage}-DBCredentialsSecret`, {
      secretName: `fomoplayer-credentials-${props?.stage}`,
      generateSecretString: {
        secretStringTemplate: JSON.stringify({
          username: 'postgres'
        }),
        excludePunctuation: true,
        includeSpace: false,
        generateStringKey: 'password'
      }
    })

    // next, create a new string parameter to be use
    new ssm.StringParameter(this, 'DBCredentialsArn', {
      parameterName: `fomoplayer-${props?.stage}-credentials-arn`,
      stringValue: this.databaseCredentialsSecret.secretArn
    })

    // get the default security group
    this.defaultSecurityGroup = SecurityGroup.fromSecurityGroupId(this, 'FomoPlayer-DB-SG', this.vpc.vpcDefaultSecurityGroup)

    // finally, lets configure and create our database!
    const rdsConfig: rds.DatabaseInstanceProps = {
      databaseName: DbStack.databaseName,
      // port: DbStack.databasePort,
      engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_14_4 }),
      // optional, defaults to m5.large
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE3, ec2.InstanceSize.MICRO),
      vpc: this.vpc,
      // make the db publically accessible
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
      instanceIdentifier: `FomoPlayer-DB-${props?.stage}`,
      maxAllocatedStorage: 200,
      securityGroups: [this.defaultSecurityGroup],
      credentials: rds.Credentials.fromSecret(this.databaseCredentialsSecret), // Get both username and password from existing secret
    }

    // create the instance
    this.rdsInstance = new rds.DatabaseInstance(this, `fomoplayer-db-instance-${props?.stage}`, rdsConfig);
  }
}
