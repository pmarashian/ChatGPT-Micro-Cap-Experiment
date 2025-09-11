# Email Testing Guide

## Overview

The test email endpoint allows you to verify that your SES (Simple Email Service) configuration is working correctly before relying on it for production email alerts and reports.

## API Endpoint

### POST /api/test-email

**Purpose**: Send a test email to verify SES configuration

**Parameters**:

- `recipient` (optional): Email address to send test to. If not provided, uses `ADMIN_EMAIL` from environment variables.

**Example Requests**:

```bash
# Send to default admin email
curl -X POST "https://your-api.com/api/test-email"

# Send to custom recipient
curl -X POST "https://your-api.com/api/test-email?recipient=test@example.com"
```

**Success Response**:

```json
{
  "success": true,
  "message": "Test email sent successfully",
  "details": {
    "messageId": "010001234567890a-12345678-90ab-cdef-1234-567890abcdef-000000",
    "recipient": "admin@example.com",
    "sender": "noreply@example.com",
    "subject": "Test Email - Trading System",
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```

## Usage Examples

### 1. Local Testing (with serverless offline)

```bash
# Start local serverless environment
npm run offline

# In another terminal, test email
npm run test-email
# or
node test-email.js
```

### 2. Custom Recipient Testing

```bash
# Test with specific email address
node test-email.js your-email@example.com
```

### 3. Production Testing

```bash
# Set API URL for deployed environment
export API_BASE_URL=https://your-api-id.execute-api.us-east-1.amazonaws.com/dev

# Test email
npm run test-email
```

## Test Email Content

The test email includes:

- ✅ Verification that SES is configured correctly
- ✅ Confirmation of sender/recipient addresses
- ✅ Timestamp of the test
- ✅ System status information

## Prerequisites

### SES Configuration Required

Before testing email, ensure:

1. **SES Verified Identities**:

   - Sender email (`SES_SENDER_EMAIL`) must be verified in SES
   - Recipient email must be verified in SES (for testing)

2. **Environment Variables**:

   ```json
   {
     "SES_REGION": "us-east-1",
     "SES_SENDER_EMAIL": "noreply@example.com",
     "ADMIN_EMAIL": "admin@example.com"
   }
   ```

3. **SES Permissions**:
   - Lambda execution role must have `ses:SendEmail` permission

## Troubleshooting

### Common Issues

**1. Email Not Received**

- Check SES console for verification status
- Verify sender and recipient emails are verified
- Check spam/junk folders

**2. SES Error: Email address not verified**

```json
{
  "error": "Failed to send test email",
  "message": "SES email delivery failed: Email address is not verified"
}
```

**Solution**: Verify the email addresses in SES console

**3. Permission Denied**

```json
{
  "error": "Failed to send test email",
  "message": "SES email delivery failed: Access denied"
}
```

**Solution**: Add SES permissions to Lambda execution role

## SES Setup Quick Guide

### 1. Verify Email Addresses

```bash
# AWS CLI - verify sender email
aws ses verify-email-identity --email-address noreply@example.com

# AWS CLI - verify recipient email (for testing)
aws ses verify-email-identity --email-address admin@example.com
```

### 2. Check Verification Status

```bash
aws ses list-identities
aws ses get-identity-verification-attributes --identities admin@example.com
```

### 3. Move Out of Sandbox (Production)

- Request production access in SES console
- Verify domain instead of individual emails (recommended)

## Integration with Trading System

This test endpoint uses the same SES configuration as:

- **Daily Email Reports** (`email-report.js`)
- **Error Alerts** (future implementation)
- **Trading Notifications** (future implementation)

Once the test email works, all email functionality should work correctly.

## Next Steps

After successful testing:

1. ✅ Configure production SES access
2. ✅ Set up domain verification
3. ✅ Implement error alert emails
4. ✅ Enable trading notification emails
5. ✅ Schedule automated email reports

Happy testing! 📧🚀
