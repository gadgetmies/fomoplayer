import * as cdk from 'aws-cdk-lib'
import { PublicBucket } from './constructs/public-bucket'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as ecs from 'aws-cdk-lib/aws-ecs'
import * as ecs_patterns from 'aws-cdk-lib/aws-ecs-patterns'
import * as ecr from 'aws-cdk-lib/aws-ecr';

export interface BackStackProps extends cdk.StackProps {
  stage: string
}

export class BackStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc
  constructor(scope: cdk.App, id: string, props: BackStackProps) {
    super(scope, id, props)
    this.vpc = new ec2.Vpc(this, `VPC-${props?.stage}`, {
      maxAzs: 2
    })

    new PublicBucket(this, 'FomoPlayerPreviews', {
      bucketName: `fomoplayer-previews-${props.stage}`
    })

    new ecr.Repository(this, "fomoplayer-api", {
      repositoryName: "fomoplayer-api"
    });

    const cluster = new ecs.Cluster(this, `FomoPlayerCluster-${props.stage}`, { vpc: this.vpc })
    new ecs_patterns.ApplicationLoadBalancedFargateService(
      this,
      `FomoPlayerFargate-${props.stage}`,
      {
        cluster,
        listenerPort: 80,
        taskImageOptions: {
          image: ecs.ContainerImage.fromAsset(__dirname + '/../resources/back')
        }
      }
    )
  }
}
