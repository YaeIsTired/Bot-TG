const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🌐 Setting up custom domain for Account Bot...\n');

// Windows hosts file path
const hostsPath = 'C:\\Windows\\System32\\drivers\\etc\\hosts';

// Custom domains to add
const domains = [
    'accountbot.local',
    'admin.accountbot.local',
    'bot.accountbot.local'
];

function setupCustomDomain() {
    try {
        console.log('📝 Reading current hosts file...');
        
        // Read current hosts file
        let hostsContent = '';
        try {
            hostsContent = fs.readFileSync(hostsPath, 'utf8');
        } catch (error) {
            console.log('⚠️  Could not read hosts file. You may need to run as Administrator.');
            console.log('📋 Manual setup instructions:');
            console.log('1. Open Notepad as Administrator');
            console.log('2. Open file: C:\\Windows\\System32\\drivers\\etc\\hosts');
            console.log('3. Add these lines at the end:');
            domains.forEach(domain => {
                console.log(`   127.0.0.1    ${domain}`);
            });
            console.log('4. Save the file');
            console.log('5. Restart your browser\n');
            return;
        }

        // Check if domains already exist
        const existingDomains = domains.filter(domain => 
            hostsContent.includes(domain)
        );

        if (existingDomains.length === domains.length) {
            console.log('✅ All custom domains already configured!');
            console.log('🌐 You can access your admin panel at:');
            domains.forEach(domain => {
                console.log(`   http://${domain}:3000/admin`);
            });
            return;
        }

        // Add missing domains
        const newEntries = domains
            .filter(domain => !hostsContent.includes(domain))
            .map(domain => `127.0.0.1    ${domain}`)
            .join('\n');

        const updatedContent = hostsContent + '\n\n# Account Bot Custom Domains\n' + newEntries + '\n';

        // Try to write to hosts file
        try {
            fs.writeFileSync(hostsPath, updatedContent);
            console.log('✅ Custom domains added successfully!');
            console.log('🌐 You can now access your admin panel at:');
            domains.forEach(domain => {
                console.log(`   http://${domain}:3000/admin`);
            });
            console.log('\n🔄 Please restart your browser to apply changes.');
        } catch (error) {
            console.log('❌ Could not write to hosts file. Administrator privileges required.');
            console.log('📋 Manual setup instructions:');
            console.log('1. Open Notepad as Administrator');
            console.log('2. Open file: C:\\Windows\\System32\\drivers\\etc\\hosts');
            console.log('3. Add these lines at the end:');
            domains.forEach(domain => {
                console.log(`   127.0.0.1    ${domain}`);
            });
            console.log('4. Save the file');
            console.log('5. Restart your browser\n');
        }

    } catch (error) {
        console.error('❌ Error setting up custom domain:', error.message);
    }
}

function createDesktopShortcut() {
    try {
        console.log('🖥️  Creating desktop shortcut...');
        
        const shortcutContent = `[InternetShortcut]
URL=http://accountbot.local:3000/admin
IconFile=C:\\Windows\\System32\\shell32.dll
IconIndex=13`;

        const desktopPath = path.join(require('os').homedir(), 'Desktop');
        const shortcutPath = path.join(desktopPath, 'Account Bot Admin.url');
        
        fs.writeFileSync(shortcutPath, shortcutContent);
        console.log('✅ Desktop shortcut created: Account Bot Admin.url');
        
    } catch (error) {
        console.log('⚠️  Could not create desktop shortcut:', error.message);
    }
}

function createBatchFile() {
    try {
        console.log('📄 Creating quick launch batch file...');
        
        const batchContent = `@echo off
title Account Bot Admin Panel
echo 🚀 Starting Account Bot...
echo.
echo 🌐 Admin Panel will be available at:
echo    http://accountbot.local:3000/admin
echo    http://localhost:3000/admin
echo.
echo 📱 Press Ctrl+C to stop the server
echo.
cd /d "${process.cwd()}"
npm start
pause`;

        fs.writeFileSync('start-accountbot.bat', batchContent);
        console.log('✅ Created start-accountbot.bat');
        console.log('   Double-click this file to start the bot with custom domain');
        
    } catch (error) {
        console.log('⚠️  Could not create batch file:', error.message);
    }
}

// Run setup
console.log('🔧 Account Bot Domain Setup\n');
setupCustomDomain();
createDesktopShortcut();
createBatchFile();

console.log('\n🎉 Setup complete!');
console.log('📋 Next steps:');
console.log('1. Restart your browser');
console.log('2. Use: http://accountbot.local:3000/admin');
console.log('3. Or double-click: start-accountbot.bat');
