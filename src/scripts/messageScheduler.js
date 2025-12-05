"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var client_1 = require("@prisma/client");
var cloudinary_1 = require("../lib/cloudinary");
var prisma = new client_1.PrismaClient();
function checkAndSendScheduledMessages() {
    return __awaiter(this, void 0, void 0, function () {
        var now_1, two_minutesAgo_1, pendingMessages, pendingStatuses, messagesToSend, statusesToSend, _i, messagesToSend_1, message, session, response, messageMedia, remainingMessages, error_1, _a, statusesToSend_1, status_1, session, response, statusMedia, remainingStatuses, error_2, error_3;
        var _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q;
        return __generator(this, function (_r) {
            switch (_r.label) {
                case 0:
                    _r.trys.push([0, 45, , 46]);
                    now_1 = new Date();
                    two_minutesAgo_1 = new Date(now_1.getTime() - 2 * 60 * 1000);
                    return [4 /*yield*/, prisma.message.findMany({
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
                        })];
                case 1:
                    pendingMessages = _r.sent();
                    return [4 /*yield*/, prisma.status.findMany({
                            where: {
                                isSent: false,
                                isDeleted: false,
                                isPicked: false,
                            },
                            include: {
                                StatusCampaign: true,
                            }
                        })];
                case 2:
                    pendingStatuses = _r.sent();
                    messagesToSend = pendingMessages.filter(function (message) {
                        return message.scheduledAt <= now_1 && message.scheduledAt >= two_minutesAgo_1;
                    });
                    statusesToSend = pendingStatuses.filter(function (status) {
                        return status.scheduledAt <= now_1 && status.scheduledAt >= two_minutesAgo_1;
                    });
                    return [4 /*yield*/, prisma.message.updateMany({
                            where: {
                                id: {
                                    in: messagesToSend.map(function (message) { return message.id; })
                                },
                            },
                            data: {
                                isPicked: true,
                            }
                        })];
                case 3:
                    _r.sent();
                    return [4 /*yield*/, prisma.status.updateMany({
                            where: {
                                id: {
                                    in: statusesToSend.map(function (status) { return status.id; })
                                },
                            },
                            data: {
                                isPicked: true,
                            }
                        })];
                case 4:
                    _r.sent();
                    if (messagesToSend.length === 0) {
                        console.log("[".concat(now_1.toISOString(), "] No pending messages to send"));
                    }
                    console.log("[".concat(now_1.toISOString(), "] Found ").concat(messagesToSend.length, " messages to send"));
                    if (statusesToSend.length === 0) {
                        console.log("[".concat(now_1.toISOString(), "] No pending statuses to send"));
                    }
                    else {
                        console.log("[".concat(now_1.toISOString(), "] Found ").concat(statusesToSend.length, " statuses to send"));
                    }
                    _i = 0, messagesToSend_1 = messagesToSend;
                    _r.label = 5;
                case 5:
                    if (!(_i < messagesToSend_1.length)) return [3 /*break*/, 24];
                    message = messagesToSend_1[_i];
                    _r.label = 6;
                case 6:
                    _r.trys.push([6, 20, , 23]);
                    return [4 /*yield*/, prisma.whatsAppSession.findUnique({
                            where: {
                                id: message.sessionId
                            }
                        })];
                case 7:
                    session = _r.sent();
                    // Send message using WhatsApp API
                    console.log("Sending message to group ".concat((_b = message.MessageCampaign) === null || _b === void 0 ? void 0 : _b.group.groupName, ": ").concat(message.content));
                    console.log("Message ID: ".concat(message.id, ", Scheduled At: ").concat(message.scheduledAt.toISOString()));
                    response = void 0;
                    messageMedia = message;
                    if (!(messageMedia.hasVideo && messageMedia.videoUrl)) return [3 /*break*/, 10];
                    // Send video message
                    console.log("Sending video message with URL: ".concat(messageMedia.videoUrl));
                    return [4 /*yield*/, fetch("".concat(process.env.WAHA_API_URL, "/api/sendVideo"), {
                            method: 'POST',
                            headers: {
                                'accept': 'application/json',
                                'X-Api-Key': (_c = process.env.WAHA_API_KEY) !== null && _c !== void 0 ? _c : '',
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                session: session === null || session === void 0 ? void 0 : session.sessionName,
                                chatId: (_d = message.MessageCampaign) === null || _d === void 0 ? void 0 : _d.group.groupId,
                                caption: message.content,
                                asNote: false,
                                file: {
                                    url: messageMedia.videoUrl,
                                    mimetype: "video/mp4",
                                    filename: "video.mp4"
                                },
                                convert: true,
                            })
                        })];
                case 8:
                    response = _r.sent();
                    return [4 /*yield*/, (0, cloudinary_1.deleteFromCloudinary)((_e = messageMedia.videoPublicId) !== null && _e !== void 0 ? _e : "")];
                case 9:
                    _r.sent();
                    return [3 /*break*/, 15];
                case 10:
                    if (!(messageMedia.hasImage && messageMedia.imageUrl)) return [3 /*break*/, 13];
                    // Send image message
                    console.log("Sending image message with URL: ".concat(messageMedia.imageUrl));
                    return [4 /*yield*/, fetch("".concat(process.env.WAHA_API_URL, "/api/sendImage"), {
                            method: 'POST',
                            headers: {
                                'accept': 'application/json',
                                'X-Api-Key': (_f = process.env.WAHA_API_KEY) !== null && _f !== void 0 ? _f : '',
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                chatId: (_g = message.MessageCampaign) === null || _g === void 0 ? void 0 : _g.group.groupId,
                                file: {
                                    url: messageMedia.imageUrl,
                                    mimetype: "image/jpeg",
                                    filename: "image.jpg"
                                },
                                caption: message.content,
                                session: session === null || session === void 0 ? void 0 : session.sessionName,
                            })
                        })];
                case 11:
                    response = _r.sent();
                    return [4 /*yield*/, (0, cloudinary_1.deleteFromCloudinary)((_h = messageMedia.imagePublicId) !== null && _h !== void 0 ? _h : "")];
                case 12:
                    _r.sent();
                    return [3 /*break*/, 15];
                case 13: return [4 /*yield*/, fetch("".concat(process.env.WAHA_API_URL, "/api/sendText"), {
                        method: 'POST',
                        headers: {
                            'accept': 'application/json',
                            'X-Api-Key': (_j = process.env.WAHA_API_KEY) !== null && _j !== void 0 ? _j : '',
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            chatId: (_k = message.MessageCampaign) === null || _k === void 0 ? void 0 : _k.group.groupId,
                            text: message.content,
                            linkPreview: true,
                            linkPreviewHighQuality: false,
                            session: session === null || session === void 0 ? void 0 : session.sessionName,
                        })
                    })];
                case 14:
                    // Send text message
                    response = _r.sent();
                    _r.label = 15;
                case 15:
                    if (response.status !== 201) {
                        console.log(response);
                        throw new Error("Failed to send WhatsApp message: ".concat(response.statusText));
                    }
                    // Update message as sent
                    return [4 /*yield*/, prisma.message.update({
                            where: {
                                id: message.id
                            },
                            data: {
                                isSent: true,
                                sentAt: now_1
                            }
                        })];
                case 16:
                    // Update message as sent
                    _r.sent();
                    if (!message.MessageCampaign) return [3 /*break*/, 19];
                    return [4 /*yield*/, prisma.message.count({
                            where: {
                                MessageCampaign: {
                                    id: message.MessageCampaign.id
                                },
                                isSent: false,
                            }
                        })];
                case 17:
                    remainingMessages = _r.sent();
                    if (!(remainingMessages === 0)) return [3 /*break*/, 19];
                    return [4 /*yield*/, prisma.messageCampaign.update({
                            where: {
                                id: message.MessageCampaign.id
                            },
                            data: {
                                status: client_1.CampaignStatus.COMPLETED,
                                isCompleted: true
                            }
                        })];
                case 18:
                    _r.sent();
                    _r.label = 19;
                case 19:
                    console.log("Successfully processed message ".concat(message.id));
                    return [3 /*break*/, 23];
                case 20:
                    error_1 = _r.sent();
                    console.error("Error processing message ".concat(message.id, ":"), error_1);
                    if (!message.MessageCampaign) return [3 /*break*/, 22];
                    return [4 /*yield*/, prisma.messageCampaign.update({
                            where: {
                                id: message.MessageCampaign.id
                            },
                            data: {
                                status: client_1.CampaignStatus.FAILED
                            }
                        })];
                case 21:
                    _r.sent();
                    _r.label = 22;
                case 22: return [3 /*break*/, 23];
                case 23:
                    _i++;
                    return [3 /*break*/, 5];
                case 24:
                    _a = 0, statusesToSend_1 = statusesToSend;
                    _r.label = 25;
                case 25:
                    if (!(_a < statusesToSend_1.length)) return [3 /*break*/, 44];
                    status_1 = statusesToSend_1[_a];
                    _r.label = 26;
                case 26:
                    _r.trys.push([26, 40, , 43]);
                    return [4 /*yield*/, prisma.whatsAppSession.findUnique({
                            where: {
                                id: status_1.sessionId
                            }
                        })];
                case 27:
                    session = _r.sent();
                    // Send status using WhatsApp API
                    console.log("Sending status: ".concat(status_1.content));
                    console.log("Status ID: ".concat(status_1.id, ", Scheduled At: ").concat(status_1.scheduledAt.toISOString()));
                    response = void 0;
                    statusMedia = status_1;
                    if (!(statusMedia.hasVideo && statusMedia.videoUrl)) return [3 /*break*/, 30];
                    // Send video status (story)
                    console.log("Sending video status with URL: ".concat(statusMedia.videoUrl));
                    return [4 /*yield*/, fetch("".concat(process.env.WAHA_API_URL, "/api/").concat(session === null || session === void 0 ? void 0 : session.sessionName, "/status/video"), {
                            method: 'POST',
                            headers: {
                                'accept': 'application/json',
                                'X-Api-Key': (_l = process.env.WAHA_API_KEY) !== null && _l !== void 0 ? _l : '',
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                file: {
                                    url: statusMedia.videoUrl,
                                    mimetype: "video/mp4"
                                },
                                backgroundColor: "#38b42f",
                                convert: true,
                                caption: status_1.content,
                            })
                        })];
                case 28:
                    response = _r.sent();
                    return [4 /*yield*/, (0, cloudinary_1.deleteFromCloudinary)((_m = statusMedia.videoPublicId) !== null && _m !== void 0 ? _m : "")];
                case 29:
                    _r.sent();
                    return [3 /*break*/, 35];
                case 30:
                    if (!(statusMedia.hasImage && statusMedia.imageUrl)) return [3 /*break*/, 33];
                    // Send image status (story)
                    console.log("Sending image status with URL: ".concat(statusMedia.imageUrl));
                    return [4 /*yield*/, fetch("".concat(process.env.WAHA_API_URL, "/api/").concat(session === null || session === void 0 ? void 0 : session.sessionName, "/status/image"), {
                            method: 'POST',
                            headers: {
                                'accept': 'application/json',
                                'X-Api-Key': (_o = process.env.WAHA_API_KEY) !== null && _o !== void 0 ? _o : '',
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                file: {
                                    url: statusMedia.imageUrl,
                                    mimetype: "image/jpeg",
                                },
                                caption: status_1.content,
                            })
                        })];
                case 31:
                    response = _r.sent();
                    return [4 /*yield*/, (0, cloudinary_1.deleteFromCloudinary)((_p = statusMedia.imagePublicId) !== null && _p !== void 0 ? _p : "")];
                case 32:
                    _r.sent();
                    return [3 /*break*/, 35];
                case 33: return [4 /*yield*/, fetch("".concat(process.env.WAHA_API_URL, "/api/").concat(session === null || session === void 0 ? void 0 : session.sessionName, "/status/text"), {
                        method: 'POST',
                        headers: {
                            'accept': 'application/json',
                            'X-Api-Key': (_q = process.env.WAHA_API_KEY) !== null && _q !== void 0 ? _q : '',
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            text: status_1.content,
                            backgroundColor: "#FFFBEA",
                            font: 1
                        })
                    })];
                case 34:
                    // Send text status (story)
                    response = _r.sent();
                    _r.label = 35;
                case 35:
                    if (response.status !== 201) {
                        throw new Error("Failed to send WhatsApp status: ".concat(response.statusText));
                    }
                    // Update status as sent
                    return [4 /*yield*/, prisma.status.update({
                            where: {
                                id: status_1.id
                            },
                            data: {
                                isSent: true,
                                sentAt: now_1
                            }
                        })];
                case 36:
                    // Update status as sent
                    _r.sent();
                    if (!status_1.StatusCampaign) return [3 /*break*/, 39];
                    return [4 /*yield*/, prisma.status.count({
                            where: {
                                StatusCampaign: {
                                    id: status_1.StatusCampaign.id
                                },
                                isSent: false,
                            }
                        })];
                case 37:
                    remainingStatuses = _r.sent();
                    if (!(remainingStatuses === 0)) return [3 /*break*/, 39];
                    return [4 /*yield*/, prisma.statusCampaign.update({
                            where: {
                                id: status_1.StatusCampaign.id
                            },
                            data: {
                                status: client_1.CampaignStatus.COMPLETED,
                                isCompleted: true
                            }
                        })];
                case 38:
                    _r.sent();
                    _r.label = 39;
                case 39:
                    console.log("Successfully processed status ".concat(status_1.id));
                    return [3 /*break*/, 43];
                case 40:
                    error_2 = _r.sent();
                    console.error("Error processing status ".concat(status_1.id, ":"), error_2);
                    if (!status_1.StatusCampaign) return [3 /*break*/, 42];
                    return [4 /*yield*/, prisma.statusCampaign.update({
                            where: {
                                id: status_1.StatusCampaign.id
                            },
                            data: {
                                status: client_1.CampaignStatus.FAILED
                            }
                        })];
                case 41:
                    _r.sent();
                    _r.label = 42;
                case 42: return [3 /*break*/, 43];
                case 43:
                    _a++;
                    return [3 /*break*/, 25];
                case 44: return [3 /*break*/, 46];
                case 45:
                    error_3 = _r.sent();
                    console.error('Error in checkAndSendScheduledMessages:', error_3);
                    return [3 /*break*/, 46];
                case 46: return [2 /*return*/];
            }
        });
    });
}
// Initial check
void checkAndSendScheduledMessages();
// Check every 30 seconds
var interval = setInterval(function () {
    void checkAndSendScheduledMessages();
}, 30 * 1000);
// Handle process termination
process.on('SIGINT', function () {
    console.log('Shutting down...');
    clearInterval(interval);
    void prisma.$disconnect().then(function () { return process.exit(0); });
});
process.on('SIGTERM', function () {
    console.log('Shutting down...');
    clearInterval(interval);
    void prisma.$disconnect().then(function () { return process.exit(0); });
});
