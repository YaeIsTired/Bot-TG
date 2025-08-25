const Account = require('../models/Account');

async function createAvailableAccount() {
    try {
        const testAccount = {
            game_type: 'league_of_legends',
            title: 'League of Legends Diamond Account',
            description: 'High-rank LoL account with rare skins and champions',
            price: 25.00,
            username: 'player.champion@gmail.com',
            password: 'SecurePass123',
            level: 150,
            rank: 'Diamond 3',
            region: 'eu',
            additional_info: 'Account has all champions unlocked and many rare skins',
            is_available: 1,
            is_featured: 0,
            // New fields for gaming account showcase
            uid: '87654321',
            player_name: 'ChampionMaster',
            bind_info: 'Phone + Email',
            country: 'Germany',
            creation_date: '2022-08-20',
            banned_status: 'No',
            account_code: '445566',
            custom_fields: {
                'Champions Owned': '161/161',
                'Skins Count': '45',
                'Ranked Points': '1,850 LP'
            },
            images: []
        };

        const account = await Account.create(testAccount);
        console.log('✅ Available test account created successfully!');
        console.log('Account ID:', account.id);
        console.log('Title:', account.title);
        console.log('Available:', account.is_available);
        console.log('Purchase Format:', account.getPurchaseFormat());
        console.log('Account Code:', account.getAccountCode());
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Error creating available test account:', error);
        process.exit(1);
    }
}

createAvailableAccount();
