import * as cdk from 'aws-cdk-lib'

export class InfrastructureStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    const bucket = new cdk.aws_s3.Bucket(this, 'FomoPlayerFront', {
      bucketName: 'fomoplayer-front',
      websiteIndexDocument: 'index.html',
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

    const distribution = new cdk.aws_cloudfront.CloudFrontWebDistribution(this, 'FomoPlayerDistribution', {
      originConfigs: [
        {
          s3OriginSource: {
            s3BucketSource: bucket,
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

    bucket.grantRead(cloudFrontOAI.grantPrincipal)
  }
}
