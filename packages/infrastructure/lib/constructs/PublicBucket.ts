import * as cdk from 'aws-cdk-lib'
import { Bucket, BucketProps } from 'aws-cdk-lib/aws-s3'
import { CloudFrontWebDistribution, OriginAccessIdentity } from 'aws-cdk-lib/aws-cloudfront'

export interface PublicBucketProps extends BucketProps {
  readonly bucketName: string
  readonly websiteIndexDocument?: string
}
export class PublicBucket extends Bucket {
  public readonly cloudFrontOAI: OriginAccessIdentity
  constructor(scope: cdk.Stack, id: string, props: PublicBucketProps) {
    super(scope, id, {
      ...props,
      websiteIndexDocument: props.websiteIndexDocument,
      blockPublicAccess: new cdk.aws_s3.BlockPublicAccess({ restrictPublicBuckets: false })
    })

    // const hostedZone = route53.HostedZone.fromLookup(this, 'HostedZone', {
    //   domainName: 'andrew-bestbier-cdk-blog.com',
    // });
    //
    // const certificate = new certificateManager.DnsValidatedCertificate(this, 'Certificate', {
    //   domainName: 'andrew-bestbier-cdk-blog.com',
    //   hostedZone,
    //   region: 'us-east-1'
    // });
    //
    this.cloudFrontOAI = new OriginAccessIdentity(this, 'OAI')

    this.grantRead(this.cloudFrontOAI.grantPrincipal)
  }
}
