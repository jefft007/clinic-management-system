// =====================================================
// SMS SERVICE
// =====================================================
// Thin wrapper so the OTP flow doesn't care which SMS
// provider is behind it. Wire up a real provider by setting
// the matching env vars — until then it logs to the console
// so local/dev testing works with zero setup.
//
// To enable MSG91 (common for Indian phone numbers):
//   MSG91_AUTH_KEY=...
//   MSG91_TEMPLATE_ID=...
//   MSG91_SENDER_ID=...
//
// To enable Twilio instead:
//   TWILIO_ACCOUNT_SID=...
//   TWILIO_AUTH_TOKEN=...
//   TWILIO_FROM_NUMBER=...
// =====================================================

const sendOtpSms = async (phone, otp) => {
    const message = `Your verification code is ${otp}. It expires in 5 minutes.`;

    if (process.env.MSG91_AUTH_KEY && process.env.MSG91_TEMPLATE_ID) {
        const params = new URLSearchParams({
            authkey: process.env.MSG91_AUTH_KEY,
            mobiles: phone,
            template_id: process.env.MSG91_TEMPLATE_ID,
            otp
        });

        const response = await fetch(`https://control.msg91.com/api/v5/otp?${params.toString()}`);
        const data = await response.json().catch(() => ({}));
        console.log("MSG91 OTP send response:", data);
        return { provider: "msg91", sent: true };
    }

    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

        const body = new URLSearchParams({
            To: phone,
            From: process.env.TWILIO_FROM_NUMBER,
            Body: message
        });

        const response = await fetch(
            `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
            {
                method: "POST",
                headers: {
                    Authorization: `Basic ${auth}`,
                    "Content-Type": "application/x-www-form-urlencoded"
                },
                body
            }
        );
        const data = await response.json().catch(() => ({}));
        console.log("Twilio OTP send response:", data);
        return { provider: "twilio", sent: true };
    }

    // Dev fallback — no provider configured.
    console.log(`[DEV SMS] OTP for ${phone}: ${otp}`);
    return { provider: "console", sent: true };
};

module.exports = {
    sendOtpSms
};
