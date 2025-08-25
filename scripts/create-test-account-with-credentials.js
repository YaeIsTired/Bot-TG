const Account = require('../models/Account');

async function createTestAccountWithCredentials() {
    try {
        const testAccount = {
            game_type: 'mobile_legends',
            title: 'Mobile Legends Bang Bang Account',
            description: 'High level ML account with good stats',
            price: 15.00,
            username: 'Zittuhanafi05@gmail.com',
            password: 'Zittu12345',
            level: 177,
            rank: 'N/A',
            region: 'asia',
            additional_info: 'Account with good performance',
            is_available: 1,
            is_featured: 1,
            // Account details in the format you specified
            uid: '99648366',
            player_name: 'N/A',
            bind_info: 'N/A',
            country: 'N/A',
            creation_date: 'N/A',
            banned_status: 'N/A',
            account_code: '794635',
            // This will be used for the purchase format
            account_credentials: 'Zittuhanafi05@gmail.com:Zittu12345 | Level: 177 | Name: N/A | UID: 99648366 | Rank: N/A | Bind: N/A | Country: N/A | Date: N/A | Banned: N/A',
            // Account information fields
            account_status: 'Active',
            verify_code: 'Available',
            inactive_status: 'No',
            collector_status: 'Expert Collector',
            device_info: 'Android/iOS Compatible',
            custom_fields: {
                'Heroes Owned': '120+',
                'Skins Count': '25',
                'Rank Points': '2,500 Points'
            },
            images: []
        };

        const account = await Account.create(testAccount);
        console.log('✅ Test account with credentials created successfully!');
        console.log('Account ID:', account.id);
        console.log('Title:', account.title);
        console.log('Account Code:', account.getAccountCode());
        console.log('Purchase Format:', account.getPurchaseFormat());
        console.log('Available:', account.is_available);
        console.log('Featured:', account.is_featured);
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Error creating test account:', error);
        process.exit(1);
    }
}

createTestAccountWithCredentials();
