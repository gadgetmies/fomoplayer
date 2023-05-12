import { App } from 'aws-cdk-lib'
import * as ecr from 'aws-cdk-lib/aws-ecr'
import { Repository } from 'aws-cdk-lib/aws-ecr'
import { SharedStack, SharedStackProps } from './SharedStack'

export class EcrStack extends SharedStack {
  public readonly repository: Repository
  constructor(scope: App, id: string, props: SharedStackProps) {
    super(scope, id, props)

    this.repository = new ecr.Repository(this, 'fomoplayer-back', {
      repositoryName: 'fomoplayer-back'
    })
  }
}
