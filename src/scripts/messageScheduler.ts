import { PrismaClient, CampaignStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function checkAndSendScheduledMessages() {
    try {
        // Get all messages that are scheduled and not sent yet
        const now = new Date();
        const pendingMessages = await prisma.message.findMany({
            where: {
                isSent: false,
                isDeleted: false,
                isPicked: false,
            },
            include: {
                MessageCampaign: {
                    include: {
                        group: true,
                    },
                },
            }
        });

        await prisma.message.updateMany({
            where: {
                id: {
                    in: pendingMessages.map(message => message.id)
                },
            },
            data: {
                isPicked: true,
            }
        });

        // Filter messages that are scheduled to be sent now or earlier
        const messagesToSend = pendingMessages.filter(message => {
            return message.scheduledAt <= now;
        });

        if (messagesToSend.length === 0) {
            console.log(`[${now.toISOString()}] No pending messages to send`);
            return;
        }

        console.log(`[${now.toISOString()}] Found ${messagesToSend.length} messages to send`);

        for (const message of messagesToSend) {
            try {
                const session = await prisma.whatsAppSession.findUnique({
                    where: {
                        id: message.sessionId
                    }
                });
                // Send message using WhatsApp API
                console.log(`Sending message to group ${message.MessageCampaign?.group.groupName}: ${message.content}`);
                console.log(`Message ID: ${message.id}, Scheduled At: ${message.scheduledAt.toISOString()}`);
                const response = await fetch(`${process.env.WAHA_API_URL}/api/sendText`, {
                    method: 'POST',
                    headers: {
                        'accept': 'application/json',
                        'X-Api-Key': process.env.WAHA_API_KEY ?? '',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        chatId: message.MessageCampaign?.group.groupId,
                        text: message.content,
                        linkPreview: true,
                        linkPreviewHighQuality: false,
                        session: session?.sessionName,
                    })
                });

                if (response.status !== 201) {
                    throw new Error(`Failed to send WhatsApp message: ${response.statusText}`);
                }

                // Update message as sent
                await prisma.message.update({
                    where: {
                        id: message.id
                    },
                    data: {
                        isSent: true,
                        sentAt: now
                    }
                });

                // Also update the campaign status if this was the last message
                if (message.MessageCampaign) {
                    const remainingMessages = await prisma.message.count({
                        where: {
                            MessageCampaign: {
                                id: message.MessageCampaign.id
                            },
                            isSent: false,
                        }
                    });

                    if (remainingMessages === 0) {
                        await prisma.messageCampaign.update({
                            where: {
                                id: message.MessageCampaign.id
                            },
                            data: {
                                status: CampaignStatus.COMPLETED,
                                isCompleted: true
                            }
                        });
                    }
                }

                console.log(`Successfully processed message ${message.id}`);
            } catch (error) {
                console.error(`Error processing message ${message.id}:`, error);
                
                // If there's an error, mark the campaign as failed
                if (message.MessageCampaign) {
                    await prisma.messageCampaign.update({
                        where: {
                            id: message.MessageCampaign.id
                        },
                        data: {
                            status: CampaignStatus.FAILED
                        }
                    });
                }
            }
        }
    } catch (error) {
        console.error('Error in checkAndSendScheduledMessages:', error);
    }
}

// Initial check
void checkAndSendScheduledMessages();

// Check every 30 seconds
const interval = setInterval(() => {
    void checkAndSendScheduledMessages();
}, 30 * 1000);

// Handle process termination
process.on('SIGINT', () => {
    console.log('Shutting down...');
    clearInterval(interval);
    void prisma.$disconnect().then(() => process.exit(0));
});

process.on('SIGTERM', () => {
    console.log('Shutting down...');
    clearInterval(interval);
    void prisma.$disconnect().then(() => process.exit(0));
});
