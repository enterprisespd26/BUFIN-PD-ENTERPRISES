const crypto = require('crypto');
const https = require('https');

function getCredentials() {
  let cloudName = process.env.CLOUDINARY_CLOUD_NAME || '';
  let apiKey = process.env.CLOUDINARY_API_KEY || '';
  let apiSecret = process.env.CLOUDINARY_API_SECRET || '';

  if (process.env.CLOUDINARY_URL) {
    try {
      const parsed = new URL(process.env.CLOUDINARY_URL);
      if (parsed.username) apiKey = decodeURIComponent(parsed.username);
      if (parsed.password) apiSecret = decodeURIComponent(parsed.password);
      if (parsed.hostname) cloudName = parsed.hostname;
    } catch (e) {
      console.error('Failed to parse CLOUDINARY_URL:', e.message);
    }
  }

  return { cloudName, apiKey, apiSecret };
}

function isConfigured() {
  const { cloudName, apiKey, apiSecret } = getCredentials();
  return Boolean(cloudName && apiKey && apiSecret);
}

function uploadToCloudinary(base64Data, folder = 'bufin/bills') {
  return new Promise((resolve, reject) => {
    if (!isConfigured()) {
      const err = new Error('Cloudinary service is not configured. Missing required environment variables.');
      err.status = 503;
      return reject(err);
    }

    const { cloudName, apiKey, apiSecret } = getCredentials();
    const timestamp = Math.floor(Date.now() / 1000);
    // Cloudinary requires signing sorted parameters alphabetically
    const toSign = `folder=${folder}&timestamp=${timestamp}${apiSecret}`;
    const signature = crypto.createHash('sha1').update(toSign).digest('hex');

    const payload = JSON.stringify({
      file: base64Data,
      api_key: apiKey,
      timestamp,
      folder,
      signature
    });

    const options = {
      hostname: 'api.cloudinary.com',
      port: 443,
      path: `/v1_1/${cloudName}/auto/upload`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({
              ok: true,
              url: json.secure_url || json.url,
              public_id: json.public_id,
              format: json.format,
              bytes: json.bytes,
              created_at: json.created_at
            });
          } else {
            const err = new Error(json.error?.message || `Cloudinary upload error (${res.statusCode})`);
            err.status = res.statusCode >= 500 ? 502 : res.statusCode;
            reject(err);
          }
        } catch (err) {
          const e = new Error('Invalid response from Cloudinary: ' + data.slice(0, 100));
          e.status = 502;
          reject(e);
        }
      });
    });

    req.on('error', err => reject(err));
    req.write(payload);
    req.end();
  });
}

function getConfig() {
  const { cloudName } = getCredentials();
  return {
    configured: isConfigured(),
    cloudName: cloudName || ''
  };
}

module.exports = {
  isConfigured,
  uploadToCloudinary,
  getConfig
};
