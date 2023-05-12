import { StageStack, StageStackProps } from './StageStack'
import { ISecurityGroup, Vpc } from 'aws-cdk-lib/aws-ec2'
import { App } from 'aws-cdk-lib'

export interface SharedStackProps extends StageStackProps {
  vpc: Vpc,
  securityGroup?: ISecurityGroup
}

export class SharedStack extends StageStack {
  constructor(scope: App, id: string, props: SharedStackProps) {
    super(scope, id, props)
  }
}
