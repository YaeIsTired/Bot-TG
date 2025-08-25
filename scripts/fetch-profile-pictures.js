const TelegramBot = require('node-telegram-bot-api');
const User = require('../models/User');
const { fetchMissingProfilePictures } = require('../utils/telegram-profile');
require('dotenv').config();

async function fetchProfilePictures() {
    try {
        console.log('🤖 Initializing Telegram bot for profile picture fetching...\n');

        // Initialize bot
        const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });

        console.log('📸 Starting profile picture fetch process...\n');

        // Fetch missing profile pictures
        await fetchMissingProfilePictures(bot, User);

        console.log('\n🎉 Profile picture fetching completed!');
        console.log('');
        console.log('📝 What was done:');
        console.log('✅ Checked all users in database');
        console.log('✅ Fetched profile pictures from Telegram API');
        console.log('✅ Saved pictures to public/profile-pictures/');
        console.log('✅ Updated user records with profile picture URLs');
        console.log('');
        console.log('🔗 Profile pictures are now available at:');
        console.log('   http://localhost:3000/public/profile-pictures/[filename]');
        console.log('');
        console.log('🎯 Next steps:');
        console.log('1. Go to http://localhost:3000/admin/users');
        console.log('2. Check that profile pictures are displayed');
        console.log('3. Profile pictures will auto-update when users interact with bot');

        process.exit(0);
    } catch (error) {
        console.error('❌ Error fetching profile pictures:', error);
        process.exit(1);
    }
}

fetchProfilePictures();
