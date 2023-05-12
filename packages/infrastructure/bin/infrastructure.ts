#!/usr/bin/env node
import 'source-map-support/register'
import * as cdk from 'aws-cdk-lib'
import { AwsCredentials, GitHubWorkflow } from 'cdk-pipelines-github'
import { FrontStack } from '../lib/FrontStack'
import { ShellStep } from 'aws-cdk-lib/pipelines'
import { BackStack } from '../lib/BackStack'
import { VpcStack } from '../lib/VpcStack'
import { DbStack } from '../lib/DbStack'
import { SecretsStack } from '../lib/SecretsStack'
import { EcrStack } from '../lib/EcrStack'
import { BastionStack } from '../lib/BastionStack'

// class MyGitHubActionRole extends cdk.Stack {
//   constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
//     super(scope, id, props)
//
//     const provider = new GitHubActionRole(this, 'github-action-role', {
//       repos: ['gadgetmies/multi-store-player']
//     })
//   }
// }

const app = new cdk.App()
const stage = 'dev'
const vpcStack = new VpcStack(app, 'VpcStack', { stage })
const sharedProps = { stage, vpc: vpcStack.vpc }

const secretsStack = new SecretsStack(app, 'SecretsStack', sharedProps)

const dbStack = new DbStack(app, 'DbStack', {
  credentialsArn: secretsStack.secretArns.dbSecret,
  securityGroup: vpcStack.defaultSecurityGroup,
  ...sharedProps
})
new BastionStack(app, 'BastionStack', {
  stage,
  vpc: vpcStack.vpc,
  securityGroup: vpcStack.defaultSecurityGroup,
  database: dbStack.database
})

const ecrStack = new EcrStack(app, 'EcrStack', sharedProps)
const backStack = new BackStack(app, 'BackStack', {
  // env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
  database: dbStack.database,
  repository: ecrStack.repository,
  ...sharedProps
})

new FrontStack(app, 'FrontStack', {
  // env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
  apiUrl: backStack.loadBalancer.loadBalancerDnsName,
  /* For more information, see https://docs.aws.amazon.com/cdk/latest/guide/environments.html */
  ...sharedProps
})

const build = [
  'yarn',
  'yarn build:infrastructure',
  'yarn synth',
  'git diff --exit-code', // <-- this will fail the build if the workflow is not up-to-date
  'ls -la packages/infrastructure',
  'find . -name cdk.out'
]

const pipeline = new GitHubWorkflow(app, 'Pipeline', {
  synth: new ShellStep('Build', {
    commands: build,
    primaryOutputDirectory: './packages/infrastructure/cdk.out/'
  }),
  workflowPath: '../../.github/workflows/deploy.yml',
  workflowTriggers: { push: { branches: ['feature/cdk'] } },
  awsCreds: AwsCredentials.fromOpenIdConnect({
    gitHubActionRoleArn: `arn:aws:iam::${process.env.CDK_DEFAULT_ACCOUNT}:role/GitHubActionRole`,
    roleSessionName: 'optional-role-session-name' // TODO
  })
})

app.synth()
