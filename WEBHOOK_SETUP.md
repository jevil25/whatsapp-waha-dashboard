# WhatsApp Webhook Setup

## 1. Generate Prisma Client

After adding the `ReceivedMessage` model, run:

```bash
npx prisma generate
```

This will regenerate the Prisma client with the new `receivedMessage` model.

## 2. Configure WAHA Webhook

You need to configure WAHA to send webhooks to your application. There are two ways:

### Option A: Global Webhook (All Sessions)

Add to your `.env` file:

```env
# WhatsApp Webhook Configuration
WHATSAPP_HOOK_URL=https://your-domain.com/api/webhook/waha
WHATSAPP_HOOK_EVENTS=message,message.any
```

### Option B: Per-Session Webhook

When creating a WhatsApp session, include webhook configuration in the session config:

```json
{
  "name": "default",
  "config": {
    "webhooks": [
      {
        "url": "https://your-domain.com/api/webhook/waha",
        "events": ["message", "message.any"]
      }
    ]
  }
}
```

## 3. Webhook Endpoint

The webhook endpoint is already created at:
- **URL**: `/api/webhook/waha`
- **Method**: POST
- **Events**: `message`, `message.any`

## 4. What Gets Stored

The webhook will store all received messages in the `ReceivedMessage` collection with:

- **messageId**: Unique WhatsApp message ID
- **sessionName**: Session that received/sent the message
- **event**: Event type (message, message.any)
- **timestamp**: When message was received/sent
- **from**: Sender phone number
- **fromMe**: Boolean (true if sent by you)
- **to**: Recipient phone number
- **body**: Message text content
- **hasMedia**: Boolean for media attachments
- **mediaUrl**: URL to download media files
- **ack**: Message acknowledgment status
- **chatId**: Chat/Group ID
- **payload**: Full webhook payload (JSON)

## 5. Sent Messages

The message scheduler (`messageScheduler.ts`) also stores all sent messages in the same collection, so you can:
- View all message history (sent and received)
- Preview messages before they're sent
- Track message delivery status
- Debug message issues

## 6. Testing

Test the webhook endpoint:

```bash
curl https://your-domain.com/api/webhook/waha
```

Should return:
```json
{
  "status": "ok",
  "message": "WhatsApp webhook endpoint is active"
}
```

## 7. View Messages

You can query received messages using Prisma:

```typescript
// Get all messages for a session
const messages = await db.receivedMessage.findMany({
  where: { sessionName: 'default' },
  orderBy: { timestamp: 'desc' },
  take: 50
});

// Get messages for a specific chat
const chatMessages = await db.receivedMessage.findMany({
  where: { 
    sessionName: 'default',
    chatId: '1234567890@c.us'
  },
  orderBy: { timestamp: 'asc' }
});

// Get only received messages (not sent by you)
const received = await db.receivedMessage.findMany({
  where: { 
    sessionName: 'default',
    fromMe: false
  }
});
```

## 8. Next Steps

Consider adding:
- UI to view message history
- Message search functionality
- Export messages to CSV/JSON
- Message analytics dashboard
- Real-time message notifications
