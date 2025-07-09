import { PrismaClient, CampaignStatus } from '@prisma/client';
import { DateTime } from 'luxon';

const prisma = new PrismaClient();

async function checkAndSendScheduledMessages() {
    try {
        const now = new Date();
        const two_mins_ago = new Date(now.getTime() - 2 * 60 * 1000);

        // 1. Process regular messages
        const pendingMessages = await prisma.message.findMany({
            where: {
                isSent: false,
                isDeleted: false,
                isPicked: false,
                scheduledAt: { lte: now, gte: two_mins_ago },
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

        // 2. Process recurring campaigns
        const recurringCampaigns = await prisma.messageCampaign.findMany({
            where: {
                isRecurring: true,
                isDeleted: false,
                status: CampaignStatus.SCHEDULED,
                OR: [
                    { nextSendAt: { lte: now } },
                    { nextSendAt: null },
                ],
            },
            include: {
                group: true,
            },
        });

        for (const campaign of recurringCampaigns) {
            const lastMessage = await prisma.message.findFirst({
                where: {
                    MessageCampaignId: campaign.id,
                },
                orderBy: {
                    scheduledAt: 'desc',
                },
            });

            let nextScheduledDate: DateTime;
            const campaignSendTime = DateTime.fromJSDate(campaign.sendTimeUtc, { zone: campaign.timeZone });

            if (lastMessage) {
                // Calculate next scheduled date based on recurrence
                let baseDate = DateTime.fromJSDate(lastMessage.scheduledAt, { zone: campaign.timeZone });
                baseDate = baseDate.set({ hour: campaignSendTime.hour, minute: campaignSendTime.minute, second: 0, millisecond: 0 });

                switch (campaign.recurrence) {
                    case 'DAILY':
                        nextScheduledDate = baseDate.plus({ days: 1 });
                        break;
                    case 'WEEKLY':
                        nextScheduledDate = baseDate.plus({ weeks: 1 });
                        break;
                    case 'SEMI_MONTHLY':
                        // Logic for semi-monthly: if before 15th, next is 15th; if after 15th, next is 1st of next month
                        if (baseDate.day < 15) {
                            nextScheduledDate = baseDate.set({ day: 15 });
                        } else {
                            nextScheduledDate = baseDate.plus({ months: 1 }).set({ day: 1 });
                        }
                        break;
                    case 'MONTHLY':
                        nextScheduledDate = baseDate.plus({ months: 1 });
                        break;
                    case 'SEMI_ANNUALLY':
                        nextScheduledDate = baseDate.plus({ months: 6 });
                        break;
                    case 'ANNUALLY':
                        nextScheduledDate = baseDate.plus({ years: 1 });
                        break;
                    default:
                        console.warn(`Unknown recurrence type for campaign ${campaign.id}: ${campaign.recurrence}`);
                        continue;
                }
            } else {
                // First message for a recurring campaign
                nextScheduledDate = DateTime.fromJSDate(campaign.startDate, { zone: campaign.timeZone })
                    .set({ hour: campaignSendTime.hour, minute: campaignSendTime.minute, second: 0, millisecond: 0 });
            }

            // Ensure the next scheduled date is not past the campaign's end date
            const campaignEndDate = DateTime.fromJSDate(campaign.endDate, { zone: campaign.timeZone })
                .set({ hour: campaignSendTime.hour, minute: campaignSendTime.minute, second: 0, millisecond: 0 });

            if (nextScheduledDate > campaignEndDate) {
                console.log(`Recurring campaign ${campaign.id} has reached its end date. Marking as completed.`);
                await prisma.messageCampaign.update({
                    where: { id: campaign.id },
                    data: {
                        status: CampaignStatus.COMPLETED,
                        isCompleted: true,
                    },
                });
                continue; // Skip to next campaign
            }

            // Only create a new message if the next scheduled date is in the past or very near future
            if (nextScheduledDate <= DateTime.now().plus({ minutes: 5 })) { // Allow a small window for scheduling
                const daysDiff = Math.ceil(campaignEndDate.diff(nextScheduledDate, 'days').days);
                let messageContent = '';
                
                if (campaign.title) {
                    messageContent += `Campaign Title: ${campaign.title}\n`;
                }
                
                messageContent += `Campaign Start Date: ${DateTime.fromJSDate(campaign.startDate).toFormat('yyyy-LL-dd')}\n`;
                messageContent += `Campaign End Date: ${DateTime.fromJSDate(campaign.endDate).toFormat('yyyy-LL-dd')}\n`;
                
                if (campaign.targetAmount) {
                    messageContent += `Contribution Target Amount: ${campaign.targetAmount}\n`;
                }
                
                messageContent += `Days Remaining: ${daysDiff}\n\n`;
                messageContent += campaign.template.replace(/{days_left}/g, daysDiff.toString());

                await prisma.message.create({
                    data: {
                        sessionId: campaign.sessionId,
                        content: messageContent,
                        scheduledAt: nextScheduledDate.toUTC().toJSDate(),
                        MessageCampaignId: campaign.id,
                    },
                });

                await prisma.messageCampaign.update({
                    where: { id: campaign.id },
                    data: {
                        nextSendAt: nextScheduledDate.toUTC().toJSDate(),
                    },
                });
                console.log(`Created new message for recurring campaign ${campaign.id}, scheduled for ${nextScheduledDate.toISO()}`);
            }
        }

        // Continue with sending messages (both regular and newly created recurring ones)
        const messagesToSend = await prisma.message.findMany({
            where: {
                isSent: false,
                isDeleted: false,
                isPicked: true,
                scheduledAt: { lte: now, gte: two_mins_ago },
            },
            include: {
                MessageCampaign: {
                    include: {
                        group: true,
                    },
                },
            }
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

                // If this was a recurring campaign, update nextSendAt
                if (message.MessageCampaign?.isRecurring) {
                    const campaign = message.MessageCampaign;
                    const campaignSendTime = DateTime.fromJSDate(campaign.sendTimeUtc, { zone: campaign.timeZone });
                    let baseDate = DateTime.fromJSDate(message.scheduledAt, { zone: campaign.timeZone });
                    baseDate = baseDate.set({ hour: campaignSendTime.hour, minute: campaignSendTime.minute, second: 0, millisecond: 0 });

                    let nextScheduledDate: DateTime;
                    switch (campaign.recurrence) {
                        case 'DAILY':
                            nextScheduledDate = baseDate.plus({ days: 1 });
                            break;
                        case 'WEEKLY':
                            nextScheduledDate = baseDate.plus({ weeks: 1 });
                            break;
                        case 'SEMI_MONTHLY':
                            if (baseDate.day < 15) {
                                nextScheduledDate = baseDate.set({ day: 15 });
                            } else {
                                nextScheduledDate = baseDate.plus({ months: 1 }).set({ day: 1 });
                            }
                            break;
                        case 'MONTHLY':
                            nextScheduledDate = baseDate.plus({ months: 1 });
                            break;
                        case 'SEMI_ANNUALLY':
                            nextScheduledDate = baseDate.plus({ months: 6 });
                            break;
                        case 'ANNUALLY':
                            nextScheduledDate = baseDate.plus({ years: 1 });
                            break;
                        default:
                            console.warn(`Unknown recurrence type for campaign ${campaign.id}: ${campaign.recurrence}`);
                            continue;
                    }

                    // Ensure the next scheduled date is not past the campaign's end date
                    const campaignEndDate = DateTime.fromJSDate(campaign.endDate, { zone: campaign.timeZone })
                        .set({ hour: campaignSendTime.hour, minute: campaignSendTime.minute, second: 0, millisecond: 0 });

                    if (nextScheduledDate > campaignEndDate) {
                        console.log(`Recurring campaign ${campaign.id} has reached its end date. Marking as completed.`);
                        await prisma.messageCampaign.update({
                            where: { id: campaign.id },
                            data: {
                                status: CampaignStatus.COMPLETED,
                                isCompleted: true,
                                nextSendAt: null, // No more sends
                            },
                        });
                    } else {
                        await prisma.messageCampaign.update({
                            where: { id: campaign.id },
                            data: {
                                nextSendAt: nextScheduledDate.toUTC().toJSDate(),
                            },
                        });
                        console.log(`Updated nextSendAt for recurring campaign ${campaign.id} to ${nextScheduledDate.toISO()}`);
                    }
                }

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

                    if (remainingMessages === 0 && !message.MessageCampaign.isRecurring) {
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
