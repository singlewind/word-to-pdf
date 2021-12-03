import * as stream from 'stream'
import * as fs from 'fs'
import * as path from 'path'
import * as s3 from '@aws-sdk/client-s3'
import * as winston from 'winston'
import { S3Handler, S3Event } from 'aws-lambda'
import { convertTo, canBeConvertedToPDF } from '@shelf/aws-lambda-libreoffice';


const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console()
  ],
})

const s3Client = new s3.S3Client({})

export const handler: S3Handler = async (event: S3Event) => {
  logger.info('s3 objecte created', event)
  for (const record of event.Records) {
    const bucket = record.s3.bucket.name
    const key = record.s3.object.key

    logger.info(`Downloading s3://${bucket}/${key}`)
    await s3Client.send(new s3.GetObjectCommand({
      Bucket: bucket,
      Key: key,
    }))
    .then((output) => {
      const childLogger = logger.child({ step: '1'})
      childLogger.info('GetObject', output)
      const baseName = path.basename(key)
      const tempFileName = `/tmp/${path.basename(key)}`

      return new Promise((resolve, reject) => {
        const dataStream: stream.Readable = output.Body
        dataStream.pipe(fs.createWriteStream(tempFileName))
          .on('error', err => {
            childLogger.error(err)
            reject(err)}
          )
          .on('close', () => {
            childLogger.info(`Temporary file has been saved at ${tempFileName}`)
            resolve(baseName)
          })
      })
    })
    .then(tempFileName => {
      const childLogger = logger.child({ step: '2'})
      const fileName = tempFileName as string
      childLogger.info(`Start to convert ${fileName}`)

      return new Promise(async (resolve) => {
        if (!canBeConvertedToPDF(fileName)) {
          childLogger.warn(`Cannot convert ${tempFileName}`)
          resolve(false)
        }

        resolve(convertTo(fileName, 'pdf'))
      })
    })
    .then(converted => {
      const childLogger = logger.child({ step: '3'})
      if (!converted) {
        childLogger.info('Failed to convert', { bucket, key })
        return
      }

      const convertedFileName = converted as string

      childLogger.info('Document has been converted', { convertedFileName })

      const pdfFileName = path.basename(convertedFileName)

      const docExt = path.extname(key)
      const pdfExt = path.extname(convertedFileName)
      const pdfKeyName = key.replace(docExt, pdfExt)

      childLogger.info('Uploading converted document to s3 bucket', { convertedFileName, pdfKeyName })

      const pdfStream = fs.createReadStream(convertedFileName)

      return s3Client.send(new s3.PutObjectCommand({
        Bucket: bucket,
        Key: pdfKeyName,
        Body: pdfStream,
      }))
      .then(() => {
        childLogger.info('Converted document has been uploaded', { pdfKeyName })
      })
    })
    .catch(logger.error)
  }
}
