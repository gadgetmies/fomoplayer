import * as cdk from 'aws-cdk-lib'
import { PublicBucket } from './constructs/public-bucket'
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment'
import { CfnOutput } from 'aws-cdk-lib'

const path = './resources/build'

export interface FrontStackProps extends cdk.StackProps {
  stage: string
}

export class FrontStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props: FrontStackProps) {
    super(scope, id, {...props})

    const bucket = new PublicBucket(this, 'FomoPlayerFront', {
      bucketName: `fomoplayer-front-${props.stage}`,
      websiteIndexDocument: 'index.html'
    })

    new BucketDeployment(this, 'BucketDeployment', {
      sources: [Source.asset(path)],
      destinationBucket: bucket,
      distribution: bucket.distribution,
      distributionPaths: ['/*'],
    })

    new CfnOutput(this, 'CloudFrontURL', {
      value: bucket.distribution.distributionDomainName,
      description: 'The distribution URL',
      exportName: 'CloudfrontURL',
    })

    new CfnOutput(this, 'BucketName', {
      value: bucket.bucketName,
      description: 'The name of the S3 bucket',
      exportName: 'BucketName',
    })
  }
}
