import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
function contextBytes(context) {
 if(!context||!['recordId','orgId','accountId','personId','authUserId','sessionId'].every(k=>uuid(context[k]))||typeof context.issuer!=='string'||!context.issuer.trim()||!Number.isSafeInteger(context.authEpoch)||context.authEpoch<1||!['BUSINESS_AUTH','PASSWORD_CHANGE'].includes(context.purpose)||typeof context.expiresAt!=='string'||!Number.isFinite(Date.parse(context.expiresAt))||! /^[a-f0-9]{64}$/.test(context.tokenHash))throw new Error('Credential context unavailable');
 return Buffer.from(JSON.stringify(['MIRAI_AUTH_V1',context.recordId,context.issuer,context.orgId,context.accountId,context.personId,context.authUserId,context.sessionId,context.authEpoch,context.purpose,context.expiresAt,context.tokenHash]));
}
function credentialsValid(v){return v&&typeof v.accessToken==='string'&&v.accessToken.length>0&&v.accessToken.length<=16384&&typeof v.refreshToken==='string'&&v.refreshToken.length>0&&v.refreshToken.length<=16384;}
export function createCredentialSealer({keyId,key}) {
 if(typeof window!=='undefined'||typeof keyId!=='string'||! /^[A-Za-z0-9_-]{1,64}$/.test(keyId)||!(key instanceof Uint8Array)||key.byteLength!==32)throw new TypeError('Server-managed encryption key required');
 const encryptionKey=Buffer.from(key);
 return {
  seal({credentials,context}) {
   if(!credentialsValid(credentials))throw new Error('Credentials unavailable');
   const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',encryptionKey,nonce,{authTagLength:16});
   cipher.setAAD(contextBytes(context));
   const ciphertext=Buffer.concat([cipher.update(JSON.stringify({accessToken:credentials.accessToken,refreshToken:credentials.refreshToken}),'utf8'),cipher.final()]);
   return Object.freeze({version:'AES256GCM_V1',keyId,nonce:nonce.toString('base64url'),ciphertext:ciphertext.toString('base64url'),tag:cipher.getAuthTag().toString('base64url')});
  },
  open({envelope,context}) {
   try {
    if(envelope?.version!=='AES256GCM_V1'||envelope.keyId!==keyId||! /^[A-Za-z0-9_-]{16}$/.test(envelope.nonce)||! /^[A-Za-z0-9_-]{22}$/.test(envelope.tag)||! /^[A-Za-z0-9_-]{1,50000}$/.test(envelope.ciphertext))throw new Error();
    const decipher=createDecipheriv('aes-256-gcm',encryptionKey,Buffer.from(envelope.nonce,'base64url'),{authTagLength:16});
    decipher.setAAD(contextBytes(context));decipher.setAuthTag(Buffer.from(envelope.tag,'base64url'));
    const plain=Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext,'base64url')),decipher.final()]);
    const value=JSON.parse(plain.toString('utf8'));if(!credentialsValid(value))throw new Error();
    return Object.freeze(value);
   }catch{throw new Error('Credential envelope unavailable');}
  }
 };
}
