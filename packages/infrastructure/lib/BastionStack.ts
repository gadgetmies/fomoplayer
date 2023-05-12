import { App } from 'aws-cdk-lib'
import * as cdk from 'aws-cdk-lib'
import { SharedStack, SharedStackProps } from './SharedStack'
import { BastionHostLinux, MachineImage, SubnetType, UserData } from 'aws-cdk-lib/aws-ec2'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import { IDatabaseInstance } from 'aws-cdk-lib/aws-rds'

interface BastionStackProps extends SharedStackProps {
  database: IDatabaseInstance
}

export class BastionStack extends SharedStack {
  constructor(scope: App, id: string, props: BastionStackProps) {
    super(scope, id, props)

    const userData = UserData.forLinux()
    userData.addCommands('yes | sudo amazon-linux-extras install postgresql10')

    const sgService = new ec2.SecurityGroup(this, 'FomoPlayerBastionSGService', {
      vpc: props.vpc,
      allowAllOutbound: true,
      securityGroupName: 'BastionSecurityGroup'
    })
    sgService.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22), 'SSH access')

    const bastion = new BastionHostLinux(this, `BastionHostLinux-${props.stage}`, {
      // machineImage: MachineImage.latestAmazonLinux({ userData }),
      vpc: props.vpc,
      securityGroup: sgService,
      subnetSelection: {
        subnetType: SubnetType.PUBLIC
      }
    })

    bastion.connections.allowToDefaultPort(props.database.connections, 'Postgres db connection')

    const profile = this.node.tryGetContext('profile');

    const createSshKeyCommand = 'ssh-keygen -t rsa -f my_rsa_key';
    const pushSshKeyCommand = `aws ec2-instance-connect send-ssh-public-key --region ${cdk.Aws.REGION} --instance-id ${bastion.instanceId} --availability-zone ${bastion.instanceAvailabilityZone} --instance-os-user ec2-user --ssh-public-key file://.ssh/fomoplayer.pub ${profile ? `--profile ${profile}` : ''}`;
    const sshCommand = `ssh -o "IdentitiesOnly=yes" -i .ssh/fomoplayer ec2-user@${bastion.instancePublicDnsName}`;

    new cdk.CfnOutput(this, 'CreateSshKeyCommand', { value: createSshKeyCommand });
    new cdk.CfnOutput(this, 'PushSshKeyCommand', { value: pushSshKeyCommand });
    new cdk.CfnOutput(this, 'SshCommand', { value: sshCommand});
  }
}
