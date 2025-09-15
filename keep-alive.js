// Keep-alive script for Replit hosting
// This prevents Replit from putting the bot to sleep

const http = require('http');
const { spawn } = require('child_process');

const PORT = process.env.PORT || 3000;

// Simple HTTP server to respond to health checks
const server = http.createServer((req, res) => {
    if (req.url === '/health' || req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
            status: 'alive', 
            uptime: process.uptime(),
            timestamp: new Date().toISOString(),
            service: 'ONECTRA Wallet Bot'
        }));
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
    }
});

// Start the HTTP server
server.listen(PORT, () => {
    console.log(`🔗 Keep-alive server running on port ${PORT}`);
    console.log(`🌐 Health check available at: http://localhost:${PORT}/health`);
});

// Start the main bot process
console.log('🚀 Starting ONECTRA Wallet Bot...');
const botProcess = spawn('node', ['bot.js'], {
    stdio: 'inherit',
    env: { ...process.env }
});

// Handle bot process events
botProcess.on('error', (error) => {
    console.error('❌ Bot process error:', error);
});

botProcess.on('exit', (code, signal) => {
    console.log(`⚠️ Bot process exited with code ${code}, signal ${signal}`);
    // Restart the bot if it crashes
    setTimeout(() => {
        console.log('🔄 Restarting bot...');
        const newBotProcess = spawn('node', ['bot.js'], {
            stdio: 'inherit',
            env: { ...process.env }
        });
    }, 5000);
});

// Handle process termination
process.on('SIGINT', () => {
    console.log('🛑 Shutting down keep-alive server and bot...');
    server.close();
    botProcess.kill('SIGINT');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('🛑 Received SIGTERM, shutting down gracefully...');
    server.close();
    botProcess.kill('SIGTERM');
    process.exit(0);
});
