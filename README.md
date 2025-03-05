# Telegram Tournament Bot

A comprehensive Telegram bot for managing BGMI & Ludo tournaments, built with Node.js, Telegraf, and Supabase.

## Features

### Basic Features
- `/start` → Shows a welcome message & menu options
- `/register` → Allows users to register for tournaments
- `/tournaments` → Lists upcoming BGMI & Ludo tournaments
- `/join <tournament_id>` → Registers user for a specific tournament
- `/roomid` → Shares Room ID & password before match starts
- `/withdraw` → Users can request withdrawals if they win
- `/help` → Shows all available commands

### Tournament Management
- Admin commands for tournament management
- Tournament details include entry fee, timings, prize distribution, and room ID
- Users can check registration status with `/mytournaments`

### Payment Handling
- Wallet system for managing user funds
- UPI payment support
- Withdrawal processing

### Admin Panel
- Protected admin commands
- Tournament creation, editing, and deletion
- Room ID management
- Withdrawal approval

### User Interaction & Notifications
- Automatic reminders before match start
- Tournament updates via bot messages
- Notifications for registrations, room IDs, and withdrawals

### Data Storage & Security
- PostgreSQL database via Supabase
- Secure admin access

## Setup

1. Create a Telegram bot via BotFather and get your bot token
2. Set up a Supabase project and get your URL and API key
3. Set the following environment variables:
   - `TELEGRAM_BOT_TOKEN`: Your Telegram bot token
   - `SUPABASE_URL`: Your Supabase project URL
   - `SUPABASE_KEY`: Your Supabase API key
4. Run the SQL schema in `supabase/schema.sql` to set up your database tables
5. Install dependencies: `npm install`
6. Start the bot: `npm start`

## Deployment

The bot can be deployed on:
- Railway.app
- Render
- VPS
- AWS
- Google Cloud

Use PM2 to keep the bot running:

