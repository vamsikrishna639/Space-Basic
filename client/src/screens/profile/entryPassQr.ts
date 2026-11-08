import QRCode, { type QRCodeRenderersOptions, type QRCodeSegment } from 'qrcode';

// How the Entry Pass QR is drawn (docs/ui-measurements.md §14). Fitted on the screenshot's module edges (rms 0.02
// device px on both axes): `qrcode`'s canvas renderer at 512 px with a 1-module white margin, error-correction
// level M, dark modules #141414. The canvas is then shown at 199.333 x 199 CSS px and smoothed by the browser,
// which is what gives most modules 14 device px and every 11th one 12.8.

export const QR_CANVAS_OPTIONS: QRCodeRenderersOptions = {
  errorCorrectionLevel: 'M',
  width: 512,
  margin: 1,
  color: { dark: '#141414ff', light: '#ffffffff' },
};

/**
 * Byte mode, always: the pass token is 96 characters, which is version 6-M (41 x 41 modules) like the screenshot.
 * The automatic mode split could pick a shorter numeric run and change the module count.
 */
export function qrSegments(token: string): QRCodeSegment[] {
  return [{ data: new TextEncoder().encode(token), mode: 'byte' }]; // the token is ASCII (base64url and '.')
}

export async function drawPassQr(canvas: HTMLCanvasElement, token: string): Promise<void> {
  await QRCode.toCanvas(canvas, qrSegments(token), QR_CANVAS_OPTIONS);
  // The renderer sets an inline CSS size equal to the bitmap; the stylesheet sizes it instead.
  canvas.style.removeProperty('width');
  canvas.style.removeProperty('height');
}
