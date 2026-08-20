/**
 * The certificate-check route returns 422 only when Acuity has authoritatively
 * established that the supplied code is invalid or cannot be used for any
 * native service. Transport and server failures must preserve a saved code.
 */
export function isAuthoritativeCertificateInvalidStatus(status: number | undefined): boolean {
  return status === 422;
}