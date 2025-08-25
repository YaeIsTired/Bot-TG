const sharp = require('sharp');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
let puppeteer;
try {
    puppeteer = require('puppeteer');
} catch (error) {
    console.warn('Puppeteer not available - QR card rendering will be disabled');
    puppeteer = null;
}

async function fetchImageBuffer(url) {
    const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 });
    return Buffer.from(response.data);
}

function createTextOverlaySVG({
    width,
    height,
    companyName,
    amountText
}) {
    const safeCompany = (companyName || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const safeAmount = (amountText || '0.00').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Positions inspired by css/style.css and css/qrcode.css
    // Uses generic fonts to avoid missing font issues on servers.
    return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <style>
    .small { font: 12px sans-serif; fill: #000; font-weight: 400; }
    .medium { font: 18px sans-serif; fill: #000; font-weight: 700; }
    .dotted { stroke: #dadada; stroke-width: 1; stroke-dasharray: 2,4; }
  </style>
  <!-- Header background -->
  <rect x="0" y="0" width="${width}" height="61" fill="#E1232E" rx="20" ry="20" />
  <!-- Mask to keep only top corners rounded for header -->
  <rect x="0" y="61" width="${width}" height="${height - 61}" fill="#fff" />
  <!-- Right wedge triangle similar to .qrcode-container2 -->
  <polygon points="${width - 28},61 ${width},61 ${width - 8},86" fill="#E1232E" />
  <!-- Company name (visually below header) -->
  <text x="19" y="93" class="small"><tspan style="font-weight:700;font-size:13px">${safeCompany} - By CamboPay</tspan></text>
  <!-- Amount line (below name) -->
  <text x="18" y="113" class="medium">$</text>
  <text x="31" y="113" class="medium">${safeAmount}</text>
  <!-- Dotted separator line -->
  <line x1="0" y1="140" x2="${width}" y2="140" class="dotted" />
</svg>`);
}

async function renderKhqrCardImage({ qrImageUrl, amount, companyName }) {
    const cardWidth = 336; // match .body width from style.css
    const cardHeight = 517; // match .body height from style.css

    const khqrLogoPath = path.join(__dirname, '..', 'img', 'khqr logo-200h.png');
    const bankLogosPath = path.join(__dirname, '..', 'img', 'payment_icons-cd5e952dde3b886dea1fd1b983d43ce372f1692dec253808ec654096d2feb701-200h.png');

    const amountText = Number(amount || 0).toFixed(2);

    // Try pixel-perfect HTML render using headless browser first to match qrcode.php
    if (puppeteer) {
        try {
        // Embed assets as data URIs to avoid broken images
        const [khqrLogoBuf, bankLogosBuf, qrBuf] = await Promise.all([
            fs.promises.readFile(khqrLogoPath),
            fs.promises.readFile(bankLogosPath),
            fetchImageBuffer(qrImageUrl)
        ]);
        let usdBuf = null;
        try {
            const usdResp = await axios.get('https://checkout.payway.com.kh/images/usd-khqr-logo.svg', { responseType: 'arraybuffer', timeout: 10000 });
            usdBuf = Buffer.from(usdResp.data);
        } catch (_) { /* ignore */ }

        const khqrLogoDataUrl = `data:image/png;base64,${khqrLogoBuf.toString('base64')}`;
        const bankLogosDataUrl = `data:image/png;base64,${bankLogosBuf.toString('base64')}`;
        const qrDataUrl = `data:image/png;base64,${qrBuf.toString('base64')}`;
        const usdDataUrl = usdBuf ? `data:image/svg+xml;base64,${usdBuf.toString('base64')}` : '';

        const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @font-face { font-family: InterLocal; src: local('Inter'), local('Arial'); }
    body { margin:0; padding:0; background:#fff; font-family: InterLocal, Arial, sans-serif; }
    .body { width: ${cardWidth}px; height: ${cardHeight}px; box-shadow: 0 0 20px 10px rgba(0,0,0,0.12); border-radius: 20px; position: relative; background:#fff; }
    .qrheader { position: absolute; left:0; top:0; width:100%; height:61px; background:#E1232E; border-top-left-radius:20px; border-top-right-radius:20px; z-index:1; }
    .wedge { position:absolute; right:0; top:61px; width:0; height:0; border-right:20px solid #E1232E; border-bottom:25px solid transparent; z-index:1; }
    .logo { position:absolute; top:19px; left:0; right:0; margin:0 auto; width:94px; height:23px; z-index:2; }
    .name { position:absolute; left:19px; top:93px; font-size:12px; font-weight:700; }
    .currency { position:absolute; left:18px; top:113px; font-size:18px; font-weight:700; }
    .amount { position:absolute; left:31px; top:113px; font-size:18px; font-weight:700; }
    .line { position:absolute; left:0; top:140px; width:100%; border-top:1px dotted #dadada; }
    .qrwrap { position:absolute; left:0; right:0; top:165px; width:230px; height:230px; margin:auto; }
    .qr { width:230px; height:230px; }
    .usd { position:absolute; left:50%; top:50%; transform: translate(-50%, -50%); width:40px; height:40px; }
    .banks { position:absolute; left:0; right:0; top:440px; width:96px; height:auto; margin:auto; }
  </style>
  </head>
  <body>
    <div class="body">
      <div class="qrheader"></div>
      <img class="logo" src="${khqrLogoDataUrl}" />
      <div class="wedge"></div>
      <div class="name">${(companyName || 'CHHEANSMM').replace(/</g,'&lt;')} - By CamboPay</div>
      <div class="currency">$</div>
      <div class="amount">${amountText}</div>
      <div class="line"></div>
      <div class="qrwrap">
        <img class="qr" src="${qrDataUrl}" />
        ${usdDataUrl ? `<img class=\"usd\" src=\"${usdDataUrl}\" />` : ''}
      </div>
      <img class="banks" src="${bankLogosDataUrl}" />
    </div>
  </body>
  </html>`;

        const browser = await puppeteer.launch({ args: ['--no-sandbox','--disable-setuid-sandbox'] });
        const page = await browser.newPage();
        await page.setViewport({ width: cardWidth, height: cardHeight, deviceScaleFactor: 2 });
        await page.setContent(html, { waitUntil: 'networkidle0' });
        // Ensure images are decoded before taking screenshot
        await page.evaluate(() => Promise.all(Array.from(document.images).map(img => (img.decode ? img.decode().catch(() => true) : Promise.resolve(true)))));
        const buffer = await page.screenshot({ type: 'png' });
        await browser.close();
        return buffer;
        } catch (e) {
            // Fallback to sharp composition if headless render fails
        }
    }

    // Load base card (white)
    const base = sharp({
        create: {
            width: cardWidth,
            height: cardHeight,
            channels: 4,
            background: { r: 255, g: 255, b: 255, alpha: 1 }
        }
    });

    // Load images
    const [qrBuffer, khqrLogo, bankLogos] = await Promise.all([
        fetchImageBuffer(qrImageUrl),
        sharp(khqrLogoPath).resize(94, 23).png().toBuffer(),
        sharp(bankLogosPath).resize(96).png().toBuffer()
    ]);

    // Try to fetch USD KHQR overlay logo (SVG). If fails, skip.
    let usdLogoBuf = null;
    try {
        const usdSvg = await axios.get('https://checkout.payway.com.kh/images/usd-khqr-logo.svg', { timeout: 10000 });
        usdLogoBuf = Buffer.from(usdSvg.data);
    } catch (_) { /* ignore */ }

    // Prepare QR image resized larger to 230x230
    const qrPng = await sharp(qrBuffer).resize(230, 230, { fit: 'cover' }).png().toBuffer();

    // Composite steps
    const composites = [];

    // Header + texts
    composites.push({ input: headerAndTextsSVG, top: 0, left: 0 });

    // KHQR logo centered in header (61px high area)
    composites.push({ input: khqrLogo, top: Math.round(61 / 2 - 23 / 2), left: Math.round(cardWidth / 2 - 94 / 2) });

    // QR centered below dotted line
    const qrTop = 165; // slightly closer to dotted line
    const qrLeft = Math.round(cardWidth / 2 - 230 / 2);
    composites.push({ input: qrPng, top: qrTop, left: qrLeft });

    // USD KHQR small overlay at center of QR
    if (usdLogoBuf) {
        const usdSize = 40;
        composites.push({ input: usdLogoBuf, top: qrTop + Math.round(200 / 2 - usdSize / 2), left: Math.round(cardWidth / 2 - usdSize / 2) });
    }

    // Bank logos near bottom similar to qrcode.php
    const bankTop = 440;
    composites.push({ input: bankLogos, top: bankTop, left: Math.round(cardWidth / 2 - 96 / 2) });

    const finalBuffer = await base.composite(composites).png().toBuffer();
    return finalBuffer;
}

module.exports = {
    renderKhqrCardImage
};

