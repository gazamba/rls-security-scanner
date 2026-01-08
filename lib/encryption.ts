import crypto from 'crypto'

/**
 * Encryption utility for securely storing OAuth tokens
 * Uses AES-256-GCM for authenticated encryption
 */

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16 // 128 bits
const TAG_LENGTH = 16 // 128 bits
const KEY_LENGTH = 32 // 256 bits

/**
 * Get the encryption key from environment variables
 * Key must be 32 bytes (64 hex characters)
 */
function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY
  
  if (!key) {
    throw new Error(
      'ENCRYPTION_KEY environment variable is required. ' +
      'Generate one with: openssl rand -hex 32'
    )
  }
  
  if (key.length !== KEY_LENGTH * 2) {
    throw new Error(
      `ENCRYPTION_KEY must be ${KEY_LENGTH * 2} hex characters (${KEY_LENGTH} bytes). ` +
      'Generate one with: openssl rand -hex 32'
    )
  }
  
  return Buffer.from(key, 'hex')
}

/**
 * Encrypt a string value
 * Returns a base64-encoded string containing: iv + encrypted data + auth tag
 * 
 * @param plaintext - The string to encrypt
 * @returns Base64-encoded encrypted data with IV and auth tag
 */
export function encrypt(plaintext: string): string {
  if (!plaintext) {
    throw new Error('Cannot encrypt empty string')
  }
  
  const key = getEncryptionKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  
  let encrypted = cipher.update(plaintext, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  
  const authTag = cipher.getAuthTag()
  
  // Combine IV + encrypted data + auth tag
  const combined = Buffer.concat([
    iv,
    Buffer.from(encrypted, 'hex'),
    authTag
  ])
  
  return combined.toString('base64')
}

/**
 * Decrypt an encrypted string
 * 
 * @param encryptedData - Base64-encoded string from encrypt()
 * @returns The original plaintext string
 */
export function decrypt(encryptedData: string): string {
  if (!encryptedData) {
    throw new Error('Cannot decrypt empty string')
  }
  
  const key = getEncryptionKey()
  const combined = Buffer.from(encryptedData, 'base64')
  
  // Extract IV, encrypted data, and auth tag
  const iv = combined.subarray(0, IV_LENGTH)
  const authTag = combined.subarray(combined.length - TAG_LENGTH)
  const encrypted = combined.subarray(IV_LENGTH, combined.length - TAG_LENGTH)
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  
  let decrypted = decipher.update(encrypted.toString('hex'), 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  
  return decrypted
}

/**
 * Validate that the encryption key is properly configured
 * Call this on app startup to fail fast if misconfigured
 */
export function validateEncryptionKey(): void {
  try {
    const key = getEncryptionKey()
    
    // Test encryption/decryption
    const testString = 'test-encryption-' + Date.now()
    const encrypted = encrypt(testString)
    const decrypted = decrypt(encrypted)
    
    if (decrypted !== testString) {
      throw new Error('Encryption validation failed: decrypted value does not match')
    }
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Encryption configuration error: ${error.message}`)
    }
    throw error
  }
}

