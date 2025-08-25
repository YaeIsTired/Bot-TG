const Account = require('../models/Account');

async function createAnotherTestAccount() {
    try {
        const testAccount = {
            game_type: 'pubg_mobile',
            title: 'PUBG Mobile Conqueror Account',
            description: 'High tier PUBG Mobile account with rare items',
            price: 35.00,
            username: 'ProGamer2024@gmail.com',
            password: 'SuperSecure999',
            level: 85,
            rank: 'Conqueror',
            region: 'asia',
            additional_info: 'Account with mythic outfits and rare weapons',
            is_available: 1,
            is_featured: 0,
            // Account details
            uid: '5123456789',
            player_name: 'ProGamer2024',
            bind_info: 'Facebook + Google',
            country: 'Singapore',
            creation_date: '2023-01-15',
            banned_status: 'Clean',
            account_code: '888999',
            // This will be used for the purchase format
            account_credentials: 'ProGamer2024@gmail.com:SuperSecure999 | Level: 85 | Name: ProGamer2024 | UID: 5123456789 | Rank: Conqueror | Bind: Facebook + Google | Country: Singapore | Date: 2023-01-15 | Banned: Clean',
            // Account information fields
            account_status: 'Premium Active',
            verify_code: 'SMS + Email Verified',
            inactive_status: 'Active Daily',
            collector_status: 'Mega Collector',
            device_info: 'iOS/Android Compatible',
            custom_fields: {
                'Tier': 'Conqueror',
                'K/D Ratio': '4.2',
                'Win Rate': '78%',
                'Mythic Items': '15+',
                'UC Balance': '2,500 UC'
            },
            images: []
        };

        const account = await Account.create(testAccount);
        console.log('✅ Another test account created successfully!');
        console.log('Account ID:', account.id);
        console.log('Title:', account.title);
        console.log('Account Code:', account.getAccountCode());
        console.log('Purchase Format:', account.getPurchaseFormat());
        console.log('Available:', account.is_available);
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Error creating test account:', error);
        process.exit(1);
    }
}

createAnotherTestAccount();
