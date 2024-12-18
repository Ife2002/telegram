import { createCipheriv, createDecipheriv, randomBytes } from "crypto"

export function AESEcnrypt(data): { key: string, iv: string, encrypted: string} {
    const key = randomBytes(32)
    const iv = randomBytes(16)
  
    const cipher = createCipheriv('aes-256-cbc', key, iv)
    const encrypted = cipher.update(data, 'utf8', 'hex') + cipher.final('hex')
  
    return {
      key: key.toString('hex'),
      iv: iv.toString('hex'),
      encrypted
    }
  }

export function AESDecrypt(encrypted, key, iv): string {
    const cipher = createDecipheriv(
      'aes-256-cbc',
      Buffer.from(key, 'hex'),
      Buffer.from(iv, 'hex')
    )
  
    return cipher.update(encrypted, 'hex', 'utf8') + cipher.final('utf8')
  }