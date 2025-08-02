import { PrismaClient, CampaignStatus } from '@prisma/client';
import { deleteFromCloudinary } from '~/lib/cloudinary';

const prisma = new PrismaClient();

async function checkAndSendScheduledMessages() {
    try {
        // Get all messages that are scheduled and not sent yet
        const now = new Date();
        const two_minutesAgo = new Date(now.getTime() - 2 * 60 * 1000);
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

        // Get all statuses that are scheduled and not sent yet
        const pendingStatuses = await prisma.status.findMany({
            where: {
                isSent: false,
                isDeleted: false,
                isPicked: false,
            },
            include: {
                StatusCampaign: true,
            }
        });

        // Filter messages that are scheduled to be sent now or earlier
        const messagesToSend = pendingMessages.filter(message => {
            return message.scheduledAt <= now && message.scheduledAt >= two_minutesAgo;
        });

        // Filter statuses that are scheduled to be sent now or earlier
        const statusesToSend = pendingStatuses.filter(status => {
            return status.scheduledAt <= now && status.scheduledAt >= two_minutesAgo;
        });

        await prisma.message.updateMany({
            where: {
                id: {
                    in: messagesToSend.map(message => message.id)
                },
            },
            data: {
                isPicked: true,
            }
        });

        await prisma.status.updateMany({
            where: {
                id: {
                    in: statusesToSend.map(status => status.id)
                },
            },
            data: {
                isPicked: true,
            }
        });

        if (messagesToSend.length === 0) {
            console.log(`[${now.toISOString()}] No pending messages to send`);
        }

        console.log(`[${now.toISOString()}] Found ${messagesToSend.length} messages to send`);

        if (statusesToSend.length === 0) {
            console.log(`[${now.toISOString()}] No pending statuses to send`);
        } else {
            console.log(`[${now.toISOString()}] Found ${statusesToSend.length} statuses to send`);
        }

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
                
                let response: Response;
                
                // Type assertion to access the new fields until TypeScript types are updated
                const messageMedia = message as typeof message & { 
                  hasImage: boolean; 
                  imageUrl: string | null;
                  hasVideo: boolean;
                  videoUrl: string | null;
                  imagePublicId: string | null;
                  videoPublicId: string | null;
                };
                
                if (messageMedia.hasVideo && messageMedia.videoUrl) {
                    // Send video message
                    console.log(`Sending video message with URL: ${messageMedia.videoUrl}`);
                    response = await fetch(`${process.env.WAHA_API_URL}/api/sendVideo`, {
                        method: 'POST',
                        headers: {
                            'accept': 'application/json',
                            'X-Api-Key': process.env.WAHA_API_KEY ?? '',
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            chatId: message.MessageCampaign?.group.groupId,
                            file: {
                                url: messageMedia.videoUrl,
                                mimetype: "video/mp4",
                                filename: "video.mp4"
                            },
                            caption: message.content,
                            session: session?.sessionName,
                        })
                    });
                    await deleteFromCloudinary(messageMedia.videoPublicId ?? "");
                } else if (messageMedia.hasImage && messageMedia.imageUrl) {
                    // Send image message
                    console.log(`Sending image message with URL: ${messageMedia.imageUrl}`);
                    response = await fetch(`${process.env.WAHA_API_URL}/api/sendImage`, {
                        method: 'POST',
                        headers: {
                            'accept': 'application/json',
                            'X-Api-Key': process.env.WAHA_API_KEY ?? '',
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            chatId: message.MessageCampaign?.group.groupId,
                            file: {
                                url: messageMedia.imageUrl,
                                mimetype: "image/jpeg",
                                filename: "image.jpg"
                            },
                            caption: message.content,
                            session: session?.sessionName,
                        })
                    });
                    await deleteFromCloudinary(messageMedia.imagePublicId ?? "");
                } else {
                    // Send text message
                    response = await fetch(`${process.env.WAHA_API_URL}/api/sendText`, {
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
                }

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

        // Send statuses (stories)
        for (const status of statusesToSend) {
            try {
                const session = await prisma.whatsAppSession.findUnique({
                    where: {
                        id: status.sessionId
                    }
                });
                // Send status using WhatsApp API
                console.log(`Sending status: ${status.content}`);
                console.log(`Status ID: ${status.id}, Scheduled At: ${status.scheduledAt.toISOString()}`);

                let response: Response;
                const statusMedia = status as typeof status & { 
                  hasImage: boolean; 
                  imageUrl: string | null;
                  hasVideo: boolean;
                  videoUrl: string | null;
                  imagePublicId: string | null;
                  videoPublicId: string | null;
                };

                if (statusMedia.hasVideo && statusMedia.videoUrl) {
                    // Send video status (story)
                    console.log(`Sending video status with URL: ${statusMedia.videoUrl}`);
                    response = await fetch(`${process.env.WAHA_API_URL}/api/${session?.sessionName}/status/video`, {
                        method: 'POST',
                        headers: {
                            'accept': 'application/json',
                            'X-Api-Key': process.env.WAHA_API_KEY ?? '',
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            file: {
                                url: statusMedia.videoUrl,
                                mimetype: "video/mp4",
                            },
                            caption: status.content,
                        })
                    });
                    await deleteFromCloudinary(statusMedia.videoPublicId ?? "");
                } else if (statusMedia.hasImage && statusMedia.imageUrl) {
                    // Send image status (story)
                    console.log(`Sending image status with URL: ${statusMedia.imageUrl}`);
                    response = await fetch(`${process.env.WAHA_API_URL}/api/${session?.sessionName}/status/image`, {
                        method: 'POST',
                        headers: {
                            'accept': 'application/json',
                            'X-Api-Key': process.env.WAHA_API_KEY ?? '',
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            file: {
                                url: statusMedia.imageUrl,
                                mimetype: "image/jpeg",
                            },
                            caption: status.content,
                        })
                    });
                    await deleteFromCloudinary(statusMedia.imagePublicId ?? "");
                } else {
                    // Send text status (story)
                    response = await fetch(`${process.env.WAHA_API_URL}/api/${session?.sessionName}/status/text`, {
                        method: 'POST',
                        headers: {
                            'accept': 'application/json',
                            'X-Api-Key': process.env.WAHA_API_KEY ?? '',
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            text: status.content,
                            backgroundColor: "#FFFBEA",
                            font: 1
                        })
                    });
                }

                if (response.status !== 201) {
                    throw new Error(`Failed to send WhatsApp status: ${response.statusText}`);
                }

                // Update status as sent
                await prisma.status.update({
                    where: {
                        id: status.id
                    },
                    data: {
                        isSent: true,
                        sentAt: now
                    }
                });

                // Also update the status campaign if this was the last status
                if (status.StatusCampaign) {
                    const remainingStatuses = await prisma.status.count({
                        where: {
                            StatusCampaign: {
                                id: status.StatusCampaign.id
                            },
                            isSent: false,
                        }
                    });

                    if (remainingStatuses === 0) {
                        await prisma.statusCampaign.update({
                            where: {
                                id: status.StatusCampaign.id
                            },
                            data: {
                                status: CampaignStatus.COMPLETED,
                                isCompleted: true
                            }
                        });
                    }
                }

                console.log(`Successfully processed status ${status.id}`);
            } catch (error) {
                console.error(`Error processing status ${status.id}:`, error);

                // If there's an error, mark the status campaign as failed
                if (status.StatusCampaign) {
                    await prisma.statusCampaign.update({
                        where: {
                            id: status.StatusCampaign.id
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