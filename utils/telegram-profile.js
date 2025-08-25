const fs = require('fs');
const path = require('path');
const https = require('https');

/**
 * Fetch and save Telegram user profile picture
 * @param {Object} bot - Telegram bot instance
 * @param {number} userId - Telegram user ID
 * @param {Object} user - User object with first_name for filename
 * @returns {Promise<string|null>} - URL to saved profile picture or null
 */
async function fetchUserProfilePicture(bot, userId, user) {
    try {
        // Get user profile photos with higher limit to get better quality
        const photos = await bot.getUserProfilePhotos(userId, { limit: 1, offset: 0 });

        if (!photos.photos || photos.photos.length === 0) {
            console.log(`No profile photos found for user ${userId}`);
            return null;
        }

        // Get the best size for display (around 160-320px for crisp rendering at 120px display)
        const photo = photos.photos[0];

        // Find the best size for our display needs (120px display size)
        // We want around 160-320px source for crisp 120px display
        const idealSize = 240; // Target size for optimal quality at 120px display

        let bestPhoto = photo[0]; // Default to first available
        let bestScore = Infinity;

        for (const size of photo) {
            // Calculate how close this size is to our ideal
            const sizeDiff = Math.abs(size.width - idealSize);

            // Prefer sizes that are larger than our display but not too large
            let score = sizeDiff;
            if (size.width < 120) {
                score += 1000; // Heavily penalize sizes smaller than display
            } else if (size.width > 640) {
                score += (size.width - 640) * 2; // Penalize very large sizes
            }

            if (score < bestScore) {
                bestScore = score;
                bestPhoto = size;
            }
        }

        const selectedPhoto = bestPhoto;

        console.log(`Selected photo size: ${selectedPhoto.width}x${selectedPhoto.height}, file_size: ${selectedPhoto.file_size || 'unknown'} (optimized for 120px display)`)

        // Get file info
        const file = await bot.getFile(selectedPhoto.file_id);
        const fileUrl = `https://api.telegram.org/file/bot${bot.token}/${file.file_path}`;

        // Create profile pictures directory if it doesn't exist
        const profilePicsDir = path.join(__dirname, '..', 'public', 'profile-pictures');
        if (!fs.existsSync(profilePicsDir)) {
            fs.mkdirSync(profilePicsDir, { recursive: true });
        }

        // Generate filename
        const fileExtension = path.extname(file.file_path) || '.jpg';
        const fileName = `${userId}_${user.first_name || 'user'}_${Date.now()}${fileExtension}`;
        const filePath = path.join(profilePicsDir, fileName);

        // Download and save the image
        await downloadImage(fileUrl, filePath);

        // Return the public URL
        const publicUrl = `/profile-pictures/${fileName}`;
        console.log(`✅ Profile picture saved for user ${userId}: ${publicUrl}`);
        return publicUrl;

    } catch (error) {
        console.error(`❌ Error fetching profile picture for user ${userId}:`, error);
        return null;
    }
}

/**
 * Download image from URL and save to file
 * @param {string} url - Image URL
 * @param {string} filePath - Local file path to save
 * @returns {Promise<void>}
 */
function downloadImage(url, filePath) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(filePath);
        
        https.get(url, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download image: ${response.statusCode}`));
                return;
            }

            response.pipe(file);

            file.on('finish', () => {
                file.close();
                resolve();
            });

            file.on('error', (err) => {
                fs.unlink(filePath, () => {}); // Delete the file on error
                reject(err);
            });
        }).on('error', (err) => {
            reject(err);
        });
    });
}

/**
 * Update user profile picture in database
 * @param {Object} User - User model class
 * @param {number} userId - Telegram user ID
 * @param {string} profilePictureUrl - URL to profile picture
 * @returns {Promise<void>}
 */
async function updateUserProfilePicture(User, userId, profilePictureUrl) {
    try {
        const user = await User.getByTelegramId(userId);
        if (user) {
            user.profile_picture_url = profilePictureUrl;
            await user.save();
            console.log(`✅ Updated profile picture for user ${userId}`);
        }
    } catch (error) {
        console.error(`❌ Error updating profile picture for user ${userId}:`, error);
    }
}

/**
 * Fetch profile pictures for all users who don't have one
 * @param {Object} bot - Telegram bot instance
 * @param {Object} User - User model class
 * @returns {Promise<void>}
 */
async function fetchMissingProfilePictures(bot, User) {
    try {
        console.log('🔄 Fetching missing profile pictures...');
        
        // Get users without profile pictures
        const users = await User.getAll(100, 0); // Get first 100 users
        const usersWithoutPictures = users.filter(user => !user.profile_picture_url);
        
        console.log(`Found ${usersWithoutPictures.length} users without profile pictures`);
        
        for (const user of usersWithoutPictures) {
            console.log(`Fetching profile picture for ${user.first_name} (${user.telegram_id})`);
            
            const profilePictureUrl = await fetchUserProfilePicture(bot, user.telegram_id, user);
            
            if (profilePictureUrl) {
                await updateUserProfilePicture(User, user.telegram_id, profilePictureUrl);
            }
            
            // Add delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        console.log('✅ Finished fetching profile pictures');
    } catch (error) {
        console.error('❌ Error fetching missing profile pictures:', error);
    }
}

module.exports = {
    fetchUserProfilePicture,
    updateUserProfilePicture,
    fetchMissingProfilePictures
};
