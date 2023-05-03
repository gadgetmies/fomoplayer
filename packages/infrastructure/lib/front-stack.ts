import * as cdk from 'aws-cdk-lib'
import { PublicBucket } from './constructs/public-bucket'
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment'
import { CfnOutput } from 'aws-cdk-lib'
import { CloudFrontWebDistribution } from 'aws-cdk-lib/aws-cloudfront'

const path = './resources/build'

export interface FrontStackProps extends cdk.StackProps {
  stage: string,
  apiUrl: string
}

export class FrontStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props: FrontStackProps) {
    super(scope, id, {...props})

    const bucketName = `fomoplayer-front-${props.stage}`
    const frontBucket = new PublicBucket(this, 'FomoPlayerFront', {
      bucketName,
      websiteIndexDocument: 'index.html'
    })

    const previewBucket = new PublicBucket(this, 'FomoPlayerPreviews', {
      bucketName: `fomoplayer-previews-${props.stage}`
    })

    const distribution = new CloudFrontWebDistribution(this, `${bucketName}-distribution`, {
      comment: `${bucketName}-distribution`,
      originConfigs: [
        {
          s3OriginSource: {
            s3BucketSource: frontBucket,
            originAccessIdentity: frontBucket.cloudFrontOAI
          },
          behaviors: [{ isDefaultBehavior: true }]
        },
        {
          s3OriginSource: {
            s3BucketSource: previewBucket,
            originAccessIdentity: frontBucket.cloudFrontOAI
          },
          behaviors: [{
            pathPattern: 'previews/*'
          }]
        },
        {
          customOriginSource: {
            domainName: props.apiUrl,
            originPath: 'api/'
          },
          behaviors: [{
            pathPattern: 'api/*'
          }]
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

    new BucketDeployment(this, 'BucketDeployment', {
      sources: [Source.asset(path)],
      destinationBucket: frontBucket,
      distribution: distribution,
      distributionPaths: ['/*'],
    })
  }
}
