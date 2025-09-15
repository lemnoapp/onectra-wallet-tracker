// Sistema de logging optimizado para Veyra Labs Bot
// Reemplaza logs verbosos con información concisa y útil

class Logger {
    constructor(moduleName = 'SYSTEM') {
        this.moduleName = moduleName;
        this.logLevel = process.env.LOG_LEVEL || 'INFO';
        this.enabledLevels = this.getEnabledLevels();
        
        // Contadores para estadísticas
        this.stats = {
            errors: 0,
            warnings: 0,
            transactions: 0,
            apiCalls: 0,
            notifications: 0,
            lastReset: Date.now()
        };
        this.summaryInterval = 60000; // 1 minuto
        
        // Configuración de colores para terminal
        this.colors = {
            ERROR: '\x1b[31m',   // Rojo
            WARN: '\x1b[33m',    // Amarillo
            INFO: '\x1b[36m',    // Cian
            SUCCESS: '\x1b[32m', // Verde
            DEBUG: '\x1b[90m',   // Gris
            RESET: '\x1b[0m'     // Reset
        };
    }
    
    getEnabledLevels() {
        const levels = {
            ERROR: ['ERROR'],
            WARN: ['ERROR', 'WARN'],
            INFO: ['ERROR', 'WARN', 'INFO'],
            DEBUG: ['ERROR', 'WARN', 'INFO', 'DEBUG']
        };
        return levels[this.logLevel] || levels.INFO;
    }
    
    shouldLog(level) {
        return this.enabledLevels.includes(level);
    }
    
    formatMessage(level, message, data = null) {
        const timestamp = new Date().toLocaleTimeString('es-ES', { hour12: false });
        const color = this.colors[level] || '';
        const reset = this.colors.RESET;
        
        let formattedMessage = `${color}[${timestamp}] ${this.moduleName} ${level}:${reset} ${message}`;
        
        if (data && typeof data === 'object') {
            formattedMessage += ` ${JSON.stringify(data, null, 0)}`;
        } else if (data) {
            formattedMessage += ` ${data}`;
        }
        
        return formattedMessage;
    }
    
    error(message, data = null) {
        if (this.shouldLog('ERROR')) {
            this.stats.errors++;
            console.error(this.formatMessage('ERROR', message, data));
            this.checkSummary();
        }
    }
    
    warn(message, data = null) {
        if (this.shouldLog('WARN')) {
            this.stats.warnings++;
            console.warn(this.formatMessage('WARN', message, data));
        }
    }
    
    info(message, data = null) {
        if (this.shouldLog('INFO')) {
            console.log(this.formatMessage('INFO', message, data));
        }
    }
    
    success(message, data = null) {
        if (this.shouldLog('INFO')) {
            console.log(this.formatMessage('SUCCESS', message, data));
        }
    }
    
    debug(message, data = null) {
        if (this.shouldLog('DEBUG')) {
            console.log(this.formatMessage('DEBUG', message, data));
        }
    }
    
    // Métodos específicos para el bot
    transaction(signature, token, amount, type, solValue = null) {
        this.stats.transactions++;
        const shortSig = signature.substring(0, 8) + '...';
        const solText = solValue ? ` (${solValue.toFixed(4)} SOL)` : '';
        this.info(`TX ${type}: ${token} ${amount}${solText}`, { sig: shortSig });
        this.checkSummary();
    }
    
    apiCall(endpoint, status, duration = null) {
        this.stats.apiCalls++;
        const durationText = duration ? ` (${duration}ms)` : '';
        if (status >= 400) {
            this.error(`API ${endpoint} failed: ${status}${durationText}`);
        } else {
            this.debug(`API ${endpoint}: ${status}${durationText}`);
        }
        this.checkSummary();
    }
    
    websocket(event, details = null) {
        switch (event) {
            case 'connected':
                this.success('WebSocket connected', details);
                break;
            case 'disconnected':
                this.warn('WebSocket disconnected', details);
                break;
            case 'error':
                this.error('WebSocket error', details);
                break;
            case 'reconnecting':
                this.info('WebSocket reconnecting...', details);
                break;
            default:
                this.debug(`WebSocket ${event}`, details);
        }
    }
    
    keyRotation(oldKey, newKey, reason = 'scheduled') {
        const oldShort = oldKey.substring(0, 8) + '...';
        const newShort = newKey.substring(0, 8) + '...';
        this.info(`API key rotated (${reason}): ${oldShort} → ${newShort}`);
    }
    
    filter(action, details) {
        if (action === 'passed') {
            this.debug('Transaction passed filters', details);
        } else if (action === 'blocked') {
            this.debug('Transaction filtered out', details);
        }
    }
    
    // Estadísticas periódicas
    getStats() {
        const now = Date.now();
        const elapsed = (now - this.stats.lastReset) / 1000 / 60; // minutos
        
        return {
            ...this.stats,
            uptime: elapsed.toFixed(1),
            transactionsPerMin: elapsed > 0 ? (this.stats.transactions / elapsed).toFixed(2) : '0',
            apiCallsPerMin: elapsed > 0 ? (this.stats.apiCalls / elapsed).toFixed(2) : '0'
        };
    }
    
    printStats() {
        const stats = this.getStats();
        this.info('📊 Stats Summary', {
            uptime: `${stats.uptime}min`,
            transactions: stats.transactions,
            txPerMin: stats.transactionsPerMin,
            errors: stats.errors,
            warnings: stats.warnings,
            apiCalls: stats.apiCalls
        });
    }
    
    resetStats() {
        this.stats = {
            errors: 0,
            warnings: 0,
            transactions: 0,
            apiCalls: 0,
            notifications: 0,
            lastReset: Date.now()
        };
        this.info('Stats reset');
    }

    // Método para notificaciones
    notification(message, data = null) {
        this.stats.notifications++;
        this.info(`🔔 ${message}`, data);
        this.checkSummary();
    }

    // Verificar si es momento de mostrar resumen
    checkSummary() {
        const now = Date.now();
        if (now - this.stats.lastReset >= this.summaryInterval) {
            this.showSummary();
            this.resetStats();
        }
    }

    // Mostrar resumen periódico
    showSummary() {
        const duration = Math.round((Date.now() - this.stats.lastReset) / 1000);
        console.log(`\n📊 =============== RESUMEN ${this.moduleName} (${duration}s) ===============`);
        console.log(`📈 Transacciones procesadas: ${this.stats.transactions}`);
        console.log(`🔔 Notificaciones enviadas: ${this.stats.notifications}`);
        console.log(`🌐 Llamadas API realizadas: ${this.stats.apiCalls}`);
        console.log(`❌ Errores encontrados: ${this.stats.errors}`);
        console.log(`⏰ Período: ${new Date(this.stats.lastReset).toLocaleTimeString()} - ${new Date().toLocaleTimeString()}`);
        console.log(`📊 =============== FIN RESUMEN ${this.moduleName} ===============\n`);
    }

    // Forzar resumen manual
    forceSummary() {
        this.showSummary();
        this.resetStats();
    }
}

// Crear instancias globales para diferentes módulos
const createLogger = (moduleName) => new Logger(moduleName);

module.exports = {
    Logger,
    createLogger,
    // Instancias predefinidas
    websocketLogger: new Logger('WEBSOCKET'),
    botLogger: new Logger('BOT'),
    apiLogger: new Logger('API'),
    filterLogger: new Logger('FILTER'),
    notificationLogger: new Logger('NOTIFICATION')
};