import * as cdk from 'aws-cdk-lib'
import { Duration } from 'aws-cdk-lib'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as ecs from 'aws-cdk-lib/aws-ecs'
import { Secret } from 'aws-cdk-lib/aws-ecs'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2'
import { DatabaseInstance } from 'aws-cdk-lib/aws-rds'
import { ApplicationLoadBalancer } from 'aws-cdk-lib/aws-elasticloadbalancingv2'
import { Repository } from 'aws-cdk-lib/aws-ecr'
import { SharedStack, SharedStackProps } from './SharedStack'
import { DbStack } from './DbStack'

export interface BackStackProps extends SharedStackProps {
  repository: Repository,
  database: DatabaseInstance
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
    //  SSM Secure reference is not supported in: [AWS::ECS::TaskDefinition/Properties/ContainerDefinitions,AWS::ECS::TaskDefinition/Properties/ContainerDefinitions,AWS::ECS::TaskDefinition/Properties/ContainerDefinitions,AWS::ECS::TaskDefinition/Properties/ContainerDefinitions,AWS::ECS::TaskDefinition/Properties/ContainerDefinitions,AWS::ECS::TaskDefinition/Properties/ContainerDefinitions,AWS::ECS::TaskDefinition/Properties/ContainerDefinitions]
    // const googleClientId = ssm.StringParameter.valueForSecureStringParameter(this, 'fomo-player-google-client-id', 1)
    // const googleClientSecret = ssm.StringParameter.valueForSecureStringParameter(
    //   this,
    //   'fomo-player-google-client-secret',
    //   1
    // )
    // const sessionSecret = ssm.StringParameter.valueForSecureStringParameter(this, 'fomo-player-session-secret', 1)
    // const spotifyClientId = ssm.StringParameter.valueForSecureStringParameter(this, 'fomo-player-spotify-client-id', 1)
    // const spotifyClientSecret = ssm.StringParameter.valueForSecureStringParameter(
    //   this,
    //   'fomo-player-spotify-client-secret',
    //   1
    // )
    // const telegramBotChatId = ssm.StringParameter.valueForSecureStringParameter(
    //   this,
    //   'fomo-player-telegram-bot-chat-id',
    //   1
    // )
    // const telegramBotToken = ssm.StringParameter.valueForSecureStringParameter(
    //   this,
    //   'fomo-player-telegram-bot-token',
    //   1
    // )

    const container = fargateTaskDefinition.addContainer('fomoplayer-back', {
      // Use an image from Amazon ECR
      image: ecs.ContainerImage.fromRegistry(props.repository.repositoryUri),
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'fomoplayer-back' }),
      environment: {
        PORT: String(containerPort),
        DATABASE_ENDPOINT: props.database.instanceEndpoint.socketAddress,
        DATABASE_NAME: DbStack.databaseName,
        DATABASE_SECRET_ARN: props.database.secret?.secretArn || '',
        NODE_ENV: props.stage,
        SESSION_SECRET: 'REPLACE THIS!'
        // GOOGLE_CLIENT_ID: googleClientId,
        // GOOGLE_CLIENT_SECRET: googleClientSecret,
        // SESSION_SECRET: sessionSecret,
        // SPOTIFY_CLIENT_ID: spotifyClientId,
        // SPOTIFY_CLIENT_SECRET: spotifyClientSecret,
        // TELEGRAM_BOT_CHAT_ID: telegramBotChatId,
        // TELEGRAM_BOT_TOKEN: telegramBotToken
      },
      secrets: {
        DATABASE_PASSWORD: Secret.fromSecretsManager(props.database.secret!, 'password'),
        DATABASE_USERNAME: Secret.fromSecretsManager(props.database.secret!, 'username')
      }
    })

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

    service.connections.allowToDefaultPort(
      props.database.connections,
      'Postgres db connection'
    )

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
