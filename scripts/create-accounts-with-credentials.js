const Account = require('../models/Account');

async function createAccountsWithCredentials() {
    try {
        console.log('🧪 Creating accounts with complete credential information...\n');

        const testAccounts = [
            {
                game_type: 'Valorant',
                title: 'Valorant Radiant Account - Full Credentials',
                description: 'High-level Valorant account with complete login information',
                price: 25.00,
                status: 'available',
                username: 'valorant_pro_2024',
                password: 'SecurePass123!',
                account_code: 'VAL-RAD-001',
                account_credentials: 'valorant_pro_2024:SecurePass123! | Level: 150 | Rank: Radiant | Region: NA | UID: 12345678 | Bind: Email verified | Country: USA | Created: 2023-01-15 | Status: Clean',
                level: '150',
                rank: 'Radiant',
                region: 'NA',
                uid: '12345678'
            },
            {
                game_type: 'CS:GO',
                title: 'CS:GO Global Elite - Premium Account',
                description: 'CS:GO Global Elite account with skins and achievements',
                price: 30.00,
                status: 'available',
                username: 'csgo_elite_user',
                password: 'MyPassword456#',
                account_code: 'CSGO-GE-002',
                account_credentials: 'csgo_elite_user:MyPassword456# | Rank: Global Elite | Hours: 2500+ | Prime: Yes | Skins: $500+ | Trust Factor: High | Region: EU | Steam Level: 45',
                level: '45',
                rank: 'Global Elite',
                region: 'EU'
            },
            {
                game_type: 'League of Legends',
                title: 'LoL Challenger Account - Korea Server',
                description: 'League of Legends Challenger account on Korean server',
                price: 35.00,
                status: 'available',
                username: 'lol_challenger_kr',
                password: 'KoreanChamp789$',
                account_code: 'LOL-CH-003',
                account_credentials: 'lol_challenger_kr:KoreanChamp789$ | Rank: Challenger 450LP | Server: Korea | Champions: All unlocked | Skins: 150+ | Blue Essence: 50k+ | RP: 2500',
                level: '300',
                rank: 'Challenger',
                region: 'KR'
            },
            {
                game_type: 'Apex Legends',
                title: 'Apex Predator Account - Season 18',
                description: 'Apex Legends Predator rank with rare skins',
                price: 28.00,
                status: 'available',
                username: 'apex_predator_s18',
                password: 'PredatorRank2024!',
                account_code: 'APEX-PRED-004',
                level: '500',
                rank: 'Predator',
                region: 'NA'
            },
            {
                game_type: 'Overwatch',
                title: 'Overwatch Grandmaster Tank Main',
                description: 'Overwatch Grandmaster account specializing in tank role',
                price: 22.00,
                status: 'available',
                username: 'ow_tank_gm',
                password: 'TankMain2024@',
                account_code: 'OW-GM-005',
                account_credentials: 'ow_tank_gm:TankMain2024@ | Rank: Grandmaster 4100SR | Role: Tank Main | Heroes: All unlocked | Competitive Points: 6000+ | Golden Weapons: 5',
                level: '2500',
                rank: 'Grandmaster',
                region: 'NA'
            }
        ];

        console.log('📝 Creating accounts with credentials...');
        for (let i = 0; i < testAccounts.length; i++) {
            const account = await Account.create(testAccounts[i]);
            console.log(`✅ Created: ${account.title}`);
            console.log(`   - Account Code: ${account.account_code}`);
            console.log(`   - Username: ${account.username}`);
            console.log(`   - Password: ${account.password}`);
            if (account.account_credentials) {
                console.log(`   - Full Credentials: ${account.account_credentials.substring(0, 50)}...`);
            }
            console.log('');
        }

        console.log('🎯 Accounts with credentials created successfully!');
        console.log('');
        console.log('📋 What should now be visible on accounts page:');
        console.log('');
        console.log('🔑 Credentials Section (Blue box):');
        console.log('✅ Account Code: Unique identifier (e.g., VAL-RAD-001)');
        console.log('✅ Login: Username:Password format (e.g., valorant_pro_2024:SecurePass123!)');
        console.log('✅ Full Credentials: Complete account information');
        console.log('');
        console.log('🎨 Visual Features:');
        console.log('✅ Blue-themed credentials box (matches design)');
        console.log('✅ Monospace font for easy reading');
        console.log('✅ Click to copy functionality');
        console.log('✅ Copy icons that highlight on hover');
        console.log('✅ Color-coded values (orange for codes, green for logins)');
        console.log('');
        console.log('🖱️ Interactive Features:');
        console.log('✅ Click any credential value to copy to clipboard');
        console.log('✅ Success notification when copied');
        console.log('✅ Hover effects for better UX');
        console.log('');
        console.log('🧪 To test:');
        console.log('1. Go to http://localhost:3000/admin/accounts');
        console.log('2. Look for blue "Account Credentials" sections');
        console.log('3. Click on any credential value to copy it');
        console.log('4. Check that all credential types are displayed');
        console.log('5. Verify copy functionality works');
        console.log('');
        console.log('🎉 Account credentials are now fully visible and copyable!');

        process.exit(0);
    } catch (error) {
        console.error('❌ Error creating accounts with credentials:', error);
        process.exit(1);
    }
}

createAccountsWithCredentials();
