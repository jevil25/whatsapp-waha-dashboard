export type WhatsAppSessionStatus = 
  | 'STOPPED'     // Need to restart session
  | 'STARTING'    // Session is initializing
  | 'SCAN_QR_CODE' // Ready for QR code scan
  | 'WORKING'     // Connected and operational
  | 'FAILED';     // Error occurred

export interface SessionStatusResponse {
  status: WhatsAppSessionStatus;
}

export interface SessionQRResponse {
  qr: string;
}
