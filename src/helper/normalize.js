export function mapStatus(paymentProof) {
  if (!paymentProof) return 'pending';

  switch (paymentProof.status) {
    case 'VERIFIED':
      return 'verified';
    case 'REJECTED':
      return 'rejected';
    default:
      return 'pending';
  }
}
