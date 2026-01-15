# SMS Notifications Setup Guide

## Overview

The AI-Mediator platform now supports SMS notifications using Twilio. Users will receive text messages for critical events such as:

- **New Dispute Filed** - Notifies respondent immediately
- **Dispute Accepted** - Notifies plaintiff
- **AI Analysis Complete** - Alerts both parties to review solutions
- **Signature Required** - Prompts for digital signature
- **Resolution Approved** - Confirms case closure
- **Court Forwarding** - Informs parties of escalation
- **2FA Codes** - Authentication tokens

---

## Setup Instructions

### 1. Create a Twilio Account

1. Visit [https://www.twilio.com/try-twilio](https://www.twilio.com/try-twilio)
2. Sign up for a free trial account
3. Verify your email and phone number

### 2. Get Your Twilio Credentials

1. Go to the [Twilio Console](https://console.twilio.com/)
2. Find your **Account SID** and **Auth Token** on the dashboard
3. Get a Twilio phone number:
   - Navigate to **Phone Numbers** → **Manage** → **Buy a number**
   - Choose a number with SMS capability
   - Complete the purchase (free on trial)

### 3. Configure Environment Variables

Add these variables to your `.env` file in the `backend` directory:

```env
# SMS Notifications (Twilio)
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+1234567890
```

**Important Notes:**
- Use the **E.164 format** for phone numbers (`+<country_code><number>`)
- Example: US number `+15551234567`, India number `+919876543210`
- Trial accounts can only send SMS to verified phone numbers

### 4. Verify Phone Numbers (Trial Account Only)

If you're using a free trial:

1. Go to **Phone Numbers** → **Manage** → **Verified Caller IDs**
2. Click **Add a new number**
3. Enter the phone number and verify via SMS code

**Production:** Once you upgrade your Twilio account, you can send to any number.

### 5. Test the Integration

Start your backend server:

```bash
cd backend
npm run dev
```

You should see:
```
✅ Twilio SMS service initialized successfully
```

---

## Phone Number Format

All phone numbers in the database must use **E.164 format**:

- **Format:** `+[country code][number]`
- **Examples:**
  - USA: `+15551234567`
  - India: `+919876543210`
  - UK: `+447911123456`

Users can update their phone number in the Profile settings.

---

## SMS Message Examples

### New Dispute Notification
```
[AI Mediator] LEGAL NOTICE: John Doe has filed a dispute against you.

Case ID: #123
Title: Contract Breach

Please login to respond within 7 days.

Visit: http://localhost:5173
```

### AI Analysis Complete
```
[AI Mediator] AI analysis complete for Case #123.

3 solutions proposed. Please review and vote.

Login to view: http://localhost:5173/disputes/123
```

### Signature Required
```
[AI Mediator] Jane Smith has signed the settlement agreement for Case #123.

Your signature is required to finalize the resolution.

Login to sign now.
```

---

## Rate Limits

### Trial Account:
- **1 message per second**
- Limited to verified numbers only
- $15 free credit (~500 messages)

### Production Account:
- **100+ messages per second**
- Send to any valid number
- Pay-as-you-go pricing (~$0.0075 per SMS in USA)

---

## Troubleshooting

### SMS Not Sending

**Check 1: Credentials**
```bash
# Verify in logs:
✅ Twilio SMS service initialized successfully
```

**Check 2: Phone Number Format**
```javascript
// Must start with '+'
const validNumber = '+15551234567';  // ✓ Correct
const invalidNumber = '5551234567';   // ✗ Wrong
```

**Check 3: Trial Account Verification**
- Ensure recipient number is verified in Twilio console

### Error: "The number +1234567890 is unverified"

**Solution:** Add the number to Verified Caller IDs in Twilio Console

### Error: "Authenticate"

**Solution:** Check that `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` are correct

---

## Pricing

| Plan | Cost | Features |
|------|------|----------|
| **Trial** | Free ($15 credit) | Verified numbers only, 1 msg/sec |
| **Pay-as-you-go** | ~$0.0075/SMS | Any number, high throughput |
| **Volume** | Contact Twilio | Bulk discounts available |

[View Twilio Pricing](https://www.twilio.com/sms/pricing)

---

## Disabling SMS

If you don't want SMS notifications, simply don't set the Twilio environment variables. The system will automatically disable SMS and only send in-app + email notifications.

---

## Advanced Configuration

### Custom Message Templates

Edit `/backend/src/services/smsService.js` to customize messages:

```javascript
export const sendDisputeCreatedSMS = async (phoneNumber, disputeId, plaintiffName, disputeTitle) => {
    const message = `Your custom message here...`;
    return await sendSMS(phoneNumber, message);
};
```

### Bulk SMS with Rate Limiting

The service includes automatic rate limiting for bulk sends:

```javascript
await smsService.sendBulkSMS([
    { to: '+15551234567', message: 'Message 1' },
    { to: '+919876543210', message: 'Message 2' }
]);
```

---

## Support

- **Twilio Docs:** [https://www.twilio.com/docs/sms](https://www.twilio.com/docs/sms)
- **Console:** [https://console.twilio.com/](https://console.twilio.com/)
- **Support:** [https://support.twilio.com/](https://support.twilio.com/)
