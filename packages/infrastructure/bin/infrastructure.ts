#!/usr/bin/env node
import 'source-map-support/register'
import * as cdk from 'aws-cdk-lib'
import { AwsCredentials, GitHubWorkflow } from 'cdk-pipelines-github'
import { FrontStack } from '../lib/front-stack'
import { ShellStep } from 'aws-cdk-lib/pipelines'
import { BackStack } from '../lib/back-stack'
import { DbStack } from '../lib/db-stack'

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
new FrontStack(app, 'FrontStack', {
  // env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
  stage: 'dev'

  /* For more information, see https://docs.aws.amazon.com/cdk/latest/guide/environments.html */
})

new BackStack(app, 'BackStack', {
  // env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
  stage: 'dev'
})

new DbStack(app, 'DbStack', {
  // env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
  stage: 'dev'
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
