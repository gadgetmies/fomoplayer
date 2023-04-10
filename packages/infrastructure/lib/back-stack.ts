import * as cdk from 'aws-cdk-lib'
import { PublicBucket } from './constructs/public-bucket'

export interface BackStackProps extends cdk.StackProps {
  stage: string
}

export class BackStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props: BackStackProps) {
    super(scope, id, props)
    new PublicBucket(this, 'FomoPlayerPreviews', {
      bucketName: `fomoplayer-previews-${props.stage}`
    })
  }
}
