import * as cdk from '@aws-cdk/core'
import * as s3 from '@aws-cdk/aws-s3'
import * as sqs from '@aws-cdk/aws-sqs'
import * as lambda from '@aws-cdk/aws-lambda'
import * as nodejs from '@aws-cdk/aws-lambda-nodejs'
import * as logs from '@aws-cdk/aws-logs'
import * as events from '@aws-cdk/aws-lambda-event-sources';

export class WordToPdfStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    const queue = new sqs.Queue(this, 'FailedConversion')

    const sourceBucket = new s3.Bucket(this, 'SourceBucket', {
      bucketName: 'word-to-pdf',
    })

    const fontLayerVersion = new lambda.LayerVersion(this, 'fontLayer', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      code: lambda.Code.fromAsset('fonts'),
      compatibleArchitectures: [
        lambda.Architecture.X86_64,
        lambda.Architecture.ARM_64,
      ]
    })

    const wordToPdfFunc = new nodejs.NodejsFunction(this, 'convert', {
      functionName: 'word-to-pdf-function',
      deadLetterQueueEnabled: true,
      runtime: lambda.Runtime.NODEJS_12_X,
      deadLetterQueue: queue,
      timeout: cdk.Duration.minutes(5),
      logRetention: logs.RetentionDays.ONE_WEEK,
      memorySize: 512,
      environment: {
        'FONTCONFIG_PATH': '/opt/etc/fonts',
      },
      layers: [
        // lambda.LayerVersion.fromLayerVersionArn(this, 'font', 'arn:aws:lambda:ap-southeast-2:347599033421:layer:stix-fonts:1'),
        fontLayerVersion,
        lambda.LayerVersion.fromLayerVersionArn(this, 'libraoffice', 'arn:aws:lambda:ap-southeast-2:764866452798:layer:libreoffice-brotli:1')
      ],
      events: [
        new events.S3EventSource(sourceBucket, {
          events: [s3.EventType.OBJECT_CREATED],
          filters: [{
            suffix: 'doc',
          }],
        }),
        new events.S3EventSource(sourceBucket, {
          events: [s3.EventType.OBJECT_CREATED],
          filters: [{
            suffix: 'docx',
          }],
        }),
      ],
      bundling: {
        sourceMap: true,
      },
    })

    sourceBucket.grantReadWrite(wordToPdfFunc)
  }
}
