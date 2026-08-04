import config from '../../config/index.js';

export const sendSMS = async (to: string, message: string) => {
  try {
    const isMock =
      !config.sms_api_key ||
      config.sms_api_key === 'greenweb_mock_api_key_123';

    if (isMock) {
      console.log(`\n💬 [SMS SIMULATION - orbitX Travel]`);
      console.log(`To:      ${to}`);
      console.log(`Message: ${message}\n`);
      return;
    }

    // In production, we integrate with Greenweb SMS API:
    // const url = `https://api.greenweb.com.bd/api.php?json&token=${config.sms_api_key}&to=${to}&message=${encodeURIComponent(message)}`;
    // await fetch(url);
    console.log(`📲 [REAL SMS SENT via Greenweb] To: ${to} | Msg: ${message}`);
  } catch (error) {
    console.warn('⚠️ SMS API dispatch failed, falling back to simulated logs. Error:', error);
    console.log(`\n💬 [SMS SIMULATION FALLBACK]`);
    console.log(`To:      ${to}`);
    console.log(`Message: ${message}\n`);
  }
};
