/**
 * Generates a valid Pix EMV QR Code payload (BR Code / Pix Copia e Cola).
 * Follows the EMV QRCPS-MPM specification used by BACEN.
 */

function tlv(id: string, value: string): string {
  const len = value.length.toString().padStart(2, '0');
  return `${id}${len}${value}`;
}

function crc16(str: string): string {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) {
        crc = (crc << 1) ^ 0x1021;
      } else {
        crc <<= 1;
      }
      crc &= 0xFFFF;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** Remove accents and non-ASCII characters */
function sanitize(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 .,@\-]/g, '')
    .trim();
}

function formatPixKey(key: string): string {
  const cleaned = key.trim();

  // Phone: starts with + or is 10-13 digits (add +55 if needed)
  if (/^\+\d{10,14}$/.test(cleaned)) {
    return cleaned; // already formatted like +5511999998888
  }

  const digitsOnly = cleaned.replace(/\D/g, '');

  // CPF (11 digits) or CNPJ (14 digits) — return digits only
  if (digitsOnly.length === 11 || digitsOnly.length === 14) {
    return digitsOnly;
  }

  // Phone without country code (10-11 digits for BR)
  if (/^\d{10,11}$/.test(digitsOnly)) {
    return `+55${digitsOnly}`;
  }

  // Email
  if (cleaned.includes('@')) {
    return cleaned.toLowerCase();
  }

  // EVP (random key) or other
  return cleaned;
}

export interface PixPayloadParams {
  pixKey: string;
  recipientName: string;
  recipientCity: string;
  amount: number;
  description?: string;
}

export function generatePixPayload(params: PixPayloadParams): string {
  const { pixKey, recipientName, recipientCity, amount, description } = params;

  const formattedKey = formatPixKey(pixKey);
  const safeName = sanitize(recipientName).slice(0, 25).toUpperCase();
  const safeCity = sanitize(recipientCity).slice(0, 15).toUpperCase();

  // Merchant Account Information (ID 26)
  let merchantAccount = tlv('00', 'br.gov.bcb.pix') + tlv('01', formattedKey);
  if (description) {
    merchantAccount += tlv('02', sanitize(description).slice(0, 25));
  }

  // Additional Data Field (ID 62) — txid is mandatory
  const txid = '***';
  const additionalData = tlv('05', txid);

  let payload = '';
  payload += tlv('00', '01');                    // Payload Format Indicator
  payload += tlv('01', '12');                    // Point of Initiation Method (12 = static)
  payload += tlv('26', merchantAccount);         // Merchant Account Information
  payload += tlv('52', '0000');                  // Merchant Category Code
  payload += tlv('53', '986');                   // Transaction Currency (BRL = 986)

  if (amount > 0) {
    payload += tlv('54', amount.toFixed(2));      // Transaction Amount
  }

  payload += tlv('58', 'BR');                    // Country Code
  payload += tlv('59', safeName);                // Merchant Name
  payload += tlv('60', safeCity);                // Merchant City
  payload += tlv('62', additionalData);          // Additional Data Field

  // CRC16 (ID 63) — calculate over the entire payload + "6304"
  const crcInput = payload + '6304';
  const crcValue = crc16(crcInput);

  return crcInput + crcValue;
}
