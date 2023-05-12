import { App, Stack, StackProps } from 'aws-cdk-lib'

export interface StageStackProps extends StackProps {
  stage: string
}

export class StageStack extends Stack {
  constructor(scope: App, id: string, props: StageStackProps) {
    super(scope, `${id}-${props.stage}`, props)
  }
}
