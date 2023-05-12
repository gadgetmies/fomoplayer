import { App, Stack } from 'aws-cdk-lib'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import { StageStackProps } from './StageStack'
import { ISecurityGroup, SecurityGroup, Vpc } from 'aws-cdk-lib/aws-ec2'

export class VpcStack extends Stack {
  public readonly vpc: Vpc
  public readonly defaultSecurityGroup: ISecurityGroup
  constructor(scope: App, id: string, props: StageStackProps) {
    super(scope, `${id}-${props.stage}`, props)

    this.vpc = new ec2.Vpc(this, `FomoPlayerVPC-${props.stage}`, {
      maxAzs: 2
    })

    this.defaultSecurityGroup = SecurityGroup.fromSecurityGroupId(
      this,
      `FomoPlayer-SG-${props.stage}`,
      this.vpc.vpcDefaultSecurityGroup
    )
  }
}
