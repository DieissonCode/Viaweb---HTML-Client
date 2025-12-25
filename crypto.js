// crypto.js
class ViawebCrypto {
    constructor(hexKey, hexIV) {
        this.key = this.hexToBytes(hexKey);
        this.ivSend = this.hexToBytes(hexIV);
        this.ivRecv = this.hexToBytes(hexIV);
        this.blockSize = 16;
    }

    async encrypt(plainText) {
        const encoder = new TextEncoder();
        const plainBytes = encoder.encode(plainText);

        const padLen = this.blockSize - (plainBytes.length % this.blockSize);
        const paddedData = new Uint8Array(plainBytes.length + padLen);
        paddedData.set(plainBytes);
        for (let i = plainBytes.length; i < paddedData.length; i++) {
            paddedData[i] = padLen;
        }

        const cryptoKey = await window.crypto.subtle.importKey(
            'raw',
            this.key,
            { name: 'AES-CBC' },
            false,
            ['encrypt']
        );

        const encrypted = await window.crypto.subtle.encrypt(
            { name: 'AES-CBC', iv: this.ivSend },
            cryptoKey,
            paddedData
        );

        const encryptedArray = new Uint8Array(encrypted);
        this.ivSend = encryptedArray.slice(-16);

        return encryptedArray;
    }

    async decrypt(encryptedBuffer) {
        if (encryptedBuffer.length % 16 !== 0) {
            throw new Error('Dados criptografados devem ter múltiplo de 16');
        }
        const lastBlock = encryptedBuffer.slice(-16);
        const cryptoKey = await window.crypto.subtle.importKey(
            'raw', this.key, { name: 'AES-CBC' }, false, ['decrypt']
        );
        const decrypted = await window.crypto.subtle.decrypt(
            { name: 'AES-CBC', iv: this.ivRecv }, cryptoKey, encryptedBuffer
        );
        this.ivRecv = lastBlock;
        const decryptedArray = new Uint8Array(decrypted);
        const padLen = decryptedArray[decryptedArray.length - 1];
        const unpaddedData = decryptedArray.slice(0, -padLen);
        const decoder = new TextDecoder();
        let result = decoder.decode(unpaddedData);
        result = result.replace(/\0+$/, '').trim();
        return result;
    }

    hexToBytes(hexStr) {
        hexStr = hexStr.replace(/\s/g, '');
        const bytes = new Uint8Array(hexStr.length / 2);
        for (let i = 0; i < bytes.length; i++) {
            bytes[i] = parseInt(hexStr.substr(i*2, 2), 16);
        }
        return bytes;
    }
}

export { ViawebCrypto };