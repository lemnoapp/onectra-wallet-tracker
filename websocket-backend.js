const WebSocket = require('ws');
const axios = require('axios');
const { websocketLogger, apiLogger, filterLogger } = require('./utils/Logger');

// Programas conocidos de Solana que NO son mint addresses
const knownPrograms = [
    'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', // SPL Token Program
    '11111111111111111111111111111111',          // System Program
    'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',  // Associated Token Program
    'ComputeBudget111111111111111111111111111111', // Compute Budget Program
    'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'   // Token 2022 Program
];

// Filtros inteligentes para transacciones
class TransactionFilters {
    constructor() {
        this.blacklistedTokens = [
            'Unknown', 'N/A', '', '?', '-', 'UNK', 'UNKNOWN',
            'SOL', 'WSOL', 'wSOL', 'cwSOL', 'cSOL', 'stSOL', 'mSOL', 'jitoSOL', 'bSOL'
        ];
        
        this.blacklistedWalletNames = [
            'Activity', 'Activity...', 'Activity Detected', 'Transaction Detected',
            'Account Update', 'Account Change', 'Unknown', 'Fallback', 'Generic Transaction'
        ];
        
        this.blacklistedTransactionTypes = [
            'fallback', 'account_change', 'system_transaction', 'generic_activity'
        ];
    }
    
    shouldShowTransaction(transactionData) {
        if (!transactionData || typeof transactionData !== 'object') {
            return false;
        }
        
        // PRIORIZAR tokens que NO sean SOL - estos son los memecoins que queremos
        if (transactionData.token && transactionData.token !== 'SOL' && transactionData.token !== 'WSOL') {
            if (transactionData.token.length >= 2 && !this.isTokenBlacklisted(transactionData.token)) {
                return true; // Permitir inmediatamente memecoins válidos
            }
        }
        
        // Filtrar tokens en blacklist
        if (this.isTokenBlacklisted(transactionData.token)) {
            return false;
        }
        
        // Filtrar nombres de wallet genéricos
        if (this.isWalletNameBlacklisted(transactionData.wallet)) {
            return false;
        }
        
        // Filtrar tipos de transacción inútiles
        if (this.isTransactionTypeBlacklisted(transactionData.type)) {
            return false;
        }
        
        // Verificar longitud mínima del token
        if (!this.hasValidTokenLength(transactionData.token)) {
            return false;
        }
        
        // Para transacciones enhanced, verificar mint address
        if (transactionData.type === 'enhanced_transaction' && !transactionData.mintAddress) {
            return false;
        }
        
        return true;
    }
    
    isTokenBlacklisted(token) {
        if (!token) return true;
        const normalizedToken = token.toString().trim().toUpperCase();
        return this.blacklistedTokens.some(blacklisted => 
            normalizedToken === blacklisted.toUpperCase()
        );
    }
    
    isWalletNameBlacklisted(walletName) {
        if (!walletName) return false;
        const normalizedName = walletName.toString().trim();
        return this.blacklistedWalletNames.some(blacklisted =>
            normalizedName.includes(blacklisted)
        );
    }
    
    isTransactionTypeBlacklisted(type) {
        if (!type) return false;
        return this.blacklistedTransactionTypes.includes(type);
    }
    
    hasValidTokenLength(token) {
        if (!token) return false;
        const cleanToken = token.toString().trim();
        return cleanToken.length >= 2;
    }
}

class HeliusWebSocketBackend {
    constructor() {
        // Sistema de rotación de API keys
        this.heliusApiKeys = [
            '1db40a7c-2b94-426e-ad17-03f1fbe960ed',
            '8022b6b9-1888-4512-bc53-51be264f311e', 
            '0ab96068-f225-4798-9ae8-a45174eeb178',
            '4e0ae544-dee2-4f5d-b4b5-025ef2a92773',
            '0dc33dba-fbd3-4120-84c3-52ccebafe757'
        ];
        this.currentApiKeyIndex = 0;
        this.keyRotationInterval = 15 * 60 * 1000; // 15 minutos
        this.callsPerKey = 0;
        this.maxCallsPerRotation = 100;
        
        this.network = 'mainnet';
        this.websocket = null;
        this.trackedWallets = new Set();
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;
        
        // Cache para información de tokens
        this.tokenInfoCache = new Map();
        this.cacheExpiry = 5 * 60 * 1000; // 5 minutos
        
        // Rate limiting - Respeta límites de Helius
        this.enhancedTransactionQueue = [];
        this.assetBatchQueue = [];
        this.lastEnhancedCall = 0;
        this.lastAssetBatchCall = 0;
        this.rateLimitDelay = 1200; // 1.2 segundos
        
        // Filtros de transacciones
        this.filters = new TransactionFilters();
        
        // Callback para notificar transacciones
        this.onTransactionReceived = null;
        
        websocketLogger.success('Veyra Labs Bot initialized', {
            network: this.network,
            apiKeys: this.heliusApiKeys.length,
            rotationInterval: `${this.keyRotationInterval / 1000 / 60}min`,
            maxCallsPerRotation: this.maxCallsPerRotation
        });
        
        this.initializeKeyRotation();
        this.setupCacheCleanup();
    }
    
    // ========== MÉTODOS DE ROTACIÓN DE API KEYS ==========
    
    getCurrentApiKey() {
        return this.heliusApiKeys[this.currentApiKeyIndex];
    }
    
    initializeKeyRotation() {
        // Rotación por tiempo
        setInterval(() => {
            this.rotateApiKeyByTime();
        }, this.keyRotationInterval);
    }
    
    rotateApiKeyByTime() {
        const oldIndex = this.currentApiKeyIndex;
        this.currentApiKeyIndex = (this.currentApiKeyIndex + 1) % this.heliusApiKeys.length;
        this.callsPerKey = 0;
        
        const oldKey = this.heliusApiKeys[oldIndex].substring(0, 8) + '...';
        const newKey = this.getCurrentApiKey().substring(0, 8) + '...';
        
        websocketLogger.info(`API key rotated (time): ${oldKey} → ${newKey}`);
        
        if (this.isConnected) {
            this.reconnectWithNewApiKey();
        }
    }
    
    rotateApiKeyByUsage() {
        this.callsPerKey++;
        
        if (this.callsPerKey >= this.maxCallsPerRotation) {
            const oldIndex = this.currentApiKeyIndex;
            this.currentApiKeyIndex = (this.currentApiKeyIndex + 1) % this.heliusApiKeys.length;
            this.callsPerKey = 0;
            
            const oldKey = this.heliusApiKeys[oldIndex].substring(0, 8) + '...';
            const newKey = this.getCurrentApiKey().substring(0, 8) + '...';
            
            websocketLogger.info(`API key rotated (usage): ${oldKey} → ${newKey}`);
            
            if (this.isConnected) {
                this.reconnectWithNewApiKey();
            }
        }
    }
    
    reconnectWithNewApiKey() {
        websocketLogger.info('Reconnecting WebSocket with new API key');
        
        if (this.websocket) {
            this.websocket.close(1000, 'API key rotation');
        }
        
        setTimeout(() => {
            this.connect();
        }, 1000);
    }
    
    // ========== CACHE MANAGEMENT ==========
    
    setupCacheCleanup() {
        setInterval(() => {
            this.purgeExpiredCache();
        }, 5 * 60 * 1000); // Cada 5 minutos
    }
    
    purgeExpiredCache() {
        const now = Date.now();
        let purgedCount = 0;
        
        for (const [key, value] of this.tokenInfoCache.entries()) {
            if (value.expiry && value.expiry < now) {
                this.tokenInfoCache.delete(key);
                purgedCount++;
            }
        }
        
        // Cache cleanup silently
    }
    
    // ========== ENHANCED TRANSACTIONS API ==========
    
    async getEnhancedTransaction(signature) {
        return new Promise((resolve) => {
            this.enhancedTransactionQueue.push({ signature, resolve });
            this.processEnhancedTransactionQueue();
        });
    }
    
    async processEnhancedTransactionQueue() {
        if (this.enhancedTransactionQueue.length === 0) return;
        
        const now = Date.now();
        const timeSinceLastCall = now - this.lastEnhancedCall;
        
        if (timeSinceLastCall < this.rateLimitDelay) {
            setTimeout(() => this.processEnhancedTransactionQueue(), this.rateLimitDelay - timeSinceLastCall);
            return;
        }
        
        const { signature, resolve } = this.enhancedTransactionQueue.shift();
        this.lastEnhancedCall = Date.now();
        
        const result = await this.fetchEnhancedTransactionDirect(signature);
        resolve(result);
        
        if (this.enhancedTransactionQueue.length > 0) {
            setTimeout(() => this.processEnhancedTransactionQueue(), this.rateLimitDelay);
        }
    }
    
    async fetchEnhancedTransactionDirect(signature) {
        this.rotateApiKeyByUsage();
        const apiUrl = `https://api.helius.xyz/v0/transactions?api-key=${this.getCurrentApiKey()}`;
        
        const requestBody = {
            transactions: [signature]
        };
        
        try {
            const startTime = Date.now();
            const response = await axios.post(apiUrl, requestBody, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 10000
            });
            
            const duration = Date.now() - startTime;
            
            if (response.data && response.data.length > 0) {
                apiLogger.debug(`Enhanced TX fetched: ${signature.substring(0, 8)}... (${duration}ms)`);
                return response.data[0];
            }
            
            return null;
        } catch (error) {
            console.error('❌ Error fetching enhanced transaction:', error.message);
            return null;
        }
    }
    
    // ========== ASSET BATCH API ==========
    
    async getAssetInfo(mintAddresses) {
        if (!Array.isArray(mintAddresses)) {
            mintAddresses = [mintAddresses];
        }
        
        // Check cache first
        const cachedInfo = mintAddresses.map(mint => this.tokenInfoCache.get(mint)).filter(Boolean);
        if (cachedInfo.length === mintAddresses.length) {
            console.log('🔍 Using cached token info for:', mintAddresses.length, 'tokens');
            return cachedInfo;
        }
        
        return new Promise((resolve) => {
            this.assetBatchQueue.push({ mintAddresses, resolve });
            this.processAssetBatchQueue();
        });
    }
    
    async processAssetBatchQueue() {
        if (this.assetBatchQueue.length === 0) return;
        
        const now = Date.now();
        const timeSinceLastCall = now - this.lastAssetBatchCall;
        
        if (timeSinceLastCall < this.rateLimitDelay) {
            setTimeout(() => this.processAssetBatchQueue(), this.rateLimitDelay - timeSinceLastCall);
            return;
        }
        
        const { mintAddresses, resolve } = this.assetBatchQueue.shift();
        this.lastAssetBatchCall = Date.now();
        
        const result = await this.fetchAssetInfoDirect(mintAddresses);
        resolve(result);
        
        if (this.assetBatchQueue.length > 0) {
            setTimeout(() => this.processAssetBatchQueue(), this.rateLimitDelay);
        }
    }
    
    async fetchAssetInfoDirect(mintAddresses) {
        this.rotateApiKeyByUsage();
        const apiUrl = `https://mainnet.helius-rpc.com/?api-key=${this.getCurrentApiKey()}`;
        
        const requestBody = {
            jsonrpc: "2.0",
            id: "asset-batch",
            method: "getAssetBatch",
            params: {
                ids: mintAddresses,
                displayOptions: { showFungible: true }
            }
        };
        
        try {
            console.log('🔍 Fetching asset batch for:', mintAddresses.length, 'tokens');
            
            const response = await axios.post(apiUrl, requestBody, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 10000
            });
            
            if (response.data && response.data.result) {
                console.log('✅ Asset batch obtained for', response.data.result.length, 'tokens');
                
                // Update cache
                response.data.result.forEach(asset => {
                    if (asset && asset.id && asset.content) {
                        const tokenInfo = {
                            symbol: asset.content.metadata?.symbol || 'N/A',
                            image: asset.content.links?.image || null,
                            expiry: Date.now() + this.cacheExpiry
                        };
                        this.tokenInfoCache.set(asset.id, tokenInfo);
                    }
                });
                
                // Return mapped info
                return mintAddresses.map(mint => {
                    const cached = this.tokenInfoCache.get(mint);
                    return cached || { symbol: 'N/A', image: null };
                });
            }
            
            return mintAddresses.map(() => ({ symbol: 'N/A', image: null }));
        } catch (error) {
            console.error('❌ Error fetching asset info:', error.message);
            return mintAddresses.map(() => ({ symbol: 'N/A', image: null }));
        }
    }
    
    // ========== TRANSACTION PROCESSING ==========
    
    extractMintAddresses(enhancedTx) {
        const mintAddresses = new Set();
        
        try {
            if (enhancedTx.tokenTransfers) {
                enhancedTx.tokenTransfers.forEach(transfer => {
                    if (transfer.mint) {
                        mintAddresses.add(transfer.mint);
                    }
                });
            }
            
            if (enhancedTx.accountData) {
                enhancedTx.accountData.forEach(account => {
                    if (account.mint) {
                        mintAddresses.add(account.mint);
                    }
                });
            }
            
            const result = Array.from(mintAddresses);
            console.log('🎯 Extracted mint addresses:', result.length);
            return result;
        } catch (error) {
            console.error('❌ Error extracting mint addresses:', error);
            return [];
        }
    }
    
    // 🎯 FUNCIÓN MEJORADA: Extraer cantidades SOL y tokens con logging detallado (Chrome Extension Logic)
    extractTokenAmounts(enhancedTx) {
        const tokenAmounts = [];
        
        try {
            // Extracting token amounts from transaction
            console.log('🔍 Enhanced TX type:', enhancedTx.type);
            console.log('🔍 Token transfers count:', enhancedTx.tokenTransfers?.length || 0);
            console.log('🔍 Native transfers count:', enhancedTx.nativeTransfers?.length || 0);
            
            // 🎯 PASO 1: Procesar transferencias de tokens (incluyendo SOL como token)
            if (enhancedTx.tokenTransfers && enhancedTx.tokenTransfers.length > 0) {
                enhancedTx.tokenTransfers.forEach((transfer, index) => {
                    console.log(`\n📊 Transfer ${index + 1}:`);
                    console.log('  📍 Mint:', transfer.mint);
                    console.log('  📍 Raw Amount:', transfer.tokenAmount);
                    console.log('  📍 From:', transfer.fromUserAccount?.substring(0, 8) + '...');
                    console.log('  📍 To:', transfer.toUserAccount?.substring(0, 8) + '...');
                    
                    // Verificar si es SOL
                    const isSOLTransfer = transfer.mint === 'So11111111111111111111111111111111111111112';
                    console.log('  💰 Is SOL Transfer:', isSOLTransfer);
                    
                    if (transfer.tokenAmount && transfer.tokenAmount !== '0') {
                        console.log('  ✅ Processing transfer with amount:', transfer.tokenAmount);
                        
                        // Determinar BUY/SELL usando lógica del Chrome Extension
                        const isBuy = this.determineBuySell(transfer, enhancedTx);
                        let tradeType = isBuy ? 'BUY' : 'SELL';
                        
                        // 🎯 CORRECCIÓN CRÍTICA PARA SOL (Chrome Extension Logic): 
                        // La lógica automática está invertida para SOL vs tokens
                        if (isSOLTransfer) {
                            // Si estamos viendo una transacción donde se venden tokens por SOL:
                            // - El token sale de la wallet (SELL)
                            // - El SOL entra a la wallet (pero debería mostrarse como SELL también)
                            // La lógica automática ve "SOL entrando" y dice BUY, pero es incorrecto
                            tradeType = isBuy ? 'SELL' : 'BUY'; // Invertir la lógica para SOL
                            console.log('  💰 SOL BUY/SELL logic corrected - was:', isBuy ? 'BUY' : 'SELL', 'now:', tradeType);
                        }
                        
                        console.log('  📈 Trade Type:', tradeType);
                        
                        // Formatear amount usando función robusta del Chrome Extension
                        const humanAmount = this.formatTokenAmount(transfer.tokenAmount, transfer.tokenStandard || 9);
                        console.log('  📊 Human Amount:', humanAmount);
                        
                        // Calcular valor SOL si es SOL transfer
                        let solAmount = 0;
                        if (isSOLTransfer) {
                            // 🎯 CRÍTICO: Detectar si tokenAmount ya es decimal o está en lamports
                            const tokenAmountStr = transfer.tokenAmount.toString();
                            if (tokenAmountStr.includes('.')) {
                                // Ya es decimal SOL, usar directamente
                                solAmount = parseFloat(transfer.tokenAmount);
                                console.log('  💰 SOL Amount (decimal format):', solAmount.toFixed(6));
                            } else {
                                // Es lamports, convertir a SOL
                                solAmount = parseFloat(transfer.tokenAmount) / 1000000000;
                                console.log('  💰 SOL Amount (lamports converted):', solAmount.toFixed(6));
                            }
                        }
                        
                        const amountData = {
                            mint: transfer.mint,
                            amount: transfer.tokenAmount,
                            decimals: transfer.tokenStandard || 9,
                            rawAmount: transfer.tokenAmount,
                            humanAmount: humanAmount,
                            solAmount: solAmount, // 🎯 VALOR SOL CALCULADO
                            type: tradeType,
                            isSOL: isSOLTransfer, // 🎯 FLAG SOL
                            fromUserAccount: transfer.fromUserAccount,
                            toUserAccount: transfer.toUserAccount
                        };
                        
                        tokenAmounts.push(amountData);
                        
                        console.log('  ✅ Added to amounts array');
                    }
                });
                
                // 🎯 RESUMEN FINAL DE SOL (Chrome Extension Style)
                const solTransfers = tokenAmounts.filter(ta => ta.isSOL);
                if (solTransfers.length > 0) {
                    const totalSOL = solTransfers.reduce((sum, sol) => sum + (sol.solAmount || 0), 0);
                    websocketLogger.debug(`SOL extracted: ${solTransfers.length} transfers, total: ${totalSOL.toFixed(4)} SOL`);
                }
            }
            
            // 🎯 PASO 2: Procesar nativeTransfers como fallback si no hay tokenTransfers de SOL
            const hasSOLInTokenTransfers = tokenAmounts.some(ta => ta.isSOL);
            if (!hasSOLInTokenTransfers && enhancedTx.nativeTransfers && enhancedTx.nativeTransfers.length > 0) {
                console.log('\n🔄 Processing nativeTransfers as fallback for SOL...');
                
                enhancedTx.nativeTransfers.forEach((transfer, index) => {
                    const amount = parseFloat(transfer.amount || 0);
                    const solAmount = amount / 1000000000; // Convert lamports to SOL
                    
                    console.log(`🔍 Native transfer ${index + 1}:`, {
                        amount: transfer.amount,
                        solAmount: solAmount.toFixed(6),
                        fromUserAccount: transfer.fromUserAccount?.substring(0, 8) + '...',
                        toUserAccount: transfer.toUserAccount?.substring(0, 8) + '...'
                    });
                    
                    if (amount !== 0) {
                        tokenAmounts.push({
                            mint: 'So11111111111111111111111111111111111111112', // SOL mint
                            rawAmount: amount,
                            humanAmount: this.formatSOLAmountDirect(solAmount),
                            solAmount: solAmount,
                            type: amount > 0 ? 'BUY' : 'SELL',
                            isSOL: true,
                            fromUserAccount: transfer.fromUserAccount,
                            toUserAccount: transfer.toUserAccount
                        });
                    }
                });
            }
            
            websocketLogger.debug(`Token extraction complete: ${tokenAmounts.length} amounts found`);
            return tokenAmounts;
        } catch (error) {
            console.error('❌ Error extracting token amounts:', error);
            return [];
        }
    }
    
    // 🎯 FUNCIÓN EXACTA DEL CHROME EXTENSION: Formatear cantidad de tokens a formato legible
    formatTokenAmount(rawAmount, decimals = 9) {
        try {
            // Verificar que rawAmount es válido
            if (rawAmount === null || rawAmount === undefined || rawAmount === '') {
                return 'N/A';
            }
            
            // FIX DECIMALS ISSUE: Convertir decimals a número si es string
            if (typeof decimals === 'string') {
                if (decimals === 'Fungible') {
                    decimals = 6; // Pump.fun tokens typically use 6 decimals
                } else {
                    const parsedDecimals = parseInt(decimals);
                    if (!isNaN(parsedDecimals)) {
                        decimals = parsedDecimals;
                    } else {
                        decimals = 9;
                    }
                }
            } else if (typeof decimals !== 'number') {
                decimals = 9;
            }
            
            // Convertir rawAmount a string para procesamiento
            let amountStr = rawAmount.toString();
            
            // Verificar si ya es un número decimal (contiene punto)
            if (amountStr.includes('.')) {
                const decimalAmount = parseFloat(amountStr);
                if (isNaN(decimalAmount)) {
                    return 'N/A';
                }
                return this.formatAmountWithUnits(decimalAmount);
            }
            
            // Si no contiene punto decimal, tratar como raw amount con decimals
            let rawAmountBigInt;
            try {
                rawAmountBigInt = BigInt(amountStr);
            } catch (error) {
                return 'N/A';
            }
            
            // Calcular el divisor basado en decimals
            const divisor = BigInt(10 ** decimals);
            const wholePart = rawAmountBigInt / divisor;
            const remainder = rawAmountBigInt % divisor;
            const decimalAmount = parseFloat(wholePart.toString()) + parseFloat(remainder.toString()) / parseFloat(divisor.toString());
            
            return this.formatAmountWithUnits(decimalAmount);
            
        } catch (error) {
            console.error('❌ Token formatting error:', error.message);
            return 'N/A';
        }
    }
    
    // Helper function para formatear cantidades con unidades
    formatAmountWithUnits(decimalAmount) {
        if (decimalAmount >= 1000000000) {
            return (decimalAmount / 1000000000).toFixed(2) + 'B tokens';
        } else if (decimalAmount >= 1000000) {
            return (decimalAmount / 1000000).toFixed(2) + 'M tokens';
        } else if (decimalAmount >= 1000) {
            return (decimalAmount / 1000).toFixed(2) + 'K tokens';
        } else if (decimalAmount >= 1) {
            return decimalAmount.toLocaleString('en-US', {
                minimumFractionDigits: 0,
                maximumFractionDigits: 6
            }) + ' tokens';
        } else {
            return decimalAmount.toFixed(6) + ' tokens';
        }
    }

    // 🎯 FUNCIÓN EXACTA DEL CHROME EXTENSION: Formatear cantidad específicamente para SOL
    formatSOLAmount(lamports) {
        try {
            const solAmount = parseFloat(lamports) / 1000000000; // Convertir lamports a SOL
            
            if (solAmount >= 1000) {
                return (solAmount / 1000).toFixed(2) + 'K SOL';
            } else if (solAmount >= 1) {
                return solAmount.toFixed(3) + ' SOL';
            } else if (solAmount >= 0.001) {
                return solAmount.toFixed(4) + ' SOL';
            } else {
                return solAmount.toFixed(6) + ' SOL';
            }
        } catch (error) {
            console.error('❌ Error formatting SOL amount:', error);
            return 'N/A SOL';
        }
    }

    // 🎯 FUNCIÓN EXACTA DEL CHROME EXTENSION: Formatear cantidad SOL que ya está en formato decimal
    formatSOLAmountDirect(solAmount) {
        try {
            const amount = parseFloat(solAmount);
            
            if (amount >= 1000) {
                return (amount / 1000).toFixed(2) + 'K SOL';
            } else if (amount >= 1) {
                return amount.toFixed(3) + ' SOL';
            } else if (amount >= 0.001) {
                return amount.toFixed(4) + ' SOL';
            } else {
                return amount.toFixed(6) + ' SOL';
            }
        } catch (error) {
            console.error('❌ Error formatting SOL amount direct:', error);
            return 'N/A SOL';
        }
    }

    // 🎯 FUNCIÓN EXACTA DEL CHROME EXTENSION: Determinar si es compra o venta
    determineBuySell(transfer, enhancedTx) {
        const trackedWallets = Array.from(this.trackedWallets);
        
        const isReceiving = trackedWallets.some(wallet => 
            transfer.toUserAccount === wallet ||
            transfer.toUserAccount?.includes(wallet)
        );
        
        const isSending = trackedWallets.some(wallet => 
            transfer.fromUserAccount === wallet ||
            transfer.fromUserAccount?.includes(wallet)
        );
        
        // Si está recibiendo tokens, es una compra
        if (isReceiving && !isSending) return true;
        // Si está enviando tokens, es una venta
        if (isSending && !isReceiving) return false;
        
        // Si está tanto enviando como recibiendo (swap interno), determinar por tipo de transacción
        if (isSending && isReceiving) {
            // Para swaps, verificar el tipo de transacción
            if (enhancedTx.type === 'SWAP') {
                // En un swap, si el token que estamos viendo sale de la wallet, es venta
                return !isSending;
            }
        }
        
        // Fallback: si no podemos determinar, asumir que es compra
        return true;
    }

    // 🎯 FUNCIÓN EXACTA DEL CHROME EXTENSION: Determinar BUY/SELL para transferencias nativas (SOL)
    determineBuySellNative(nativeTransfer, enhancedTx) {
        const trackedWallets = Array.from(this.trackedWallets);
        
        const isReceiving = trackedWallets.some(wallet => 
            nativeTransfer.toUserAccount === wallet ||
            nativeTransfer.toUserAccount?.includes(wallet)
        );
        
        const isSending = trackedWallets.some(wallet => 
            nativeTransfer.fromUserAccount === wallet ||
            nativeTransfer.fromUserAccount?.includes(wallet)
        );
        
        // Si está recibiendo SOL, es una venta (vendió tokens por SOL)
        if (isReceiving && !isSending) return false; // SELL (recibe SOL)
        // Si está enviando SOL, es una compra (compró tokens con SOL)
        if (isSending && !isReceiving) return true; // BUY (envía SOL)
        
        // Fallback
        return true;
    }
    
    // ========== WEBSOCKET METHODS ==========
    
    connect() {
        // Solo conectar si hay wallets para rastrear
        if (this.trackedWallets.size === 0) {
            console.log('⚠️ No wallets to track - WebSocket connection skipped');
            console.log('💤 Bot in standby mode - Use /track to start monitoring');
            this.isConnected = false;
            return;
        }
        
        console.log('🔌 Attempting to connect to Helius WebSocket...');
        console.log(`📊 Connecting with ${this.trackedWallets.size} wallet(s) to track`);
        const wsUrl = `wss://${this.network}.helius-rpc.com/?api-key=${this.getCurrentApiKey()}`;
        
        this.websocket = new WebSocket(wsUrl);
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        this.websocket.onopen = () => {
            console.log('✅ WebSocket connection opened successfully!');
            this.isConnected = true;
            this.reconnectAttempts = 0;
            
            // Solo suscribir si hay wallets para rastrear
            if (this.trackedWallets.size > 0) {
                this.subscribeToTrackedWallets();
            } else {
                console.log('⚠️ No wallets to subscribe - WebSocket in standby mode');
            }
        };
        
        this.websocket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.processTransactionUpdate(data);
            } catch (error) {
                console.error('❌ Error parsing WebSocket message:', error);
            }
        };
        
        this.websocket.onclose = (event) => {
            console.log('🔌 WebSocket connection closed');
            this.isConnected = false;
            if (!event.wasClean) this.handleReconnect();
        };
        
        this.websocket.onerror = () => {
            console.error('❌ WebSocket error occurred');
            this.isConnected = false;
        };
    }
    
    async processTransactionUpdate(data) {
        if (data.method === 'logsNotification') {
            // CRITICAL CHECK: Si no hay wallets trackeadas, ignorar TODAS las transacciones
            if (this.trackedWallets.size === 0) {
                console.log('🚫 No wallets being tracked - Ignoring transaction notification');
                return;
            }
            
            const logs = data.params.result;
            const signature = logs.value?.signature;
            
            if (!signature) {
                console.log('⚠️ No signature found in logs');
                return;
            }
            
            console.log('📋 Processing transaction:', signature.substring(0, 8) + '...');
            
            try {
                // Paso 1: Obtener Enhanced Transaction
                const enhancedTx = await this.getEnhancedTransaction(signature);
                if (!enhancedTx) {
                    console.log('⚠️ Could not get enhanced transaction data');
                    this.handleFallbackTransaction(logs);
                    return;
                }
                
                // 🎯 FILTRO: Solo procesar transacciones tipo SWAP
                console.log('🔍 Enhanced TX type:', enhancedTx.type);
                if (enhancedTx.type !== 'SWAP' && !enhancedTx.type.toLowerCase().includes('swap')) {
                    console.log(`🚫 FILTER REJECTED: Transaction type '${enhancedTx.type}' is not SWAP - ignoring transaction`);
                    return;
                }
                console.log('✅ FILTER APPROVED: Transaction type is SWAP - proceeding with processing');
                
                // Paso 2: Extraer mint addresses
                const mintAddresses = this.extractMintAddresses(enhancedTx);
                if (mintAddresses.length === 0) {
                    console.log('⚠️ No mint addresses found');
                    return;
                }
                
                // Paso 3: Obtener información de tokens
                const assetInfoArray = await this.getAssetInfo(mintAddresses);
                
                // Paso 4: Extraer cantidades de tokens
                const tokenAmounts = this.extractTokenAmounts(enhancedTx);
                
                // Paso 5: Determinar token principal (priorizar no-SOL)
                let primaryToken = null;
                let primaryTokenIndex = 0;
                
                const validNonSOLTokens = [];
                
                for (let i = 0; i < assetInfoArray.length; i++) {
                    const asset = assetInfoArray[i];
                    if (asset && asset.symbol) {
                        const symbol = asset.symbol.trim();
                        
                        if (symbol !== 'SOL' && symbol !== 'WSOL' && symbol !== 'wSOL' &&
                            symbol !== 'Unknown' && symbol !== 'N/A' && symbol !== '' &&
                            symbol.length >= 2) {
                            
                            const mintAddr = mintAddresses[i];
                            if (mintAddr && mintAddr !== 'So11111111111111111111111111111111111111112') {
                                validNonSOLTokens.push({
                                    asset,
                                    index: i,
                                    symbol: symbol,
                                    mint: mintAddr
                                });
                            }
                        }
                    }
                }
                
                if (validNonSOLTokens.length > 0) {
                    const chosen = validNonSOLTokens[0];
                    primaryToken = chosen.asset;
                    primaryTokenIndex = chosen.index;
                    console.log('✅ Selected primary token:', primaryToken.symbol);
                } else {
                    console.log('🚫 No valid non-SOL tokens found, skipping transaction');
                    return;
                }
                
                // Paso 6: Determinar BUY/SELL y cantidad SOL
                let amountText = 'N/A';
                let buySellIndicator = '';
                let buySellType = 'UNKNOWN';
                
                // Buscar transfers de SOL (nativeTransfers)
                const solTransfers = tokenAmounts.filter(ta => ta.isSOL);
                console.log('🔍 [DEBUG] SOL transfers found:', solTransfers.length);
                
                // Obtener todas las wallets rastreadas como array para facilitar búsqueda
                const trackedWalletsArray = Array.from(this.trackedWallets);
                console.log('🔍 [DEBUG] Tracked wallets:', trackedWalletsArray.map(w => w.substring(0, 8) + '...'));
                
                let totalSOLAmount = 0;
                let isUserBuying = false;
                let userInvolvedInTransaction = false;
                let actualWalletInvolved = null; // 🎯 NUEVA VARIABLE: Capturar la wallet específica
                
                // 🎯 CORRECCIÓN CRÍTICA: Identificar transferencia SOL principal vs fees
                if (solTransfers.length > 0) {
                    console.log('🔍 [DEBUG] Analyzing all SOL transfers:');
                    
                    // 🎯 DEBUG: Mostrar todos los objetos SOL antes del análisis
                    solTransfers.forEach((sol, i) => {
                        console.log(`🔍 [DEBUG] SOL Transfer ${i + 1}:`, {
                            solAmount: sol.solAmount,
                            rawAmount: sol.rawAmount,
                            humanAmount: sol.humanAmount,
                            fromUserAccount: sol.fromUserAccount?.substring(0, 8) + '...',
                            toUserAccount: sol.toUserAccount?.substring(0, 8) + '...'
                        });
                    });
                    
                    // 🎯 PASO 1: Encontrar la transferencia SOL más grande (swap principal)
                    const largestSOLTransfer = solTransfers.reduce((max, current) => 
                        Math.abs(current.solAmount) > Math.abs(max.solAmount) ? current : max
                    );
                    
                    console.log('🎯 [DEBUG] Largest SOL transfer identified:', {
                        amount: largestSOLTransfer.solAmount.toFixed(6),
                        fromUserAccount: largestSOLTransfer.fromUserAccount ? largestSOLTransfer.fromUserAccount.substring(0, 8) + '...' : 'null',
                        toUserAccount: largestSOLTransfer.toUserAccount ? largestSOLTransfer.toUserAccount.substring(0, 8) + '...' : 'null'
                    });
                    
                    // 🎯 PASO 2: Verificar si la wallet rastreada está involucrada en la transferencia principal
                    const fromUserIsTracked = largestSOLTransfer.fromUserAccount && trackedWalletsArray.includes(largestSOLTransfer.fromUserAccount);
                    const toUserIsTracked = largestSOLTransfer.toUserAccount && trackedWalletsArray.includes(largestSOLTransfer.toUserAccount);
                    
                    console.log(`🔍 [DEBUG] Main transfer wallet detection:`, {
                        fromUserIsTracked,
                        toUserIsTracked,
                        fromUserAccount: largestSOLTransfer.fromUserAccount,
                        toUserAccount: largestSOLTransfer.toUserAccount
                    });
                    
                    // 🎯 PASO 3: Determinar BUY/SELL basado SOLO en la transferencia principal
                    if (fromUserIsTracked || toUserIsTracked) {
                        userInvolvedInTransaction = true;
                        totalSOLAmount = Math.abs(largestSOLTransfer.solAmount);
                        
                        // 🎯 LÓGICA CORREGIDA:
                        // Si la wallet rastreada está RECIBIENDO SOL = SELL (vendió tokens por SOL)
                        if (toUserIsTracked && !fromUserIsTracked) {
                            isUserBuying = false;
                            actualWalletInvolved = largestSOLTransfer.toUserAccount; // 🎯 CAPTURAR WALLET ESPECÍFICA
                            console.log(`✅ [DEBUG] 🔴 SELL DETECTED - User wallet RECEIVING SOL: +${totalSOLAmount.toFixed(6)} SOL`);
                            console.log(`✅ [DEBUG] 🔴 User Wallet: ${largestSOLTransfer.toUserAccount}`);
                            console.log(`✅ [DEBUG] 🔴 SOL Source: ${largestSOLTransfer.fromUserAccount}`);
                        }
                        // Si la wallet rastreada está ENVIANDO SOL = BUY (compró tokens con SOL)
                        else if (fromUserIsTracked && !toUserIsTracked) {
                            isUserBuying = true;
                            actualWalletInvolved = largestSOLTransfer.fromUserAccount; // 🎯 CAPTURAR WALLET ESPECÍFICA
                            console.log(`✅ [DEBUG] 🟢 BUY DETECTED - User wallet SENDING SOL: -${totalSOLAmount.toFixed(6)} SOL`);
                            console.log(`✅ [DEBUG] 🟢 User Wallet: ${largestSOLTransfer.fromUserAccount}`);
                            console.log(`✅ [DEBUG] 🟢 SOL Destination: ${largestSOLTransfer.toUserAccount}`);
                        }
                        
                        console.log('🎯 [DEBUG] Using MAIN SOL transfer only, ignoring fees:', {
                            mainTransferAmount: totalSOLAmount.toFixed(6),
                            direction: isUserBuying ? 'BUY' : 'SELL',
                            totalTransfersFound: solTransfers.length
                        });
                    }
                    
                    // Si no encontramos la wallet directamente, usar método alternativo
                    if (!userInvolvedInTransaction && solTransfers.length > 0) {
                        console.log('⚠️ [DEBUG] User wallet not found in transfers, summing ALL SOL transfers as fallback');
                        
                        // CORRECCIÓN: Sumar TODAS las transferencias SOL en lugar de solo la más grande
                        totalSOLAmount = 0;
                        let userSendingSOL = 0;
                        let userReceivingSOL = 0;
                        
                        solTransfers.forEach(transfer => {
                            const amount = Math.abs(transfer.solAmount);
                            totalSOLAmount += amount;
                            
                            // Determinar dirección del flujo SOL
                            if (this.trackedWallets.has(transfer.fromUserAccount)) {
                                userSendingSOL += amount;
                            }
                            if (this.trackedWallets.has(transfer.toUserAccount)) {
                                userReceivingSOL += amount;
                            }
                        });
                        
                        // Determinar BUY/SELL basado en el flujo neto de SOL
                        isUserBuying = userSendingSOL > userReceivingSOL; // Usuario envía más SOL = BUY
                        userInvolvedInTransaction = true;
                        
                        console.log(`✅ [DEBUG] Summed ALL transfers: ${totalSOLAmount.toFixed(6)} SOL (${solTransfers.length} transfers)`);
                        console.log(`✅ [DEBUG] SOL Flow - Sending: ${userSendingSOL.toFixed(6)}, Receiving: ${userReceivingSOL.toFixed(6)}`);
                    }
                    
                    console.log('🔍 [DEBUG] Final SOL analysis result:', {
                        totalSOLAmount: totalSOLAmount.toFixed(6),
                        isUserBuying: isUserBuying,
                        userInvolvedInTransaction: userInvolvedInTransaction
                    });
                    
                    // Filtrar transacciones con SOL muy pequeño (menos de 0.001 SOL)
                    if (totalSOLAmount < 0.001) {
                        console.log('🚫 SOL amount too small, skipping notification:', totalSOLAmount.toFixed(6));
                        return;
                    }
                    
                    if (userInvolvedInTransaction) {
                        buySellType = isUserBuying ? 'BUY' : 'SELL';
                        const buyIcon = '🟢';
                        const sellIcon = '🔴';
                        buySellIndicator = isUserBuying ? buyIcon : sellIcon;
                        
                        // 🎯 CORRECCIÓN CRÍTICA: totalSOLAmount ya está en formato decimal, usar formatSOLAmountDirect
                        const solAmount = this.formatSOLAmountDirect(totalSOLAmount);
                        amountText = `${buySellIndicator} ${solAmount}`;
                        
                        console.log('🎯 [DEBUG] SOL formatting:', {
                            totalSOLAmount: totalSOLAmount,
                            formattedSOL: solAmount,
                            finalAmountText: amountText
                        });
                    } else {
                        console.log('⚠️ User not involved in transaction, skipping');
                        return;
                    }
                } else {
                    console.log('⚠️ No SOL transfers found, using fallback');
                    // Fallback: usar token amounts
                    const mainTransfer = tokenAmounts[0];
                    if (mainTransfer) {
                        const formattedTokenAmount = this.formatTokenAmount(mainTransfer.humanAmount || 0);
                        amountText = formattedTokenAmount;
                    }
                }
                
                // 🎯 PASO 7: Crear datos de transacción SIMPLIFICADOS (Chrome Extension Style)
                // Solo mostrar compras/ventas y cantidad de SOL, nada más
                console.log('\n🎯 =============== CREATING SIMPLIFIED TRANSACTION DATA ===============');
                console.log('🎯 📋 Transaction Signature:', signature);
                console.log('🎯 🪙 Primary Token Symbol:', primaryToken.symbol);
                console.log('🎯 📊 Transaction Type:', enhancedTx.type || 'UNKNOWN');
                console.log('🎯 💹 BUY/SELL Direction:', buySellType);
                console.log('🎯 💰 Formatted Amount Text:', amountText);
                console.log('🎯 🔢 Raw SOL Amount:', totalSOLAmount.toFixed(6));
                console.log('🎯 👤 Involved Wallet:', actualWalletInvolved?.substring(0, 8) + '...' || 'UNKNOWN');
                
                const transactionData = {
                    signature: signature,
                    wallet: actualWalletInvolved || Array.from(this.trackedWallets)[0], // 🎯 USAR WALLET ESPECÍFICA
                    token: primaryToken.symbol,  // Token principal
                    amount: amountText,          // 🎯 SOLO cantidad de SOL formateada
                    buySell: buySellType,        // 🎯 SOLO BUY o SELL
                    solAmount: totalSOLAmount,   // 🎯 Cantidad SOL numérica
                    type: 'enhanced_transaction',
                    timestamp: new Date().toISOString()
                    // 🎯 REMOVIDO: tokenImage, mintAddress, tokenAmounts (simplificado)
                };
                
                websocketLogger.debug(`Transaction processed: ${transactionData.token} ${transactionData.buySell} ${transactionData.amount}`);
                
                // Paso 8: Aplicar filtros
                if (this.filters.shouldShowTransaction(transactionData)) {
                    filterLogger.success(`Transaction approved: ${transactionData.token} ${transactionData.buySell} ${transactionData.amount}`);
                    this.notifyTransaction(transactionData);
                } else {
                    filterLogger.debug('Transaction filtered out');
                }
                
            } catch (error) {
                console.error('❌ Error processing enhanced transaction:', error);
                this.handleFallbackTransaction(logs);
            }
        }
        
        if (data.result && typeof data.result === 'number') {
            console.log('✅ Subscription confirmed with ID:', data.result);
        }
    }
    
    handleFallbackTransaction(logs) {
        const signature = logs.value?.signature;
        if (!signature) return;
        
        const transactionData = {
            signature: signature,
            wallet: 'Transaction Detected',
            token: 'Unknown',
            amount: 'N/A SOL',
            timestamp: new Date().toISOString(),
            type: 'basic_transaction'
        };
        
        console.log('⚠️ Using fallback transaction data');
        this.notifyTransaction(transactionData);
    }
    
    // ========== WALLET MANAGEMENT ==========
    
    addWallet(walletAddress) {
        if (this.validateWalletAddress(walletAddress)) {
            const wasEmpty = this.trackedWallets.size === 0;
            this.trackedWallets.add(walletAddress);
            console.log('✅ Wallet added:', walletAddress);
            console.log(`📊 Total tracked wallets: ${this.trackedWallets.size}`);
            
            // Si era la primera wallet y no hay conexión, conectar
            if (wasEmpty && !this.isConnected) {
                console.log('🔌 First wallet added - Connecting to WebSocket...');
                this.connect();
            } else if (this.isConnected) {
                // Si ya está conectado, suscribir a la nueva wallet
                this.subscribeToWallet(walletAddress);
            }
            return true;
        }
        return false;
    }
    
    removeWallet(walletAddress) {
        if (this.trackedWallets.has(walletAddress)) {
            this.trackedWallets.delete(walletAddress);
            
            console.log(`🗑️ Removing wallet ${walletAddress.substring(0, 8)}... from tracking`);
            console.log(`📊 Remaining wallets: ${this.trackedWallets.size}`);
            
            // Si no quedan más wallets, desconectar completamente el WebSocket
            if (this.trackedWallets.size === 0) {
                console.log('⚠️ No wallets remaining - Disconnecting WebSocket completely');
                
                if (this.websocket) {
                    // Cerrar la conexión WebSocket completamente
                    this.websocket.close(1000, 'No wallets to track');
                    this.websocket = null;
                    this.isConnected = false;
                    
                    // Limpiar todas las colas pendientes para evitar consumo de API
                    this.enhancedTransactionQueue = [];
                    this.assetBatchQueue = [];
                    
                    console.log('✅ WebSocket disconnected - No API calls will be made');
                    console.log('💤 Bot in standby mode - Use /track to resume');
                }
            } else {
                // Si aún quedan wallets, reconectar para re-suscribir solo a las wallets activas
                console.log('🔄 Reconnecting to update subscriptions...');
                
                if (this.websocket) {
                    // Guardar las wallets actuales
                    const remainingWallets = new Set(this.trackedWallets);
                    
                    // Cerrar conexión actual
                    this.websocket.close(1000, 'Updating subscriptions');
                    
                    // Reconectar después de un breve delay
                    setTimeout(() => {
                        this.trackedWallets = remainingWallets;
                        this.connect();
                        console.log(`✅ Reconnected with ${this.trackedWallets.size} active wallet(s)`);
                    }, 1000);
                }
            }
            
            console.log(`✅ Wallet ${walletAddress.substring(0, 8)}... completely removed`);
            return true;
        }
        console.log(`⚠️ Wallet ${walletAddress.substring(0, 8)}... not found in tracked list`);
        return false;
    }
    
    subscribeToWallet(walletAddress) {
        const logsMessage = {
            jsonrpc: '2.0',
            id: 1,
            method: 'logsSubscribe',
            params: [
                { mentions: [walletAddress] },
                { commitment: 'finalized' }
            ]
        };
        
        this.websocket.send(JSON.stringify(logsMessage));
        console.log('📤 Subscribed to wallet logs:', walletAddress);
    }
    
    subscribeToTrackedWallets() {
        console.log('🔔 Subscribing to all tracked wallets...');
        
        if (this.trackedWallets.size === 0) {
            console.log('ℹ️ No wallets to subscribe to');
            return;
        }
        
        this.trackedWallets.forEach(wallet => {
            this.subscribeToWallet(wallet);
        });
    }
    
    validateWalletAddress(address) {
        const regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
        const isValid = regex.test(address);
        console.log('🔍 Validating wallet address:', address.substring(0, 8) + '...', 'Valid:', isValid);
        return isValid;
    }
    
    // ========== NOTIFICATION ==========
    
    notifyTransaction(transactionData) {
        websocketLogger.info(`📢 Notifying: ${transactionData.token} ${transactionData.buySell} ${transactionData.amount} (${transactionData.signature.substring(0,8)}...)`);
        
        if (this.onTransactionReceived) {
            this.onTransactionReceived(transactionData);
            websocketLogger.success('Transaction handler completed successfully');
        } else {
            websocketLogger.warn('No transaction handler registered!');
        }
    }
    
    // ========== UTILITY METHODS ==========
    
    handleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('❌ Max reconnect attempts reached. Giving up.');
            return;
        }
        
        this.reconnectAttempts++;
        console.log(`🔄 Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
        
        setTimeout(() => {
            this.connect();
        }, this.reconnectDelay);
        
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
    }
    
    getStatus() {
        return {
            connected: this.isConnected,
            trackedWallets: this.trackedWallets.size,
            walletsArray: Array.from(this.trackedWallets),
            currentApiKey: this.getCurrentApiKey().substring(0, 8) + '...',
            cacheSize: this.tokenInfoCache.size,
            queueSizes: {
                enhanced: this.enhancedTransactionQueue.length,
                assetBatch: this.assetBatchQueue.length
            }
        };
    }
    
    disconnect() {
        if (this.websocket) {
            this.websocket.close();
            this.isConnected = false;
            console.log('🔌 WebSocket disconnected');
        }
    }
}

module.exports = HeliusWebSocketBackend;
