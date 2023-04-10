import * as cdk from 'aws-cdk-lib'
import { Bucket, BucketProps } from 'aws-cdk-lib/aws-s3'
import { CloudFrontWebDistribution } from 'aws-cdk-lib/aws-cloudfront'

export interface PublicBucketProps extends BucketProps {
  readonly bucketName: string
  readonly websiteIndexDocument?: string
}
export class PublicBucket extends Bucket {
  public readonly distribution: CloudFrontWebDistribution
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
    const cloudFrontOAI = new cdk.aws_cloudfront.OriginAccessIdentity(this, 'OAI')

    this.distribution = new cdk.aws_cloudfront.CloudFrontWebDistribution(this, `${props.bucketName}-distribution`, {
      comment: `${props.bucketName}-distribution`,
      originConfigs: [
        {
          s3OriginSource: {
            s3BucketSource: this,
            originAccessIdentity: cloudFrontOAI
          },
          behaviors: [{ isDefaultBehavior: true }]
        }
      ]
      // viewerCertificate: cloudfront.ViewerCertificate.fromAcmCertificate(
      //   certificate,
      //   {
      //     aliases: ['andrew-bestbier-cdk-blog.com', 'www.andrew-bestbier-cdk-blog.com'],
      //     securityPolicy: cloudfront.SecurityPolicyProtocol.TLS_V1, // 2
      //     sslMethod: cloudfront.SSLMethod.SNI // 3
      //   }
      // )
    })

    // new route53.ARecord(this, 'Alias', {
    //   zone: hostedZone,
    //   target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution))
    // })

    this.grantRead(cloudFrontOAI.grantPrincipal)
  }
}
