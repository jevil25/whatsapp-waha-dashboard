import { NextRequest, NextResponse } from 'next/server';
import { db } from '~/server/db';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      id?: string;
      event: string;
      session: string;
      timestamp?: number;
      payload?: {
        id?: string;
        timestamp?: number;
        from?: string;
        fromMe?: boolean;
        to?: string;
        body?: string;
        hasMedia?: boolean;
        media?: {
          url?: string;
        };
        ack?: number;
        ackName?: string;
        source?: string;
      };
    };

    console.log('Received webhook:', {
      event: body.event,
      session: body.session,
      messageId: body.payload?.id,
    });

    // Only store message events
    if (body.event === 'message' || body.event === 'message.any') {
      const payload = body.payload;
      
      if (!payload?.id) {
        console.warn('No message ID in payload, skipping');
        return NextResponse.json({ success: true, skipped: true });
      }

      // Extract chat ID from message
      const chatId = payload.from || payload.to || '';
      
      // Only store messages from channels (ending with @newsletter)
      // Skip regular chats (@c.us) and groups (@g.us)
      if (!chatId.includes('@newsletter')) {
        console.log('Skipping non-channel message:', chatId);
        return NextResponse.json({ success: true, skipped: 'not_a_channel' });
      }

      // Check if message already exists
      const existing = await db.receivedMessage.findUnique({
        where: { messageId: payload.id },
      });

      if (existing) {
        console.log('Message already exists:', payload.id);
        return NextResponse.json({ success: true, exists: true });
      }

      // Store the message
      await db.receivedMessage.create({
        data: {
          messageId: payload.id,
          sessionName: body.session,
          event: body.event,
          timestamp: payload.timestamp 
            ? new Date(payload.timestamp * 1000) 
            : new Date(),
          from: payload.from ?? '',
          fromMe: payload.fromMe ?? false,
          to: payload.to ?? '',
          body: payload.body ?? null,
          hasMedia: payload.hasMedia ?? false,
          mediaUrl: payload.media?.url ?? null,
          ack: payload.ack ?? null,
          ackName: payload.ackName ?? null,
          source: payload.source ?? null,
          chatId: chatId,
          payload: body as any, // Store full payload as JSON
        },
      });

      console.log('Message stored successfully:', payload.id);
      return NextResponse.json({ success: true, stored: true });
    }

    // For other events, just acknowledge
    return NextResponse.json({ success: true, event: body.event });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}

// Handle GET requests for testing
export async function GET() {
  return NextResponse.json({ 
    status: 'ok', 
    message: 'WhatsApp webhook endpoint is active' 
  });
}
