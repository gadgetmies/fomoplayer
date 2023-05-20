import * as cdk from 'aws-cdk-lib'
import { Duration } from 'aws-cdk-lib'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as ecs from 'aws-cdk-lib/aws-ecs'
import { Secret } from 'aws-cdk-lib/aws-ecs'
import * as ssm from 'aws-cdk-lib/aws-ssm'
import * as kms from 'aws-cdk-lib/aws-kms'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2'
import { ApplicationLoadBalancer } from 'aws-cdk-lib/aws-elasticloadbalancingv2'
import { DatabaseInstance } from 'aws-cdk-lib/aws-rds'
import { Repository } from 'aws-cdk-lib/aws-ecr'
import { SharedStack, SharedStackProps } from './SharedStack'
import { DbStack } from './DbStack'
import { Construct } from 'constructs'

export interface BackStackProps extends SharedStackProps {
  repository: Repository
  database: DatabaseInstance
}

function getSecureString(scope: Construct, parameterName: string, version: number = 0) {
  return ecs.Secret.fromSsmParameter(
    ssm.StringParameter.fromSecureStringParameterAttributes(scope, parameterName, {
      parameterName,
      version
    })
  )
}

export class BackStack extends SharedStack {
  public readonly loadBalancer: ApplicationLoadBalancer
  constructor(scope: cdk.App, id: string, props: BackStackProps) {
    super(scope, id, props)

    const cluster = new ecs.Cluster(this, `FomoPlayerCluster`, { vpc: props.vpc })

    const executionRolePolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      resources: ['*'],
      actions: [
        'ecr:GetAuthorizationToken',
        'ecr:BatchCheckLayerAvailability',
        'ecr:GetDownloadUrlForLayer',
        'ecr:BatchGetImage',
        'logs:CreateLogStream',
        'logs:PutLogEvents'
      ]
    })

    const fargateTaskDefinition = new ecs.FargateTaskDefinition(this, 'FomoPlayerBackDefinition', {
      memoryLimitMiB: 512,
      cpu: 256
    })
    fargateTaskDefinition.addToExecutionRolePolicy(executionRolePolicy)

    const containerPort = 3000

    const container = fargateTaskDefinition.addContainer('fomoplayer-back', {
      // Use an image from Amazon ECR
      image: ecs.ContainerImage.fromRegistry(props.repository.repositoryUri),
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'fomoplayer-back' }),
      environment: {
        PORT: String(containerPort),
        DATABASE_ENDPOINT: props.database.instanceEndpoint.socketAddress,
        DATABASE_NAME: DbStack.databaseName,
        DATABASE_SECRET_ARN: props.database.secret?.secretArn || '',
        NODE_ENV: props.stage
      },
      secrets: {
        DATABASE_PASSWORD: Secret.fromSecretsManager(props.database.secret!, 'password'),
        DATABASE_USERNAME: Secret.fromSecretsManager(props.database.secret!, 'username'),
        GOOGLE_CLIENT_ID: getSecureString(this, 'fomo-player-google-client-id'),
        GOOGLE_CLIENT_SECRET: getSecureString(this, 'fomo-player-google-client-secret'),
        SESSION_SECRET: getSecureString(this, 'fomo-player-session-secret'),
        SPOTIFY_CLIENT_ID: getSecureString(this, 'fomoplayer-spotify-client-id'),
        SPOTIFY_CLIENT_SECRET: getSecureString(this, 'fomoplayer-spotify-client-secret'),
        TELEGRAM_BOT_CHAT_ID: getSecureString(this, 'fomoplayer-telegram-bot-chat-id'),
        TELEGRAM_BOT_TOKEN: getSecureString(this, 'fomoplayer-telegram-bot-token'),
      }
    })

    const key = kms.Key.fromKeyArn(
      this,
      'FomoPlayerKey',
      'arn:aws:kms:eu-north-1:098268584412:key/b429ba47-76fd-45cc-912e-6e5f800ddc5b'
    ) // Import your key
    key.grantDecrypt(fargateTaskDefinition.obtainExecutionRole()) // Grant decrypt to task definition

    container.addPortMappings({
      containerPort
    })

    const sg_service = new ec2.SecurityGroup(this, 'FomoPlayerBackSGService', { vpc: props.vpc })
    sg_service.addIngressRule(ec2.Peer.ipv4('0.0.0.0/0'), ec2.Port.tcp(3000))

    // TODO: Use ApplicationLoadBalancedFargateService?
    const service = new ecs.FargateService(this, 'FomoPlayerBackService', {
      cluster,
      taskDefinition: fargateTaskDefinition,
      desiredCount: 1,
      assignPublicIp: false,
      securityGroups: [sg_service]
    })

    service.connections.allowToDefaultPort(props.database.connections, 'Postgres db connection')

    // Setup AutoScaling policy
    const scaling = service.autoScaleTaskCount({ maxCapacity: 2, minCapacity: 1 })
    scaling.scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: 50,
      scaleInCooldown: Duration.seconds(60),
      scaleOutCooldown: Duration.seconds(60)
    })

    const loadBalancer = new elbv2.ApplicationLoadBalancer(this, 'FomoPlayerBackALB', {
      vpc: props.vpc,
      internetFacing: true
    })

    const listener = loadBalancer.addListener('Listener', {
      port: 80
    })

    listener.addTargets('Target', {
      port: 80,
      targets: [service],
      healthCheck: { path: '/health' }
    })

    listener.connections.allowDefaultPortFromAnyIpv4('Open to the world')

    this.loadBalancer = loadBalancer
  }
}
