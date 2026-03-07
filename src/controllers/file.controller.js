import { GetObjectCommand } from "@aws-sdk/client-s3";
import { r2 } from "../lib/r2.js";

export const proxyFile = async (req, res) => {
  try {
    const fileKey = req.params[0];

    const command = new GetObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: fileKey,
    });

    const response = await r2.send(command);

    res.setHeader("Content-Type", response.ContentType || "application/octet-stream");

    response.Body.pipe(res);

  } catch (err) {
    console.error(err);
    res.status(404).send("File not found");
  }
};