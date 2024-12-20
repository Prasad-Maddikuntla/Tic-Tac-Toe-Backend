import os from 'os';
import https from 'https';

export const getLocalIP = () => {
  const networkInterfaces = os.networkInterfaces();
  for (const interfaceName in networkInterfaces) {
    for (const iface of networkInterfaces[interfaceName] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  throw new Error('Unable to determine local IP address');
};

export const getPublicIP = () => {
  return new Promise((resolve, reject) => {
    const request = https.get('https://api.ipify.org?format=json', (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const { ip } = JSON.parse(data);
          resolve(ip);
        } catch (error) {
          reject('Error parsing public IP response');
        }
      });
    });

    request.on('error', (err) => {
      reject('Error fetching public IP');
    });

    request.setTimeout(5000, () => {
      request.abort();
      reject('Request timed out while fetching public IP');
    });
  });
};

// if (require.main === module) {
//   (async () => {
//     const localIP = getLocalIP();
//     try {
//       const publicIP = await getPublicIP();
//       console.log('Local IP Address:', localIP);
//       console.log('Public IP Address:', publicIP);
//     } catch (error) {
//       console.error('Error retrieving public IP:', error);
//     }
//   })();
// }
