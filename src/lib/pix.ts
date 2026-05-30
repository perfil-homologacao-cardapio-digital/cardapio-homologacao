/**
 * Generates a BR Code (Pix copia e cola) payload following the EMV standard.
 * Reference: https://www.bcb.gov.br/content/estabilidadefinanceira/pix/Regulamento_Pix/II_ManualdePadroesparaIniciacaodoPix.pdf
 */

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function pad(id: string, value: string): string {
  // EMV/BR Code length is the number of bytes of the value, not JS UTF-16 code units.
  const len = utf8ByteLength(value).toString().padStart(2, '0');
  return `${id}${len}${value}`;
}

function sanitizeAscii(str: string): string {
  if (!str) return '';
  
  // 1. Remove non-printable control characters, zero-width spaces and other "invisibles"
  const cleanStr = str.replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/g, '');

  // 2. Remove diacritics
  const normalized = cleanStr.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  
  // 3. Keep only alphanumeric and spaces for merchant info (strict Pix EMV)
  return normalized
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalizes the Pix Key based on its type.
 */
function normalizePixKey(key: string): string {
  if (!key) return '';
  
  const trimmed = key.trim().replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/g, '');
  const compact = trimmed.replace(/\s/g, '');
  const digits = trimmed.replace(/\D/g, '');
  const isEmail = compact.includes('@');
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(compact);
  const isCpfMask = /^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(trimmed);
  const isCnpjMask = /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/.test(trimmed);
  const looksLikePhone = /^\+?[\d\s().-]+$/.test(trimmed) && !isCpfMask && !isCnpjMask;
  
  // Email: lowercase, no spaces
  if (isEmail) {
    return compact.toLowerCase();
  }

  // Random key (UUID)
  if (isUuid) {
    return compact.toLowerCase();
  }

  const hasPlus = compact.startsWith('+');

  // Explicitly formatted phone numbers
  if (looksLikePhone && (hasPlus || digits.length === 10 || digits.length === 12 || digits.length === 13)) {
    if (hasPlus) return `+${digits}`;
    if (digits.length === 10) return `+55${digits}`;
    return `+${digits}`;
  }

  // CPF (11) or CNPJ (14)
  if (digits.length === 14) return digits;
  if (digits.length === 11) return digits;

  // Random key (UUID) or other: return as-is but lowercase and no spaces
  return compact.toLowerCase();
}

function crc16(payload: string): string {
  const polynomial = 0x1021;
  let crc = 0xFFFF;
  const bytes = new TextEncoder().encode(payload);
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) {
      if (crc & 0x8000) {
        crc = (crc << 1) ^ polynomial;
      } else {
        crc = crc << 1;
      }
      crc &= 0xFFFF;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Normalizes the amount to a valid Number.
 * Handles: "50,00", "50.00", "R$ 50,00", " 50.00 ", etc.
 */
export function normalizeAmount(value: number | string): number {
  if (typeof value === 'number') {
    return isNaN(value) ? 0 : value;
  }

  if (typeof value !== 'string') return 0;

  // 1. Remove currency symbols and spaces, keep digits, dots, commas and minus
  let cleaned = value.replace(/[^\d.,-]/g, '').trim();

  // 2. Handle European/Brazilian format: if there's a comma and no dot, or comma comes after dot
  if (cleaned.includes(',') && cleaned.includes('.')) {
    if (cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')) {
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      cleaned = cleaned.replace(/,/g, '');
    }
  } else if (cleaned.includes(',')) {
    cleaned = cleaned.replace(',', '.');
  }

  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

export interface PixPayloadParams {
  pixKey: string;
  recipientName: string;
  recipientCity: string;
  amount: number | string;
  txId?: string;
}

const PIX_GUI = 'br.gov.bcb.pix';
const PIX_STATIC_TX_ID = '***';

export function generatePixPayload(params: PixPayloadParams): string {
  // Normalize and trim all inputs
  const rawKey = (params.pixKey || '').trim();
  const rawName = (params.recipientName || '').trim();
  const rawCity = (params.recipientCity || '').trim();
  const rawTxId = (params.txId || '').trim();
  
  // Robust amount handling: ensure it's a number
  const finalAmount = normalizeAmount(params.amount);
  
  if (finalAmount <= 0) {
    console.warn("[PIX] Generating payload with amount <= 0", { original: params.amount, normalized: finalAmount });
  }

  // Normalize strings: ASCII only, uppercase, length-limited per BR Code spec.
  const name = sanitizeAscii(rawName).toUpperCase().slice(0, 25).trim() || 'MERCHANT';
  const city = sanitizeAscii(rawCity).toUpperCase().slice(0, 15).trim() || 'SAO PAULO';

  // Static Pix per Bacen example: use Reference Label "***" when no transactional txId is provided.
  const rawTx = rawTxId.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 25);
  const transaction = rawTx || PIX_STATIC_TX_ID;

  const key = normalizePixKey(rawKey);

  if (!key) {
    console.error("[PIX ERROR] Invalid or empty Pix Key");
    return '';
  }

  // Static BR Code / Pix merchant account template (ID 26)
  const gui = pad('00', PIX_GUI);
  const keyField = pad('01', key);
  const merchantAccount = pad('26', gui + keyField);

  // Build payload without CRC
  let payload = '';
  payload += pad('00', '01');                          // Payload Format Indicator
  payload += pad('01', '11');                          // Point of Initiation Method (11 = Static)
  payload += merchantAccount;                           // Merchant Account (GUI + Key)
  payload += pad('52', '0000');                        // Merchant Category Code
  payload += pad('53', '986');                         // Transaction Currency (BRL)
  payload += pad('54', finalAmount.toFixed(2));        // Transaction Amount
  payload += pad('58', 'BR');                          // Country Code
  payload += pad('59', name);                          // Merchant Name
  payload += pad('60', city);                          // Merchant City
  payload += pad('62', pad('05', transaction));        // Additional Data (txId)
  
  // CRC placeholder
  payload += '6304';
  
  // Calculate and append CRC
  const checksum = crc16(payload);
  const result = payload + checksum;

  // Debug log
  console.info("[PIX GENERATED]", {
    input_amount: params.amount,
    final_amount: finalAmount.toFixed(2),
    normalized_key: key,
    requested_txId: rawTx || null,
    txId: transaction,
    pix_mode: 'static',
    final_payload: result
  });

  return result;
}

export function isPixConfigComplete(settings: {
  pix_enabled?: boolean;
  pix_key?: string | null;
  pix_recipient_name?: string | null;
  pix_recipient_city?: string | null;
} | null): boolean {
  if (!settings) return false;
  return !!(
    settings.pix_enabled &&
    settings.pix_key?.trim() &&
    settings.pix_recipient_name?.trim() &&
    settings.pix_recipient_city?.trim()
  );
}
