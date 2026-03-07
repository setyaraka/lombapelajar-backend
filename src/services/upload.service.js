import { PutObjectCommand } from "@aws-sdk/client-s3"
import crypto from "crypto"
import { r2 } from "../lib/r2.js"

export const uploadPoster = async (file) => {
  const key = `posters/${crypto.randomUUID()}-${file.originalname}`

  await r2.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype
    })
  )

  return key
}