import { randomBytes } from 'node:crypto';

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export const generateBase58String = (length = 44): string => {
  if (length < 32 || length > 44) {
    throw new Error('Base58 length must be between 32 and 44 characters');
  }

  const bytes = randomBytes(length);
  let value = '';

  for (let index = 0; index < length; index += 1) {
    value += BASE58_ALPHABET[bytes[index] % BASE58_ALPHABET.length];
  }

  return value;
};
