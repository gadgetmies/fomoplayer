import { App } from 'aws-cdk-lib'
import { Secret } from 'aws-cdk-lib/aws-secretsmanager'
import { Vpc } from 'aws-cdk-lib/aws-ec2'
import { SharedStack, SharedStackProps } from './SharedStack'
import { StringParameter } from 'aws-cdk-lib/aws-ssm'

export interface SecretsStackProps extends SharedStackProps {
  stage: string
  vpc: Vpc
}

// export interface Secrets {
//   dbCredentials: Secret
// }

export class SecretsStack extends SharedStack {
  // public readonly secrets: Secrets
  public readonly secretArns: { dbSecret: string }

  constructor(scope: App, id: string, props: SecretsStackProps) {
    super(scope, id, props)

    this.secretArns = {
      dbSecret: `fomoplayer-credentials-arn-${props.stage}`
    }

    const secret = new Secret(this, `FomoPlayer-DBCredentialsSecret-${props.stage}`, {
      secretName: `fomoplayer-credentials-${props.stage}`,
      generateSecretString: {
        secretStringTemplate: JSON.stringify({
          username: 'postgres'
        }),
        excludePunctuation: true,
        includeSpace: false,
        generateStringKey: 'password'
      }
    })

    // next, create a new string parameter to be use
    new StringParameter(this, 'DBCredentialsArn', {
      parameterName: this.secretArns.dbSecret,
      stringValue: secret.secretArn
    })
  }
}
