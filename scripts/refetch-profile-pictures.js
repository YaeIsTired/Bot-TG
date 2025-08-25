const TelegramBot = require('node-telegram-bot-api');
const User = require('../models/User');
const { fetchUserProfilePicture, updateUserProfilePicture } = require('../utils/telegram-profile');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function refetchProfilePictures() {
    try {
        console.log('🤖 Initializing Telegram bot for high-quality profile picture fetching...\n');

        // Initialize bot
        const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });

        console.log('📸 Re-fetching profile pictures with better quality...\n');

        // Get all users with existing profile pictures
        const users = await User.getAll(100, 0);
        const usersWithPictures = users.filter(user => user.profile_picture_url);
        
        console.log(`Found ${usersWithPictures.length} users with existing profile pictures`);
        console.log('Deleting old pictures and fetching new high-quality versions...\n');
        
        for (const user of usersWithPictures) {
            console.log(`Re-fetching profile picture for ${user.first_name} (${user.telegram_id})`);
            
            // Delete old profile picture file if it exists
            if (user.profile_picture_url) {
                const oldFilePath = path.join(__dirname, '..', 'public', user.profile_picture_url);
                if (fs.existsSync(oldFilePath)) {
                    fs.unlinkSync(oldFilePath);
                    console.log(`  ✅ Deleted old picture: ${user.profile_picture_url}`);
                }
            }
            
            // Fetch new high-quality profile picture
            const profilePictureUrl = await fetchUserProfilePicture(bot, user.telegram_id, user);
            
            if (profilePictureUrl) {
                await updateUserProfilePicture(User, user.telegram_id, profilePictureUrl);
                console.log(`  ✅ Updated with new high-quality picture: ${profilePictureUrl}`);
            } else {
                console.log(`  ⚠️  No profile picture available for this user`);
                // Clear the profile picture URL from database
                await updateUserProfilePicture(User, user.telegram_id, null);
            }
            
            console.log('');
            
            // Add delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 1500));
        }
        
        console.log('🎉 Profile picture re-fetching completed!');
        console.log('');
        console.log('📝 What was done:');
        console.log('✅ Deleted old low-quality profile pictures');
        console.log('✅ Fetched new high-resolution versions from Telegram');
        console.log('✅ Updated database with new picture URLs');
        console.log('✅ Improved image quality and rendering');
        console.log('');
        console.log('🎨 Visual improvements:');
        console.log('✅ Larger avatar size (80x80px instead of 60x60px)');
        console.log('✅ Better image rendering and anti-aliasing');
        console.log('✅ Highest quality images from Telegram API');
        console.log('✅ Smooth hover effects and transitions');
        console.log('');
        console.log('🧪 To test:');
        console.log('1. Go to http://localhost:3000/admin/users');
        console.log('2. Check that profile pictures are now crisp and clear');
        console.log('3. Hover over avatars to see smooth scaling effect');
        console.log('4. Developer card should have special golden styling');

        process.exit(0);
    } catch (error) {
        console.error('❌ Error re-fetching profile pictures:', error);
        process.exit(1);
    }
}

refetchProfilePictures();
