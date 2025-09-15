# ONECTRA Wallet Bot

Advanced Telegram bot for real-time tracking of Solana wallet transactions with AI-powered trading signals and professional-grade analytics.

## Features

### Core Functionality
- **Real-time Wallet Tracking**: Monitor up to 3 Solana wallets per user simultaneously
- **Instant Transaction Notifications**: Get immediate alerts for all wallet activities
- **Multi-user Support**: Concurrent tracking for multiple Telegram users
- **Auto-cleanup System**: Intelligent resource management with inactivity monitoring

### Advanced Configuration
- **Latency Optimization**: Low/Standard/High settings for optimal performance
- **Precision Filtering**: Adjustable accuracy levels (90%-99.5%)
- **WebSocket Buffer Management**: Configurable memory allocation (4KB-32KB)
- **Analytics Depth**: Basic to Pro-level transaction analysis
- **Risk Calibration**: Conservative/Moderate/Aggressive risk profiles
- **Signal Sensitivity**: Customizable detection thresholds

### AI Trading Signals (Professional Features)
- **Momentum Analysis**: Price velocity and acceleration pattern detection
- **Volume Spike Detection**: Unusual trading volume pattern identification
- **Pattern Recognition**: Technical analysis pattern detection
- **Sentiment Analysis**: Social media and news sentiment correlation
- **Technical Indicators**: RSI, MACD, Bollinger Bands convergence signals

## Prerequisites

- Node.js 18.x or higher
- NPM package manager
- Telegram Bot Token (from @BotFather)
- Helius API access for Solana network connectivity

## Installation

### Local Development

1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-username/onectra-wallet-bot.git
   cd onectra-wallet-bot
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure bot token**:
   Edit `bot.js` and replace the `BOT_TOKEN` constant with your Telegram bot token:
   ```javascript
   const BOT_TOKEN = 'your-telegram-bot-token-here';
   ```

4. **Run the bot**:
   ```bash
   npm start
   ```

### Replit Deployment

This project is configured for easy deployment on Replit:

1. **Import to Replit**: Click "Import from GitHub" and use this repository URL
2. **Configure Environment**: The included `.replit` and `replit.nix` files handle setup automatically
3. **Update Bot Token**: Modify the `BOT_TOKEN` in `bot.js` with your token
4. **Run**: Click the "Run" button in Replit

## Usage

### Basic Commands

- `/start` - Display main menu with interactive buttons
- `/track <wallet_address>` - Start tracking a Solana wallet
- `/untrack <wallet_address>` - Stop tracking a specific wallet
- `/list` - Show all currently tracked wallets
- `/status` - Check bot connection and WebSocket status
- `/clear` - Remove all bot messages from the chat
- `/help` - Display comprehensive help information

### Advanced Commands

- `/settings` - Access advanced technical configuration panel
- `/signals` - Configure AI trading signals system

### Interactive Features

The bot provides an intuitive interface with:
- **Inline Keyboards**: Quick access to all functions via buttons
- **Real-time Status Updates**: Live connection and tracking information
- **Professional Analytics**: Detailed transaction analysis and metrics
- **Customizable Alerts**: Personalized notification preferences

## Technical Specifications

### Performance Metrics
- **WebSocket Latency**: Sub-100ms average response time
- **Concurrent Users**: Unlimited simultaneous connections
- **Wallet Limit**: 3 wallets per user (configurable)
- **Message Processing**: Real-time with automatic retry logic
- **Memory Usage**: Optimized with automatic cleanup systems

### Architecture
- **Backend**: Node.js with Express-like WebSocket handling
- **Database**: In-memory data structures with persistence options
- **API Integration**: Helius WebSocket for Solana network connectivity
- **Message Queue**: Built-in message tracking and management
- **Error Handling**: Comprehensive error recovery and logging

### Security Features
- **Input Validation**: Strict wallet address validation
- **Rate Limiting**: Built-in protection against spam
- **Resource Management**: Automatic cleanup and memory optimization
- **Token Protection**: Secure token handling and storage

## Configuration

### Environment Variables
Set these in your deployment environment:
- `BOT_TOKEN`: Your Telegram bot token
- `NODE_ENV`: Development/production environment
- `PORT`: Server port (default: auto-detected)

### Advanced Settings
Access via `/settings` command:
- **Latency Optimization**: Network performance tuning
- **Precision Filter**: Transaction accuracy levels
- **Analytics Depth**: Data processing intensity
- **Risk Calibration**: Alert sensitivity configuration

## API Integration

### Helius WebSocket
- **Endpoint**: Configured for Solana mainnet
- **Authentication**: Automatic token management
- **Reconnection**: Intelligent retry logic with exponential backoff
- **Data Processing**: Real-time transaction parsing and formatting

### Telegram Bot API
- **Polling**: Long polling for reliable message delivery
- **Commands**: Full command menu integration
- **Inline Keyboards**: Interactive button interfaces
- **Error Handling**: Automatic retry and fallback systems

## Development

### Project Structure
```
onectra-wallet-bot/
├── bot.js                 # Main bot application
├── websocket-backend.js   # WebSocket connection handler
├── utils/
│   └── Logger.js         # Logging system
├── package.json          # Project dependencies
├── .replit              # Replit configuration
├── replit.nix           # Nix package dependencies
├── .gitignore           # Git ignore rules
└── README.md            # Project documentation
```

### Code Quality
- **ES6+ Standards**: Modern JavaScript syntax and features
- **Modular Architecture**: Separation of concerns with clean interfaces
- **Error Handling**: Comprehensive try-catch blocks and error recovery
- **Logging System**: Detailed logging for debugging and monitoring
- **Code Comments**: Extensive documentation for maintainability

### Testing
```bash
npm test
```

## Deployment

### Production Checklist
1. **Environment Variables**: Configure all required tokens and settings
2. **Security Review**: Verify token protection and input validation
3. **Performance Testing**: Test with maximum expected user load
4. **Monitoring Setup**: Configure logging and error tracking
5. **Backup Strategy**: Implement data persistence if required

### Scaling Considerations
- **Memory Usage**: Monitor and optimize for high user counts
- **API Rate Limits**: Implement proper rate limiting and queuing
- **WebSocket Connections**: Handle connection pooling and management
- **Database Integration**: Consider persistent storage for production

## Troubleshooting

### Common Issues
1. **Bot Not Responding**: Check token configuration and network connectivity
2. **WebSocket Errors**: Verify Helius API access and network stability
3. **Memory Issues**: Review auto-cleanup settings and user limits
4. **Rate Limiting**: Implement proper delays and retry logic

### Debug Mode
Enable detailed logging by modifying the Logger configuration in `utils/Logger.js`.

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Standards
- Follow existing code style and patterns
- Add comprehensive comments for new features
- Test all functionality before submitting
- Update documentation for new features

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For support and questions:
- Create an issue on GitHub
- Check the troubleshooting section above
- Review the comprehensive help system via `/help` command

## Acknowledgments

- Helius API for Solana network connectivity
- Telegram Bot API for messaging infrastructure
- Node.js community for excellent tooling and libraries
