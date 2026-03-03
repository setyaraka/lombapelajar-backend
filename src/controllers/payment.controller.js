import { PutObjectCommand } from '@aws-sdk/client-s3';
import * as service from '../services/payment.service.js';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { r2 } from '../lib/r2.js';
import crypto from 'crypto';

export const uploadProof = async (req, res) => {
  try {
    if (!req.file) throw new Error('No file uploaded');

    const fileUrl = `/uploads/${req.file.filename}`;

    const data = await service.uploadPaymentProof(req.user.id, req.params.registrationId, fileUrl);

    res.json({ message: 'Upload success', data });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

export const getUploadUrl = async (req, res) => {
  try {
    const { fileType } = req.body;

    const fileKey = `payment-proofs/${crypto.randomUUID()}`;

    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: fileKey,
      ContentType: fileType,
    });

    const signedUrl = await getSignedUrl(r2, command, { expiresIn: 60 * 5 });

    res.json({
      uploadUrl: signedUrl,
      fileUrl: `${process.env.R2_PUBLIC_DOMAIN}/${fileKey}`,
      fileKey,
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};
